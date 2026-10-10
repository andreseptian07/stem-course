// Owned disposable fixture only. Public synthetic login; no hosting environment is read.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPool} from 'mysql2/promise';
import {createMariaDbAdapter} from '../db/mariadb-adapter.ts';
import {readAccessContext} from '../lib/authorization.ts';
import {navigationUser,accountNavigation} from '../lib/account-navigation.ts';
const base='http://localhost:4340',folder=(await readFile('/tmp/stem-t4-final-browser-folder','utf8')).trim();
assert.ok(folder.split('/').pop().startsWith('ruangstem-browser-uat-'));
const pool=createPool({socketPath:folder+'/db.sock',user:process.env.USER,database:'stem_browser_ci'}),d=createMariaDbAdapter(pool),checks=[];
try {
 for(const [alias,email]of Object.entries({O:'owner@permissions.ci.example',S1:'s1@permissions.ci.example',TA:'ta@permissions.ci.example',Q1:'q1@permissions.ci.example'})){
  const u=await d.prepare('SELECT user_id AS id FROM auth_credentials WHERE email=?').bind(email).first();const nav=accountNavigation(navigationUser(await readAccessContext(d,u)));
  const r=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',email,password:'CI-authorization-test-only-passphrase',returnTo:'/dashboard'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
  const pages=['/dashboard','/profile','/access','/notifications',...(alias==='O'?['/curriculum?course=browser-g6-media','/learn?view=admin','/certificates?admin=1','/preview?course=browser-g6-media']:alias==='S1'?['/classes?class=browser-g6-media-A','/learn?course=browser-g6-media&class=browser-g6-media-A&lesson=intro','/learn?view=sessions','/certificates']:alias==='TA'?['/classes?class=browser-g6-media-A','/preview?course=browser-g6-media']:['/curriculum'])];
  for(const path of pages){const response=await fetch(base+path,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(response.status,200,alias+' '+path);const html=await response.text();const menu=html.match(/<nav id="(?:account-navigation|study-account-navigation)"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(menu,alias+' '+path+' shared menu');const hrefs=[...menu.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));assert.deepEqual(hrefs,nav.map(i=>i.href));assert.equal((menu.match(/aria-current="page"/g)||[]).length,1);checks.push({alias,path,status:response.status,menuLinks:hrefs.length,activeLinks:1});}
  if(alias==='S1'){const f=JSON.parse(await readFile('/Users/mc/E-Course/platform/docs/UAT-Ruang-STEM/bukti/TAHAP-6-20261010/fixture.json','utf8'));
   const v=f.media.find(m=>m.type==='video').id;const response=await fetch(base+'/api/media/'+v+'?class='+f.classId,{headers:{Cookie:cookie,Range:'bytes=0-255'}});if(response.status!==206) console.log('Video read failure:',await response.json());assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,256);checks.push({alias,path:'protected-video-range',status:206,bytes:256});
   const guest=await fetch(base+'/api/media/'+v+'?class='+f.classId,{redirect:'manual'});assert.equal(guest.status,401);checks.push({alias:'guest',path:'protected-video',status:401});
  }
 }
 await writeFile('/Users/mc/E-Course/platform/docs/UAT-Ruang-STEM/bukti/TAHAP-6-20261010/http-role-navigation.json',JSON.stringify({environment:'owned disposable MariaDB / actual Next dev',checks},null,2));console.log(checks.length+' authenticated navigation/media boundary checks passed.');
}finally{await pool.end();}
