import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDb } from "../db/mariadb.ts";
import { createMariaDbAdapter } from "../db/mariadb-adapter.ts";
import { concurrentRead } from "../lib/concurrent-read.ts";

test("disposable MariaDB recovers stale reads and never duplicates uncertain commits", { skip: process.env.MARIADB_INTEGRATION_TEST !== "true" }, async t => {
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_NAME, "stem_ci");
  const { pool } = createMariaDb();
  try {
    await t.test("unbounded reads reproduce queue exhaustion; bounded reads complete on the same pool", async () => {
      const database = createMariaDbAdapter(pool);
      const items = Array.from({ length: 50 }, (_, index) => index);
      const read = value => database.prepare("SELECT ? AS value").bind(value).first();
      const before = await Promise.allSettled(items.map(read));
      assert.ok(before.some(result => result.status === "rejected" && result.reason.code === "DATABASE_QUEUE_FULL"));
      const after = await concurrentRead(items, read);
      assert.deepEqual(after.map(row => row.value), items);
    });
    await t.test("a killed connection is retried using a new connection", async () => {
      const stale = await pool.getConnection();
      await pool.query(`KILL CONNECTION ${Number(stale.threadId)}`);
      let checkouts = 0;
      const metrics = [];
      const database = createMariaDbAdapter({ async getConnection() { checkouts++; return checkouts === 1 ? stale : pool.getConnection(); } }, { onEvent: event => metrics.push(event) });
      assert.deepEqual(await database.prepare("SELECT ? AS value").bind("fresh").first(), { value: "fresh" });
      assert.equal(checkouts, 2);
      assert.equal(metrics[0].outcome, "retry");
    });
    await t.test("server commit followed by lost response is reported as unknown; persisted counter is exactly one", async () => {
      // Use a regular fixture table because pooled connections own different sessions.
      await pool.query("CREATE TABLE stage1_commit_counter(value INT NOT NULL)");
      await pool.query("INSERT INTO stage1_commit_counter VALUES(0)");
      const connection = await pool.getConnection();
      let checkouts = 0;
      const database = createMariaDbAdapter({ async getConnection() {
        checkouts++;
        return new Proxy(connection, { get(target, property) {
          if (property === "commit") return async () => {
            await target.commit();
            throw Object.assign(new Error("simulated lost commit response"), { code: "ECONNRESET" });
          };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        } });
      } });
      await assert.rejects(database.prepare("UPDATE stage1_commit_counter SET value=value+1").run(), error => error.writeOutcome === "unknown");
      assert.equal(checkouts, 1);
      const [[row]] = await pool.query("SELECT value FROM stage1_commit_counter");
      assert.equal(row.value, 1);
    });
  } finally { await pool.end(); }
});
