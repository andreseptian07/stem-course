"use client";
import {useState} from 'react';
import Image from 'next/image';
import {CircuitBoard,Video,ImageOff,RefreshCw} from 'lucide-react';
import type {Block} from '@/lib/model';
import {lessonMediaURL,embeddedVideo} from '@/lib/lesson-media';
function LessonMedia({block,src}:{block:Block;src:string}) {
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const video = block.type === 'video';
  const embed = video ? embeddedVideo(src) : '';
  if (!src) return <div className="empty">{video ? <Video size={25}/> : <ImageOff size={25}/>}<p>{video ? 'Video' : 'Gambar'} belum ditambahkan pengajar.</p></div>;
  return <figure className="lesson-media">
    {failed ? <div className="media-failure" role="alert"><ImageOff size={26}/><p>{video ? 'Video' : 'Gambar'} belum dapat dimuat. Periksa koneksi atau muat ulang halaman jika akses Anda berubah.</p><button className="secondary" type="button" onClick={()=>{setAttempt(attempt+1);setFailed(false);}}><RefreshCw size={17}/>Coba muat lagi</button></div> : video ? embed ? <iframe className="video" src={embed} title={block.caption || 'Video penjelasan'} allow="fullscreen; picture-in-picture" allowFullScreen/> : <video key={attempt} className="video" controls playsInline preload="metadata" src={src} onError={()=>setFailed(true)}>Browser Anda tidak mendukung video.</video> : <Image key={attempt} unoptimized width={1600} height={900} className="lesson-image" src={src} alt={block.caption || 'Ilustrasi materi'} loading="lazy" onError={()=>setFailed(true)}/>}
    {block.caption && <figcaption>{block.caption}</figcaption>}
    {embed && <p className="media-provider-link"><a href={src} target="_blank" rel="noreferrer">Buka video di situs penyedia</a></p>}
  </figure>;
}
export default function LessonBlock({ block: b,classId }: { block: Block;classId?:string|null }) {
  const mediaURL=(download=false)=>lessonMediaURL(b.content,classId,download);
  if (b.type === "heading")
    return <h2 className="block-heading">{b.content}</h2>;
  if (b.type === "callout")
    return <div className="intro-note">{b.content}</div>;
  if (b.type === "code")
    return (
      <pre className="code-block">
        <code>{b.content}</code>
      </pre>
    );
  if (b.type === "file")
    return b.content ? <p><a className="secondary" href={mediaURL(true)}>Unduh {b.caption || "dokumen materi"}</a></p> : null;
  if (b.type === "image" || b.type === "video")
    return <LessonMedia key={b.id + b.content + (classId || '')} block={b} src={mediaURL()}/>;
  if (b.type === "diagram") {
    const labels = b.content.split("|").slice(0, 3);
    return (
      <div className="system-diagram">
        {labels.map((label, i) => (
          <div key={i} className={i === 1 ? "featured" : ""}>
            <span>0{i + 1}</span>
            {i === 1 && <CircuitBoard size={30} />}
            <b>{label}</b>
            <small>{["Masukan", "Pemrosesan", "Keluaran"][i]}</small>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rich-text">
      {b.content.split("\n\n").map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
