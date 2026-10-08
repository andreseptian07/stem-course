"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Layers3, RefreshCw, CheckCheck, ArrowUpRight, Loader2, LogOut } from "lucide-react";
import type { NotificationFeed, NotificationItem, NotificationKind } from "@/lib/notification-model";
import "./account.css";
import "./notifications.css";

const labels: Record<NotificationKind, string> = {
  curriculum: "Kurikulum",
  access: "Akses akun", invitation: "Tutor", class: "Penugasan kelas", task: "Tugas",
  review: "Hasil review", submission: "Review Tutor", announcement: "Pengumuman", session: "Jadwal", reminder: "Pengingat",
};
const date = (value: string) => new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
}).format(new Date(value)) + " WIB";
async function request(body?: unknown): Promise<NotificationFeed> {
  const response = await fetch("/api/notifications", body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await response.json() as NotificationFeed & { error?: string };
  if (!response.ok) throw Object.assign(new Error(data.error || "Notifikasi belum dapat dimuat."), { status: response.status });
  return data;
}

const needsLogin = (error: unknown) => !!error && typeof error === "object" && "status" in error && [401, 403].includes(Number(error.status));

export default function Notifications() {
  const [data, setData] = useState<NotificationFeed | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);
  async function load() {
    const current = ++sequence.current;
    try {
      const feed = await request();
      if (current === sequence.current) { setData(feed); setError(""); setLoginRequired(false); }
    } catch (e) {
      if (current !== sequence.current) return;
      setError(e instanceof Error ? e.message : "Notifikasi belum dapat dimuat.");
      setLoginRequired(needsLogin(e));
      if (needsLogin(e)) setData(null);
    }
  }
  useEffect(() => {
    let live = true;
    const requestSequence = sequence;
    const current = ++requestSequence.current;
    request().then((feed) => {
      if (live && current === requestSequence.current) { setData(feed); setError(""); setLoginRequired(false); }
    }).catch((e: unknown) => {
      if (live && current === requestSequence.current) { setError(e instanceof Error ? e.message : "Notifikasi belum dapat dimuat."); setLoginRequired(needsLogin(e)); }
    });
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(refresh, 45000);
    document.addEventListener("visibilitychange", refresh);
    return () => { live = false; ++requestSequence.current; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }
  async function mark(ids: string[], href?: string) {
    if (!ids.length || busy) return;
    setBusy(true); setError(""); setNotice(""); ++sequence.current;
    try {
      await request({ action: "markRead", ids });
      if (href) { location.assign(href); return; }
      await load();
      setNotice(ids.length === 1 ? "Notifikasi ditandai sudah dibaca." : "Notifikasi dalam daftar ditandai sudah dibaca.");
    } catch (e) { setError(e instanceof Error ? e.message : "Status baca belum tersimpan."); setLoginRequired(needsLogin(e)); if (needsLogin(e)) setData(null); }
    finally { setBusy(false); }
  }
  function open(e: React.MouseEvent<HTMLAnchorElement>, item: NotificationItem) {
    if (item.readAt || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); void mark([item.id], item.href);
  }
  const unread = data?.items.filter((n) => !n.readAt) || [];
  const items = data?.items.filter((n) => filter === "all" || !n.readAt) || [];
  return <div className="account-app">
    <a className="account-skip" href="#notifications-main">Lewati ke konten</a>
    <header className="notification-header">
      <Link className="account-brand" href="/"><span><Layers3 size={24} /></span><b>Ruang<span> STEM</span></b></Link>
      <nav aria-label="Navigasi notifikasi"><a href="/dashboard">Dashboard</a><a href="/classes">Kelas & Tutor</a><a href="/access">Akses akun</a><a href="/logout"><LogOut size={17} />Keluar</a></nav>
    </header>
    <main className="notification-main" id="notifications-main">
      <div className="account-page-heading"><div><div className="eyebrow teal">KABAR UNTUK ANDA</div><h1><Bell size={29} /> Notifikasi</h1><p>Ikuti tugas, review, kabar kelas, dan pengingat sesi Anda.</p></div><button className="secondary" type="button" disabled={refreshing || busy} onClick={refresh}><RefreshCw size={17} className={refreshing ? "spin" : undefined} />Muat ulang</button></div>
      {error && <div className="feedback warning" role="alert">{error} {loginRequired && <a href="/login?return_to=%2Fnotifications">Masuk kembali</a>}</div>}
      {notice && <p className="feedback success" role="status">{notice}</p>}
      {!data && !error && <p role="status"><Loader2 className="spin" size={19} /> Memuat notifikasi…</p>}
      {data && <>
        <div className="notification-toolbar"><div className="account-filter" role="group" aria-label="Filter notifikasi"><button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Semua ({data.items.length})</button><button type="button" aria-pressed={filter === "unread"} className={filter === "unread" ? "selected" : ""} onClick={() => setFilter("unread")}>Belum dibaca ({data.unreadCount})</button></div><button type="button" className="secondary" disabled={!unread.length || busy} onClick={() => void mark(unread.map((n) => n.id))}><CheckCheck size={18} />Tandai semua dibaca</button></div>
        <p className="notification-help">Menampilkan hingga {data.limit} notifikasi terbaru. Pengingat sesi muncul mulai 24 jam sebelum jadwal. Daftar diperbarui saat halaman terbuka.</p>
        {!items.length ? <div className="account-empty"><Bell size={30} /><h2>{filter === "unread" ? "Semua notifikasi sudah dibaca" : "Belum ada notifikasi"}</h2><p>{filter === "unread" ? "Pilih Semua untuk melihat notifikasi lainnya." : "Kabar baru akan muncul setelah ada aktivitas yang terkait dengan akun Anda."}</p></div> : <div className="notification-list">
          {items.map((n) => <article key={n.id} className={n.readAt ? "notification-card read" : "notification-card unread"}>
            <div className="notification-meta"><span className="pill">{labels[n.kind]}</span>{!n.readAt && <span className="notification-unread-label">Belum dibaca</span>}<time dateTime={n.createdAt}>{date(n.createdAt)}</time></div>
            <h2>{n.title}</h2><p>{n.description}</p>
            <div className="notification-actions"><a className="primary button-link" href={n.href} onClick={(e) => open(e, n)}>Buka <ArrowUpRight size={16} /></a>{!n.readAt && <button className="secondary" type="button" disabled={busy} onClick={() => void mark([n.id])}><CheckCheck size={17} />Tandai dibaca</button>}</div>
          </article>)}
        </div>}
      </>}
    </main>
  </div>;
}
