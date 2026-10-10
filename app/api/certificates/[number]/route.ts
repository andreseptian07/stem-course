import { db, identity, json, AppError } from "@/lib/server";
import { appOrigin } from "@/lib/auth-policy";
import { ownedCertificatePdf } from "@/lib/certificates";
import { certificateNumberPattern } from "@/lib/certificate-model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, context: {
  params: Promise<{
    number: string;
  }>;
}) {
  try {
    const u = await identity(), { number } = await context.params;
    if (!certificateNumberPattern.test(number))
      throw new AppError(404, "Sertifikat tidak ditemukan.");
    const {certificate:c,bytes}=await ownedCertificatePdf(db(),u,number,appOrigin());
    return new Response(bytes as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${c.number}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  catch (e) {
    return json({ error: e instanceof AppError ? e.message : "PDF belum dapat dibuat. Coba kembali." }, e instanceof AppError ? e.status : 503);
  }
}
