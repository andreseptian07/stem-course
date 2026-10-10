import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { PlatformDatabase, DatabaseStatement, DatabaseValue, WriteResult } from "../lib/database.ts";

function databaseCode(error: unknown): string {
  const raw = error && typeof error === "object" && "code" in error ? String(error.code)
    : error instanceof Error && error.message === "Queue limit reached." ? "DATABASE_QUEUE_FULL"
    : error instanceof Error && error.message === "Pool is closed." ? "DATABASE_POOL_CLOSED"
    : error instanceof Error && error.message === "Can't add new command when connection is in closed state" ? "DATABASE_CONNECTION_CLOSED" : "";
  return /^[A-Z_0-9]+$/.test(raw) ? raw : "DATABASE_UNAVAILABLE";
}
export class DatabaseExecutionError extends Error {
  code: string;
  writeOutcome?: "not_started" | "rolled_back" | "unknown";
  constructor(error: unknown, writeOutcome?: DatabaseExecutionError["writeOutcome"]) {
    const code = databaseCode(error);
    super(`Operasi database belum berhasil (${code}).`);
    this.code = code;
    this.writeOutcome = writeOutcome;
  }
}

type Phase = "checkout" | "normalize" | "execute" | "lock" | "begin" | "commit";
export type DatabaseEvent = {
  operation: "read" | "write";
  phase: Phase;
  outcome: "ok" | "retry" | "failed";
  durationMs: number;
  attempt: number;
  code?: string;
  writeOutcome?: DatabaseExecutionError["writeOutcome"];
};
type AdapterOptions = { onEvent?: (event: DatabaseEvent) => void };
const transportErrors = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "PROTOCOL_CONNECTION_LOST", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR", "DATABASE_CONNECTION_CLOSED"]);
function transportFailure(error: unknown) {
  return transportErrors.has(databaseCode(error));
}
function replayableSelect(sql: string) {
  // App SELECTs are reads. Never replay explicit locks, variable assignments,
  // SELECT INTO or known session/sequence functions if supplied by a caller.
  return !/\b(FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|INTO|GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS|NEXTVAL|SETVAL|LAST_INSERT_ID)\b|:=/i.test(sql);
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
  options: AdapterOptions;
  constructor(pool: Pool, options: AdapterOptions) { this.pool = pool; this.options = options; }
  private report(event: DatabaseEvent) {
    // Observability must never alter an operation or expose SQL/bindings.
    try { this.options.onEvent?.(event); } catch { /* best effort */ }
  }
  prepare(sql: string) { return new MariaStatement(this, sql); }
  async read<T>(statement: MariaStatement): Promise<T[]> {
    if (!/^\s*SELECT\b/i.test(statement.sql)) throw new Error("Gunakan run/batch untuk penulisan database.");
    const start = performance.now();
    for (let attempt = 1; attempt <= 2; attempt++) {
      let connection: PoolConnection | undefined;
      let phase: Phase = "checkout";
      try {
        connection = await this.pool.getConnection();
        phase = "normalize";
        await this.initializeSession(connection);
        phase = "execute";
        const [rows] = await connection.execute<RowDataPacket[]>(statement.sql, statement.values);
        this.report({ operation: "read", phase, outcome: "ok", durationMs: Math.round(performance.now() - start), attempt });
        return rows as T[];
      } catch (error) {
        const failed = new DatabaseExecutionError(error);
        const retry = attempt === 1 && transportFailure(error) && (phase !== "execute" || replayableSelect(statement.sql));
        if (transportFailure(error) || phase === "normalize") {
          connection?.destroy();
          connection = undefined;
        }
        this.report({ operation: "read", phase, outcome: retry ? "retry" : "failed", durationMs: Math.round(performance.now() - start), attempt, code: failed.code });
        if (!retry) throw failed;
      } finally { connection?.release(); }
    }
    throw new DatabaseExecutionError(null);
  }
  private async initializeSession(connection: PoolConnection) {
    // Hosting init_connect can override the driver's handshake collation.
    // Normalize every checkout before preparing SQL, including reused sessions.
    await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_bin");
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
    const start = performance.now();
    let connection: PoolConnection | undefined;
    let lock: string | undefined;
    let transaction = false;
    let writeAttempt = 1;
    let phase: Phase = "checkout";
    try {
      // A transport failure before any application SQL can be retried safely.
      // Once the write starts, its batch is never replayed automatically.
      for (let attempt = 1; attempt <= 2; attempt++) {
        writeAttempt = attempt;
        try {
          phase = "checkout";
          connection = await this.pool.getConnection();
          phase = "normalize";
          await this.initializeSession(connection);
          break;
        } catch (error) {
          connection?.destroy();
          connection = undefined;
          if (attempt === 2 || !transportFailure(error)) throw error;
          this.report({ operation: "write", phase, outcome: "retry", durationMs: Math.round(performance.now() - start), attempt, code: new DatabaseExecutionError(error).code, writeOutcome: "not_started" });
        }
      }
      if (!connection) throw new DatabaseExecutionError(null);
      phase = "lock";
      const [db] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS name");
      const name = `stem-write-${createHash("sha256").update(String(db[0].name)).digest("hex").slice(0, 48)}`;
      const [locks] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 10) AS acquired", [name]);
      if (Number(locks[0].acquired) !== 1) throw Object.assign(new Error(), { code: "DATABASE_WRITE_BUSY" });
      lock = name;
      // D1 serializes writers. Preserve that behavior for predicate-based quotas
      // and approvals during the initial port; all app writes use this adapter.
      phase = "begin";
      await connection.beginTransaction();
      transaction = true;
      const result: WriteResult[] = [];
      for (const s of writes) {
        phase = "execute";
        const [row] = await connection.execute<ResultSetHeader>(s.sql, s.values);
        result.push({ meta: { changes: row.affectedRows } });
      }
      phase = "commit";
      await connection.commit();
      transaction = false;
      this.report({ operation: "write", phase, outcome: "ok", durationMs: Math.round(performance.now() - start), attempt: writeAttempt });
      return result;
    } catch (error) {
      let writeOutcome: DatabaseExecutionError["writeOutcome"] = transaction ? "unknown" : "not_started";
      if (transaction) {
        try {
          await connection?.rollback();
          // A COMMIT response can be lost after the server has committed.
          if (phase !== "commit") writeOutcome = "rolled_back";
        } catch {
          connection?.destroy();
          connection = undefined;
        }
      }
      if (connection && transportFailure(error)) {
        connection.destroy();
        connection = undefined;
      }
      const failed = new DatabaseExecutionError(error, writeOutcome);
      this.report({ operation: "write", phase, outcome: "failed", durationMs: Math.round(performance.now() - start), attempt: writeAttempt, code: failed.code, writeOutcome });
      throw failed;
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

export function createMariaDbAdapter(pool: Pool, options: AdapterOptions = {}): PlatformDatabase {
  return new MariaDatabase(pool, options);
}
