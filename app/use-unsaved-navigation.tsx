'use client';
import {useEffect,useRef,useState,type MouseEvent} from 'react';
import {useRouter} from 'next/navigation';
export function useUnsavedNavigation(dirty:boolean,onDiscard:()=>void,message:string) {
  const router=useRouter(),ref=useRef<HTMLDialogElement>(null),opener=useRef<HTMLAnchorElement|null>(null);
  const [target,setTarget]=useState('');
  useEffect(()=>{const dialog=ref.current;if(target&&!dialog?.open)dialog?.showModal();if(!target&&dialog?.open)dialog.close();},[target]);
  function cancel(){setTarget('');opener.current?.focus();}
  function guard(e:MouseEvent<HTMLAnchorElement>){
    if(!dirty||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.currentTarget.target==='_blank')return;
    const url=new URL(e.currentTarget.href);
    if(url.origin!==location.origin)return;
    e.preventDefault();opener.current=e.currentTarget;setTarget(url.pathname+url.search+url.hash);
  }
  const dialog=<dialog ref={ref} className="unsaved-navigation-dialog" aria-labelledby="unsaved-navigation-title" onCancel={e=>{e.preventDefault();cancel();}}><h2 id="unsaved-navigation-title">Ada perubahan yang belum disimpan</h2><p>{message}</p><div><button type="button" className="secondary" autoFocus onClick={cancel}>Tetap di halaman</button><button type="button" className="primary" onClick={()=>{const href=target;setTarget('');onDiscard();router.push(href);}}>Abaikan & lanjutkan</button></div></dialog>;
  return {guard,dialog};
}
