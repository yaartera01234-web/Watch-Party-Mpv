import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  Camera, 
  Dices, 
  Film, 
  Radio, 
  Tv, 
  MessageSquare, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { AvatarData, BrokerOption } from '../types';

interface JoinModalProps {
  initialName?: string;
  initialRoom?: string;
  initialBroker?: number;
  brokers: BrokerOption[];
  onJoin: (name: string, room: string, brokerId: number, avatar: AvatarData) => void;
  onOpenInstallModal?: () => void;
}

export const JoinModal: React.FC<JoinModalProps> = ({
  initialName = '',
  initialRoom = 'main',
  initialBroker = 0,
  brokers,
  onJoin,
  onOpenInstallModal,
}) => {
  const [name, setName] = useState(initialName);
  const [room, setRoom] = useState(initialRoom);
  const [brokerId, setBrokerId] = useState(initialBroker);
  const [avatar, setAvatar] = useState<AvatarData>({ type: 'letter' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleShuffleAvatar = () => {
    const seed = Math.random().toString(36).slice(2, 9);
    setAvatar({
      type: 'dicebear',
      url: `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${seed}`,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 96, 96);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setAvatar({
            type: 'upload',
            data: dataUrl,
          });

          // Upload to tmpfiles for remote peer sharing
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            try {
              const formData = new FormData();
              formData.append('file', blob, 'dp.jpg');
              const res = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST',
                body: formData,
              });
              const json = await res.json();
              if (json && json.data && json.data.url) {
                const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
                setAvatar((prev) => ({
                  ...prev,
                  url: directUrl,
                }));
                if (typeof window !== 'undefined' && (window as any).__wp_myAvatar) {
                  (window as any).__wp_myAvatar.url = directUrl;
                  if ((window as any).__wp_broadcastAvatar) {
                    (window as any).__wp_broadcastAvatar();
                  }
                }
              }
            } catch (err) {
              console.warn('DP upload error:', err);
            }
          }, 'image/jpeg', 0.75);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onJoin(name.trim(), room.trim() || 'main', brokerId, avatar);
  };

  const renderAvatarPreview = () => {
    const imgSrc = avatar.data || avatar.url;
    if (imgSrc) {
      return <img src={imgSrc} alt="Avatar" className="w-full h-full object-cover" />;
    }
    const letter = (name.trim()[0] || '🎬').toUpperCase();
    return (
      <span className="text-3xl font-extrabold text-white">
        {letter}
      </span>
    );
  };

  return (
    <div 
      id="join-screen-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-[#0a0815] via-[#14112c] to-[#0d0d21] overflow-y-auto"
    >
      <div 
        id="join-card-container"
        className="relative w-full max-w-md bg-white/5 border border-white/15 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl text-white my-auto"
      >
        {/* Decorative background gradients */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500/25 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 shadow-lg shadow-purple-500/30 mb-1">
            <Film className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-pink-400 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
            Watch Party & MPV
          </h1>
          <p className="text-xs sm:text-sm text-purple-200/80">
            Doston ke sath YouTube, MP4, HLS & MP3 dekho live sync me!
          </p>
        </div>

        {/* Avatar customizer */}
        <div className="flex flex-col items-center gap-2.5 mb-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 p-0.5 shadow-xl flex items-center justify-center overflow-hidden ring-4 ring-white/10">
            <div className="w-full h-full rounded-full bg-neutral-900 flex items-center justify-center overflow-hidden">
              {renderAvatarPreview()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-pink-400" />
              Upload DP
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <button
              type="button"
              onClick={handleShuffleAvatar}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors"
            >
              <Dices className="w-3.5 h-3.5 text-purple-400" />
              Cartoon
            </button>
          </div>
        </div>

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Your Name
            </label>
            <input
              id="join-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apna name likhein... (e.g. Ali)"
              maxLength={24}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-pink-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Party Room
            </label>
            <input
              id="join-room-input"
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Room name (e.g. movie-night)"
              maxLength={24}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-pink-400" />
                <span>Sync Server (Syncplay 8999 / 8099 / 8995)</span>
              </label>
              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                {brokers.find(b => b.id === brokerId)?.badge || 'Active'}
              </span>
            </div>

            {/* Quick-Pick Server Chips for 8999, 8099, 8995, 8996 */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                { id: 0, label: '🌐 8999 Default' },
                { id: 1, label: '📱 8099 Mobile' },
                { id: 2, label: '🇫🇷 8995' },
                { id: 3, label: '⚡ 8996 Low Lag' },
                { id: 7, label: '🗼 EMQX' }
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setBrokerId(chip.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    brokerId === chip.id
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm ring-1 ring-white/30 font-semibold'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <select
              id="join-tower-select"
              value={brokerId}
              onChange={(e) => setBrokerId(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id} className="bg-neutral-900 text-white py-1">
                  {b.label}
                </option>
              ))}
            </select>
            
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-400 px-1">
              <span className="flex items-center gap-1 text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Host: {brokers.find(b => b.id === brokerId)?.serverHost || 'syncplay.pl'}:{brokers.find(b => b.id === brokerId)?.serverPort || 8999}
              </span>
              <span className="text-violet-300 font-mono">{brokers.find(b => b.id === brokerId)?.region || 'Global'}</span>
            </div>
          </div>

          <button
            id="join-party-btn"
            type="submit"
            disabled={!name.trim()}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            <span>Party Me Enter Ho</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Feature tags */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-1.5 justify-center text-[10px] font-semibold text-neutral-300">
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
            <Film className="w-3 h-3 text-pink-400" /> YouTube & MP4
          </span>
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
            <Tv className="w-3 h-3 text-purple-400" /> MPV Android
          </span>
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
            <MessageSquare className="w-3 h-3 text-indigo-400" /> Live Chat
          </span>
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-emerald-400" /> Instant Sync
          </span>
        </div>
      </div>
    </div>
  );
};
