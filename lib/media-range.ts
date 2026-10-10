export function mediaRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) return { invalid: true } as const;
  const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
  if ([first,last].some(n => n !== null && (!Number.isSafeInteger(n) || n < 0))) return { invalid: true } as const;
  const start = first === null ? Math.max(0, size - (last || 0)) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last,size - 1);
  if (start >= size || end < start) return { invalid: true } as const;
  return { start, end, invalid: false } as const;
}
