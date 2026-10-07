import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AuthError, appOrigin } from "./auth-policy.ts";
import type { AccountMail, DeliverMail } from "./account-email.ts";
import { z } from "zod";

type Env = Record<string, string | undefined>;
export function mailConfiguration(env: Env = process.env) {
  const mode = env.MAIL_DELIVERY || "disabled";
  const origin = appOrigin(env);
  if (mode === "preview") {
    if (env.NODE_ENV !== "development" || !["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
      throw new AuthError(503, "Email uji hanya tersedia pada pengembangan lokal.");
    return { mode: "preview" as const, directory: path.resolve(process.cwd(), "work/account-mail") };
  }
  if (mode !== "smtp") throw new AuthError(503, "Pengiriman email belum disiapkan. Hubungi pengelola.");
  const host = env.SMTP_HOST?.trim(), port = Number(env.SMTP_PORT || 465);
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || ![465, 587].includes(port) || !env.SMTP_USER || !env.SMTP_PASSWORD || !z.string().email().safeParse(env.MAIL_FROM).success)
    throw new AuthError(503, "Konfigurasi email belum lengkap. Hubungi pengelola.");
  return { mode: "smtp" as const, host, port, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.MAIL_FROM! };
}
export function accountMailText(message: AccountMail) {
  if (message.purpose === "test") return { subject: "Email uji Ruang STEM", text: "Ini adalah email uji pengaturan Ruang STEM. Jika pesan ini diterima, kembali ke Kelola akses untuk mengaktifkan pengiriman email akun. Periksa juga folder spam.\n\nRuang STEM" };
  const reset = message.purpose === "reset", changed = message.purpose === "changed";
  const subject = changed ? "Password Ruang STEM berhasil diubah" : reset ? "Pulihkan password Ruang STEM" : "Verifikasi email Ruang STEM";
  const text = changed
    ? "Password akun Ruang STEM Anda sudah diubah dan semua sesi sebelumnya diakhiri. Jika Anda tidak melakukan perubahan ini, hubungi pengelola segera."
    : `${reset ? "Gunakan tautan berikut untuk membuat password baru. Tautan berlaku 30 menit." : "Konfirmasikan alamat email Anda dengan tautan berikut. Tautan berlaku 24 jam; persetujuan akses belajar tetap ditinjau Super Admin."}\n\n${message.url}\n\nTautan hanya berlaku sekali. Jika tidak meminta email ini, Anda dapat mengabaikannya. Jangan bagikan tautan kepada orang lain.`;
  return { subject, text: `${text}\n\nRuang STEM` };
}
export function accountMailer(env: Env = process.env): DeliverMail {
  const config = mailConfiguration(env);
  return async (message) => {
    const content = accountMailText(message);
    if (config.mode === "preview") {
      await mkdir(config.directory, { recursive: true, mode: 0o700 });
      await writeFile(path.join(config.directory, `${randomUUID()}.json`), JSON.stringify({ to: message.to, ...content }, null, 2), { mode: 0o600, flag: "wx" });
      return;
    }
    const transport = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.port === 465, requireTLS: true,
      auth: { user: config.user, pass: config.password }, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
    try {
      const result = await transport.sendMail({ from: { name: "Ruang STEM", address: config.from }, to: message.to, ...content });
      if (!result.accepted.length) throw new Error("Mail not accepted");
    } finally { transport.close(); }
  };
}
