"use client";
import Link from "next/link";
import {responseJson} from "@/lib/client-fetch";
import type {AccessOverview, AccessUser} from "@/lib/access";
import AccountFrame from "./account-frame";
import type {NavigationUser} from "@/lib/account-navigation";

import PermissionManagement from "./permission-management";
import EmailManagement from "./email-management";
import EmailStatus from "./email-status";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import "./account.css";
import "./access.css";
import TutorManagement from "./tutor-management";
const labels: Record<string, string> = {
  pending: "Menunggu persetujuan",
  active: "Aktif",
  suspended: "Ditangguhkan",
};
const date = (s: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(s)) + " WIB";
async function api<T = AccessOverview>(body?: unknown) {
  const r = await fetch(
    "/api/access",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  return responseJson<T>(r, !!body);
}
export default function Access({navigation}:{navigation:NavigationUser}) {
  const [section, setSection] = useState("accounts");
  const changeDialog = useRef<HTMLDialogElement>(null);
  const changeOpener = useRef<HTMLButtonElement | null>(null);
  const [data, setData] = useState<AccessOverview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [change, setChange] = useState<{user:AccessUser;status:"active"|"suspended"} | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = changeDialog.current;
    if (!dialog) return;
    if (change && !dialog.open) dialog.showModal();
    if (!change && dialog.open) { dialog.close(); changeOpener.current?.focus(); }
  }, [change]);
  async function load() {
    setError("");
    try {
      setData(await api());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {void load();}, 0);
    return () => clearTimeout(timer);
  }, []);
  const owner = data?.user.role === "owner",
    rows = (data?.users || []).filter(
      (u) =>
        (filter === "all" || u.status === filter) &&
        u.name.toLowerCase().includes(search.toLowerCase()),
    );
  return (
<AccountFrame user={navigation} current="access" mainId="access-main">        <EmailStatus />
        {owner && <p><Link className="secondary button-link" href="/curriculum">Kelola Tim Kurikulum →</Link></p>}
        <div className="access-heading">
          <div>
            <div className="eyebrow teal">AKUN & PERIZINAN</div>
            <h1>
              <ShieldCheck />{" "}
              {owner || (!data && navigation.owner) ? "Kelola akses pengguna" : "Akses akun saya"}
            </h1>
          </div>
          <button className="secondary" disabled={busy} onClick={load}>
            <RefreshCw size={16} />
            Muat ulang
          </button>
        </div>
        {error && !change && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="feedback success" role="status">
            {notice}
          </p>
        )}
        {!data && !error && <p>Memuat status akun…</p>}
        {data && !owner && (
          <section className="access-card">
            <span className={"access-status " + data.status}>
              {labels[data.status]}
            </span>
            <h2>{data.user.name}</h2>
            <p>
              {data.status === "pending"
                ? "Akun Anda sudah terdaftar dan menunggu persetujuan pengelola. Setelah disetujui, fitur tersedia sesuai jenis akun, izin, dan penugasan Anda."
                : data.status === "suspended"
                  ? "Akses akun Anda sedang ditangguhkan. Hubungi pengelola untuk meminta peninjauan. Progres dan pekerjaan Anda tetap tersimpan."
                  : data.user.kind === "unclassified" ? "Akun memerlukan klasifikasi oleh pengelola." : data.user.kind === "staff" ? "Akun staf aktif. Buka dashboard untuk melihat pekerjaan sesuai izin Anda." : "Akun siswa aktif. Silakan lanjutkan belajar atau pilih kelas."}
            </p>
            <div className="access-actions">
              {data.status === "active" && (
                <Link className="primary button-link" href="/dashboard">
                  Buka dashboard
                </Link>
              )}
              <Link href="/logout">Keluar</Link>
            </div>
          </section>
        )}
        {owner && (
          <>
            <EmailManagement />
            <div className="access-actions">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/classes">Kelas & Tutor</Link>
            </div>
            <nav className="access-tabs" aria-label="Pengelolaan akses">
              {[["accounts", "Akun pengguna"], ["tutors", "Staf & pendaftaran"], ["audit", "Riwayat akses"]].map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}
            </nav>
            {section === "accounts" && <section aria-label="Akun pengguna">
            <p className="access-help">
              Akun baru menunggu persetujuan. Akses belajar berlaku untuk
              siswa. Staf bekerja sesuai izin Tutor atau Tim Kurikulum dan penugasannya. Persetujuan
              akun tidak memberikan izin mengelola course.
            </p>
            <div className="access-controls">
              <label>
                Cari nama akun
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nama siswa atau tutor"
                />
              </label>
              <label>
                Status akun
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Semua ({(data.users || []).length})</option>
                  {Object.entries(labels).map(([s, l]) => (
                    <option key={s} value={s}>
                      {l} (
                      {(data.users || []).filter((u) => u.status === s).length})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="access-users">
              {rows.map((u) => (
                <article className="access-card" key={u.id}>
                  <div>
                    <h2>{u.name}</h2>
                    <details className="access-account-detail"><summary>Detail akun</summary><small>ID akun: {u.id}</small></details>
                    <p>
                      {u.role === "owner"
                        ? "Super Admin"
                        : u.tutor === 1 && u.curriculum === 1
                          ? `Tutor + Tim Kurikulum · ${u.mentorClasses} kelas ditugaskan`
                        : u.tutor === 1
                          ? `Tutor · ${u.mentorClasses} kelas ditugaskan`
                          : u.curriculum === 1 ? "Tim Kurikulum" : u.kind === "staff" ? "Staf · belum ada izin kerja aktif" : u.kind === "student" ? "Siswa" : "Perlu klasifikasi akun"}
                    </p>
                    <span className={"access-status " + u.status}>
                      {labels[u.status]}
                    </span>
                  </div>
                  <div className="access-actions">
                    {u.role !== "owner" && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={(e) => {
                          changeOpener.current = e.currentTarget;
                          setChange({
                            user: u,
                            status:
                              u.status === "active" ? "suspended" : "active",
                          });
                          setReason("");
                          setError("");
                        }}
                      >
                        {u.status === "active"
                          ? "Tangguhkan akses"
                          : u.status === "suspended"
                            ? "Pulihkan akses"
                            : "Setujui akses"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!rows.length && <p>Tidak ada akun dengan filter ini.</p>}
            </section>}
            {section === "tutors" && <><PermissionManagement users={(data.users || [])} onChanged={load}/><TutorManagement users={(data.users || [])} onChanged={load} /></>}
            <dialog ref={changeDialog} className="access-dialog" aria-labelledby="access-change-title" onCancel={() => setChange(null)}>
            {change && (
              <form
                className="access-card access-change"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await api({
                      userId: change.user.id,
                      version: change.user.version,
                      status: change.status,
                      reason,
                    });
                    setChange(null);
                    setReason("");
                    await load();
                    setNotice("Perubahan akses tersimpan.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h2 id="access-change-title">
                  {change.status === "active" ? "Aktifkan" : "Tangguhkan"} akses{" "}
                  {change.user.name}
                </h2>
                <p>
                  {change.status === "active"
                    ? "Akun dapat menggunakan fitur sesuai jenis akun, izin, dan penugasannya."
                    : "Permintaan belajar berikutnya ditolak hingga akses dipulihkan. Keanggotaan kelas, progres, dan kiriman tetap disimpan."}
                </p>
                <label>
                  Alasan perubahan akses
                  <textarea
                    autoFocus
                    required
                    rows={3}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {error && <p className="feedback error" role="alert">{error}</p>}
                <div className="access-actions">
                  <button className="primary" disabled={busy}>
                    Simpan perubahan akses
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setChange(null)}
                  >
                    Batalkan
                  </button>
                </div>
              </form>
            )}
            </dialog>
            {section === "audit" && <section className="access-audit">
              <h2>Riwayat perubahan akses</h2>
              <p className="access-help">
                100 perubahan terbaru. Riwayat hanya tersedia untuk Super Admin.
              </p>
              {!(data.events || []).length && <p>Belum ada perubahan akses.</p>}
              {(data.events || []).map((e) => (
                <article className="access-card" key={e.id}>
                  <strong>
                    {e.targetName} · {labels[e.status]}
                  </strong>
                  <p>{e.reason}</p>
                  <small>
                    {date(e.createdAt)} · {e.actorName}
                  </small>
                </article>
              ))}
            </section>}
          </>
        )}
    </AccountFrame>
  );
}
