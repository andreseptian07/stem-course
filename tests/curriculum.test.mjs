import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {curriculumScenarios} from './curriculum-scenarios.mjs';
test('curriculum workflow on a disposable database',async t=>{
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 sql.exec("CREATE TABLE auth_credentials(user_id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,display_name TEXT,password_hash TEXT,password_version INTEGER,created_at TEXT,updated_at TEXT)");
 const prepare=(query,values=[])=>({bind(...args){return prepare(query,args);},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}});
 let queue=Promise.resolve();
 const d={prepare,batch(items){const result=queue.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of items)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=result.catch(()=>{});return result;}};
 try{await curriculumScenarios(t,d);}finally{sql.close();}
});
