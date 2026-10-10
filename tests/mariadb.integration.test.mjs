import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { users, courses, attempts } from "../db/mariadb-schema.ts";
import {graduationActivation} from './graduation-acceptance.mjs';

test("MariaDB foundation on a disposable CI database", {
  skip: process.env.MARIADB_INTEGRATION_TEST !== "true",
}, async (t) => {
  // Never permit this fixture writer to target the user's hosting database.
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_NAME, "stem_ci");
  const { pool, db, database } = createMariaDb();
  try {
    await t.test("new database receives the schema and migration journal", async () => {
      assert.equal(await applyMariaDbMigrations(pool),15);
      const [tables] = await pool.query("SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
      assert.equal(tables.length,44);
      const business = tables.filter((row) => row.name !== "__stem_mariadb_migrations");
      assert.equal(business.length,43);
      for (const table of business) {
        assert.equal(table.engine, "InnoDB");
        assert.equal(table.collation, "utf8mb4_bin");
      }
    });
    await graduationActivation(t,database);
    await t.test("legacy duplicate preflight refuses unique migration without deleting evidence",async()=>{
      const [journal]=await pool.query("SELECT * FROM __stem_mariadb_migrations ORDER BY created_at DESC LIMIT 1");const last=journal[0];
      await pool.query("ALTER TABLE project_submissions DROP INDEX academic_submission_attempt");
      try{
        for(const id of ["duplicate-one","duplicate-two"])await pool.execute("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at) VALUES(?,'legacy-task','legacy-student',1,1,'Original','Original','','2026-10-10')",[id]);
        await pool.execute("DELETE FROM __stem_mariadb_migrations WHERE id=?",[last.id]);
        await assert.rejects(()=>applyMariaDbMigrations(pool),/Duplikasi percobaan/);
        const [[count]]=await pool.query("SELECT count(*) AS n FROM project_submissions WHERE assignment_id='legacy-task'");assert.equal(Number(count.n),2);
      }finally{
        await pool.query("DELETE FROM project_submissions WHERE assignment_id='legacy-task'");
        await pool.execute("INSERT IGNORE INTO __stem_mariadb_migrations(id,hash,created_at) VALUES(?,?,?)",[last.id,last.hash,last.created_at]);
        await pool.query("ALTER TABLE project_submissions ADD CONSTRAINT academic_submission_attempt UNIQUE(assignment_id,student_id,attempt)");
      }
    });
    await t.test("hosting collation overrides are normalized on reused read and write connections", async () => {
      const overrideSessions = async () => {
        const connections = await Promise.all(Array.from({ length: 3 }, () => pool.getConnection()));
        try {
          await Promise.all(connections.map((c) => c.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")));
        } finally { connections.forEach((c) => c.release()); }
      };
      await overrideSessions();
      const rows = await Promise.all(Array.from({ length: 3 }, () => database
        .prepare("SELECT @@collation_connection AS collation, COLLATION(?) AS parameterCollation, ?='owner' AS isOwner")
        .bind("owner", "owner").first()));
      for (const row of rows) {
        assert.equal(row.collation, "utf8mb4_bin");
        assert.equal(row.parameterCollation, "utf8mb4_bin");
        assert.equal(Number(row.isOwner), 1);
      }
      await overrideSessions();
      const writes = await Promise.all(Array.from({ length: 3 }, () => database
        .prepare("UPDATE users SET name=? WHERE id=? AND ?='owner'")
        .bind("unused", "nonexistent-collation-fixture", "owner").run()));
      assert.ok(writes.every((r) => r.meta.changes === 0));
    });
    await t.test("Unicode names, case-sensitive IDs and large JSON survive round trips", async () => {
      await db.insert(users).values([
        { id: "Learner", name: "Peserta 🛰️", role: "student" },
        { id: "learner", name: "Peserta kedua", role: "student" },
      ]);
      assert.equal((await db.select().from(users)).length, 2);
      const payload = JSON.stringify({ title: "ESP32 🌱", published: true, content: "a".repeat(100000) });
      await db.insert(courses).values({ id: "esp32", data: payload });
      assert.equal((await db.select().from(courses))[0].data, payload);
      const [rows] = await pool.execute("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.title')) AS title FROM courses WHERE id=?", ["esp32"]);
      assert.equal(rows[0].title, "ESP32 🌱");
    });
    await t.test("transactions roll back and leases retain epoch milliseconds", async () => {
      await assert.rejects(() => db.transaction(async (tx) => {
        await tx.insert(users).values({ id: "rolled-back", name: "Temporary", role: "student" });
        throw new Error("rollback-fixture");
      }), /rollback-fixture/);
      assert.equal((await db.select().from(users)).length, 2);
      const lease = 1791234567890;
      await db.insert(attempts).values({ id: "a1", userId: "Learner", courseId: "esp32", lessonId: "l1", revision: 1, kind: "code", state: "pending", data: "{}", pollAt: lease, createdAt: "2026-10-06T00:00:00.000Z" });
      assert.equal((await db.select().from(attempts))[0].pollAt, lease);
    });
    await t.test("rerunning migration preserves data and does not duplicate the journal", async () => {
      assert.equal(await applyMariaDbMigrations(pool), 0);
      assert.equal((await db.select().from(users)).length, 2);
      const [rows] = await pool.query("SELECT COUNT(*) AS count FROM __stem_mariadb_migrations");
      assert.equal(Number(rows[0].count),15);
      // A changed/unknown migration history is refused rather than reapplied.
      const [journal] = await pool.query("SELECT id,hash FROM __stem_mariadb_migrations");
      try {
        await pool.execute("UPDATE __stem_mariadb_migrations SET hash=?", ["invalid-fixture-hash"]);
        await assert.rejects(() => applyMariaDbMigrations(pool), /Riwayat migrasi tidak cocok/);
      } finally {
        for (const entry of journal) await pool.execute("UPDATE __stem_mariadb_migrations SET hash=? WHERE id=?", [entry.hash, entry.id]);
      }
    });
  } finally {
    await pool.end();
  }
});
