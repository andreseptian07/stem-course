import test from "node:test";
import assert from "node:assert/strict";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { learningScenarios } from "./learning-scenarios.mjs";
import { reportScenarios } from "./report-scenarios.mjs";
import { certificateScenarios } from "./certificate-scenarios.mjs";
import { mediaScenarios } from "./media-scenarios.mjs";
import { projectFileScenarios } from "./project-file-scenarios.mjs";
import { notificationScenarios } from "./notification-scenarios.mjs";

test("learning features use the real MariaDB adapter", { skip: process.env.MARIADB_INTEGRATION_TEST !== "true" }, async (t) => {
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_NAME, "stem_ci");
  const { pool, database } = createMariaDb();
  try {
    await applyMariaDbMigrations(pool);
    await learningScenarios(t, database);
    await notificationScenarios(t, database);
    await projectFileScenarios(t, database);
    await mediaScenarios(t, database);
    await certificateScenarios(t, database);
    await reportScenarios(t, database);
  } finally { await pool.end(); }
});
