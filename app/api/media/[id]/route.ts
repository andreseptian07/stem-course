import {mediaRange} from "@/lib/media-range";
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
    const f = await readMedia(db(), u, id,process.env,new URL(req.url).searchParams.get("class")), inline = (f.mime.startsWith("image/") || f.mime === "video/mp4") && new URL(req.url).searchParams.get("download") !== "1";
    const name = encodeURIComponent(f.name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const headers = { "Content-Type": f.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="berkas"; filename*=UTF-8''${name}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin", ...(f.mime === "video/mp4" ? {"Accept-Ranges":"bytes"} : {}) };
    // Authorize and recheck the complete media object before considering any byte range.
    const range = f.mime === "video/mp4" && inline ? mediaRange(req.headers.get("range"),f.size) : null;
    if (range?.invalid) return new Response(null,{status:416,headers:{...headers,"Content-Range":`bytes */${f.size}`}});
    if (range) return new Response(f.bytes.slice(range.start,range.end+1),{status:206,headers:{...headers,"Content-Range":`bytes ${range.start}-${range.end}/${f.size}`,"Content-Length":String(range.end-range.start+1)}});
    return new Response(f.bytes, { headers: {...headers,"Content-Length":String(f.size)} });
  }
  catch (e) {
    return json({ error: e instanceof ClassError || e instanceof AppError ? e.message : "Berkas belum dapat dibuka." }, e instanceof ClassError || e instanceof AppError ? e.status : 503);
  }
}
