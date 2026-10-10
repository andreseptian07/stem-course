"use client";
import { useRef, useState, useEffect } from "react";
import type { Exercise } from "@/lib/model";
type PracticeResult = {index:number;passed:boolean;stdout:string;stderr:string};
type RuntimeResult = {type:"result";nonce:string;stdout?:string;stderr?:string;error?:boolean};
export default function BrowserPractice({
  exercise,
  source,
}: {
  exercise: NonNullable<Exercise>;
  source: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    cancel = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<PracticeResult[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (
        e.source === frame.current?.contentWindow &&
        e.data?.type === "practice-ready"
      )
        setReady(true);
    };
    window.addEventListener("message", listen);
    return () => {
      window.removeEventListener("message", listen);
      cancel.current?.();
    };
  }, []);
  async function run() {
    setBusy(true);
    setError("");
    setResults([]);
    try {
      for (let i = 0; i < exercise.tests.length; i++) {
        const test = exercise.tests[i],
          nonce = crypto.randomUUID();
        const value = await new Promise<RuntimeResult>((resolve, reject) => {
          const clean = () => {
            clearTimeout(timer);
            window.removeEventListener("message", listen);
            cancel.current = null;
          };
          const listen = (e: MessageEvent) => {
            if (
              e.source !== frame.current?.contentWindow ||
              e.data?.type !== "result" ||
              e.data.nonce !== nonce
            )
              return;
            const payload: unknown = e.data;
            if (!payload || typeof payload !== "object" ||
              ("stdout" in payload && typeof payload.stdout !== "string") ||
              ("stderr" in payload && typeof payload.stderr !== "string") ||
              ("error" in payload && typeof payload.error !== "boolean")) return;
            clean();
            resolve(payload as RuntimeResult);
          };
          const timer = setTimeout(() => {
            clean();
            reject(Error("Latihan dihentikan karena melewati batas waktu."));
          }, 35000);
          cancel.current = () => {
            clean();
            reject(Error("Latihan dihentikan."));
          };
          window.addEventListener("message", listen);
          frame.current!.contentWindow!.postMessage(
            {
              type: "run",
              nonce,
              language: exercise.language,
              source,
              input: test.input,
            },
            "*",
          );
        });
        const normalize = (s: string) =>
          s.replace(/\r\n/g, "\n").replace(/\n+$/, "");
        const passed =
          !value.error &&
          normalize(String(value.stdout || "")) === normalize(test.expected);
        setResults((r) => [
          ...r,
          {
            index: i + 1,
            passed,
            stdout: String(value.stdout || "").slice(0, 8000),
            stderr: String(value.stderr || "").slice(0, 8000),
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Latihan belum berhasil.");
    } finally {
      setBusy(false);
    }
  }
  if (exercise.language === "cpp")
    return (
      <p className="feedback warning">
        Latihan C++ memerlukan pemeriksa server. Anda tetap dapat menyiapkan
        kode di editor.
      </p>
    );
  return (
    <div className="browser-practice">
      <iframe
        ref={frame}
        src="/practice-runner.html"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title="Runtime latihan terisolasi"
        hidden
      />
      <p>
        Latihan gratis di browser · hanya contoh pengujian yang terlihat. Hasil
        ini tidak menyimpan nilai atau membuka materi wajib. Python perlu
        mengunduh runtime saat pertama digunakan.
      </p>
      {exercise.language === "javascript" && (
        <p>
          Gunakan <code>input()</code> atau <code>readline()</code> untuk
          membaca baris input, dan <code>console.log()</code> atau{" "}
          <code>print()</code> untuk output.
        </p>
      )}
      <button
        className="secondary"
        disabled={!ready || busy || !source.trim() || source.length > 20000}
        onClick={run}
      >
        {busy ? "Menjalankan contoh…" : "Coba gratis di browser"}
      </button>
      {busy && (
        <button
          className="ghost"
          onClick={() => {
            cancel.current?.();
            if (frame.current) {
              frame.current.src = "/practice-runner.html";
              setReady(false);
            }
          }}
        >
          Hentikan latihan
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {results.map((r) => (
          <div
            className={`feedback ${r.passed ? "success" : "warning"}`}
            key={r.index}
          >
            <strong>
              Contoh {r.index} · {r.passed ? "Output sesuai" : "Periksa solusi"}
            </strong>
            {r.stdout && <pre>{r.stdout}</pre>}
            {r.stderr && <pre>{r.stderr}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
