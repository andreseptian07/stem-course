"use client";
import { useEffect, useState } from "react";
import type { MediaInfo } from "@/lib/media-model";
export function PrivatePhoto({ url, fallback, className }: {
  url: string | null;
  fallback: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  // Authenticated images need the browser session; they cannot use a public optimizer URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={className}>{url && !failed ? <img src={url} alt="Foto profil saya" onError={() => setFailed(true)}/> : fallback}</span>;
}
async function upload(file: File, url: string, limit: number): Promise<MediaInfo> {
  if (!file.size || file.size > limit)
    throw new Error(`Berkas harus berisi data dan maksimal ${limit / 1024 / 1024} MB.`);
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url, { method: "POST", body: form }), result = await response.json() as MediaInfo & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(result.error || "Upload belum berhasil.");
  return result;
}
async function remove(body: unknown) {
  const response = await fetch("/api/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as {
    error?: string;
  };
  if (!response.ok)
    throw new Error(result.error || "Berkas belum dapat dihapus.");
}
export function PhotoControl({ photo, onChange, disabled, onBusy, onError, onNotice }: {
  photo: MediaInfo | null;
  onChange: (photo: MediaInfo | null) => void;
  disabled: boolean;
  onBusy: (value: boolean) => void;
  onError: (text: string) => void;
  onNotice: (text: string) => void;
}) {
  async function change(file?: File) {
    if (disabled)
      return;
    onBusy(true);
    onError("");
    onNotice("");
    try {
      if (file) {
        const result = await upload(file, "/api/media?purpose=avatar" + (photo ? "&previous=" + encodeURIComponent(photo.id) : ""), 2 * 1024 * 1024);
        onChange(result);
        onNotice("Foto profil tersimpan.");
      }
      else if (photo) {
        await remove({ purpose: "avatar", previousId: photo.id });
        onChange(null);
        onNotice("Foto profil dihapus. Avatar inisial digunakan kembali.");
      }
    }
    catch (e) {
      onError((e as Error).message);
    }
    finally {
      onBusy(false);
    }
  }
  return <div className="photo-controls"><label>Foto profil<input type="file" accept=".png,.jpg,.jpeg" disabled={disabled} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file)
    void change(file); }}/></label><small>PNG/JPEG · maksimal 2 MB. Foto langsung tersimpan dan hanya terlihat pada akun Anda.</small>{photo && <button type="button" className="account-secondary" disabled={disabled} onClick={() => void change()}>Hapus foto</button>}</div>;
}
export function CourseUpload({ courseId, type, onUploaded, onBusy, disabled }: {
  courseId: string | null;
  type: "image" | "file";
  onUploaded: (file: MediaInfo) => void;
  onBusy: (value: boolean) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  async function change(file: File) {
    if (disabled || !courseId)
      return;
    setError("");
    onBusy(true);
    try {
      onUploaded(await upload(file, "/api/media?purpose=course&course=" + encodeURIComponent(courseId), 5 * 1024 * 1024));
    }
    catch (e) {
      setError((e as Error).message);
    }
    finally {
      onBusy(false);
    }
  }
  return <div className="course-upload"><label>Unggah {type === "image" ? "gambar" : "dokumen"}<input type="file" accept={type === "image" ? ".png,.jpg,.jpeg" : ".pdf,.txt"} disabled={disabled || !courseId} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file)
    void change(file); }}/></label><small>{courseId ? "Maksimal 5 MB. Setelah upload, simpan course untuk memasang berkas pada materi." : "Simpan course terlebih dahulu untuk mengaktifkan upload."}</small>{error && <p role="alert">{error}</p>}</div>;
}
type LibraryFile = MediaInfo & {
  bound: number;
  ready: number;
};
export function CourseFileLibrary({ courseId, usedIds, disabled, onChoose, allowRemoval = true }: {
  courseId: string;
  allowRemoval?: boolean;
  usedIds: string[];
  disabled: boolean;
  onChoose: (file: MediaInfo) => void;
}) {
  const [files, setFiles] = useState<LibraryFile[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/media?course=" + encodeURIComponent(courseId), { cache: "no-store" });
    const result = await response.json() as {
      files: LibraryFile[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(result.error || "Daftar berkas belum tersedia.");
    setFiles(result.files);
  }
  useEffect(() => { let live = true; fetch("/api/media?course=" + encodeURIComponent(courseId), { cache: "no-store" }).then(async (response) => { const result = await response.json() as {
    files: LibraryFile[];
    error?: string;
  }; if (!response.ok)
    throw new Error(result.error || "Daftar berkas belum tersedia."); if (live)
    setFiles(result.files); }).catch(e => { if (live)
    setError(e.message); }); return () => { live = false; }; }, [courseId]);
  async function erase(id: string) { setBusy(true); setError(""); try {
    await remove({ purpose: "course", id });
    await load();
  }
  catch (e) {
    setError((e as Error).message);
  }
  finally {
    setBusy(false);
  } }
  return <details className="course-file-library"><summary>Berkas course · gunakan kembali{allowRemoval ? " atau hapus upload yang belum dipakai" : " dalam draf"}</summary><button type="button" className="secondary" disabled={disabled || busy} onClick={() => void load().catch(e => setError(e.message))}>Muat ulang berkas</button>{error && <p role="alert">{error}</p>}{!files.length && <p>Belum ada berkas di penyimpanan ini.</p>}<ul>{files.map(file => <li key={file.id}><span>{file.name} · {Math.ceil(file.size / 1024)} KB{!file.ready ? " · Upload belum selesai" : ""}</span>{!!file.ready && <button type="button" className="secondary" disabled={disabled || busy} onClick={() => onChoose(file)}>Tambahkan ke materi</button>}{allowRemoval && !file.bound && !usedIds.includes(file.id) && <button type="button" className="secondary" disabled={disabled || busy} onClick={() => void erase(file.id)}>Hapus upload belum dipakai</button>}{!!file.bound && <small>Disimpan sebagai berkas yang pernah digunakan.</small>}</li>)}</ul></details>;
}
