import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, identity, json, AppError } from "@/lib/server";
import { accountData, enrollCourse, saveProfile } from "@/lib/account-data";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian belum valid." }, 400);
  console.error(
    "Account request failed",
    e instanceof Error ? e.message : "unknown",
  );
  return json(
    {
      error:
        "Data akun belum dapat diproses. Coba lagi; perubahan Anda tetap tersedia.",
    },
    503,
  );
}
export async function GET() {
  try {
    const u = await identity();
    const signed = await getChatGPTUser();
    return json({ user: { ...u, email: signed!.email }, ...await accountData(db(), u) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new AppError(403, "Asal permintaan tidak valid.");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 15000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await req.text();
    if (raw.length > 15000) throw new AppError(413, "Isian terlalu besar.");
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const u = await identity();
    if (b.action === "enroll") {
      const id = z.string().min(1).max(80).parse(b.courseId);
      return json(await enrollCourse(db(), u, id));
    }
    if (b.action === "saveProfile") return json(await saveProfile(db(), u.id, b.profile));
    throw new AppError(400, "Aksi tidak dikenal.");
  } catch (e) {
    return failure(e);
  }
}
