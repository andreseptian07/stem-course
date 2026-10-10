import type { PoolOptions } from "mysql2/promise";

type Environment = Record<string, string | undefined>;

export class MariaDbSetupError extends Error {}

function required(env: Environment, name: string, preserve = false): string {
  const value = preserve ? env[name] : env[name]?.trim();
  if (!value) throw new MariaDbSetupError(`Isi ${name} di .env.local atau environment Hostinger.`);
  return value;
}

function integer(env: Environment, name: string, fallback: number, max: number) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new MariaDbSetupError(`${name} harus berupa bilangan bulat.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new MariaDbSetupError(`${name} harus antara 1 dan ${max}.`);
  return value;
}

export function mariaDbOptions(env: Environment): PoolOptions {
  const mode = env.DB_SSL_MODE ?? "required";
  if (mode !== "required" && mode !== "disabled")
    throw new MariaDbSetupError("DB_SSL_MODE harus required atau disabled.");
  let ca: string | undefined;
  if (env.DB_SSL_CA_BASE64) {
    const raw = env.DB_SSL_CA_BASE64.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0)
      throw new MariaDbSetupError("DB_SSL_CA_BASE64 harus berupa sertifikat CA base64 yang valid.");
    ca = Buffer.from(raw, "base64").toString("utf8");
    if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----"))
      throw new MariaDbSetupError("DB_SSL_CA_BASE64 tidak berisi sertifikat CA PEM.");
    if (mode === "disabled") throw new MariaDbSetupError("Sertifikat CA memerlukan DB_SSL_MODE=required.");
  }
  const connectionLimit = integer(env, "DB_POOL_LIMIT", 3, 20);
  return {
    host: required(env, "DB_HOST"),
    port: integer(env, "DB_PORT", 3306, 65535),
    user: required(env, "DB_USER"),
    database: required(env, "DB_NAME"),
    // Do not trim passwords: spaces and special characters may be intentional.
    password: required(env, "DB_PASSWORD", true),
    connectionLimit,
    // mysql2 only starts idle cleanup when maxIdle < connectionLimit.
    // Hosting currently closes idle sessions after 20 seconds.
    maxIdle: connectionLimit - 1,
    idleTimeout: integer(env, "DB_POOL_IDLE_MS", 10000, 300000),
    waitForConnections: true,
    queueLimit: 30,
    connectTimeout: 10000,
    charset: "utf8mb4_bin",
    timezone: "Z",
    dateStrings: true,
    multipleStatements: false,
    // A no-op duplicate insertion must report zero, as it does on D1.
    flags: ["-FOUND_ROWS"],
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(mode === "required"
      ? { ssl: { rejectUnauthorized: true, verifyIdentity: true, ...(ca ? { ca } : {}) } }
      : {}),
  };
}

// Never print driver error objects: they may contain SQL or connection details.
export function mariaDbErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code) : "";
  if (code === "ER_ACCESS_DENIED_ERROR") return "Login database ditolak. Periksa DB_USER, DB_PASSWORD dan izin host di hPanel.";
  if (code === "ER_BAD_DB_ERROR") return "Database tidak ditemukan. Periksa DB_NAME.";
  if (["ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND"].includes(code))
    return "Database belum dapat dijangkau. Periksa host, port dan Remote MySQL di hPanel.";
  if (["HANDSHAKE_NO_SSL_SUPPORT", "HANDSHAKE_SSL_ERROR", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code))
    return "TLS database gagal. Konfirmasikan hostname, dukungan TLS dan sertifikat CA kepada Hostinger.";
  // Configuration errors are ours and contain only fixed text / variable names.
  if (error instanceof MariaDbSetupError) return error.message;
  return `Operasi database gagal${/^[A-Z_0-9]+$/.test(code) ? ` (${code})` : ""}. Detail sensitif tidak ditampilkan.`;
}
