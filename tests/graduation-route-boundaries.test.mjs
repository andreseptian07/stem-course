import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import {authorizationDatabase} from './authorization-fixture.mjs';
import {graduationRouteBoundaries} from './graduation-route-boundaries.mjs';
test('T4 remaining HTTP route boundaries: academic races and Range delivery',async()=>{
 const {d,sql}=authorizationDatabase();
 try{const evidence=await graduationRouteBoundaries(d);await writeFile('/tmp/stem-t4-boundaries-sqlite.json',JSON.stringify(evidence,null,2)+'\n');}finally{sql.close();}
});
