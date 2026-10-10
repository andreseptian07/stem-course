import {inspectJudge, judgeFingerprint, type JudgeConfig} from "./judge.ts";

export type JudgeReadiness = {
  passed:boolean;
  checks:{label:string;ok:boolean}[];
  message?:string;
};

// One configuration per process; concurrent readers share a single probe.
// A bounded cache reduces provider traffic without trusting a client flag or
// retaining approval when endpoint, credentials, or language mapping changes.
export function createJudgeInspector(fetcher:typeof fetch=fetch, now=Date.now) {
  let slot:{key:string;expires:number;result?:JudgeReadiness;pending?:Promise<JudgeReadiness>}|undefined;
  return async (config:JudgeConfig|null, force=false):Promise<JudgeReadiness> => {
    if(!config)return {passed:false,checks:[],message:"Penilaian kode resmi belum diaktifkan. Latihan browser tidak memberi nilai kelulusan."};
    let key:string;
    try {key=await judgeFingerprint(config);} catch {
      return {passed:false,checks:[],message:"Konfigurasi pemeriksa kode belum valid."};
    }
    if(slot?.key===key){
      if(slot.pending)return slot.pending;
      if(!force&&slot.result&&slot.expires>now())return slot.result;
    }
    const current:{key:string;expires:number;result?:JudgeReadiness;pending?:Promise<JudgeReadiness>}={key,expires:0};
    slot=current;
    current.pending=(async()=>{
      let result:JudgeReadiness;
      try {result=await inspectJudge(config,fetcher);} catch {
        result={passed:false,checks:[],message:"Pemeriksa kode belum dapat dihubungi. Penilaian resmi sementara tidak tersedia."};
      }
      current.result=result;current.expires=now()+(result.passed?30000:5000);current.pending=undefined;
      return result;
    })();
    return current.pending;
  };
}
export const judgeReadiness=createJudgeInspector();
