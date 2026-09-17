import { MediaItem, MediaType } from '../types';

export function parseMediaUrl(url: string): { type: MediaType; videoId?: string; cleanUrl: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { type: 'none', cleanUrl: '' };
  }

  // YouTube parser
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i
  );
  if (ytMatch) {
    return {
      type: 'youtube',
      videoId: ytMatch[1],
      cleanUrl: trimmed,
    };
  }

  // Check URL query parameters for v= param on youtube domains
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
        return {
          type: 'youtube',
          videoId: v,
          cleanUrl: trimmed,
        };
      }
    }
  } catch {
    // Not a valid standard URL, continue with regex checks
  }

  // HLS stream (.m3u8)
  if (/\.m3u8(?:[?#]|$)/i.test(trimmed)) {
    return {
      type: 'hls',
      cleanUrl: trimmed,
    };
  }

  // Audio files (.mp3, .wav, .ogg, .m4a, .aac, .flac)
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(?:[?#]|$)/i.test(trimmed)) {
    return {
      type: 'mp3',
      cleanUrl: trimmed,
    };
  }

  // Default to MP4 / direct video
  return {
    type: 'mp4',
    cleanUrl: trimmed,
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
