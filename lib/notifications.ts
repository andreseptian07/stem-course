import { createHash } from "node:crypto";
import { z } from "zod";
import { AccessError, type PlatformUser } from "./access.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { publishedSql, upcomingSessionSql } from "./database-sql.ts";
import type { NotificationFeed, NotificationItem, NotificationKind } from "./notification-model.ts";

const limit = 100;
type Candidate = Omit<NotificationItem, "id" | "readAt"> & { key: string };
const eventId = (key: string) => createHash("sha256").update(key).digest("hex");
const classLink = (id: string) => `/classes?class=${encodeURIComponent(id)}`;
const taskLink = (classId: string, taskId: string) => `${classLink(classId)}&task=${encodeURIComponent(taskId)}`;
const memberScope = "c.status!='archived' AND EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=c.id AND m.user_id=? AND m.status='approved')";
const staffScope = "c.status!='archived' AND (?='owner' OR c.mentor_id=?)";
const latestSubmission = "s.attempt=(SELECT max(latest.attempt) FROM project_submissions latest WHERE latest.assignment_id=s.assignment_id AND latest.student_id=s.student_id)";

// Read notifications from their authoritative records. Revoking class access
// immediately removes its private notifications without retaining copied data.
// Only read receipts are stored; keys include revisions where appropriate.
export async function notificationFeed(d: PlatformDatabase, u: PlatformUser, at = Date.now()): Promise<NotificationFeed> {
  const candidates: Candidate[] = [];
  function add(kind: NotificationKind, key: string, title: string, description: string, href: string, createdAt: string) {
    candidates.push({ kind, key, title, description, href, createdAt });
  }
  const access = (await d.prepare("SELECT id,status,created_at AS createdAt FROM access_events WHERE target_id=? ORDER BY created_at DESC,id DESC LIMIT 100")
    .bind(u.id).all<{ id: string; status: string; createdAt: string }>()).results;
  for (const e of access) add("access", `access:${e.id}`, e.status === "active" ? "Akses akun disetujui atau dipulihkan" : "Akses akun ditangguhkan", "Buka status akun untuk melihat akses belajar Anda.", "/access", e.createdAt);
  const invitations = await d.prepare("SELECT i.id,i.created_at AS createdAt FROM tutor_invitations i JOIN auth_credentials a ON a.email=i.email WHERE a.user_id=? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND i.created_by=(SELECT value FROM settings WHERE `key`='owner') ORDER BY i.created_at DESC LIMIT 100")
    .bind(u.id, at).all<{ id: string; createdAt: string }>();
  if (u.accessStatus !== "suspended") for (const i of invitations.results) add("invitation", `invite:${i.id}`, "Undangan Tutor tersedia", "Gunakan tautan aktivasi yang dibagikan Super Admin. Hubungi pengelola jika belum menerimanya.", "/access", i.createdAt);

  // Restricted accounts may see only their own account events, never class data.
  if (u.accessStatus === "active" || u.role === "owner") {
    const [grants, classes, tasks, reviews, submissions, announcements, sessions, courseSessions, pending] = await Promise.all([
      d.prepare("SELECT granted_at AS createdAt FROM tutor_accounts WHERE user_id=? AND active=1")
        .bind(u.id).all<{ createdAt: string }>(),
      d.prepare(`SELECT c.id,c.name,c.version,c.created_at AS createdAt FROM cohorts c WHERE c.mentor_id=? AND c.status!='archived' ORDER BY c.created_at DESC,c.id DESC LIMIT 100`)
        .bind(u.id).all<{ id: string; name: string; version: number; createdAt: string }>(),
      d.prepare(`SELECT a.id,a.title,a.version,a.created_at AS createdAt,c.id AS classId,c.name AS className FROM class_assignments a JOIN cohorts c ON c.id=a.class_id WHERE a.status='published' AND ${memberScope} ORDER BY a.created_at DESC,a.id DESC LIMIT 100`)
        .bind(u.id).all<{ id: string; title: string; version: number; createdAt: string; classId: string; className: string }>(),
      d.prepare(`SELECT s.id,s.status,s.version,s.reviewed_at AS createdAt,a.id AS taskId,a.title,c.id AS classId,c.name AS className FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN cohorts c ON c.id=a.class_id WHERE s.student_id=? AND s.status IN ('accepted','changes_requested') AND s.reviewed_at IS NOT NULL AND a.status!='draft' AND ${latestSubmission} AND ${memberScope} ORDER BY s.reviewed_at DESC,s.id DESC LIMIT 100`)
        .bind(u.id, u.id).all<{ id: string; status: string; version: number; createdAt: string; taskId: string; title: string; classId: string; className: string }>(),
      d.prepare(`SELECT s.id,s.submitted_at AS createdAt,a.id AS taskId,a.title,c.id AS classId,c.name AS className FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN cohorts c ON c.id=a.class_id WHERE s.status='submitted' AND ${latestSubmission} AND ${staffScope} AND EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=c.id AND m.user_id=s.student_id AND m.status='approved') ORDER BY s.submitted_at DESC,s.id DESC LIMIT 100`)
        .bind(u.role, u.id).all<{ id: string; createdAt: string; taskId: string; title: string; classId: string; className: string }>(),
      d.prepare(`SELECT p.id,p.created_at AS createdAt,c.id AS classId,c.name AS className FROM cohort_posts p JOIN cohorts c ON c.id=p.class_id WHERE p.kind='announcement' AND p.user_id!=? AND c.status!='archived' AND (?='owner' OR c.mentor_id=? OR EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=c.id AND m.user_id=? AND m.status='approved')) ORDER BY p.created_at DESC,p.id DESC LIMIT 100`)
        .bind(u.id, u.role, u.id, u.id).all<{ id: string; createdAt: string; classId: string; className: string }>(),
      d.prepare(`SELECT s.id,s.title,s.version,s.starts_at AS startsAt,c.id AS classId,c.name AS className FROM cohort_sessions s JOIN cohorts c ON c.id=s.class_id WHERE c.status!='archived' AND (?='owner' OR c.mentor_id=? OR EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=c.id AND m.user_id=? AND m.status='approved')) AND ${upcomingSessionSql(d)} ORDER BY s.starts_at,s.id LIMIT 100`)
        .bind(u.role, u.id, u.id, new Date(at).toISOString()).all<{ id: string; title: string; version: number; startsAt: string; classId: string; className: string }>(),
      d.prepare(`SELECT s.id,s.title,s.starts_at AS startsAt FROM sessions s JOIN rsvps r ON r.session_id=s.id JOIN courses k ON k.id=s.course_id WHERE r.user_id=? AND ${publishedSql(d, "k.data")} AND ${upcomingSessionSql(d)} ORDER BY s.starts_at,s.id LIMIT 100`)
        .bind(u.id, new Date(at).toISOString()).all<{ id: string; title: string; startsAt: string }>(),
      u.role === "owner" ? d.prepare("SELECT a.user_id AS id,a.created_at AS createdAt FROM user_access a WHERE a.status='pending' AND a.user_id!=? ORDER BY a.created_at DESC,a.user_id DESC LIMIT 100")
        .bind(u.id).all<{ id: string; createdAt: string }>() : Promise.resolve({ results: [] }),
    ]);
    for (const g of grants.results) add("invitation", `tutor:${g.createdAt}`, "Hak Tutor Anda aktif", "Buka dashboard untuk melihat penugasan dan jadwal mengajar.", "/dashboard", g.createdAt);
    for (const c of classes.results) add("class", `class:${c.id}:${c.version}`, "Penugasan kelas Anda", c.name, classLink(c.id), c.createdAt);
    for (const t of tasks.results) add("task", `task:${t.id}:${t.version}`, "Tugas tersedia: " + t.title, t.className, taskLink(t.classId, t.id), t.createdAt);
    for (const r of reviews.results) add("review", `review:${r.id}:${r.version}`, r.status === "accepted" ? "Tugas Anda diterima" : "Tugas Anda perlu direvisi", `${r.title} · ${r.className}`, taskLink(r.classId, r.taskId), r.createdAt);
    for (const s of submissions.results) add("submission", `submission:${s.id}`, "Kiriman tugas menunggu review", `${s.title} · ${s.className}`, taskLink(s.classId, s.taskId), s.createdAt);
    for (const p of announcements.results) add("announcement", `announcement:${p.id}`, "Pengumuman kelas", p.className, classLink(p.classId), p.createdAt);
    for (const s of sessions.results) {
      const starts = Date.parse(s.startsAt);
      if (starts <= at || starts > at + 24 * 60 * 60 * 1000) continue;
      const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(starts));
      add("reminder", `reminder:${s.id}:${s.version}:${s.startsAt}`, "Sesi kelas dalam 24 jam", `${s.title} · ${s.className} · ${time} WIB`, classLink(s.classId), new Date(starts - 24 * 60 * 60 * 1000).toISOString());
    }
    for (const s of courseSessions.results) {
      const starts = Date.parse(s.startsAt);
      if (starts <= at || starts > at + 24 * 60 * 60 * 1000) continue;
      const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(starts));
      add("reminder", `course-reminder:${s.id}:${s.startsAt}`, "Sesi Tutor dalam 24 jam", `${s.title} · ${time} WIB`, "/learn?view=sessions", new Date(starts - 24 * 60 * 60 * 1000).toISOString());
    }
    for (const p of pending.results) add("access", `pending:${p.id}:${p.createdAt}`, "Akun siswa menunggu persetujuan", "Tinjau identitas dan status akun melalui Kelola akses.", "/access", p.createdAt);
  }
  const newest = candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.key.localeCompare(b.key)).slice(0, limit);
  const ids = newest.map((n) => eventId(n.key));
  const receipts = ids.length ? (await d.prepare(`SELECT event_id AS id,read_at AS readAt FROM notification_reads WHERE user_id=? AND event_id IN (${ids.map(() => "?").join(",")})`)
    .bind(u.id, ...ids).all<{ id: string; readAt: string }>()).results : [];
  const reads = new Map(receipts.map((r) => [r.id, r.readAt]));
  const items = newest.map(({ key, ...n }) => ({ ...n, id: eventId(key), readAt: reads.get(eventId(key)) ?? null }));
  return { items, unreadCount: items.filter((n) => !n.readAt).length, limit };
}

export const notificationMutation = z.object({
  action: z.literal("markRead"),
  ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(limit).refine((ids) => new Set(ids).size === ids.length, "Notifikasi tidak boleh berulang."),
}).strict();

export async function markNotificationsRead(d: PlatformDatabase, u: PlatformUser, raw: unknown, at = Date.now()) {
  const { ids } = notificationMutation.parse(raw);
  const feed = await notificationFeed(d, u, at);
  const available = new Set(feed.items.map((n) => n.id));
  if (ids.some((id) => !available.has(id))) throw new AccessError(409, "Notifikasi sudah berubah atau tidak tersedia. Muat ulang daftar.");
  const readAt = new Date(at).toISOString();
  await d.batch(ids.map((id) => d.prepare(databaseSql(d,
    "INSERT OR IGNORE INTO notification_reads(user_id,event_id,read_at) VALUES(?,?,?)",
    "INSERT INTO notification_reads(user_id,event_id,read_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE event_id=event_id"))
    .bind(u.id, id, readAt)));
  return { ok: true };
}
