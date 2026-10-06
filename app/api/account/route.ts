import { readRequestText } from "@/lib/request-body";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { z } from "zod";
import { getSignedUser } from "@/lib/auth";
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
    const signed = await getSignedUser();
    return json({ user: { ...u, email: signed!.email }, ...await accountData(db(), u) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 15000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await readRequestText(req, 15000);
    if (raw.length > 15000) throw new AppError(413, "Isian terlalu besar.");
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const u = await identity(true);
    if (b.action === "enroll") {
      if (u.accessStatus === "suspended") throw new AppError(403, "Akun ditangguhkan. Hubungi Super Admin.");
      const id = z.string().min(1).max(80).parse(b.courseId);
      return json(await enrollCourse(db(), u, id));
    }
    if (u.accessStatus !== "active") throw new AppError(403, "Akun menunggu persetujuan Super Admin.");
    if (b.action === "saveProfile") return json(await saveProfile(db(), u.id, b.profile));
    throw new AppError(400, "Aksi tidak dikenal.");
  } catch (e) {
    return failure(e);
  }
}
