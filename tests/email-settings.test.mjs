import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { emailSettingsOverview, updateEmailSettings, configuredAccountMailer, readEmailSettings } from "../lib/email-settings.ts";
import { emailRequired } from "../lib/email-policy.ts";
const env = { APP_URL: "https://ruangstem.example", NODE_ENV: "production", MAIL_DELIVERY: "smtp", SMTP_HOST: "smtp.example", SMTP_PORT: "465", SMTP_USER: "private-smtp-user", SMTP_PASSWORD: "private-password-only", MAIL_FROM: "noreply@example.com" };
function fixture() {
 const sql=new DatabaseSync(":memory:");sql.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); INSERT INTO settings VALUES('owner','owner'); CREATE TABLE auth_credentials(user_id TEXT PRIMARY KEY,email TEXT); INSERT INTO auth_credentials VALUES('owner','owner@example.invalid');");
 const prepare=(query,values=[])=>({bind(...v){return prepare(query,v)},async first(){return sql.prepare(query).get(...values)??null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){return{meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}});
 return{sql,d:{prepare}};
}
test("SMTP activation requires owner, complete settings and a successful test; client secrets and stale writes are rejected",async()=>{
 const{sql,d}=fixture();const owner={id:"owner"};let sent;
 try{
  await assert.rejects(()=>emailSettingsOverview(d,{id:"student"},env),e=>e.status===403);
  await assert.rejects(()=>updateEmailSettings(d,{id:"student"},{action:"enable",version:1},env),e=>e.status===403);
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"enable",version:1},env),e=>e.status===400);
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"test",version:1},{...env,SMTP_PASSWORD:""},async()=>{}),e=>e.status===400);
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"test",version:1},env,async()=>{throw new Error(env.SMTP_PASSWORD)}),e=>e.status===503&&!e.message.includes(env.SMTP_PASSWORD));
  assert.equal((await emailSettingsOverview(d,owner,env)).tested,false);
  let status=await updateEmailSettings(d,owner,{action:"test",version:1},env,async(m)=>{sent=m});
  assert.deepEqual(sent,{to:"owner@example.invalid",purpose:"test"});assert.equal(status.tested,true);assert.equal(status.enabled,false);
  for(const secret of [env.SMTP_PASSWORD,env.SMTP_USER,env.SMTP_HOST])assert.ok(!JSON.stringify(status).includes(secret));
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"enable",version:1},env),e=>e.status===409);
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"enable",version:status.version,password:"inject"},env));
  status=await updateEmailSettings(d,owner,{action:"enable",version:status.version},env);assert.equal(status.enabled,true);assert.equal(status.required,false);
  assert.equal(typeof await configuredAccountMailer(d,env),"function");
  status=await updateEmailSettings(d,owner,{action:"requireVerification",version:status.version,required:true},env);
  assert.equal(await emailRequired(d,env),true);
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"disable",version:status.version},env),e=>e.status===400);
  status=await updateEmailSettings(d,owner,{action:"requireVerification",version:status.version,required:false},env);
  status=await updateEmailSettings(d,owner,{action:"disable",version:status.version},env);assert.equal(status.enabled,false);
  assert.equal(await configuredAccountMailer(d,env,true),null);await assert.rejects(()=>configuredAccountMailer(d,env),e=>e.status===503);
 }finally{sql.close()}
});
test("SMTP configuration changes invalidate activation and test proof; local state never enables the production domain",async()=>{
 const{sql,d}=fixture(),owner={id:"owner"};
 try{
  let status=await updateEmailSettings(d,owner,{action:"test",version:1},env,async()=>{});
  status=await updateEmailSettings(d,owner,{action:"enable",version:status.version},env);
  for(const [key,value]of Object.entries({SMTP_PASSWORD:"different",SMTP_PORT:"587",SMTP_HOST:"other.example",SMTP_USER:"other-user",MAIL_FROM:"other@example.com"})){
   const changed={...env,[key]:value};const invalid=await emailSettingsOverview(d,owner,changed);assert.equal(invalid.enabled,false);assert.equal(invalid.tested,false);
   await assert.rejects(()=>updateEmailSettings(d,owner,{action:"enable",version:invalid.version},changed),e=>e.status===400);
  }
  const changed={...env,SMTP_PASSWORD:"new-password"};
  const retested=await updateEmailSettings(d,owner,{action:"test",version:status.version},changed,async()=>{});assert.equal(retested.enabled,false);
  const local={...env,APP_URL:"http://127.0.0.1:5173",NODE_ENV:"development",AUTH_ALLOW_LOCAL_HTTP:"true",MAIL_DELIVERY:"preview"};
  const localStatus=await emailSettingsOverview(d,owner,local);assert.equal(localStatus.version,1);assert.equal(localStatus.enabled,false);assert.equal(localStatus.preview,true);
  assert.equal(typeof await configuredAccountMailer(d,local),"function");
  assert.equal((await readEmailSettings(d,env)).key===(await readEmailSettings(d,local)).key,false);
 }finally{sql.close()}
});
test("verification cannot be required before email activation and insecure preview stays refused",async()=>{
 const{sql,d}=fixture(),owner={id:"owner"};
 try{
  await assert.rejects(()=>updateEmailSettings(d,owner,{action:"requireVerification",version:1,required:true},env),e=>e.status===400);
  await assert.rejects(()=>configuredAccountMailer(d,{...env,MAIL_DELIVERY:"preview"}),e=>e.status===503);
 }finally{sql.close()}
});
