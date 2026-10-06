import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDbAdapter, DatabaseExecutionError } from "../db/mariadb-adapter.ts";

function fixture({ failure, rollbackFailure = false, releaseFailure = false } = {}) {
  const events = [];
  const connection = {
    async query() { return [[{ name: "stem_ci" }]]; },
    async execute(sql, values) {
      if (sql.startsWith("SELECT GET_LOCK")) { events.push("lock"); return [[{ acquired: 1 }]]; }
      if (sql.startsWith("SELECT RELEASE_LOCK")) {
        events.push("unlock");
        if (releaseFailure) throw new Error("private cleanup details");
        return [[{ released: 1 }]];
      }
      events.push({ sql, values });
      if (sql === failure) throw Object.assign(new Error("private SQL and credential details"), { code: "ER_NO_SUCH_TABLE" });
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
    async execute(sql, values) { events.push({ sql, values }); return [[{ id: values[0] }]]; },
  };
  return { d: createMariaDbAdapter(pool), pool, events };
}

test("MariaDB bindings are immutable and do not mix identities between reads", async () => {
  const { d, events } = fixture();
  const prepared = d.prepare("SELECT id FROM users WHERE id=?");
  const a = prepared.bind("alice"), b = prepared.bind("bob");
  assert.deepEqual(await a.first(), { id: "alice" });
  assert.deepEqual(await b.all(), { results: [{ id: "bob" }] });
  assert.deepEqual(events.map((e) => e.values), [["alice"], ["bob"]]);
  await assert.rejects(() => d.prepare("DELETE FROM users").first());
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
