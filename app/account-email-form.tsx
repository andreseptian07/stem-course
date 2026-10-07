"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Loader2, ShieldCheck } from "lucide-react";
import PasswordField from "./password-field";
import "./auth.css";

type Mode = "forgot" | "reset" | "verify";
export default function AccountEmailForm({ mode }: { mode: Mode }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get("token") || "";
    if (value) {
      history.replaceState(null, "", location.pathname + location.search);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Capture the browser-only fragment once and remove it from history before sending any request.
      setToken(value);
    }
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget), password = String(values.get("password") || "");
    if (mode === "reset" && password !== values.get("repeatPassword")) { setError("Konfirmasi password belum sama."); return; }
    const payload = mode === "reset" ? { action: "reset", token, password }
      : mode === "verify" && token ? { action: "verify", token }
      : { action: mode === "verify" ? "requestVerify" : "requestReset", email: values.get("email") };
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result: { error?: string; message?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Permintaan belum berhasil.");
      setMessage(result.message || "Permintaan berhasil.");
      if (mode === "reset" || (mode === "verify" && token)) { setDone(true); setToken(""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  return <main className="auth-container">
    <Link className="auth-brand" href="/"><BookOpen size={27} /><span>Ruang<span> STEM</span></span></Link>
    <section className="auth-card">
      <span className="auth-eyebrow">KEAMANAN AKUN</span>
      <h1>{mode === "forgot" ? "Lupa password?" : mode === "reset" ? "Buat password baru" : "Verifikasi email"}</h1>
      <p>{mode === "forgot" ? "Masukkan email akun Anda untuk meminta tautan pemulihan." : mode === "reset" ? "Setelah password diganti, semua sesi sebelumnya diakhiri." : token ? "Konfirmasikan bahwa Anda memiliki alamat email akun ini." : "Minta tautan verifikasi untuk email akun Anda. Persetujuan akses belajar tetap ditinjau Super Admin."}</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {message && <div className="auth-success" role="status">{done && <ShieldCheck />}<p>{message}</p></div>}
      {!done && (mode === "reset" && !token ? <p>Tautan pemulihan belum tersedia. Buka tautan dari email atau minta tautan baru.</p> : <form onSubmit={submit}>
        {(mode === "forgot" || (mode === "verify" && !token)) && <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="nama@email.com" /></label>}
        {mode === "reset" && <><PasswordField label="Password baru" name="password" autoComplete="new-password" minLength={15} /><small>Gunakan frasa unik dengan 15–128 karakter.</small><PasswordField label="Konfirmasi password" name="repeatPassword" autoComplete="new-password" minLength={15} /></>}
        <button type="submit" className="auth-button" disabled={busy}>{busy && <Loader2 size={18} className="spin" />}{mode === "reset" ? "Simpan password baru" : mode === "verify" && token ? "Verifikasi email saya" : "Kirim tautan email"}</button>
      </form>)}
      <div className="auth-links"><a href="/login">Kembali ke halaman masuk</a>{mode === "verify" && (token || done) ? <a href="/verify-email">Minta tautan verifikasi baru</a> : mode === "reset" ? <a href="/forgot-password">Minta tautan pemulihan baru</a> : null}{done && mode === "verify" && <a href="/access">Lihat status akses akun</a>}</div>
    </section>
  </main>;
}
