import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const sign = await fetch(base + "/signin-with-chatgpt?return_to=/classes", {
  redirect: "manual",
});
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const auth = { Cookie: cookie };
const classes = await fetch(base + "/api/classes", { headers: auth }).then(
  (r) => r.json(),
);
const c = classes.classes.find((x) =>
  x.name.startsWith("Uji lokal — kelas ESP32"),
);
assert.ok(c, "Gunakan hanya fixture kelas lokal.");
const anonymous = await fetch(base + "/api/projects?class=" + c.id);
assert.equal(anonymous.status, 401);
const send = (body, origin = base) =>
  fetch(base + "/api/projects", {
    method: "POST",
    headers: { ...auth, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const a = {
  id: crypto.randomUUID(),
  classId: c.id,
  version: 0,
  title: "Uji API lokal — tugas proyek",
  instructions: "Fixture API lokal",
  dueAt: null,
  status: "draft",
};
assert.equal(
  (
    await send(
      { action: "saveAssignment", assignment: a },
      "https://example.com",
    )
  ).status,
  403,
);
assert.equal(
  (
    await send({
      action: "saveAssignment",
      assignment: { ...a, role: "owner" },
    })
  ).status,
  400,
);
assert.equal(
  (await send({ action: "saveAssignment", assignment: a })).status,
  200,
);
assert.equal(
  (
    await send({
      action: "saveAssignment",
      assignment: { ...a, version: 1, status: "published" },
    })
  ).status,
  200,
);
assert.equal(
  (
    await send({
      action: "saveAssignment",
      assignment: { ...a, version: 1, status: "closed" },
    })
  ).status,
  409,
);
const data = await fetch(base + "/api/projects?class=" + c.id, {
  headers: auth,
}).then((r) => r.json());
assert.ok(data.tasks.some((t) => t.id === a.id && t.version === 2));
console.log(
  "Project API: auth, origin, strict inputs, persistence and version conflicts passed (localhost only).",
);
