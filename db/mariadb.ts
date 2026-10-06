import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { mariaDbOptions } from "./mariadb-config.ts";
import * as schema from "./mariadb-schema.ts";

// Server-only foundation. The current Workers runtime continues to use db/index.ts.
export function createMariaDb(env: Record<string, string | undefined> = process.env) {
  if (typeof window !== "undefined") throw new Error("Database hanya boleh diakses dari server.");
  const pool = createPool(mariaDbOptions(env));
  return { pool, db: drizzle(pool, { schema, mode: "default" }) };
}
