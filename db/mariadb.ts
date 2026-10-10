import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { mariaDbOptions } from "./mariadb-config.ts";
import * as schema from "./mariadb-schema.ts";
import { createMariaDbAdapter } from "./mariadb-adapter.ts";

// Server-only MariaDB driver. db/runtime.ts caches the pool for the Node app.
export function createMariaDb(env: Record<string, string | undefined> = process.env) {
  if (typeof window !== "undefined") throw new Error("Database hanya boleh diakses dari server.");
  const pool = createPool(mariaDbOptions(env));
  return { pool, db: drizzle(pool, { schema, mode: "default" }), database: createMariaDbAdapter(pool, {
    onEvent(event) {
      if (event.outcome !== "ok" || event.durationMs >= 1000)
        console.warn("Database operation", JSON.stringify(event));
    },
  }) };
}
