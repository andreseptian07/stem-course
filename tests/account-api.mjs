// Integration checks against the local mock-auth preview only.
import assert from "node:assert/strict";
const origin = process.env.STEM_TEST_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Run these checks only against the local preview.");
const signIn = await fetch(
  `${origin}/signin-with-chatgpt?return_to=/dashboard`,
  { redirect: "manual" },
);
const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Local mock sign-in must return a cookie");
async function account(body, requestOrigin = origin) {
  const r = await fetch(`${origin}/api/account`, {
    headers: {
      Cookie: cookie,
      ...(body
        ? { "Content-Type": "application/json", Origin: requestOrigin }
        : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw };
  }
  return { status: r.status, data };
}
assert.equal((await fetch(`${origin}/api/account`)).status, 401);
const before = await account();
assert.equal(before.status, 200);
const profile = before.data.profile;
assert.equal(
  (
    await account({
      action: "saveProfile",
      profile: { ...profile, role: "owner" },
    })
  ).status,
  400,
);
assert.equal(
  (
    await account({
      action: "saveProfile",
      profile: { ...profile, userId: "another-account" },
    })
  ).status,
  400,
);
assert.equal(
  (await account({ action: "saveProfile", profile }, "https://example.com"))
    .status,
  403,
);
const saved = await account({ action: "saveProfile", profile });
assert.equal(saved.status, 200);
assert.equal(saved.data.profile.version, profile.version + 1);
assert.equal((await account({ action: "saveProfile", profile })).status, 409);
const latest = await account();
assert.equal(latest.data.profile.version, saved.data.profile.version);
assert.equal(latest.data.profile.displayName, profile.displayName);
assert.equal(latest.data.user.name, profile.displayName);
assert.equal(
  (await account({ action: "enroll", courseId: "missing-fixture-course" }))
    .status,
  404,
);
const catalogResponse = await fetch(`${origin}/api/catalog`, {
  headers: { Cookie: cookie },
});
const catalog = await catalogResponse.json();
assert.equal("profile" in catalog, false);
assert.equal("email" in catalog.user, false);
assert.ok(catalog.courses.length, "Local seeded course is required");
const courseId = catalog.courses[0].id;
assert.equal((await account({ action: "enroll", courseId })).status, 200);
assert.equal((await account({ action: "enroll", courseId })).status, 200);
const dashboard = await account();
assert.equal(dashboard.data.courses.filter((c) => c.id === courseId).length, 1);
assert.ok(dashboard.data.courses.find((c) => c.id === courseId).enrolledAt);
console.log(
  "Account API: anonymous access, invalid role/account fields, origin check, persistence, optimistic conflict, catalog privacy and idempotent enrollment passed.",
);
