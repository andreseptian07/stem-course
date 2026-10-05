import test from "node:test";
import assert from "node:assert/strict";
import {
  blockingLesson,
  gradeQuiz,
  publicCourse,
  canComplete,
} from "../lib/rules.ts";
import { courseSchema } from "../lib/validation.ts";
import { sampleCourse } from "../lib/seed.ts";
import { submitCode, pollCode } from "../lib/judge.ts";
test("review does not lock; required quiz locks subsequent lessons", () => {
  assert.equal(blockingLesson(sampleCourse, "sensor", []), undefined);
  assert.equal(blockingLesson(sampleCourse, "coding", []).id, "sensor");
});
test("passing prerequisite unlocks next lesson; stale revision does not", () => {
  const p = { lessonId: "sensor", revision: 1, quizPassed: 1 };
  assert.equal(blockingLesson(sampleCourse, "coding", [p]), undefined);
  assert.equal(
    blockingLesson(sampleCourse, "coding", [{ ...p, revision: 0 }]).id,
    "sensor",
  );
});
test("multi-answer grading rejects duplicates and partial answers", () => {
  const q = sampleCourse.lessons[1].quiz;
  assert.equal(gradeQuiz(q, { q2: [0, 1], q3: [1] }).score, 100);
  assert.equal(gradeQuiz(q, { q2: [0, 0], q3: [1] }).passed, false);
  assert.equal(gradeQuiz(q, { q2: [0], q3: [1] }).score, 50);
});
test("feedback follows configuration; correct answer indexes are never returned", () => {
  const q = { ...sampleCourse.lessons[1].quiz, feedback: "after_pass" };
  assert.deepEqual(gradeQuiz(q, { q2: [2] }).feedback, []);
  assert.equal(gradeQuiz(q, { q2: [0, 1], q3: [1] }).feedback.length, 2);
  assert.equal(
    "correct" in publicCourse(sampleCourse, []).lessons[1].quiz.questions[0],
    false,
  );
});
test("locked content and secret tests do not reach students", () => {
  const c = publicCourse(sampleCourse, []);
  assert.deepEqual(c.lessons[2].blocks, []);
  assert.equal(c.lessons[2].exercise, undefined);
  const unlocked = publicCourse(sampleCourse, [
    { lessonId: "sensor", revision: 1, quizPassed: 1 },
  ]);
  assert.equal(unlocked.lessons[2].exercise.tests.length, 2);
  assert.equal(unlocked.lessons[2].exercise.hiddenCount, 1);
  assert.equal(JSON.stringify(unlocked).includes("-10 0 10 20"), false);
});
test("completion cannot bypass required tests", () => {
  assert.equal(canComplete(sampleCourse.lessons[1], undefined), false);
  assert.equal(canComplete(sampleCourse.lessons[1], { quizPassed: 1 }), true);
  assert.equal(canComplete(sampleCourse.lessons[2], { codePassed: 0 }), false);
});
test("course validation rejects invalid answers, media and duplicate lessons", () => {
  assert.equal(courseSchema.safeParse(sampleCourse).success, true);
  for (const mutate of [
    (c) => (c.lessons[0].quiz.questions[0].correct = [99]),
    (c) => c.lessons.push(c.lessons[0]),
    (c) =>
      c.lessons[0].blocks.push({
        id: "bad",
        type: "video",
        content: "javascript:alert(1)",
      }),
  ]) {
    const c = structuredClone(sampleCourse);
    mutate(c);
    assert.equal(courseSchema.safeParse(c).success, false);
  }
});
test("sandbox adapter bounds resources, disables network and preserves stdin", async () => {
  let payload;
  const fake = async (url, init) => {
    assert.ok(url.startsWith("https://judge.test/submissions/batch"));
    payload = JSON.parse(init.body);
    return Response.json([{ token: "token-test" }]);
  };
  const tokens = await submitCode(
    { url: "https://judge.test", languageIds: { python: 71 } },
    "python",
    "print(input())",
    [{ input: "hello", expected: "hello" }],
    fake,
  );
  assert.deepEqual(tokens, ["token-test"]);
  assert.equal(payload.submissions[0].enable_network, false);
  assert.equal(payload.submissions[0].cpu_time_limit, 2);
  assert.equal(payload.submissions[0].memory_limit, 64000);
  assert.equal(payload.submissions[0].stdin, "hello");
});
test("sandbox rejects unsafe endpoint and incomplete service responses", async () => {
  await assert.rejects(() =>
    submitCode(
      { url: "http://judge.test", languageIds: { python: 71 } },
      "python",
      "x",
      [{ input: "", expected: "" }],
    ),
  );
  await assert.rejects(() =>
    pollCode({ url: "https://judge.test" }, ["token-test"], async () =>
      Response.json({ submissions: [] }),
    ),
  );
});

test("catalog exposes curriculum summaries without lesson contents, keys or private tests", async () => {
  const { catalogCourse } = await import("../lib/catalog.ts");
  const c = structuredClone(sampleCourse);
  c.overview = {
    outcomes: ["Memahami sensor"],
    requirements: ["Laptop"],
    audience: "Pemula",
    mentorName: "Pengajar",
    mentorBio: "Profil",
    format: "blended",
  };
  const catalog = catalogCourse(c);
  assert.equal(catalog.lessonCount, 5);
  assert.equal(catalog.minutes, 60);
  assert.equal(catalog.curriculum[1].required, true);
  assert.equal(catalog.overview.mentorName, "Pengajar");
  for (const l of catalog.curriculum) {
    assert.equal("blocks" in l, false);
    assert.equal(typeof l.quiz, "boolean");
    assert.equal("exercise" in l, false);
  }
  assert.equal("lessons" in catalog, false);
  assert.equal(
    courseSchema.safeParse({
      ...c,
      overview: { ...c.overview, outcomes: Array(21).fill("x") },
    }).success,
    false,
  );
});
