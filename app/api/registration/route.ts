import { z } from "zod";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { db, identity, json, AppError } from "@/lib/server";
import { registrationEnabled, setRegistration } from "@/lib/registration";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof SyntaxError) return json({ error: "JSON tidak valid." }, 400);
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError) return json({ error: "Pengaturan pendaftaran tidak valid." }, 400);
  return json({ error: "Pengaturan pendaftaran belum dapat diproses." }, 503);
}
export async function GET() {
  try { return json({ enabled: await registrationEnabled(db()) }); } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Gunakan JSON.");
    const body = JSON.parse(await readRequestText(req, 1000));
    return json(await setRegistration(db(), await identity(), body));
  } catch (e) { return failure(e); }
}
