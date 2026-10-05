export type JudgeConfig = {
  url: string;
  token?: string;
  languageIds?: Record<string, number>;
};
export type JudgeResult = {
  status: { id: number; description: string };
  stdout?: string;
  stderr?: string;
  compile_output?: string;
  time?: string;
  memory?: number;
};
export async function submitCode(
  config: JudgeConfig,
  language: string,
  source: string,
  tests: { input: string; expected: string }[],
  fetcher: typeof fetch = fetch,
) {
  const base = new URL(config.url);
  if (base.protocol !== "https:")
    throw new Error("Judge0 membutuhkan endpoint HTTPS.");
  const lang = config.languageIds?.[language];
  if (!lang) throw new Error("Bahasa belum dikonfigurasi.");
  const headers = {
    "Content-Type": "application/json",
    ...(config.token ? { "X-Auth-Token": config.token } : {}),
  };
  const response = await fetcher(
    `${config.url.replace(/\/$/, "")}/submissions/batch?base64_encoded=false`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        submissions: tests.map((t) => ({
          language_id: lang,
          source_code: source,
          stdin: t.input,
          expected_output: t.expected,
          cpu_time_limit: 2,
          wall_time_limit: 5,
          memory_limit: 64000,
          max_file_size: 1024,
          max_processes_and_or_threads: 32,
          enable_network: false,
        })),
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Layanan pemeriksa belum dapat menerima kode. Coba lagi nanti.",
    );
  const data = (await response.json()) as { token?: string }[];
  if (
    !Array.isArray(data) ||
    data.length !== tests.length ||
    data.some((d) => !d.token)
  )
    throw new Error("Respons layanan pemeriksa tidak lengkap.");
  return data.map((d) => d.token!);
}
export async function pollCode(
  config: JudgeConfig,
  tokens: string[],
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(
    `${config.url.replace(/\/$/, "")}/submissions/batch?tokens=${encodeURIComponent(tokens.join(","))}&base64_encoded=false&fields=status,stdout,stderr,compile_output,time,memory`,
    {
      headers: config.token ? { "X-Auth-Token": config.token } : {},
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error("Hasil pemeriksaan belum dapat diambil.");
  const data = (await response.json()) as { submissions: JudgeResult[] };
  if (
    !Array.isArray(data.submissions) ||
    data.submissions.length !== tokens.length ||
    data.submissions.some((r) => !r?.status)
  )
    throw new Error("Hasil pemeriksaan belum lengkap.");
  return data.submissions;
}
