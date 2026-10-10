import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function authorizationDatabase() {
  const sql=new DatabaseSync(':memory:');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(`drizzle/${f}`,'utf8'));
  sql.exec("CREATE TABLE auth_credentials(user_id TEXT PRIMARY KEY,email TEXT,display_name TEXT,password_hash TEXT,password_version INTEGER,created_at TEXT,updated_at TEXT); CREATE TABLE auth_email_status(user_id TEXT PRIMARY KEY,email TEXT,verified_at TEXT)");
  sql.exec("CREATE TABLE auth_limits(bucket_id TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL)");
  const prepare=(q,p=[])=>({bind(...values){return prepare(q,values);},async first(){return sql.prepare(q).get(...p)??null;},async all(){return {results:sql.prepare(q).all(...p)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...p).changes)}};}});
  let queue=Promise.resolve();
  const d={prepare,batch(statements){const work=queue.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=work.catch(()=>{});return work;}};
  return {d,sql};
}
export async function seedPrincipal(d,id,kind='student',capabilities=[],status='active') {
  const time='2026-10-09T00:00:00Z';
  await d.prepare('INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) VALUES(?,?,1,?,?,?)').bind(id,kind,id,time,`fixture:${id}`).run();
  for(const capability of capabilities) await d.prepare('INSERT INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) VALUES(?,?,1,1,?,?,?)').bind(id,capability,'owner',time,`fixture:${id}:${capability}`).run();
  // Callers seed users/access separately. A status argument is useful when the row already exists.
  await d.prepare('UPDATE user_access SET status=? WHERE user_id=?').bind(status,id).run();
}
export async function seedAccessUser(d,id,kind='student',capabilities=[],status='active') {
  await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(id,id,kind).run();
  await d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,'2026-10-09','2026-10-09')").bind(id,status).run();
  await seedPrincipal(d,id,kind,capabilities,status);
}

export function seedSqlitePrincipal(sql,id,kind,capabilities=[]) {
 const time='2026-10-09';
 sql.prepare('INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) VALUES(?,?,1,?,?,?)').run(id,kind,id,time,'fixture:'+id);
 for(const cap of capabilities)sql.prepare('INSERT INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) VALUES(?,?,1,1,?,?,?)').run(id,cap,'owner',time,'fixture:'+id+':'+cap);
}
