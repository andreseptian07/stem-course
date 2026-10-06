import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { learningScenarios } from "./learning-scenarios.mjs";

test("learning data port preserves SQLite behavior", async (t) => {
  const sql = new DatabaseSync(":memory:");
  for (const f of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) sql.exec(fs.readFileSync(`drizzle/${f}`, "utf8"));
  let queue = Promise.resolve();
  const prepare = (query, values = []) => ({
    bind(...params) { return prepare(query, params); },
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async all() { return { results: sql.prepare(query).all(...values) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
  });
  const d = {
    prepare,
    batch(statements) {
      const result = queue.then(async () => {
        sql.exec("BEGIN");
        try {
          const results = [];
          for (const s of statements) results.push(await s.run());
          sql.exec("COMMIT");
          return results;
        } catch (error) { sql.exec("ROLLBACK"); throw error; }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  try { await learningScenarios(t, d); } finally { sql.close(); }
});
