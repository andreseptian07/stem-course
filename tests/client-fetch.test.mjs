import assert from 'node:assert/strict';
import {test} from 'node:test';
import {responseJson} from '../lib/client-fetch.ts';
test('lost/truncated mutation response cannot be presented as a successful save',async()=>{
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"ok":'));controller.error(new Error('response interrupted'));}}));
 await assert.rejects(()=>responseJson(response,true),/Belum menerima konfirmasi dari server/);
 await assert.rejects(()=>responseJson(new Response('{'),true),/Isian Anda tetap tersedia/);
});
test('API failure preserves server status and message; malformed read has a recoverable message',async()=>{
 await assert.rejects(()=>responseJson(Response.json({error:'Versi berubah.'},{status:409}),true),e=>e.status===409&&e.message==='Versi berubah.');
 await assert.rejects(()=>responseJson(new Response('{')),/Data belum dapat dimuat/);
 assert.deepEqual(await responseJson(Response.json({ok:true})),{ok:true});
});
