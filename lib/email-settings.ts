import { createHash } from "node:crypto";
import { z } from "zod";
import { appOrigin, AuthError } from "./auth-policy.ts";
import {authorizationGuard} from "./authorization.ts";
import { requireOwner } from "./access.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { mailConfiguration, accountMailer } from "./mailer.ts";
import type { DeliverMail } from "./account-email.ts";
type Env = Record<string, string | undefined>;
const stateSchema = z.object({ version: z.number().int().min(1), enabled: z.boolean(), required: z.boolean(), testedAt: z.string().nullable(), fingerprint: z.string().nullable() }).strict();
type State = z.infer<typeof stateSchema>;
function settingKey(env: Env) { return "account_mail:" + createHash("sha256").update(appOrigin(env)).digest("hex").slice(0, 24); }
function smtpState(env: Env) {
  try {
    const config = mailConfiguration({ ...env, MAIL_DELIVERY: "smtp" });
    if (config.mode !== "smtp") throw new Error();
    return { ready: true, fingerprint: createHash("sha256").update(JSON.stringify([appOrigin(env), config.host, config.port, config.user, config.password, config.from])).digest("hex") };
  } catch { return { ready: false, fingerprint: null }; }
}
export async function readEmailSettings(d: PlatformDatabase, env: Env = process.env) {
  const key = settingKey(env), row = await d.prepare("SELECT value FROM settings WHERE `key`=?").bind(key).first<{ value: string }>();
  const state: State = row ? stateSchema.parse(JSON.parse(row.value)) : { version: 1, enabled: false, required: env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true", testedAt: null, fingerprint: null };
  const smtp = smtpState(env);
  const tested = smtp.ready && !!state.testedAt && state.fingerprint === smtp.fingerprint;
  return { key, raw: row?.value ?? null, state, smtp, active: state.enabled && tested, tested };
}
export async function emailSettingsOverview(d: PlatformDatabase, user: { id: string }, env: Env = process.env) {
  await requireOwner(d,user);
  const guard=await authorizationGuard(d,user,'owner');
  const r = await readEmailSettings(d, env);
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AuthError(403,'Hak pengelola berubah. Muat ulang pengaturan.');
  return { version: r.state.version, smtpReady: r.smtp.ready, tested: r.tested, testedAt: r.tested ? r.state.testedAt : null, enabled: r.active, requestedEnabled: r.state.enabled, required: r.state.required, preview: env.MAIL_DELIVERY === "preview" };
}
export const emailSettingMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), version: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("enable"), version: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("disable"), version: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("requireVerification"), version: z.number().int().min(1), required: z.boolean() }).strict(),
]);
export async function updateEmailSettings(d: PlatformDatabase, user: { id: string }, raw: unknown, env: Env = process.env, testSender?: DeliverMail) {
  await requireOwner(d,user);
  const guard=await authorizationGuard(d,user,"owner");
  const b = emailSettingMutation.parse(raw), r = await readEmailSettings(d, env);
  if (b.version !== r.state.version) throw new AuthError(409, "Pengaturan berubah. Muat ulang sebelum mencoba lagi.");
  const next = { ...r.state, version: r.state.version + 1 };
  if (b.action === "test") {
    if (!r.smtp.ready) throw new AuthError(400, "Lengkapi konfigurasi SMTP terlebih dahulu.");
    const owner = await d.prepare("SELECT email FROM auth_credentials WHERE user_id=?").bind(user.id).first<{ email: string }>();
    if (!owner) throw new AuthError(400, "Email akun pengelola belum tersedia.");
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AuthError(409,'Hak pengelola berubah sebelum pengiriman email uji.');
    try { await (testSender ?? accountMailer({ ...env, MAIL_DELIVERY: "smtp" }))({ to: owner.email, purpose: "test" }); }
    catch { throw new AuthError(503, "Email uji belum dapat dikirim. Periksa konfigurasi SMTP dan coba lagi."); }
    next.testedAt = new Date().toISOString(); next.fingerprint = r.smtp.fingerprint;
    if (!r.active) next.enabled = false;
  } else if (b.action === "enable") {
    if (!r.tested) throw new AuthError(400, "Uji pengiriman email harus berhasil dengan konfigurasi SMTP saat ini sebelum aktivasi.");
    next.enabled = true;
  } else if (b.action === "disable") {
    next.enabled = false;
    if (next.required) throw new AuthError(400, "Matikan kewajiban verifikasi terlebih dahulu sebelum menonaktifkan email.");
  } else {
    if (b.required && !r.active) throw new AuthError(400, "Aktifkan pengiriman email terlebih dahulu sebelum mewajibkan verifikasi.");
    next.required = b.required;
  }
  const value = JSON.stringify(next);
  const result = r.raw === null
    ? await d.prepare(databaseSql(d, `INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE ${guard.sql}`, `INSERT INTO settings(\`key\`,value) SELECT ?,? WHERE ${guard.sql} ON DUPLICATE KEY UPDATE \`key\`=\`key\``))
      .bind(r.key, value,...guard.binds).run()
    : await d.prepare(`UPDATE settings SET value=? WHERE \`key\`=? AND value=? AND ${guard.sql}`)
      .bind(value,r.key,r.raw,...guard.binds).run();
  if (!result.meta.changes) throw new AuthError(409, "Pengaturan berubah. Muat ulang sebelum mencoba lagi.");
  return emailSettingsOverview(d, user, env);
}
export async function configuredAccountMailer(d: PlatformDatabase, env: Env = process.env, optional = false): Promise<DeliverMail | null> {
  const r = await readEmailSettings(d, env);
  if (r.active) return accountMailer({ ...env, MAIL_DELIVERY: "smtp" });
  if (env.MAIL_DELIVERY === "preview") return accountMailer(env);
  if (optional) return null;
  throw new AuthError(503, "Pengiriman email belum diaktifkan. Hubungi pengelola.");
}
