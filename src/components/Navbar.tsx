import React, { useState } from 'react';
import { 
  Film, 
  Share2, 
  Check, 
  Tv, 
  RefreshCw, 
  Users, 
  LogOut, 
  Sparkles
} from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  roomName: string;
  onlineCount: number;
  currentUser: User | null;
  brokerName: string;
  onOpenMpv: () => void;
  onSyncAll: () => void;
  onLeaveRoom: () => void;
  onOpenInstallModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomName,
  onlineCount,
  currentUser,
  brokerName,
  onOpenMpv,
  onSyncAll,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);

  const handleShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomName);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header 
      id="app-navbar"
      className="shrink-0 px-3 sm:px-6 py-2.5 bg-black/40 border-b border-white/10 backdrop-blur-xl flex items-center justify-between gap-3 z-30"
    >
      {/* Brand & Room Info */}
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow-md shadow-pink-500/20">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-sm sm:text-base tracking-tight bg-gradient-to-r from-pink-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent hidden xs:inline">
            Watch Party
          </span>
        </div>

        {/* Room pill with 1-click share */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300">
          <span className="text-[10px] uppercase font-bold text-neutral-400">Room:</span>
          <span className="font-bold text-white truncate max-w-[90px] sm:max-w-[130px]">
            {roomName}
          </span>
          <button
            id="share-room-btn"
            onClick={handleShareLink}
            title="Copy invitation link with room code"
            className="ml-1 p-1 rounded-md bg-white/5 hover:bg-white/15 text-pink-400 hover:text-pink-300 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Share2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Action Buttons & Profile */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Online counter */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{onlineCount}</span>
          <span className="hidden sm:inline">online</span>
        </div>

        {/* Active Syncplay Server Indicator */}
        <button
          id="nav-server-badge"
          onClick={onOpenMpv}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-xs transition-colors cursor-pointer"
          title={`Active Server: ${brokerName}. Click to switch servers or view Syncplay ports.`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-pink-300 text-[11px] font-semibold">{brokerName}</span>
        </button>

        {/* In-App MPV Player Controls Action */}
        <button
          id="nav-mpv-btn"
          onClick={onOpenMpv}
          className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all hover:scale-105 active:scale-95"
          title="In-App MPV Controls, Filters & Gestures"
        >
          <Tv className="w-3.5 h-3.5 text-purple-300" />
          <span className="hidden sm:inline">MPV Player</span>
        </button>

        {/* Sync Button */}
        <button
          id="nav-sync-btn"
          onClick={onSyncAll}
          className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
          title="Sync all room members to your player timestamp"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Sync Sab Ko</span>
        </button>

        {/* User profile & exit */}
        {currentUser && (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/10">
            <span 
              className="text-xs font-bold text-neutral-200 hidden lg:inline truncate max-w-[80px]"
              style={{ color: currentUser.color }}
            >
              {currentUser.name}
            </span>
            <button
              onClick={onLeaveRoom}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-300 transition-colors"
              title="Leave Room"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
