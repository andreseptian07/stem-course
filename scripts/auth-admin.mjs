import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createMariaDb } from "../db/mariadb.ts";
import { createOwner, resetPassword } from "../lib/auth-data.ts";
import { AuthError } from "../lib/auth-policy.ts";
import { mariaDbErrorMessage } from "../db/mariadb-config.ts";

const command = process.argv[2];
if (!["create-owner", "reset-password"].includes(command) || process.argv.length !== 3 || !process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Gunakan terminal interaktif: npm run auth:admin -- create-owner atau npm run auth:admin -- reset-password. Password diminta tersembunyi, bukan sebagai argumen.");
  process.exitCode = 1;
} else {
  let hidden = false, pool;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const secret = async (prompt) => {
    process.stdout.write(prompt); hidden = true;
    try { return await rl.question(""); } finally { hidden = false; process.stdout.write("\n"); }
  };
  try {
    const email = await rl.question("Email akun: ");
    const displayName = command === "create-owner" ? await rl.question("Nama pengelola: ") : "";
    const password = await secret("Password baru (15–128 karakter): ");
    const confirmation = await secret("Ulangi password: ");
    if (password !== confirmation) throw new AuthError(400, "Konfirmasi password tidak sama.");
    const connection = createMariaDb(); pool = connection.pool;
    if (command === "create-owner") await createOwner(connection.database, { email, displayName, password });
    else await resetPassword(connection.database, email, password);
    console.log(command === "create-owner" ? "Akun owner dibuat. Masuk melalui /login. Password tidak ditampilkan." : "Password diganti dan sesi akun dicabut. Password tidak ditampilkan.");
  } catch (error) {
    console.error(error instanceof AuthError ? error.message : mariaDbErrorMessage(error));
    process.exitCode = 1;
  } finally { rl.close(); await pool?.end(); }
}
