import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  Play, 
  Plus, 
  Tv, 
  RefreshCw, 
  Link as LinkIcon, 
  Check, 
  AlertCircle 
} from 'lucide-react';

import { 
  User, 
  MediaItem, 
  MediaType, 
  ChatMessage, 
  ReactionEvent, 
  BrokerOption, 
  AvatarData,
  PlaybackState,
  QueueState
} from './types';
import { parseMediaUrl, formatMediaLabel } from './utils/mediaParser';
import { 
  initAudioUnlock, 
  playJoinTune, 
  playLeaveTune, 
  playMsgTune, 
  playReactionTune, 
  playSyncTune 
} from './utils/audio';
import { makeSyncplayClient, SyncplayClient } from './utils/syncplayClient';
import { SyncplayProtocol } from './utils/syncplayProtocol';

import { Navbar } from './components/Navbar';
import { VideoPlayer } from './components/VideoPlayer';
import { PlaylistQueue } from './components/PlaylistQueue';
import { ChatPanel } from './components/ChatPanel';
import { JoinModal } from './components/JoinModal';
import { MpvModal } from './components/MpvModal';
import { APP_BROKERS } from './data/syncplayServers';

const BROKERS: BrokerOption[] = APP_BROKERS;

const COLORS = [
  '#ec4899', '#f43f5e', '#a855f7', '#8b5cf6', '#6366f1',
  '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308', '#f97316'
];

const ROOM_PREFIX = 'WatchParty786/v2/';

export default function App() {
  // Join / Session State
  const [joined, setJoined] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [roomName, setRoomName] = useState('main');
  const [brokerId, setBrokerId] = useState(0);

  // Media & Playback State
  const [urlInput, setUrlInput] = useState('');
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Queue & Playlist State
  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Chat & Members State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [typingText, setTypingText] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);

  // UI Modals & Toggles
  const [isMpvModalOpen, setIsMpvModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // In-App MPV Engine Settings
  const [brightness, setBrightness] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState('contain');
  const [audioBoost, setAudioBoost] = useState(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const clientRef = useRef<SyncplayClient | null>(null);
  const listTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Syncplay protocol state
  const lastPingRef = useRef<number | undefined>(undefined);
  const clientIgnRef = useRef(0);
  // Har doosre user ki aakhri known playstate — keepalive-spam gate ke liye
  const lastSyncPlayRef = useRef<Record<string, { position: number; paused: boolean }>>({});
  const playlistFilesRef = useRef<string[]>([]);
  const playlistIndexRef = useRef<number | null>(null);
  const hadConnectedRef = useRef(false);
  // STATUS PILL helper — har nayi call purani auto-hide timer cancel karti hai
  // (purani 3s timer nayi message ko uda deti thi — stale-timer race fix!)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // NATIVE MPV (yuroyami-style): re-open loop rokne ke liye last opened URL
  const lastNativeUrlRef = useRef<string | null>(null);
  // mpv-ended event -> latest handleMediaEnd (closure stale na ho)
  const handleMediaEndRef = useRef<() => void>(() => { /* placeholder */ });
  const seenIdsRef = useRef<Set<string>>(new Set());
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastAvatarBroadcastRef = useRef<number>(0);
  const sentAvatarsToRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    initAudioUnlock();
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryRoom = urlParams.get('room');
      if (queryRoom) {
        setRoomName(queryRoom.trim().slice(0, 24));
      } else {
        const saved = localStorage.getItem('wp_prefs');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.room) setRoomName(parsed.room);
          if (parsed.broker !== undefined) setBrokerId(parsed.broker);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Native keep-alive pong ko asal playback state dete raho (har 10s)
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => {
      try { clientRef.current?.setPlaybackState(currentTime, !isPlaying); } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(t);
  }, [joined, currentTime, isPlaying]);

  /** Status pill ko dikhao ms ke liye — nayi call purani timer cancel karti hai */
  const showStatus = useCallback((msg: string, ms = 3000) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), ms);
  }, []);

  // ---- NATIVE MPV helpers ----
  const getNativeBridge = () => {
    try {
      const w = window as any;
      return typeof w.AndroidMpvBridge?.openMpv === 'function' ? w.AndroidMpvBridge : null;
    } catch { return null; }
  };

  /** Media native MPV mein kholo. force=true pe same URL dobara bhi kholo (re-play intent) */
  const openInNativeMpv = (url: string, force = false) => {
    const b = getNativeBridge();
    if (!b || !url) return;
    if (!force && lastNativeUrlRef.current === url) return; // same URL dobara -> loop roko
    lastNativeUrlRef.current = url;
    try { b.openMpv(url); } catch { /* ignore */ }
  };

  /** LIVE input value — kuch Android IME/paste pe React state miss karti hai; DOM se seedha parho */
  const getLiveUrlInput = () => {
    try {
      const el = document.getElementById('media-url-input') as HTMLInputElement | null;
      return el && el.value ? el.value : urlInput;
    } catch { return urlInput; }
  };

  // Native MPV events: state ticks / ended / resolving feedback
  useEffect(() => {
    const onMpvState = (e: any) => {
      try {
        const st = JSON.parse(e?.detail || '{}');
        const pos = typeof st.position === 'number' ? st.position : 0;
        const paused = !!st.paused;
        setCurrentTime((prev) => {
          // Chhoti drift ignore — warna har 500ms UI render storm
          return Math.abs(prev - pos) > 1.5 ? pos : prev;
        });
        setIsPlaying((prev) => {
          if (prev === !paused) return prev;
          return !paused;
        });
      } catch { /* ignore */ }
    };
    const onMpvEnded = () => { try { handleMediaEndRef.current(); } catch { /* ignore */ } };
    const onMpvResolving = () => {
      showStatus('🔍 Stream nikaali jaa rahi hai (native MPV)...', 4000);
    };
    const onSyncAction = (e: any) => {
      try {
        const d = JSON.parse(e?.detail || '{}');
        if (typeof d.position === 'number') setCurrentTime(d.position);
        if (typeof d.paused === 'boolean') setIsPlaying(!d.paused);
      } catch { /* ignore */ }
    };
    window.addEventListener('mpv-state', onMpvState as EventListener);
    window.addEventListener('mpv-ended', onMpvEnded);
    window.addEventListener('mpv-resolving', onMpvResolving);
    window.addEventListener('syncplay-sync-action', onSyncAction as EventListener);
    return () => {
      window.removeEventListener('mpv-state', onMpvState as EventListener);
      window.removeEventListener('mpv-ended', onMpvEnded);
      window.removeEventListener('mpv-resolving', onMpvResolving);
      window.removeEventListener('syncplay-sync-action', onSyncAction as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateMid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const isDuplicate = (id?: string) => {
    if (!id) return false;
    if (seenIdsRef.current.has(id)) return true;
    seenIdsRef.current.add(id);
    if (seenIdsRef.current.size > 800) {
      seenIdsRef.current.clear();
    }
    return false;
  };

  // Remote (ya doosre device ka) playlist server se aaye to local queue/media mein daalo
  const applyRemotePlaylist = (files: string[], index: number | null, byUser: string | null, selfUser: User) => {
    if (!files || files.length === 0) return;
    if (byUser && byUser === selfUser.name) return; // apni broadcast ka echo — ignore
    const items: MediaItem[] = files.map((f) => {
      const parsed = parseMediaUrl(f);
      const cleanUrl = parsed.type !== 'none' ? parsed.cleanUrl : f;
      return {
        type: parsed.type,
        url: cleanUrl,
        videoId: parsed.videoId,
        label: formatMediaLabel({ type: parsed.type, url: cleanUrl, videoId: parsed.videoId }),
        by: byUser || 'Remote',
        addedAt: Date.now(),
      };
    });
    setQueue(items);
    const idx = index !== null && index >= 0 && index < items.length ? index : 0;
    setQueueIndex(idx);
    const active = items[idx];
    setCurrentMedia((prev) => {
      const same = prev && prev.url === active.url && prev.videoId === active.videoId;
      if (same) return prev;
      setCurrentTime(0);
      // NATIVE: remote user ne nayi cheez lagayi -> humein bhi native mein kholo
      openInNativeMpv(active.url);
      return active;
    });
  };

  // Queue ko official playlist (Set.playlistChange + Set.playlistIndex) ke roop mein bhejo
  const syncQueueToRoom = (items: MediaItem[], index: number | null) => {
    if (!clientRef.current || !currentUser) return;
    clientRef.current.publish('', SyncplayProtocol.playlistChange(currentUser.name, items.map((i) => i.url)));
    clientRef.current.publish('', SyncplayProtocol.playlistIndex(currentUser.name, index));
  };

  const connectSyncplay = (user: User, room: string, brokerIdx: number) => {
    const broker = BROKERS[brokerIdx] || BROKERS[0];
    const host = broker.serverHost || 'syncplay.pl';
    const port = broker.serverPort || 8999;

    const syncplay = makeSyncplayClient(host, port, room, user.name, '');
    // Purana client/timer saaf karo (re-join ke waqt)
    if (listTimerRef.current) { clearInterval(listTimerRef.current); listTimerRef.current = null; }
    try { clientRef.current?.end(); } catch { /* ignore */ }
    clientRef.current = syncplay;

    // Server ka member-roster mangwana (Syncplay protocol: {"List": null})
    const requestList = () => {
      try { syncplay.publish('', '{"List": null}'); } catch { /* ignore */ }
    };

    // Server messages parho — yahan se PARTY MEMBERS / online count update hoga
    syncplay.on('message', (raw: string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (msg && msg.List) {
          const roomData = msg.List[room] || Object.values(msg.List)[0] || {} as any;
          const globalAvs = (typeof window !== 'undefined' ? (window as any).__wp_avatars : null) || {};
          const others: User[] = Object.keys(roomData)
            .filter((n) => n !== user.name)
            .map((n) => {
              const hash = [...String(n)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
              const av = globalAvs[n.toLowerCase()] || { type: 'letter' };
              return {
                id: 'sp_' + n,
                name: n,
                color: COLORS[hash % COLORS.length],
                avatar: av,
                ts: Date.now(),
              };
            });
          setMembers([user, ...others]);
          if (others.length > 0 && typeof window !== 'undefined' && (window as any).__wp_broadcastAvatar) {
            const now = Date.now();
            if (now - lastAvatarBroadcastRef.current > 3000) {
              lastAvatarBroadcastRef.current = now;
              setTimeout(() => (window as any).__wp_broadcastAvatar(), 200);
            }
          }
        }
        // Server ne room mein daakhla confirm kiya
        if (msg && msg.Hello) {
          setMembers((prev) => (prev.some((m) => m.id === user.id) ? prev : [user, ...prev]));
          requestList();
          if (typeof window !== 'undefined' && (window as any).__wp_broadcastAvatar) {
            setTimeout(() => (window as any).__wp_broadcastAvatar(), 300);
          }
        }
        // --- OFFICIAL PLAYBACK SYNC: kisi ne play/pause/seek kiya (State.playstate) ---
        if (msg && msg.State && msg.State.playstate) {
          const ps = msg.State.playstate;
          const ping = msg.State.ping || {};
          if (typeof ping.latencyCalculation === 'number') lastPingRef.current = ping.latencyCalculation;
          // Apni initiated change ka echo wapas aaye to client counter reset karo (official behavior)
          const ign = msg.State.ignoringOnTheFly;
          if (ign && typeof ign.client === 'number' && ign.client === clientIgnRef.current && clientIgnRef.current !== 0) {
            clientIgnRef.current = 0;
          }
          // setBy = jis ne change kiya. Sirf doosron ki changes apply karo (apni + routine pings nahi).
          if (ps.setBy && ps.setBy !== user.name) {
            // ANTI-SPAM / ANTI-HIJACK: server har client ki 1-second ping-pong
            // keepalives bhi room mein relay karta hai (playstate ke saath).
            // Agar state pichli message se nahi badli to kuch MAT karo —
            // warna chat "pause kiya" pills se bhar jata hai aur player
            // har second dusre bande ki position pe reset ho jata hai!
            const pos = typeof ps.position === 'number' ? ps.position : 0;
            const paused = !!ps.paused;
            const prevState = lastSyncPlayRef.current[ps.setBy];
            const unchanged = !!prevState && prevState.paused === paused
              && Math.abs(prevState.position - pos) <= 2 && !ps.doSeek;
            lastSyncPlayRef.current[ps.setBy] = { position: pos, paused };
            if (!unchanged) {
              if (typeof ps.position === 'number') setCurrentTime(pos);
              if (typeof ps.paused === 'boolean') setIsPlaying(!ps.paused);
              // NATIVE MPV ko remote change batao (native mode mein)
              try {
                const b = getNativeBridge();
                if (b) {
                  if (typeof ps.position === 'number' && (ps.doSeek || paused || Math.abs(currentTime - pos) > 4)) {
                    b.mpvSeekTo(pos);
                  }
                  b.mpvPause(paused);
                }
              } catch { /* ignore */ }
              setMessages((prev) => [...prev, {
                id: generateMid(), senderId: 'system', name: 'System', color: '#38bdf8',
                text: `🔄 ${ps.setBy} ${ps.paused ? '⏸️ pause kiya' : '▶️ play kiya'}${ps.doSeek ? ' (seek)' : ''}`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isSystem: true,
              }]);
            }
          }
        }
        // --- OFFICIAL CHAT: server ne room ka message relay kiya ---
        if (msg && msg.Chat && msg.Chat.username && msg.Chat.username !== user.name) {
          const c = msg.Chat;
          const rawMsg = (c.message || '').trim();

          // 1. Invisible avatar handshake message
          if (rawMsg.startsWith('::av::')) {
            try {
              const payload = JSON.parse(rawMsg.slice(6));
              const sender = c.username;
              if (sender && sender !== user.name) {
                const av: AvatarData = {
                  type: payload.t === 'upload' ? 'upload' : (payload.t === 'dicebear' ? 'dicebear' : 'letter'),
                  url: payload.u || undefined,
                  data: payload.u || undefined,
                };
                if (typeof window !== 'undefined') {
                  (window as any).__wp_avatars = (window as any).__wp_avatars || {};
                  (window as any).__wp_avatars[sender.toLowerCase()] = av;
                }
                setMembers((prev) =>
                  prev.map((m) =>
                    m.name.toLowerCase() === sender.toLowerCase() ? { ...m, avatar: av } : m
                  )
                );
                // Reply with our own avatar if peer hasn't received it yet
                const senderKey = sender.toLowerCase();
                if (!sentAvatarsToRef.current[senderKey]) {
                  sentAvatarsToRef.current[senderKey] = true;
                  if (typeof window !== 'undefined' && (window as any).__wp_broadcastAvatar) {
                    (window as any).__wp_broadcastAvatar();
                  }
                }
              }
            } catch (err) {
              console.warn('Avatar parse error:', err);
            }
            return; // DO NOT show in chat!
          }

          // 2. Parse swipe-to-reply quote if present
          let text = rawMsg;
          let replyObj: { name: string; text: string } | null = null;
          const replyMatch = rawMsg.match(/^↪️\s*([^:]+):\s*"([\s\S]*?)"\s*—\s*([\s\S]*)$/);
          if (replyMatch) {
            replyObj = {
              name: replyMatch[1].trim(),
              text: replyMatch[2].trim(),
            };
            text = replyMatch[3].trim();
          }

          const hash = [...String(c.username)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
          const chatMsg: ChatMessage = {
            id: generateMid(),
            senderId: 'sp_' + c.username,
            name: c.username,
            color: COLORS[hash % COLORS.length],
            text,
            reply: replyObj,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, chatMsg]);
          if (soundEnabled) playMsgTune();
        }
        // --- OFFICIAL PLAYLIST: remote user ne media load badla ---
        if (msg && msg.Set && msg.Set.playlistChange) {
          const files = msg.Set.playlistChange.files || [];
          playlistFilesRef.current = files;
          applyRemotePlaylist(files, playlistIndexRef.current, msg.Set.playlistChange.user, user);
        }
        if (msg && msg.Set && msg.Set.playlistIndex) {
          const idx = msg.Set.playlistIndex.index;
          playlistIndexRef.current = idx ?? null;
          applyRemotePlaylist(playlistFilesRef.current, playlistIndexRef.current, msg.Set.playlistIndex.user, user);
        }
      } catch {
        // ignore non-JSON lines
      }
    });

    syncplay.on('connect', () => {
      if (hadConnectedRef.current) {
        // Reconnect hua (net slow/cut ke baad)
        showStatus('✅ Reconnected! Sync wapas live hai', 3500);
      } else {
        showStatus(`Connected to ${broker.name} (${host}:${port})`, 3500);
        if (soundEnabled) playJoinTune();
        confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
        hadConnectedRef.current = true;
      }
      setMembers([user]);
      requestList(); // foran roster maango
      if (listTimerRef.current) clearInterval(listTimerRef.current);
      listTimerRef.current = setInterval(requestList, 5000); // har 5s roster refresh
      // Playlist/state dobara sync (reconnect ke baad room ko fresh halat do)
      if (currentMedia) {
        try {
          syncplay.publish('', SyncplayProtocol.playlistChange(user.name, queue.length ? queue.map((q) => q.url) : [currentMedia.url]));
          syncplay.publish('', SyncplayProtocol.playlistIndex(user.name, queueIndex >= 0 ? queueIndex : 0));
          syncplay.setPlaybackState(currentTime, !isPlaying);
        } catch { /* ignore */ }
      }
    });
    syncplay.on('reconnecting', (info: any) => {
      const n = info?.attempt ?? 1;
      const max = info?.max ?? 15;
      showStatus(`🔄 Net cut gaya — auto-reconnect... (koshish ${n}/${max})`);
    });
    syncplay.on('error', (err: any) => {
      const msg = err?.message || String(err);
      setStatusMessage(`Syncplay error: ${msg}`);
    });
    syncplay.on('disconnect', () => {
      if (listTimerRef.current) { clearInterval(listTimerRef.current); listTimerRef.current = null; }
      setMembers([]);
      setStatusMessage('⚠️ Connection cut gaya — auto-reconnect shuru ho raha hai...');
    });
    syncplay.connect();
  };

  const handleJoinParty = (name: string, room: string, brokerIdx: number, avatar: AvatarData) => {
    const cleanRoom = room.trim().replace(/[#+\0]/g, '').slice(0, 24) || 'main';
    const userId = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const userColor = COLORS[Math.floor(Math.random() * COLORS.length)];

    const user: User = {
      id: userId,
      name: name.slice(0, 20),
      color: userColor,
      avatar,
      ts: Date.now(),
    };

    setCurrentUser(user);
    setRoomName(cleanRoom);
    setBrokerId(brokerIdx);
    setJoined(true);
    hadConnectedRef.current = false;
    lastSyncPlayRef.current = {};

    if (typeof window !== 'undefined') {
      (window as any).__wp_myAvatar = avatar;
      (window as any).__wp_avatars = (window as any).__wp_avatars || {};
      (window as any).__wp_avatars[user.name.toLowerCase()] = avatar;
      (window as any).__wp_broadcastAvatar = () => {
        if (!clientRef.current) return;
        const av = (window as any).__wp_myAvatar || avatar;
        const avUrl = av.url || (av.type === 'dicebear' ? av.url : '') || (av.data?.startsWith('http') ? av.data : '');
        const payload = { t: av.type, u: avUrl || '' };
        try {
          clientRef.current.publish('', SyncplayProtocol.chat('::av::' + JSON.stringify(payload)));
        } catch {}
      };
    }

    try {
      localStorage.setItem('wp_prefs', JSON.stringify({
        name: user.name,
        room: cleanRoom,
        broker: brokerIdx,
      }));
    } catch {
      // ignore
    }

    connectSyncplay(user, cleanRoom, brokerIdx);
  };

  const handleRemoteCommand = (cmd: any) => {
    if (cmd.action === 'load' && cmd.media) {
      setCurrentMedia(cmd.media);
      setCurrentTime(cmd.time || 0);
      setIsPlaying(true);
      setMessages((prev) => [
        ...prev,
        {
          id: generateMid(),
          senderId: 'system',
          name: 'System',
          color: '#c084fc',
          text: `🎬 ${cmd.by} loaded: ${cmd.media.label}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSystem: true,
        },
      ]);
    } else if (cmd.action === 'play') {
      if (cmd.time !== undefined) setCurrentTime(cmd.time);
      setIsPlaying(true);
    } else if (cmd.action === 'pause') {
      if (cmd.time !== undefined) setCurrentTime(cmd.time);
      setIsPlaying(false);
    } else if (cmd.action === 'seek') {
      if (cmd.time !== undefined) setCurrentTime(cmd.time);
    } else if (cmd.action === 'sync') {
      if (cmd.time !== undefined) setCurrentTime(cmd.time);
      if (cmd.playing !== undefined) setIsPlaying(cmd.playing);
      if (soundEnabled) playSyncTune();
      setMessages((prev) => [
        ...prev,
        {
          id: generateMid(),
          senderId: 'system',
          name: 'System',
          color: '#38bdf8',
          text: `🔄 ${cmd.by} synchronized all players`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSystem: true,
        },
      ]);
    }
  };

  const handleRemoteState = (state: PlaybackState) => {
    if (!state || state.type === 'none') return;
    const elapsed = state.playing && state.at ? (Date.now() - state.at) / 1000 : 0;
    const targetTime = (state.time || 0) + elapsed;

    setCurrentMedia((prev) => {
      const isSame = prev && prev.type === state.type && (
        (state.type === 'youtube' && prev.videoId === state.videoId) ||
        (state.type !== 'youtube' && prev.url === state.url)
      );
      if (isSame) return prev;
      return {
        type: state.type,
        url: state.url,
        videoId: state.videoId,
        label: formatMediaLabel({ type: state.type, url: state.url, videoId: state.videoId }),
        by: 'Host',
      };
    });

    setCurrentTime((prev) => {
      if (Math.abs(prev - targetTime) > 2.5) {
        return targetTime;
      }
      return prev;
    });

    setIsPlaying(state.playing);
  };

  // Play/pause/seek/sync — ab official Syncplay State messages mein (custom JSON = server kick!)
  const broadcastCommand = (action: string, extra: Record<string, any> = {}) => {
    if (!clientRef.current || !currentUser) return;
    const c = clientRef.current;
    const position = extra.time !== undefined ? extra.time : currentTime;
    let paused: boolean;
    let doSeek = false;

    if (action === 'play') paused = false;
    else if (action === 'pause') paused = true;
    else if (action === 'seek') { paused = !isPlaying; doSeek = true; }
    else if (action === 'load') { paused = false; doSeek = true; }
    else if (action === 'sync') { paused = extra.playing !== undefined ? !extra.playing : !isPlaying; doSeek = true; }
    else return;

    c.publish('', SyncplayProtocol.state({
      position: action === 'load' ? 0 : position,
      paused,
      doSeek,
      clientIgnoring: ++clientIgnRef.current,
      latencyCalculation: lastPingRef.current,
    }));
    // Native keep-alive pong ko bhi asal halat batao
    try { c.setPlaybackState(action === 'load' ? 0 : position, paused); } catch { /* ignore */ }
    // NATIVE MPV ko bhi same command do (native mode mein video native player chal rahi hai)
    try {
      const b = getNativeBridge();
      if (b) {
        if (action === 'play') b.mpvPause(false);
        else if (action === 'pause') b.mpvPause(true);
        if (action === 'seek' || action === 'load' || action === 'sync') b.mpvSeekTo(action === 'load' ? 0 : position);
      }
    } catch { /* ignore */ }
  };

  const handleLoadMedia = () => {
    // LIVE DOM fallback: kuch phones pe React state paste bhool jati hai — asal input se lo
    const live = getLiveUrlInput();
    // FEEDBACK FIRST: khamoshi maut hai — pehle user ko batao kya hua.
    if (!live.trim()) {
      showStatus('⚠️ Pehle link paste karein, Boss!', 2500);
      return;
    }
    const parsed = parseMediaUrl(live);
    if (parsed.type === 'none') {
      showStatus('❌ Ye link samajh nahi aayi — YouTube ya direct video link paste karein', 3500);
      return;
    }

    const item: MediaItem = {
      type: parsed.type,
      url: parsed.cleanUrl,
      videoId: parsed.videoId,
      label: formatMediaLabel({ type: parsed.type, url: parsed.cleanUrl, videoId: parsed.videoId }),
      by: currentUser?.name || 'You',
      addedAt: Date.now(),
    };

    setCurrentMedia(item);
    setCurrentTime(0);
    setIsPlaying(true);
    // INPUT CLEAR MAT KARO — user ka link wahi rahega taake dobara Play dabane se re-play ho
    // (pehle yahan setUrlInput('') tha isliye 2nd press pe "pehle link paste karo" ata tha)

    const newQueue = [item];
    setQueue(newQueue);
    setQueueIndex(0);

    openInNativeMpv(parsed.cleanUrl, true); // force: same link ka re-play bhi chale

    broadcastCommand('load', { media: item, time: 0 });
    syncQueueToRoom(newQueue, 0);
    showStatus(getNativeBridge() ? '🎬 Native MPV se play ho raha hai...' : `🎬 ${item.label} load hui`, 3000);
  };

  // Media khatam/clear ho to native player bhi band karo (warna overlay screen pe latka rehta)
  useEffect(() => {
    if (!currentMedia) {
      try {
        const w = window as any;
        if (typeof w.AndroidMpvBridge?.closeMpv === 'function') w.AndroidMpvBridge.closeMpv();
      } catch { /* ignore */ }
      lastNativeUrlRef.current = null;
    }
  }, [currentMedia]);

  const handleAddToQueue = () => {
    const live = getLiveUrlInput();
    if (!live.trim()) {
      showStatus('⚠️ Pehle link paste karein, Boss!', 2500);
      return;
    }
    const parsed = parseMediaUrl(live);
    if (parsed.type === 'none') {
      showStatus('❌ Ye link samajh nahi aayi — YouTube ya direct video link paste karein', 3500);
      return;
    }

    const item: MediaItem = {
      type: parsed.type,
      url: parsed.cleanUrl,
      videoId: parsed.videoId,
      label: formatMediaLabel({ type: parsed.type, url: parsed.cleanUrl, videoId: parsed.videoId }),
      by: currentUser?.name || 'You',
      addedAt: Date.now(),
    };

    const newQueue = [...queue, item];
    let newIndex = queueIndex;
    if (newIndex === -1) {
      newIndex = 0;
      setCurrentMedia(item);
      setCurrentTime(0);
      setIsPlaying(true);
      broadcastCommand('load', { media: item, time: 0 });
      openInNativeMpv(parsed.cleanUrl);
    }

    setQueue(newQueue);
    setQueueIndex(newIndex);
    // Input clear mat karo — link wahin rahe taake Queue ke baad seedha Play bhi dabaa sake

    syncQueueToRoom(newQueue, newIndex);
    showStatus(`➕ Queue mein add hui: ${item.label}`, 2500);
  };

  const handlePlayQueueIndex = (index: number) => {
    if (index < 0 || index >= queue.length) return;
    const item = queue[index];
    setQueueIndex(index);
    setCurrentMedia(item);
    setCurrentTime(0);
    setIsPlaying(true);
    openInNativeMpv(item.url);
    broadcastCommand('load', { media: item, time: 0 });

    syncQueueToRoom(queue, index);
  };

  const handleRemoveQueueIndex = (index: number) => {
    const updated = queue.filter((_, i) => i !== index);
    let nextIndex = queueIndex;
    if (index <= queueIndex) {
      nextIndex = Math.max(0, queueIndex - 1);
    }
    setQueue(updated);
    setQueueIndex(nextIndex);

    syncQueueToRoom(updated, nextIndex);
  };

  const handleClearQueue = () => {
    setQueue([]);
    setQueueIndex(-1);
    syncQueueToRoom([], null);
  };

  const handleMediaEnd = () => {
    if (queue.length > 0 && queueIndex + 1 < queue.length) {
      handlePlayQueueIndex(queueIndex + 1);
    } else {
      setIsPlaying(false);
    }
  };
  handleMediaEndRef.current = handleMediaEnd;

  const handleForceSync = () => {
    if (!currentMedia) return;
    broadcastCommand('sync', { time: currentTime, playing: isPlaying });
  };

  const handleSwitchBroker = (newBrokerIdx: number) => {
    if (newBrokerIdx === brokerId || !currentUser) return;
    setBrokerId(newBrokerIdx);
    const targetBroker = BROKERS[newBrokerIdx] || BROKERS[0];
    setStatusMessage(`Connecting to ${targetBroker.name} (${targetBroker.serverHost || 'syncplay.pl'}:${targetBroker.serverPort || 8999})...`);
    try {
      const saved = localStorage.getItem('wp_prefs');
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem('wp_prefs', JSON.stringify({ ...parsed, broker: newBrokerIdx }));
    } catch {
      // ignore
    }
    connectSyncplay(currentUser, roomName, newBrokerIdx);
  };

  const handleSendMessage = (text: string, replyTo?: { name: string; text: string } | null) => {
    if (!currentUser || !clientRef.current) return;
    const d = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msg: ChatMessage = {
      id: generateMid(),
      senderId: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
      text,
      reply: replyTo,
      time,
    };

    setMessages((prev) => [...prev, msg]);
    // Official Syncplay Chat: plain string. Custom JSON bhejne par server kick karta hai!
    const cleanQuote = replyTo ? (replyTo.text || '').replace(/\r?\n/g, ' ').trim() : '';
    const quotePreview = cleanQuote.length > 35 ? cleanQuote.slice(0, 32) + '...' : cleanQuote;
    const wireText = replyTo
      ? `↪️ ${replyTo.name}: "${quotePreview}" — ${text}`
      : text;
    clientRef.current.publish('', SyncplayProtocol.chat(wireText));
  };

  const handleTyping = () => {
    // Syncplay protocol typing-indicators support nahi karta.
    // Wire par kuch na bhejo — warna server connection kaat dega.
  };

  const handleSendReaction = (emoji: string) => {
    if (!currentUser || !clientRef.current) return;
    const x = Math.floor(Math.random() * 80) + 10;
    triggerLocalReaction(emoji, currentUser.name, x);
    // NOTE: Reactions ab sirf LOCAL hain. Syncplay custom events relay nahi karta —
    // custom JSON bhejne par server connection kaat deta hai.
  };

  const triggerLocalReaction = (emoji: string, senderName: string, x: number) => {
    const reaction: ReactionEvent = {
      id: generateMid(),
      emoji,
      senderName,
      x,
    };
    setReactions((prev) => [...prev, reaction]);
    if (soundEnabled) playReactionTune();
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
    }, 2000);
  };

  const handleLeaveRoom = () => {
    // Native MPV bhi band karo (warna purani video screen pe chipki rehti)
    try {
      const w = window as any;
      if (typeof w.AndroidMpvBridge?.closeMpv === 'function') w.AndroidMpvBridge.closeMpv();
    } catch { /* ignore */ }
    lastNativeUrlRef.current = null;
    if (clientRef.current && currentUser) {
      clientRef.current.end(true);
    }
    if (listTimerRef.current) { clearInterval(listTimerRef.current); listTimerRef.current = null; }
    setJoined(false);
    setCurrentUser(null);
    setMessages([]);
    setMembers([]);
    setQueue([]);
    setCurrentMedia(null);
  };

  return (
    <div id="app-root" className="min-h-screen flex flex-col bg-[#0a0815] text-white selection:bg-purple-600 selection:text-white overflow-hidden">
      {!joined && (
        <JoinModal
          initialRoom={roomName}
          brokers={BROKERS}
          onJoin={handleJoinParty}
        />
      )}

      <MpvModal
        isOpen={isMpvModalOpen}
        onClose={() => setIsMpvModalOpen(false)}
        currentUrl={currentMedia?.url || ''}
        mediaType={currentMedia?.type || 'none'}
        brightness={brightness}
        onBrightnessChange={setBrightness}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        audioBoost={audioBoost}
        onAudioBoostChange={setAudioBoost}
        playbackSpeed={playbackSpeed}
        onSpeedChange={setPlaybackSpeed}
        onTakeScreenshot={() => {
          const btn = document.getElementById('mpv-screenshot-btn');
          btn?.click();
        }}
        onSyncRequest={handleForceSync}
        roomName={roomName}
        currentBrokerId={brokerId}
        onSelectBroker={handleSwitchBroker}
      />

      {joined && (
        <>
          <Navbar
            roomName={roomName}
            onlineCount={members.length}
            currentUser={currentUser}
            brokerName={BROKERS[brokerId]?.badge || BROKERS[brokerId]?.name || 'Default'}
            onOpenMpv={() => setIsMpvModalOpen(true)}
            onSyncAll={handleForceSync}
            onLeaveRoom={handleLeaveRoom}
          />

          <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-h-0 overflow-y-auto lg:overflow-hidden">
            <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 min-h-0 overflow-y-visible lg:overflow-y-auto no-scrollbar">
              <div 
                id="url-input-bar" 
                className="p-2 sm:p-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-wrap sm:flex-nowrap gap-2 items-center shadow-lg"
              >
                <div className="flex-1 relative flex items-center min-w-[200px]">
                  <LinkIcon className="w-4 h-4 text-purple-400 absolute left-3 pointer-events-none" />
                  <input
                    id="media-url-input"
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLoadMedia();
                    }}
                    placeholder="Paste YouTube, MP4 video, HLS (.m3u8), or MP3 audio link..."
                    className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="load-media-btn"
                    onClick={handleLoadMedia}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Play</span>
                  </button>

                  <button
                    id="queue-media-btn"
                    onClick={handleAddToQueue}
                    className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Queue</span>
                  </button>

                  <button
                    id="open-mpv-quick-trigger"
                    onClick={() => setIsMpvModalOpen(true)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-purple-300 border border-purple-500/30 transition-colors"
                    title="In-App MPV Player Controls & Diagnostics"
                  >
                    <Tv className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <VideoPlayer
                currentMedia={currentMedia}
                isPlaying={isPlaying}
                currentTime={currentTime}
                reactions={reactions}
                brightness={brightness}
                onBrightnessChange={setBrightness}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                audioBoost={audioBoost}
                onAudioBoostChange={setAudioBoost}
                onPlay={(t) => {
                  setCurrentTime(t);
                  setIsPlaying(true);
                  broadcastCommand('play', { time: t });
                }}
                onPause={(t) => {
                  setCurrentTime(t);
                  setIsPlaying(false);
                  broadcastCommand('pause', { time: t });
                }}
                onSeek={(t) => {
                  setCurrentTime(t);
                  broadcastCommand('seek', { time: t });
                }}
                onMediaEnd={handleMediaEnd}
                onSyncRequest={handleForceSync}
                onOpenMpvModal={() => setIsMpvModalOpen(true)}
                onSendReaction={handleSendReaction}
                roomName={roomName}
              />

              <PlaylistQueue
                items={queue}
                currentIndex={queueIndex}
                onPlayIndex={handlePlayQueueIndex}
                onRemoveIndex={handleRemoveQueueIndex}
                onClearQueue={handleClearQueue}
              />
            </section>

            <aside className="lg:col-span-5 xl:col-span-4 flex flex-col h-[420px] sm:h-[480px] lg:h-full min-h-0 shrink-0 overflow-hidden">
              <ChatPanel
                messages={messages}
                members={members}
                currentUserId={currentUser?.id || ''}
                typingText={typingText}
                soundEnabled={soundEnabled}
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
                onToggleSound={() => setSoundEnabled(!soundEnabled)}
              />
            </aside>
          </main>
        </>
      )}

      {/* STATUS PILL — setStatusMessage 23 jagah call hota tha magar KAHIN render nahi
          hota tha! (isliye "kuch response nahi ata" jaisa lagta tha). Ab sab dikhta hai:
          Connected / Net cut gaya / feedback / load confirmations — sab upar floating. */}
      {statusMessage && (
        <div
          id="status-pill"
          className="fixed top-3.5 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-full bg-black/85 border border-purple-400/40 text-white text-xs font-semibold shadow-2xl shadow-purple-950/50 backdrop-blur-md max-w-[92vw] text-center pointer-events-none"
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
}
