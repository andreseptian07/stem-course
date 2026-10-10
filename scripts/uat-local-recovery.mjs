// Manual browser UAT only. Owns a disposable database and a separate source copy.
// Never reads .env.local or changes the app running on port 5173.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "mysql2/promise";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import { createOwner } from "../lib/auth-data.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = process.env.MARIADB_BIN || "/opt/homebrew/opt/mariadb@11.8/bin";
await access(join(bin, "mariadbd"));
const temporary = await mkdtemp(join(tmpdir(), "ruangstem-browser-uat-"));
const datadir = join(temporary, "data"), workspace = join(temporary, "app");
const socketPath = join(temporary, "db.sock");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let databaseProcess, webProcess, admin;
const databaseArgs = ["--no-defaults", `--basedir=${join(bin, "..")}`, `--datadir=${datadir}`, `--socket=${socketPath}`, `--port=${port}`, "--bind-address=127.0.0.1", "--skip-name-resolve", "--wait-timeout=20", `--pid-file=${join(temporary, "server.pid")}`, `--log-error=${join(temporary, "server.log")}`];
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit"); child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000); timer.unref();
  await exited; clearTimeout(timer);
}
async function startDatabase() {
  assert.ok(!databaseProcess || databaseProcess.exitCode !== null || databaseProcess.signalCode !== null);
  databaseProcess = spawn(join(bin, "mariadbd"), databaseArgs, { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    if (databaseProcess.exitCode !== null) throw new Error("Disposable MariaDB stopped before ready.");
    try { admin = await createConnection({ socketPath, user: process.env.USER }); break; } catch { await delay(100); }
  }
  assert.ok(admin, "Disposable MariaDB not ready.");
  console.log("Disposable database: ready.");
}
async function stopDatabase() {
  await admin?.end(); admin = undefined;
  await stop(databaseProcess);
  console.log("Disposable database: stopped.");
}
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
process.once("SIGINT", () => input.close());
process.once("SIGTERM", () => input.close());
try {
  const install = spawn(join(bin, "mariadb-install-db"), ["--no-defaults", `--basedir=${join(bin, "..")}`, `--datadir=${datadir}`, "--skip-test-db", `--auth-root-socket-user=${process.env.USER}`], { stdio: "ignore" });
  assert.equal((await once(install, "exit"))[0], 0);
  await startDatabase();
  const password = randomBytes(32).toString("hex");
  await admin.query("CREATE DATABASE stem_browser_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
  await admin.query("CREATE USER 'stem_browser_runner'@'127.0.0.1' IDENTIFIED BY ?", [password]);
  await admin.query("GRANT ALL PRIVILEGES ON stem_browser_ci.* TO 'stem_browser_runner'@'127.0.0.1'");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: "stem_browser_ci", DB_USER: "stem_browser_runner", DB_PASSWORD: password, DB_SSL_MODE: "disabled",
    APP_URL: "http://localhost:4330", AUTH_ALLOW_LOCAL_HTTP: "true", AUTH_REQUIRE_EMAIL_VERIFICATION: "false", AUTH_REGISTRATION_ENABLED: "false", MAIL_DELIVERY: "disabled", JUDGE0_ENABLED: "false" };
  const { pool, database } = createMariaDb(env);
  try {
    await applyMariaDbMigrations(pool);
    // Public fixture credentials only; no user/hosting credentials enter this copy.
    await createOwner(database, { email: "operator@ci.example", displayName: "Operator UAT Disposable", password: "CI-owner-passphrase-unique-only" });
  } finally { await pool.end(); }
  for (const name of ["app", "lib", "db", "mariadb", "public", "assets", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "proxy.ts", "next-env.d.ts"]) {
    try { await access(join(root, name)); } catch { continue; }
    await cp(join(root, name), join(workspace, name), { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(workspace, "node_modules"), "dir");
  webProcess = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "-H", "127.0.0.1", "-p", "4330"], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
  // Emit only readiness, never request/error objects or environment values.
  webProcess.stdout.on("data", data => { if (data.toString().includes("Ready in")) console.log("Browser UAT ready: http://localhost:4330/login"); });
  webProcess.stderr.on("data", () => {});
  webProcess.once("exit", () => input.close());
  console.log("Commands: stop-db, start-db, quit. Uses localhost cookies, separate from 127.0.0.1:5173.");
  for await (const line of input) {
    if (line.trim() === "quit") break;
    if (line.trim() === "stop-db") await stopDatabase();
    else if (line.trim() === "start-db") await startDatabase();
  }
} finally {
  input.close();
  await stop(webProcess);
  await stopDatabase();
  await rm(temporary, { recursive: true, force: true });
  console.log("Disposable browser UAT cleaned up.");
}
