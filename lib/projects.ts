import { z } from "zod";
import { classAccess, ClassError, type ClassUser } from "./classes.ts";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Tautan proyek harus HTTPS tanpa kredensial.");
export const assignmentSchema = z
  .object({
    id,
    classId: id,
    version: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(160),
    instructions: z.string().trim().min(1).max(8000),
    dueAt: z.string().datetime().nullable(),
    status: z.enum(["draft", "published", "closed"]),
  })
  .strict();
export const projectMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("saveAssignment"),
      assignment: assignmentSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("submit"),
      id,
      assignmentId: id,
      assignmentVersion: z.number().int().positive(),
      previousId: id.nullable(),
      previousVersion: z.number().int().nonnegative(),
      body: z
        .string()
        .trim()
        .min(1, "Jelaskan hasil pekerjaan Anda.")
        .max(10000),
      url,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      submissionId: id,
      version: z.number().int().positive(),
      status: z.enum(["accepted", "changes_requested"]),
      feedback: z
        .string()
        .trim()
        .min(1, "Tuliskan feedback untuk peserta.")
        .max(8000),
      score: z.number().int().min(0).max(100).nullable(),
    })
    .strict(),
]);
const activeStaff = `EXISTS(SELECT 1 FROM cohorts c WHERE c.id=a.class_id AND c.status!='archived' AND (?='owner' OR c.mentor_id=?))`;
const activeMember = `EXISTS(SELECT 1 FROM cohorts c JOIN cohort_members m ON m.class_id=c.id AND m.user_id=? AND m.status='approved' WHERE c.id=a.class_id AND c.status!='archived')`;
export async function projectList(
  d: D1Database,
  u: ClassUser,
  classId: string,
) {
  const { staff } = await classAccess(d, u, classId, "member");
  const tasks = (
    await d
      .prepare(
        `SELECT id,class_id AS classId,title,instructions,due_at AS dueAt,status,version FROM class_assignments WHERE class_id=? AND (?=1 OR status!='draft') ORDER BY created_at DESC`,
      )
      .bind(classId, staff ? 1 : 0)
      .all()
  ).results;
  const submissions = (
    await d
      .prepare(
        `SELECT s.id,s.assignment_id AS assignmentId,s.student_id AS studentId,n.name AS studentName,s.attempt,s.assignment_version AS assignmentVersion,s.instructions,s.body,s.url,s.submitted_at AS submittedAt,s.late,s.status,s.feedback,s.score,s.reviewer_name AS reviewerName,s.reviewed_at AS reviewedAt,s.version FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN users n ON n.id=s.student_id WHERE a.class_id=? AND (?=1 OR (s.student_id=? AND a.status!='draft')) ORDER BY s.submitted_at DESC,s.attempt DESC`,
      )
      .bind(classId, staff ? 1 : 0, u.id)
      .all()
  ).results;
  return { tasks, submissions, staff };
}
export async function saveAssignment(
  d: D1Database,
  u: ClassUser,
  raw: unknown,
) {
  const a = assignmentSchema.parse(raw);
  await classAccess(d, u, a.classId, "staff");
  let r;
  if (!a.version) {
    r = await d
      .prepare(
        `INSERT INTO class_assignments(id,class_id,title,instructions,due_at,status,version,created_at) SELECT ?,?,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM cohorts c WHERE c.id=? AND c.status!='archived' AND (?='owner' OR c.mentor_id=?)) AND (SELECT count(*) FROM class_assignments WHERE class_id=?)<100`,
      )
      .bind(
        a.id,
        a.classId,
        a.title,
        a.instructions,
        a.dueAt,
        a.status,
        new Date().toISOString(),
        a.classId,
        u.role,
        u.id,
        a.classId,
      )
      .run();
  } else {
    r = await d
      .prepare(
        `UPDATE class_assignments AS a SET title=?,instructions=?,due_at=?,status=?,version=version+1 WHERE id=? AND class_id=? AND version=? AND ${activeStaff} AND (?!='draft' OR NOT EXISTS(SELECT 1 FROM project_submissions WHERE assignment_id=a.id))`,
      )
      .bind(
        a.title,
        a.instructions,
        a.dueAt,
        a.status,
        a.id,
        a.classId,
        a.version,
        u.role,
        u.id,
        a.status,
      )
      .run();
  }
  if (!r.meta.changes)
    throw new ClassError(
      409,
      "Tugas berubah, kelas diarsipkan, atau batas tugas tercapai. Tugas yang sudah menerima kiriman tidak dapat menjadi draft.",
    );
  return { id: a.id };
}
export async function submitProject(d: D1Database, u: ClassUser, raw: unknown) {
  const b = projectMutation.parse(raw);
  if (b.action !== "submit") throw new ClassError(400, "Aksi tidak sesuai.");
  const a = await d
    .prepare("SELECT class_id FROM class_assignments WHERE id=?")
    .bind(b.assignmentId)
    .first<{ class_id: string }>();
  if (!a) throw new ClassError(404, "Tugas tidak ditemukan.");
  await classAccess(d, u, a.class_id, "member");
  // One statement rechecks membership, task version and the latest review before retaining a new immutable attempt.
  const r = await d
    .prepare(
      `INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at,late,status,feedback,version)
 SELECT ?,a.id,?,COALESCE((SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?),0)+1,a.version,a.instructions,?,?,?,CASE WHEN a.due_at IS NOT NULL AND a.due_at<? THEN 1 ELSE 0 END,'submitted','',1
 FROM class_assignments a WHERE a.id=? AND a.version=? AND a.status='published' AND ${activeMember}
 AND (SELECT count(*) FROM project_submissions WHERE assignment_id=a.id AND student_id=?)<20
 AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM project_submissions WHERE assignment_id=a.id AND student_id=?)) OR EXISTS(SELECT 1 FROM project_submissions p WHERE p.id=? AND p.assignment_id=a.id AND p.student_id=? AND p.version=? AND p.status='changes_requested' AND p.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?)))`,
    )
    .bind(
      b.id,
      u.id,
      u.id,
      b.body,
      b.url,
      new Date().toISOString(),
      new Date().toISOString(),
      b.assignmentId,
      b.assignmentVersion,
      u.id,
      u.id,
      b.previousId,
      u.id,
      b.previousId,
      u.id,
      b.previousVersion,
      u.id,
    )
    .run();
  if (!r.meta.changes)
    throw new ClassError(
      409,
      "Kiriman belum dapat disimpan. Muat ulang: tugas mungkin berubah/ditutup, keanggotaan berakhir, atau kiriman sebelumnya masih ditinjau. Maksimal 20 versi.",
    );
  return { id: b.id };
}
export async function reviewProject(d: D1Database, u: ClassUser, raw: unknown) {
  const b = projectMutation.parse(raw);
  if (b.action !== "review") throw new ClassError(400, "Aksi tidak sesuai.");
  const a = await d
    .prepare(
      "SELECT a.class_id FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id WHERE s.id=?",
    )
    .bind(b.submissionId)
    .first<{ class_id: string }>();
  if (!a) throw new ClassError(404, "Kiriman tidak ditemukan.");
  await classAccess(d, u, a.class_id, "staff");
  const r = await d
    .prepare(
      `UPDATE project_submissions AS s SET status=?,feedback=?,score=?,reviewer_name=?,reviewed_at=?,version=version+1 WHERE id=? AND version=? AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=s.assignment_id AND student_id=s.student_id) AND EXISTS(SELECT 1 FROM class_assignments a WHERE a.id=s.assignment_id AND ${activeStaff} AND EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=a.class_id AND m.user_id=s.student_id AND m.status='approved'))`,
    )
    .bind(
      b.status,
      b.feedback,
      b.score,
      u.name,
      new Date().toISOString(),
      b.submissionId,
      b.version,
      u.role,
      u.id,
    )
    .run();
  if (!r.meta.changes)
    throw new ClassError(
      409,
      "Kiriman atau hak akses berubah. Muat ulang sebelum menilai kembali.",
    );
  return { ok: true };
}
