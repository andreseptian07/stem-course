import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError, requireOwner } from "./access.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { courseSchema } from "./validation.ts";
import { validateCourseMedia } from "./media-data.ts";
import { fileStorage } from "./project-files.ts";
import { curriculumPredicate, curriculumBindings, requireCurriculumAccess } from "./curriculum-access.ts";
import type { Course } from "./model.ts";
const identifier = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const version = z.number().int().nonnegative();
export const curriculumMutation = z.discriminatedUnion("action", [
    z.object({ action: z.literal("member"), courseId: identifier, userId: identifier, version, active: z.boolean() }).strict(),
    z.object({ action: z.enum(["start", "restart"]), courseId: identifier, version, draftVersion: version.default(0) }).strict(),
    z.object({ action: z.literal("save"), course: courseSchema, version }).strict(),
    z.object({ action: z.enum(["submit", "requestChanges", "publish"]), courseId: identifier, version, note: z.string().trim().max(2000).default("") }).strict(),
]);
type User = {
    id: string;
    role: string;
};
type Draft = {
    course_id: string;
    data: string;
    base_version: number;
    version: number;
    state: string;
    updated_by: string;
    updated_at: string;
    note: string;
    proof: string;
};
const conflict = () => new AccessError(409, "Draf, akses, atau course sudah berubah. Muat ulang sebelum melanjutkan.");
async function isOwner(d: PlatformDatabase, u: User) { return !!await d.prepare("SELECT 1 FROM settings WHERE `key`='owner' AND value=?").bind(u.id).first(); }
export async function curriculumOverview(d: PlatformDatabase, u: User) {
    const owner = await isOwner(d, u);
    const courses = (await d.prepare("SELECT c.id,c.data,c.version FROM courses c WHERE ?=1 OR EXISTS(SELECT 1 FROM curriculum_members m WHERE m.course_id=c.id AND m.user_id=? AND m.active=1) ORDER BY c.id").bind(owner ? 1 : 0, u.id).all<{
        id: string;
        data: string;
        version: number;
    }>()).results;
    const items = await Promise.all(courses.map(async (c) => {
        await requireCurriculumAccess(d, u, c.id);
        const draft = await d.prepare("SELECT * FROM curriculum_drafts WHERE course_id=?").bind(c.id).first<Draft>();
        const members = (await d.prepare("SELECT m.user_id AS userId,m.active,m.version,u.name,u.role FROM curriculum_members m JOIN users u ON u.id=m.user_id WHERE m.course_id=? ORDER BY u.name").bind(c.id).all()).results;
        const events = (await d.prepare("SELECT e.id,e.kind,e.detail,e.created_at AS createdAt,u.name AS actor FROM curriculum_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.course_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 40").bind(c.id).all()).results;
        return { course: { ...JSON.parse(c.data), version: c.version } as Course, members, events, draft: draft ? { course: JSON.parse(draft.data) as Course, version: draft.version, baseVersion: draft.base_version, state: draft.state, updatedAt: draft.updated_at, note: draft.note } : null };
    }));
    const people = owner ? (await d.prepare("SELECT u.id,u.name,u.role FROM users u JOIN user_access a ON a.user_id=u.id WHERE a.status='active' AND u.id!=? ORDER BY u.name").bind(u.id).all()).results : [];
    return { owner, items, people };
}
export async function mutateCurriculum(d: PlatformDatabase, u: User, raw: unknown) {
    const b = curriculumMutation.parse(raw), courseId = b.action === 'save' ? b.course.id : b.courseId;
    await requireCurriculumAccess(d, u, courseId);
    const proof = randomUUID(), time = new Date().toISOString();
    const event = (kind: string, detail: string, predicate: string, bindings: (string | number)[]) => d.prepare(`INSERT INTO curriculum_events(id,course_id,actor_id,kind,detail,created_at) SELECT ?,?,?,?,?,? WHERE ${predicate}`).bind(proof, courseId, u.id, kind, detail, time, ...bindings);
    const guard = curriculumPredicate, access = curriculumBindings(u.id, courseId);
    if (b.action === 'member') {
        await requireOwner(d, u);
        if (b.userId === u.id)
            throw new AccessError(400, "Super Admin sudah memiliki akses ke seluruh course.");
        const target = await d.prepare("SELECT u.name FROM users u JOIN user_access a ON a.user_id=u.id WHERE u.id=? AND (?=0 OR a.status='active')").bind(b.userId, b.active ? 1 : 0).first<{
            name: string;
        }>();
        if (!target)
            throw new AccessError(400, "Aktifkan akun penyusun terlebih dahulu melalui Kelola akses.");
        const old = await d.prepare("SELECT version FROM curriculum_members WHERE course_id=? AND user_id=?").bind(courseId, b.userId).first<{
            version: number;
        }>();
        if ((old?.version || 0) !== b.version)
            throw conflict();
        const ownerGuard = "EXISTS(SELECT 1 FROM settings WHERE `key`='owner' AND value=?) AND EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND status='active') AND EXISTS(SELECT 1 FROM courses WHERE id=?) AND EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND (?=0 OR status='active'))";
        const write = old ? d.prepare(`UPDATE curriculum_members SET active=?,version=version+1,granted_by=?,updated_at=?,proof=? WHERE course_id=? AND user_id=? AND version=? AND ${ownerGuard}`).bind(b.active ? 1 : 0, u.id, time, proof, courseId, b.userId, b.version, u.id, u.id, courseId, b.userId, b.active ? 1 : 0) : d.prepare(`${databaseSql(d, 'INSERT OR IGNORE', 'INSERT')} INTO curriculum_members(course_id,user_id,active,version,granted_by,updated_at,proof) SELECT ?,?,?,1,?,?,? WHERE ${ownerGuard} ${databaseSql(d, '', 'ON DUPLICATE KEY UPDATE user_id=user_id')}`).bind(courseId, b.userId, b.active ? 1 : 0, u.id, time, proof, u.id, u.id, courseId, b.userId, b.active ? 1 : 0);
        const [r] = await d.batch([write, event(b.active ? 'memberGranted' : 'memberRevoked', target.name, "EXISTS(SELECT 1 FROM curriculum_members WHERE course_id=? AND user_id=? AND version=? AND proof=?)", [courseId, b.userId, b.version + 1, proof])]);
        if (!r.meta.changes)
            throw conflict();
        return { saved: true };
    }
    const old = await d.prepare("SELECT data,version FROM courses WHERE id=?").bind(courseId).first<{
        data: string;
        version: number;
    }>();
    if (!old)
        throw new AccessError(404, "Course tidak ditemukan.");
    const draft = await d.prepare("SELECT * FROM curriculum_drafts WHERE course_id=?").bind(courseId).first<Draft>();
    if (b.action === 'start' || b.action === 'restart') {
        if ((draft?.version || 0) !== b.draftVersion || b.version !== old.version || (draft && !(b.action === 'restart' ? ['draft', 'changes_requested'] : ['published']).includes(draft.state)))
            throw conflict();
        const data = JSON.stringify({ ...JSON.parse(old.data), version: old.version });
        const write = draft ? d.prepare(`UPDATE curriculum_drafts SET data=?,base_version=?,version=version+1,state='draft',updated_by=?,updated_at=?,note='',proof=? WHERE course_id=? AND state=? AND version=? AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?) AND ${guard}`).bind(data, old.version, u.id, time, proof, courseId, draft.state, draft.version, courseId, old.version, ...access) : d.prepare(`${databaseSql(d, 'INSERT OR IGNORE', 'INSERT')} INTO curriculum_drafts(course_id,data,base_version,version,state,updated_by,updated_at,note,proof) SELECT ?,?,?,1,'draft',?,?,'',? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?) AND ${guard} ${databaseSql(d, '', 'ON DUPLICATE KEY UPDATE course_id=course_id')}`).bind(courseId, data, old.version, u.id, time, proof, courseId, old.version, ...access);
        const [r] = await d.batch([write, event('started', 'Draf baru dari versi ' + old.version, "EXISTS(SELECT 1 FROM curriculum_drafts WHERE course_id=? AND proof=?)", [courseId, proof])]);
        if (!r.meta.changes)
            throw conflict();
        return { saved: true };
    }
    if (!draft || draft.version !== b.version)
        throw conflict();
    if (b.action === 'save') {
        if (!['draft', 'changes_requested'].includes(draft.state))
            throw new AccessError(409, "Draf dalam review atau sudah terbit. Buat draf baru untuk mengubahnya.");
        if (b.course.version !== draft.base_version)
            throw conflict();
        const next = { ...b.course, published: JSON.parse(old.data).published, sample: JSON.parse(old.data).sample };
        const ids = await validateCourseMedia(d, next), scope = ids.length ? fileStorage().scope : '';
        const mediaGuard = ids.length ? ` AND (SELECT count(*) FROM media_files WHERE id IN (${ids.map(() => '?').join(',')}) AND purpose='course' AND course_id=? AND scope=? AND ready=1)=?` : '';
        const write = d.prepare(`UPDATE curriculum_drafts SET data=?,version=version+1,state='draft',updated_by=?,updated_at=?,proof=? WHERE course_id=? AND version=? AND state IN ('draft','changes_requested') AND ${guard}${mediaGuard}`).bind(JSON.stringify(next), u.id, time, proof, courseId, b.version, ...access, ...(ids.length ? [...ids, courseId, scope, ids.length] : []));
        const writes = [write, event('saved', 'Draf disimpan', "EXISTS(SELECT 1 FROM curriculum_drafts WHERE course_id=? AND proof=?)", [courseId, proof])];
        if (ids.length)
            writes.push(d.prepare(`UPDATE media_files SET bound=1 WHERE id IN (${ids.map(() => '?').join(',')}) AND EXISTS(SELECT 1 FROM curriculum_drafts WHERE course_id=? AND proof=?)`).bind(...ids, courseId, proof));
        const [r] = await d.batch(writes);
        if (!r.meta.changes)
            throw conflict();
        return { course: next, version: b.version + 1 };
    }
    if (b.action === 'requestChanges' || b.action === 'publish')
        await requireOwner(d, u);
    const expected = b.action === 'submit' ? ['draft', 'changes_requested'] : ['submitted'];
    if (!expected.includes(draft.state))
        throw conflict();
    if (b.action === 'requestChanges' && !b.note)
        throw new AccessError(400, "Tuliskan catatan perbaikan untuk penyusun.");
    if (b.action === 'publish' && draft.base_version !== old.version)
        throw new AccessError(409, "Materi terbit berubah setelah draf dibuat. Kembalikan draf dan sesuaikan dengan versi terbaru sebelum terbit.");
    const state = b.action === 'submit' ? 'submitted' : b.action === 'requestChanges' ? 'changes_requested' : 'published';
    const reviewNote = 'note' in b ? b.note : '';
    const writes = [];
    let next: Course | undefined;
    if (b.action === 'publish') {
        next = courseSchema.parse(JSON.parse(draft.data));
        const previous = JSON.parse(old.data) as Course;
        next.published = previous.published;
        next.sample = previous.sample;
        next.version = old.version + 1;
        next.lessons = next.lessons.map(l => { const prior = previous.lessons.find(p => p.id === l.id); return { ...l, revision: prior ? (JSON.stringify({ ...l, revision: 0 }) === JSON.stringify({ ...prior, revision: 0 }) ? prior.revision : prior.revision + 1) : 1 }; });
        await validateCourseMedia(d, next);
    }
    const ownerGuard = b.action === 'submit' ? '' : " AND EXISTS(SELECT 1 FROM settings WHERE `key`='owner' AND value=?)";
    writes.push(d.prepare(`UPDATE curriculum_drafts SET state=?,version=version+1,note=?,updated_by=?,updated_at=?,proof=? WHERE course_id=? AND version=? AND state IN (${expected.map(() => '?').join(',')}) AND ${guard}${ownerGuard}${b.action === 'publish' ? " AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)" : ''}`).bind(state, reviewNote, u.id, time, proof, courseId, b.version, ...expected, ...access, ...(ownerGuard ? [u.id] : []), ...(b.action === 'publish' ? [courseId, old.version] : [])));
    if (next)
        writes.push(d.prepare("UPDATE courses SET data=?,version=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM curriculum_drafts WHERE course_id=? AND proof=? AND state='published')").bind(JSON.stringify(next), next.version, courseId, old.version, courseId, proof));
    writes.push(event(b.action, reviewNote || (b.action === 'submit' ? 'Draf diajukan untuk review Admin.' : 'Draf disetujui dan materi diterapkan.'), "EXISTS(SELECT 1 FROM curriculum_drafts WHERE course_id=? AND proof=?)", [courseId, proof]));
    const [r] = await d.batch(writes);
    if (!r.meta.changes)
        throw conflict();
    return { saved: true };
}
