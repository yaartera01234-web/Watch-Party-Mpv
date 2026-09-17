import React from 'react';
import { 
  ListMusic, 
  Trash2, 
  Play, 
  Plus, 
  X, 
  Music, 
  Film, 
  Radio, 
  Tv 
} from 'lucide-react';
import { MediaItem } from '../types';

interface PlaylistQueueProps {
  items: MediaItem[];
  currentIndex: number;
  onPlayIndex: (index: number) => void;
  onRemoveIndex: (index: number) => void;
  onClearQueue: () => void;
}

export const PlaylistQueue: React.FC<PlaylistQueueProps> = ({
  items,
  currentIndex,
  onPlayIndex,
  onRemoveIndex,
  onClearQueue,
}) => {
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'youtube':
        return <Film className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      case 'mp3':
        return <Music className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
      case 'hls':
        return <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      default:
        return <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    }
  };

  return (
    <div 
      id="playlist-queue-container"
      className="p-3.5 rounded-2xl bg-gradient-to-b from-[#16132d] to-[#0e0c1f] border border-white/10 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2.5">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-purple-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Playlist / Queue
          </h4>
          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {items.length}
          </span>
        </div>

        {items.length > 0 && (
          <button
            id="clear-playlist-btn"
            onClick={onClearQueue}
            className="text-[11px] text-neutral-400 hover:text-red-400 flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 no-scrollbar">
        {items.length === 0 ? (
          <div className="py-4 text-center text-xs text-neutral-400 flex flex-col items-center gap-1">
            <span>No songs or videos in queue.</span>
            <span className="text-[11px] text-neutral-400">
              Paste a link above and click <strong className="text-purple-400">+ Queue</strong>!
            </span>
          </div>
        ) : (
          items.map((item, idx) => {
            const isActive = idx === currentIndex;
            return (
              <div
                key={`${item.url}-${idx}`}
                onClick={() => onPlayIndex(idx)}
                className={`group flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-purple-950/50 border-purple-500/50 text-white shadow-md'
                    : 'bg-white/5 hover:bg-white/10 border-white/5 text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span className="text-[10px] font-mono text-neutral-400 w-4 text-center shrink-0">
                    {isActive ? <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" /> : idx + 1}
                  </span>
                  {getItemIcon(item.type)}
                  <span className="truncate font-medium text-xs">
                    {item.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-neutral-400 group-hover:hidden">
                    by {item.by || 'guest'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveIndex(idx);
                    }}
                    className="p-1 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
