import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { mariaDbErrorMessage } from "../db/mariadb-config.ts";

if (!process.argv.includes("--apply")) {
  console.error("Perintah ini membuat tabel pada database yang dikonfigurasi. Untuk menerapkan: npm run db:migrate:mariadb -- --apply");
  process.exitCode = 1;
} else {
  let pool;
  try {
    ({ pool } = createMariaDb());
    const count = await applyMariaDbMigrations(pool);
    console.log(`Migrasi selesai: ${count} migrasi baru. Password tidak ditampilkan.`);
  } catch (error) {
    console.error(mariaDbErrorMessage(error));
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
