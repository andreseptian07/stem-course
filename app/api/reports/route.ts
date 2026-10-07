import { z } from 'zod';
import { db, identity, owner, json, AppError } from '@/lib/server';
import { managementReport } from '@/lib/reports';
import { reportCsv } from '@/lib/report-csv';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const querySchema = z.object({
  course: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  days: z.enum(['7', '30', '90']).default('30'),
  samples: z.enum(['0', '1']).default('0'),
  export: z.enum(['courses', 'participants', 'tutors']).optional(),
}).strict();
export async function GET(req: Request) {
  try {
    const u = await identity();
    owner(u);
    const params = new URL(req.url).searchParams;
    for (const key of params.keys())
      if (params.getAll(key).length > 1)
        throw new AppError(400, 'Filter laporan tidak boleh berulang.');
    const q = querySchema.parse(Object.fromEntries(params)), days = Number(q.days) as 7 | 30 | 90;
    const report = await managementReport(db(), u, { courseId: q.course, days, includeSamples: q.samples === '1' });
    if (!q.export)
      return json(report);
    const csv = reportCsv(report, q.export);
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ruang-stem-${q.export}-${report.generatedAt.slice(0, 10)}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  catch (e) {
    if (e instanceof AppError)
      return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: 'Filter laporan tidak valid.' }, 400);
    return json({ error: 'Laporan belum dapat dimuat. Coba kembali.' }, 503);
  }
}
