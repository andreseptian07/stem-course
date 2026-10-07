import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

// Fixture-only production smoke test. Never start against Hostinger credentials.
assert.equal(process.env.MARIADB_INTEGRATION_TEST, "true");
assert.equal(process.env.DB_HOST, "127.0.0.1");
assert.equal(process.env.DB_NAME, "stem_ci");
const origin = "https://course.ci.example", base = "http://127.0.0.1:4310";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "4310"], {
  env: { ...process.env, NODE_ENV: "production", DB_NAME: "stem_auth_ci", APP_URL: origin, AUTH_REGISTRATION_ENABLED: "true", AUTH_ALLOW_LOCAL_HTTP: "false", JUDGE0_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "ignore", "pipe"],
});
// Do not echo request logs, tokens, passwords or connection details from stderr.
child.stderr.on("data", () => {});
const post = (path, body, cookie, extra = {}) => fetch(base + path, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: JSON.stringify(body) });
const session = (response) => {
  const header = response.headers.get("set-cookie");
  assert.ok(header?.startsWith("__Host-stem-session="));
  assert.match(header, /HttpOnly/i); assert.match(header, /Secure/i); assert.match(header, /SameSite=lax/i); assert.match(header, /Path=\//i);
  return header.split(";")[0];
};
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error("Server Node berhenti sebelum siap.");
    try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(1000) })).status === 200) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.equal(ready, true, "Server Node belum siap.");
  const html = await (await fetch(base + "/login")).text();
  assert.ok(html.includes("Selamat datang kembali"));
  assert.ok(html.includes("Daftar"));
  assert.equal((await (await fetch(base + "/api/registration")).json()).enabled, true);
  for (const path of ["/forgot-password", "/verify-email", "/reset-password"]) {
    const page = await fetch(base + path); assert.equal(page.status, 200); assert.match(page.headers.get("cache-control"), /no-store/);
  }
  assert.equal((await fetch(base + "/api/account-email", { headers: { "oai-authenticated-user-id": "access-owner" } })).status, 401);
  assert.equal((await fetch(base + "/api/email-settings", { headers: { "oai-authenticated-user-id": "access-owner" } })).status, 401);
  assert.equal((await post("/api/account-email", { action: "requestReset", email: "missing@ci.example" }, undefined, { Origin: "https://evil.example.com" })).status, 403);
  assert.equal((await post("/api/account-email", { action: "requestReset", email: "missing@ci.example", userId: "access-owner" })).status, 400);
  assert.equal((await fetch(base + "/dashboard", { redirect: "manual" })).status, 307);
  assert.equal((await fetch(base + "/notifications", { redirect: "manual" })).status, 307);
  assert.equal((await fetch(base + "/api/notifications", { headers: { "oai-authenticated-user-id": "access-owner" } })).status, 401);
  assert.equal((await fetch(base + "/api/access", { headers: { "oai-authenticated-user-id": "access-owner", "oai-authenticated-user-email": "owner@fake.example", "x-forwarded-user": "owner" } })).status, 401);
  assert.equal((await post("/api/auth", { action: "login", email: "operator@ci.example", password: "CI-owner-passphrase-unique-only" }, null, { Origin: "https://evil.example" })).status, 403);
  const ownerResponse = await post("/api/auth", { action: "login", email: "operator@ci.example", password: "CI-owner-passphrase-unique-only", returnTo: "//evil.example" });
  assert.equal(ownerResponse.status, 200);
  const owner = session(ownerResponse);
  assert.equal((await ownerResponse.json()).redirect, "/dashboard");
  const mailSettingsResponse = await fetch(base + "/api/email-settings", { headers: { Cookie: owner } });
  assert.equal(mailSettingsResponse.status, 200); assert.match(mailSettingsResponse.headers.get("cache-control"), /no-store/);
  const mailSettings = await mailSettingsResponse.json(); assert.equal(mailSettings.enabled, false);
  assert.equal((await post("/api/email-settings", { action: "enable", version: mailSettings.version }, owner, { Origin: "https://evil.example.com" })).status, 403);
  assert.equal((await post("/api/email-settings", { action: "enable", version: mailSettings.version }, owner)).status, 400);
  const ownerAccount = await fetch(base + "/api/account", { headers: { Cookie: owner } });
  assert.equal(ownerAccount.status, 200, "Owner dashboard data must load after login.");
  assert.match(ownerAccount.headers.get("cache-control"), /no-store/);
  const ownerData = await ownerAccount.json();
  assert.equal(ownerData.user.role, "owner");
  assert.equal(ownerData.user.email, "operator@ci.example");
  assert.ok(ownerData.profile);
  const course = "esp32-starter";
  assert.equal((await post("/api/registration", { enabled: false }, owner)).status, 200);
  assert.equal((await (await fetch(base + "/api/registration")).json()).enabled, false);
  assert.equal((await post("/api/auth", { action: "register", email: "closed@ci.example", displayName: "Closed", password: "CI-web-learner-passphrase-only" })).status, 403);
  assert.equal((await post("/api/registration", { enabled: true }, owner)).status, 200);
  const registration = await post("/api/auth", { action: "register", email: "web-learner@ci.example", displayName: "Peserta Web", password: "CI-web-learner-passphrase-only", courseId: course });
  assert.equal(registration.status, 201);
  const login = await post("/api/auth", { action: "login", email: "web-learner@ci.example", password: "CI-web-learner-passphrase-only" });
  assert.equal(login.status, 200);
  const learner = session(login);
  assert.equal((await login.json()).redirect, "/access");
  assert.equal((await fetch(base + "/api/account", { headers: { Cookie: learner } })).status, 403);
  assert.equal((await post("/api/account", { action: "enroll", courseId: course }, learner)).status, 200);
  assert.equal((await post("/api/registration", { enabled: false }, learner)).status, 403);
  assert.equal((await fetch(base + "/api/tutors", { headers: { Cookie: learner } })).status, 403);
  assert.equal((await fetch(base + "/api/email-settings", { headers: { Cookie: learner } })).status, 403);
  const pending = await (await fetch(base + "/api/access", { headers: { Cookie: learner } })).json();
  const ownerFeed = await (await fetch(base + "/api/notifications", { headers: { Cookie: owner } })).json();
  assert.ok(ownerFeed.items.some((n) => n.title === "Akun siswa menunggu persetujuan"));
  const approved = await post("/api/access", { userId: pending.user.id, version: pending.version, status: "active", reason: "CI HTTP approval" }, owner);
  assert.equal(approved.status, 200);
  const account = await fetch(base + "/api/account", { headers: { Cookie: learner } });
  assert.equal(account.status, 200); assert.match(account.headers.get("cache-control"), /no-store/);
  const data = await account.json();
  assert.equal(data.user.email, "web-learner@ci.example");
  assert.equal(data.user.role, "student");
  const notificationResponse = await fetch(base + "/api/notifications", { headers: { Cookie: learner } });
  assert.equal(notificationResponse.status, 200);
  assert.match(notificationResponse.headers.get("cache-control"), /no-store/);
  const learnerFeed = await notificationResponse.json();
  const approval = learnerFeed.items.find((n) => n.kind === "access");
  assert.ok(approval); assert.equal(approval.readAt, null);
  const read = { action: "markRead", ids: [approval.id] };
  assert.equal((await post("/api/notifications", read, learner, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/notifications", { ...read, userId: ownerData.user.id }, learner)).status, 400);
  assert.equal((await post("/api/notifications", { action: "markRead", ids: ["f".repeat(64)] }, learner)).status, 409);
  assert.equal((await post("/api/notifications", read, learner)).status, 200);
  assert.ok((await (await fetch(base + "/api/notifications", { headers: { Cookie: learner } })).json()).items.find((n) => n.id === approval.id).readAt);
  assert.ok(data.courses.some((c) => c.id === course));
  assert.equal((await post("/api/studio", { action: "saveCourse", course: {} }, learner)).status, 403);
  assert.equal((await post("/api/account", { action: "enroll", courseId: course }, learner)).status, 200);
  const roster = await (await fetch(base + "/api/access", { headers: { Cookie: owner } })).json();
  const current = roster.users.find((u) => u.id === data.user.id);
  assert.equal((await post("/api/access", { userId: data.user.id, version: current.version, status: "suspended", reason: "CI HTTP suspend" }, owner)).status, 200);
  assert.equal((await fetch(base + "/api/account", { headers: { Cookie: learner } })).status, 403);
  assert.equal((await fetch(base + "/api/access", { headers: { Cookie: learner } })).status, 200);
  assert.ok((await (await fetch(base + "/api/notifications", { headers: { Cookie: learner } })).json()).items.every((n) => n.kind === "access"));
  const invite = await post("/api/tutors", { action: "invite", invitation: { email: "web-tutor@ci.example", displayName: "Web Tutor", classId: null } }, owner);
  assert.equal(invite.status, 201);
  const invitation = await invite.json();
  const token = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("invite");
  assert.equal((await post("/api/tutor-activation", { action: "inspect", token })).status, 200);
  const activation = { token, email: "web-tutor@ci.example", password: "CI-web-tutor-passphrase-only" };
  assert.equal((await post("/api/tutor-activation", { action: "activate", activation }, null, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/tutor-activation", { action: "activate", activation })).status, 200);
  assert.equal((await post("/api/tutor-activation", { action: "activate", activation })).status, 410);
  const tutorLogin = await post("/api/auth", { action: "login", email: activation.email, password: activation.password });
  assert.equal(tutorLogin.status, 200); const tutorCookie = session(tutorLogin);
  const tutorData = await (await fetch(base + "/api/account", { headers: { Cookie: tutorCookie } })).json();
  assert.equal(tutorData.user.role, "tutor");
  assert.equal((await fetch(base + "/api/tutors", { headers: { Cookie: tutorCookie } })).status, 403);
  assert.equal((await post("/api/registration", { enabled: false }, tutorCookie)).status, 403);
  assert.equal((await post("/api/studio", { action: "saveCourse", course: {} }, tutorCookie)).status, 403);
  assert.equal((await post("/api/tutors", { action: "revokeTutor", userId: tutorData.user.id, reason: "CI HTTP revocation" }, owner)).status, 200);
  assert.equal((await (await fetch(base + "/api/account", { headers: { Cookie: tutorCookie } })).json()).user.role, "student");
  assert.equal((await fetch(base + "/practice-runner.html")).status, 200);
  const logoutPage = await fetch(base + "/logout", { headers: { Cookie: owner } });
  assert.equal(logoutPage.status, 200);
  assert.equal((await fetch(base + "/api/access", { headers: { Cookie: owner } })).status, 200, "GET logout must not mutate the session.");
  assert.equal((await post("/api/auth", { action: "logout" }, owner)).status, 200);
  assert.equal((await fetch(base + "/api/access", { headers: { Cookie: owner } })).status, 401);
  console.log("Node production HTTP smoke passed: registration controls, course enrollment, one-use tutor invitations, role revocation, owner dashboard, secure cookies, CSRF, account approval, logout and browser runner.");
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit"); child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000); timer.unref();
    await exited; clearTimeout(timer);
  }
}
