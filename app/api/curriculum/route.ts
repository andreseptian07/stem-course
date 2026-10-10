import { ClassError } from "@/lib/classes";
import { databaseFailureMessage } from "@/lib/database-failure";
import { z } from "zod";
import { identity, db, json, AppError } from "@/lib/server";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { readRequestText } from "@/lib/request-body";
import { curriculumOverview, mutateCurriculum } from "@/lib/curriculum";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
    if (e instanceof AppError || e instanceof ClassError)
        return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
        return json({ error: e.issues[0]?.message || "Isian tidak valid." }, 400);
    return json({ error: databaseFailureMessage(e, "Workspace kurikulum belum dapat diproses. Coba lagi; draf Anda tetap tersedia.") }, 503);
}
export async function GET() { try {
    return json(await curriculumOverview(db(), await identity()));
}
catch (e) {
    return failure(e);
} }
export async function POST(req: Request) {
    try {
        checkAuthOrigin(req);
        if (!req.headers.get('content-type')?.includes('application/json'))
            throw new AppError(415, "Gunakan JSON.");
        const text = await readRequestText(req, 1000000);
        let body;
        try {
            body = JSON.parse(text);
        }
        catch {
            throw new AppError(400, "JSON tidak valid.");
        }
        return json(await mutateCurriculum(db(), await identity(), body));
    }
    catch (e) {
        return failure(e);
    }
}
