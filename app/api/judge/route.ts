import { checkAuthOrigin } from "@/lib/auth-policy";
import { identity, owner, judgeConfig, json, AppError } from "@/lib/server";
import { inspectJudge } from "@/lib/judge";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    owner(await identity());
    const cfg = judgeConfig();
    if (!cfg)
      return json({
        passed: false,
        checks: [],
        message:
          "Layanan server belum diaktifkan. Latihan Python dan JavaScript tetap bisa dijalankan di browser.",
      });
    return json(await inspectJudge(cfg));
  } catch (e) {
    return json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Koneksi pemeriksa belum berhasil. Periksa konfigurasi layanan.",
      },
      e instanceof AppError ? e.status : 503,
    );
  }
}
