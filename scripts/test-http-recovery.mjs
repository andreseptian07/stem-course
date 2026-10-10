import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

// Invoked only by the disposable runner, which owns stop/start of its database.
export async function testHttpRecovery(env, { stopDatabase, startDatabase }) {
  assert.equal(env.DB_HOST, "127.0.0.1");
  assert.equal(env.DB_NAME, "stem_ci");
  assert.equal(env.MARIADB_INTEGRATION_TEST, "true");
  const base = "http://127.0.0.1:4311", origin = "https://course.ci.example";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "4311"], {
    env: { ...env, NODE_ENV: "production", DB_NAME: "stem_auth_ci", APP_URL: origin, AUTH_REQUIRE_EMAIL_VERIFICATION: "false", MAIL_DELIVERY: "disabled", AUTH_ALLOW_LOCAL_HTTP: "false" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  const post = (body, cookie, path = "/api/account") => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const account = cookie => fetch(base + "/api/account", { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error("Server uji HTTP pemulihan berhenti sebelum siap.");
      try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(1000) })).status === 200) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.equal(ready, true);
    const login = { action: "login", email: "operator@ci.example", password: "CI-owner-passphrase-unique-only" };
    const response = await post(login, undefined, "/api/auth");
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const before = await (await account(cookie)).json();
    const input = { ...before.profile, bio: "Disposable recovery: save after outage" };
    await stopDatabase();
    assert.equal((await account(cookie)).status, 503, "Database outage must not look like an expired session.");
    const unavailableLogin = await post(login, undefined, "/api/auth");
    assert.equal(unavailableLogin.status, 503, "Database outage must not look like a wrong password.");
    assert.equal(unavailableLogin.headers.get("set-cookie"), null);
    assert.equal((await post({ action: "saveProfile", profile: input }, cookie)).status, 503);
    await startDatabase();
    const recovered = await account(cookie);
    assert.equal(recovered.status, 200, "Same session must recover after database restart.");
    const after = await recovered.json();
    assert.equal(after.user.id, before.user.id);
    assert.deepEqual(after.profile, before.profile, "Failed save must not claim success or alter data.");
    assert.equal((await post({ action: "saveProfile", profile: input }, cookie)).status, 200);
    const saved = await (await account(cookie)).json();
    assert.equal(saved.profile.bio, input.bio);
    assert.equal(saved.profile.version, input.version + 1);
    console.log("HTTP recovery passed: outage gives 503, same session survives restart, failed save leaves data unchanged, explicit save persists once.");
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit"); child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000); timer.unref();
      await exited; clearTimeout(timer);
    }
  }
}
