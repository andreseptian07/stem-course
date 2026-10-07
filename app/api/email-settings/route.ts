import { z } from "zod";
import { db, json, identity, AppError } from "@/lib/server";
import { requireOwner } from "@/lib/access";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { authRateLimit } from "@/lib/auth-data";
import { readRequestText } from "@/lib/request-body";
import { emailSettingsOverview, updateEmailSettings, emailSettingMutation } from "@/lib/email-settings";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "Pengaturan email tidak valid." }, 400);
  return json({ error: "Pengaturan email belum dapat diproses." }, 503);
}
export async function GET() {
  try { return json(await emailSettingsOverview(db(), await identity(true))); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Gunakan JSON.");
    const user = await identity(true); await requireOwner(db(), user);
    const body = emailSettingMutation.parse(JSON.parse(await readRequestText(req, 1000)));
    if (body.action === "test") await authRateLimit(db(), "emailConfirm", `smtp-test:${user.id}`);
    return json(await updateEmailSettings(db(), user, body));
  } catch (error) { return failure(error); }
}
