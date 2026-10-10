export function lessonMediaURL(content: string, classId?: string | null, download = false) {
  if (!content.startsWith('/api/media/')) return content;
  const url = new URL(content, 'http://localhost');
  if (classId) url.searchParams.set('class', classId);
  if (download) url.searchParams.set('download', '1');
  return url.pathname + url.search;
}
export function embeddedVideo(content: string) {
  try {
    const u = new URL(content);
    if (u.protocol !== 'https:') return '';
    if (['www.youtube.com', 'youtube.com', 'youtu.be'].includes(u.hostname)) {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/').pop();
      if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (['vimeo.com', 'www.vimeo.com'].includes(u.hostname) && /^\/\d+$/.test(u.pathname)) return 'https://player.vimeo.com/video' + u.pathname;
  } catch { /* Local protected media uses the native player. */ }
  return '';
}
