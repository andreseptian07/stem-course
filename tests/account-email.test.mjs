import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { accountEmailScenarios } from "./account-email-scenarios.mjs";
import { mailConfiguration, accountMailText } from "../lib/mailer.ts";

test("account email configuration refuses unsafe preview and insecure SMTP settings", () => {
  const env = { APP_URL: "https://ruangstem.example", NODE_ENV: "production", MAIL_DELIVERY: "smtp", SMTP_HOST: "smtp.example", SMTP_USER: "test@example", SMTP_PASSWORD: "  preserve-me  ", MAIL_FROM: "noreply@example.com" };
  assert.equal(mailConfiguration(env).password, "  preserve-me  ");
  assert.equal(mailConfiguration(env).port, 465);
  assert.equal(mailConfiguration({ ...env, SMTP_PORT: "587" }).port, 587);
  for (const bad of [{MAIL_DELIVERY:"preview"},{SMTP_PORT:"25"},{MAIL_FROM:"bad\r\nBcc:evil@example.com"},{SMTP_PASSWORD:""},{MAIL_DELIVERY:"disabled"}]) assert.throws(()=>mailConfiguration({...env,...bad}));
  assert.equal(mailConfiguration({APP_URL:"http://127.0.0.1:5173",NODE_ENV:"development",AUTH_ALLOW_LOCAL_HTTP:"true",MAIL_DELIVERY:"preview"}).mode,"preview");
  const changed = accountMailText({to:"test@example.com",purpose:"changed"});
  assert.ok(!changed.text.includes("undefined")); assert.match(changed.subject,/diubah/);
});

test("verification and password recovery on disposable account fixtures", async(t)=>{
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
  CREATE TABLE auth_credentials(user_id TEXT PRIMARY KEY,email TEXT UNIQUE,display_name TEXT,password_hash TEXT,password_version INTEGER,created_at TEXT,updated_at TEXT);
  CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,password_version INTEGER,created_at INTEGER,last_seen INTEGER,expires_at INTEGER);
  CREATE TABLE auth_limits(bucket_id TEXT PRIMARY KEY,hits INTEGER,expires_at INTEGER);
  CREATE TABLE auth_email_status(user_id TEXT PRIMARY KEY,email TEXT,verified_at TEXT);
  CREATE TABLE auth_email_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT,email TEXT,purpose TEXT,password_version INTEGER,created_at INTEGER,expires_at INTEGER,used_at INTEGER,claim_id TEXT);
  CREATE TABLE user_access(user_id TEXT PRIMARY KEY,status TEXT);`);
  const prepare=(query,values=[])=>({bind(...v){return prepare(query,v)},async first(){return sql.prepare(query).get(...values)??null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){return{meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}});
  const d={prepare,async batch(statements){sql.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());sql.exec("COMMIT");return results}catch(e){sql.exec("ROLLBACK");throw e}}};
  try{await accountEmailScenarios(t,d)}finally{sql.close()}
});
