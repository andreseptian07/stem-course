import {testGraduationRecovery} from './test-graduation-recovery.mjs';
import {seedGraduationHttp} from '../tests/graduation-http-fixture.mjs';
import {seedGraduationBrowser} from '../tests/graduation-browser-fixture.mjs';
import {testGraduationHttp} from './test-graduation-http.mjs';
import {transportProxy} from './uat-transport-proxy.mjs';
// Manual browser UAT only. Owns a disposable database and a separate source copy.
// Never reads .env.local or changes the app running on port 5173.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, cp, mkdtemp, rm, symlink, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "mysql2/promise";
import { createMariaDb } from "../db/mariadb.ts";
import { applyMariaDbMigrations } from "../db/mariadb-migrate.ts";
import {seedAuthorizationHttp} from "../tests/authorization-http-fixture.mjs";
import {testCurriculumHttp} from "./test-curriculum-http.mjs";
import {testAuthorizationHttp} from "./test-authorization-http.mjs";
import {testAuthorizationRecovery} from "./test-authorization-recovery.mjs";
import {mutateCurriculum} from "../lib/curriculum.ts";
import {createTutorInvitation} from "../lib/tutors.ts";
import { readAccessContext, changePermission } from "../lib/authorization.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const production = process.argv.includes("--production");
const webPort=Number(process.argv.find(a=>a.startsWith("--port="))?.slice(7)||4330);
const withTransportFaults=process.argv.includes('--fault-proxy');
const internalWebPort=withTransportFaults?webPort+1:webPort;
assert.ok(Number.isInteger(webPort)&&webPort>=1024&&webPort<=65535);
assert.ok(internalWebPort<=65535);
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
let databaseProcess, webProcess, admin, proxy;
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
let inputEnded=false;
input.once('close',()=>{inputEnded=true;});
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
    NODE_ENV: production ? "production" : "development", NEXT_TELEMETRY_DISABLED: "1", DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: "stem_browser_ci", DB_USER: "stem_browser_runner", DB_PASSWORD: password, DB_SSL_MODE: "disabled",UPLOAD_STORAGE_DIR:join(temporary,"uploads"),UPLOAD_STORAGE_ID:"authorization-disposable",
    APP_URL: production ? "https://authorization.fixture.invalid" : `http://localhost:${webPort}`, AUTH_ALLOW_LOCAL_HTTP: "true", AUTH_REQUIRE_EMAIL_VERIFICATION: "false", AUTH_REGISTRATION_ENABLED: "false", MAIL_DELIVERY: "disabled", JUDGE0_ENABLED: "false" };
  const { pool, database } = createMariaDb(env);
  try {
    await applyMariaDbMigrations(pool);
    // Public fixture credentials only; no user/hosting credentials enter this copy.
    const fixture=await seedAuthorizationHttp(database);
    globalThis.authorizationFixture=fixture;
    if(process.argv.includes("--graduation"))await seedGraduationHttp(database,fixture,env);
    if(process.argv.includes("--closure-browser"))await seedGraduationBrowser(database,fixture);
    if(process.argv.includes('--curriculum')) {
      await mutateCurriculum(database,fixture.users.O,{action:'member',courseId:fixture.courses.C2.id,userId:fixture.users.Q1.id,version:0,active:true,targetGrantVersion:fixture.users.Q1.grantVersions.curriculum});
      const invitation=await createTutorInvitation(database,fixture.users.O,{email:fixture.credentials.Q1.email,displayName:'Q1 UAT Kurikulum',classId:null,capability:'curriculum',courseId:fixture.courses.C3.id},env);
      await writeFile('/tmp/ruangstem-t3-ui-invitation.json',JSON.stringify({url:invitation.url}),{mode:0o600});
    }
  } finally { await pool.end(); }
  for (const name of ["app", "lib", "db", "mariadb", "public", "assets", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "proxy.ts", "next-env.d.ts"]) {
    try { await access(join(root, name)); } catch { continue; }
    await cp(join(root, name), join(workspace, name), { recursive: true });
  }
  const candidate=createHash('sha256');
  async function fingerprint(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const full=join(dir,entry.name);if(entry.isDirectory())await fingerprint(full);else if(entry.isFile()){candidate.update(full.slice(workspace.length+1));candidate.update(await readFile(full));}}}
  await fingerprint(workspace);
  const sourceHash=candidate.digest('hex');
  let buildId=null;
  if(production){buildId=(await readFile(join(root,'.next/BUILD_ID'),'utf8')).trim();await cp(join(root,'.next'),join(workspace,'.next'),{recursive:true});}
  await symlink(join(root, "node_modules"), join(workspace, "node_modules"), "dir");
  if(withTransportFaults)proxy=await transportProxy(webPort,internalWebPort);
  webProcess = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), ...(production?["start"]:["dev","--webpack"]), "-H", "127.0.0.1", "-p", String(internalWebPort)], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
  // Emit only readiness, never request/error objects or environment values.
  webProcess.stdout.on("data", data => { if (data.toString().includes("Ready in")) console.log(`Browser UAT ready: http://localhost:${webPort}/login`); });
  webProcess.stderr.on("data", () => {});
  webProcess.once("exit", () => input.close());
  console.log("Commands: stop-db, start-db, revoke-q1, quit. Uses localhost cookies, separate from 127.0.0.1:5173.");
  console.log(JSON.stringify({sourceHash,buildId,mode:production?'production':'development'}));
  if(process.argv.includes("--http")){for(let i=0;i<150;i++){try{if((await fetch(`http://localhost:${webPort}/login`,{signal:AbortSignal.timeout(1000)})).status===200)break;}catch{}await delay(250);}
    if(process.argv.includes("--graduation"))await testGraduationHttp(`http://localhost:${webPort}`,globalThis.authorizationFixture,{sourceHash,buildId,origin:env.APP_URL,mode:production?"production":"development"});
    if(process.argv.includes("--graduation-recovery"))await testGraduationRecovery(`http://localhost:${webPort}`,globalThis.authorizationFixture,{sourceHash,buildId,origin:env.APP_URL,mode:production?"production":"development"},{stopDatabase,startDatabase});
    await testAuthorizationHttp(`http://localhost:${webPort}`,globalThis.authorizationFixture,{sourceHash,buildId,origin:env.APP_URL,mode:production?"production":"development"});
    if(process.argv.includes("--curriculum-http"))await testCurriculumHttp(`http://localhost:${webPort}`,globalThis.authorizationFixture,{sourceHash,buildId,origin:env.APP_URL,mode:production?"production":"development"});
    if(process.argv.includes('--recovery'))await testAuthorizationRecovery(`http://localhost:${webPort}`,globalThis.authorizationFixture,{sourceHash,buildId,origin:env.APP_URL,mode:production?'production':'development'},{stopDatabase,startDatabase});
    if(!process.argv.includes("--keep"))input.close();}
  // A pipe can reach EOF during asynchronous seeding/HTTP tests. Starting an
  // iterator on an already-closed readline can hang and leak the fixture.
  if(!inputEnded&&(!process.argv.includes("--http")||process.argv.includes("--keep")))for await (const line of input) {
    if (line.trim() === "quit") break;
    if (line.trim() === "stop-db") await stopDatabase();
    else if (line.trim() === "start-db") await startDatabase();
    else if(withTransportFaults&&line.trim()==='proxy-counts')console.log(JSON.stringify({proxyRequests:proxy.requests()}));
    else if(withTransportFaults&&/^fault-(before|after)-(studio|projects|certificates)$/.test(line.trim())){
      const [,when,path]=line.trim().match(/^fault-(before|after)-(studio|projects|certificates)$/);proxy.arm(when,'/api/'+path);console.log('Disposable transport fault armed: '+when+' '+path);
    }
    else if(line.trim()==='snapshot-g4'&&globalThis.authorizationFixture.gradeCourse){
      const {pool,database}=createMariaDb(env),f=globalThis.authorizationFixture;
      try{
        const progress=(await database.prepare('SELECT lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,version FROM learning_progress_revisions WHERE user_id=? AND course_id=? ORDER BY lesson_id,revision').bind(f.users.S1.id,f.gradeCourse.id).all()).results;
        const submissions=(await database.prepare('SELECT s.assignment_id,s.attempt,s.status,s.score,s.version FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=? AND s.student_id=? ORDER BY s.assignment_id,s.attempt').bind(f.gradeClasses.A,f.users.S1.id).all()).results;
        const reviews=(await database.prepare('SELECT r.sequence,r.status,r.score FROM project_reviews r JOIN project_submissions s ON s.id=r.submission_id JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=? AND s.student_id=? ORDER BY s.assignment_id,r.sequence').bind(f.gradeClasses.A,f.users.S1.id).all()).results;
        const certificates=(await database.prepare('SELECT number FROM certificates WHERE course_id=? AND user_id=?').bind(f.gradeCourse.id,f.users.S1.id).all()).results;
        console.log(JSON.stringify({uatSnapshot:true,progress,submissions,reviews,certificates}));
      }finally{await pool.end();}
    }
    else if (line.trim() === "revoke-q1") {
      const {pool,database}=createMariaDb(env);
      try {
        const target=await readAccessContext(database,globalThis.authorizationFixture.users.Q1);
        await changePermission(database,globalThis.authorizationFixture.users.O,{action:'setGrant',targetId:target.id,capability:'curriculum',active:false,principalVersion:target.principalVersion,grantVersion:target.grantVersions.curriculum,reason:'Disposable UI revocation test'});
        console.log('Disposable Q1 curriculum capability revoked; learner history preserved.');
      } finally {await pool.end();}
    }
  }
} finally {
  input.close();
  await proxy?.close();
  await stop(webProcess);
  await stopDatabase();
  await rm(temporary, { recursive: true, force: true });
  if(process.argv.includes("--curriculum"))await rm("/tmp/ruangstem-t3-ui-invitation.json",{force:true});
  console.log("Disposable browser UAT cleaned up.");
}
