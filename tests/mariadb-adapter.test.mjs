import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDbAdapter, DatabaseExecutionError } from "../db/mariadb-adapter.ts";

function fixture({ failure, rollbackFailure = false, releaseFailure = false, initializationFailure = false } = {}) {
  const events = [];
  const connection = {
    async query(sql) {
      if (sql.startsWith("SET NAMES")) {
        events.push("normalize-session");
        if (initializationFailure) throw new Error("private initialization details");
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
      if (sql === failure) throw Object.assign(new Error("private SQL and credential details"), { code: "ER_NO_SUCH_TABLE" });
      if (sql.startsWith("SELECT")) return [[{ id: values[0] }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { events.push("begin"); },
    async commit() { events.push("commit"); },
    async rollback() { events.push("rollback"); if (rollbackFailure) throw new Error("private rollback details"); },
    release() { events.push("release"); },
    destroy() { events.push("destroy"); },
  };
  const pool = {
    async getConnection() { events.push("connection"); return connection; },
  };
  return { d: createMariaDbAdapter(pool), pool, events };
}

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
    assert.ok(events.includes("release"));
  }
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
