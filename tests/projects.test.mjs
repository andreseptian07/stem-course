import {seedSqlitePrincipal} from "./authorization-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { sampleCourse } from "../lib/seed.ts";
import { saveClass, setMembership, saveClassSession } from "../lib/classes.ts";
import { tutorDashboard } from "../lib/tutor-dashboard.ts";
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
  sql.prepare("INSERT INTO settings(key,value) VALUES('owner','owner')").run();
  seedSqlitePrincipal(sql,"owner","staff");
  seedSqlitePrincipal(sql,"mentor","staff",["tutor"]);
  seedSqlitePrincipal(sql,"other","staff",["tutor"]);
  seedSqlitePrincipal(sql,"alice","student");
  seedSqlitePrincipal(sql,"bob","student");
  return { d, sql, ...users };
}
async function fixture() {
  const f = setup();
  await saveClass(f.d, f.owner, {
    id: "class-a",
    version: 0,
    courseId: sampleCourse.id,
    mentorId: "mentor",
    targetGrantVersion: 1,
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
test("teaching dashboard scopes assignments and never returns private submission contents", async () => {
  const { d, sql, owner, mentor, other, alice } = await fixture();
  try {
    await saveAssignment(d, mentor, task());
    await submitProject(d, alice, submit());
    const dashboard = await tutorDashboard(d, mentor);
    assert.equal(dashboard.classes.length, 1);
    assert.equal(dashboard.classes[0].studentCount, 2);
    assert.equal(dashboard.classes[0].pendingCount, 1);
    assert.equal(dashboard.pendingCount, 1);
    assert.equal(dashboard.reviews[0].studentName, "alice");
    assert.equal(dashboard.reviews[0].late, true);
    for (const key of ["body", "url", "feedback", "instructions", "score", "studentId"])
      assert.equal(key in dashboard.reviews[0], false);
    assert.equal(await tutorDashboard(d, alice), null);
    assert.deepEqual(await tutorDashboard(d, { ...other, role: "tutor" }), {
      classes: [], reviews: [], pendingCount: 0, sessions: [],
    });
    assert.equal((await tutorDashboard(d, owner)).pendingCount, 1);
    sql.prepare("UPDATE cohorts SET mentor_id=? WHERE id=?").run(other.id, "class-a");
    assert.equal((await tutorDashboard(d, { ...mentor, role: "tutor" })).pendingCount, 0);
    assert.equal((await tutorDashboard(d, other)).pendingCount, 1);
  } finally { sql.close(); }
});
test("teaching queue follows latest review, membership and archive state, including closed tasks", async () => {
  const { d, sql, owner, mentor, alice } = await fixture();
  try {
    await saveAssignment(d, mentor, task());
    await submitProject(d, alice, submit());
    await reviewProject(d, mentor, review());
    assert.equal((await tutorDashboard(d, mentor)).pendingCount, 0);
    await submitProject(d, alice, submit("s-new", { previousId: "s-a", previousVersion: 2 }));
    assert.deepEqual((await tutorDashboard(d, mentor)).reviews.map((r) => [r.id, r.attempt]), [["s-new", 2]]);
    await saveAssignment(d, mentor, { ...task("closed"), version: 1 });
    assert.equal((await tutorDashboard(d, mentor)).pendingCount, 1);
    await setMembership(d, owner, "class-a", alice.id, "removed");
    assert.equal((await tutorDashboard(d, mentor)).pendingCount, 0);
    await setMembership(d, owner, "class-a", alice.id, "approved");
    await reviewProject(d, mentor, review({ submissionId: "s-new", status: "accepted" }));
    assert.equal((await tutorDashboard(d, mentor)).pendingCount, 0);
    sql.prepare("UPDATE cohorts SET status='archived' WHERE id=?").run("class-a");
    assert.deepEqual((await tutorDashboard(d, owner)).classes, []);
  } finally { sql.close(); }
});
test("teaching agenda includes ongoing sessions, excludes ended and unassigned sessions", async () => {
  const { d, sql, owner, mentor, other } = await fixture();
  try {
    const session = { id: "teaching-session", classId: "class-a", version: 0, title: "Sesi kelas", kind: "online", startsAt: "2099-01-01T00:00:00.000Z", duration: 60, location: "", url: "https://example.com/private-meeting" };
    await saveClassSession(d, mentor, session);
    const now = "2099-01-01T00:30:00.000Z";
    const dashboard = await tutorDashboard(d, mentor, now);
    assert.equal(dashboard.sessions.length, 1);
    assert.equal(dashboard.sessions[0].classId, "class-a");
    assert.equal("url" in dashboard.sessions[0], false);
    assert.equal((await tutorDashboard(d, owner, now)).sessions.length, 1);
    assert.equal((await tutorDashboard(d, { ...other, role: "tutor" }, now)).sessions.length, 0);
    assert.equal((await tutorDashboard(d, mentor, "2099-01-01T01:00:00.000Z")).sessions.length, 0);
    sql.prepare("UPDATE cohorts SET status='archived' WHERE id=?").run("class-a");
    assert.equal((await tutorDashboard(d, owner, now)).sessions.length, 0);
  } finally { sql.close(); }
});
test("teaching review payload is bounded while totals include the whole queue", async () => {
  const { d, sql, mentor, alice } = await fixture();
  try {
    for (let i = 0; i < 51; i++) {
      const suffix = String(i).padStart(2, "0");
      await saveAssignment(d, mentor, { ...task(), id: `task-${suffix}` });
      await submitProject(d, alice, submit(`submission-${suffix}`, { assignmentId: `task-${suffix}` }));
    }
    const dashboard = await tutorDashboard(d, mentor);
    assert.equal(dashboard.pendingCount, 51);
    assert.equal(dashboard.classes[0].pendingCount, 51);
    assert.equal(dashboard.reviews.length, 50);
    assert.equal(dashboard.reviews[0].id, "submission-00");
    assert.equal(dashboard.reviews.at(-1).id, "submission-49");
  } finally { sql.close(); }
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
    (e) => e.status === 404,
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
    (e) => e.status === 404,
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
    (e) => e.status === 404,
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
  // Staff have no personal learner capability, including an empty dashboard.
  await assert.rejects(dashboardProjects(f.d, f.mentor), e => e.status === 403);
  await assert.rejects(dashboardProjects(f.d, f.owner), e => e.status === 403);
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

test("private attachment lifecycle binds only owned files and preserves immutable attempt history", async () => {
  const {uploadProjectFile,downloadProjectFile,removeProjectFile} = await import("../lib/project-files.ts");
  const {mkdtemp,rm} = await import("node:fs/promises");
  const {tmpdir} = await import("node:os");
  const root=await mkdtemp(tmpdir()+"/stem-upload-");
  const old=process.env.UPLOAD_STORAGE_DIR;process.env.UPLOAD_STORAGE_DIR=root;
  const f=await fixture();
  try {
    await saveAssignment(f.d,f.owner,task());
    const file=await uploadProjectFile(f.d,f.alice,"task-a","../laporan.txt",Buffer.from("Hasil praktikum"));
    assert.equal(file.name,"laporan.txt");
    assert.equal((await projectList(f.d,f.mentor,"class-a")).files.length,0);
    assert.equal((await downloadProjectFile(f.d,f.alice,file.id)).bytes.toString(),"Hasil praktikum");
    await assert.rejects(downloadProjectFile(f.d,f.bob,file.id),e=>e.status===404);
    await assert.rejects(downloadProjectFile(f.d,f.mentor,file.id),e=>e.status===404);
    await assert.rejects(submitProject(f.d,f.bob,submit("bob-file",{attachmentIds:[file.id]})),e=>e.status===409);
    assert.equal(f.sql.prepare("SELECT submission_id FROM project_files WHERE id=?").get(file.id).submission_id,null);
    await assert.rejects(submitProject(f.d,f.alice,submit("stale-file",{assignmentVersion:99,attachmentIds:[file.id]})),e=>e.status===409);
    assert.equal(f.sql.prepare("SELECT submission_id FROM project_files WHERE id=?").get(file.id).submission_id,null);
    await submitProject(f.d,f.alice,submit("s-a",{attachmentIds:[file.id]}));
    assert.equal((await projectList(f.d,f.mentor,"class-a")).files.length,1);
    assert.equal((await downloadProjectFile(f.d,f.mentor,file.id)).bytes.toString(),"Hasil praktikum");
    await assert.rejects(removeProjectFile(f.d,f.alice,file.id),e=>e.status===404);
    await assert.rejects(uploadProjectFile(f.d,f.alice,"task-a","revisi.txt",Buffer.from("revisi")),e=>e.status===403);
    await reviewProject(f.d,f.mentor,review());
    await assert.rejects(submitProject(f.d,f.alice,submit("reuse",{previousId:"s-a",previousVersion:2,attachmentIds:[file.id]})),e=>e.status===409);
    const revision=await uploadProjectFile(f.d,f.alice,"task-a","revisi.txt",Buffer.from("Perbaikan"));
    await submitProject(f.d,f.alice,submit("revised",{previousId:"s-a",previousVersion:2,attachmentIds:[revision.id]}));
    assert.equal(f.sql.prepare("SELECT submission_id FROM project_files WHERE id=?").get(file.id).submission_id,"s-a");
    assert.equal(f.sql.prepare("SELECT submission_id FROM project_files WHERE id=?").get(revision.id).submission_id,"revised");
    await setMembership(f.d,f.owner,"class-a","alice","removed");
    await assert.rejects(downloadProjectFile(f.d,f.alice,file.id),e=>e.status===404);
    f.sql.prepare("UPDATE cohorts SET mentor_id='other' WHERE id='class-a'").run();
    await assert.rejects(downloadProjectFile(f.d,f.mentor,file.id),e=>e.status===404);
    assert.equal((await downloadProjectFile(f.d,f.owner,file.id)).size,Buffer.byteLength("Hasil praktikum"));
    await assert.rejects(downloadProjectFile(f.d,f.owner,file.id,{UPLOAD_STORAGE_DIR:root,APP_URL:"https://example.com"}),e=>e.status===404);
  } finally {f.sql.close();await rm(root,{recursive:true,force:true});if(old===undefined)delete process.env.UPLOAD_STORAGE_DIR;else process.env.UPLOAD_STORAGE_DIR=old;}
});
test("upload limit, failed partial claims and deletion keep draft capacity available", async () => {
  const {uploadProjectFile,removeProjectFile} = await import("../lib/project-files.ts");
  const {mkdtemp,rm}=await import("node:fs/promises");const {tmpdir}=await import("node:os");const root=await mkdtemp(tmpdir()+"/stem-upload-");const old=process.env.UPLOAD_STORAGE_DIR;process.env.UPLOAD_STORAGE_DIR=root;
  const f=await fixture();
  try {
    await saveAssignment(f.d,f.owner,task());
    const files=[];for(let i=0;i<3;i++) files.push(await uploadProjectFile(f.d,f.alice,"task-a",`file${i}.txt`,Buffer.from("test")));
    await assert.rejects(uploadProjectFile(f.d,f.alice,"task-a","extra.txt",Buffer.from("test")),e=>e.status===409);
    await assert.rejects(submitProject(f.d,f.alice,submit("partial",{attachmentIds:[files[0].id,"missing"]})),e=>e.status===409);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM project_files WHERE submission_id IS NOT NULL").get().n,0);
    await assert.rejects(removeProjectFile(f.d,f.bob,files[0].id),e=>e.status===404);
    await removeProjectFile(f.d,f.alice,files[0].id);
    await uploadProjectFile(f.d,f.alice,"task-a","again.txt",Buffer.from("test"));
    await assert.rejects(uploadProjectFile(f.d,f.other,"task-a","other.txt",Buffer.from("test")),e=>e.status===403);
    await assert.rejects(uploadProjectFile(f.d,f.alice,"task-a","bad.html",Buffer.from("test")),e=>e.status===415);
  } finally {f.sql.close();await rm(root,{recursive:true,force:true});if(old===undefined)delete process.env.UPLOAD_STORAGE_DIR;else process.env.UPLOAD_STORAGE_DIR=old;}
});
test("upload formats validate bytes independently of browser MIME and reject unsafe storage", async () => {
  const {inspectFile,fileStorage,FILE_LIMIT}=await import("../lib/project-files.ts");
  assert.equal(inspectFile("laporan.PDF",Buffer.from("%PDF-1.4\n%%EOF")).mime,"application/pdf");
  assert.equal(inspectFile("foto.png",Buffer.from([137,80,78,71,13,10,26,10])).mime,"image/png");
  assert.equal(inspectFile("foto.jpeg",Buffer.from([255,216,255,0])).mime,"image/jpeg");
  for(const [name,bytes] of [["x.pdf",Buffer.from("fake")],["x.svg",Buffer.from("<svg/>")],["x.txt",Buffer.from([0,1])],["x.txt",Buffer.from([255])]]) assert.throws(()=>inspectFile(name,bytes),e=>e.status===415);
  assert.throws(()=>inspectFile("x.txt",Buffer.alloc(FILE_LIMIT+1)),e=>e.status===413);
  assert.throws(()=>fileStorage({NODE_ENV:"production"}),e=>e.status===503);
  assert.throws(()=>fileStorage({UPLOAD_STORAGE_DIR:"public/files"}),e=>e.status===503);
  assert.equal(projectMutation.safeParse(submit("duplicate",{attachmentIds:["file","file"]})).success,false);
});
test("multipart body reads enforce byte limits even with forged content length", async () => {
  const {readRequestBytes}=await import("../lib/request-body.ts");
  const req=new Request("http://localhost",{method:"POST",headers:{"Content-Length":"1"},body:Buffer.alloc(21)});
  await assert.rejects(readRequestBytes(req,20),e=>e.status===413);
  assert.equal((await readRequestBytes(new Request("http://localhost",{method:"POST",body:"test"}),20)).length,4);
});
