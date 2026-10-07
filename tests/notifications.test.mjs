import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { notificationScenarios } from "./notification-scenarios.mjs";

test("notification behavior and read receipts on disposable SQLite fixtures", async (t) => {
  const sql = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) sql.exec(fs.readFileSync(`drizzle/${file}`, "utf8"));
  // Node authentication is MariaDB-only. Mirror its table for recipient queries.
  sql.exec("CREATE TABLE auth_credentials(user_id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,display_name TEXT,password_hash TEXT,password_version INTEGER,created_at TEXT,updated_at TEXT)");
  const prepare = (query, values = []) => ({
    bind(...params) { return prepare(query, params); },
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async all() { return { results: sql.prepare(query).all(...values) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
  });
  const d = { prepare, async batch(statements) {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
  try { await notificationScenarios(t, d); } finally { sql.close(); }
});
