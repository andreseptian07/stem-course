import { z } from "zod";
import { db, identity, json, AppError } from "@/lib/server";
import { readPreview, previewList } from "@/lib/preview";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const u = await identity(), params = new URL(req.url).searchParams;
    for (const key of params.keys()) if (params.getAll(key).length !== 1)
      throw new AppError(400, "Parameter tidak boleh berulang.");
    const q = z.object({ course: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional() }).strict().parse(Object.fromEntries(params));
    return json(q.course ? await readPreview(db(), u, q.course) : { courses: await previewList(db(), u) });
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ error: "Permintaan tidak valid." }, 400);
    return json({ error: "Pratinjau belum dapat dimuat." }, 503);
  }
}
