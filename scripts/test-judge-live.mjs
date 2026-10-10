// Operator-invoked provider acceptance; no database, student data, or secrets
// are printed. This spends six small submissions on the configured service.
import {setTimeout as delay} from 'node:timers/promises';
import {configuredJudge} from '../lib/judge-config.ts';
import {inspectJudge,submitCode,pollCode,gradeCode} from '../lib/judge.ts';

const config=configuredJudge(process.env);
if(!config){console.error('Judge0 belum dikonfigurasi; uji layanan nyata belum dijalankan.');process.exitCode=2;}
else {
 try {
  const readiness=await inspectJudge(config);
  console.log(JSON.stringify({kind:'provider-readiness',...readiness}));
  if(!readiness.passed)throw new Error('Layanan belum memenuhi pemeriksaan kesiapan.');
  const cases=[
   {name:'python-correct',language:'python',source:'print(input())',status:3},
   {name:'javascript-correct',language:'javascript',source:'console.log(require("fs").readFileSync(0,"utf8").trim());',status:3},
   {name:'cpp-correct',language:'cpp',source:'#include <iostream>\n#include <string>\nint main(){std::string s;std::getline(std::cin,s);std::cout<<s<<"\\n";}',status:3},
   {name:'python-wrong-output',language:'python',source:'print("wrong")',status:4},
   {name:'cpp-compile-error',language:'cpp',source:'int main( {',status:6},
   {name:'python-time-limit',language:'python',source:'while True: pass',status:5},
  ];
  for(const example of cases){
   const tokens=await submitCode(config,example.language,example.source,[{input:'Ruang STEM',expected:'Ruang STEM'}]);
   let result;
   for(let index=0;index<30;index++){
    const rows=await pollCode(config,tokens);const graded=gradeCode(rows,[false]);
    if(graded){result={name:example.name,expectedStatus:example.status,actualStatus:rows[0].status.id,passed:rows[0].status.id===example.status};break;}
    await delay(1000);
   }
   if(!result)throw new Error('Antrean belum selesai dalam batas uji.');
   console.log(JSON.stringify(result));
   if(!result.passed)throw new Error('Hasil eksekusi tidak sesuai kasus uji.');
  }
  console.log('Enam kasus provider lulus. Uji HTTP aplikasi dengan layanan nyata tetap diperlukan untuk menutup Tahap 5.');
 } catch {
  console.error('Uji provider belum lulus. Periksa hasil yang sudah dicatat dan konfigurasi privat; jangan menganggap penilaian resmi siap.');process.exitCode=1;
 }
}
