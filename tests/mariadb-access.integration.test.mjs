import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { registerIdentity, updateAccess, accessOverview, requireActive } from "../lib/access.ts";

test("account approval port uses MariaDB transactions and preserves authorization", {
  skip: process.env.MARIADB_INTEGRATION_TEST !== "true",
}, async (t) => {
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_NAME, "stem_ci");
  const { pool, database: d } = createMariaDb();
  try {
    await applyMariaDbMigrations(pool);
    const ownerId = "access-owner", aliceId = "access-alice";
    const ownerSigned = { userId: ownerId, displayName: "Pengelola 🛰️" };
    const aliceSigned = { userId: aliceId, displayName: "Peserta 🌱" };
    let owner, alice;
    await t.test("closed bootstrap cannot be claimed, new learner is pending, owner remains fixed", async () => {
      await assert.rejects(() => registerIdentity(d, aliceSigned, false), (e) => e.status === 503);
      owner = await registerIdentity(d, ownerSigned, true);
      alice = await registerIdentity(d, aliceSigned, true);
      assert.equal(owner.role, "owner");
      assert.equal(alice.role, "student");
      assert.equal(alice.accessStatus, "pending");
      assert.throws(() => requireActive(alice), (e) => e.status === 403);
      assert.equal((await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first()).value, ownerId);
      // Repeated identities keep the same access version and status.
      assert.equal((await registerIdentity(d, aliceSigned, true)).accessVersion, 1);
    });
    await t.test("unauthorized approval and owner suspension are rejected", async () => {
      await assert.rejects(() => updateAccess(d, alice, { userId: aliceId, version: 1, status: "active", reason: "forged" }), (e) => e.status === 403);
      await assert.rejects(() => updateAccess(d, owner, { userId: ownerId, version: 1, status: "suspended", reason: "self" }), (e) => e.status === 400);
    });
    await t.test("two concurrent approvals create one version change and one audit", async () => {
      const results = await Promise.allSettled([
        updateAccess(d, owner, { userId: aliceId, version: 1, status: "active", reason: "approved A" }),
        updateAccess(d, owner, { userId: aliceId, version: 1, status: "active", reason: "approved B" }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
      alice = await registerIdentity(d, aliceSigned, false);
      assert.equal(alice.accessStatus, "active");
      assert.equal(alice.accessVersion, 2);
      const audit = await d.prepare("SELECT COUNT(*) AS count FROM access_events WHERE target_id=?").bind(aliceId).first();
      assert.equal(Number(audit.count), 1);
      const overview = await accessOverview(d, owner);
      assert.equal(overview.events.find((e) => e.targetId === aliceId).status, "active");
      assert.equal((await accessOverview(d, alice)).users, undefined);
    });
    await t.test("audit failure rolls back approval and does not leave a connection lock", async () => {
      const failing = {
        dialect: "mariadb",
        prepare(sql) { return d.prepare(sql.includes("INSERT INTO access_events") ? "INSERT INTO deliberately_missing_audit_table(id) VALUES(?)" : sql); },
        batch(statements) { return d.batch(statements); },
      };
      await assert.rejects(() => updateAccess(failing, owner, { userId: aliceId, version: 2, status: "suspended", reason: "rollback" }));
      const row = await d.prepare("SELECT status,version FROM user_access WHERE user_id=?").bind(aliceId).first();
      assert.equal(row.status, "active");
      assert.equal(row.version, 2);
      await updateAccess(d, owner, { userId: aliceId, version: 2, status: "suspended", reason: "suspend" });
      alice = await registerIdentity(d, aliceSigned, false);
      assert.equal(alice.accessStatus, "suspended");
      assert.throws(() => requireActive(alice), (e) => e.status === 403);
    });
    await t.test("no-op insert reports zero and statements cannot cross databases or perform DDL", async () => {
      const noOp = await d.prepare("INSERT INTO users(id,name,role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=id").bind(aliceId, "ignored", "student").run();
      assert.equal(noOp.meta.changes, 0);
      const { database: other, pool: otherPool } = createMariaDb();
      try {
        await assert.rejects(() => d.batch([other.prepare("DELETE FROM users WHERE id=?").bind("never")]));
        await assert.rejects(() => d.prepare("CREATE TABLE never_created(id INT)").run());
      } finally { await otherPool.end(); }
    });
  } finally { await pool.end(); }
});
