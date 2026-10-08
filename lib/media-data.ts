import { hasCurriculumAccess } from "./curriculum-access.ts";
import { createHash, randomUUID } from "node:crypto";
import { writeFile, unlink, open } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { ClassError, type ClassUser } from "./classes.ts";
import { fileStorage, privateDirectory, inspectFile, FILE_LIMIT, type FileEnvironment } from "./project-files.ts";
import { mediaId, mediaUrl, type MediaInfo } from "./media-model.ts";
import { readCourse, readProgress } from "./course-data.ts";
import { blockingLesson } from "./rules.ts";
import type { Course } from "./model";
export const PHOTO_LIMIT = 2 * 1024 * 1024;
export type MediaTarget = {
  purpose: "avatar";
  previousId: string | null;
} | {
  purpose: "course";
  courseId: string;
};
const photoKey = (ownerId: string, scope: string) => "profile_photo:" + createHash("sha256").update(ownerId + "\n" + scope).digest("hex");
const info = (f: {
  id: string;
  name: string;
  mime: string;
  size: number;
}): MediaInfo => ({ ...f, url: mediaUrl(f.id) });
export async function photoInfo(d: PlatformDatabase, userId: string, env: FileEnvironment = process.env): Promise<MediaInfo | null> {
  let scope;
  try {
    scope = fileStorage(env).scope;
  }
  catch (e) {
    if (e instanceof ClassError && e.status === 503)
      return null;
    throw e;
  }
  const key = photoKey(userId, scope);
  const f = await d.prepare("SELECT f.id,f.name,f.mime,f.size FROM media_files f JOIN settings s ON s.value=f.id AND s.`key`=? WHERE f.owner_id=? AND f.scope=? AND f.purpose='avatar' AND f.ready=1").bind(key, userId, scope).first<{
    id: string;
    name: string;
    mime: string;
    size: number;
  }>();
  return f ? info(f) : null;
}
export async function normalizeImage(name: string, bytes: Uint8Array, avatar: boolean) {
  const meta = inspectFile(name, bytes);
  if (!meta.mime.startsWith("image/"))
    throw new ClassError(415, "Gunakan gambar PNG atau JPEG.");
  if (avatar && bytes.length > PHOTO_LIMIT)
    throw new ClassError(413, "Foto profil maksimal 2 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 16000000, failOn: "warning" });
    const decoded = await image.metadata();
    if (!["png", "jpeg"].includes(decoded.format || "") || (decoded.pages || 1) > 1)
      throw new Error("format");
    const result = await image.rotate().resize({ width: avatar ? 512 : 2048, height: avatar ? 512 : 2048, fit: "inside", withoutEnlargement: true }).toFormat(meta.mime === "image/png" ? "png" : "jpeg").timeout({ seconds: 5 }).toBuffer();
    if (result.length > (avatar ? PHOTO_LIMIT : FILE_LIMIT))
      throw new Error("size");
    return { bytes: result, meta: { ...meta, size: result.length } };
  }
  catch {
    throw new ClassError(415, "Gambar tidak dapat dibaca. Gunakan PNG/JPEG yang valid dengan maksimal 16 juta piksel.");
  }
}
export async function canUploadMedia(d: PlatformDatabase, u: ClassUser, target: MediaTarget) {
  if (target.purpose === "course") {
    if(u.role!=="owner" && !await hasCurriculumAccess(d,u,target.courseId))
      throw new ClassError(403,"Anda belum ditugaskan ke Tim Kurikulum course ini.");
    if (!await d.prepare("SELECT id FROM courses WHERE id=?").bind(target.courseId).first())
      throw new ClassError(409, "Simpan course terlebih dahulu sebelum mengunggah berkas.");
  }
}
async function eraseBytes(id: string, env: FileEnvironment) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new ClassError(400, "ID berkas tidak valid.");
  await unlink(path.join(await privateDirectory(env), id)).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT")
    throw e; });
}
export async function uploadMedia(d: PlatformDatabase, u: ClassUser, target: MediaTarget, name: string, raw: Uint8Array, env: FileEnvironment = process.env) {
  await canUploadMedia(d, u, target);
  let bytes = raw, meta = inspectFile(name, bytes);
  if (target.purpose === "avatar" || meta.mime.startsWith("image/")) {
    const image = await normalizeImage(name, bytes, target.purpose === "avatar");
    bytes = image.bytes;
    meta = image.meta;
  }
  if (target.purpose === "avatar")
    await cleanUnusedPhotos(d, u.id, env);
  const { scope } = fileStorage(env), id = randomUUID(), courseId = target.purpose === "course" ? target.courseId : null;
  const dir = await privateDirectory(env);
  const r = await d.prepare(`INSERT INTO media_files(id,owner_id,course_id,purpose,scope,name,mime,size,ready,bound,created_at) SELECT ?,?,?,?,?,?,?,?,0,0,? WHERE (SELECT count(*) FROM media_files WHERE scope=? AND owner_id=? AND purpose=? ${courseId ? "AND course_id=?" : ""})<? AND (SELECT COALESCE(sum(size),0) FROM media_files WHERE scope=? AND owner_id=? AND purpose=? ${courseId ? "AND course_id=?" : ""})+?<=?`).bind(id, u.id, courseId, target.purpose, scope, meta.name, meta.mime, meta.size, new Date().toISOString(), scope, u.id, target.purpose, ...(courseId ? [courseId] : []), target.purpose === "avatar" ? 5 : 100, scope, u.id, target.purpose, ...(courseId ? [courseId] : []), meta.size, target.purpose === "avatar" ? 10 * 1024 * 1024 : 200 * 1024 * 1024).run();
  if (!r.meta.changes)
    throw new ClassError(409, "Batas penyimpanan tercapai. Hapus upload yang belum digunakan lalu coba kembali.");
  try {
    await writeFile(path.join(dir, id), bytes, { flag: "wx", mode: 0o600 });
    await canUploadMedia(d, u, target);
    const ready = d.prepare("UPDATE media_files SET ready=1 WHERE id=? AND owner_id=? AND scope=?").bind(id, u.id, scope);
    if (target.purpose === "avatar") {
      const key = photoKey(u.id, scope), previous = target.previousId || "";
      const pointer = d.prepare(databaseSql(d, "INSERT INTO settings(key,value) SELECT ?,? WHERE ?='' OR EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE settings.value=?", "INSERT INTO settings(`key`,value) SELECT ?,? WHERE ?='' OR EXISTS(SELECT 1 FROM settings WHERE `key`=? AND value=?) ON DUPLICATE KEY UPDATE value=IF(value=?,VALUES(value),value)"))
        .bind(key, id, previous, key, previous, previous);
      const results = await d.batch([ready, pointer]);
      if (!results[1].meta.changes)
        throw new ClassError(409, "Foto profil sudah berubah. Muat ulang sebelum mengganti foto.");
      await cleanUnusedPhotos(d, u.id, env);
    }
    else
      await ready.run();
  }
  catch (e) {
    // Never remove a successfully activated photo merely because old-file cleanup failed.
    if ((await photoInfo(d, u.id, env))?.id !== id) {
      await eraseBytes(id, env).catch(() => { });
      await d.prepare("DELETE FROM media_files WHERE id=? AND bound=0").bind(id).run();
      throw e;
    }
  }
  return info({ id, ...meta });
}
async function cleanUnusedPhotos(d: PlatformDatabase, userId: string, env: FileEnvironment) {
  const { scope } = fileStorage(env), key = photoKey(userId, scope);
  const expired = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rows = (await d.prepare("SELECT id FROM media_files WHERE owner_id=? AND scope=? AND purpose='avatar' AND (ready=1 OR created_at<?) AND id NOT IN (SELECT value FROM settings WHERE `key`=?)").bind(userId, scope, expired, key).all<{
    id: string;
  }>()).results;
  for (const f of rows) {
    const removed = await d.prepare("DELETE FROM media_files WHERE id=? AND purpose='avatar' AND (ready=1 OR created_at<?) AND NOT EXISTS(SELECT 1 FROM settings WHERE `key`=? AND value=?)").bind(f.id, expired, key, f.id).run();
    if (removed.meta.changes)
      await eraseBytes(f.id, env);
  }
}
export async function clearPhoto(d: PlatformDatabase, u: ClassUser, previousId: string, env: FileEnvironment = process.env) {
  const { scope } = fileStorage(env), key = photoKey(u.id, scope);
  const r = await d.prepare("UPDATE settings SET value='' WHERE `key`=? AND value=?").bind(key, previousId).run();
  if (!r.meta.changes)
    throw new ClassError(409, "Foto profil sudah berubah. Muat ulang sebelum menghapus foto.");
  await cleanUnusedPhotos(d, u.id, env);
  return { photo: null };
}
export async function courseMediaList(d: PlatformDatabase, u: ClassUser, courseId: string, env: FileEnvironment = process.env) {
  await canUploadMedia(d, u, { purpose: "course", courseId });
  const { scope } = fileStorage(env);
  return (await d.prepare("SELECT id,name,mime,size,ready,bound FROM media_files WHERE purpose='course' AND course_id=? AND scope=? ORDER BY created_at,id").bind(courseId, scope).all<{
    id: string;
    name: string;
    mime: string;
    size: number;
    ready: number;
    bound: number;
  }>()).results.map(f => ({ ...info(f), ready: f.ready, bound: f.bound }));
}
export async function removeCourseMedia(d: PlatformDatabase, u: ClassUser, id: string, env: FileEnvironment = process.env) {
  if (u.role !== "owner")
    throw new ClassError(403, "Hanya Super Admin yang dapat menghapus upload materi.");
  const { scope } = fileStorage(env);
  const r = await d.prepare("DELETE FROM media_files WHERE id=? AND purpose='course' AND scope=? AND bound=0").bind(id, scope).run();
  if (!r.meta.changes)
    throw new ClassError(409, "Berkas sudah digunakan dalam course atau tidak ditemukan. Berkas yang pernah dipakai tetap disimpan.");
  await eraseBytes(id, env);
  return { ok: true };
}
export async function validateCourseMedia(d: PlatformDatabase, c: Course, env: FileEnvironment = process.env) {
  const blocks = c.lessons.flatMap(l => l.blocks).filter(b => mediaId(b.content));
  const ids = [...new Set(blocks.map(b => mediaId(b.content)!))];
  if (!ids.length)
    return ids;
  const { scope } = fileStorage(env);
  const files = (await d.prepare(`SELECT id,mime FROM media_files WHERE id IN (${ids.map(() => "?").join(",")}) AND purpose='course' AND course_id=? AND scope=? AND ready=1`).bind(...ids, c.id, scope).all<{
    id: string;
    mime: string;
  }>()).results;
  if (files.length !== ids.length || blocks.some(b => !["image", "file"].includes(b.type) || (b.type === "image" && !files.find(f => f.id === mediaId(b.content))?.mime.startsWith("image/"))))
    throw new ClassError(409, "Upload materi tidak sesuai course, belum siap, atau jenis blok tidak sesuai.");
  return ids;
}
export async function readMedia(d: PlatformDatabase, u: ClassUser, id: string, env: FileEnvironment = process.env) {
  const { scope } = fileStorage(env);
  const f = await d.prepare("SELECT * FROM media_files WHERE id=? AND scope=? AND ready=1").bind(id, scope).first<{
    id: string;
    owner_id: string;
    course_id: string | null;
    purpose: string;
    name: string;
    mime: string;
    size: number;
    bound: number;
  }>();
  if (!f)
    throw new ClassError(404, "Berkas tidak ditemukan pada penyimpanan ini.");
  if (f.purpose === "avatar") {
    if (f.owner_id !== u.id || (await photoInfo(d, u.id, env))?.id !== id)
      throw new ClassError(404, "Foto profil tidak ditemukan.");
  }
  else if (u.role !== "owner" && !(f.course_id && await hasCurriculumAccess(d,u,f.course_id))) {
    if (!f.course_id || !f.bound)
      throw new ClassError(404, "Berkas belum tersedia dalam course.");
    const c = await readCourse(d, f.course_id, u), p = await readProgress(d, u.id, c.id);
    const lessons = c.lessons.filter(l => l.blocks.some(b => b.content === mediaUrl(id) && ["image", "file"].includes(b.type)));
    if (!lessons.length)
      throw new ClassError(404, "Berkas tidak digunakan dalam materi.");
    if (!lessons.some(l => !blockingLesson(c, l.id, p)))
      throw new ClassError(403, "Selesaikan prasyarat materi sebelum membuka berkas ini.");
  }
  try {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("id");
    const handle = await open(path.join(await privateDirectory(env), id), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== f.size || stat.size > FILE_LIMIT)
        throw new Error("size");
      return { ...info(f), purpose: f.purpose, bytes: new Uint8Array(await handle.readFile()) };
    }
    finally {
      await handle.close();
    }
  }
  catch {
    throw new ClassError(404, "Isi berkas belum tersedia pada penyimpanan ini.");
  }
}
