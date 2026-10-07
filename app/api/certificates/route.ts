import { z } from "zod";
import { db, identity, json, AppError } from "@/lib/server";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { certificateStatus, issueCertificate, listCertificates, revokeCertificate } from "@/lib/certificates";
import { certificateNumberPattern } from "@/lib/certificate-model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
function failure(e: unknown) {
  if (e instanceof AppError)
    return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian tidak valid." }, 400);
  return json({ error: "Sertifikat belum dapat diproses. Coba kembali." }, 503);
}
export async function GET(req: Request) {
  try {
    const u = await identity(), q = new URL(req.url).searchParams;
    return json(q.get('course') ? await certificateStatus(db(), u, id.parse(q.get('course'))) : { certificates: await listCertificates(db(), u, q.get('admin') === '1') });
  }
  catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    const u = await identity();
    if (!req.headers.get('content-type')?.includes('application/json'))
      throw new AppError(415, "Gunakan JSON.");
    let raw: unknown;
    try {
      raw = JSON.parse(await readRequestText(req, 2000));
    }
    catch (e) {
      if (e instanceof AppError)
        throw e;
      throw new AppError(400, "JSON tidak valid.");
    }
    const b = z.discriminatedUnion('action', [
      z.object({ action: z.literal('issue'), courseId: id, classId: id, consent: z.literal(true) }).strict(),
      z.object({ action: z.literal('revoke'), number: z.string().regex(certificateNumberPattern), reason: z.string().trim().min(1, "Tuliskan alasan pencabutan.").max(1000) }).strict(),
    ]).parse(raw);
    return json(b.action === 'issue' ? { certificate: await issueCertificate(db(), u, b.courseId, b.classId, b.consent) } : await revokeCertificate(db(), u, b.number, b.reason));
  }
  catch (e) {
    return failure(e);
  }
}
