"use client";
import { useEffect, useState } from "react";

async function api(path: string, body?: unknown) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error || "Permintaan belum berhasil.");
  return data;
}
const date = (value: string | number) => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
const kinds: Record<string, string> = { invite: "Undangan dibuat", activate: "Tutor diaktifkan", revokeInvite: "Undangan dibatalkan", revokeTutor: "Hak Tutor dicabut" };
export default function TutorManagement({ users, onChanged }: { users: any[]; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<any>(null), [enabled, setEnabled] = useState<boolean | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [issued, setIssued] = useState<any>(null);
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [classId, setClassId] = useState(""), [target, setTarget] = useState(""), [reason, setReason] = useState("");
  async function load() {
    const [tutors, registration] = await Promise.all([api("/api/tutors"), api("/api/registration")]);
    setData(tutors); setEnabled(registration.enabled);
  }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);
  async function perform(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); }
    finally { setBusy(false); }
  }
  const tutors = users.filter((u) => u.role === "tutor" || u.mentorClasses > 0);
  return <section aria-label="Pendaftaran dan undangan Tutor" className="tutor-management">
    <section className="access-card">
      <h2>Pendaftaran siswa</h2>
      <p>Status: <strong>{enabled === null ? "Memuat…" : enabled ? "Dibuka" : "Ditutup"}</strong></p>
      <p>Siswa mendaftar sendiri dari beranda, login, atau detail course. Akun baru menunggu persetujuan Super Admin sebelum bisa belajar.</p>
      <button className="primary" disabled={busy || enabled === null} onClick={() => void perform(async () => {
        const r = await api("/api/registration", { enabled: !enabled }); setEnabled(r.enabled); setNotice(r.enabled ? "Pendaftaran siswa dibuka. Formulir Daftar sudah tersedia di web." : "Pendaftaran siswa ditutup.");
      })}>{enabled ? "Tutup pendaftaran siswa" : "Buka pendaftaran siswa"}</button>
      <p><small>Pengaturan ini berlaku langsung dan mengutamakan pilihan Super Admin atas nilai awal environment hosting.</small></p>
      <a href="/register" target="_blank" rel="noopener noreferrer">Lihat halaman pendaftaran</a>
    </section>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {notice && <p className="feedback success" role="status">{notice}</p>}
    <form className="access-card tutor-invite-form" onSubmit={(e) => {
      e.preventDefault(); void perform(async () => {
        const result = await api("/api/tutors", { action: "invite", invitation: { email, displayName: name, classId: classId || null } });
        setIssued(result); setNotice("Undangan dibuat. Salin tautan dan bagikan langsung kepada penerimanya; email belum dikirim otomatis.");
        setEmail(""); setName(""); setClassId(""); await load();
      });
    }}>
      <h2>Undang Tutor</h2>
      <p>Tautan berlaku 7 hari dan hanya dapat diaktifkan satu kali untuk email penerima. Membuat undangan baru untuk email yang sama membatalkan undangan lama yang belum digunakan.</p>
      <label>Nama Tutor<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email Tutor<input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Penugasan kelas (opsional)<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Tugaskan setelah aktivasi</option>{data?.classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <small>Pilihan kelas hanya memuat kelas yang belum memiliki Tutor dan belum diarsipkan.</small>
      <button className="primary" disabled={busy || !data}>Buat undangan Tutor</button>
    </form>
    {issued && <section className="access-card" aria-label="Tautan undangan baru">
      <h3>Undangan untuk {issued.email}</h3><p>Berlaku sampai {date(Number(issued.expiresAt))}. Salin sebelum meninggalkan halaman; tautan lengkap hanya ditampilkan setelah dibuat.</p>
      <label>Tautan aktivasi Tutor<input readOnly value={issued.url} onFocus={(e) => e.target.select()} /></label>
      <div className="access-actions"><button className="secondary" type="button" onClick={() => void perform(async () => { await navigator.clipboard.writeText(issued.url); setNotice("Tautan disalin. Bagikan hanya kepada penerima undangan."); })}>Salin tautan aktivasi</button><button className="secondary" onClick={() => setIssued(null)}>Sembunyikan tautan</button></div>
    </section>}
    <section className="access-card">
      <h2>Daftar undangan Tutor</h2>
      {!data?.invitations.length && <p>Belum ada undangan Tutor.</p>}
      {data?.invitations.map((i: any) => <article key={i.id} className="tutor-invitation-row">
        <div><strong>{i.displayName}</strong><p>{i.email} · {i.className || "Penugasan menyusul"}</p><small>{i.acceptedAt ? "Sudah diaktifkan" : i.revokedAt ? "Dibatalkan" : Number(i.expiresAt) <= Date.now() ? "Kedaluwarsa" : "Menunggu aktivasi"} · berlaku sampai {date(Number(i.expiresAt))}</small></div>
        {!i.acceptedAt && !i.revokedAt && Number(i.expiresAt) > Date.now() && <button className="secondary" disabled={busy} onClick={() => void perform(async () => { await api("/api/tutors", { action: "revokeInvite", id: i.id }); if (issued?.id === i.id) setIssued(null); await load(); setNotice("Undangan dibatalkan."); })}>Batalkan undangan</button>}
      </article>)}
    </section>
    {!!tutors.length && <form className="access-card tutor-invite-form" onSubmit={(e) => {
      e.preventDefault(); void perform(async () => { await api("/api/tutors", { action: "revokeTutor", userId: target, reason }); setTarget(""); setReason(""); await load(); await onChanged(); setNotice("Hak Tutor dan penugasannya dicabut. Akun serta riwayat pekerjaan tetap tersedia sebagai Siswa sesuai status akses."); });
    }}><h2>Cabut hak Tutor</h2><p>Seluruh penugasan mengajar akun ini akan dilepas. Progres, kiriman, dan review terdahulu tetap disimpan.</p><label>Akun Tutor<select required value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Pilih Tutor</option>{tutors.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.mentorClasses} kelas</option>)}</select></label><label>Alasan pencabutan<textarea required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="primary" disabled={busy}>Cabut hak Tutor</button></form>}
    {!!data?.events.length && <section className="access-card"><h2>Riwayat undangan dan hak Tutor</h2>{data.events.map((event: any) => <p key={event.id}><strong>{kinds[event.kind] || event.kind}</strong> · {event.email}<br /><small>{date(event.createdAt)} · {event.reason}</small></p>)}</section>}
  </section>;
}
