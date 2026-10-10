import { z } from "zod";
import { db, identity, json, AppError } from "@/lib/server";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { tutorOverview, tutorMutation, createTutorInvitation, revokeTutorInvitation, revokeTutor } from "@/lib/tutors";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function failure(e: unknown) {
  if (e instanceof SyntaxError) return json({ error: "JSON tidak valid." }, 400);
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError) return json({ error: "Periksa email, nama, jenis undangan, penugasan, dan alasan perubahan." }, 400);
  console.error("Tutor request failed", e instanceof Error ? e.name : "unknown");
  return json({ error: "Pengelolaan staf belum dapat diproses. Coba lagi." }, 503);
}
export async function GET() {
  try { return json(await tutorOverview(db(), await identity())); } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Gunakan JSON.");
    const body = tutorMutation.parse(JSON.parse(await readRequestText(req, 6000)));
    const user = await identity();
    if (body.action === "invite") return json(await createTutorInvitation(db(), user, body.invitation), 201);
    if (body.action === "revokeInvite") return json(await revokeTutorInvitation(db(), user, body.id));
    return json(await revokeTutor(db(), user, body.userId, body.reason));
  } catch (e) { return failure(e); }
}
