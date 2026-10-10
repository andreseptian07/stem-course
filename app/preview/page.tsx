import LessonBlock from "../lesson-block";
import AccountFrame from "../account-frame";
import {navigationUser} from "@/lib/account-navigation";
import {requirePlatformAccess} from "@/lib/browser-access";
import {db} from "@/lib/server";
import {readPreview,previewList} from "@/lib/preview";
import type {PublicCourse} from "@/lib/model";
export const dynamic="force-dynamic";
export const metadata={title:"Pratinjau materi — Ruang STEM"};
export default async function Page({searchParams}:{searchParams:Promise<{course?:string}>}){const p=await searchParams,u=await requirePlatformAccess('/preview'+(p.course?'?course='+encodeURIComponent(p.course):''),'preview',p.course);const course=p.course?(await readPreview(db(),u,p.course)).course:null;const list=course?[]:await previewList(db(),u);return <AccountFrame user={navigationUser(u)} current="preview" className="preview-main"><h1>Pratinjau materi</h1><p>Hanya baca. Pratinjau tidak merekam progres atau kelulusan siswa.</p>{course?<Preview course={course}/>:<ul>{list.map(c=><li key={c.id}><a href={'/preview?course='+encodeURIComponent(c.id)}>{c.title}</a></li>)}</ul>}{!course&&!list.length&&<p>Belum ada course yang dapat ditinjau sesuai penugasan Anda.</p>}</AccountFrame>;}
function Preview({course}:{course:PublicCourse}){return <article><h2>{course.title}</h2><p>{course.description}</p>{course.lessons.map(l=><details key={l.id} open><summary>{l.module} · {l.title}</summary>{l.blocks.map(b=><LessonBlock key={b.id} block={b}/>)}{l.quiz&&<section><h3>Tes pemahaman</h3>{l.quiz.questions.map(q=><div key={q.id}><p>{q.prompt}</p><ul>{q.options.map((v,i)=><li key={i}>{v}</li>)}</ul></div>)}</section>}{l.exercise&&<section><h3>Latihan kode</h3><p>{l.exercise.prompt}</p><pre>{l.exercise.starter}</pre>{l.exercise.tests.map((t,i)=><pre key={i}>{t.input}{'\n'}{t.expected}</pre>)}</section>}</details>)}</article>;}
