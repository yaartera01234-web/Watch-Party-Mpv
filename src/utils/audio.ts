/**
 * Zero-asset synthesized sound effects using the Web Audio API.
 * Ensures instant, reliable playback without external audio files.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function initAudioUnlock(): void {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function playTone(freqStart: number, freqEnd: number, duration: number, delay = 0, volume = 0.25): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(freqStart, 1), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + duration + 0.05);
  } catch {
    // Ignore audio context errors gracefully
  }
}

export function playJoinTune(): void {
  playTone(523.25, 523.25, 0.1, 0, 0.2);
  playTone(659.25, 659.25, 0.1, 0.09, 0.2);
  playTone(783.99, 783.99, 0.1, 0.18, 0.2);
  playTone(1046.5, 1046.5, 0.25, 0.27, 0.25);
}

export function playLeaveTune(): void {
  playTone(1046.5, 1046.5, 0.1, 0, 0.18);
  playTone(783.99, 783.99, 0.1, 0.09, 0.18);
  playTone(659.25, 659.25, 0.1, 0.18, 0.18);
  playTone(523.25, 523.25, 0.25, 0.27, 0.15);
}

export function playMsgTune(): void {
  playTone(880, 880, 0.08, 0, 0.18);
  playTone(1318.5, 1318.5, 0.14, 0.1, 0.22);
}

export function playReactionTune(): void {
  playTone(600, 1200, 0.15, 0, 0.15);
}

export function playSyncTune(): void {
  playTone(440, 880, 0.18, 0, 0.2);
}
