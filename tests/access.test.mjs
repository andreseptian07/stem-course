import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import {
  registerIdentity,
  requireActive,
  updateAccess,
  accessOverview,
  accessMutation,
} from "../lib/access.ts";
function setup() {
  const sql = new DatabaseSync(":memory:");
  for (const f of fs
    .readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  const d = {
    prepare(q) {
      const make = (p = []) => ({
        bind(...params) {
          return make(params);
        },
        async first() {
          return sql.prepare(q).get(...p) || null;
        },
        async all() {
          return { results: sql.prepare(q).all(...p) };
        },
        async run() {
          return {
            meta: { changes: Number(sql.prepare(q).run(...p).changes) },
          };
        },
      });
      return make();
    },
    async batch(items) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const p of items) results.push(await p.run());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { d, sql };
}
const signed = (id) => ({ userId: id, displayName: id });
async function fixture() {
  const f = setup();
  f.owner = await registerIdentity(f.d, signed("owner"), true);
  f.alice = await registerIdentity(f.d, signed("alice"), false);
  return f;
}
test("disabled bootstrap cannot claim ownership; existing owner remains fixed", async () => {
  const f = setup();
  await assert.rejects(
    () => registerIdentity(f.d, signed("stranger"), false),
    (e) => e.status === 503,
  );
  const o = await registerIdentity(f.d, signed("owner"), true);
  assert.equal(o.role, "owner");
  const stranger = await registerIdentity(f.d, signed("stranger"), true);
  assert.equal(stranger.role, "student");
  assert.equal(stranger.accessStatus, "pending");
  assert.equal(
    f.sql.prepare("SELECT value FROM settings WHERE key='owner'").get().value,
    "owner",
  );
});
test("new accounts are pending; suspended and pending users cannot access learning", async () => {
  const f = await fixture();
  assert.throws(
    () => requireActive(f.alice),
    (e) => e.status === 403,
  );
  requireActive(f.owner);
  const self = await accessOverview(f.d, f.alice);
  assert.equal(self.status, "pending");
  assert.equal(self.users, undefined);
  assert.equal(self.events, undefined);
});
test("only persisted owner can approve and suspend, and owner cannot suspend itself", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      updateAccess(
        f.d,
        { ...f.alice, role: "owner" },
        { userId: "alice", version: 1, status: "active", reason: "fake role" },
      ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      updateAccess(f.d, f.owner, {
        userId: "owner",
        version: 1,
        status: "suspended",
        reason: "self",
      }),
    (e) => e.status === 400,
  );
  await updateAccess(f.d, f.owner, {
    userId: "alice",
    version: 1,
    status: "active",
    reason: "Approved for pilot",
  });
  let a = await registerIdentity(f.d, signed("alice"), false);
  requireActive(a);
  assert.equal(a.role, "student");
  await updateAccess(f.d, f.owner, {
    userId: "alice",
    version: 2,
    status: "suspended",
    reason: "Temporary restriction",
  });
  a = await registerIdentity(f.d, signed("alice"), false);
  assert.throws(
    () => requireActive(a),
    (e) => e.status === 403,
  );
  await updateAccess(f.d, f.owner, {
    userId: "alice",
    version: 3,
    status: "active",
    reason: "Restored",
  });
  requireActive(await registerIdentity(f.d, signed("alice"), false));
  assert.equal((await accessOverview(f.d, f.owner)).events.length, 3);
});
test("stale versions do not change status or duplicate audit, and audit failures roll back permissions", async () => {
  const f = await fixture();
  const b = {
    userId: "alice",
    version: 1,
    status: "active",
    reason: "Allowed",
  };
  await updateAccess(f.d, f.owner, b);
  await assert.rejects(
    () => updateAccess(f.d, f.owner, b),
    (e) => e.status === 409,
  );
  assert.equal((await accessOverview(f.d, f.owner)).events.length, 1);
  f.sql.exec(
    "CREATE TRIGGER reject_audit BEFORE INSERT ON access_events BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
  );
  await assert.rejects(() =>
    updateAccess(f.d, f.owner, { ...b, version: 2, status: "suspended" }),
  );
  const a = await registerIdentity(f.d, signed("alice"), false);
  assert.equal(a.accessStatus, "active");
  assert.equal(a.accessVersion, 2);
});
test("legacy users without access rows require approval, and saved client roles cannot grant ownership", async () => {
  const f = await fixture();
  f.sql
    .prepare(
      "INSERT INTO users(id,name,role) VALUES('legacy','Legacy','owner')",
    )
    .run();
  const list = await accessOverview(f.d, f.owner);
  assert.equal(list.users.find((u) => u.id === "legacy").status, "pending");
  await updateAccess(f.d, f.owner, {
    userId: "legacy",
    version: 0,
    status: "active",
    reason: "Review legacy account",
  });
  const u = await registerIdentity(f.d, signed("legacy"), false);
  assert.equal(u.role, "student");
  assert.equal(u.accessStatus, "active");
});
test("access mutations reject identity or role injection and require a reason", () => {
  const b = {
    userId: "alice",
    version: 1,
    status: "active",
    reason: "Approved",
  };
  for (const invalid of [
    { ...b, role: "owner" },
    { ...b, actorId: "owner" },
    { ...b, reason: "" },
    { ...b, status: "owner" },
    { ...b, version: -1 },
  ])
    assert.equal(accessMutation.safeParse(invalid).success, false);
});
test("once initialized, bootstrap stays closed even if owner settings are accidentally missing", async () => {
  const f = await fixture();
  f.sql.exec("DELETE FROM settings WHERE key='owner'");
  await assert.rejects(
    () => registerIdentity(f.d, signed("stranger"), true),
    (e) => e.status === 503,
  );
  assert.equal(
    f.sql.prepare("SELECT value FROM settings WHERE key='owner'").get(),
    undefined,
  );
});
