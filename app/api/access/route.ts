import { checkAuthOrigin } from "@/lib/auth-policy";
import { z } from "zod";
import { identity, db, json, AppError } from "@/lib/server";
import { accessOverview, updateAccess, accessMutation } from "@/lib/access";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian tidak valid." }, 400);
  return json({ error: "Status akses belum dapat diproses. Coba lagi." }, 503);
}
export async function GET() {
  try {
    return json(await accessOverview(db(), await identity(true)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 6000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await req.text();
    if (raw.length > 6000) throw new AppError(413, "Isian terlalu besar.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const u = await identity();
    if (u.role !== "owner")
      throw new AppError(403, "Hanya pemilik yang dapat mengubah akses.");
    return json(await updateAccess(db(), u, accessMutation.parse(b)));
  } catch (e) {
    return failure(e);
  }
}
