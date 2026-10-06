import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { sampleCourse } from "../lib/seed.ts";
import {
  classSchema,
  mutationSchema,
  listClasses,
  classDetail,
  classAccess,
  saveClass,
  requestJoin,
  setMembership,
  addPost,
  addFeedback,
  saveClassSession,
  resetClassAttempts,
} from "../lib/classes.ts";
function setup() {
  const sql = new DatabaseSync(":memory:");
  for (const f of fs
    .readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  const d = {
    prepare(q) {
      return {
        bind(...params) {
          return {
            async first() {
              return sql.prepare(q).get(...params) || null;
            },
            async all() {
              return { results: sql.prepare(q).all(...params) };
            },
            async run() {
              return {
                meta: {
                  changes: Number(sql.prepare(q).run(...params).changes),
                },
              };
            },
          };
        },
      };
    },
    async batch(items) {
      sql.exec("BEGIN");
      try {
        const r = [];
        for (const x of items) r.push(await x.run());
        sql.exec("COMMIT");
        return r;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const users = Object.fromEntries(
    ["owner", "mentor", "other", "alice", "bob"].map((id) => [
      id,
      { id, name: id, role: id === "owner" ? "owner" : "student" },
    ]),
  );
  for (const u of Object.values(users))
    sql
      .prepare("INSERT INTO users(id,name,role) VALUES(?,?,?)")
      .run(u.id, u.name, u.role);
  for (const u of Object.values(users))
    sql
      .prepare(
        "INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'active',1,'2026-01-01','2026-01-01')",
      )
      .run(u.id);
  sql
    .prepare("INSERT INTO courses(id,data,version) VALUES(?,?,1)")
    .run(sampleCourse.id, JSON.stringify(sampleCourse));
  return { d, sql, ...users };
}
const form = (id = "class-a", mentorId = "mentor") => ({
  id,
  version: 0,
  courseId: sampleCourse.id,
  mentorId,
  name: "Kelas STEM",
  description: "Belajar bersama",
  startsAt: null,
  endsAt: null,
  capacity: 1,
  status: "open",
});
test("strict inputs reject fabricated role, malformed dates, excessive capacity and unsafe meeting", () => {
  assert.equal(classSchema.safeParse(form()).success, true);
  for (const f of [
    { ...form(), role: "owner" },
    { ...form(), capacity: 501 },
    {
      ...form(),
      startsAt: "2027-01-02T00:00:00Z",
      endsAt: "2027-01-01T00:00:00Z",
    },
  ])
    assert.equal(classSchema.safeParse(f).success, false);
  assert.equal(
    mutationSchema.safeParse({
      action: "post",
      classId: "class-a",
      kind: "discussion",
      body: "hello",
      role: "mentor",
    }).success,
    false,
  );
  assert.equal(
    mutationSchema.safeParse({
      action: "saveSession",
      session: {
        id: "session",
        version: 0,
        classId: "class-a",
        title: "Live",
        kind: "online",
        startsAt: "2027-01-01T00:00:00Z",
        duration: 60,
        url: "javascript:alert(1)",
        location: "",
      },
    }).success,
    false,
  );
});
test("owner configures classes with optimistic versions; student cannot assign mentor", async () => {
  const { d, owner, alice, sql } = setup();
  await assert.rejects(
    () => saveClass(d, alice, form()),
    (e) => e.status === 403,
  );
  await saveClass(d, owner, form());
  await assert.rejects(
    () => saveClass(d, owner, form()),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => saveClass(d, owner, { ...form("class-b", "missing") }),
    (e) => e.status === 400,
  );
  await saveClass(d, owner, { ...form(), version: 1, name: "Changed" });
  assert.equal(sql.prepare("SELECT version FROM cohorts").get().version, 2);
});
test("joining needs approval; capacity checks and enrollment are idempotent", async () => {
  const { d, owner, alice, bob, sql } = setup();
  await saveClass(d, owner, form());
  await requestJoin(d, alice, "class-a");
  await requestJoin(d, alice, "class-a");
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM cohort_members").get().n,
    1,
  );
  const pending = await classDetail(d, alice, "class-a");
  assert.equal(pending.class.membership, "pending");
  for (const k of ["members", "posts", "sessions", "feedback"])
    assert.equal(k in pending, false);
  await assert.rejects(
    () => setMembership(d, alice, "class-a", "alice", "approved"),
    (e) => e.status === 403,
  );
  await setMembership(d, owner, "class-a", "alice", "approved");
  await setMembership(d, owner, "class-a", "alice", "approved");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM enrollments").get().n, 1);
  await assert.rejects(
    () => setMembership(d, owner, "class-a", "bob", "approved"),
    (e) => e.status === 409,
  );
  await assert.rejects(() =>
    saveClass(d, owner, { ...form(), version: 1, capacity: 0 }),
  );
  await setMembership(d, owner, "class-a", "alice", "removed");
  await requestJoin(d, alice, "class-a");
  assert.equal(
    sql.prepare("SELECT status FROM cohort_members").get().status,
    "removed",
  );
});
test("mentor has no authority outside assigned classes and loses access after reassignment", async () => {
  const { d, owner, mentor, other, alice } = setup();
  await saveClass(d, owner, form());
  await saveClass(d, owner, form("class-b", "other"));
  await setMembership(d, owner, "class-a", "alice", "approved");
  await assert.rejects(
    () => classAccess(d, mentor, "class-b", "staff"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => addFeedback(d, other, "class-a", "alice", "secret"),
    (e) => e.status === 403,
  );
  await addPost(d, mentor, "class-a", "announcement", "welcome");
  await saveClass(d, owner, { ...form(), version: 1, mentorId: "other" });
  await assert.rejects(
    () => addPost(d, mentor, "class-a", "announcement", "not allowed"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => addFeedback(d, mentor, "class-a", "alice", "not allowed"),
    (e) => e.status === 403,
  );
});
test("student sees own feedback, no roster, no other classmates private feedback or session in summaries", async () => {
  const { d, owner, mentor, alice, bob } = setup();
  await saveClass(d, owner, { ...form(), capacity: 2 });
  await setMembership(d, owner, "class-a", "alice", "approved");
  await setMembership(d, owner, "class-a", "bob", "approved");
  await addFeedback(d, mentor, "class-a", "alice", "alice-private");
  await addFeedback(d, mentor, "class-a", "bob", "bob-private");
  await saveClassSession(d, mentor, {
    id: "live",
    version: 0,
    classId: "class-a",
    title: "Consultation",
    kind: "online",
    startsAt: "2099-01-01T00:00:00Z",
    duration: 60,
    location: "",
    url: "https://example.com/secret-meeting",
  });
  const student = await classDetail(d, alice, "class-a");
  assert.equal(student.feedback.length, 1);
  assert.equal(student.feedback[0].body, "alice-private");
  assert.equal("members" in student, false);
  assert.equal(JSON.stringify(student).includes("bob-private"), false);
  assert.equal(
    JSON.stringify(await listClasses(d, bob)).includes("secret-meeting"),
    false,
  );
  assert.equal("users" in (await listClasses(d, mentor)), false);
  await assert.rejects(
    () => addPost(d, alice, "class-a", "announcement", "spoof"),
    (e) => e.status === 403,
  );
});
test("progress is revision-aware; reset never grants pass and blocks active code attempts", async () => {
  const { d, owner, mentor, alice, sql } = setup();
  await saveClass(d, owner, form());
  await setMembership(d, owner, "class-a", "alice", "approved");
  sql
    .prepare(
      "INSERT INTO progress(user_id,course_id,lesson_id,revision,complete,quiz_attempts) VALUES(?,?,?,?,?,?)",
    )
    .run("alice", sampleCourse.id, "sensor", 0, 1, 4);
  let roster = (await classDetail(d, mentor, "class-a")).members[0];
  assert.equal(roster.progress.percent, 0);
  assert.equal(roster.progress.stale, 1);
  await assert.rejects(
    () => resetClassAttempts(d, mentor, "class-a", "alice", "sensor"),
    (e) => e.status === 409,
  );
  sql.prepare("UPDATE progress SET revision=1,complete=0").run();
  await resetClassAttempts(d, mentor, "class-a", "alice", "sensor");
  assert.equal(
    sql.prepare("SELECT quiz_attempts,quiz_passed FROM progress").get()
      .quiz_attempts,
    0,
  );
  assert.equal(
    sql.prepare("SELECT quiz_passed FROM progress").get().quiz_passed,
    0,
  );
  sql
    .prepare(
      "INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at) VALUES('pending','alice',?,'sensor',1,'code','pending','{}',?)",
    )
    .run(sampleCourse.id, new Date().toISOString());
  await assert.rejects(
    () => resetClassAttempts(d, mentor, "class-a", "alice", "sensor"),
    (e) => e.status === 409,
  );
});
test("archive is read-only and membership revocation protects posts and feedback", async () => {
  const { d, owner, mentor, alice } = setup();
  await saveClass(d, owner, form());
  await setMembership(d, owner, "class-a", "alice", "approved");
  await addPost(d, alice, "class-a", "discussion", "hello");
  await addFeedback(d, mentor, "class-a", "alice", "private");
  await setMembership(d, owner, "class-a", "alice", "removed");
  const removed = await classDetail(d, alice, "class-a");
  assert.equal("posts" in removed, false);
  assert.equal("feedback" in removed, false);
  await assert.rejects(
    () => addPost(d, alice, "class-a", "discussion", "forbidden"),
    (e) => e.status === 403,
  );
  await saveClass(d, owner, { ...form(), version: 1, status: "archived" });
  await assert.rejects(
    () => addPost(d, mentor, "class-a", "announcement", "closed"),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => setMembership(d, owner, "class-a", "alice", "approved"),
    (e) => e.status === 409,
  );
  assert.equal((await classDetail(d, mentor, "class-a")).posts.length, 1);
});

test("membership and mentor changes at write time cannot bypass scoped permissions", async () => {
  const { d, sql, owner, mentor, alice, bob } = setup();
  await saveClass(d, owner, form());
  await setMembership(d, owner, "class-a", "alice", "approved");
  await assert.rejects(
    () => requestJoin(d, bob, "class-a"),
    (e) => e.status === 409,
  );
  const race = (match) => ({
    ...d,
    prepare(q) {
      if (q.includes(match))
        sql
          .prepare("UPDATE cohorts SET mentor_id='other' WHERE id='class-a'")
          .run();
      return d.prepare(q);
    },
  });
  await assert.rejects(() =>
    addPost(
      race("INSERT INTO cohort_posts"),
      mentor,
      "class-a",
      "announcement",
      "no access",
    ),
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM cohort_posts").get().n,
    0,
  );
  sql.prepare("UPDATE cohorts SET mentor_id='mentor'").run();
  await assert.rejects(() =>
    addFeedback(
      race("INSERT INTO cohort_feedback"),
      mentor,
      "class-a",
      "alice",
      "no access",
    ),
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM cohort_feedback").get().n,
    0,
  );
  sql.prepare("UPDATE cohorts SET mentor_id='mentor'").run();
  await assert.rejects(() =>
    saveClassSession(race("INSERT INTO cohort_sessions"), mentor, {
      id: "race-session",
      version: 0,
      classId: "class-a",
      title: "Forbidden",
      kind: "online",
      startsAt: "2099-01-01T00:00:00Z",
      duration: 60,
      location: "",
      url: "https://example.com/meeting",
    }),
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM cohort_sessions").get().n,
    0,
  );
  sql.prepare("UPDATE cohorts SET mentor_id='mentor'").run();
  sql
    .prepare(
      "INSERT INTO progress(user_id,course_id,lesson_id,revision,quiz_attempts) VALUES('alice',?,'sensor',1,3)",
    )
    .run(sampleCourse.id);
  await assert.rejects(() =>
    resetClassAttempts(
      race("UPDATE progress"),
      mentor,
      "class-a",
      "alice",
      "sensor",
    ),
  );
  assert.equal(
    sql.prepare("SELECT quiz_attempts FROM progress").get().quiz_attempts,
    3,
  );
});

test("dashboard agenda includes own class sessions and loses them when membership ends", async () => {
  const { classAgenda } = await import("../lib/classes.ts");
  const { d, owner, mentor, alice, bob } = setup();
  await saveClass(d, owner, form());
  await setMembership(d, owner, "class-a", "alice", "approved");
  await saveClassSession(d, mentor, {
    id: "own-session",
    version: 0,
    classId: "class-a",
    title: "Own meeting",
    kind: "online",
    startsAt: "2099-01-01T00:00:00Z",
    duration: 60,
    location: "",
    url: "https://example.com/private-class-a",
  });
  assert.equal((await classAgenda(d, alice)).length, 1);
  assert.equal((await classAgenda(d, mentor)).length, 1);
  assert.equal((await classAgenda(d, bob)).length, 0);
  await setMembership(d, owner, "class-a", "alice", "removed");
  assert.equal((await classAgenda(d, alice)).length, 0);
  await saveClass(d, owner, { ...form(), version: 1, status: "archived" });
  assert.equal((await classAgenda(d, mentor)).length, 0);
});
