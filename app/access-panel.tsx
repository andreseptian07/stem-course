"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Layers3, RefreshCw } from "lucide-react";
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
async function api(body?: unknown) {
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
  const d: any = await r.json();
  if (!r.ok) throw new Error(d.error || "Permintaan belum berhasil.");
  return d;
}
export default function Access() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [change, setChange] = useState<any>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      setData(await api());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const owner = data?.user.role === "owner",
    rows = (data?.users || []).filter(
      (u: any) =>
        (filter === "all" || u.status === filter) &&
        u.name.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <div className="account-shell access-shell">
      <header className="account-header">
        <a className="account-brand" href="/">
          <Layers3 />
          STEM Studio
        </a>
        <a href="/courses">Jelajahi course</a>
      </header>
      <main className="access-main">
        <div className="access-heading">
          <div>
            <div className="eyebrow teal">AKUN & PERIZINAN</div>
            <h1>
              <ShieldCheck />{" "}
              {owner ? "Kelola akses pengguna" : "Akses akun saya"}
            </h1>
          </div>
          <button className="secondary" disabled={busy} onClick={load}>
            <RefreshCw size={16} />
            Muat ulang
          </button>
        </div>
        {error && (
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
                ? "Akun Anda sudah terdaftar. Pengelola perlu menyetujui akses sebelum Anda bisa mengikuti course dan kelas."
                : data.status === "suspended"
                  ? "Akses belajar akun Anda sedang ditangguhkan. Hubungi pengelola untuk meminta peninjauan. Progres dan pekerjaan Anda tetap tersimpan."
                  : "Akun Anda aktif. Silakan lanjutkan belajar atau pilih kelas."}
            </p>
            <div className="access-actions">
              {data.status === "active" && (
                <a className="primary button-link" href="/dashboard">
                  Buka dashboard
                </a>
              )}
              <a href="/logout">Keluar</a>
            </div>
          </section>
        )}
        {owner && (
          <>
            <div className="access-actions">
              <a href="/dashboard">Dashboard</a>
              <a href="/classes">Kelas & mentor</a>
            </div>
            <p className="access-help">
              Akun baru menunggu persetujuan. Akses belajar berlaku untuk
              siswa dan tutor; penugasan tutor diatur per kelas. Persetujuan
              akun tidak memberikan izin mengelola course.
            </p>
            <TutorManagement users={data.users} onChanged={load} />
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
                  <option value="all">Semua ({data.users.length})</option>
                  {Object.entries(labels).map(([s, l]) => (
                    <option key={s} value={s}>
                      {l} (
                      {data.users.filter((u: any) => u.status === s).length})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="access-users">
              {rows.map((u: any) => (
                <article className="access-card" key={u.id}>
                  <div>
                    <h2>{u.name}</h2>
                    <small>ID {u.id}</small>
                    <p>
                      {u.role === "owner"
                        ? "Super Admin"
                        : u.role === "tutor" || u.mentorClasses
                          ? `Tutor · ${u.mentorClasses} kelas ditugaskan`
                          : "Siswa"}
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
                        onClick={() => {
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
                <h2>
                  {change.status === "active" ? "Aktifkan" : "Tangguhkan"} akses{" "}
                  {change.user.name}
                </h2>
                <p>
                  {change.status === "active"
                    ? "Akun dapat membaca materi dan menggunakan fitur belajar. Akses mentor tetap mengikuti penugasan kelas."
                    : "Permintaan belajar berikutnya ditolak hingga akses dipulihkan. Keanggotaan kelas, progres, dan kiriman tetap disimpan."}
                </p>
                <label>
                  Alasan perubahan akses
                  <textarea
                    required
                    rows={3}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
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
            <section className="access-audit">
              <h2>Riwayat perubahan akses</h2>
              <p className="access-help">
                100 perubahan terbaru. Riwayat hanya tersedia untuk pemilik.
              </p>
              {!data.events.length && <p>Belum ada perubahan akses.</p>}
              {data.events.map((e: any) => (
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
            </section>
          </>
        )}
      </main>
    </div>
  );
}
