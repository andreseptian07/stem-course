import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Next loads the ignored .env.local database configuration itself.
// Override only the local origin; never modify hosting environment settings.
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "5173"], {
  stdio: "inherit",
  env: { ...process.env, APP_URL: "http://127.0.0.1:5173", AUTH_ALLOW_LOCAL_HTTP: "true" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Server lokal belum dapat dijalankan."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 0; });
