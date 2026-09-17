/**
 * Android Intent Generator & Media Launcher
 * Allows seamless deep-linking from web browser to native MPV Android Player,
 * VLC, MX Player, or Android system video player.
 */

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function getMpvIntentUrl(streamUrl: string): string {
  // Direct Android Intent scheme targeting MPV Android (package: is.xyz.mpv)
  // Strips scheme if needed or formats intent uri
  const clean = streamUrl.trim();
  return `intent:${clean}#Intent;action=android.intent.action.VIEW;type=video/*;package=is.xyz.mpv;end`;
}

export function getVlcIntentUrl(streamUrl: string): string {
  const clean = streamUrl.trim();
  return `intent:${clean}#Intent;action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;end`;
}

export function getMxPlayerIntentUrl(streamUrl: string): string {
  const clean = streamUrl.trim();
  return `intent:${clean}#Intent;action=android.intent.action.VIEW;type=video/*;package=com.mxtech.videoplayer.ad;end`;
}

export function getGenericVideoIntentUrl(streamUrl: string): string {
  const clean = streamUrl.trim();
  return `intent:${clean}#Intent;action=android.intent.action.VIEW;type=video/*;end`;
}

export function openInMpvAndroid(streamUrl: string): void {
  const intent = getMpvIntentUrl(streamUrl);
  window.location.href = intent;
}

export function openInVlcAndroid(streamUrl: string): void {
  const intent = getVlcIntentUrl(streamUrl);
  window.location.href = intent;
}

export function openInGenericPlayer(streamUrl: string): void {
  const intent = getGenericVideoIntentUrl(streamUrl);
  window.location.href = intent;
}
