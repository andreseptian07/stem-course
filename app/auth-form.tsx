"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, Loader2, ShieldCheck } from "lucide-react";
import "./auth.css";
import PasswordField from "./password-field";
type Mode = "login" | "register" | "password" | "logout";
export default function AuthForm({ mode, returnTo = "/dashboard", registrationEnabled = false }: { mode: Mode; returnTo?: string; registrationEnabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  const [emailQueued, setEmailQueued] = useState(false);
  const loginHref = `/login?return_to=${encodeURIComponent(returnTo)}`;
  const registerHref = `/register?return_to=${encodeURIComponent(returnTo)}`;
  const requestedCourse = returnTo.startsWith("/dashboard?") ? new URL(returnTo, "https://app.local").searchParams.get("join") : null;
  const courseId = requestedCourse && /^[a-zA-Z0-9_-]{1,80}$/.test(requestedCourse) ? requestedCourse : undefined;
  const titles = { login: "Selamat datang kembali", register: "Mulai perjalanan belajar", password: "Ganti password", logout: "Keluar dari akun" };
  const descriptions = { login: "Masuk untuk melanjutkan course dan terhubung dengan tutor.", register: "Buat akun Siswa. Super Admin akan meninjau permintaan akses Anda.", password: "Setelah password diganti, semua sesi akun akan diakhiri.", logout: "Progres belajar Anda tetap tersimpan. Anda bisa masuk kembali kapan saja." };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form), password = String(values.get("password") || "");
    if ((mode === "register" || mode === "password") && password !== values.get("repeatPassword")) { setError("Konfirmasi password belum sama."); return; }
    setBusy(true); setError("");
    const payload = mode === "logout" ? { action: mode } : mode === "password"
      ? { action: mode, currentPassword: values.get("currentPassword"), password }
      : mode === "register" ? { action: mode, email: values.get("email"), displayName: values.get("displayName"), password, ...(courseId ? { courseId } : {}) }
      : { action: mode, email: values.get("email"), password, returnTo };
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; redirect?: string; emailQueued?: boolean };
      if (!response.ok) throw new Error(data.error || "Permintaan belum berhasil.");
      if (mode === "register") { form.reset(); setEmailQueued(!!data.emailQueued); setDone(true); }
      else location.assign(data.redirect || "/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  return <main className="auth-container">
    <Link className="auth-brand" href="/"><BookOpen size={27} /><span>Ruang<span> STEM</span></span></Link>
    <section className="auth-card">
      <span className="auth-eyebrow">RUANG BELAJAR STEM</span>
      <h1>{titles[mode]}</h1><p>{descriptions[mode]}</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {done ? <div className="auth-success" role="status"><ShieldCheck /><h2>Akun berhasil dibuat</h2><p>{emailQueued ? "Periksa inbox dan folder spam untuk tautan verifikasi email. Anda dapat meminta tautan baru melalui halaman Verifikasi email." : "Silakan masuk untuk melihat status akun. Anda juga dapat meminta tautan melalui halaman Verifikasi email."} Persetujuan akses belajar tetap ditinjau Super Admin.</p><Link className="auth-button" href={loginHref}>Masuk ke akun</Link><Link href="/verify-email">Verifikasi email</Link></div>
        : mode === "register" && !registrationEnabled ? <p>Pendaftaran belum dibuka. Hubungi pengelola untuk informasi akses.</p>
        : <form method="post" action="/api/auth" onSubmit={submit}>
          {(mode === "login" || mode === "register") && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nama@email.com" /></label>}
          {mode === "register" && <label>Nama tampilan<input name="displayName" autoComplete="name" required maxLength={100} /></label>}
          {mode === "password" && <PasswordField label="Password saat ini" name="currentPassword" autoComplete="current-password" minLength={1} />}
          {mode !== "logout" && <PasswordField label={mode === "password" ? "Password baru" : "Password"} name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 15} />}
          {(mode === "register" || mode === "password") && <><small>Gunakan frasa unik dengan 15–128 karakter.</small><PasswordField label="Konfirmasi password" name="repeatPassword" autoComplete="new-password" minLength={15} /></>}
          <button className="auth-button" disabled={busy} type="submit">{busy && <Loader2 className="spin" size={18} />}{mode === "login" ? "Masuk" : mode === "register" ? "Buat akun" : mode === "password" ? "Simpan password baru" : "Keluar"}</button>
        </form>}
      <div className="auth-links">{mode === "login" ? <><Link href={registerHref}>Belum punya akun? Daftar</Link>{!registrationEnabled && <small>Pendaftaran sedang ditutup oleh Super Admin.</small>}<Link href="/forgot-password">Lupa password?</Link><Link href="/verify-email">Verifikasi email atau kirim ulang tautan</Link></> : <Link href={mode === "password" || mode === "logout" ? "/profile" : loginHref}>{mode === "password" || mode === "logout" ? "Kembali ke profil" : "Sudah punya akun? Masuk"}</Link>}</div>
    </section><Link className="auth-home" href="/courses">Jelajahi course</Link>
  </main>;
}
