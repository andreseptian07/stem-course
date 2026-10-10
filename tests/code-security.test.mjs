import {seedSqlitePrincipal} from "./authorization-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import {
  submitCode,
  pollCode,
  encode,
  gradeCode,
  validateConfig,
  inspectJudge,
} from "../lib/judge.ts";
import {
  startAttempt,
  readAttempt,
  releaseAttempt,
} from "../lib/code-attempts.ts";
const cfg = {
  url: "https://judge.example.com",
  token: "test-secret",
  languageIds: { python: 71 },
};
function database() {
  const sql = new DatabaseSync(":memory:");
  for (const f of fs
    .readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  const d = {
    prepare(q) {
      return {
        bind(...params) {
          return {
            async first() {
              return sql.prepare(q).get(...params) || null;
            },
            async all() {
              return { results: sql.prepare(q).all(...params) };
            },
            async run() {
              return {
                meta: {
                  changes: Number(sql.prepare(q).run(...params).changes),
                },
              };
            },
          };
        },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        sql.exec("COMMIT");
        return r;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  sql.prepare("INSERT INTO courses(id,data,version) VALUES(?, ?,1)").run("course",JSON.stringify({id:"course",published:true,graduationPolicyVersion:2,learningMode:"independent_allowed",policyState:"ready",lessons:[lesson]}));
  for(const id of ["student","other"]){sql.prepare("INSERT INTO users(id,name,role) VALUES(?,?,'student')").run(id,id);sql.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'active',1,'2026','2026')").run(id);seedSqlitePrincipal(sql,id,"student");sql.prepare("INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,'course','2026',?)").run(id,"fixture:"+id);}
  return { d, sql };
}
const lesson = {
  id: "lab",
  revision: 1,
  exercise: {
    language: "python",
    maxAttempts: 3,
    tests: [
      { input: "hi", expected: "hi", hidden: false },
      { input: "secret", expected: "secret", hidden: true },
    ],
  },
};
function initialize(sql, user = "student") {
  sql
    .prepare(
      "INSERT INTO learning_progress_revisions(user_id,course_id,lesson_id,revision) VALUES(?,?,?,1)",
    )
    .run(user, "course", "lab");
}
function acceptedFetch() {
  return async (url, init) => {
    if (init.method === "POST")
      return Response.json([{ token: "t1" }, { token: "t2" }]);
    return Response.json({
      submissions: [
        {
          token: "t2",
          status: { id: 3, description: "secret-provider-text" },
          stdout: encode("secret"),
        },
        { token: "t1", status: { id: 3 }, stdout: encode("hi") },
      ],
    });
  };
}
test("endpoint credentials, private IPs, unsafe URLs and redirects are guarded", async () => {
  for (const url of [
    "http://judge.example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://judge.internal",
    "https://user:pass@judge.example.com",
    "https://judge.example.com?token=x",
    "https://judge.example.com:444",
  ])
    assert.throws(() => validateConfig({ ...cfg, url }));
  assert.throws(() => validateConfig({ ...cfg, token: "" }));
  assert.throws(() => validateConfig({ ...cfg, languageIds: { python: NaN } }));
  await submitCode(
    cfg,
    "python",
    "print(1)",
    [{ input: "", expected: "1" }],
    async (url, init) => {
      assert.equal(init.redirect, "error");
      const p = JSON.parse(init.body).submissions[0];
      assert.equal(p.enable_network, false);
      assert.equal(p.enable_per_process_and_thread_memory_limit, false);
      assert.equal(p.max_file_size, 64);
      assert.equal(atob(p.source_code), "print(1)");
      return Response.json([{ token: "one" }]);
    },
  );
});
test("binary output decoded; results reordered by verified token; hidden output cannot leak", async () => {
  const result = await pollCode(cfg, ["t1", "t2"], acceptedFetch());
  const grade = gradeCode(result, [false, true]);
  assert.equal(grade.score, 100);
  assert.equal(grade.tests[0].stdout, "hi");
  assert.equal(JSON.stringify(grade).includes("secret"), false);
  for (const submissions of [
    [{ token: "evil", status: { id: 3 } }],
    [{ token: "t1", status: { id: 999 } }],
    [{ token: "t1", status: { id: 3 }, stdout: "%%" }],
  ])
    await assert.rejects(() =>
      pollCode(cfg, ["t1"], async () => Response.json({ submissions })),
    );
  assert.throws(() => gradeCode([{ status: { id: 13 } }], [false]));
});
test("oversized and partial upstream responses fail closed", async () => {
  await assert.rejects(() =>
    pollCode(cfg, ["t1"], async () => new Response("x".repeat(400001))),
  );
  await assert.rejects(() =>
    submitCode(cfg, "python", "x", lesson.exercise.tests, async () =>
      Response.json([{ token: "t1" }, { error: "bad" }]),
    ),
  );
});
test("database enforces active submission, idempotency, quota, hidden output and stale revisions", async () => {
  const { d, sql } = database();
  initialize(sql);
  let submits = 0;
  const fetcher = async (...args) => {
    if (args[1].method === "POST") submits++;
    return acceptedFetch()(...args);
  };
  const id = crypto.randomUUID();
  await startAttempt(
    d,
    cfg,
    "student",
    "course",
    lesson,
    "print(input())",
    id,
    fetcher,
  );
  await startAttempt(
    d,
    cfg,
    "student",
    "course",
    lesson,
    "print(input())",
    id,
    fetcher,
  );
  assert.equal(submits, 1);
  await assert.rejects(() =>
    startAttempt(
      d,
      cfg,
      "student",
      "course",
      lesson,
      "x",
      crypto.randomUUID(),
      fetcher,
    ),
  );
  await assert.rejects(() =>
    startAttempt(
      d,
      cfg,
      "other",
      "course",
      lesson,
      "print(input())",
      id,
      fetcher,
    ),
  );
  let a = sql.prepare("SELECT * FROM attempts WHERE id=?").get(id);
  const result = await readAttempt(d, cfg, "student", a, 2, fetcher);
  assert.equal(result.stale, true);
  assert.equal(result.passed, true);
  assert.equal(
    sql.prepare("SELECT code_passed FROM learning_progress_revisions").get().code_passed,
    0,
  );
  assert.equal(JSON.stringify(result).includes("secret"), false);
  const id2 = crypto.randomUUID();
  await startAttempt(
    d,
    cfg,
    "student",
    "course",
    lesson,
    "print(input())",
    id2,
    fetcher,
  );
  a = sql.prepare("SELECT * FROM attempts WHERE id=?").get(id2);
  await readAttempt(d, cfg, "student", a, 1, fetcher);
  assert.equal(
    sql.prepare("SELECT code_passed FROM learning_progress_revisions").get().code_passed,
    1,
  );
  const id3 = crypto.randomUUID();
  await startAttempt(
    d,
    cfg,
    "student",
    "course",
    lesson,
    "print(input())",
    id3,
    fetcher,
  );
  await releaseAttempt(d, id3, "student");
  await releaseAttempt(d, id3, "student");
  assert.equal(
    sql.prepare("SELECT code_attempts FROM learning_progress_revisions").get().code_attempts,
    2,
  );
});
test("service failure and expiration refund once, wrong answers consume quota, polling is leased", async () => {
  const { d, sql } = database();
  initialize(sql);
  const id = crypto.randomUUID();
  await assert.rejects(() =>
    startAttempt(
      d,
      cfg,
      "student",
      "course",
      lesson,
      "x",
      id,
      async () => new Response("down", { status: 503 }),
    ),
  );
  assert.equal(
    sql.prepare("SELECT code_attempts FROM learning_progress_revisions").get().code_attempts,
    0,
  );
  const id2 = crypto.randomUUID();
  await startAttempt(
    d,
    cfg,
    "student",
    "course",
    lesson,
    "x",
    id2,
    acceptedFetch(),
  );
  let a = sql.prepare("SELECT * FROM attempts WHERE id=?").get(id2);
  let calls = 0;
  const pending = async () => {
    calls++;
    return Response.json({
      submissions: [
        { token: "t1", status: { id: 1 } },
        { token: "t2", status: { id: 2 } },
      ],
    });
  };
  await readAttempt(d, cfg, "student", a, 1, pending);
  await readAttempt(d, cfg, "student", a, 1, pending);
  assert.equal(calls, 1);
  sql.prepare("UPDATE attempts SET poll_at=0 WHERE id=?").run(id2);
  await readAttempt(d, cfg, "student", a, 1, async () =>
    Response.json({
      submissions: [
        { token: "t1", status: { id: 4 } },
        { token: "t2", status: { id: 5 } },
      ],
    }),
  );
  assert.equal(
    sql.prepare("SELECT code_attempts FROM learning_progress_revisions").get().code_attempts,
    1,
  );
  assert.equal(
    sql.prepare("SELECT code_passed FROM learning_progress_revisions").get().code_passed,
    0,
  );
  const id3 = crypto.randomUUID();
  await startAttempt(
    d,
    cfg,
    "student",
    "course",
    lesson,
    "x",
    id3,
    acceptedFetch(),
  );
  a = sql.prepare("SELECT * FROM attempts WHERE id=?").get(id3);
  a.created_at = "2020-01-01";
  await readAttempt(d, cfg, "student", a, 1);
  await readAttempt(d, cfg, "student", a, 1);
  assert.equal(
    sql.prepare("SELECT code_attempts FROM learning_progress_revisions").get().code_attempts,
    1,
  );
});
test("operator health checks reject outdated service, network and missing languages", async () => {
  const r = await inspectJudge(cfg, async (url) =>
    Response.json(
      url.endsWith("about")
        ? { version: "1.13.0" }
        : url.endsWith("config_info")
          ? { enable_network: true, allow_enable_network: true }
          : [],
    ),
  );
  assert.equal(r.passed, false);
  assert.equal(
    r.checks.every((c) => !c.ok),
    true,
  );
});
