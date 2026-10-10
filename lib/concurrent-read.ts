// Bound fan-out to avoid exhausting the shared database pool queue.
// Settle the current group before failing so callers can safely clean up.
export async function concurrentRead<T, R>(items: T[], read: (item: T) => Promise<R>, limit = 3): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Batas paralel harus positif.");
  const result: R[] = [];
  for (let offset = 0; offset < items.length; offset += limit) {
    const group = await Promise.allSettled(items.slice(offset, offset + limit).map(read));
    for (const item of group) {
      if (item.status === "rejected") throw item.reason;
      result.push(item.value);
    }
  }
  return result;
}
