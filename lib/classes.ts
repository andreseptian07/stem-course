import { z } from "zod";
import type { Course, Progress } from "./model";
import { dashboardCourse } from "./account.ts";
export type ClassUser = { id: string; name: string; role: string };
export class ClassError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const classSchema = z
  .object({
    id,
    version: z.number().int().nonnegative(),
    courseId: id,
    mentorId: id.nullable(),
    name: z.string().trim().min(1, "Nama kelas wajib diisi.").max(160),
    description: z.string().trim().max(2000),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    capacity: z.number().int().min(1).max(500),
    status: z.enum(["open", "active", "archived"]),
  })
  .strict()
  .refine(
    (c) =>
      !c.startsAt || !c.endsAt || Date.parse(c.endsAt) > Date.parse(c.startsAt),
    "Tanggal akhir harus setelah tanggal mulai.",
  );
export const sessionSchema = z
  .object({
    id,
    version: z.number().int().nonnegative(),
    classId: id,
    title: z.string().trim().min(1).max(160),
    kind: z.enum(["online", "offline"]),
    startsAt: z.string().datetime(),
    duration: z.number().int().min(15).max(480),
    location: z.string().trim().max(500),
    url: z.string().max(2000),
  })
  .strict()
  .superRefine((s, c) => {
    if (s.kind === "online") {
      try {
        const u = new URL(s.url);
        if (u.protocol !== "https:" || u.username || u.password) throw 0;
      } catch {
        c.addIssue({
          code: "custom",
          message: "Tautan meeting harus HTTPS tanpa kredensial.",
        });
      }
    }
    if (s.kind === "offline" && !s.location)
      c.addIssue({ code: "custom", message: "Isi lokasi tatap muka." });
  });
export type ClassForm = z.infer<typeof classSchema>;
const now = () => new Date().toISOString();
function requireOwner(u: ClassUser) {
  if (u.role !== "owner")
    throw new ClassError(
      403,
      "Hanya pengelola yang dapat mengatur kelas dan peserta.",
    );
}
export async function classAccess(
  d: D1Database,
  u: ClassUser,
  classId: string,
  mode: "summary" | "member" | "staff" = "member",
) {
  const c = await d
    .prepare(
      `SELECT c.*,json_extract(k.data,'$.title') AS course_title,json_extract(k.data,'$.published') AS published,k.data AS course_data,m.name AS mentor_name FROM cohorts c JOIN courses k ON k.id=c.course_id LEFT JOIN users m ON m.id=c.mentor_id WHERE c.id=?`,
    )
    .bind(classId)
    .first<any>();
  if (!c) throw new ClassError(404, "Kelas tidak ditemukan.");
  const member = await d
    .prepare("SELECT status FROM cohort_members WHERE class_id=? AND user_id=?")
    .bind(classId, u.id)
    .first<{ status: string }>();
  const staff = u.role === "owner" || c.mentor_id === u.id;
  if (mode === "staff" && !staff)
    throw new ClassError(
      403,
      "Anda tidak ditugaskan sebagai mentor kelas ini.",
    );
  if (mode === "member" && !staff && member?.status !== "approved")
    throw new ClassError(
      403,
      "Keanggotaan kelas perlu disetujui terlebih dahulu.",
    );
  if (
    mode === "summary" &&
    !staff &&
    member?.status !== "approved" &&
    (c.status !== "open" || !c.published)
  )
    throw new ClassError(404, "Kelas belum tersedia.");
  return { c, member, staff };
}
function summary(c: any, u: ClassUser) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    courseId: c.course_id,
    courseTitle: c.course_title,
    mentorName: c.mentor_name || "Mentor belum ditugaskan",
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    capacity: c.capacity,
    count: c.count,
    status: c.status,
    version: c.version,
    membership: c.membership || null,
    isMentor: c.mentor_id === u.id,
    isStaff: u.role === "owner" || c.mentor_id === u.id,
    published: !!c.published,
  };
}
export async function listClasses(d: D1Database, u: ClassUser) {
  const rows = await d
    .prepare(
      `SELECT c.*,json_extract(k.data,'$.title') AS course_title,json_extract(k.data,'$.published') AS published,m.name AS mentor_name,cm.status AS membership,(SELECT count(*) FROM cohort_members WHERE class_id=c.id AND status='approved') AS count FROM cohorts c JOIN courses k ON k.id=c.course_id LEFT JOIN users m ON m.id=c.mentor_id LEFT JOIN cohort_members cm ON cm.class_id=c.id AND cm.user_id=? WHERE ?='owner' OR c.mentor_id=? OR cm.status='approved' OR (c.status='open' AND json_extract(k.data,'$.published')=1) ORDER BY c.created_at DESC`,
    )
    .bind(u.id, u.role, u.id)
    .all<any>();
  const data: any = {
    user: u,
    classes: rows.results.map((c) => summary(c, u)),
  };
  if (u.role === "owner") {
    data.users = (
      await d
        .prepare(
          "SELECT u.id,u.name FROM users u JOIN user_access a ON a.user_id=u.id AND a.status='active' ORDER BY u.name",
        )
        .all()
    ).results;
    data.courses = (
      await d
        .prepare(
          "SELECT id,json_extract(data,'$.title') AS title,json_extract(data,'$.published') AS published FROM courses ORDER BY rowid",
        )
        .all()
    ).results;
  }
  return data;
}
export async function classDetail(
  d: D1Database,
  u: ClassUser,
  classId: string,
) {
  const { c, member, staff } = await classAccess(d, u, classId, "summary");
  const count = await d
    .prepare(
      "SELECT count(*) AS n FROM cohort_members WHERE class_id=? AND status='approved'",
    )
    .bind(classId)
    .first<{ n: number }>();
  const detail: any = {
    class: {
      ...summary({ ...c, count: count?.n, membership: member?.status }, u),
      ...(u.role === "owner" ? { mentorId: c.mentor_id } : {}),
    },
    user: u,
  };
  if (!staff && member?.status !== "approved") return detail;
  detail.posts = (
    await d
      .prepare(
        "SELECT id,name,role,kind,body,created_at AS createdAt FROM (SELECT rowid AS sequence,* FROM cohort_posts WHERE class_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at,sequence",
      )
      .bind(classId)
      .all()
  ).results;
  detail.sessions = (
    await d
      .prepare(
        "SELECT id,title,kind,starts_at AS startsAt,duration,location,url,version FROM cohort_sessions WHERE class_id=? ORDER BY starts_at",
      )
      .bind(classId)
      .all()
  ).results;
  detail.feedback = (
    await d
      .prepare(
        `SELECT f.id,f.student_id AS studentId,u.name AS studentName,f.mentor_name AS mentorName,f.body,f.created_at AS createdAt FROM cohort_feedback f JOIN users u ON u.id=f.student_id WHERE f.class_id=? AND (?=1 OR f.student_id=?) ORDER BY f.created_at DESC LIMIT 100`,
      )
      .bind(classId, staff ? 1 : 0, u.id)
      .all()
  ).results;
  if (staff) {
    const rows = (
      await d
        .prepare(
          "SELECT m.user_id AS userId,u.name,m.status,m.created_at AS createdAt FROM cohort_members m JOIN users u ON u.id=m.user_id WHERE m.class_id=? ORDER BY m.created_at DESC",
        )
        .bind(classId)
        .all<any>()
    ).results;
    const progressRows = (
      await d
        .prepare(
          "SELECT p.user_id AS userId,p.lesson_id AS lessonId,p.revision,p.complete,p.quiz_passed AS quizPassed,p.code_passed AS codePassed,p.quiz_attempts AS quizAttempts,p.code_attempts AS codeAttempts,p.score FROM progress p JOIN cohort_members m ON m.user_id=p.user_id AND m.class_id=? AND m.status='approved' WHERE p.course_id=?",
        )
        .bind(classId, c.course_id)
        .all<Progress & { userId: string }>()
    ).results;
    const course = JSON.parse(c.course_data) as Course;
    detail.members = rows.map((m) => {
      if (m.status !== "approved") return m;
      const p = progressRows.filter((p) => p.userId === m.userId),
        progress = dashboardCourse(course, p, null);
      return {
        ...m,
        progress: {
          percent: progress.percent,
          completed: progress.completed,
          total: course.lessons.length,
          stale: progress.stale,
        },
        lessons: course.lessons.map((l) => {
          const state = p.find(
            (p) => p.lessonId === l.id && p.revision === l.revision,
          );
          return {
            id: l.id,
            title: l.title,
            complete: !!state?.complete,
            quizPassed: !!state?.quizPassed,
            codePassed: !!state?.codePassed,
            quizAttempts: state?.quizAttempts || 0,
            codeAttempts: state?.codeAttempts || 0,
          };
        }),
      };
    });
  }
  return detail;
}
export async function saveClass(d: D1Database, u: ClassUser, form: unknown) {
  requireOwner(u);
  const c = classSchema.parse(form);
  const course = await d
    .prepare("SELECT id FROM courses WHERE id=?")
    .bind(c.courseId)
    .first();
  if (!course) throw new ClassError(404, "Course tidak ditemukan.");
  if (
    c.mentorId &&
    !(await d
      .prepare(
        "SELECT u.id FROM users u JOIN user_access a ON a.user_id=u.id AND a.status='active' WHERE u.id=?",
      )
      .bind(c.mentorId)
      .first())
  )
    throw new ClassError(
      400,
      "Akun mentor perlu mendapat persetujuan akses terlebih dahulu.",
    );
  const old = await d
    .prepare("SELECT course_id,version FROM cohorts WHERE id=?")
    .bind(c.id)
    .first<any>();
  if (old) {
    if (old.version !== c.version)
      throw new ClassError(409, "Kelas berubah. Muat ulang sebelum menyimpan.");
    if (old.course_id !== c.courseId)
      throw new ClassError(
        400,
        "Course kelas yang sudah dibuat tidak dapat diganti. Buat kelas baru.",
      );
    const r = await d
      .prepare(
        `UPDATE cohorts SET mentor_id=?,name=?,description=?,starts_at=?,ends_at=?,capacity=?,status=?,version=version+1 WHERE id=? AND version=? AND (SELECT count(*) FROM cohort_members WHERE class_id=? AND status='approved')<=?`,
      )
      .bind(
        c.mentorId,
        c.name,
        c.description,
        c.startsAt,
        c.endsAt,
        c.capacity,
        c.status,
        c.id,
        c.version,
        c.id,
        c.capacity,
      )
      .run();
    if (!r.meta.changes)
      throw new ClassError(
        409,
        "Kelas berubah atau kapasitas lebih kecil dari peserta yang disetujui.",
      );
  } else {
    if (c.version !== 0)
      throw new ClassError(409, "Kelas tidak ditemukan. Muat ulang.");
    await d
      .prepare(
        "INSERT INTO cohorts(id,course_id,mentor_id,name,description,starts_at,ends_at,capacity,status,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)",
      )
      .bind(
        c.id,
        c.courseId,
        c.mentorId,
        c.name,
        c.description,
        c.startsAt,
        c.endsAt,
        c.capacity,
        c.status,
        now(),
      )
      .run();
  }
  return { id: c.id };
}
export async function requestJoin(
  d: D1Database,
  u: ClassUser,
  classId: string,
) {
  const { c } = await classAccess(d, u, classId, "summary");
  if (c.status !== "open" || !c.published)
    throw new ClassError(409, "Pendaftaran kelas belum dibuka.");
  // Rejected or removed memberships cannot be re-created by the applicant.
  const prior = await d
    .prepare("SELECT status FROM cohort_members WHERE class_id=? AND user_id=?")
    .bind(classId, u.id)
    .first();
  if (prior) return { ok: true };
  const joined = await d
    .prepare(
      "INSERT OR IGNORE INTO cohort_members(class_id,user_id,status,created_at) SELECT ?,?,'pending',? WHERE EXISTS(SELECT 1 FROM cohorts c JOIN courses k ON k.id=c.course_id WHERE c.id=? AND c.status='open' AND json_extract(k.data,'$.published')=1 AND (SELECT count(*) FROM cohort_members WHERE class_id=c.id AND status='approved')<c.capacity)",
    )
    .bind(classId, u.id, now(), classId)
    .run();
  if (!joined.meta.changes)
    throw new ClassError(409, "Kelas penuh atau pendaftaran sudah ditutup.");
  return { ok: true };
}
export async function setMembership(
  d: D1Database,
  u: ClassUser,
  classId: string,
  userId: string,
  status: "approved" | "declined" | "removed",
) {
  requireOwner(u);
  const { c } = await classAccess(d, u, classId, "staff");
  if (c.status === "archived")
    throw new ClassError(
      409,
      "Kelas diarsipkan. Aktifkan kembali sebelum mengubah peserta.",
    );
  if (
    status === "approved" &&
    !(await d
      .prepare(
        "SELECT u.id FROM users u JOIN user_access a ON a.user_id=u.id AND a.status='active' WHERE u.id=?",
      )
      .bind(userId)
      .first())
  )
    throw new ClassError(404, "Akun peserta tidak ditemukan.");
  if (status === "approved") {
    // Atomic capacity check on the insertion; approved retries do not occupy a second seat.
    const r = await d
      .prepare(
        `INSERT INTO cohort_members(class_id,user_id,status,created_at) SELECT ?,?,'approved',? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND ((SELECT count(*) FROM cohort_members WHERE class_id=? AND status='approved')<capacity OR EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved'))) ON CONFLICT(class_id,user_id) DO UPDATE SET status='approved'`,
      )
      .bind(classId, userId, now(), classId, classId, classId, userId)
      .run();
    if (!r.meta.changes) throw new ClassError(409, "Kelas sudah penuh.");
    await d
      .prepare(
        "INSERT OR IGNORE INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)",
      )
      .bind(userId, c.course_id, now())
      .run();
  } else {
    const r = await d
      .prepare(
        "UPDATE cohort_members SET status=? WHERE class_id=? AND user_id=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived')",
      )
      .bind(status, classId, userId, classId)
      .run();
    if (!r.meta.changes)
      throw new ClassError(404, "Keanggotaan tidak ditemukan.");
  }
  return { ok: true };
}
export async function addPost(
  d: D1Database,
  u: ClassUser,
  classId: string,
  kind: "discussion" | "announcement",
  body: string,
) {
  const { c, staff } = await classAccess(d, u, classId, "member");
  if (c.status === "archived")
    throw new ClassError(409, "Kelas diarsipkan dan hanya dapat dibaca.");
  if (kind === "announcement" && !staff)
    throw new ClassError(
      403,
      "Pengumuman hanya dapat dibuat mentor atau pengelola.",
    );
  const id = crypto.randomUUID();
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const r = await d
    .prepare(
      `INSERT INTO cohort_posts(id,class_id,user_id,name,role,kind,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM cohort_posts WHERE user_id=? AND created_at>?)<10 AND EXISTS(SELECT 1 FROM cohorts c WHERE c.id=? AND c.status!='archived' AND (?='owner' OR c.mentor_id=? OR (?='discussion' AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=c.id AND user_id=? AND status='approved'))))`,
    )
    .bind(
      id,
      classId,
      u.id,
      u.name,
      staff ? (u.role === "owner" ? "owner" : "mentor") : "student",
      kind,
      body,
      now(),
      u.id,
      cutoff,
      classId,
      u.role,
      u.id,
      kind,
      u.id,
    )
    .run();
  if (!r.meta.changes)
    throw new ClassError(429, "Tunggu sebentar sebelum mengirim pesan lagi.");
  return { id };
}
export async function addFeedback(
  d: D1Database,
  u: ClassUser,
  classId: string,
  studentId: string,
  body: string,
) {
  const { c } = await classAccess(d, u, classId, "staff");
  if (c.status === "archived") throw new ClassError(409, "Kelas diarsipkan.");
  if (
    !(await d
      .prepare(
        "SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved'",
      )
      .bind(classId, studentId)
      .first())
  )
    throw new ClassError(
      403,
      "Feedback hanya untuk peserta aktif di kelas ini.",
    );
  const id = crypto.randomUUID();
  const inserted = await d
    .prepare(
      "INSERT INTO cohort_feedback(id,class_id,student_id,mentor_id,mentor_name,body,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?)) AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved')",
    )
    .bind(
      id,
      classId,
      studentId,
      u.id,
      u.name,
      body,
      now(),
      classId,
      u.role,
      u.id,
      classId,
      studentId,
    )
    .run();
  if (!inserted.meta.changes)
    throw new ClassError(
      409,
      "Keanggotaan atau penugasan mentor berubah. Muat ulang.",
    );
  return { id };
}
export async function saveClassSession(
  d: D1Database,
  u: ClassUser,
  form: unknown,
) {
  const s = sessionSchema.parse(form),
    { c } = await classAccess(d, u, s.classId, "staff");
  if (c.status === "archived") throw new ClassError(409, "Kelas diarsipkan.");
  if (Date.parse(s.startsAt) <= Date.now())
    throw new ClassError(400, "Pilih jadwal yang akan datang.");
  const old = await d
    .prepare("SELECT class_id,version FROM cohort_sessions WHERE id=?")
    .bind(s.id)
    .first<any>();
  if (old) {
    if (old.class_id !== s.classId)
      throw new ClassError(403, "Sesi tidak berasal dari kelas ini.");
    const r = await d
      .prepare(
        "UPDATE cohort_sessions SET title=?,kind=?,starts_at=?,duration=?,location=?,url=?,version=version+1 WHERE id=? AND class_id=? AND version=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?))",
      )
      .bind(
        s.title,
        s.kind,
        s.startsAt,
        s.duration,
        s.location,
        s.kind === "online" ? s.url : "",
        s.id,
        s.classId,
        s.version,
        s.classId,
        u.role,
        u.id,
      )
      .run();
    if (!r.meta.changes)
      throw new ClassError(
        409,
        "Jadwal berubah. Muat ulang sebelum menyimpan.",
      );
  } else {
    if (s.version !== 0) throw new ClassError(409, "Sesi tidak ditemukan.");
    const inserted = await d
      .prepare(
        "INSERT INTO cohort_sessions(id,class_id,title,kind,starts_at,duration,location,url,version) SELECT ?,?,?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?))",
      )
      .bind(
        s.id,
        s.classId,
        s.title,
        s.kind,
        s.startsAt,
        s.duration,
        s.location,
        s.kind === "online" ? s.url : "",
        s.classId,
        u.role,
        u.id,
      )
      .run();
    if (!inserted.meta.changes)
      throw new ClassError(
        409,
        "Penugasan mentor berubah atau kelas diarsipkan.",
      );
  }
  return { id: s.id };
}
export async function resetClassAttempts(
  d: D1Database,
  u: ClassUser,
  classId: string,
  studentId: string,
  lessonId: string,
) {
  const { c } = await classAccess(d, u, classId, "staff");
  if (c.status === "archived") throw new ClassError(409, "Kelas diarsipkan.");
  if (
    !(await d
      .prepare(
        "SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved'",
      )
      .bind(classId, studentId)
      .first())
  )
    throw new ClassError(403, "Peserta tidak aktif di kelas ini.");
  const lesson = (JSON.parse(c.course_data) as Course).lessons.find(
    (l) => l.id === lessonId,
  );
  if (!lesson) throw new ClassError(404, "Materi tidak ditemukan.");
  const r = await d
    .prepare(
      `UPDATE progress SET quiz_attempts=0,code_attempts=0 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? AND kind='code' AND state IN ('pending','submitting')) AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?)) AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved')`,
    )
    .bind(
      studentId,
      c.course_id,
      lessonId,
      lesson.revision,
      studentId,
      c.course_id,
      lessonId,
      classId,
      u.role,
      u.id,
      classId,
      studentId,
    )
    .run();
  if (!r.meta.changes)
    throw new ClassError(
      409,
      "Belum ada progres revisi saat ini atau pemeriksaan kode masih berjalan.",
    );
  return { ok: true };
}
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveClass"), class: classSchema }).strict(),
  z.object({ action: z.literal("requestJoin"), classId: id }).strict(),
  z
    .object({
      action: z.literal("membership"),
      classId: id,
      userId: id,
      status: z.enum(["approved", "declined", "removed"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("post"),
      classId: id,
      kind: z.enum(["discussion", "announcement"]),
      body: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("feedback"),
      classId: id,
      studentId: id,
      body: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({ action: z.literal("saveSession"), session: sessionSchema })
    .strict(),
  z
    .object({
      action: z.literal("resetAttempts"),
      classId: id,
      studentId: id,
      lessonId: id,
    })
    .strict(),
]);

export async function classAgenda(d: D1Database, u: ClassUser) {
  return (
    await d
      .prepare(
        `SELECT 'class-session:' || s.id AS id,c.course_id AS courseId,json_extract(k.data,'$.title') AS courseTitle,c.id AS classId,c.name AS className,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.url FROM cohort_sessions s JOIN cohorts c ON c.id=s.class_id JOIN courses k ON k.id=c.course_id WHERE c.status!='archived' AND (c.mentor_id=? OR EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=c.id AND m.user_id=? AND m.status='approved')) AND datetime(s.starts_at,'+' || s.duration || ' minutes')>datetime(?) ORDER BY s.starts_at`,
      )
      .bind(u.id, u.id, new Date().toISOString())
      .all()
  ).results;
}
