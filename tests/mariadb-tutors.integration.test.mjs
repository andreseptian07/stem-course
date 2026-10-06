import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { createOwner, registerAccount, loginAccount, sessionUser } from "../lib/auth-data.ts";
import { registerIdentity, requireActive, updateAccess } from "../lib/access.ts";
import { createTutorInvitation, inspectTutorInvitation, activateTutorInvitation, revokeTutorInvitation, revokeTutor, tutorOverview } from "../lib/tutors.ts";
import { registrationEnabled, setRegistration } from "../lib/registration.ts";
import { sampleCourse } from "../lib/seed.ts";
import { seedCourse, saveCourse } from "../lib/course-data.ts";
import { saveClass, classAccess, saveClassSession } from "../lib/classes.ts";
import { saveAssignment } from "../lib/projects.ts";
import { accountData } from "../lib/account-data.ts";

test("tutor invitations and student registration use an isolated MariaDB database", { skip: process.env.MARIADB_INTEGRATION_TEST !== "true" }, async (t) => {
  assert.equal(process.env.DB_HOST, "127.0.0.1"); assert.equal(process.env.DB_NAME, "stem_ci");
  const root = createMariaDb();
  await root.pool.query("CREATE DATABASE stem_tutor_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"); await root.pool.end();
  const { pool, database: d } = createMariaDb({ ...process.env, DB_NAME: "stem_tutor_ci" });
  const env = { APP_URL: "https://course.ci.example" }, password = "CI-tutor-invitation-passphrase-only";
  let owner, tutor, signed, student, studentId, classA, classB, tutorToken;
  const token = (invitation) => new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("invite");
  const rejects = (status) => (e) => e.status === status;
  try {
    await applyMariaDbMigrations(pool);
    const setup = await createOwner(d, { email: "owner@tutor.ci.example", displayName: "Owner", password });
    owner = await registerIdentity(d, { userId: setup.userId, displayName: "Owner" }, false);
    await seedCourse(d, sampleCourse);
    const shape = { version: 0, courseId: sampleCourse.id, mentorId: null, description: "Invitation fixture", startsAt: null, endsAt: null, capacity: 10, status: "open" };
    classA = await saveClass(d, owner, { ...shape, id: "tutor-class-a", name: "Class A" });
    classB = await saveClass(d, owner, { ...shape, id: "tutor-class-b", name: "Class B" });
    await registerAccount(d, { email: "student@tutor.ci.example", displayName: "Student", password, courseId: sampleCourse.id }, true);
    const studentLogin = await loginAccount(d, { email: "student@tutor.ci.example", password });
    const studentSigned = await sessionUser(d, studentLogin.token); studentId = studentSigned.userId;
    student = await registerIdentity(d, studentSigned, false);
    await t.test("student course choice survives pending approval; drafts and client role injection stay rejected", async () => {
      assert.equal(student.accessStatus, "pending");
      assert.throws(() => requireActive(student), rejects(403));
      assert.equal((await d.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_id=? AND course_id=?").bind(studentId, sampleCourse.id).first()).n, 1);
      await updateAccess(d, owner, { userId: studentId, version: 1, status: "active", reason: "Approve fixture" });
      student = await registerIdentity(d, studentSigned, false); requireActive(student);
      assert.equal((await accountData(d, student)).courses[0].id, sampleCourse.id);
      await assert.rejects(() => registerAccount(d, { email: "forged@tutor.ci.example", displayName: "Forged", password, role: "tutor" }, true));
      await assert.rejects(() => registerAccount(d, { email: "draft@tutor.ci.example", displayName: "Draft", password, courseId: "missing-draft" }, true), rejects(404));
    });
    await t.test("registration control and invitation lists are owner-only", async () => {
      await assert.rejects(() => setRegistration(d, student, { enabled: true }), rejects(403));
      await setRegistration(d, owner, { enabled: true });
      assert.equal(await registrationEnabled(d, { AUTH_REGISTRATION_ENABLED: "false" }), true);
      await setRegistration(d, owner, { enabled: false });
      assert.equal(await registrationEnabled(d, { AUTH_REGISTRATION_ENABLED: "true" }), false);
      await assert.rejects(() => tutorOverview(d, student), rejects(403));
      await assert.rejects(() => createTutorInvitation(d, { ...student, role: "owner" }, { email: "forged@tutor.ci.example", displayName: "Forged", classId: null }, env), rejects(403));
    });
    await t.test("new tutor gets one-use hashed invitation and only its assigned class", async () => {
      const invitation = await createTutorInvitation(d, owner, { email: "tutor@tutor.ci.example", displayName: "Tutor", classId: classA.id }, env);
      const secret = token(invitation);
      assert.equal(new URL(invitation.url).search, "");
      const stored = await d.prepare("SELECT token_hash FROM tutor_invitations WHERE id=?").bind(invitation.id).first();
      assert.equal(stored.token_hash.length, 64); assert.notEqual(stored.token_hash, secret);
      assert.equal(JSON.stringify(await tutorOverview(d, owner)).includes(secret), false);
      assert.equal((await inspectTutorInvitation(d, secret)).existingAccount, false);
      await assert.rejects(() => activateTutorInvitation(d, { token: secret, email: "other@tutor.ci.example", password }, null), rejects(400));
      const outcomes = await Promise.allSettled([1, 2].map(() => activateTutorInvitation(d, { token: secret, email: invitation.email, password }, null)));
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      const login = await loginAccount(d, { email: invitation.email, password }); tutorToken = login.token; signed = await sessionUser(d, login.token);
      tutor = await registerIdentity(d, signed, false); requireActive(tutor);
      assert.equal(tutor.role, "tutor"); assert.equal(tutor.accessStatus, "active");
      assert.equal((await classAccess(d, tutor, classA.id, "staff")).staff, true);
      await assert.rejects(() => classAccess(d, tutor, classB.id, "staff"), (e) => [403, 404].includes(e.status));
      await assert.rejects(() => saveCourse(d, tutor, sampleCourse), rejects(403));
      await saveAssignment(d, tutor, { id: "tutor-assignment", version: 0, classId: classA.id, title: "Task", instructions: "Do task", dueAt: null, status: "published" });
      await saveClassSession(d, tutor, { id: "tutor-session", version: 0, classId: classA.id, title: "Live", kind: "online", startsAt: "2099-01-01T00:00:00Z", duration: 60, location: "", url: "https://example.com/tutor-session" });
      await assert.rejects(() => activateTutorInvitation(d, { token: secret, email: invitation.email, password }, null), rejects(410));
    });
    await t.test("existing accounts require their own login; activation cannot reset a password", async () => {
      const invitation = await createTutorInvitation(d, owner, { email: "student@tutor.ci.example", displayName: "Existing", classId: null }, env);
      const activation = { token: token(invitation), email: invitation.email };
      assert.equal((await inspectTutorInvitation(d, activation.token)).existingAccount, true);
      await assert.rejects(() => activateTutorInvitation(d, activation, null), rejects(401));
      await assert.rejects(() => activateTutorInvitation(d, activation, signed), rejects(401));
      await assert.rejects(() => activateTutorInvitation(d, { ...activation, password }, studentSigned), rejects(400));
      const at = Date.now();
      const attempts = await Promise.allSettled([1, 2].map(() => activateTutorInvitation(d, activation, studentSigned, at)));
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await registerIdentity(d, studentSigned, false)).role, "tutor");
      assert.ok(await loginAccount(d, { email: invitation.email, password }));
    });
    await t.test("revoked, expired, superseded and changed-class invitations cannot grant access", async () => {
      const issue = (email, at) => createTutorInvitation(d, owner, { email, displayName: "Invite", classId: null }, env, at);
      const canceled = await issue("canceled@tutor.ci.example"); await revokeTutorInvitation(d, owner, canceled.id);
      await assert.rejects(() => inspectTutorInvitation(d, token(canceled)), rejects(410));
      const expired = await issue("expired@tutor.ci.example", Date.now() - 8 * 86400000);
      await assert.rejects(() => inspectTutorInvitation(d, token(expired)), rejects(410));
      const first = await issue("replace@tutor.ci.example"), second = await issue("replace@tutor.ci.example");
      await assert.rejects(() => inspectTutorInvitation(d, token(first)), rejects(410));
      assert.ok(await inspectTutorInvitation(d, token(second)));
      const changed = await createTutorInvitation(d, owner, { email: "changed@tutor.ci.example", displayName: "Changed", classId: classB.id }, env);
      await saveClass(d, owner, { ...shape, id: classB.id, name: "Class B", version: 1, mentorId: tutor.id });
      await assert.rejects(() => activateTutorInvitation(d, { token: token(changed), email: changed.email, password }, null), rejects(409));
      assert.equal((await d.prepare("SELECT COUNT(*) AS n FROM auth_credentials WHERE email=?").bind(changed.email).first()).n, 0);
      assert.equal((await d.prepare("SELECT accepted_at FROM tutor_invitations WHERE id=?").bind(changed.id).first()).accepted_at, null);
    });
    await t.test("suspension and role revocation take effect for existing sessions and preserve history", async () => {
      await assert.rejects(() => revokeTutor(d, student, tutor.id, "forged"), rejects(403));
      await updateAccess(d, owner, { userId: tutor.id, version: 1, status: "suspended", reason: "Suspend tutor" });
      const suspended = await registerIdentity(d, await sessionUser(d, tutorToken), false);
      assert.throws(() => requireActive(suspended), rejects(403));
      await assert.rejects(() => createTutorInvitation(d, owner, { email: signed.email, displayName: "Suspended", classId: null }, env), rejects(409));
      await updateAccess(d, owner, { userId: tutor.id, version: 2, status: "active", reason: "Restore fixture" });
      const pending = await createTutorInvitation(d, owner, { email: signed.email, displayName: "Reinvite", classId: null }, env);
      await revokeTutor(d, owner, tutor.id, "End teaching assignment");
      const revoked = await registerIdentity(d, await sessionUser(d, tutorToken), false);
      assert.equal(revoked.role, "student"); requireActive(revoked);
      await assert.rejects(() => classAccess(d, revoked, classA.id, "staff"), (e) => [403, 404].includes(e.status));
      assert.equal((await d.prepare("SELECT COUNT(*) AS n FROM cohorts WHERE mentor_id=?").bind(tutor.id).first()).n, 0);
      assert.equal((await d.prepare("SELECT COUNT(*) AS n FROM class_assignments WHERE id='tutor-assignment'").first()).n, 1);
      assert.equal((await d.prepare("SELECT COUNT(*) AS n FROM cohort_sessions WHERE id='tutor-session'").first()).n, 1);
      await assert.rejects(() => inspectTutorInvitation(d, token(pending)), rejects(410));
      await assert.rejects(() => setRegistration(d, revoked, { enabled: true }), rejects(403));
    });
    await t.test("failed grant rolls back invitation claim and the new account", async () => {
      const invitation = await createTutorInvitation(d, owner, { email: "rollback@tutor.ci.example", displayName: "Rollback", classId: null }, env);
      const failing = {
        prepare: d.prepare.bind(d),
        dialect: d.dialect,
        batch: (statements) => d.batch([...statements, d.prepare("INSERT INTO intentionally_missing_tutor_table(id) VALUES(?)").bind("fail")]),
      };
      await assert.rejects(() => activateTutorInvitation(failing, { token: token(invitation), email: invitation.email, password }, null));
      assert.equal((await d.prepare("SELECT accepted_at FROM tutor_invitations WHERE id=?").bind(invitation.id).first()).accepted_at, null);
      assert.equal((await d.prepare("SELECT COUNT(*) AS n FROM auth_credentials WHERE email=?").bind(invitation.email).first()).n, 0);
    });
  } finally { await pool.end(); }
});
