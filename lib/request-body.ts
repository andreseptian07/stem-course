import { AccessError } from "./access.ts";
export async function readRequestText(request: Request, limit: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new AccessError(413, "Isian terlalu besar.");
  if (!request.body) return "";
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AccessError(408, "Pengiriman terlalu lama. Coba kembali."));
      void reader.cancel().catch(() => {});
    }, limit > 24000 ? 30000 : 10000);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new AccessError(413, "Isian terlalu besar.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof TypeError) throw new AccessError(400, "Isian harus memakai UTF-8 yang valid.");
    throw error;
  } finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
}

export async function readRequestBytes(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new AccessError(413, "Berkas terlalu besar.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size=0, timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_,reject) => {timer=setTimeout(() => {reject(new AccessError(408,"Pengiriman terlalu lama."));void reader.cancel().catch(() => {});},30000);});
  try {
    while(true) {const chunk=await Promise.race([reader.read(),timeout]);if(chunk.done) break;size+=chunk.value.length;if(size>limit) throw new AccessError(413,"Berkas terlalu besar.");parts.push(chunk.value);}
    const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
  } catch(e) {void reader.cancel().catch(() => {});throw e;} finally {if(timer) clearTimeout(timer);reader.releaseLock();}
}
