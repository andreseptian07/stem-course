import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { MariaDbSetupError } from "./mariadb-config.ts";

const journalTable = "__stem_mariadb_migrations";
const migrationsFolder = fileURLToPath(new URL("../mariadb/", import.meta.url));

export async function applyMariaDbMigrations(pool: Pool) {
  const connection = await pool.getConnection();
  let lock: string | undefined;
  try {
    const [info] = await connection.query<RowDataPacket[]>("SELECT VERSION() AS version, DATABASE() AS name");
    const version = String(info[0].version).replace(/^5\.5\.5-/, "");
    const parts = version.match(/^(\d+)\.(\d+)/);
    if (!/MariaDB/i.test(version) || !parts || Number(parts[1]) < 10 ||
      (Number(parts[1]) === 10 && Number(parts[2]) < 11))
      throw new MariaDbSetupError("Migrasi ini ditargetkan untuk MariaDB 10.11 atau lebih baru. Konfirmasikan versi server dahulu.");
    const lockName = `stem-schema-${createHash("sha256").update(String(info[0].name)).digest("hex").slice(0, 48)}`;
    const [locks] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
    if (Number(locks[0].acquired) !== 1) throw new MariaDbSetupError("Migrasi lain sedang berjalan. Coba kembali setelah selesai.");
    lock = lockName;

    const migrations = readMigrationFiles({ migrationsFolder });
    const [tables] = await connection.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
    );
    let applied: RowDataPacket[] = [];
    if (tables.some((t) => t.name === journalTable)) {
      [applied] = await connection.query<RowDataPacket[]>(`SELECT hash, created_at FROM \`${journalTable}\``);
      for (const row of applied) {
        const file = migrations.find((m) => m.folderMillis === Number(row.created_at));
        if (!file || file.hash !== row.hash)
          throw new MariaDbSetupError("Riwayat migrasi tidak cocok dengan source. Jangan mengubah migrasi yang sudah diterapkan.");
      }
    }
    if (!applied.length && tables.some((t) => t.name !== journalTable))
      throw new MariaDbSetupError("Database belum memiliki riwayat STEM tetapi sudah berisi tabel. Migrasi dihentikan untuk melindungi data; gunakan database kosong atau tinjau tabel yang sudah ada.");

    // DDL in MariaDB implicitly commits. A failed schema change may leave tables;
    // preflight above refuses to silently rerun a partially installed foundation.
    await migrate(drizzle(connection), { migrationsFolder, migrationsTable: journalTable });
    return migrations.length - applied.length;
  } finally {
    try {
      if (lock) await connection.execute("SELECT RELEASE_LOCK(?)", [lock]);
    } finally {
      connection.release();
    }
  }
}
