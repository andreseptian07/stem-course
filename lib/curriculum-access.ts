import type { PlatformDatabase } from "./database.ts";
import { AccessError } from "./access.ts";
// Recheck persisted capabilities rather than trusting the role sent by a client.
export const curriculumPredicate = "EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND status='active') AND (EXISTS(SELECT 1 FROM settings WHERE `key`='owner' AND value=?) OR EXISTS(SELECT 1 FROM curriculum_members WHERE course_id=? AND user_id=? AND active=1))";
export const curriculumBindings = (id: string, courseId: string) => [id, id, courseId, id];
export async function hasCurriculumAccess(d: PlatformDatabase, u: {
    id: string;
}, courseId: string) {
    return !!await d.prepare(`SELECT 1 WHERE ${curriculumPredicate}`).bind(...curriculumBindings(u.id, courseId)).first();
}
export async function requireCurriculumAccess(d: PlatformDatabase, u: {
    id: string;
}, courseId: string) {
    if (!await hasCurriculumAccess(d, u, courseId))
        throw new AccessError(403, "Anda belum ditugaskan ke Tim Kurikulum course ini.");
}
export async function curriculumEnabled(d: PlatformDatabase, u: {
    id: string;
}) {
    return !!await d.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM settings WHERE `key`='owner' AND value=?) OR EXISTS(SELECT 1 FROM curriculum_members WHERE user_id=? AND active=1)").bind(u.id, u.id).first();
}
