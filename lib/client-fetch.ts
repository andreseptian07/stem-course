// A transport failure cannot tell the client whether the server committed.
// Callers retain the mutation identity and inputs to reconcile a retry.
const transportMessage = (mutation: boolean) => mutation
  ? "Belum menerima konfirmasi dari server. Isian Anda tetap tersedia. Coba lagi untuk memeriksa hasil penyimpanan."
  : "Data belum dapat dimuat. Periksa koneksi lalu coba lagi.";
export async function clientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    const mutation = init?.method && !["GET", "HEAD"].includes(init.method.toUpperCase());
    throw new Error(transportMessage(!!mutation));
  }
}
export async function responseJson<T>(response: Response, mutation = false): Promise<T> {
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error(transportMessage(mutation)); }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Permintaan belum berhasil.";
    throw Object.assign(new Error(message), {status: response.status});
  }
  return data as T;
}
