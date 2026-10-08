"use client";
import { useCallback, useEffect, useState } from "react";
import CurriculumReview from "./curriculum-review";
import Admin from "./admin";
import type { Course } from "@/lib/model";
import "./curriculum.css";
type Member = {
    userId: string;
    name: string;
    role: string;
    active: number;
    version: number;
};
type Draft = {
    course: Course;
    version: number;
    baseVersion: number;
    state: string;
    updatedAt: string;
    note: string;
};
type Item = {
    course: Course;
    members: Member[];
    draft: Draft | null;
    events: {
        id: string;
        kind: string;
        detail: string;
        createdAt: string;
        actor: string;
    }[];
};
type Overview = {
    owner: boolean;
    items: Item[];
    people: {
        id: string;
        name: string;
        role: string;
    }[];
};
const statuses: Record<string, string> = { draft: "Sedang disusun", submitted: "Menunggu review Admin", changes_requested: "Perlu perbaikan", published: "Review selesai" };
const actions: Record<string, string> = { started: "Draf dibuat", saved: "Draf disimpan", submit: "Diajukan untuk review", requestChanges: "Perbaikan diminta", publish: "Review disetujui", memberGranted: "Anggota ditambahkan", memberRevoked: "Akses dicabut" };
async function request(body?: unknown): Promise<Overview & {
    course: Course;
    version: number;
}> {
    const res = await fetch('/api/curriculum', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await res.json() as Overview & {
        course: Course;
        version: number;
        error?: string;
    };
    if (!res.ok)
        throw new Error(data.error || "Permintaan belum berhasil.");
    return data;
}
export default function CurriculumWorkspace() {
    const [data, setData] = useState<Overview | null>(null), [selected, setSelected] = useState(''), [person, setPerson] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [compare, setCompare] = useState(false), [confirmPublish, setConfirmPublish] = useState(false);
    const item = data?.items.find(i => i.course.id === selected) || data?.items[0];
    const dirtyChange = useCallback((value: boolean) => setDirty(value), []);
    async function load() { const next = await request(); setData(next); return next; }
    useEffect(() => { let active = true; void request().then(next => { if (active)
        setData(next); }).catch(e => { if (active)
        setError(e.message); }); return () => { active = false; }; }, []);
    function guard(e: React.MouseEvent<HTMLAnchorElement>) { if (dirty && !confirm('Abaikan perubahan draf yang belum disimpan?'))
        e.preventDefault(); }
    async function act(body: unknown, success: string) { setBusy(true); setError(''); setMessage(''); try {
        await request(body);
        await load();
        setMessage(success);
        setNote('');
        setConfirmPublish(false);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    }
    finally {
        setBusy(false);
    } }
    async function save(course: Course) { if (!item?.draft)
        throw new Error('Draf tidak tersedia.'); const result = await request({ action: 'save', course, version: item.draft.version }); await load(); return result.course; }
    const draft = item?.draft, editable = draft && ['draft', 'changes_requested'].includes(draft.state);
    return <div className="curriculum-app">
  <a className="curriculum-skip" href="#curriculum-main">Lewati ke konten</a>
  <header className="curriculum-header"><a href="/dashboard" onClick={guard}><b>Ruang STEM</b></a><nav aria-label="Navigasi Tim Kurikulum"><a href="/dashboard" onClick={guard}>Dashboard</a>{data?.owner && <><a href="/access" onClick={guard}>Kelola akses</a><a href="/learn?view=admin" onClick={guard}>Kelola course</a></>}<a href="/logout" onClick={guard}>Keluar</a></nav></header>
  <main id="curriculum-main" className="curriculum-main">
   <div className="curriculum-title"><div><span className="eyebrow teal">PENYUSUNAN MODUL AJAR</span><h1>Tim Kurikulum</h1><p>Kerjakan materi bersama, lalu ajukan draf untuk ditinjau Super Admin.</p></div><button className="secondary" disabled={busy} onClick={() => { if (dirty && !confirm('Muat ulang dan abaikan perubahan yang belum disimpan?'))
        return; setData(null); setDirty(false); void load().then(() => setError('')).catch(e => setError(e.message)); }}>Muat ulang</button></div>
   {error && <p className="feedback warning" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}</p>}
   {!data ? <p role="status">{error ? 'Workspace belum tersedia.' : 'Memuat workspace kurikulum…'}</p> : !item ? <section className="curriculum-card"><h2>Belum ada penugasan</h2><p>{data.owner ? 'Buat dan simpan course melalui Kelola course terlebih dahulu.' : 'Admin perlu menambahkan Anda sebagai anggota Tim Kurikulum pada course yang akan dikerjakan.'}</p></section> : <>
    <label className="curriculum-course">Course yang dikerjakan<select value={item.course.id} disabled={busy} onChange={e => { if (dirty && !confirm('Pindah course dan abaikan perubahan yang belum disimpan?'))
            return; setSelected(e.target.value); setPerson(''); setNote(''); setError(''); setMessage(''); setCompare(false); setConfirmPublish(false); }}>{data.items.map(i => <option key={i.course.id} value={i.course.id}>{i.course.title}{i.draft ? ' · ' + statuses[i.draft.state] : ''}</option>)}</select></label>
    {data.owner && <section className="curriculum-card"><h2>Anggota Tim Kurikulum</h2><p>Pilih Tutor atau akun khusus penyusun. Akun khusus dapat mendaftar, kemudian Admin mengaktifkannya melalui <a href="/access" onClick={guard}>Kelola akses</a>. Penugasan ini memberi akses materi pada course ini; hak mengajar tetap mengikuti penugasan Tutor.</p>
     <div className="curriculum-inline"><label>Tambah anggota<select value={person} onChange={e => setPerson(e.target.value)}><option value="">Pilih akun aktif…</option>{data.people.filter(p => !item.members.some(m => m.userId === p.id && m.active)).map(p => <option key={p.id} value={p.id}>{p.name} · {p.role === 'tutor' ? 'Tutor' : 'Penyusun khusus'}</option>)}</select></label><button className="primary" disabled={busy || !person} onClick={() => void act({ action: 'member', courseId: item.course.id, userId: person, version: item.members.find(m => m.userId === person)?.version || 0, active: true }, 'Anggota ditambahkan ke course ini.')}>Tambahkan anggota</button></div>
     <ul className="curriculum-members">{item.members.filter(m => m.active).map(m => <li key={m.userId}><span>{m.name} <small>{m.role === 'tutor' ? 'Tutor & penyusun' : 'Penyusun kurikulum'}</small></span><button className="secondary" disabled={busy} onClick={() => { if (confirm('Cabut akses kurikulum ' + m.name + ' untuk course ini?'))
                void act({ action: 'member', courseId: item.course.id, userId: m.userId, version: m.version, active: false }, 'Akses anggota dicabut.'); }}>Cabut akses</button></li>)}</ul>{!item.members.some(m => m.active) && <p>Belum ada anggota. Super Admin tetap dapat menyusun dan meninjau draf.</p>}
    </section>}
    <section className="curriculum-card"><h2>{draft ? statuses[draft.state] : 'Mulai draf bersama'}</h2><p>Versi materi sekarang: {item.course.version} · {item.course.published ? 'Tersedia untuk siswa' : 'Course belum diterbitkan'}.{draft && <> Draf berdasarkan versi {draft.baseVersion}. Disimpan {new Date(draft.updatedAt).toLocaleString('id-ID')}.</>}</p>
     {draft?.note && <p className="curriculum-note">Catatan review: {draft.note}</p>}
     {draft && draft.state !== 'published' && draft.baseVersion !== item.course.version && <p className="feedback warning">Materi sekarang sudah berubah. Periksa versi sekarang, lalu mulai ulang draf dari versi terbaru. Mulai ulang mengganti isi draf yang lama.</p>}
     {!draft || draft.state === 'published' ? <button className="primary" disabled={busy || dirty} onClick={() => void act({ action: 'start', courseId: item.course.id, version: item.course.version, draftVersion: draft?.version || 0 }, 'Draf baru siap dikerjakan.')}>Buat draf dari materi sekarang</button> : <>
      <div className="curriculum-inline">{editable && <button className="primary" disabled={busy || dirty || draft.baseVersion !== item.course.version} onClick={() => void act({ action: 'submit', courseId: item.course.id, version: draft.version, note: '' }, 'Draf diajukan untuk review Admin.')}>Ajukan untuk review</button>}
       <button className="secondary" onClick={() => setCompare(!compare)}>{compare ? 'Tutup materi sekarang' : 'Periksa materi sekarang'}</button>
       {editable && <button className="secondary" disabled={busy || dirty} onClick={() => { if (confirm('Mulai ulang akan mengganti seluruh isi draf dengan materi versi sekarang. Lanjutkan?'))
                void act({ action: 'restart', courseId: item.course.id, version: item.course.version, draftVersion: draft.version }, 'Draf dimulai ulang dari versi sekarang.'); }}>Mulai ulang draf</button>}
      </div>{dirty && <p>Simpan perubahan pada editor sebelum mengajukan atau mereview.</p>}
      {data.owner && draft.state === 'submitted' && <div className="curriculum-review"><label>Catatan review<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="Jelaskan perbaikan yang diperlukan atau catatan persetujuan."/></label><div className="curriculum-inline"><button className="secondary" disabled={busy || !note.trim()} onClick={() => void act({ action: 'requestChanges', courseId: item.course.id, version: draft.version, note }, 'Draf dikembalikan dengan catatan perbaikan.')}>Minta perbaikan</button><button className="primary" disabled={busy || draft.baseVersion !== item.course.version} onClick={() => setConfirmPublish(true)}>Setujui & terapkan materi</button></div>{confirmPublish && <div className="curriculum-confirm" role="region" aria-labelledby="publish-confirm-title"><h3 id="publish-confirm-title">Terapkan draf yang telah ditinjau?</h3><p>Isi draf akan menggantikan materi course sekarang. Materi yang berubah akan memerlukan penyelesaian ulang oleh siswa.</p><div className="curriculum-inline"><button className="secondary" disabled={busy} onClick={() => setConfirmPublish(false)}>Batalkan persetujuan</button><button className="primary" disabled={busy} onClick={() => void act({ action: 'publish', courseId: item.course.id, version: draft.version, note }, 'Draf disetujui dan materi course diperbarui.')}>Konfirmasi persetujuan</button></div></div>}</div>}
     </>}
    </section>
    {compare && <section className="curriculum-card"><h2>Materi sekarang · versi {item.course.version}</h2><CurriculumReview course={item.course}/></section>}
    {draft && draft.state !== 'published' && (editable ? <fieldset className="curriculum-editor" disabled={busy}><legend>Editor draf bersama</legend><Admin key={item.course.id + draft.state + draft.baseVersion} curriculum={{ course: draft.course, save }} reload={async () => { }} onPreview={() => { }} onDirtyChange={dirtyChange}/></fieldset> : <section className="curriculum-card"><h2>Draf yang diajukan · hanya baca selama review</h2><CurriculumReview course={draft.course}/></section>)}
    <section className="curriculum-card"><h2>Riwayat kurikulum</h2><ul>{item.events.map(e => <li key={e.id}>{actions[e.kind] || e.kind} · {e.actor || 'Admin'} · {new Date(e.createdAt).toLocaleString('id-ID')}{e.detail && <p>{e.detail}</p>}</li>)}</ul>{!item.events.length && <p>Belum ada perubahan kurikulum.</p>}</section>
   </>}
  </main>
 </div>;
}
