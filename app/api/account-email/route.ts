import { authRateLimit } from "@/lib/auth-data";
import { after } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { db, json, AppError } from "@/lib/server";
import { getSignedUser } from "@/lib/auth";
import { checkAuthOrigin, sessionCookie } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { prepareAccountEmail, checkResetToken, confirmEmail, resetPasswordWithToken, emailRequest, emailToken } from "@/lib/account-email";
import { emailStatus } from "@/lib/email-policy";
import { configuredAccountMailer } from "@/lib/email-settings";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: "Periksa alamat email, tautan, dan password Anda." }, 400);
  return json({ error: "Layanan email akun belum tersedia. Coba lagi atau hubungi pengelola." }, 503);
}
export async function GET() {
  try {
    const user = await getSignedUser();
    if (!user) throw new AppError(401, "Silakan masuk kembali.");
    return json(await emailStatus(db(), user.userId));
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Gunakan JSON.");
    let raw: unknown;
    try { raw = JSON.parse(await readRequestText(req, 3000)); }
    catch (error) { if (error instanceof SyntaxError) throw new AppError(400, "JSON tidak valid."); throw error; }
    const b = z.discriminatedUnion("action", [
      emailRequest.extend({ action: z.literal("requestReset") }).strict(),
      emailRequest.extend({ action: z.literal("requestVerify") }).strict(),
      z.object({ action: z.literal("verify"), token: emailToken }).strict(),
      z.object({ action: z.literal("checkReset"), token: emailToken }).strict(),
      z.object({ action: z.literal("reset"), token: emailToken, password: z.string().min(15).max(128) }).strict(),
    ]).parse(raw);
    if (b.action === "requestReset" || b.action === "requestVerify") {
      const result = await prepareAccountEmail(db(), { email: b.email }, b.action === "requestReset" ? "reset" : "verify", (await configuredAccountMailer(db()))!);
      after(result.delivery);
      return json({ message: result.message });
    }
    await authRateLimit(db(), "emailConfirm", b.token);
    if (b.action === "checkReset") return json(await checkResetToken(db(), b.token));
    if (b.action === "verify") return json(await confirmEmail(db(), b.token));
    const deliver = (await configuredAccountMailer(db()))!;
    const result = await resetPasswordWithToken(db(), { token: b.token, password: b.password });
    const cookie = sessionCookie();
    (await cookies()).set(cookie.name, "", { ...cookie, maxAge: 0 });
    after(async () => { try { await deliver({ to: result.email, purpose: "changed" }); } catch { console.warn("Password change email delivery failed."); } });
    return json({ message: result.message });
  } catch (error) { return failure(error); }
}
