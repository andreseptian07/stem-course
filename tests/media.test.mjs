import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {mediaScenarios} from './media-scenarios.mjs';
test('private profile and course media on a disposable database',async t=>{
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const prepare=(query,values=[])=>({bind(...args){return prepare(query,args);},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}});
 const d={prepare,async batch(items){sql.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 try{await mediaScenarios(t,d);}finally{sql.close();}
});
