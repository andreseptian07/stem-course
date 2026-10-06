// Local mock-auth preview only. Creates one clearly named test course, never production data.
import assert from "node:assert/strict";
import { sampleCourse } from "../lib/seed.ts";
const origin = process.env.STEM_TEST_ORIGIN || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw Error("Local preview only");
const sign = await fetch(origin + "/signin-with-chatgpt?return_to=/learn", {
  redirect: "manual",
});
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function api(path, body, requestOrigin = origin) {
  const r = await fetch(origin + path, {
    headers: {
      Cookie: cookie,
      ...(body
        ? { "Content-Type": "application/json", Origin: requestOrigin }
        : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
assert.equal(
  (
    await fetch(origin + "/api/judge", {
      method: "POST",
      headers: { Origin: origin },
    })
  ).status,
  401,
);
const c = structuredClone(sampleCourse);
c.id = "browser-js-local";
c.title = "Uji lokal — latihan JavaScript";
c.lessons = [c.lessons[2]];
c.lessons[0].exercise.language = "javascript";
c.lessons[0].exercise.starter = "print(input());";
c.lessons[0].exercise.tests = [
  { input: "hello", expected: "hello", hidden: false },
  { input: "secret-local", expected: "secret-local", hidden: true },
];
const existing = await api("/api/studio?admin=1");
c.version = existing.data.courses.find((x) => x.id === c.id)?.version || 0;
assert.equal(
  (await api("/api/studio", { action: "saveCourse", course: c })).status,
  200,
);
assert.equal((await api("/api/judge", {})).data.passed, false);
assert.equal(
  (await api("/api/studio?attempt=" + crypto.randomUUID())).status,
  404,
);
const before = await api("/api/studio");
assert.equal(
  JSON.stringify(before.data.courses).includes("secret-local"),
  false,
);
assert.equal(
  (
    await api("/api/studio", {
      action: "complete",
      courseId: c.id,
      lessonId: c.lessons[0].id,
      codePassed: true,
      score: 100,
    })
  ).status,
  403,
);
assert.equal(
  (
    await api("/api/studio", {
      action: "code",
      courseId: c.id,
      lessonId: c.lessons[0].id,
      source: "print(input())",
      requestId: crypto.randomUUID(),
      passed: true,
    })
  ).status,
  503,
);
const after = await api("/api/studio");
const p = after.data.progress[c.id][0];
assert.equal(p.codePassed, 0);
assert.equal(p.codeAttempts, 0);
console.log(
  "Coding API: anonymous health rejected, missing attempt hidden, secret tests hidden, client pass cannot bypass gate, disabled service consumes no quota. Local JS fixture ready.",
);
