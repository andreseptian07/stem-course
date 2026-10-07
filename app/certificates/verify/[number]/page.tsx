import { db } from "@/lib/server";
import Link from "next/link";
import { verifyCertificate } from "@/lib/certificates";
import { certificateDate } from "@/lib/certificate-model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Verifikasi sertifikat — Ruang STEM", robots: { index: false, follow: false } };
export default async function Page({ params }: {
  params: Promise<{
    number: string;
  }>;
}) {
  const { number } = await params;
  let cert: Awaited<ReturnType<typeof verifyCertificate>> = null, failed = false;
  try {
    cert = await verifyCertificate(db(), number);
  }
  catch {
    failed = true;
  }
  return <main className="certificate-page"><Link href="/">Ruang STEM</Link><section className="certificate-card">
  <p className="eyebrow teal">VERIFIKASI SERTIFIKAT</p>
  <h1>{failed ? 'Verifikasi belum tersedia' : !cert ? 'Sertifikat tidak ditemukan' : cert.status === 'revoked' ? 'Sertifikat telah dicabut' : 'Sertifikat valid'}</h1>
  {failed ? <p role="alert">Layanan belum dapat memeriksa sertifikat. Coba kembali; hasil ini tidak menentukan keabsahan dokumen.</p> : !cert ? <p>Periksa nomor dan tautan pada dokumen sertifikat.</p> : <>
    <p className="certificate-number">{cert.number}</p>
    {cert.status === 'valid' ? <><h2>{cert.recipientName}</h2><p>Telah menyelesaikan <strong>{cert.courseTitle}</strong> versi {cert.courseVersion}, termasuk tugas yang diterima Tutor.</p><p>Diterbitkan {certificateDate(cert.issuedAt)} oleh Ruang STEM.</p><p className="small">Sertifikat merekam penyelesaian pada versi yang diterbitkan. Materi course dapat berubah setelah tanggal tersebut.</p></> : <p>Dokumen tidak berlaku sejak {certificateDate(cert.revokedAt)}. Hubungi pemilik sertifikat atau pengelola untuk klarifikasi.</p>}
  </>}
  </section></main>;
}
