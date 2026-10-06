import { z } from "zod";
import { db, json, AppError } from "@/lib/server";
import { getSignedUser } from "@/lib/auth";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { activationSchema, inspectTutorInvitation, activateTutorInvitation } from "@/lib/tutors";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Gunakan JSON.");
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("inspect"), token: activationSchema.shape.token }).strict(),
      z.object({ action: z.literal("activate"), activation: activationSchema }).strict(),
    ]).parse(JSON.parse(await readRequestText(req, 3000)));
    if (body.action === "inspect") return json(await inspectTutorInvitation(db(), body.token));
    return json(await activateTutorInvitation(db(), body.activation, await getSignedUser()));
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "JSON tidak valid." }, 400);
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ error: "Periksa tautan undangan, email, dan password." }, 400);
    console.error("Tutor activation failed", e instanceof Error ? e.name : "unknown");
    return json({ error: "Aktivasi belum dapat diproses. Coba lagi atau hubungi Super Admin." }, 503);
  }
}
