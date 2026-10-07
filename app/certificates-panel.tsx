"use client";
import { useEffect, useState } from "react";
import { certificateDate, type Certificate, type CertificateStatus } from "@/lib/certificate-model";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await r.json() as T & {
    error?: string;
  };
  if (!r.ok)
    throw new Error(data.error || "Permintaan sertifikat gagal.");
  return data;
}
function Links({ certificate: c }: {
  certificate: Certificate;
}) {
  return <div className="certificate-actions">{!c.revokedAt && <a href={`/api/certificates/${c.number}`} className="primary">Unduh PDF</a>}<a href={`/certificates/verify/${c.number}`}>Verifikasi sertifikat</a></div>;
}
export function CourseCertificate({ courseId }: {
  courseId: string;
}) {
  const [data, setData] = useState<CertificateStatus | null>(null), [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  useEffect(() => { let stopped = false; request<CertificateStatus>(`/api/certificates?course=${encodeURIComponent(courseId)}`).then(d => { if (!stopped) {
    setData(d);
    setSelected(d.classes[0]?.id || '');
  } }).catch(e => { if (!stopped)
    setError(e.message); }); return () => { stopped = true; }; }, [courseId]);
  async function refresh() { setBusy(true); setError(''); try {
    setData(await request<CertificateStatus>(`/api/certificates?course=${encodeURIComponent(courseId)}`));
  }
  catch (e) {
    setError(e instanceof Error ? e.message : 'Gagal memuat syarat.');
  }
  finally {
    setBusy(false);
  } }
  const classroom = data?.classes.find(c => c.id === selected);
  async function issue() { if (!classroom)
    return; setBusy(true); setError(''); try {
    await request('/api/certificates', { action: 'issue', courseId, classId: classroom.id, consent });
    setData(await request<CertificateStatus>(`/api/certificates?course=${encodeURIComponent(courseId)}`));
    setConsent(false);
  }
  catch (e) {
    setError(e instanceof Error ? e.message : 'Gagal menerbitkan sertifikat.');
  }
  finally {
    setBusy(false);
  } }
  return <details className="certificate-course"><summary>Sertifikat & syarat kelulusan</summary>
  <a href="/certificates">Sertifikat saya</a>
  {error && <p role="alert" className="notice error">{error}</p>}
  {!data && !error && <p role="status">Memeriksa syarat…</p>}
  {data && <>
    {!data.enabled && <p>Sertifikat belum diaktifkan pengelola untuk course ini.</p>}
    <p className="small">Semua materi versi terbaru dan tes wajib harus selesai. Semua tugas terbit/ditutup dalam satu kelas harus diterima Tutor. Pilih kelas yang telah Anda ikuti.</p>
    <ul className="certificate-checklist">{data.lessons.map(l => <li key={l.id}>{l.complete && l.quizPassed && l.codePassed ? '✓' : '○'} {l.title}{!l.quizPassed ? ' · kuis wajib belum lulus' : ''}{!l.codePassed ? ' · kode wajib belum lulus' : ''}</li>)}</ul>
    {!data.classes.length ? <p>Belum ada keanggotaan kelas yang disetujui. <a href="/classes">Buka kelas</a>.</p> : <>
    <label className="field">Kelas untuk sertifikat<select value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setConsent(false); }}>{data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {classroom && <>
      <ul className="certificate-checklist">{classroom.tasks.map(t => <li key={t.id}>{t.accepted ? '✓' : '○'} {t.title}{t.accepted ? ' · diterima' : ' · belum diterima untuk instruksi terbaru'}</li>)}</ul>
      {!classroom.tasks.length && <p>Kelas perlu minimal satu tugas yang diterima Tutor sebelum sertifikat dapat diterbitkan.</p>}
      {classroom.certificate ? <><p>{classroom.certificate.revokedAt ? 'Sertifikat telah dicabut. Hubungi pengelola.' : `Sertifikat diterbitkan ${certificateDate(classroom.certificate.issuedAt)}.`}</p><Links certificate={classroom.certificate}/></> : <>
      {classroom.eligible && <label className="checkbox-label certificate-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)}/><span>Saya memastikan nama <strong>{data.recipientName}</strong> benar dan setuju nama, course serta tanggal penerbitan terlihat oleh orang yang memiliki tautan verifikasi.</span></label>}
      <button className="primary" disabled={busy || !classroom.eligible || !consent} onClick={issue}>{busy ? 'Memproses…' : 'Terbitkan sertifikat'}</button>
      </>}
    </>}
    </>}
  </>}
  <button disabled={busy} onClick={refresh}>Muat ulang syarat</button>
  </details>;
}
export function CertificateList({ admin = false }: {
  admin?: boolean;
}) {
  const [rows, setRows] = useState<Certificate[] | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState<Certificate | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const url = '/api/certificates' + (admin ? '?admin=1' : '');
  useEffect(() => { let stopped = false; request<{
    certificates: Certificate[];
  }>(url).then(d => { if (!stopped)
    setRows(d.certificates); }).catch(e => { if (!stopped)
    setError(e.message); }); return () => { stopped = true; }; }, [url]);
  async function refresh() { setBusy(true); setError(''); try {
    setRows((await request<{
      certificates: Certificate[];
    }>(url)).certificates);
  }
  catch (e) {
    setError(e instanceof Error ? e.message : 'Gagal memuat sertifikat.');
  }
  finally {
    setBusy(false);
  } }
  async function revoke(e: React.FormEvent) { e.preventDefault(); if (!selected)
    return; setBusy(true); setError(''); try {
    await request('/api/certificates', { action: 'revoke', number: selected.number, reason });
    setSelected(null);
    setReason('');
    setRows((await request<{
      certificates: Certificate[];
    }>(url)).certificates);
  }
  catch (e) {
    setError(e instanceof Error ? e.message : 'Gagal mencabut sertifikat.');
  }
  finally {
    setBusy(false);
  } }
  return <section className="certificate-list"><div className="section-heading"><h2>{admin ? 'Sertifikat peserta' : 'Sertifikat saya'}</h2><button disabled={busy} onClick={refresh}>Muat ulang</button></div>
  {error && <p className="notice error" role="alert">{error}</p>}
  {!rows && !error && <p role="status">Memuat sertifikat…</p>}
  {rows?.length === 0 && <p>Belum ada sertifikat yang diterbitkan. Buka course untuk memeriksa syarat kelulusan.</p>}
  <p className="small">Menampilkan maksimal 200 sertifikat terbaru. Dokumen merekam penyelesaian pada versi course saat diterbitkan.</p>
  {selected && <form className="certificate-card" onSubmit={revoke}><h3>Cabut sertifikat {selected.recipientName}</h3><p className="certificate-number">{selected.number}</p><p>Pencabutan membuat verifikasi menyatakan dokumen tidak berlaku dan menghentikan unduhan PDF. Sertifikat kelas ini tidak dapat diterbitkan ulang otomatis.</p><label className="field">Alasan pencabutan (privat)<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)}/></label><div className="certificate-actions"><button type="submit" disabled={busy || !reason.trim()}>Konfirmasi pencabutan</button><button type="button" disabled={busy} onClick={() => { setSelected(null); setReason(''); }}>Batal</button></div></form>}
  {rows?.map(c => <article className="certificate-card" key={c.number}><h3>{c.courseTitle}</h3><p>{c.recipientName} · {c.className}</p><p>Versi {c.courseVersion} · {certificateDate(c.issuedAt)} · {c.revokedAt ? 'Dicabut' : 'Valid'}</p><p className="certificate-number">{c.number}</p>{admin ? <div className="certificate-actions"><a href={`/certificates/verify/${c.number}`}>Verifikasi</a>{!c.revokedAt && <button disabled={busy} onClick={() => { setSelected(c); setReason(''); }}>Cabut sertifikat</button>}</div> : <Links certificate={c}/>}</article>)}
  </section>;
}
export default function Certificates() { return <main className="certificate-page"><nav className="certificate-actions"><a href="/dashboard">Dashboard</a><a href="/learn">Belajar</a><a href="/profile">Profil</a></nav><CertificateList /></main>; }
