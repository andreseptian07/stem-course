"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import "./notifications.css";

export default function NotificationLink({ onClick }: { onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store", signal: controller.signal });
        if (!response.ok) { if (live) setCount(null); return; }
        const data: { unreadCount: number } = await response.json();
        if (live) setCount(data.unreadCount);
      } catch { if (live) setCount(null); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 45000);
    document.addEventListener("visibilitychange", refresh);
    return () => { live = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <a className="notification-link" href="/notifications" onClick={onClick} aria-label={count ? `Notifikasi, ${count} belum dibaca dari 100 terbaru` : "Buka notifikasi"}>
    <Bell size={19} /><span>Notifikasi</span>{!!count && <b className="notification-badge">{count > 99 ? "99+" : count}</b>}
  </a>;
}
