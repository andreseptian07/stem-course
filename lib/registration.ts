import { z } from "zod";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import {authorizationGuard} from "./authorization.ts";
import { AccessError } from "./access-error.ts";

const key = "student_registration_enabled";
export async function registrationEnabled(d: PlatformDatabase, env = process.env) {
  const setting = await d.prepare("SELECT value FROM settings WHERE `key`=?").bind(key).first<{ value: string }>();
  return setting ? setting.value === "true" : env.AUTH_REGISTRATION_ENABLED?.trim().toLowerCase() === "true";
}
export async function setRegistration(d: PlatformDatabase, user: { id: string }, raw: unknown) {
  const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(raw);
  const guard=await authorizationGuard(d,user,"owner");
  await d.prepare(databaseSql(d,
    `INSERT INTO settings(key,value) SELECT ?,? WHERE ${guard.sql} ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    `INSERT INTO settings(\`key\`,value) SELECT ?,? WHERE ${guard.sql} ON DUPLICATE KEY UPDATE value=VALUES(value)`))
    .bind(key, String(enabled),...guard.binds).run();
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(409,'Hak pengelola berubah. Muat ulang pengaturan.');
  return { enabled: await registrationEnabled(d) };
}
