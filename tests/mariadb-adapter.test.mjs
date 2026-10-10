import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDbAdapter, DatabaseExecutionError } from "../db/mariadb-adapter.ts";
import { databaseFailureMessage } from "../lib/database-failure.ts";
import { concurrentRead } from "../lib/concurrent-read.ts";

function fixture({ failure, failureCode = "ER_NO_SUCH_TABLE", rollbackFailure = false, releaseFailure = false, initializationFailure = false, commitFailure = false } = {}) {
  const events = [];
  const connection = {
    async query(sql) {
      if (sql.startsWith("SET NAMES")) {
        events.push("normalize-session");
        if (initializationFailure) throw Object.assign(new Error("private initialization details"), { code: initializationFailure === true ? "ER_UNKNOWN_ERROR" : initializationFailure });
        return [{ affectedRows: 0 }];
      }
      return [[{ name: "stem_ci" }]];
    },
    async execute(sql, values) {
      if (sql.startsWith("SELECT GET_LOCK")) { events.push("lock"); return [[{ acquired: 1 }]]; }
      if (sql.startsWith("SELECT RELEASE_LOCK")) {
        events.push("unlock");
        if (releaseFailure) throw new Error("private cleanup details");
        return [[{ released: 1 }]];
      }
      events.push({ sql, values });
      if (sql === failure) throw Object.assign(new Error("private SQL and credential details"), { code: failureCode });
      if (sql.startsWith("SELECT")) return [[{ id: values[0] }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { events.push("begin"); },
    async commit() { events.push("commit"); if (commitFailure) throw Object.assign(new Error("private commit details"), { code: "ECONNRESET" }); },
    async rollback() { events.push("rollback"); if (rollbackFailure) throw new Error("private rollback details"); },
    release() { events.push("release"); },
    destroy() { events.push("destroy"); },
  };
  const pool = {
    async getConnection() { events.push("connection"); return connection; },
  };
  return { d: createMariaDbAdapter(pool), pool, events };
}

test("uncertain writes require verification while read and rollback errors keep normal recovery", () => {
  const fallback = "Coba lagi.";
  const unknown = new DatabaseExecutionError({ code: "ECONNRESET", sql: "secret" }, "unknown");
  const message = databaseFailureMessage(unknown, fallback);
  assert.match(message, /periksa hasil sebelum/);
  assert.ok(!message.includes("secret"));
  for (const error of [new Error("internal"), new DatabaseExecutionError(null), new DatabaseExecutionError(null, "rolled_back"), new DatabaseExecutionError(null, "not_started")])
    assert.equal(databaseFailureMessage(error, fallback), fallback);
});
test("course reads have bounded fan-out and settle in-flight work before failing", async () => {
  let running = 0, peak = 0, finished = 0;
  const read = async value => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => setImmediate(resolve));
    running--; finished++;
    return value;
  };
  assert.deepEqual(await concurrentRead(Array.from({ length: 40 }, (_, i) => i), read), Array.from({ length: 40 }, (_, i) => i));
  assert.equal(peak, 3);
  finished = 0;
  await assert.rejects(concurrentRead([0, 1, 2, 3], async value => {
    if (value === 0) throw new Error("read failure");
    return read(value);
  }), /read failure/);
  assert.equal(running, 0);
  assert.equal(finished, 2);
});

test("MariaDB bindings are immutable and do not mix identities between reads", async () => {
  const { d, events } = fixture();
  const prepared = d.prepare("SELECT id FROM users WHERE id=?");
  const a = prepared.bind("alice"), b = prepared.bind("bob");
  assert.deepEqual(await a.first(), { id: "alice" });
  assert.deepEqual(await b.all(), { results: [{ id: "bob" }] });
  assert.deepEqual(events.filter((e) => typeof e === "object").map((e) => e.values), [["alice"], ["bob"]]);
  await assert.rejects(() => d.prepare("DELETE FROM users").first());
});
test("every read and write checkout normalizes collation before preparing SQL", async () => {
  const { d, events } = fixture();
  await d.prepare("SELECT id FROM users WHERE id=?").bind("alice").first();
  await d.prepare("UPDATE users SET name=?").bind("new").run();
  assert.equal(events.filter((e) => e === "normalize-session").length, 2);
  const normalizations = events.flatMap((e, i) => e === "normalize-session" ? [i] : []);
  assert.ok(normalizations[0] < events.findIndex((e) => e.sql?.startsWith("SELECT id")));
  assert.ok(normalizations[1] < events.indexOf("lock"));
  assert.equal(events.filter((e) => e === "release").length, 2);
});
test("failed session normalization blocks application SQL and hides driver details", async () => {
  for (const writing of [false, true]) {
    const { d, events } = fixture({ initializationFailure: true });
    await assert.rejects(() => writing
      ? d.prepare("UPDATE users SET name=?").bind("new").run()
      : d.prepare("SELECT id FROM users WHERE id=?").bind("alice").first(),
    (e) => e instanceof DatabaseExecutionError && !e.message.includes("private"));
    assert.ok(!events.some((e) => typeof e === "object"));
    assert.ok(!events.includes("begin"));
    assert.ok(events.includes("destroy"));
    assert.ok(!events.includes("release"));
  }
});

test("a stale read connection is discarded and retried once with identical bindings", async () => {
  for (const duringNormalization of [true, false]) {
    const failed = fixture(duringNormalization ? { initializationFailure: "ECONNRESET" } : { failure: "SELECT id FROM users WHERE id=?", failureCode: "ETIMEDOUT" });
    const healthy = fixture();
    let checkouts = 0;
    const metrics = [];
    const d = createMariaDbAdapter({ async getConnection() { return (++checkouts === 1 ? failed : healthy).pool.getConnection(); } }, { onEvent: e => metrics.push(e) });
    assert.deepEqual(await d.prepare("SELECT id FROM users WHERE id=?").bind("alice").first(), { id: "alice" });
    assert.equal(checkouts, 2);
    assert.ok(failed.events.includes("destroy"));
    assert.ok(!failed.events.includes("release"));
    assert.deepEqual(healthy.events.find(e => typeof e === "object").values, ["alice"]);
    assert.equal(metrics[0].outcome, "retry");
    assert.equal(metrics.at(-1).attempt, 2);
    assert.ok(!JSON.stringify(metrics).includes("alice"));
    assert.ok(!JSON.stringify(metrics).includes("private"));
  }
});

test("repeated transport failures stop after two reads; SQL errors and locking reads are not replayed", async () => {
  for (const [sql, code, expected] of [["SELECT id FROM users WHERE id=?", "ECONNRESET", 2], ["SELECT id FROM users WHERE id=?", "ER_PARSE_ERROR", 1], ["SELECT id FROM users WHERE id=? FOR UPDATE", "ECONNRESET", 1]]) {
    let checkouts = 0;
    const d = createMariaDbAdapter({ async getConnection() { checkouts++; return fixture({ failure: sql, failureCode: code }).pool.getConnection(); } });
    await assert.rejects(d.prepare(sql).bind("alice").first(), e => e instanceof DatabaseExecutionError && e.code === code && !e.message.includes("private"));
    assert.equal(checkouts, expected);
  }
});

test("writes only retry checkout/normalization before application SQL", async () => {
  const failed = fixture({ initializationFailure: "ECONNRESET" }), healthy = fixture();
  let checkouts = 0;
  const d = createMariaDbAdapter({ async getConnection() { return (++checkouts === 1 ? failed : healthy).pool.getConnection(); } });
  assert.equal((await d.prepare("UPDATE users SET name=?").bind("new").run()).meta.changes, 1);
  assert.equal(checkouts, 2);
  assert.ok(!failed.events.includes("begin"));
  assert.equal(healthy.events.filter(e => e.sql === "UPDATE users SET name=?").length, 1);
  assert.ok(failed.events.includes("destroy"));
});

test("a transport error during a write is never replayed and commit loss is reported as uncertain", async () => {
  for (const atCommit of [false, true]) {
    const f = fixture(atCommit ? { commitFailure: true } : { failure: "UPDATE users SET name=?", failureCode: "ECONNRESET" });
    let checkouts = 0;
    const metrics = [];
    const d = createMariaDbAdapter({ async getConnection() { checkouts++; return f.pool.getConnection(); } }, { onEvent: e => metrics.push(e) });
    await assert.rejects(d.prepare("UPDATE users SET name=?").bind("new").run(), e => e instanceof DatabaseExecutionError && e.writeOutcome === (atCommit ? "unknown" : "rolled_back"));
    assert.equal(checkouts, 1);
    assert.equal(f.events.filter(e => e.sql === "UPDATE users SET name=?").length, 1);
    assert.ok(f.events.includes("destroy"));
    assert.equal(metrics.at(-1).phase, atCommit ? "commit" : "execute");
    assert.ok(!JSON.stringify(metrics).includes("private"));
  }
});

test("diagnostic handlers cannot make successful operations fail", async () => {
  const f = fixture();
  const d = createMariaDbAdapter(f.pool, { onEvent() { throw new Error("diagnostic failed"); } });
  assert.deepEqual(await d.prepare("SELECT id FROM users WHERE id=?").bind("alice").first(), { id: "alice" });
  assert.equal((await d.prepare("UPDATE users SET name=?").bind("new").run()).meta.changes, 1);
});
test("a failed audit rolls back the entire batch and hides driver details", async () => {
  const { d, events } = fixture({ failure: "INSERT INTO missing VALUES(?)" });
  await assert.rejects(() => d.batch([
    d.prepare("UPDATE user_access SET status=?").bind("active"),
    d.prepare("INSERT INTO missing VALUES(?)").bind("audit"),
  ]), (e) => e instanceof DatabaseExecutionError && !e.message.includes("private"));
  assert.ok(events.includes("rollback"));
  assert.ok(!events.includes("commit"));
  assert.ok(events.indexOf("unlock") < events.indexOf("release"));
});
test("connections with failed rollback or lock cleanup are destroyed instead of reused", async () => {
  const a = fixture({ failure: "DELETE FROM missing", rollbackFailure: true });
  await assert.rejects(() => a.d.prepare("DELETE FROM missing").run(), DatabaseExecutionError);
  assert.ok(a.events.includes("destroy"));
  assert.ok(!a.events.includes("release"));
  const b = fixture({ releaseFailure: true });
  assert.equal((await b.d.prepare("UPDATE users SET name=?").bind("new").run()).meta.changes, 1);
  assert.ok(b.events.includes("commit"));
  assert.ok(b.events.includes("destroy"));
  assert.ok(!b.events.includes("release"));
});
test("foreign statements and schema changes are rejected before obtaining a connection", async () => {
  const a = fixture(), b = fixture();
  await assert.rejects(() => a.d.batch([b.d.prepare("DELETE FROM users")]));
  await assert.rejects(() => a.d.prepare("DROP TABLE users").run());
  assert.deepEqual(await a.d.batch([]), []);
  assert.deepEqual(a.events, []);
});
