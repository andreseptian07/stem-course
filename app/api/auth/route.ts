import { readRequestText } from "@/lib/request-body";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, json, AppError } from "@/lib/server";
import { getSignedUser } from "@/lib/auth";
import { registerAccount, loginAccount, logoutSession, changePassword } from "@/lib/auth-data";
import { checkAuthOrigin, sessionCookie, safeReturnPath, courseFromReturnPath, AuthError } from "@/lib/auth-policy";
import { registrationEnabled } from "@/lib/registration";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AuthError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 6000) throw new AuthError(413, "Isian terlalu besar.");
    const text = await readRequestText(req, 6000);
    if (text.length > 6000) throw new AuthError(413, "Isian terlalu besar.");
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new AuthError(400, "JSON tidak valid."); }
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("login"), email: z.string(), password: z.string(), returnTo: z.string().max(1000).optional() }).strict(),
      z.object({ action: z.literal("register"), email: z.string(), password: z.string(), displayName: z.string(), courseId: z.string().max(80).optional() }).strict(),
      z.object({ action: z.literal("logout") }).strict(),
      z.object({ action: z.literal("password"), currentPassword: z.string().min(1).max(128), password: z.string().min(15).max(128) }).strict(),
    ]).parse(raw);
    const cookie = sessionCookie(), jar = await cookies();
    if (body.action === "register") {
      return json(await registerAccount(db(), { email: body.email, password: body.password, displayName: body.displayName, ...(body.courseId ? { courseId: body.courseId } : {}) }, await registrationEnabled(db())), 201);
    }
    if (body.action === "login") {
      const result = await loginAccount(db(), { email: body.email, password: body.password }, jar.get(cookie.name)?.value, courseFromReturnPath(body.returnTo));
      jar.set(cookie.name, result.token, cookie);
      return json({ redirect: result.accessStatus === "active" ? safeReturnPath(body.returnTo) : "/access" });
    }
    if (body.action === "password") {
      const user = await getSignedUser();
      if (!user) throw new AuthError(401, "Silakan masuk kembali.");
      await changePassword(db(), user.userId, body.currentPassword, body.password);
    } else {
      await logoutSession(db(), jar.get(cookie.name)?.value);
    }
    jar.set(cookie.name, "", { ...cookie, maxAge: 0 });
    return json({ redirect: "/login" });
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: "Periksa isian email, nama, dan password Anda." }, 400);
    console.error("Auth request failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Layanan akun belum tersedia. Coba lagi atau hubungi pengelola." }, 503);
  }
}
