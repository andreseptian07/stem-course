import { requireVerifiedEmail } from "@/lib/email-policy";
import { z } from "zod";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { db, identity, json, AppError } from "@/lib/server";
import { notificationFeed, markNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || "Isian tidak valid." }, 400);
  return json({ error: "Notifikasi belum dapat dimuat. Coba lagi." }, 503);
}
export async function GET() {
  try { const u = await identity(true); return json(await notificationFeed(db(), u)); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Gunakan JSON.");
    const raw = await readRequestText(req, 10000);
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { throw new AppError(400, "JSON tidak valid."); }
    const u = await identity(true);
    return json(await markNotificationsRead(db(), u, body));
  } catch (error) { return failure(error); }
}
