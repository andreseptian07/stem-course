"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ShieldCheck } from "lucide-react";
import "./auth.css";
const storageKey = "stem-tutor-invitation";
async function api(body: unknown) {
  const r = await fetch("/api/tutor-activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error || "Undangan belum dapat diproses.");
  return data;
}
export default function TutorActivation({ signedEmail }: { signedEmail: string | null }) {
  const [token, setToken] = useState(""), [info, setInfo] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<any>(null);
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
    e.preventDefault(); if (busy) return;
    const form = new FormData(e.currentTarget), email = String(form.get("email") || ""), password = String(form.get("password") || "");
    if (!info.existingAccount && password !== form.get("repeatPassword")) { setError("Konfirmasi password tidak sama."); return; }
    setBusy(true); setError("");
    try {
      const result = await api({ action: "activate", activation: { token, email, ...(!info.existingAccount ? { password } : {}) } });
      sessionStorage.removeItem(storageKey); setToken(""); setDone(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Aktivasi belum berhasil."); }
    finally { setBusy(false); }
  }
  return <main className="auth-container">
    <a className="auth-brand" href="/"><BookOpen /><span>STEM Studio</span></a>
    <section className="auth-card">
      <span className="auth-eyebrow">UNDANGAN TUTOR</span>
      <h1>Aktifkan akun Tutor</h1>
      <p>Super Admin mengundang Anda untuk mengajar. Hak mengelola tugas, review, dan sesi berlaku pada kelas yang ditugaskan.</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {done ? <div className="auth-success" role="status"><ShieldCheck /><h2>Hak Tutor berhasil diaktifkan</h2><p>Anda dapat membuka kelas yang ditugaskan. Jika belum ada kelas, Super Admin dapat menugaskannya kemudian.</p><a className="auth-button" href={done.existingAccount ? "/classes" : "/login?return_to=%2Fclasses"}>{done.existingAccount ? "Buka kelas saya" : "Masuk ke akun Tutor"}</a></div> : info ? <>
        <p>Untuk: <strong>{info.displayName}</strong> · {info.emailHint}<br />Berlaku sampai {new Date(Number(info.expiresAt)).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p>
        {info.existingAccount && <div className="auth-links"><p>Akun email ini sudah terdaftar. Masuk sebagai penerima undangan, kemudian kembali ke halaman ini. Aktivasi tidak mengganti password akun.</p>{signedEmail && <small>Saat ini masuk sebagai {signedEmail}.</small>}<a href="/login?return_to=%2Ftutor%2Factivate">Masuk sebagai penerima undangan</a></div>}
        <form onSubmit={submit}>
          <label>Email penerima undangan<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
          {!info.existingAccount && <>
            <label>Password baru<input name="password" type="password" required minLength={15} maxLength={128} autoComplete="new-password" /></label>
            <label>Konfirmasi password<input name="repeatPassword" type="password" required minLength={15} maxLength={128} autoComplete="new-password" /></label>
            <small>Gunakan frasa unik sepanjang 15–128 karakter.</small>
          </>}
          <button className="auth-button" disabled={busy || (info.existingAccount && !signedEmail)}>{busy ? "Mengaktifkan…" : "Aktifkan hak Tutor"}</button>
        </form>
      </> : !error && <p>Memeriksa undangan…</p>}
    </section>
    <a className="auth-home" href="/login">Kembali ke login</a>
  </main>;
}
