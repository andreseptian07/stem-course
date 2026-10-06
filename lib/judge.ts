export type JudgeConfig = {
  url: string;
  token?: string;
  apiKey?: string;
  apiHost?: string;
  languageIds?: Record<string, number>;
};
export class JudgeError extends Error {
  constructor() {
    super(
      "Layanan pemeriksa belum dapat memproses kode. Kuota percobaan dikembalikan; coba lagi nanti.",
    );
  }
}
export const STATUS: Record<number, string> = {
  1: "Dalam antrean",
  2: "Sedang dijalankan",
  3: "Lulus",
  4: "Output belum sesuai",
  5: "Batas waktu terlampaui",
  6: "Kesalahan kompilasi",
  7: "Kesalahan runtime",
  8: "Kesalahan runtime",
  9: "Kesalahan runtime",
  10: "Kesalahan runtime",
  11: "Kesalahan runtime",
  12: "Kesalahan runtime",
  13: "Gangguan pemeriksa",
  14: "Gangguan pemeriksa",
};
export type JudgeResult = {
  token: string;
  status: { id: number; description: string };
  stdout?: string;
  stderr?: string;
  compile_output?: string;
  time?: string;
  memory?: number;
};
export function validateConfig(config: JudgeConfig) {
  const base = new URL(config.url);
  const host = base.hostname.toLowerCase();
  // Only an operator-configured public DNS endpoint is accepted. Private connectivity needs a separate adapter.
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.port && base.port !== "443") ||
    !host.includes(".") ||
    /[\[\]:]/.test(host) ||
    /^\d+(\.\d+){3}$/.test(host) ||
    /(^|\.)(localhost|local|internal|test)$/.test(host)
  )
    throw new JudgeError();
  if (
    !(config.token || config.apiKey) ||
    /[\r\n]/.test((config.token || "") + (config.apiKey || ""))
  )
    throw new JudgeError();
  if (config.apiKey && config.apiHost !== host) throw new JudgeError();
  for (const id of Object.values(config.languageIds || {}))
    if (!Number.isSafeInteger(id) || id <= 0) throw new JudgeError();
  return base.href.replace(/\/$/, "");
}
function headers(config: JudgeConfig) {
  return {
    "Content-Type": "application/json",
    ...(config.token ? { "X-Auth-Token": config.token } : {}),
    ...(config.apiKey
      ? { "X-RapidAPI-Key": config.apiKey, "X-RapidAPI-Host": config.apiHost! }
      : {}),
  };
}
async function request(
  config: JudgeConfig,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
) {
  const url = validateConfig(config) + path;
  try {
    const r = await fetcher(url, {
      ...init,
      headers: headers(config),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok || !r.body) throw new JudgeError();
    const reader = r.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 400000) {
        await reader.cancel();
        throw new JudgeError();
      }
      chunks.push(part.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new JudgeError();
  }
}
export function encode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function decode(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || value.length > 50000) throw new JudgeError();
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text.length > 8000
      ? text.slice(0, 8000) + "\n[Output dipotong]"
      : text;
  } catch {
    throw new JudgeError();
  }
}
const tokenValid = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export async function submitCode(
  config: JudgeConfig,
  language: string,
  source: string,
  tests: { input: string; expected: string }[],
  fetcher: typeof fetch = fetch,
) {
  const lang = config.languageIds?.[language];
  if (
    !lang ||
    !Number.isSafeInteger(lang) ||
    !source.trim() ||
    source.length > 20000 ||
    tests.length < 1 ||
    tests.length > 8 ||
    tests.some(
      (t) =>
        typeof t.input !== "string" ||
        typeof t.expected !== "string" ||
        t.input.length > 5000 ||
        t.expected.length > 5000,
    )
  )
    throw new JudgeError();
  const data = await request(
    config,
    "/submissions/batch?base64_encoded=true",
    {
      method: "POST",
      body: JSON.stringify({
        submissions: tests.map((t) => ({
          language_id: lang,
          source_code: encode(source),
          stdin: encode(t.input),
          expected_output: encode(t.expected),
          cpu_time_limit: 2,
          cpu_extra_time: 0.5,
          wall_time_limit: 5,
          memory_limit: 64000,
          stack_limit: 64000,
          max_file_size: 64,
          max_processes_and_or_threads: 16,
          number_of_runs: 1,
          enable_per_process_and_thread_time_limit: false,
          enable_per_process_and_thread_memory_limit: false,
          enable_network: false,
        })),
      }),
    },
    fetcher,
  );
  if (
    !Array.isArray(data) ||
    data.length !== tests.length ||
    data.some((d) => !tokenValid(d?.token)) ||
    new Set(data.map((d) => d.token)).size !== data.length
  )
    throw new JudgeError();
  return data.map((d) => d.token) as string[];
}
export async function pollCode(
  config: JudgeConfig,
  tokens: string[],
  fetcher: typeof fetch = fetch,
): Promise<JudgeResult[]> {
  if (
    !tokens.length ||
    tokens.length > 8 ||
    tokens.some((t) => !tokenValid(t)) ||
    new Set(tokens).size !== tokens.length
  )
    throw new JudgeError();
  const data = await request(
    config,
    `/submissions/batch?tokens=${encodeURIComponent(tokens.join(","))}&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,time,memory`,
    {},
    fetcher,
  );
  if (
    !Array.isArray(data?.submissions) ||
    data.submissions.length !== tokens.length
  )
    throw new JudgeError();
  const results = data.submissions;
  if (
    new Set(results.map((r: any) => r?.token)).size !== tokens.length ||
    results.some(
      (r: any) =>
        !tokens.includes(r?.token) ||
        !Number.isInteger(r?.status?.id) ||
        !STATUS[r.status.id],
    )
  )
    throw new JudgeError();
  return tokens.map((token) => {
    const r = results.find((r: any) => r.token === token);
    return {
      token,
      status: { id: r.status.id, description: STATUS[r.status.id] },
      stdout: decode(r.stdout),
      stderr: decode(r.stderr),
      compile_output: decode(r.compile_output),
    };
  });
}
export function gradeCode(results: JudgeResult[], hidden: boolean[]) {
  if (
    !results.length ||
    results.length !== hidden.length ||
    hidden.some((h) => typeof h !== "boolean")
  )
    throw new JudgeError();
  if (results.some((r) => r.status.id === 13 || r.status.id === 14))
    throw new JudgeError();
  if (results.some((r) => r.status.id <= 2)) return null;
  return {
    passed: results.every((r) => r.status.id === 3),
    score: Math.round(
      (results.filter((r) => r.status.id === 3).length / results.length) * 100,
    ),
    tests: results.map((r, i) => ({
      index: i + 1,
      hidden: hidden[i],
      passed: r.status.id === 3,
      status: STATUS[r.status.id],
      ...(!hidden[i]
        ? {
            stdout: r.stdout,
            stderr: r.stderr,
            compileOutput: r.compile_output,
          }
        : {}),
    })),
  };
}
export async function inspectJudge(
  config: JudgeConfig,
  fetcher: typeof fetch = fetch,
) {
  const about = await request(config, "/about", {}, fetcher);
  const settings = await request(config, "/config_info", {}, fetcher);
  const languages = await request(config, "/languages", {}, fetcher);
  const match =
    typeof about?.version === "string" &&
    /^(\d+)\.(\d+)\.(\d+)$/.exec(about.version);
  const patched =
    !!match &&
    (Number(match[1]) > 1 ||
      (Number(match[1]) === 1 &&
        (Number(match[2]) > 13 ||
          (Number(match[2]) === 13 && Number(match[3]) >= 1))));
  const supported =
    Array.isArray(languages) &&
    Object.values(config.languageIds || {}).every((id) =>
      languages.some((l) => l.id === id),
    );
  const network =
    settings?.enable_network === false &&
    settings?.allow_enable_network === false;
  return {
    checks: [
      { label: "Versi minimum dengan perbaikan keamanan 1.13.1", ok: patched },
      { label: "Jaringan program dimatikan di layanan", ok: network },
      { label: "Bahasa latihan tersedia", ok: supported },
    ],
    passed: patched && network && supported,
  };
}
