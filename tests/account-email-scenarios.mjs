import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prepareAccountEmail, checkResetToken, confirmEmail, resetPasswordWithToken, requestMessage } from "../lib/account-email.ts";
import { emailStatus, requireVerifiedEmail } from "../lib/email-policy.ts";
import { hashPassword, verifyPassword } from "../lib/auth-password.ts";
import { sessionUser, resetPassword } from "../lib/auth-data.ts";

export async function accountEmailScenarios(t, d) {
  const env = { APP_URL: "http://127.0.0.1:5173", NODE_ENV: "development", AUTH_ALLOW_LOCAL_HTTP: "true" };
  const now = Date.now(), at = new Date(now).toISOString();
  const email = "email-test-user@example.invalid", userId = "email-test-user";
  const oldPassword = "Email-old-passphrase-unique-only", newPassword = "Email-new-passphrase-unique-only";
  const oldHash = await hashPassword(oldPassword);
  await d.prepare("INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)")
    .bind(userId, email, "Email test", oldHash, at, at).run();
  const mails = [];
  const deliver = async (mail) => { mails.push(mail); };
  const tokenOf = (mail) => new URLSearchParams(new URL(mail.url).hash.slice(1)).get("token");
  const issue = async (purpose, inputEmail = email, time = now) => {
    const result = await prepareAccountEmail(d, { email: inputEmail }, purpose, deliver, env, time);
    await result.delivery();
    return result;
  };
  let verificationToken;
  await t.test("email requests do not expose account existence or raw tokens; delivery stays deferred", async () => {
    const before = mails.length;
    const existing = await prepareAccountEmail(d, { email }, "verify", deliver, env, now);
    assert.equal(mails.length, before);
    const missing = await issue("verify", "email-test-missing@example.invalid");
    assert.equal(existing.message, missing.message); assert.equal(existing.message, requestMessage);
    assert.deepEqual(Object.keys(existing).sort(), ["delivery", "message"]);
    await existing.delivery();
    assert.equal(mails.length, before + 1);
    verificationToken = tokenOf(mails.at(-1));
    const row = await d.prepare("SELECT token_hash AS hash,email,purpose FROM auth_email_tokens WHERE user_id=?").bind(userId).first();
    assert.equal(row.hash, createHash("sha256").update(verificationToken).digest("hex"));
    assert.notEqual(row.hash, verificationToken); assert.equal(row.purpose, "verify");
    assert.equal(new URL(mails.at(-1).url).search, "");
  });
  await t.test("GET-like status reads never consume links; verification is purpose-scoped and single-use", async () => {
    assert.equal((await emailStatus(d, userId)).verified, false);
    await assert.rejects(() => checkResetToken(d, verificationToken, now), e => e.status === 400);
    await assert.rejects(() => resetPasswordWithToken(d, { token: verificationToken, password: newPassword }, now), e => e.status === 400);
    await confirmEmail(d, verificationToken, now);
    assert.equal((await emailStatus(d, userId)).verified, true);
    await assert.rejects(() => confirmEmail(d, verificationToken, now), e => e.status === 400);
    const count = mails.length; await issue("verify"); assert.equal(mails.length, count);
    assert.equal(await d.prepare("SELECT status FROM user_access WHERE user_id=?").bind(userId).first(), null);
  });
  await t.test("expired, malformed and mismatched identity links are rejected", async () => {
    const expiring = await issue("reset");
    assert.equal(expiring.message, requestMessage);
    const token = tokenOf(mails.at(-1));
    await assert.rejects(() => checkResetToken(d, token, now + 30 * 60000), e => e.status === 400);
    await assert.rejects(() => checkResetToken(d, "not-a-token", now), e => e.status === 400);
    await assert.rejects(() => resetPasswordWithToken(d, { token, password: newPassword }, now + 30 * 60000), e => e.status === 400);
    await assert.rejects(() => confirmEmail(d, "not-a-token", now), e => e.status === 400);
    await d.prepare("UPDATE auth_credentials SET email=? WHERE user_id=?").bind("email-test-changed@example.invalid", userId).run();
    assert.equal((await emailStatus(d, userId)).verified, false);
    await assert.rejects(() => checkResetToken(d, token, now), e => e.status === 400);
    await assert.rejects(() => resetPasswordWithToken(d, { token, password: newPassword }, now), e => e.status === 400);
    await d.prepare("UPDATE auth_credentials SET email=? WHERE user_id=?").bind(email, userId).run();
  });
  await t.test("reset replaces only the intended credential, revokes sessions and all outstanding links", async () => {
    await issue("reset"); const first = tokenOf(mails.at(-1));
    await issue("reset"); const second = tokenOf(mails.at(-1));
    const session = "s".repeat(43), sessionHash = createHash("sha256").update(session).digest("hex");
    await d.prepare("INSERT INTO auth_sessions(token_hash,user_id,password_version,created_at,last_seen,expires_at) VALUES(?,?,1,?,?,?)").bind(sessionHash, userId, now, now, now + 60000).run();
    assert.ok(await sessionUser(d, session, now));
    await assert.rejects(() => resetPasswordWithToken(d, { token: first, password: "short" }, now));
    await assert.rejects(() => resetPasswordWithToken(d, { token: first, password: newPassword, userId: "owner" }, now));
    const tokensBefore = (await d.prepare("SELECT token_hash,used_at,password_version FROM auth_email_tokens WHERE user_id=? ORDER BY token_hash").bind(userId).all()).results;
    assert.deepEqual(await checkResetToken(d, first, now), { valid: true });
    assert.deepEqual(await checkResetToken(d, first, now), { valid: true });
    assert.deepEqual((await d.prepare("SELECT token_hash,used_at,password_version FROM auth_email_tokens WHERE user_id=? ORDER BY token_hash").bind(userId).all()).results, tokensBefore);
    assert.ok(await sessionUser(d, session, now));
    const result = await resetPasswordWithToken(d, { token: first, password: newPassword }, now);
    for (const token of [first, second]) await assert.rejects(() => checkResetToken(d, token, now), e => e.status === 400);
    assert.equal(result.email, email);
    const row = await d.prepare("SELECT password_hash AS hash,password_version AS version FROM auth_credentials WHERE user_id=?").bind(userId).first();
    assert.equal(row.version, 2); assert.equal(await verifyPassword(newPassword, row.hash), true);
    assert.equal(await verifyPassword(oldPassword, row.hash), false);
    assert.equal(await sessionUser(d, session, now), null);
    for (const token of [first, second]) await assert.rejects(() => resetPasswordWithToken(d, { token, password: oldPassword }, now), e => e.status === 400);
  });
  await t.test("operator password changes invalidate outstanding recovery links", async () => {
    const later = now + 3600001;
    await issue("reset", email, later); const token = tokenOf(mails.at(-1));
    await resetPassword(d, email, oldPassword);
    await assert.rejects(() => resetPasswordWithToken(d, { token, password: newPassword }, later), e => e.status === 400);
  });
  await t.test("email rate limits apply equally to unknown accounts", async () => {
    for (let i=0;i<3;i++) await issue("reset", "email-test-limited@example.invalid");
    await assert.rejects(() => issue("reset", "email-test-limited@example.invalid"), e => e.status === 429);
  });
  await t.test("password race cannot reuse a link after a concurrent password change", async () => {
    const later = now + 7200002;
    await issue("reset", email, later); const token = tokenOf(mails.at(-1));
    let changed = false;
    const racing = { dialect: d.dialect, prepare: (sql) => d.prepare(sql), async batch(statements) {
      if (!changed) { changed = true; await resetPassword(d, email, oldPassword); }
      return d.batch(statements);
    }};
    await assert.rejects(() => resetPasswordWithToken(racing, { token, password: newPassword }, later), e => e.status === 400);
    const row = await d.prepare("SELECT password_hash AS hash FROM auth_credentials WHERE user_id=?").bind(userId).first();
    assert.equal(await verifyPassword(oldPassword, row.hash), true);
  });
  await t.test("failed delivery removes only the unsent token and allows a later retry", async () => {
    const later = now + 10800003;
    const result = await prepareAccountEmail(d, { email }, "reset", async () => { throw new Error("SMTP-secret-must-not-be-logged"); }, env, later);
    const count = await d.prepare("SELECT count(*) AS n FROM auth_email_tokens WHERE user_id=? AND used_at IS NULL").bind(userId).first();
    assert.ok(count.n >= 1);
    const originalWarn = console.warn; const warnings = [];
    try { console.warn = (...values) => warnings.push(values.join(" ")); await result.delivery(); }
    finally { console.warn = originalWarn; }
    const after = await d.prepare("SELECT count(*) AS n FROM auth_email_tokens WHERE user_id=? AND used_at IS NULL").bind(userId).first();
    assert.equal(after.n, count.n - 1);
    assert.ok(!warnings.join(" ").includes("SMTP-secret"));
    await issue("reset", email, later);
  });
  await t.test("required verification is checked server-side without elevating account access", async () => {
    const previous = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
    try {
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "true";
      await requireVerifiedEmail(d, userId);
      await d.prepare("DELETE FROM auth_email_status WHERE user_id=?").bind(userId).run();
      await assert.rejects(() => requireVerifiedEmail(d, userId), e => e.status === 403);
      const owner = await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
      if (owner) await requireVerifiedEmail(d, owner.value);
    } finally {
      if (previous === undefined) delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
      else process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = previous;
    }
  });
}
