import {seedPrincipal} from "./authorization-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { notificationFeed, markNotificationsRead, notificationMutation } from "../lib/notifications.ts";
import { sampleCourse } from "../lib/seed.ts";
import { databaseSql } from "../lib/database.ts";

const time = "2026-10-07T03:00:00.000Z";
const at = Date.parse(time);
const hash = (key) => createHash("sha256").update(key).digest("hex");
export async function notificationScenarios(t, d) {
  const ownerSetting = await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
  const owner = { id: ownerSetting?.value || "notify-owner", name: "Owner fixture", role: "owner", accessStatus: "active", accessVersion: 1 };
  if (!ownerSetting) await d.prepare("INSERT INTO settings(`key`,value) VALUES('owner',?)").bind(owner.id).run();
  const user = (name, role = "student") => ({ id: `notify-${name}`, name, role, accessStatus: "active", accessVersion: 1 });
  const alice = user("alice"), bob = user("bob"), tutor = user("tutor", "tutor"), other = user("other", "tutor"), outsider = user("outsider"), pending = { ...user("pending"), accessStatus: "pending" };
  for (const u of [owner, alice, bob, tutor, other, outsider, pending]) {
    await d.prepare(databaseSql(d, "INSERT OR IGNORE INTO users(id,name,role) VALUES(?,?,?)", "INSERT INTO users(id,name,role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=id")).bind(u.id, u.name, u.role).run();
    await d.prepare(databaseSql(d, "INSERT OR IGNORE INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,?,?)", "INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,?,?) ON DUPLICATE KEY UPDATE user_id=user_id")).bind(u.id, u.accessStatus, time, time).run();
  }
  for(const u of [owner,alice,bob,tutor,other,outsider,pending]){if(!await d.prepare('SELECT 1 FROM account_principals WHERE user_id=?').bind(u.id).first())await seedPrincipal(d,u.id,[owner,tutor,other].includes(u)?'staff':'student',[tutor,other].includes(u)?['tutor']:[],u.accessStatus);}
  for(const u of [alice,bob])await d.prepare("INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,'notify-course',?,'fixture')").bind(u.id,time).run();
  await d.prepare("INSERT INTO courses(id,data,version) VALUES(?,?,1)").bind("notify-course", JSON.stringify({ ...sampleCourse, id: "notify-course" })).run();
  for (const [id, mentor, name] of [["notify-class-a", tutor.id, "Class A"], ["notify-class-b", other.id, "Class B"]])
    await d.prepare("INSERT INTO cohorts(id,course_id,mentor_id,name,description,capacity,status,version,created_at) VALUES(?,'notify-course',?,?,'',20,'active',1,?)").bind(id, mentor, name, time).run();
  for (const [classId, userId] of [["notify-class-a", alice.id], ["notify-class-a", bob.id], ["notify-class-b", bob.id]])
    await d.prepare("INSERT INTO cohort_members(class_id,user_id,status,created_at) VALUES(?,?,'approved',?)").bind(classId, userId, time).run();
  for (const [id, classId, status] of [["notify-task-a", "notify-class-a", "published"], ["notify-draft", "notify-class-a", "draft"], ["notify-task-b", "notify-class-b", "published"]])
    await d.prepare("INSERT INTO class_assignments(id,class_id,title,instructions,status,version,created_at) VALUES(?,?,?,'SECRET INSTRUCTIONS',?,1,?)").bind(id, classId, id, status, time).run();
  await d.prepare("INSERT INTO access_events(id,actor_id,target_id,status,reason,created_at) VALUES('notify-access',?,?,'active','PRIVATE OPERATOR REASON',?)").bind(owner.id, alice.id, time).run();
  await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at,late,status,feedback,score,reviewed_at,version) VALUES('notify-review','notify-task-a',?,1,1,'SECRET SNAPSHOT','SECRET WORK','https://private.example.invalid',?,0,'changes_requested','SECRET FEEDBACK',30,?,2)").bind(alice.id, time, time).run();
  await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at,late,status,feedback,version) VALUES('notify-submission','notify-task-a',?,1,1,'SECRET SNAPSHOT','SECRET WORK','https://private.example.invalid',?,0,'submitted','',1)").bind(bob.id, time).run();
  await d.prepare("INSERT INTO cohort_posts(id,class_id,user_id,name,role,kind,body,created_at) VALUES('notify-announcement','notify-class-a',?,'Tutor','tutor','announcement','SECRET ANNOUNCEMENT BODY',?)").bind(tutor.id, time).run();

  await t.test("students get their own review, published tasks and announcements without private payloads", async () => {
    const feed = await notificationFeed(d, alice, at);
    assert.ok(feed.items.some((n) => n.kind === "review" && n.title === "Tugas Anda perlu direvisi"));
    assert.ok(feed.items.some((n) => n.kind === "announcement"));
    assert.ok(feed.items.some((n) => n.kind === "task"));
    assert.ok(!JSON.stringify(feed).includes("SECRET"));
    assert.ok(!JSON.stringify(feed).includes("private.example"));
    assert.ok(!JSON.stringify(feed).includes("notify-class-b"));
    assert.ok(!JSON.stringify(feed).includes("notify-draft"));
    assert.equal((await notificationFeed(d, bob, at)).items.filter((n) => n.kind === "review").length, 0);
    assert.equal((await notificationFeed(d, outsider, at)).items.length, 0);
  });
  await t.test("tutors see submitted work only within assignments; owner sees pending accounts", async () => {
    const teaching = await notificationFeed(d, tutor, at);
    assert.equal(teaching.items.filter((n) => n.kind === "submission").length, 1);
    assert.equal(teaching.items.filter((n) => n.kind === "announcement").length, 0);
    assert.equal((await notificationFeed(d, other, at)).items.filter((n) => n.kind === "submission").length, 0);
    assert.ok((await notificationFeed(d, owner, at)).items.some((n) => n.title === "Akun siswa menunggu persetujuan"));
    assert.equal((await notificationFeed(d, pending, at)).items.length, 0);
    await d.prepare("UPDATE user_access SET status='suspended',version=version+1 WHERE user_id=?").bind(alice.id).run();
    assert.deepEqual((await notificationFeed(d,{...alice,accessStatus:"active"},at)).items.map(n=>n.kind),["access"]);
    await d.prepare("UPDATE user_access SET status='active',version=version+1 WHERE user_id=?").bind(alice.id).run();
  });
  await t.test("read state is persistent, idempotent and separate for each recipient", async () => {
    const task = (await notificationFeed(d, alice, at)).items.find((n) => n.kind === "task");
    await markNotificationsRead(d, alice, { action: "markRead", ids: [task.id] }, at);
    await markNotificationsRead(d, alice, { action: "markRead", ids: [task.id] }, at + 1000);
    assert.equal((await notificationFeed(d, alice, at)).items.find((n) => n.id === task.id).readAt, time);
    assert.equal((await notificationFeed(d, bob, at)).items.find((n) => n.id === task.id).readAt, null);
    assert.equal(Number((await d.prepare("SELECT COUNT(*) AS n FROM notification_reads WHERE user_id=? AND event_id=?").bind(alice.id, task.id).first()).n), 1);
    const mutation = { action: "markRead", ids: [task.id] };
    for (const key of ["userId", "role", "readAt"]) assert.equal(notificationMutation.safeParse({ ...mutation, [key]: "owner" }).success, false);
    assert.equal(notificationMutation.safeParse({ action: "markRead", ids: [task.id, task.id] }).success, false);
    await assert.rejects(() => markNotificationsRead(d, outsider, mutation, at), (e) => e.status === 409);
  });
  await t.test("a new review revision is unread without replaying an unchanged review", async () => {
    const before = (await notificationFeed(d, alice, at)).items.find((n) => n.kind === "review");
    await markNotificationsRead(d, alice, { action: "markRead", ids: [before.id] }, at);
    await d.prepare("UPDATE project_submissions SET status='accepted',version=3,reviewed_at=? WHERE id='notify-review'").bind(new Date(at + 1000).toISOString()).run();
    const after = (await notificationFeed(d, alice, at)).items.find((n) => n.kind === "review");
    assert.notEqual(after.id, before.id);
    assert.equal(after.readAt, null);
    assert.equal(after.title, "Tugas Anda diterima");
    await assert.rejects(() => markNotificationsRead(d, alice, { action: "markRead", ids: [before.id] }, at), (e) => e.status === 409);
  });
  await t.test("reminders honor the 24-hour window, class privacy, rescheduling and course RSVP", async () => {
    const start = new Date(at + 60 * 60 * 1000).toISOString();
    for (const [id, classId, startsAt] of [["notify-session", "notify-class-a", start], ["notify-private-session", "notify-class-b", start], ["notify-far-session", "notify-class-a", new Date(at + 25 * 60 * 60 * 1000).toISOString()]])
      await d.prepare("INSERT INTO cohort_sessions(id,class_id,title,kind,starts_at,duration,location,url,version) VALUES(?,?,'Sesi privat','online',?,60,'','https://secret-meeting.example.invalid',1)").bind(id, classId, startsAt).run();
    await d.prepare("INSERT INTO sessions(id,course_id,title,kind,starts_at,duration,location,url,capacity) VALUES('notify-course-session','notify-course','Sesi Tutor umum','online',?,60,'','https://secret-meeting.example.invalid',5)").bind(start).run();
    await d.prepare("INSERT INTO rsvps(session_id,user_id) VALUES('notify-course-session',?)").bind(alice.id).run();
    const feed = await notificationFeed(d, alice, at);
    assert.equal(feed.items.filter((n) => n.kind === "reminder").length, 2);
    assert.equal((await notificationFeed(d, alice, at - 23 * 60 * 60 * 1000 - 1)).items.filter((n) => n.kind === "reminder").length, 0);
    assert.equal((await notificationFeed(d, alice, at - 23 * 60 * 60 * 1000)).items.filter((n) => n.kind === "reminder").length, 2);
    assert.ok(!JSON.stringify(feed).includes("secret-meeting"));
    assert.ok(feed.items.some((n) => n.description.includes("WIB")));
    assert.equal((await notificationFeed(d, outsider, at)).items.filter((n) => n.kind === "reminder").length, 0);
    const old = feed.items.find((n) => n.kind === "reminder" && n.href.includes("notify-class-a"));
    await markNotificationsRead(d, alice, { action: "markRead", ids: [old.id] }, at);
    await d.prepare("UPDATE cohort_sessions SET version=2,starts_at=? WHERE id='notify-session'").bind(new Date(at + 2 * 60 * 60 * 1000).toISOString()).run();
    const updated = (await notificationFeed(d, alice, at)).items.find((n) => n.kind === "reminder" && n.href.includes("notify-class-a"));
    assert.notEqual(updated.id, old.id); assert.equal(updated.readAt, null);
    const later = (await notificationFeed(d, alice, at + 2 * 60 * 60 * 1000)).items.filter((n) => n.kind === "reminder");
    assert.equal(later.length, 1); // The formerly distant session is now 23 hours away.
    assert.ok(!later.some((n) => n.id === updated.id || n.href.includes("view=sessions")));
  });
  await t.test("invitations are recipient-only, contain no token, and disappear when revoked", async () => {
    await d.prepare("INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) VALUES(?,'notify-pending@example.invalid','Pending','fixture-not-a-password-hash',1,?,?)").bind(pending.id, time, time).run();
    await d.prepare("INSERT INTO tutor_invitations(id,token_hash,email,display_name,created_by,created_at,expires_at) VALUES('notify-invite',?,'notify-pending@example.invalid','Pending',?,?,?)").bind("0".repeat(64), owner.id, time, at + 86400000).run();
    const feed = await notificationFeed(d, pending, at);
    assert.equal(feed.items.filter((n) => n.kind === "invitation").length, 1);
    assert.ok(!JSON.stringify(feed).includes("token"));
    assert.equal((await notificationFeed(d, alice, at)).items.filter((n) => n.title === "Undangan Tutor tersedia").length, 0);
    await d.prepare("UPDATE tutor_invitations SET revoked_at=? WHERE id='notify-invite'").bind(time).run();
    assert.equal((await notificationFeed(d, pending, at)).items.length, 0);
  });
  await t.test("revocation removes class data and prevents marking stale private notifications", async () => {
    const before = (await notificationFeed(d, alice, at)).items.find((n) => n.kind === "task");
    await d.prepare("UPDATE cohort_members SET status='removed' WHERE class_id='notify-class-a' AND user_id=?").bind(alice.id).run();
    assert.equal((await notificationFeed(d, alice, at)).items.some((n) => n.href.includes("notify-class-a")), false);
    await assert.rejects(() => markNotificationsRead(d, alice, { action: "markRead", ids: [before.id] }, at), (e) => e.status === 409);
    await d.prepare("UPDATE cohorts SET mentor_id=NULL WHERE id='notify-class-a'").bind().run();
    assert.equal((await notificationFeed(d, tutor, at)).items.some((n) => n.kind === "submission" || n.kind === "class"), false);
    await d.prepare("UPDATE cohorts SET status='archived' WHERE id='notify-class-a'").bind().run();
    assert.equal((await notificationFeed(d, bob, at)).items.some((n) => n.href.includes("notify-class-a")), false);
  });
  await t.test("bulk read is bounded and never marks notifications arriving after the displayed list", async () => {
    for (let i = 0; i < 105; i++) await d.prepare("INSERT INTO access_events(id,actor_id,target_id,status,reason,created_at) VALUES(?,?,?,'active','Fixture',?)").bind(`notify-bulk-${i}`, owner.id, alice.id, new Date(at + (i + 1) * 1000).toISOString()).run();
    const feed = await notificationFeed(d, alice, at);
    assert.equal(feed.items.length, 100); assert.equal(feed.limit, 100);
    await markNotificationsRead(d, alice, { action: "markRead", ids: feed.items.map((n) => n.id) }, at);
    assert.equal((await notificationFeed(d, alice, at)).unreadCount, 0);
    await d.prepare("INSERT INTO access_events(id,actor_id,target_id,status,reason,created_at) VALUES('notify-new',?,?,'active','Fixture',?)").bind(owner.id, alice.id, new Date(at + 106000).toISOString()).run();
    assert.equal((await notificationFeed(d, alice, at)).unreadCount, 1);
    assert.equal(notificationMutation.safeParse({ action: "markRead", ids: Array.from({ length: 101 }, (_, i) => hash(String(i))) }).success, false);
  });
}
