import { createMariaDb } from "../db/mariadb.ts";
import { mariaDbErrorMessage } from "../db/mariadb-config.ts";

let pool;
try {
  ({ pool } = createMariaDb());
  const [rows] = await pool.query("SELECT VERSION() AS version, DATABASE() AS name");
  const [status] = await pool.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  console.log(`Koneksi berhasil: ${rows[0].name}; server ${rows[0].version}.`);
  console.log(`TLS: ${status[0]?.Value ? "aktif" : "tidak aktif"}.`);
  console.log("Pemeriksaan ini tidak membuat tabel atau mengubah data.");
} catch (error) {
  console.error(mariaDbErrorMessage(error));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
