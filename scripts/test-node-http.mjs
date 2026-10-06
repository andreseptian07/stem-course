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
  assert.equal((await fetch(base + "/dashboard", { redirect: "manual" })).status, 307);
  assert.equal((await fetch(base + "/api/access", { headers: { "oai-authenticated-user-id": "access-owner", "oai-authenticated-user-email": "owner@fake.example", "x-forwarded-user": "owner" } })).status, 401);
  assert.equal((await post("/api/auth", { action: "login", email: "operator@ci.example", password: "CI-owner-passphrase-unique-only" }, null, { Origin: "https://evil.example" })).status, 403);
  const ownerResponse = await post("/api/auth", { action: "login", email: "operator@ci.example", password: "CI-owner-passphrase-unique-only", returnTo: "//evil.example" });
  assert.equal(ownerResponse.status, 200);
  const owner = session(ownerResponse);
  assert.equal((await ownerResponse.json()).redirect, "/dashboard");
  const course = "esp32-starter";
  const registration = await post("/api/auth", { action: "register", email: "web-learner@ci.example", displayName: "Peserta Web", password: "CI-web-learner-passphrase-only" });
  assert.equal(registration.status, 201);
  const login = await post("/api/auth", { action: "login", email: "web-learner@ci.example", password: "CI-web-learner-passphrase-only" });
  assert.equal(login.status, 200);
  const learner = session(login);
  assert.equal((await login.json()).redirect, "/access");
  assert.equal((await fetch(base + "/api/account", { headers: { Cookie: learner } })).status, 403);
  const pending = await (await fetch(base + "/api/access", { headers: { Cookie: learner } })).json();
  const approved = await post("/api/access", { userId: pending.user.id, version: pending.version, status: "active", reason: "CI HTTP approval" }, owner);
  assert.equal(approved.status, 200);
  const account = await fetch(base + "/api/account", { headers: { Cookie: learner } });
  assert.equal(account.status, 200); assert.match(account.headers.get("cache-control"), /no-store/);
  const data = await account.json();
  assert.equal(data.user.email, "web-learner@ci.example");
  assert.equal(data.user.role, "student");
  assert.equal((await post("/api/studio", { action: "saveCourse", course: {} }, learner)).status, 403);
  assert.equal((await post("/api/account", { action: "enroll", courseId: course }, learner)).status, 200);
  const roster = await (await fetch(base + "/api/access", { headers: { Cookie: owner } })).json();
  const current = roster.users.find((u) => u.id === data.user.id);
  assert.equal((await post("/api/access", { userId: data.user.id, version: current.version, status: "suspended", reason: "CI HTTP suspend" }, owner)).status, 200);
  assert.equal((await fetch(base + "/api/account", { headers: { Cookie: learner } })).status, 403);
  assert.equal((await fetch(base + "/api/access", { headers: { Cookie: learner } })).status, 200);
  assert.equal((await fetch(base + "/practice-runner.html")).status, 200);
  const logoutPage = await fetch(base + "/logout", { headers: { Cookie: owner } });
  assert.equal(logoutPage.status, 200);
  assert.equal((await fetch(base + "/api/access", { headers: { Cookie: owner } })).status, 200, "GET logout must not mutate the session.");
  assert.equal((await post("/api/auth", { action: "logout" }, owner)).status, 200);
  assert.equal((await fetch(base + "/api/access", { headers: { Cookie: owner } })).status, 401);
  console.log("Node production HTTP smoke passed: login, secure cookies, canonical origin, pending/active/suspended access, enrollment, header forgery, logout, and browser runner.");
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit"); child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000); timer.unref();
    await exited; clearTimeout(timer);
  }
}
