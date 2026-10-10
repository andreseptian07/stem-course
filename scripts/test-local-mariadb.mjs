import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "mysql2/promise";
import { testHttpRecovery } from "./test-http-recovery.mjs";

// No .env.local, shared data directory, installed service or hosting connection.
// Requires an installed MariaDB; Homebrew's versioned keg stays separate from MySQL.
const bin = process.env.MARIADB_BIN || "/opt/homebrew/opt/mariadb@11.8/bin";
await access(join(bin, "mariadbd"));
await access(join(bin, "mariadb-install-db"));
const temporary = await mkdtemp(join(tmpdir(), "ruangstem-mariadb-"));
const socketPath = join(temporary, "db.sock");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let server, admin;
const serverArgs = ["--no-defaults", `--basedir=${join(bin, "..")}`, `--datadir=${temporary}`, `--socket=${socketPath}`, `--port=${port}`, "--bind-address=127.0.0.1", "--skip-name-resolve", "--wait-timeout=20", `--pid-file=${join(temporary, "server.pid")}`, `--log-error=${join(temporary, "server.log")}`];
async function startDatabase() {
  server = spawn(join(bin, "mariadbd"), serverArgs, { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("MariaDB disposable berhenti sebelum siap.");
    try { admin = await createConnection({ socketPath, user: process.env.USER }); break; } catch { await delay(100); }
  }
  assert.ok(admin, "MariaDB disposable belum siap.");
}
async function stopDatabase() {
  await admin?.end(); admin = undefined;
  if (server && server.exitCode === null) {
    const exited = once(server, "exit"); server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000); timer.unref();
    await exited; clearTimeout(timer);
  }
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, `${command} failed (${code})`);
}
try {
  await run(join(bin, "mariadb-install-db"), ["--no-defaults", `--basedir=${join(bin, "..")}`, `--datadir=${temporary}`, "--skip-test-db", `--auth-root-socket-user=${process.env.USER}`], { stdio: "ignore" });
  await startDatabase();
  const [[info]] = await admin.query("SELECT VERSION() AS version");
  assert.match(info.version, /MariaDB/);
  console.log(`Disposable MariaDB ${info.version}; loopback only; separate temporary data.`);
  const password = randomBytes(32).toString("hex");
  await admin.query("CREATE USER 'stem_ci_runner'@'127.0.0.1' IDENTIFIED BY ?", [password]);
  for (const database of ["stem_ci", "stem_auth_ci", "stem_tutor_ci", "stem_authorization_ci"])
    await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO 'stem_ci_runner'@'127.0.0.1'`);
  await admin.query("CREATE DATABASE stem_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
  const env = { ...process.env, DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: "stem_ci", DB_USER: "stem_ci_runner", DB_PASSWORD: password, DB_SSL_MODE: "disabled", MARIADB_INTEGRATION_TEST: "true", NEXT_TELEMETRY_DISABLED: "1" };
  delete env.DB_SSL_CA_BASE64;
  await run("npm", ["run", "test:mariadb"], { env });
  await run(process.execPath, ["--experimental-strip-types", "--test", "tests/mariadb-reliability.integration.test.mjs"], { env });
  if (process.argv.includes("--http")) {
    await run("npm", ["run", "test:http"], { env });
    await testHttpRecovery(env, { stopDatabase, startDatabase });
  }
} finally {
  await stopDatabase();
  // Only remove the unique directory created by this invocation.
  await rm(temporary, { recursive: true, force: true });
}
