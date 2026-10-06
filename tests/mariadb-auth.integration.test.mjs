import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { createOwner, registerAccount, loginAccount, sessionUser, logoutSession, changePassword, resetPassword, authRateLimit } from "../lib/auth-data.ts";
import { registerIdentity, updateAccess, requireActive } from "../lib/access.ts";
import { idleDuration, sessionDuration } from "../lib/auth-policy.ts";

export const ownerPassword = "CI-owner-passphrase-unique-only";
test("standalone authentication uses a separate disposable MariaDB database", { skip: process.env.MARIADB_INTEGRATION_TEST !== "true" }, async (t) => {
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_NAME, "stem_ci");
  const root = createMariaDb();
  await root.pool.query("CREATE DATABASE stem_auth_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
  await root.pool.end();
  const { pool, database: d } = createMariaDb({ ...process.env, DB_NAME: "stem_auth_ci" });
  const ownerInput = { email: "operator@ci.example", displayName: "Operator", password: ownerPassword };
  const studentInput = { email: "learner@ci.example", displayName: "Peserta", password: "CI-learner-passphrase-unique-only" };
  const studentLogin = { email: studentInput.email, password: studentInput.password };
  const ownerLogin = { email: ownerInput.email, password: ownerInput.password };
  let owner, learner, learnerId, token;
  try {
    await applyMariaDbMigrations(pool);
    await t.test("closed or ownerless registration cannot claim the platform", async () => {
      await assert.rejects(() => registerAccount(d, studentInput, false), (e) => e.status === 403);
      await assert.rejects(() => registerAccount(d, studentInput, true), (e) => e.status === 503);
      assert.equal(await sessionUser(d, "fake-session"), null);
    });
    await t.test("competing operator setup has one owner and does not leave a second privileged account", async () => {
      const results = await Promise.allSettled([createOwner(d, ownerInput), createOwner(d, { ...ownerInput, email: "loser@ci.example" })]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
      const credentials = (await d.prepare("SELECT user_id AS userId,email,display_name AS displayName FROM auth_credentials").all()).results;
      assert.equal(credentials.length, 1);
      // Whichever concurrent operator won, make it the deterministic CI identity.
      await d.prepare("UPDATE auth_credentials SET email=? WHERE user_id=?").bind(ownerInput.email, credentials[0].userId).run();
      owner = await registerIdentity(d, { ...credentials[0], email: ownerInput.email }, false);
      assert.equal(owner.role, "owner");
    });
    await t.test("new accounts are pending; duplicate emails and forged roles cannot overwrite accounts", async () => {
      await registerAccount(d, studentInput, true);
      await assert.rejects(() => registerAccount(d, { ...studentInput, email: "LEARNER@ci.example" }, true), (e) => e.status === 400);
      await assert.rejects(() => registerAccount(d, { ...studentInput, role: "owner" }, true));
      token = (await loginAccount(d, studentLogin)).token;
      const signed = await sessionUser(d, token);
      learnerId = signed.userId;
      learner = await registerIdentity(d, signed, false);
      assert.equal(learner.accessStatus, "pending");
      assert.throws(() => requireActive(learner), (e) => e.status === 403);
      const row = await d.prepare("SELECT token_hash FROM auth_sessions WHERE user_id=?").bind(learnerId).first();
      assert.notEqual(row.token_hash, token);
      assert.equal(row.token_hash.length, 64);
    });
    await t.test("approval allows learning, suspension blocks it, and session data never contains a trusted client role", async () => {
      await updateAccess(d, owner, { userId: learnerId, version: 1, status: "active", reason: "CI approval" });
      learner = await registerIdentity(d, await sessionUser(d, token), false);
      requireActive(learner);
      assert.equal("role" in await sessionUser(d, token), false);
      await updateAccess(d, owner, { userId: learnerId, version: 2, status: "suspended", reason: "CI suspension" });
      assert.throws(() => requireActive({ ...learner, accessStatus: "suspended" }), (e) => e.status === 403);
      await updateAccess(d, owner, { userId: learnerId, version: 3, status: "active", reason: "CI reactivation" });
    });
    await t.test("login errors remain generic, sessions rotate, and idle/absolute expiry are enforced", async () => {
      for (const input of [{ ...studentLogin, password: "wrong-password" }, { email: "missing@ci.example", password: "wrong-password" }]) await assert.rejects(() => loginAccount(d, input), (e) => e.status === 401 && e.message === "Email atau password tidak sesuai.");
      const old = token;
      token = (await loginAccount(d, studentLogin, old)).token;
      assert.notEqual(token, old);
      assert.equal(await sessionUser(d, old), null);
      const now = Date.now();
      assert.equal(await sessionUser(d, token, now + idleDuration + 100), null);
      assert.equal(await sessionUser(d, token, now + sessionDuration + 100), null);
      // Touch after five minutes; the same timestamp may be touched concurrently.
      const sessions = await Promise.all([sessionUser(d, token, now + 360000), sessionUser(d, token, now + 360000)]);
      assert.ok(sessions.every(Boolean));
    });
    await t.test("password changes invalidate every session and operator recovery never creates a public reset endpoint", async () => {
      const changed = "CI-new-learner-passphrase-unique";
      await assert.rejects(() => changePassword(d, learnerId, "wrong-password", changed), (e) => e.status === 401);
      await changePassword(d, learnerId, studentInput.password, changed);
      assert.equal(await sessionUser(d, token), null);
      await assert.rejects(() => loginAccount(d, studentLogin), (e) => e.status === 401);
      token = (await loginAccount(d, { ...studentLogin, password: changed })).token;
      await resetPassword(d, studentInput.email, studentInput.password);
      assert.equal(await sessionUser(d, token), null);
    });
    await t.test("logout revokes server state and persistent rate limits expire", async () => {
      token = (await loginAccount(d, ownerLogin)).token;
      await logoutSession(d, token);
      assert.equal(await sessionUser(d, token), null);
      const at = Date.now() + 86400000;
      for (let i = 0; i < 10; i++) await authRateLimit(d, "login", "limited@ci.example", at);
      await assert.rejects(() => authRateLimit(d, "login", "limited@ci.example", at), (e) => e.status === 429);
      await authRateLimit(d, "login", "limited@ci.example", at + 15 * 60 * 1000 + 1);
    });
    await t.test("password reset race prevents an already verified old password from issuing a session", async () => {
      let replaced = false;
      const racing = { dialect: d.dialect, prepare(sql) { return d.prepare(sql); }, async batch(statements) {
        if (!replaced && statements.some((s) => s.sql?.startsWith("INSERT INTO auth_sessions"))) { replaced = true; await resetPassword(d, ownerInput.email, "CI-reset-race-passphrase-unique"); }
        return d.batch(statements);
      } };
      await assert.rejects(() => loginAccount(racing, ownerLogin), (e) => e.status === 401);
      await resetPassword(d, ownerInput.email, ownerPassword);
    });
  } finally { await pool.end(); }
});
