import type { Course } from './model.ts';
export type CurriculumMember = { userId: string; name: string; role: string; active: number; version: number; grantVersion?: number; effective?: number };
export type CurriculumDraft = { course: Course; version: number; baseVersion: number; state: string; updatedAt: string; note: string };
export type CurriculumEvent = { id: string; kind: string; detail: string; createdAt: string; actor: string };
export type CurriculumItem = { course: Course; members: CurriculumMember[]; draft: CurriculumDraft | null; events: CurriculumEvent[] };
export type CurriculumOverview = { owner: boolean; items: CurriculumItem[]; people: { id: string; name: string; role: string; grantVersion: number }[] };
export type CurriculumPatch = { courseId: string; draft?: CurriculumDraft; course?: Course; member?: CurriculumMember; event: CurriculumEvent };
// Apply only server-confirmed data, keeping unrelated courses and unsaved editors intact.
export function applyCurriculumPatch(data: CurriculumOverview, patch: CurriculumPatch): CurriculumOverview {
  return { ...data, items: data.items.map(item => item.course.id !== patch.courseId ? item : {
    ...item, course: patch.course ?? item.course, draft: patch.draft ?? item.draft,
    members: patch.member ? [...item.members.filter(m => m.userId !== patch.member!.userId), patch.member].sort((a,b) => a.name.localeCompare(b.name)) : item.members,
    events: [patch.event, ...item.events.filter(e => e.id !== patch.event.id)].sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0,40),
  }) };
}

// Explicit unknown course IDs must never fall back to a different assignment.
export function selectCurriculumItem(items: CurriculumItem[], requested: string | null) {
  if (requested === null) return items[0] ?? null;
  return items.find(item => item.course.id === requested) ?? null;
}
