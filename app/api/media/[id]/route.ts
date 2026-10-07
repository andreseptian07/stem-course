import { db, identity, json, AppError } from "@/lib/server";
import { ClassError } from "@/lib/classes";
import { readMedia } from "@/lib/media-data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, context: {
  params: Promise<{
    id: string;
  }>;
}) {
  try {
    const u = await identity(), { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new ClassError(404, "Berkas tidak ditemukan.");
    const f = await readMedia(db(), u, id), inline = f.mime.startsWith("image/") && new URL(req.url).searchParams.get("download") !== "1";
    const name = encodeURIComponent(f.name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    return new Response(f.bytes, { headers: { "Content-Type": f.mime, "Content-Length": String(f.size), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="berkas"; filename*=UTF-8''${name}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" } });
  }
  catch (e) {
    return json({ error: e instanceof ClassError || e instanceof AppError ? e.message : "Berkas belum dapat dibuka." }, e instanceof ClassError || e instanceof AppError ? e.status : 503);
  }
}
