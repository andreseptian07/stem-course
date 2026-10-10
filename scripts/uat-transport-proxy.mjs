import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {connect} from 'node:net';
// Disposable UAT only. Preserve the real browser Origin, cookies and payload;
// the application itself keeps its normal guards and has no fault switches.
export async function transportProxy(publicPort,targetPort){
 let fault=null;const sockets=new Set(),counts=new Map();
 const server=createServer((incoming,outgoing)=>{
  const path=new URL(incoming.url,'http://localhost').pathname;
  const key=incoming.method+' '+path;counts.set(key,(counts.get(key)||0)+1);
  const selected=incoming.method==='POST'&&fault?.path===path?fault:null;
  if(selected)fault=null;
  if(selected?.when==='before'){incoming.resume();outgoing.destroy();return;}
  const upstream=request({hostname:'127.0.0.1',port:targetPort,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
   if(selected?.when==='after'){
    response.resume();response.on('end',()=>outgoing.destroy());return;
   }
   outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
  });
  upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(503,{'Content-Type':'application/json'});outgoing.end('{"error":"UAT upstream unavailable"}');});
  incoming.pipe(upstream);
 });
 server.on('upgrade',(incoming,socket,head)=>{
  const upstream=connect(targetPort,'127.0.0.1',()=>{
   upstream.write(incoming.method+' '+incoming.url+' HTTP/1.1\r\n'+Object.entries(incoming.headers).map(([key,value])=>key+': '+value).join('\r\n')+'\r\n\r\n');
   if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
  });
  sockets.add(socket);sockets.add(upstream);socket.on('close',()=>{sockets.delete(socket);upstream.destroy();});upstream.on('close',()=>{sockets.delete(upstream);socket.destroy();});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
 });
 server.listen(publicPort,'127.0.0.1');await once(server,'listening');
 return {requests(){return Object.fromEntries(counts);},arm(when,path){if(!['before','after'].includes(when)||!['/api/studio','/api/projects','/api/certificates'].includes(path))throw new Error('Unsupported UAT fault');fault={when,path};},async close(){for(const socket of sockets)socket.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
