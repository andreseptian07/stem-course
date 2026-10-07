"use client";
import { useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import "./email-management.css";
type Settings = { version: number; smtpReady: boolean; tested: boolean; testedAt: string | null; enabled: boolean; requestedEnabled: boolean; required: boolean; preview: boolean };
async function request(body?: unknown): Promise<Settings> {
  const response = await fetch("/api/email-settings", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json() as Settings & { error?: string };
  if (!response.ok) throw new Error(result.error || "Pengaturan email belum dapat dimuat.");
  return result;
}
export default function EmailManagement() {
  const [data, setData] = useState<Settings | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    request().then((r) => { if (live) setData(r); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Pengaturan belum dapat dimuat."); });
    return () => { live = false; };
  }, []);
  async function load() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { setData(await request()); } catch (e) { setError(e instanceof Error ? e.message : "Pengaturan belum dapat dimuat."); }
    finally { setBusy(false); }
  }
  async function update(action: "test" | "enable" | "disable" | "requireVerification", required?: boolean) {
    if (!data || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setData(await request({ action, version: data.version, ...(action === "requireVerification" ? { required } : {}) }));
      setNotice(action === "test" ? "SMTP menerima email uji untuk alamat akun Anda. Periksa inbox dan folder spam sebelum mengaktifkan." : "Pengaturan email tersimpan.");
    } catch (e) { setError(e instanceof Error ? e.message : "Pengaturan belum tersimpan."); }
    finally { setBusy(false); }
  }
  return <section className="email-management" aria-labelledby="email-management-title">
    <div className="email-management-heading"><h2 id="email-management-title"><Mail size={22} />Email akun</h2><button type="button" className="secondary" disabled={busy} onClick={load}><RefreshCw size={16} />Muat ulang</button></div>
    <p>Aktifkan email verifikasi dan pemulihan setelah konfigurasi SMTP lengkap dan email uji diterima.</p>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {notice && <p className="feedback success" role="status">{notice}</p>}
    {!data && !error && <p role="status">Memuat pengaturan email…</p>}
    {data && <>
      <dl><div><dt>Konfigurasi SMTP</dt><dd>{data.smtpReady ? "Lengkap" : "Belum lengkap atau tidak valid"}</dd></div><div><dt>Pengujian pengiriman</dt><dd>{data.tested ? "Berhasil" : "Belum berhasil dengan konfigurasi saat ini"}</dd></div><div><dt>Pengiriman email akun</dt><dd>{data.enabled ? "Aktif" : "Belum aktif"}</dd></div></dl>
      {!data.smtpReady && <p>Lengkapi alamat pengirim, host, port, akun dan password SMTP melalui konfigurasi privat server. Setelah itu, muat ulang pengaturan.</p>}
      {data.requestedEnabled && !data.enabled && <p role="status">Konfigurasi SMTP berubah atau tidak valid. Uji kembali dan aktifkan setelah berhasil.</p>}
      {data.preview && !data.enabled && <p>Email uji lokal tetap tersimpan di komputer; belum dikirim ke inbox.</p>}
      <div className="email-management-actions"><button type="button" className="secondary" disabled={busy || !data.smtpReady} onClick={() => void update("test")}>Kirim email uji ke akun saya</button>{data.enabled ? <button type="button" className="secondary" disabled={busy || data.required} onClick={() => void update("disable")}>Nonaktifkan email</button> : <button type="button" className="primary" disabled={busy || !data.smtpReady || !data.tested} onClick={() => void update("enable")}>Aktifkan email</button>}</div>
      <label className="email-required"><input type="checkbox" checked={data.required} disabled={busy || (!data.required && !data.enabled)} onChange={(e) => void update("requireVerification", e.target.checked)} />Wajibkan verifikasi email sebelum belajar</label>
      <p>Akun Siswa dan Tutor yang sudah ada juga harus memverifikasi email jika diwajibkan. Akses operator Super Admin tetap tersedia. Matikan kewajiban verifikasi terlebih dahulu sebelum menonaktifkan email.</p>
    </>}
  </section>;
}
