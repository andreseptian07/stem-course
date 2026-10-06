// Test local mock-auth preview only; creates one disposable class fixture.
import assert from "node:assert/strict";
const origin = process.env.STEM_TEST_ORIGIN || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw Error("Local preview only");
const sign = await fetch(origin + "/signin-with-chatgpt?return_to=/classes", {
  redirect: "manual",
});
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function api(body, requestOrigin = origin, id = "") {
  const r = await fetch(origin + "/api/classes" + (id ? "?class=" + id : ""), {
    headers: {
      Cookie: cookie,
      ...(body
        ? { "Content-Type": "application/json", Origin: requestOrigin }
        : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = {};
  }
  return { status: r.status, data };
}
assert.equal((await fetch(origin + "/api/classes")).status, 401);
const initial = await api();
assert.equal(initial.status, 200);
assert.equal(initial.data.user.role, "owner");
const form = {
  id: "class-api-local",
  version:
    initial.data.classes.find((c) => c.id === "class-api-local")?.version || 0,
  courseId: "esp32-starter",
  mentorId: initial.data.user.id,
  name: "Uji lokal — kelas API",
  description: "Fixture pengujian lokal",
  startsAt: null,
  endsAt: null,
  capacity: 1,
  status: "open",
};
assert.equal(
  (await api({ action: "saveClass", class: form }, "https://example.com"))
    .status,
  403,
);
assert.equal(
  (await api({ action: "saveClass", class: { ...form, role: "owner" } }))
    .status,
  400,
);
assert.equal((await api({ action: "saveClass", class: form })).status, 200);
assert.equal((await api({ action: "saveClass", class: form })).status, 409);
assert.equal(
  (
    await api({
      action: "membership",
      classId: form.id,
      userId: initial.data.user.id,
      status: "approved",
    })
  ).status,
  200,
);
assert.equal(
  (
    await api({
      action: "post",
      classId: form.id,
      kind: "announcement",
      body: "Pengumuman contoh lokal",
      role: "mentor",
    })
  ).status,
  400,
);
assert.equal(
  (
    await api({
      action: "post",
      classId: form.id,
      kind: "announcement",
      body: "Pengumuman contoh lokal",
    })
  ).status,
  200,
);
const detail = await api(undefined, origin, form.id);
assert.equal(detail.status, 200);
assert.equal(detail.data.members.length, 1);
assert.ok(detail.data.members[0].progress);
assert.equal(detail.data.posts.at(-1).body, "Pengumuman contoh lokal");
assert.equal((await api(undefined, origin, "missing-class")).status, 404);
console.log(
  "Classes API: anonymous access, origin, strict fields, version conflict, membership, announcement and persisted roster checked.",
);
