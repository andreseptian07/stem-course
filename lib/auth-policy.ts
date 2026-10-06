import { AccessError } from "./access.ts";
export class AuthError extends AccessError {}
export function appOrigin(env: Record<string, string | undefined> = process.env) {
  const value = env.APP_URL;
  if (!value) throw new AuthError(503, "APP_URL belum dikonfigurasi.");
  let url: URL;
  try { url = new URL(value); } catch { throw new AuthError(503, "APP_URL tidak valid."); }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:" && env.NODE_ENV !== "production" && env.AUTH_ALLOW_LOCAL_HTTP === "true")))
    throw new AuthError(503, "APP_URL harus HTTPS; HTTP hanya untuk pengembangan localhost.");
  return url.origin;
}
export function checkAuthOrigin(request: Request, env = process.env) {
  if (request.headers.get("origin") !== appOrigin(env) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new AuthError(403, "Asal permintaan tidak valid.");
}
export function safeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || /^\/(login|register|logout|api\/auth)(\/|$)/.test(url.pathname)) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/dashboard"; }
}
export const sessionDuration = 8 * 60 * 60 * 1000;
export const idleDuration = 60 * 60 * 1000;
export function sessionCookie(env = process.env) {
  const secure = appOrigin(env).startsWith("https:");
  return { name: secure ? "__Host-stem-session" : "stem-local-session", httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: sessionDuration / 1000 };
}
