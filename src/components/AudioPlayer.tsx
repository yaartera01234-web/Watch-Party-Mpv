import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Music, 
  Radio, 
  Tv 
} from 'lucide-react';
import { formatSeconds } from '../utils/mediaParser';

interface AudioPlayerProps {
  title: string;
  artist?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onSeekRelative: (delta: number) => void;
  onToggleMute: () => void;
  onOpenMpv: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  title,
  artist = 'Watch Party · High Fidelity Audio',
  isPlaying,
  currentTime,
  duration,
  isMuted,
  onTogglePlay,
  onSeek,
  onSeekRelative,
  onToggleMute,
  onOpenMpv,
}) => {
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div 
      id="audio-player-container"
      className="relative w-full h-full min-h-[200px] flex items-center justify-center p-4 sm:p-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#120d29] via-[#241442] to-[#0a0f24] border border-white/10 shadow-2xl"
    >
      {/* Ambient background orbs */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {/* Animated Album Art / Vinyl Disc */}
        <div className="relative shrink-0">
          <div 
            className={`w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-600 p-0.5 shadow-xl shadow-purple-900/40 flex items-center justify-center relative overflow-hidden ${
              isPlaying ? 'animate-pulse ring-2 ring-pink-400/30' : ''
            }`}
          >
            <div className="w-full h-full bg-black/40 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center relative">
              {/* Concentric vinyl grooves */}
              <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border border-white/15 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center shadow-md">
                    <Music className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Audio stream badge */}
          <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-pink-600/90 text-[10px] font-bold text-white shadow-md flex items-center gap-1">
            <Radio className="w-3 h-3" />
            MP3 / LIVE
          </div>
        </div>

        {/* Track info & Controls */}
        <div className="flex-1 w-full min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-pink-400">
                Playing in sync
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white truncate drop-shadow-sm">
                {title || 'Audio Stream'}
              </h3>
              <p className="text-xs text-neutral-400 truncate">
                {artist}
              </p>
            </div>

            <button
              id="audio-mpv-launch-btn"
              onClick={onOpenMpv}
              title="Open stream in MPV Android / External Player"
              className="shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors text-xs flex items-center gap-1 border border-white/10"
            >
              <Tv className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline text-[11px]">MPV Player</span>
            </button>
          </div>

          {/* Equalizer Waveform */}
          <div className="flex items-center gap-1 h-6 my-2.5 px-1">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className={`flex-1 rounded-full bg-gradient-to-t from-pink-500 to-purple-400 origin-bottom transition-all duration-150 ${
                  isPlaying ? 'animate-audio-bar' : 'h-1.5 opacity-40'
                }`}
                style={{
                  height: isPlaying ? `${Math.sin(i * 0.5) * 14 + 10}px` : '4px',
                  animationDelay: `${(i % 5) * 0.15}s`,
                }}
              />
            ))}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div 
              id="audio-progress-track"
              onClick={handleProgressBarClick}
              className="relative w-full h-2 bg-white/15 rounded-full cursor-pointer overflow-hidden group hover:h-2.5 transition-all"
            >
              <div 
                className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-400 rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-neutral-400">
              <span>{formatSeconds(currentTime)}</span>
              <span>{duration > 0 ? formatSeconds(duration) : 'Live'}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-between mt-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                id="audio-skip-back"
                onClick={() => onSeekRelative(-10)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
                title="10 seconds back"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                id="audio-play-pause-btn"
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white flex items-center justify-center shadow-lg shadow-pink-500/30 transition-all hover:scale-105 active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>

              <button
                id="audio-skip-forward"
                onClick={() => onSeekRelative(10)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
                title="10 seconds forward"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            <button
              id="audio-mute-btn"
              onClick={onToggleMute}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-pink-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
