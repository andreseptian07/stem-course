import { identity, db, json, AppError } from "@/lib/server";
import { ClassError } from "@/lib/classes";
import { downloadProjectFile } from "@/lib/project-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, context: {
  params: Promise<{
    id: string;
  }>;
}) {
  try {
    const u = await identity(), { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new ClassError(404, "Lampiran tidak ditemukan.");
    const f = await downloadProjectFile(db(), u, id);
    const filename = encodeURIComponent(f.name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    return new Response(new Uint8Array(f.bytes), { headers: {
        "Content-Type": f.mime,
        "Content-Length": String(f.size),
        "Content-Disposition": `attachment; filename="lampiran"; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      } });
  }
  catch (e) {
    return json({ error: e instanceof ClassError || e instanceof AppError ? e.message : "Berkas belum dapat diunduh." }, e instanceof ClassError || e instanceof AppError ? e.status : 503);
  }
}
