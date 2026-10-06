import { z } from "zod";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { requireOwner } from "./access.ts";

const key = "student_registration_enabled";
export async function registrationEnabled(d: PlatformDatabase, env = process.env) {
  const setting = await d.prepare("SELECT value FROM settings WHERE `key`=?").bind(key).first<{ value: string }>();
  return setting ? setting.value === "true" : env.AUTH_REGISTRATION_ENABLED?.trim().toLowerCase() === "true";
}
export async function setRegistration(d: PlatformDatabase, user: { id: string }, raw: unknown) {
  const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(raw);
  await requireOwner(d, user);
  await d.prepare(databaseSql(d,
    "INSERT INTO settings(key,value) SELECT ?,? WHERE ?=(SELECT value FROM settings WHERE key='owner') ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    "INSERT INTO settings(`key`,value) SELECT ?,? WHERE ?=(SELECT value FROM settings WHERE `key`='owner') ON DUPLICATE KEY UPDATE value=VALUES(value)"))
    .bind(key, String(enabled), user.id).run();
  return { enabled: await registrationEnabled(d) };
}
