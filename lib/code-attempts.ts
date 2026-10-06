import { databaseSql, type PlatformDatabase } from "./database.ts";
import {
  submitCode,
  pollCode,
  gradeCode,
  JudgeError,
  validateConfig,
} from "./judge.ts";
import type { JudgeConfig } from "./judge.ts";
import type { Lesson } from "./model";
export class CodeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const active = "state IN ('submitting','pending')";
export async function releaseAttempt(
  d: PlatformDatabase,
  id: string,
  userId: string,
) {
  // The database batch is transactional: the active state makes a refund happen at most once.
  await d.batch([
    d
      .prepare(
        `UPDATE progress SET code_attempts=${databaseSql(d, "max(0,code_attempts-1)", "GREATEST(0,code_attempts-1)")} WHERE user_id=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.id=? AND a.user_id=progress.user_id AND a.course_id=progress.course_id AND a.lesson_id=progress.lesson_id AND a.revision=progress.revision AND a.${active})`,
      )
      .bind(userId, id),
    d
      .prepare(
        `UPDATE attempts SET state='error',data=json_remove(data,'$.tokens','$.endpoint','$.hidden') WHERE id=? AND user_id=? AND ${active}`,
      )
      .bind(id, userId),
  ]);
}
async function digest(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function startAttempt(
  d: PlatformDatabase,
  cfg: JudgeConfig,
  userId: string,
  courseId: string,
  l: Lesson,
  source: string,
  id: string,
  fetcher: typeof fetch = fetch,
) {
  const hash = await digest(source),
    endpoint = await digest(validateConfig(cfg));
  const old = await d
    .prepare("SELECT * FROM attempts WHERE id=?")
    .bind(id)
    .first<any>();
  if (old) {
    const data = JSON.parse(old.data);
    if (
      old.user_id !== userId ||
      old.course_id !== courseId ||
      old.lesson_id !== l.id ||
      old.revision !== l.revision ||
      data.hash !== hash
    )
      throw new CodeError(
        409,
        "ID pengiriman sudah digunakan. Muat ulang dan coba lagi.",
      );
    return { id, state: old.state === "submitting" ? "pending" : old.state };
  }
  const now = Date.now(),
    cutoff = new Date(now - 300000).toISOString();
  const expired = await d
    .prepare(
      `SELECT id FROM attempts WHERE user_id=? AND kind='code' AND ${active} AND created_at<?`,
    )
    .bind(userId, cutoff)
    .all<{ id: string }>();
  for (const row of expired.results) await releaseAttempt(d, row.id, userId);
  const reservation = await d.batch([
    d
      .prepare(
        `INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at)
      SELECT ?,?,?,?,?,'code','submitting',?,? WHERE
      NOT EXISTS(SELECT 1 FROM attempts WHERE user_id=? AND kind='code' AND ${active})
      AND (SELECT count(*) FROM attempts WHERE user_id=? AND kind='code' AND created_at>?)<5
      AND (SELECT count(*) FROM attempts WHERE kind='code' AND ${active} AND created_at>?)<20
      AND EXISTS(SELECT 1 FROM progress WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR code_attempts<?))`,
      )
      .bind(
        id,
        userId,
        courseId,
        l.id,
        l.revision,
        JSON.stringify({ hash, endpoint }),
        new Date(now).toISOString(),
        userId,
        userId,
        new Date(now - 60000).toISOString(),
        cutoff,
        userId,
        courseId,
        l.id,
        l.revision,
        l.exercise!.maxAttempts,
        l.exercise!.maxAttempts,
      ),
    d
      .prepare(
        "UPDATE progress SET code_attempts=code_attempts+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND state='submitting')",
      )
      .bind(userId, courseId, l.id, l.revision, id),
  ]);
  if (!reservation[0].meta.changes)
    throw new CodeError(
      429,
      "Tunggu pemeriksaan yang sedang berjalan atau coba kembali dalam satu menit. Jika batas percobaan habis, hubungi mentor.",
    );
  try {
    const tokens = await submitCode(
      cfg,
      l.exercise!.language,
      source,
      l.exercise!.tests,
      fetcher,
    );
    await d
      .prepare(
        "UPDATE attempts SET state='pending',data=? WHERE id=? AND state='submitting'",
      )
      .bind(
        JSON.stringify({
          hash,
          endpoint,
          tokens,
          hidden: l.exercise!.tests.map((t) => t.hidden),
        }),
        id,
      )
      .run();
    return { id, state: "pending" };
  } catch {
    await releaseAttempt(d, id, userId);
    throw new JudgeError();
  }
}
export async function readAttempt(
  d: PlatformDatabase,
  cfg: JudgeConfig | null,
  userId: string,
  a: any,
  currentRevision: number | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (a.state === "finished")
    return {
      id: a.id,
      state: "finished",
      score: a.score,
      ...JSON.parse(a.data).result,
      stale: currentRevision !== a.revision,
    };
  const failure = {
    id: a.id,
    state: "error",
    error:
      "Pemeriksaan belum berhasil. Kuota percobaan dikembalikan; coba lagi.",
  };
  if (a.state === "error") return failure;
  if (!cfg || Date.now() - Date.parse(a.created_at) > 300000) {
    await releaseAttempt(d, a.id, userId);
    return failure;
  }
  if (a.state === "submitting") return { id: a.id, state: "pending" };
  const data = JSON.parse(a.data);
  if (data.endpoint !== (await digest(validateConfig(cfg)))) {
    await releaseAttempt(d, a.id, userId);
    return failure;
  }
  const lease = await d
    .prepare(
      "UPDATE attempts SET poll_at=? WHERE id=? AND user_id=? AND state='pending' AND poll_at<=?",
    )
    .bind(Date.now() + 16000, a.id, userId, Date.now())
    .run();
  if (!lease.meta.changes) return { id: a.id, state: "pending" };
  try {
    const output = gradeCode(
      await pollCode(cfg, data.tokens, fetcher),
      data.hidden,
    );
    if (!output) {
      await d
        .prepare("UPDATE attempts SET poll_at=? WHERE id=? AND state='pending'")
        .bind(Date.now() + 2000, a.id)
        .run();
      return { id: a.id, state: "pending" };
    }
    await d.batch([
      d
        .prepare(
          "UPDATE progress SET code_passed=1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND ?=1 AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND state='pending')",
        )
        .bind(
          userId,
          a.course_id,
          a.lesson_id,
          a.revision,
          output.passed && currentRevision === a.revision ? 1 : 0,
          a.id,
        ),
      d
        .prepare(
          "UPDATE attempts SET state='finished',score=?,data=? WHERE id=? AND state='pending'",
        )
        .bind(
          output.score,
          JSON.stringify({ hash: data.hash, result: output }),
          a.id,
        ),
    ]);
    return {
      id: a.id,
      state: "finished",
      ...output,
      stale: currentRevision !== a.revision,
    };
  } catch {
    await releaseAttempt(d, a.id, userId);
    return failure;
  }
}
