import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// Only the disposable authorization runner owns these stop/start callbacks.
export async function testAuthorizationRecovery(base,fixture,metadata,{stopDatabase,startDatabase}) {
  assert.equal(new URL(base).hostname,'localhost');
  const cookies={},results=[];
  const request=(alias,path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{...(cookies[alias]?{Cookie:cookies[alias]}:{}),...(body?{Origin:metadata.origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  async function check(alias,path,expected,body) {
    const response=await request(alias,path,body);
    results.push({alias,path,method:body?'POST':'GET',expected,status:response.status});
    assert.equal(response.status,expected,`${alias} recovery ${path}`);
    return response.json();
  }
  let stopped=false;
  try {
    for(const alias of ['S1','TA','O']) {
      const response=await request('', '/api/auth',{action:'login',...fixture.credentials[alias]});
      assert.equal(response.status,200);cookies[alias]=response.headers.get('set-cookie').split(';')[0];
    }
    const before=await check('S1','/api/account',200);
    const profile={...before.profile,bio:'Disposable permission recovery save'};
    await stopDatabase();stopped=true;
    await check('S1','/api/account',503);
    await check('TA','/api/classes',503);
    await check('O','/api/permissions',503);
    await check('S1','/api/account',503,{action:'saveProfile',profile});
    const unavailable=await request('', '/api/auth',{action:'login',...fixture.credentials.S1});
    assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('set-cookie'),null);
    results.push({alias:'S1',path:'/api/auth',method:'POST',expected:503,status:503});
    await startDatabase();stopped=false;
    const recovered=await check('S1','/api/account',200);
    assert.equal(recovered.user.id,before.user.id);assert.deepEqual(recovered.profile,before.profile);
    assert.equal(recovered.user.kind,'student');
    const staff=await check('TA','/api/account',200);assert.equal(staff.user.kind,'staff');assert.equal(staff.courses.length,0);
    await check('TA','/api/studio',403);
    await check('O','/api/permissions',200);
    await check('S1','/api/account',200,{action:'saveProfile',profile});
    const saved=await check('S1','/api/account',200);assert.equal(saved.profile.bio,profile.bio);assert.equal(saved.profile.version,profile.version+1);
    console.log(`Authorization recovery: ${results.length} checks passed; same sessions, no role fallback or failed-save mutation.`);
  } finally {
    if(stopped)await startDatabase();
    await writeFile('/tmp/ruangstem-t2-recovery-evidence.json',JSON.stringify({at:new Date().toISOString(),...metadata,environment:'disposable MariaDB; no .env.local',results},null,2)+'\n');
  }
}
