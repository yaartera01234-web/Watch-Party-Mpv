import React, { useState } from 'react';
import { 
  Tv, 
  Settings, 
  X, 
  Sparkles, 
  Sliders, 
  Volume2, 
  Sun, 
  Maximize, 
  Gauge, 
  Keyboard, 
  Smartphone, 
  Info,
  Camera,
  Check,
  Copy,
  RefreshCw,
  Server,
  ExternalLink,
  ShieldCheck,
  Radio
} from 'lucide-react';
import { SYNCPLAY_SERVERS, SyncplayServer } from '../data/syncplayServers';

interface MpvModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  mediaType: string;
  brightness: number;
  onBrightnessChange: (val: number) => void;
  aspectRatio: string;
  onAspectRatioChange: (val: string) => void;
  audioBoost: number;
  onAudioBoostChange: (val: number) => void;
  playbackSpeed: number;
  onSpeedChange: (val: number) => void;
  onTakeScreenshot: () => void;
  onSyncRequest: () => void;
  roomName?: string;
  currentBrokerId?: number;
  onSelectBroker?: (brokerId: number) => void;
}

export const MpvModal: React.FC<MpvModalProps> = ({ 
  isOpen, 
  onClose, 
  currentUrl, 
  mediaType,
  brightness,
  onBrightnessChange,
  aspectRatio,
  onAspectRatioChange,
  audioBoost,
  onAudioBoostChange,
  playbackSpeed,
  onSpeedChange,
  onTakeScreenshot,
  onSyncRequest,
  roomName = 'main',
  currentBrokerId = 0,
  onSelectBroker,
}) => {
  const [activeTab, setActiveTab] = useState<'filters' | 'syncplay' | 'gestures' | 'shortcuts' | 'stats'>('filters');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  if (!isOpen) return null;

  const streamUrl = currentUrl.trim() || 'No active media stream';

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div 
      id="mpv-modal-overlay" 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div 
        id="mpv-modal-card" 
        className="relative w-full max-w-lg bg-neutral-950 border border-purple-500/30 rounded-2xl shadow-2xl p-5 sm:p-6 text-white overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-pink-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                MPV Built-In Player
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  In-App Engine
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Hardware-accelerated video & audio inside Watchparty
              </p>
            </div>
          </div>
          <button 
            id="mpv-close-btn"
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 mt-4 p-1 bg-black/50 rounded-xl border border-white/10 shrink-0 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('filters')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'filters' 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Video & Audio
          </button>

          <button 
            onClick={() => setActiveTab('syncplay')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'syncplay' 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Syncplay (8099/8995)
          </button>

          <button 
            onClick={() => setActiveTab('gestures')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'gestures' 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Gestures
          </button>

          <button 
            onClick={() => setActiveTab('shortcuts')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'shortcuts' 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            Shortcuts
          </button>

          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'stats' 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            Stream Info
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-4 no-scrollbar pr-0.5">
          {activeTab === 'filters' && (
            <div className="space-y-4">
              {/* Aspect Ratio Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Maximize className="w-3.5 h-3.5 text-pink-400" />
                  Aspect Ratio (Fit Mode)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'contain', label: 'Default' },
                    { id: '16/9', label: '16:9' },
                    { id: '4/3', label: '4:3' },
                    { id: 'cover', label: 'Fill / Zoom' },
                  ].map((asp) => (
                    <button
                      key={asp.id}
                      onClick={() => onAspectRatioChange(asp.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        aspectRatio === asp.id
                          ? 'bg-pink-600/30 border-pink-500 text-pink-200'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {asp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brightness Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    MPV Brightness
                  </span>
                  <span className="font-mono text-amber-300 font-bold">{Math.round(brightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.8"
                  step="0.05"
                  value={brightness}
                  onChange={(e) => onBrightnessChange(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>Dim (40%)</span>
                  <button 
                    onClick={() => onBrightnessChange(1.0)} 
                    className="text-neutral-400 hover:text-white underline"
                  >
                    Reset (100%)
                  </button>
                  <span>Bright (180%)</span>
                </div>
              </div>

              {/* Audio Boost */}
              <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                    Audio Boost (Night / Dialogue Enhancer)
                  </span>
                  <span className="font-mono text-purple-300 font-bold">
                    {audioBoost === 1 ? 'Normal' : audioBoost === 1.25 ? '+3dB Boost' : '+6dB High'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 1.0, label: 'Normal (100%)' },
                    { val: 1.25, label: '+3dB (125%)' },
                    { val: 1.5, label: '+6dB (150%)' },
                  ].map((b) => (
                    <button
                      key={b.val}
                      onClick={() => onAudioBoostChange(b.val)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                        audioBoost === b.val
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Playback Speed */}
              <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    Playback Speed
                  </span>
                  <span className="font-mono text-emerald-300 font-bold">{playbackSpeed}x</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map((s) => (
                    <button
                      key={s}
                      onClick={() => onSpeedChange(s)}
                      className={`py-1 px-2.5 rounded-lg text-xs font-semibold border transition-all ${
                        playbackSpeed === s
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick snapshot & Sync */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    onTakeScreenshot();
                    onClose();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-2 border border-white/10 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-pink-400" />
                  Capture Screenshot
                </button>

                <button
                  onClick={() => {
                    onSyncRequest();
                    onClose();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 border border-amber-500/30 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Room Members
                </button>
              </div>
            </div>
          )}

          {activeTab === 'syncplay' && (
            <div className="space-y-4">
              {/* Header card with Room & Quick Action */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-violet-950/50 via-purple-950/40 to-indigo-950/50 border border-violet-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white">Android & MPV Syncplay Servers</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                    Ports 8099 / 8995-8999
                  </span>
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Yeh verified Syncplay public servers hain jo <strong className="text-white">Syncplay Mobile (Android)</strong>, <strong className="text-white">Synkplay</strong>, aur <strong className="text-white">Desktop MPV/VLC</strong> par live playback synchronize karte hain.
                </p>

                <div className="flex items-center justify-between p-2 rounded-lg bg-black/50 border border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400 text-[11px]">Current Party Room:</span>
                    <span className="font-mono font-bold text-pink-300">{roomName}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(roomName, 'room-name')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white transition-colors"
                  >
                    {copiedText === 'room-name' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedText === 'room-name' ? 'Copied' : 'Copy Room'}</span>
                  </button>
                </div>
              </div>

              {/* Server List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-300 flex items-center justify-between px-1">
                  <span>Available Public Servers ({SYNCPLAY_SERVERS.length})</span>
                  <span className="text-[10px] text-neutral-400">Click to copy server:port</span>
                </div>

                <div className="space-y-2">
                  {SYNCPLAY_SERVERS.map((server) => {
                    const fullAddr = `${server.host}:${server.port}`;
                    const isCurrent = currentBrokerId === server.brokerId;
                    return (
                      <div
                        key={server.id}
                        className={`p-3 rounded-xl border transition-all space-y-2 group ${
                          isCurrent 
                            ? 'bg-purple-950/30 border-purple-500/50 shadow-md shadow-purple-900/20' 
                            : 'bg-white/5 hover:bg-white/[0.08] border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">{server.name}</span>
                              {isCurrent ? (
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Connected Now
                                </span>
                              ) : server.status === 'recommended' ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                                  Low Lag
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-2">
                              <span>{server.region}</span>
                              <span>•</span>
                              <span className="font-mono text-purple-300">{server.host}</span>
                              <span>•</span>
                              <span className="font-mono font-bold text-amber-300">Port {server.port}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Connect Server Button */}
                            {!isCurrent ? (
                              <button
                                type="button"
                                onClick={() => onSelectBroker?.(server.brokerId)}
                                className="px-2.5 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-semibold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-sm"
                                title={`Connect party to ${server.name}`}
                              >
                                <Radio className="w-3 h-3" />
                                <span>Select</span>
                              </button>
                            ) : null}

                            {/* Quick copy full address */}
                            <button
                              type="button"
                              onClick={() => handleCopy(fullAddr, server.id)}
                              className="px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/30 text-[11px] font-mono font-semibold text-violet-200 flex items-center gap-1.5 transition-all shrink-0 active:scale-95"
                              title="Copy full server address"
                            >
                              {copiedText === server.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-300">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{fullAddr}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-neutral-400 leading-snug">
                          {server.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Syncplay Protocol Integration & Room Connection */}
              <div className="p-3.5 rounded-xl bg-[#0e0c20] border border-purple-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-pink-400" />
                    Syncplay Protocol (Room: {roomName})
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                    Cross-Platform Synced
                  </span>
                </div>

                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Agar aapke dost PC ya external Syncplay client se connect hona chahein, to wo bhi isi room <strong className="text-pink-300 font-mono">{roomName}</strong> par syncplay.pl ke sath sync kar sakte hain:
                </p>

                <ol className="space-y-1.5 text-[11px] text-neutral-300 list-decimal list-inside">
                  <li>Syncplay client open karein.</li>
                  <li>Server address mein <strong className="text-violet-300 font-mono">syncplay.pl</strong> select karein.</li>
                  <li>Port mein <strong className="text-amber-300 font-mono">8999</strong>, <strong className="text-amber-300 font-mono">8099</strong> ya <strong className="text-amber-300 font-mono">8995</strong> select karein.</li>
                  <li>Room name mein <strong className="text-pink-300 font-mono">{roomName}</strong> enter karke connect dabayein.</li>
                </ol>
              </div>

              {/* Desktop MPV Launch Command */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-neutral-300 font-semibold px-1">
                  <span>Desktop MPV + Syncplay Launch Command</span>
                  <button
                    onClick={() => handleCopy(`syncplay --host syncplay.pl:8995 --room ${roomName}`, 'cli-cmd')}
                    className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    {copiedText === 'cli-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedText === 'cli-cmd' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-black/70 border border-white/10 font-mono text-[11px] text-cyan-300 break-all select-all">
                  syncplay --host syncplay.pl:8995 --room {roomName}
                </div>
              </div>

              {/* Built-in Embedded MPV Engine (Syncplay Mobile Architecture) */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-pink-950/40 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Tv className="w-4 h-4 text-pink-400" />
                    Built-in MPV Player Engine (In-App)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Integrated
                  </span>
                </div>

                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Is app ke andar <strong className="text-white">Full In-App MPV Media Engine</strong> pehle se installed hai — kisi bhi external app ya alag player ki zaroorat nahi hai:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="text-neutral-200">Zero-latency Syncplay protocol</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="text-neutral-200">Native Picture-in-Picture (PiP)</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="text-neutral-200">Background Audio on screen off</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="text-neutral-200">HLS (m3u8), MP4, MKV, WebM, DASH</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 text-[11px] text-neutral-300 flex items-center justify-between">
                  <span className="text-neutral-400">Sync Engine Status:</span>
                  <span className="text-emerald-400 font-mono font-semibold">Active &bull; Room "{roomName}"</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gestures' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-300 leading-relaxed">
                The in-app MPV Player supports full touch & mouse gesture controls directly on the video viewport:
              </p>

              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400 font-bold text-xs">
                    ☀️
                  </div>
                  <div>
                    <strong className="text-xs text-white block">Left-Side Vertical Drag:</strong>
                    <span className="text-[11px] text-neutral-400">
                      Swipe up/down on the left half of the video screen to raise or lower brightness with instant on-screen MPV OSD feedback.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0 text-purple-400 font-bold text-xs">
                    🔊
                  </div>
                  <div>
                    <strong className="text-xs text-white block">Right-Side Vertical Drag:</strong>
                    <span className="text-[11px] text-neutral-400">
                      Swipe up/down on the right half of the video screen to smoothly raise or lower volume.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center shrink-0 text-pink-400 font-bold text-xs">
                    ↔️
                  </div>
                  <div>
                    <strong className="text-xs text-white block">Horizontal Drag (Scrubbing):</strong>
                    <span className="text-[11px] text-neutral-400">
                      Drag left or right to scrub through video time with an MPV time preview banner.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400 font-bold text-xs">
                    ⚡
                  </div>
                  <div>
                    <strong className="text-xs text-white block">Double Tap Sides:</strong>
                    <span className="text-[11px] text-neutral-400">
                      Double-tap left to rewind 10s. Double-tap right to fast forward 10s. Double-tap center to play/pause.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-300">
                Standard MPV desktop & web keyboard shortcuts work anywhere while viewing:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Play / Pause</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">Space</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Seek ±5s</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">← / →</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Seek ±1s (Exact)</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">Shift + ← / →</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Volume ±5%</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">↑ / ↓</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Speed ±0.1x</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">[ / ]</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Reset Speed</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">Backspace</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Mute Toggle</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">m</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Fullscreen</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">f</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Screenshot Frame</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">s</kbd>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-neutral-400">Stats For Nerds</span>
                  <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 font-mono text-[11px] text-purple-300">i</kbd>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-neutral-300 space-y-1.5">
                <div className="flex justify-between border-b border-white/10 pb-1 text-emerald-400 font-bold">
                  <span>Engine:</span>
                  <span>MPV Built-In (Web Engine)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Media Type:</span>
                  <span className="uppercase text-white">{mediaType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Acceleration:</span>
                  <span className="text-emerald-400">Hardware (WebGL/HTML5)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Room Sync:</span>
                  <span className="text-pink-300">MQTT Multi-Client</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Aspect Ratio:</span>
                  <span className="text-white">{aspectRatio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Brightness:</span>
                  <span className="text-amber-300">{Math.round(brightness * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Audio Boost:</span>
                  <span className="text-purple-300">{Math.round(audioBoost * 100)}%</span>
                </div>
              </div>

              {/* Stream URL display */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span>Stream URL</span>
                  <button 
                    onClick={() => handleCopy(streamUrl, 'stream-url')} 
                    className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 text-[11px]"
                  >
                    {copiedText === 'stream-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedText === 'stream-url' ? 'Copied' : 'Copy'}
                  </button>
                </label>
                <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-neutral-400 truncate select-all">
                  {streamUrl}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-neutral-400">
            Running 100% inside Watchparty
          </span>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
