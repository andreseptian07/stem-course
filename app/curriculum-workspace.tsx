"use client";
import {useUnsavedNavigation} from "./use-unsaved-navigation";
import AccountFrame from "./account-frame";
import type {NavigationUser} from "@/lib/account-navigation";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {courseReviewThreshold} from "@/lib/grading-policy";
import {publicationImpact} from "@/lib/academic-revisions";
import {hasRequiredCoding,REQUIRED_CODING_WARNING} from "@/lib/judge-policy";
import {api} from "./studio";
import CurriculumReview from "./curriculum-review";
import Admin from "./admin";
import type { Course } from "@/lib/model";
import "./curriculum.css";
import { applyCurriculumPatch, selectCurriculumItem, type CurriculumOverview as Overview, type CurriculumPatch } from '@/lib/curriculum-state';
const statuses: Record<string, string> = { draft: "Sedang disusun", submitted: "Menunggu review Super Admin", changes_requested: "Perlu perbaikan", published: "Review selesai" };
const actions: Record<string, string> = { started: "Draf dibuat", saved: "Draf disimpan", submit: "Diajukan untuk review", requestChanges: "Perbaikan diminta", publish: "Review disetujui", memberGranted: "Anggota ditambahkan", memberRevoked: "Akses dicabut" };
async function request(body?: unknown): Promise<Overview & {
    course: Course;
    version: number;
    patch: CurriculumPatch;
}> {
    const res = await fetch('/api/curriculum', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await res.json() as Overview & {
        course: Course;
        version: number;
        patch: CurriculumPatch;
        error?: string;
    };
    if (!res.ok)
        throw new Error(data.error || "Permintaan belum berhasil.");
    return data;
}
export default function CurriculumWorkspace({navigation}:{navigation:NavigationUser}) {
    const [data, setData] = useState<Overview | null>(null), [person, setPerson] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [compare, setCompare] = useState(false), [confirmPublish, setConfirmPublish] = useState(false);
    const [approvalSnapshot, setApprovalSnapshot] = useState<string | null>(null);
    const [judgeReady,setJudgeReady]=useState(false);
    const params = useSearchParams();
    const requested = params.has('course') ? params.getAll('course').length === 1 ? params.get('course') : '' : null;
    const item = data ? selectCurriculumItem(data.items,requested) : null;
    function selectCourse(courseId: string) {
        const next = new URLSearchParams(params.toString()); next.set('course',courseId);
        window.history.replaceState(null,'',`/curriculum?${next.toString()}`);
    }
    useEffect(() => {
        if (requested === null && data?.items[0]) {
            const next = new URLSearchParams(params.toString()); next.set('course',data.items[0].course.id);
            window.history.replaceState(null,'',`/curriculum?${next.toString()}`);
        }
    }, [data,params,requested]);
    const dirtyChange = useCallback((value: boolean) => setDirty(value), []);
    async function load() { const next = await request(); setData(next); setJudgeReady((await api<{passed:boolean}>("/api/judge").catch(()=>({passed:false}))).passed); return next; }
    useEffect(() => { let active = true; void request().then(next => { if (active)
        setData(next); }).catch(e => { if (active)
        setError(e.message); }); return () => { active = false; }; }, []);
    useEffect(()=>{let active=true;void api<{passed:boolean}>("/api/judge").then(result=>{if(active)setJudgeReady(result.passed);}).catch(()=>{});return()=>{active=false;};},[]);
    const {guard,dialog: leaveDialog} = useUnsavedNavigation(dirty,()=>setDirty(false),"Perubahan draf belum tersimpan. Tetap di halaman untuk menyimpan atau lanjutkan tanpa perubahan ini.");
    function apply(patch: CurriculumPatch) { setData(current => current ? applyCurriculumPatch(current, patch) : current); }
    async function act(body: unknown, success: string) { setBusy(true); setError(''); setMessage(''); try {
        const result = await request(body);
        apply(result.patch);
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
    async function save(course: Course) {
        if (!item?.draft) throw new Error('Draf tidak tersedia.');
        setBusy(true); setMessage(''); setError('');
        try { const result = await request({ action: 'save', course, version: item.draft.version }); apply(result.patch); setMessage('Perubahan draf tersimpan.'); return result.course; }
        finally { setBusy(false); }
    }
    const draft = item?.draft, editable = draft && ['draft', 'changes_requested'].includes(draft.state);
    const publicationSnapshot = item && draft ? JSON.stringify({courseId:item.course.id,courseVersion:item.course.version,draftVersion:draft.version,baseVersion:draft.baseVersion,course:draft.course}) : null;
    let impactMessage="";
    if(draft&&item)try{const impact=publicationImpact(draft.course,item.course);impactMessage=`Standar review course: ${courseReviewThreshold(draft.course)} (sebelumnya ${courseReviewThreshold(item.course)}). Materi perlu diulang: ${impact.substantial.map(l=>l.title).join(", ")||"tidak ada"}. Koreksi editorial/administratif: ${impact.editorial.length}. Materi dihapus: ${impact.removed.length}. Sertifikat yang sudah terbit tetap.`;}catch(e){impactMessage=e instanceof Error?e.message:"Konfigurasi draf belum valid.";}
    return <AccountFrame user={navigation} current="curriculum" mainId="curriculum-main" className="curriculum-main" onNavigate={guard}>
      {leaveDialog}
   <div className="curriculum-title"><div><span className="eyebrow teal">PENYUSUNAN MODUL AJAR</span><h1>Tim Kurikulum</h1><p>Kerjakan materi bersama, lalu ajukan draf untuk ditinjau Super Admin.</p></div><button className="secondary" disabled={busy} onClick={() => { if (dirty && !confirm('Muat ulang dan abaikan perubahan yang belum disimpan?'))
        return; setConfirmPublish(false); setApprovalSnapshot(null); setData(null); setDirty(false); void load().then(() => setError('')).catch(e => setError(e.message)); }}>Muat ulang</button></div>
   {error && <p className="feedback warning" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}</p>}
   {busy && <p role="status" aria-live="polite">Memproses perubahan… Tunggu konfirmasi sebelum menutup halaman.</p>}
   {!!data?.items.length && <>    <label className="curriculum-course">Course yang dikerjakan<select value={item?.course.id || ""} disabled={busy} onChange={e => { if (dirty && !confirm('Pindah course dan abaikan perubahan yang belum disimpan?'))
            return; selectCourse(e.target.value); setDirty(false); setPerson(''); setNote(''); setError(''); setMessage(''); setCompare(false); setConfirmPublish(false); }}>{!item && <option value="">Pilih course yang ditugaskan…</option>}{data.items.map(i => <option key={i.course.id} value={i.course.id}>{i.course.title}{i.draft ? ' · ' + statuses[i.draft.state] : ''}</option>)}</select></label>
</>}
   {!data ? <p role="status">{error ? 'Workspace belum tersedia.' : 'Memuat workspace kurikulum…'}</p> : !item ? <section className="curriculum-card"><h2>{data.items.length ? "Course tidak tersedia dalam penugasan Anda" : "Belum ada penugasan"}</h2><p>{data.items.length ? "Pilih course yang tersedia melalui pilihan di atas. Tautan ini tidak membuka course lain secara otomatis." : data.owner ? 'Buat dan simpan course melalui Kelola course terlebih dahulu.' : 'Admin perlu menambahkan Anda sebagai anggota Tim Kurikulum pada course yang akan dikerjakan.'}</p></section> : <>
    {data.owner && <section className="curriculum-card"><h2>Anggota Tim Kurikulum</h2><p>Pilih staf dengan izin Tim Kurikulum aktif. Berikan izin melalui <a href="/access" onClick={guard}>Kelola akses</a>. Penugasan ini memberi akses materi pada course ini; hak mengajar tetap mengikuti penugasan Tutor.</p>
     <div className="curriculum-inline"><label>Tambah anggota<select value={person} onChange={e => setPerson(e.target.value)}><option value="">Pilih akun aktif…</option>{data.people.filter(p => !item.members.some(m => m.userId === p.id && m.effective)).map(p => <option key={p.id} value={p.id}>{p.name} · {p.role === 'tutor' ? 'Tutor + Tim Kurikulum' : 'Tim Kurikulum'}</option>)}</select></label><button className="primary" disabled={busy || !person} onClick={() => void act({ action: 'member', courseId: item.course.id, userId: person, version: item.members.find(m => m.userId === person)?.version || 0, active: true, targetGrantVersion: data.people.find(p => p.id === person)?.grantVersion || 0 }, 'Anggota ditambahkan ke course ini.')}>Tambahkan anggota</button></div>
     <ul className="curriculum-members">{item.members.filter(m => m.active).map(m => <li key={m.userId}><span>{m.name} <small>{!m.effective ? 'Penugasan tidak aktif; perlu ditetapkan ulang' : m.role === 'tutor' ? 'Tutor + Tim Kurikulum' : 'Penyusun kurikulum'}</small></span><button className="secondary" disabled={busy} onClick={() => { if (confirm('Cabut akses kurikulum ' + m.name + ' untuk course ini?'))
                void act({ action: 'member', courseId: item.course.id, userId: m.userId, version: m.version, active: false }, 'Akses anggota dicabut.'); }}>Cabut akses</button></li>)}</ul>{!item.members.some(m => m.active) && <p>Belum ada anggota. Super Admin tetap dapat menyusun dan meninjau draf.</p>}
    </section>}
    <section className="curriculum-card"><h2>{draft ? statuses[draft.state] : 'Mulai draf bersama'}</h2><p>Versi materi sekarang: {item.course.version} · {item.course.published ? 'Course diterbitkan' : 'Course belum diterbitkan'}.{draft && <> Draf berdasarkan versi {draft.baseVersion}. Disimpan {new Date(draft.updatedAt).toLocaleString('id-ID')}.</>}</p>
     {item.course.published && (item.course.graduationPolicyVersion !== 2 || item.course.policyState !== 'ready') && <p className="feedback warning" role="status">Aturan kelulusan belum dipetakan. Kegiatan belajar siswa ditunda sampai pemetaan selesai.</p>}
     <p>Standar nilai review wajib course saat ini: {courseReviewThreshold(item.course)}.{draft && draft.state!=="published" && <> Standar pada draf: {courseReviewThreshold(draft.course)}.</>}</p>
     {draft?.note && <p className="curriculum-note">Catatan review: {draft.note}</p>}
     {hasRequiredCoding(draft?.course||item.course)&&!judgeReady&&<p className="feedback warning" role="status">{REQUIRED_CODING_WARNING}</p>}
     {draft && draft.state !== 'published' && draft.baseVersion !== item.course.version && <p className="feedback warning">Materi sekarang sudah berubah. Periksa versi sekarang, lalu mulai ulang draf dari versi terbaru. Mulai ulang mengganti isi draf yang lama.</p>}
     {!draft || draft.state === 'published' ? <button className="primary" disabled={busy || dirty} onClick={() => void act({ action: 'start', courseId: item.course.id, version: item.course.version, draftVersion: draft?.version || 0 }, 'Draf baru siap dikerjakan.')}>Buat draf dari materi sekarang</button> : <>
      <div className="curriculum-inline">{editable && <button className="primary" disabled={busy || dirty || draft.baseVersion !== item.course.version} onClick={() => void act({ action: 'submit', courseId: item.course.id, version: draft.version, note: '' }, 'Draf diajukan untuk review Admin.')}>Ajukan untuk review</button>}
       <button className="secondary" onClick={() => setCompare(!compare)}>{compare ? 'Tutup materi sekarang' : 'Periksa materi sekarang'}</button>
       {editable && <button className="secondary" disabled={busy || dirty} onClick={() => { if (confirm('Mulai ulang akan mengganti seluruh isi draf dengan materi versi sekarang. Lanjutkan?'))
                void act({ action: 'restart', courseId: item.course.id, version: item.course.version, draftVersion: draft.version }, 'Draf dimulai ulang dari versi sekarang.'); }}>Mulai ulang draf</button>}
      </div>{dirty && <p>Simpan perubahan pada editor sebelum mengajukan atau mereview.</p>}
      {data.owner && draft.state === 'submitted' && <div className="curriculum-review"><label>Catatan review<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="Jelaskan perbaikan yang diperlukan atau catatan persetujuan."/></label><div className="curriculum-inline"><button className="secondary" disabled={busy || !note.trim()} onClick={() => void act({ action: 'requestChanges', courseId: item.course.id, version: draft.version, note }, 'Draf dikembalikan dengan catatan perbaikan.')}>Minta perbaikan</button><button className="primary" disabled={busy || draft.baseVersion !== item.course.version} onClick={() => { setApprovalSnapshot(publicationSnapshot); setConfirmPublish(true); }}>Setujui & terapkan materi</button></div>{confirmPublish && approvalSnapshot !== publicationSnapshot && <p role="alert">Draf telah berubah. Tinjau kembali lalu berikan persetujuan baru.</p>}{confirmPublish && approvalSnapshot === publicationSnapshot && <div className="curriculum-confirm" role="region" aria-labelledby="publish-confirm-title"><h3 id="publish-confirm-title">Terapkan draf yang telah ditinjau?</h3><p>{impactMessage}</p><div className="curriculum-inline"><button className="secondary" disabled={busy} onClick={() => setConfirmPublish(false)}>Batalkan persetujuan</button><button className="primary" disabled={busy} onClick={() => void act({ action: 'publish', courseId: item.course.id, version: draft.version, note }, 'Draf disetujui dan materi course diperbarui.')}>Konfirmasi persetujuan</button></div></div>}</div>}
     </>}
    </section>
    {compare && <section className="curriculum-card"><h2>Materi sekarang · versi {item.course.version}</h2><CurriculumReview course={item.course}/></section>}
    {draft && draft.state !== 'published' && (editable ? <fieldset className="curriculum-editor" disabled={busy}><legend>Editor draf bersama</legend><Admin key={item.course.id + draft.state + draft.baseVersion} curriculum={{ course: draft.course, save }} reload={async () => { }} onPreview={() => { }} onDirtyChange={dirtyChange}/></fieldset> : <section className="curriculum-card"><h2>Draf yang diajukan · hanya baca selama review</h2><CurriculumReview course={draft.course}/></section>)}
    <section className="curriculum-card"><h2>Riwayat kurikulum</h2><ul>{item.events.map(e => <li key={e.id}>{actions[e.kind] || e.kind} · {e.actor || 'Admin'} · {new Date(e.createdAt).toLocaleString('id-ID')}{e.detail && <p>{e.detail}</p>}</li>)}</ul>{!item.events.length && <p>Belum ada perubahan kurikulum.</p>}</section>
   </>}
  </AccountFrame>;
}
