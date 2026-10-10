import { checkAuthOrigin } from "@/lib/auth-policy";
import { identity, judgeConfig, json, AppError } from "@/lib/server";
import {authorizationGuard} from "@/lib/authorization";
import {db} from "@/lib/server";
import { judgeReadiness } from "@/lib/judge-readiness";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const guard=await authorizationGuard(db(),await identity(),"curriculum");
    const result=await judgeReadiness(judgeConfig());
    if(!await db().prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak kurikulum berubah.');
    return json({passed:result.passed});
  } catch(e) {
    return json({error:e instanceof AppError?e.message:"Kesiapan pemeriksa belum dapat diperiksa."},e instanceof AppError?e.status:503);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    const guard=await authorizationGuard(db(),await identity(),"owner");
    const cfg = judgeConfig();
    if(!await db().prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak pengelola berubah.');
    const result=await judgeReadiness(cfg,true);
    if(!await db().prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak pengelola berubah.');
    return json(result);
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
