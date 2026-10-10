import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectJudge,JUDGE_LIMITS,judgeFingerprint} from '../lib/judge.ts';
import {createJudgeInspector} from '../lib/judge-readiness.ts';
import {configuredJudge} from '../lib/judge-config.ts';

const cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71}};
export function healthyJudgeFixture(overrides={}) {
 return {
  about:{version:'1.13.1'},
  config_info:{enable_network:false,allow_enable_network:false,max_queue_size:100,...Object.fromEntries(Object.entries(JUDGE_LIMITS).map(([k,v])=>['max_'+k,v]))},
  languages:[{id:71}],workers:[{queue:'default',size:0,available:1,idle:1,working:0,paused:0,failed:0}],...overrides,
 };
}
const provider=data=>async url=>Response.json(data[new URL(url).pathname.slice(1)]);
test('operator configuration stays disabled until explicit valid server-only settings',()=>{
 assert.equal(configuredJudge({}),null);
 assert.equal(configuredJudge({JUDGE0_ENABLED:'false',JUDGE0_URL:cfg.url,JUDGE0_TOKEN:cfg.token}),null);
 assert.equal(configuredJudge({JUDGE0_ENABLED:'true',JUDGE0_URL:cfg.url}),null);
 assert.equal(configuredJudge({JUDGE0_ENABLED:'true',JUDGE0_URL:cfg.url,JUDGE0_TOKEN:cfg.token,JUDGE0_PYTHON_ID:'NaN'}),null);
 const configured=configuredJudge({JUDGE0_ENABLED:'true',JUDGE0_URL:cfg.url,JUDGE0_TOKEN:cfg.token});
 assert.deepEqual(configured.languageIds,{python:71,javascript:63,cpp:54});
});
test('ready service must support actual platform limits, active worker, languages and isolation',async t=>{
 assert.equal((await inspectJudge(cfg,provider(healthyJudgeFixture()))).passed,true);
 const cases=[
  ['older version', {about:{version:'1.13.0'}}],
  ['malformed version', {about:{version:'provider-version'}}],
  ['missing language',{languages:[]}],
  ['empty language configuration',{}],
  ['network enabled',{config_info:{...healthyJudgeFixture().config_info,allow_enable_network:true}}],
  ['resource limits missing',{config_info:{enable_network:false,allow_enable_network:false,max_queue_size:100}}],
  ['incompatible memory cap',{config_info:{...healthyJudgeFixture().config_info,max_memory_limit:32000}}],
  ['no worker',{workers:[]}],
  ['paused worker',{workers:[{queue:'default',size:0,available:1,idle:0,working:0}]}],
  ['queue full',{workers:[{queue:'default',size:100,available:1,idle:1,working:0}]}],
  ['malformed queue count',{workers:[{queue:'default',size:'0',available:1,idle:1,working:0}]}],
 ];
 for(const [name,override] of cases)await t.test(name,async()=>{
  const result=await inspectJudge(name==='empty language configuration'?{...cfg,languageIds:{}}:cfg,provider(healthyJudgeFixture(override)));
  assert.equal(result.passed,false);
 });
});
test('cache coalesces requests, expires, forces refresh and isolates configuration changes',async()=>{
 let clock=100,calls=0;const inspect=createJudgeInspector(async url=>{calls++;return provider(healthyJudgeFixture())(url);},()=>clock);
 const values=await Promise.all(Array.from({length:12},()=>inspect(cfg)));
 assert.equal(values.every(v=>v.passed),true);assert.equal(calls,4);
 await inspect(cfg);assert.equal(calls,4);
 clock+=30001;await inspect(cfg);assert.equal(calls,8);
 await inspect(cfg,true);assert.equal(calls,12);
 await inspect({...cfg,token:'rotated-fixture'});assert.equal(calls,16);
 await inspect({...cfg,languageIds:{python:72}});assert.equal(calls,20);
 const a=await judgeFingerprint({...cfg,languageIds:{python:71,javascript:63}}),b=await judgeFingerprint({...cfg,languageIds:{javascript:63,python:71}});
 assert.equal(a,b);assert.notEqual(a,await judgeFingerprint(cfg));assert.equal(a.includes(cfg.token),false);
});
test('missing/invalid configuration and transport errors fail closed without secrets; negative cache recovers',async()=>{
 let clock=0,calls=0,offline=true;
 const inspect=createJudgeInspector(async url=>{calls++;if(offline)throw new Error('provider credential fixture-only');return provider(healthyJudgeFixture())(url);},()=>clock);
 assert.equal((await inspect(null)).passed,false);
 assert.equal((await inspect({...cfg,url:'http://127.0.0.1'})).passed,false);assert.equal(calls,0);
 const failed=await inspect(cfg);assert.equal(failed.passed,false);assert.equal(JSON.stringify(failed).includes(cfg.token),false);assert.equal(calls,4);
 offline=false;await inspect(cfg);assert.equal(calls,4);
 clock=5001;assert.equal((await inspect(cfg)).passed,true);assert.equal(calls,8);
});
