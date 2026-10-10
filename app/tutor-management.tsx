"use client";
import { useEffect, useState } from "react";

type Issued = {id:string;email:string;url:string;expiresAt:number;capability:"tutor"|"curriculum";delivery:"manual"|"accepted"|"preview"|"failed"};
type Overview = {classes:{id:string;name:string}[];courses:{id:string;title:string}[];invitations:{id:string;email:string;displayName:string;capability:"tutor"|"curriculum";className:string|null;courseTitle:string|null;expiresAt:number;acceptedAt:string|null;revokedAt:string|null}[];events:{id:string;kind:string;email:string;createdAt:string;reason:string}[];emailAvailable:boolean;emailPreview:boolean};
type ManagedUser = {id:string;name:string;tutor?:number;capabilities?:{tutor?:boolean};mentorClasses?:number};
async function api<T = {error?:string}>(path: string, body?: unknown) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await r.json() as T & {error?:string};
  if (!r.ok) throw new Error(data.error || "Permintaan belum berhasil.");
  return data;
}
const fetchManagement = () => Promise.all([api<Overview>("/api/tutors"), api<{enabled:boolean}>("/api/registration")]);
const date = (value: string | number) => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
const kinds: Record<string, string> = { invite: "Undangan dibuat", activate: "Hak staf diaktifkan", revokeInvite: "Undangan dibatalkan", revokeTutor: "Hak Tutor dicabut" };
export default function TutorManagement({ users, onChanged }: { users: ManagedUser[]; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<Overview | null>(null), [enabled, setEnabled] = useState<boolean | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [issued, setIssued] = useState<Issued | null>(null);
  const [now,setNow] = useState(()=>Date.now());
  const [delivery,setDelivery] = useState("manual");
  const [capability,setCapability]=useState("tutor"),[courseId,setCourseId]=useState("");
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [classId, setClassId] = useState(""), [target, setTarget] = useState(""), [reason, setReason] = useState("");
  async function load() {
    const [tutors, registration] = await fetchManagement();
    setData(tutors); setEnabled(registration.enabled);
  }
  useEffect(() => {
    let active=true;
    void fetchManagement().then(([tutors,registration])=>{if(active){setData(tutors);setEnabled(registration.enabled);}}).catch(e=>{if(active)setError(e.message);});
    const timer=setInterval(()=>setNow(Date.now()),30000);
    return ()=>{active=false;clearInterval(timer);};
  }, []);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); }
    finally { setBusy(false); }
  }
  const tutors = users.filter((u) => u.tutor === 1 || u.capabilities?.tutor);
  return <section aria-label="Pendaftaran dan undangan staf" className="tutor-management">
    <section className="access-card">
      <h2>Pendaftaran siswa</h2>
      <p>Status: <strong>{enabled === null ? "Memuat…" : enabled ? "Dibuka" : "Ditutup"}</strong></p>
      <p>Siswa mendaftar sendiri dari beranda, login, atau detail course. Akun baru menunggu persetujuan Super Admin sebelum bisa belajar.</p>
      <button className="primary" disabled={busy || enabled === null} onClick={() => void perform(async () => {
        const r = await api<{enabled:boolean}>("/api/registration", { enabled: !enabled }); setEnabled(r.enabled); setNotice(r.enabled ? "Pendaftaran siswa dibuka. Formulir Daftar sudah tersedia di web." : "Pendaftaran siswa ditutup.");
      })}>{enabled ? "Tutup pendaftaran siswa" : "Buka pendaftaran siswa"}</button>
      <p><small>Perubahan berlaku langsung. Akun baru tetap perlu persetujuan Anda sebelum belajar.</small></p>
      <a href="/register" target="_blank" rel="noopener noreferrer">Lihat halaman pendaftaran</a>
    </section>
    {error && <div className="feedback error" role="alert"><span>{error}</span><button type="button" className="secondary" disabled={busy} onClick={() => void perform(load)}>Coba lagi</button></div>}
    {notice && <p className="feedback success" role="status">{notice}</p>}
    <form className="access-card tutor-invite-form" onSubmit={(e) => {
      e.preventDefault(); void perform(async () => {
        const result = await api<Issued>("/api/tutors", { action: "invite", invitation: { email, delivery, displayName: name, classId: capability === "tutor" ? classId || null : null, capability, courseId: capability === "curriculum" ? courseId || null : null } });
        setIssued(result); setNotice(result.delivery === "accepted" ? "SMTP menerima undangan untuk dikirim. Penerimaan inbox belum dikonfirmasi." : result.delivery === "preview" ? "Undangan tersimpan di kotak email uji lokal; tidak dikirim keluar." : result.delivery === "failed" ? "Undangan dibuat, tetapi pengiriman belum dapat dikonfirmasi. Tautan masih tersedia untuk disalin. Jangan membuat ulang sebelum memeriksa inbox dan daftar undangan." : "Undangan dibuat. Salin tautan dan bagikan langsung kepada penerimanya; email tidak dikirim.");
        setEmail(""); setName(""); setClassId(""); setCourseId(""); await load();
      });
    }}>
      <h2>Undang staf</h2><fieldset disabled={busy} style={{border:0,padding:0,margin:0,display:"contents"}}><label>Jenis undangan<select value={capability} onChange={e=>{setCapability(e.target.value);setClassId("");setCourseId("");}}><option value="tutor">Tutor</option><option value="curriculum">Tim Kurikulum</option></select></label>
      <p>Tautan berlaku 7 hari dan hanya dapat diaktifkan satu kali untuk email penerima. Membuat undangan baru untuk email dan jenis undangan yang sama membatalkan undangan lama yang belum digunakan.</p>
      <p>Jika penerima masih berjenis siswa, aktivasi undangan mengubahnya menjadi staf. Fitur belajar pribadi siswa tidak tersedia lagi; riwayatnya tetap disimpan.</p>
      <label>Nama penerima<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email penerima<input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {capability === "tutor" ? <label>Penugasan kelas (opsional)<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Tugaskan setelah aktivasi</option>{data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <label>Penugasan course (opsional)<select value={courseId} onChange={e=>setCourseId(e.target.value)}><option value="">Tugaskan setelah aktivasi</option>{data?.courses.map((c)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      <small>{capability === "tutor" ? "Pilihan kelas hanya memuat kelas yang belum memiliki Tutor dan belum diarsipkan." : "Penerima hanya dapat menyusun course yang ditugaskan. Undangan ini tidak memberi hak mengajar atau mengelola akun."}</small>
      <label>Pengiriman<select value={delivery} onChange={e=>setDelivery(e.target.value)}><option value="manual">Salin tautan secara manual</option><option value="email" disabled={!data?.emailAvailable}>{data?.emailPreview ? "Kotak email uji lokal" : "Kirim melalui email"}</option></select></label>
      {!data?.emailAvailable && <small>Pengiriman email belum aktif. Konfigurasi dan uji SMTP tersedia di pengaturan email.</small>}
      <button className="primary" disabled={busy || !data || (delivery === "email" && !data.emailAvailable)}>{delivery === "email" ? "Buat dan kirim undangan staf" : "Buat undangan staf"}</button></fieldset>
    </form>
    {issued && <section className="access-card" aria-label="Tautan undangan baru">
      <h3>Undangan untuk {issued.email}</h3><p>Berlaku sampai {date(Number(issued.expiresAt))}. Salin sebelum meninggalkan halaman; tautan lengkap hanya ditampilkan setelah dibuat.</p>
      <label>Tautan aktivasi {issued.capability === "curriculum" ? "Tim Kurikulum" : "Tutor"}<input readOnly value={issued.url} onFocus={(e) => e.target.select()} /></label>
      <div className="access-actions"><button className="secondary" type="button" onClick={() => void perform(async () => { await navigator.clipboard.writeText(issued.url); setNotice("Tautan disalin. Bagikan hanya kepada penerima undangan."); })}>Salin tautan aktivasi</button><button className="secondary" onClick={() => setIssued(null)}>Sembunyikan tautan</button></div>
    </section>}
    <section className="access-card">
      <h2>Daftar undangan staf</h2>
      {!data?.invitations.length && <p>Belum ada undangan staf.</p>}
      {data?.invitations.map((i) => <article key={i.id} className="tutor-invitation-row">
        <div><strong>{i.displayName}</strong><p>{i.email} · {i.capability === "curriculum" ? "Tim Kurikulum" : "Tutor"} · {(i.capability === "curriculum" ? i.courseTitle : i.className) || "Penugasan menyusul"}</p><small>{i.acceptedAt ? "Sudah diaktifkan" : i.revokedAt ? "Dibatalkan" : Number(i.expiresAt) <= now ? "Kedaluwarsa" : "Menunggu aktivasi"} · berlaku sampai {date(Number(i.expiresAt))}</small></div>
        {!i.acceptedAt && !i.revokedAt && Number(i.expiresAt) > now && <button className="secondary" disabled={busy} onClick={() => void perform(async () => { await api("/api/tutors", { action: "revokeInvite", id: i.id }); if (issued?.id === i.id) setIssued(null); await load(); setNotice("Undangan dibatalkan."); })}>Batalkan undangan</button>}
      </article>)}
    </section>
    {!!tutors.length && <details className="tutor-revoke"><summary>Cabut hak mengajar Tutor</summary><form className="access-card tutor-invite-form" onSubmit={(e) => {
      e.preventDefault(); if (!confirm("Cabut hak mengajar dan seluruh penugasan kelas Tutor ini? Riwayat pekerjaan tetap disimpan.")) return; void perform(async () => { await api("/api/tutors", { action: "revokeTutor", userId: target, reason }); setTarget(""); setReason(""); await load(); await onChanged(); setNotice("Hak Tutor dan penugasannya dicabut. Akun tetap berjenis staf; izin Tim Kurikulum dan riwayat tetap tersimpan."); });
    }}><h2>Cabut hak Tutor</h2><p>Seluruh penugasan mengajar akun ini menjadi tidak efektif. Penugasan ulang diperlukan jika izin Tutor diberikan kembali. Progres, kiriman, dan review terdahulu tetap disimpan.</p><label>Akun Tutor<select required value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Pilih Tutor</option>{tutors.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.mentorClasses} kelas</option>)}</select></label><label>Alasan pencabutan<textarea required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="danger-button" disabled={busy}>Cabut hak Tutor</button></form></details>}
    {!!data?.events.length && <section className="access-card"><h2>Riwayat undangan dan hak staf</h2>{data.events.map((event) => <p key={event.id}><strong>{kinds[event.kind] || event.kind}</strong> · {event.email}<br /><small>{date(event.createdAt)} · {event.reason}</small></p>)}</section>}
  </section>;
}
