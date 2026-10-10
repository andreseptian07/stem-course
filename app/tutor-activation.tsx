"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ShieldCheck } from "lucide-react";
import "./auth.css";
import PasswordField from "./password-field";
type InvitationInfo = { displayName:string; emailHint:string; expiresAt:number; existingAccount:boolean; capability:"tutor"|"curriculum"; scopeName:string|null; courseId:string|null };
type ActivationResult = { existingAccount:boolean; capability:"tutor"|"curriculum"; destination:string };
const storageKey = "stem-tutor-invitation";
async function api(body: unknown) {
  const r = await fetch("/api/tutor-activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json() as InvitationInfo & ActivationResult & {error?:string};
  if (!r.ok) throw new Error(data.error || "Undangan belum dapat diproses.");
  return data;
}
export default function TutorActivation({ signedEmail }: { signedEmail: string | null }) {
  const [token, setToken] = useState(""), [info, setInfo] = useState<InvitationInfo | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<ActivationResult | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function load() {
      try {
        const fragment = new URLSearchParams(location.hash.slice(1)).get("invite");
        if (fragment) {
          sessionStorage.setItem(storageKey, fragment);
          history.replaceState(null, "", "/tutor/activate");
        }
        const value = fragment || sessionStorage.getItem(storageKey) || "";
        if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("Buka tautan aktivasi yang diberikan Super Admin.");
        setToken(value);
        setInfo(await api({ action: "inspect", token: value }));
      } catch (e) { setError(e instanceof Error ? e.message : "Undangan belum dapat dibuka."); }
    }
    void load();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || !info) return;
    const form = new FormData(e.currentTarget), email = String(form.get("email") || ""), password = String(form.get("password") || "");
    if (!info.existingAccount && password !== form.get("repeatPassword")) { setError("Konfirmasi password tidak sama."); return; }
    setBusy(true); setError("");
    try {
      const result = await api({ action: "activate", activation: { token, email, ...(!info.existingAccount ? { password } : {}) } });
      sessionStorage.removeItem(storageKey); setToken(""); setDone(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Aktivasi belum berhasil."); }
    finally { setBusy(false); }
  }
  const curriculum = (done?.capability || info?.capability) === "curriculum", role = curriculum ? "Tim Kurikulum" : "Tutor";
  return <main className="auth-container">
    <Link className="auth-brand" href="/"><BookOpen /><span>Ruang STEM</span></Link>
    <section className="auth-card">
      <span className="auth-eyebrow">UNDANGAN STAF</span>
      <h1>Aktifkan hak {info || done ? role : "staf"}</h1>
      <p>{!info && !done ? "Buka tautan undangan untuk melihat jenis izin dan penugasan Anda." : curriculum ? "Susun materi dan ajukan draf untuk ditinjau Super Admin pada course yang ditugaskan. Hak Tutor dan pengelolaan akun tidak diberikan oleh undangan ini." : "Kelola tugas, review, dan sesi pada kelas yang ditugaskan. Hak Tim Kurikulum tidak diberikan oleh undangan ini."} Fitur belajar pribadi siswa tidak tersedia untuk akun staf.</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {done ? <div className="auth-success" role="status"><ShieldCheck /><h2>Hak {role} berhasil diaktifkan</h2><p>{curriculum ? "Buka workspace untuk course yang ditugaskan." : "Buka kelas yang ditugaskan."} Jika belum ada penugasan, hubungi Super Admin.</p><a className="auth-button" href={done.existingAccount ? done.destination : `/login?return_to=${encodeURIComponent(done.destination)}`}>{done.existingAccount ? curriculum ? "Buka Tim Kurikulum" : "Buka kelas saya" : `Masuk ke akun ${role}`}</a></div> : info ? <>
        <p>Untuk: <strong>{info.displayName}</strong> · {info.emailHint}<br />Berlaku sampai {new Date(Number(info.expiresAt)).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.<br />Penugasan: <strong>{info.scopeName || "Ditentukan setelah aktivasi"}</strong>.</p>
        {info.existingAccount && <div className="auth-links"><p>Akun email ini sudah terdaftar. Masuk sebagai penerima undangan, kemudian kembali ke halaman ini. Aktivasi tidak mengganti password akun.</p>{signedEmail && <small>Saat ini masuk sebagai {signedEmail}.</small>}<a href="/login?return_to=%2Ftutor%2Factivate">Masuk sebagai penerima undangan</a></div>}
        <form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
          <label>Email penerima undangan<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
          {!info.existingAccount && <>
            <PasswordField label="Password baru" name="password" autoComplete="new-password" minLength={15} />
            <PasswordField label="Konfirmasi password" name="repeatPassword" autoComplete="new-password" minLength={15} />
            <small>Gunakan frasa unik sepanjang 15–128 karakter.</small>
          </>}
          <button className="auth-button" disabled={busy || (info.existingAccount && !signedEmail)}>{busy ? "Mengaktifkan…" : `Aktifkan hak ${role}`}</button>
        </fieldset></form>
      </> : !error && <p>Memeriksa undangan…</p>}
    </section>
    <a className="auth-home" href="/login">Kembali ke login</a>
  </main>;
}
