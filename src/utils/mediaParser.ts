import { MediaItem, MediaType } from '../types';

export function parseMediaUrl(url: string): { type: MediaType; videoId?: string; cleanUrl: string } {
  let trimmed = url.trim();
  if (!trimmed) {
    return { type: 'none', cleanUrl: '' };
  }

  // Strip enclosing quotes, markdown formatting, or angle brackets that can be copied on mobile
  trimmed = trimmed.replace(/^[<"'\s]+|[>"'\s]+$/g, '').trim();

  // If user pasted just a direct 11-character YouTube video ID (alphanumeric, -, _)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return {
      type: 'youtube',
      videoId: trimmed,
      cleanUrl: `https://www.youtube.com/watch?v=${trimmed}`,
    };
  }

  // Ensure protocol if missing (otherwise relative URLs fail in webview)
  let normalizedUrl = trimmed;
  if (!/^https?:\/\//i.test(normalizedUrl) && !/^blob:/i.test(normalizedUrl) && !/^data:/i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  // YouTube checks across any subdomain (m.youtube, www.youtube, music.youtube, youtu.be, etc.)
  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      // 1. Check pathname for youtu.be/ID or youtube.com/embed/ID, /shorts/ID, /live/ID, /v/ID
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (hostname === 'youtu.be' && pathParts.length > 0) {
        const id = pathParts[0];
        if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
          return { type: 'youtube', videoId: id, cleanUrl: normalizedUrl };
        }
      }

      for (const prefix of ['embed', 'shorts', 'live', 'v']) {
        const idx = pathParts.indexOf(prefix);
        if (idx !== -1 && pathParts[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(pathParts[idx + 1])) {
          return { type: 'youtube', videoId: pathParts[idx + 1], cleanUrl: normalizedUrl };
        }
      }

      // 2. Check query parameter: v=ID (e.g., watch?v=ID or watch?app=desktop&v=ID)
      const v = parsed.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
        return { type: 'youtube', videoId: v, cleanUrl: normalizedUrl };
      }
    }
  } catch {
    // If standard URL parsing fails, fallback to regex
  }

  // Fallback YouTube regex
  const ytMatch = normalizedUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/|music\.youtube\.com\/watch\?(?:.*&)?v=))([A-Za-z0-9_-]{11})/i
  );
  if (ytMatch) {
    return {
      type: 'youtube',
      videoId: ytMatch[1],
      cleanUrl: normalizedUrl,
    };
  }

  // Google Drive direct stream converter
  const gDriveMatch = normalizedUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]+)/i);
  if (gDriveMatch) {
    return {
      type: 'mp4',
      cleanUrl: `https://drive.google.com/uc?export=download&id=${gDriveMatch[1]}`,
    };
  }

  // Dropbox direct stream converter (dl=1 / raw=1)
  if (normalizedUrl.includes('dropbox.com')) {
    const dropboxDirect = normalizedUrl
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/[?&]dl=0/, '')
      .replace(/[?&]raw=1/, '');
    const joiner = dropboxDirect.includes('?') ? '&' : '?';
    return {
      type: 'mp4',
      cleanUrl: `${dropboxDirect}${joiner}raw=1`,
    };
  }

  // HLS stream (.m3u8)
  if (/\.m3u8(?:[?#]|$)/i.test(normalizedUrl)) {
    return {
      type: 'hls',
      cleanUrl: normalizedUrl,
    };
  }

  // Audio files (.mp3, .wav, .ogg, .m4a, .aac, .flac)
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(?:[?#]|$)/i.test(normalizedUrl)) {
    return {
      type: 'mp3',
      cleanUrl: normalizedUrl,
    };
  }

  // Direct video files (.mp4, .m4v, .webm, .mov, .mkv, .ogv, .3gp) or fallback video URL
  return {
    type: 'mp4',
    cleanUrl: normalizedUrl,
  };
}

export function formatMediaLabel(item: { type: MediaType; url: string; videoId?: string }): string {
  if (item.type === 'youtube' && item.videoId) {
    return `YouTube: ${item.videoId}`;
  }
  if (item.type === 'hls') {
    const filename = item.url.split('?')[0].split('/').pop() || 'Live HLS Stream';
    return `📡 ${decodeURIComponent(filename).slice(0, 32)}`;
  }
  if (item.type === 'mp3') {
    const filename = item.url.split('?')[0].split('/').pop() || 'Audio Track';
    return `🎵 ${decodeURIComponent(filename).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 32)}`;
  }
  if (item.type === 'mp4') {
    const filename = item.url.split('?')[0].split('/').pop() || 'MP4 Video';
    return `🎬 ${decodeURIComponent(filename).slice(0, 32)}`;
  }
  return 'Media Track';
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
