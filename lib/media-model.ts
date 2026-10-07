export type MediaInfo = { id: string; name: string; mime: string; size: number; url: string };
export function mediaId(value: string) {
  return /^\/api\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(value)?.[1] || null;
}
export const mediaUrl = (id: string) => `/api/media/${id}`;
