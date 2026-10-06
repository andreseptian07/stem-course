import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, validatePassword } from "../lib/auth-password.ts";
import { appOrigin, checkAuthOrigin, sessionCookie, safeReturnPath } from "../lib/auth-policy.ts";
import { registrationSchema } from "../lib/auth-data.ts";
import { readRequestText } from "../lib/request-body.ts";

test("production origin and cookie policy never permit insecure remote HTTP", () => {
  const env = { APP_URL: "https://course.example.com", NODE_ENV: "production" };
  assert.equal(appOrigin(env), env.APP_URL);
  assert.deepEqual(sessionCookie(env), { name: "__Host-stem-session", secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 28800 });
  for (const url of ["http://course.example.com", "http://localhost:5173", "https://user:pass@example.com", "https://example.com/path"]) assert.throws(() => appOrigin({ ...env, APP_URL: url, AUTH_ALLOW_LOCAL_HTTP: "true" }));
  assert.equal(sessionCookie({ APP_URL: "http://localhost:5173", NODE_ENV: "development", AUTH_ALLOW_LOCAL_HTTP: "true" }).secure, false);
});
test("CSRF origin is pinned to configuration and cannot be changed through Host or forwarding headers", () => {
  const env = { APP_URL: "https://course.example.com", NODE_ENV: "production" };
  checkAuthOrigin(new Request("http://localhost/api/auth", { headers: { origin: env.APP_URL } }), env);
  for (const headers of [{}, { origin: "https://evil.example.com", host: "evil.example.com" }, { origin: env.APP_URL, "sec-fetch-site": "cross-site" }]) assert.throws(() => checkAuthOrigin(new Request("https://evil.example.com/api/auth", { headers }), env));
});
test("return paths remain local and cannot trigger auth actions", () => {
  for (const path of ["https://evil.example.com", "//evil.example.com", "/\\evil.example.com", "/login", "/logout", "/api/auth", "/\n/evil.example.com"]) assert.equal(safeReturnPath(path), "/dashboard");
  assert.equal(safeReturnPath("/learn?course=esp32&lesson=sensor"), "/learn?course=esp32&lesson=sensor");
});
test("registration cannot claim ownership, verified email, or another account ID", () => {
  const valid = { email: "Learner@example.com", password: "unique-long-test-passphrase", displayName: "Peserta 🌱" };
  assert.equal(registrationSchema.parse(valid).email, "learner@example.com");
  for (const field of ["role", "userId", "emailVerified"]) assert.equal(registrationSchema.safeParse({ ...valid, [field]: "owner" }).success, false);
  assert.throws(() => validatePassword("short"));
});
test("salted scrypt hashes differ, preserve spaces/unicode, and reject malformed hashes", async () => {
  const password = "  passphrase-sangat-panjang 🌱  ";
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword("wrong-passphrase", null), false);
  assert.equal(await verifyPassword(password, "scrypt:999999:8:1:bad:bad"), false);
});
test("streaming request limits stop oversized or invalid UTF-8 bodies without trusting content-length", async () => {
  const valid = new Request("https://example.com", { method: "POST", body: "Peserta 🌱" });
  assert.equal(await readRequestText(valid, 32), "Peserta 🌱");
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(7000)); controller.close(); } });
  await assert.rejects(() => readRequestText(new Request("https://example.com", { method: "POST", body: stream, duplex: "half" }), 6000), (e) => e.status === 413);
  await assert.rejects(() => readRequestText(new Request("https://example.com", { method: "POST", body: new Uint8Array([255, 255]) }), 100), (e) => e.status === 400);
});
