import { createHash } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { PlatformDatabase, DatabaseStatement, DatabaseValue, WriteResult } from "../lib/database.ts";

export class DatabaseExecutionError extends Error {
  code: string;
  constructor(error: unknown) {
    const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const code = /^[A-Z_0-9]+$/.test(raw) ? raw : "DATABASE_UNAVAILABLE";
    super(`Operasi database belum berhasil (${code}).`);
    this.code = code;
  }
}

class MariaStatement implements DatabaseStatement {
  owner: MariaDatabase;
  sql: string;
  values: DatabaseValue[];
  constructor(owner: MariaDatabase, sql: string, values: DatabaseValue[] = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: DatabaseValue[]) { return new MariaStatement(this.owner, this.sql, values); }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const rows = await this.owner.read<T>(this);
    return rows[0] ?? null;
  }
  async all<T = Record<string, unknown>>() { return { results: await this.owner.read<T>(this) }; }
  async run() { return (await this.owner.batch([this]))[0]; }
}

class MariaDatabase implements PlatformDatabase {
  readonly dialect = "mariadb" as const;
  pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  prepare(sql: string) { return new MariaStatement(this, sql); }
  async read<T>(statement: MariaStatement): Promise<T[]> {
    if (!/^\s*SELECT\b/i.test(statement.sql)) throw new Error("Gunakan run/batch untuk penulisan database.");
    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(statement.sql, statement.values);
      return rows as T[];
    } catch (error) { throw new DatabaseExecutionError(error); }
  }
  async batch(statements: DatabaseStatement[]): Promise<WriteResult[]> {
    if (!statements.length) return [];
    const writes = statements.map((s) => {
      if (!(s instanceof MariaStatement) || s.owner !== this)
        throw new Error("Pernyataan batch harus berasal dari koneksi database yang sama.");
      if (!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(s.sql))
        throw new Error("Batch aplikasi hanya menerima penulisan data, bukan perubahan skema.");
      return s;
    });
    let connection: PoolConnection | undefined;
    let lock: string | undefined;
    let transaction = false;
    try {
      connection = await this.pool.getConnection();
      const [db] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS name");
      const name = `stem-write-${createHash("sha256").update(String(db[0].name)).digest("hex").slice(0, 48)}`;
      const [locks] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 10) AS acquired", [name]);
      if (Number(locks[0].acquired) !== 1) throw Object.assign(new Error(), { code: "DATABASE_WRITE_BUSY" });
      lock = name;
      // D1 serializes writers. Preserve that behavior for predicate-based quotas
      // and approvals during the initial port; all app writes use this adapter.
      await connection.beginTransaction();
      transaction = true;
      const result: WriteResult[] = [];
      for (const s of writes) {
        const [row] = await connection.execute<ResultSetHeader>(s.sql, s.values);
        result.push({ meta: { changes: row.affectedRows } });
      }
      await connection.commit();
      transaction = false;
      return result;
    } catch (error) {
      if (transaction) {
        try { await connection?.rollback(); } catch {
          connection?.destroy();
          connection = undefined;
        }
      }
      throw new DatabaseExecutionError(error);
    } finally {
      if (connection) {
        let reusable = true;
        try {
          if (lock) await connection.execute("SELECT RELEASE_LOCK(?)", [lock]);
        } catch {
          reusable = false;
          connection.destroy();
        } finally { if (reusable) connection.release(); }
      }
    }
  }
}

export function createMariaDbAdapter(pool: Pool): PlatformDatabase {
  return new MariaDatabase(pool);
}
