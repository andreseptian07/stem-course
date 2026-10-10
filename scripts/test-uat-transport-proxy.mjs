import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {transportProxy} from './uat-transport-proxy.mjs';
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const publicPort=reservation.address().port;await new Promise(r=>reservation.close(r));
const commits=new Map();let count=0;
const backend=createServer(async(req,res)=>{let body='';for await(const data of req)body+=data;if(req.method==='POST'){assert.equal(req.headers.origin,`http://localhost:${publicPort}`);const data=JSON.parse(body);if(!commits.has(data.requestId))commits.set(data.requestId,++count);}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({count}));});backend.listen(0,'127.0.0.1');await once(backend,'listening');const proxy=await transportProxy(publicPort,backend.address().port);
const send=id=>fetch(`http://localhost:${publicPort}/api/studio`,{method:'POST',headers:{Origin:`http://localhost:${publicPort}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:id})});
try{proxy.arm('before','/api/studio');await assert.rejects(()=>send('before'));assert.equal(count,0);proxy.arm('after','/api/studio');await assert.rejects(()=>send('after'));assert.equal(count,1);assert.equal((await (await send('after')).json()).count,1);assert.equal((await (await send('before')).json()).count,2);console.log('UAT transport: pre-commit drops do not write; lost responses retain exactly one commit and retry preserves payload/Origin.');}
finally{await proxy.close();backend.closeAllConnections();await new Promise(r=>backend.close(r));}
