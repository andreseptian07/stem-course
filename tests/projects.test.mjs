import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { sampleCourse } from "../lib/seed.ts";
import { saveClass, setMembership } from "../lib/classes.ts";
import {
  saveAssignment,
  submitProject,
  reviewProject,
  projectList,
  projectMutation,
} from "../lib/projects.ts";
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
async function fixture() {
  const f = setup();
  await saveClass(f.d, f.owner, {
    id: "class-a",
    version: 0,
    courseId: sampleCourse.id,
    mentorId: "mentor",
    name: "STEM",
    description: "",
    startsAt: null,
    endsAt: null,
    capacity: 5,
    status: "open",
  });
  for (const id of ["alice", "bob"])
    await setMembership(f.d, f.owner, "class-a", id, "approved");
  return f;
}
const task = (status = "published") => ({
  id: "task-a",
  classId: "class-a",
  title: "Proyek sensor",
  instructions: "Jelaskan rangkaian dan hasil.",
  dueAt: "2020-01-01T00:00:00.000Z",
  status,
  version: 0,
});
const submit = (id = "s-a", extra = {}) => ({
  action: "submit",
  id,
  assignmentId: "task-a",
  assignmentVersion: 1,
  previousId: null,
  previousVersion: 0,
  body: "Hasil pembacaan sensor",
  url: "https://example.com/project",
  ...extra,
});
const review = (extra = {}) => ({
  action: "review",
  submissionId: "s-a",
  version: 1,
  status: "changes_requested",
  feedback: "Tambahkan analisis hasil.",
  score: 60,
  ...extra,
});
test("project input rejects fabricated actor, unsafe URLs and invalid grades", () => {
  assert.equal(
    projectMutation.safeParse({ ...submit(), studentId: "bob" }).success,
    false,
  );
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
  ])
    assert.equal(
      projectMutation.safeParse(submit("s-a", { url })).success,
      false,
    );
  assert.equal(
    projectMutation.safeParse(review({ score: 101 })).success,
    false,
  );
});
test("drafts are staff-only; submissions and reviews remain private to the student", async () => {
  const { d, mentor, other, alice, bob } = await fixture();
  await saveAssignment(d, mentor, task("draft"));
  assert.equal((await projectList(d, alice, "class-a")).tasks.length, 0);
  await assert.rejects(
    () => saveAssignment(d, alice, task()),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => saveAssignment(d, other, task()),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => submitProject(d, alice, submit()),
    (e) => e.status === 409,
  );
  await saveAssignment(d, mentor, { ...task(), version: 1 });
  await submitProject(d, alice, submit("s-a", { assignmentVersion: 2 }));
  await submitProject(d, bob, submit("s-b", { assignmentVersion: 2 }));
  assert.equal((await projectList(d, alice, "class-a")).submissions.length, 1);
  assert.equal((await projectList(d, bob, "class-a")).submissions[0].id, "s-b");
  assert.equal((await projectList(d, mentor, "class-a")).submissions.length, 2);
  await assert.rejects(
    () => reviewProject(d, alice, review()),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => projectList(d, other, "class-a"),
    (e) => e.status === 403,
  );
});
test("review and resubmission preserve immutable history and instruction snapshots", async () => {
  const { d, mentor, alice, sql } = await fixture();
  await saveAssignment(d, mentor, task());
  await submitProject(d, alice, submit());
  await assert.rejects(
    () => submitProject(d, alice, submit("s-duplicate")),
    (e) => e.status === 409,
  );
  await reviewProject(d, mentor, review());
  await assert.rejects(
    () => reviewProject(d, mentor, review({ status: "accepted" })),
    (e) => e.status === 409,
  );
  await saveAssignment(d, mentor, {
    ...task(),
    version: 1,
    instructions: "Instruksi baru",
  });
  await assert.rejects(
    () =>
      submitProject(
        d,
        alice,
        submit("s-new", { previousId: "s-a", previousVersion: 2 }),
      ),
    (e) => e.status === 409,
  );
  await submitProject(
    d,
    alice,
    submit("s-new", {
      assignmentVersion: 2,
      previousId: "s-a",
      previousVersion: 2,
    }),
  );
  await assert.rejects(
    () => reviewProject(d, mentor, review({ version: 2 })),
    (e) => e.status === 409,
  );
  await reviewProject(
    d,
    mentor,
    review({ submissionId: "s-new", status: "accepted", score: 90 }),
  );
  const history = (await projectList(d, alice, "class-a")).submissions;
  assert.equal(history.length, 2);
  assert.equal(history[0].status, "accepted");
  assert.equal(history[0].late, 1);
  assert.equal(history[1].instructions, task().instructions);
  assert.equal(history[0].instructions, "Instruksi baru");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM progress").get().n, 0);
  await assert.rejects(
    () => saveAssignment(d, mentor, { ...task("draft"), version: 2 }),
    (e) => e.status === 409,
  );
});
test("closing, archiving and membership revocation block new submissions and reviews", async () => {
  const { d, mentor, alice, owner, sql } = await fixture();
  await saveAssignment(d, mentor, task());
  await submitProject(d, alice, submit());
  await saveAssignment(d, mentor, { ...task("closed"), version: 1 });
  await reviewProject(d, mentor, review());
  await assert.rejects(
    () =>
      submitProject(
        d,
        alice,
        submit("s-2", {
          assignmentVersion: 2,
          previousId: "s-a",
          previousVersion: 2,
        }),
      ),
    (e) => e.status === 409,
  );
  await setMembership(d, owner, "class-a", "alice", "removed");
  await assert.rejects(
    () => projectList(d, alice, "class-a"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => reviewProject(d, mentor, review({ version: 2 })),
    (e) => e.status === 409,
  );
  await setMembership(d, owner, "class-a", "alice", "approved");
  sql.exec("UPDATE cohorts SET status='archived' WHERE id='class-a'");
  assert.equal((await projectList(d, alice, "class-a")).submissions.length, 1);
  await assert.rejects(
    () => reviewProject(d, mentor, review({ version: 2 })),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => saveAssignment(d, mentor, { ...task(), version: 2 }),
    (e) => e.status === 409,
  );
});
test("write-time authorization prevents a revoked mentor or student from saving", async () => {
  const f = await fixture();
  await saveAssignment(f.d, f.mentor, task());
  function raced(needle, sql) {
    return {
      ...f.d,
      prepare(q) {
        const p = f.d.prepare(q);
        if (!q.includes(needle)) return p;
        return {
          bind(...values) {
            const b = p.bind(...values);
            return {
              ...b,
              async run() {
                f.sql.exec(sql);
                return b.run();
              },
            };
          },
        };
      },
    };
  }
  const revoke = "UPDATE cohorts SET mentor_id='other' WHERE id='class-a'";
  await assert.rejects(
    () =>
      saveAssignment(raced("UPDATE class_assignments", revoke), f.mentor, {
        ...task(),
        version: 1,
      }),
    (e) => e.status === 409,
  );
  f.sql.exec("UPDATE cohorts SET mentor_id='mentor' WHERE id='class-a'");
  await assert.rejects(
    () =>
      submitProject(
        raced(
          "INSERT INTO project_submissions",
          "UPDATE cohort_members SET status='removed' WHERE user_id='alice'",
        ),
        f.alice,
        submit(),
      ),
    (e) => e.status === 409,
  );
  await setMembership(f.d, f.owner, "class-a", "alice", "approved");
  await submitProject(f.d, f.alice, submit());
  await assert.rejects(
    () =>
      reviewProject(
        raced("UPDATE project_submissions", revoke),
        f.mentor,
        review(),
      ),
    (e) => e.status === 409,
  );
  assert.equal(
    (await projectList(f.d, f.alice, "class-a")).submissions[0].status,
    "submitted",
  );
});

test("dashboard includes only joined class projects and the newest personal review without private contents", async () => {
  const { dashboardProjects } = await import("../lib/projects.ts");
  const f = await fixture();
  await saveAssignment(f.d, f.mentor, task());
  await saveAssignment(f.d, f.mentor, { ...task("draft"), id: "draft-task" });
  await submitProject(f.d, f.alice, submit());
  await reviewProject(f.d, f.mentor, review());
  await submitProject(f.d, f.bob, submit("bob-submission"));
  let rows = await dashboardProjects(f.d, f.alice, "2026-10-06T00:00:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "changes_requested");
  assert.equal(rows[0].score, 60);
  assert.equal(rows[0].needsWork, true);
  assert.equal(rows[0].overdue, true);
  for (const secret of [
    "body",
    "url",
    "instructions",
    "feedback",
    "studentId",
    "reviewerName",
  ])
    assert.equal(secret in rows[0], false);
  assert.equal((await dashboardProjects(f.d, f.bob))[0].status, "submitted");
  assert.equal((await dashboardProjects(f.d, f.mentor)).length, 0);
  assert.equal((await dashboardProjects(f.d, f.owner)).length, 0);
  await submitProject(
    f.d,
    f.alice,
    submit("s-new", { previousId: "s-a", previousVersion: 2 }),
  );
  rows = await dashboardProjects(f.d, f.alice);
  assert.equal(rows[0].attempt, 2);
  assert.equal(rows[0].score, null);
  assert.equal(rows[0].status, "submitted");
  assert.equal(rows[0].overdue, false);
  await reviewProject(
    f.d,
    f.mentor,
    review({ submissionId: "s-new", status: "accepted", score: 0 }),
  );
  rows = await dashboardProjects(f.d, f.alice);
  assert.equal(rows[0].score, 0);
  assert.equal(rows[0].status, "accepted");
  await setMembership(f.d, f.owner, "class-a", "alice", "removed");
  assert.equal((await dashboardProjects(f.d, f.alice)).length, 0);
  f.sql.exec("UPDATE cohorts SET status='archived' WHERE id='class-a'");
  assert.equal((await dashboardProjects(f.d, f.bob)).length, 0);
});
test("dashboard orders revisions and deadlines, and does not call closed tasks actionable", async () => {
  const { dashboardProjects } = await import("../lib/projects.ts");
  const f = await fixture();
  await saveAssignment(f.d, f.mentor, {
    ...task(),
    id: "work",
    dueAt: "2030-11-10T00:00:00Z",
  });
  await saveAssignment(f.d, f.mentor, {
    ...task(),
    id: "earlier",
    dueAt: "2030-11-01T00:00:00Z",
  });
  await saveAssignment(f.d, f.mentor, { ...task(), id: "no-due", dueAt: null });
  await saveAssignment(f.d, f.mentor, { ...task("closed"), id: "closed" });
  const rows = await dashboardProjects(f.d, f.alice, "2030-11-01T00:00:00Z");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["earlier", "work", "no-due", "closed"],
  );
  assert.equal(rows[0].overdue, false);
  assert.equal(rows[2].overdue, false);
  assert.equal(rows[3].needsWork, false);
});
