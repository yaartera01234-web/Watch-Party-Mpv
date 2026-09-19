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

/**
 * SLOW-PEER PRIORITY thresholds — SyncplaySocketClient.java ke bilkul barabar
 * (Syncplay reference constants.py / yuroyami SyncDecision.kt).
 * MPV pe pehli priority Java side handle karta hai; web player yahi rule mirror karta hai.
 */
const SLOWDOWN_THRESHOLD = 1.5;   // 1.5s aagay -> khud ko dheema karo
const SLOWDOWN_RESET = 0.1;       // 0.1s ke andar -> normal raftaar
const SLOWDOWN_RATE = 0.95;       // Syncplay standard throttle
const BEHIND_HARD_SEEK = 4.0;     // 4s se zyada peechay -> aakhri chara: seek
const REWIND_THRESHOLD = 4.0;     // 4s se zyada AAGAY -> tez peer khud peechay aaye
const FASTFORWARD_EXTRA = 0.25;

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

  /* ══ READINESS GATE ══════════════════════════════════════════════════
   * Asli Syncplay / yuroyami ka tareeqa: media load hote hi play NAHI karte.
   * Pehle har member buffer kar ke "ready" hota hai, jab SAB tayyar hon
   * tab playback shuru hoti hai. Isi liye wahan sab ek saath start hote hain.
   * MPV FIRST: native buffering signal (paused-for-cache) asal source hai. */
  const [isSelfReady, setIsSelfReady] = useState(false);
  const [waitingForReady, setWaitingForReady] = useState(false);
  /** SLOW-PEER PRIORITY: jab hum tez hain aur 0.95x pe throttle ho rahe hain */
  const [syncSpeedNotice, setSyncSpeedNotice] = useState<string | null>(null);
  const webSpeedChangedRef = useRef(false);
  const rewindNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentReadyRef = useRef<boolean | null>(null);
  const readyGateRef = useRef(false);
  const readyGateStartRef = useRef(0);
  const isLoaderRef = useRef(false);
  const isSelfReadyRef = useRef(false);
  // Native MPV ne file khol li (duration mil gayi) aur cache-buffering band hai
  const nativeMediaOpenRef = useRef(false);
  const nativeBufferingRef = useRef(false);
  // Helpers apni definition se pehle call hote hain — refs mein rakho
  const broadcastCommandRef = useRef<((action: string, extra?: Record<string, any>) => void) | null>(null);
  const showStatusRef = useRef<((msg: string, ms?: number) => void) | null>(null);
  const getNativeBridgeRef = useRef<(() => any) | null>(null);
  const publishReadyRef = useRef<((ready: boolean, force?: boolean) => void) | null>(null);
  const publishFileRef = useRef<((url: string, duration?: number) => void) | null>(null);
  const lastFileKeyRef = useRef<string | null>(null);
  const nativeDurationRef = useRef(0);
  const currentMediaRef = useRef<MediaItem | null>(null);

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

  // SYNC FIX: Syncplay server har ~1s pe State poochta hai aur uska ACK
  // hamesha ASAL live position leke jana chahiye. Pehle ye 10s ka tha —
  // yaani 10 second tak native layer purani (stale) position ACK karta tha
  // aur server ka min(watchers) poore room ko peeche kheench leta tha.
  // Ab har 500ms pe asli <video>/MPV position native layer ko feed hoti hai.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => {
      try {
        const c = clientRef.current;
        if (!c) return;
        // Asal live position DOM se lo — React state ek tick peeche hota hai
        let pos = currentTime;
        let paused = !isPlaying;
        const v = typeof document !== 'undefined'
          ? (document.querySelector('video') as HTMLVideoElement | null)
          : null;
        if (v && Number.isFinite(v.duration) && v.duration > 0) {
          pos = v.currentTime || 0;
          paused = v.paused;
          c.setHasWebMedia(true);
        } else {
          c.setHasWebMedia(false);
        }
        c.setPlaybackState(pos, paused);
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(t);
  }, [joined, currentTime, isPlaying]);

  /** Status pill ko dikhao ms ke liye — nayi call purani timer cancel karti hai */
  const showStatus = useCallback((msg: string, ms = 3000) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), ms);
  }, []);

  // Gate helpers inhein apni definition se pehle call karte hain — refs sync
  useEffect(() => { showStatusRef.current = showStatus; }, [showStatus]);
  useEffect(() => { isSelfReadyRef.current = isSelfReady; }, [isSelfReady]);
  useEffect(() => { currentMediaRef.current = currentMedia; }, [currentMedia]);

  /**
   * SLOW-PEER PRIORITY (web player mirror of SyncplaySocketClient.java).
   *
   * Syncplay server ka room position = SAB SE PEECHAY wale peer ki position
   * (server.py Room.getPosition -> min(watchers)). To agar hum room se aagay
   * hain, iska matlab hum hi tez hain — apni raftaar 0.95x karo taake peechay
   * wala bina dobara buffer kiye barabar aa jaye. Peechay wale peer ko kabhi
   * aagay mat kheencho, siwaye us waqt jab gap 4s se bhi zyada ho jaye.
   */
  const applyWebSlowPeerRule = useCallback((roomPos: number, paused: boolean) => {
    try {
      // Agar native MPV hi video chala raha hai to Java side (SyncplaySocketClient)
      // ye faisla karta hai — web ko haath na lagao. Sirf bridge ka hona kaafi nahi,
      // kyunke Android app web player bhi chala sakti hai jahan bridge to maujood hai
      // magar MPV band hai. Asal signal: MPV ne file kholi hai ya nahi.
      if (nativeMediaOpenRef.current) return;
      const v = typeof document !== 'undefined'
        ? (document.querySelector('video') as HTMLVideoElement | null)
        : null;
      if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
      if (paused || v.paused) {
        if (webSpeedChangedRef.current) {
          v.playbackRate = 1.0;
          webSpeedChangedRef.current = false;
          setSyncSpeedNotice(null);
        }
        return;
      }
      const diff = (v.currentTime || 0) - roomPos;

      if (diff > REWIND_THRESHOLD) {
        // SLOW-PEER PRIORITY ka sab se saaf roop: hum slow peer se 4s+ aagay nikal gaye.
        // 0.95x se itna gap band karne mein ~2 minute lagte — is liye HUM (tez peer)
        // peechay aate hain slow peer ke paas. Slow peer ko chhedte tak nahi.
        try { v.currentTime = roomPos; } catch { /* ignore */ }
        if (webSpeedChangedRef.current) {
          v.playbackRate = 1.0;
          webSpeedChangedRef.current = false;
        }
        setSyncSpeedNotice('⏪ Slow peer ke paas wapas aa rahe hain');
        if (rewindNoticeTimerRef.current) clearTimeout(rewindNoticeTimerRef.current);
        rewindNoticeTimerRef.current = setTimeout(() => setSyncSpeedNotice(null), 2500);
      } else if (diff < -BEHIND_HARD_SEEK) {
        // Last resort: 4s se zyada peechay — ab seek ke bina barabari mumkin nahi
        try { v.currentTime = roomPos + FASTFORWARD_EXTRA; } catch { /* ignore */ }
        if (webSpeedChangedRef.current) {
          v.playbackRate = 1.0;
          webSpeedChangedRef.current = false;
          setSyncSpeedNotice(null);
        }
      } else if (diff > SLOWDOWN_THRESHOLD && !webSpeedChangedRef.current) {
        v.playbackRate = SLOWDOWN_RATE;
        webSpeedChangedRef.current = true;
        setSyncSpeedNotice('🐢 Slow peer ka intezaar — 0.95x');
      } else if (webSpeedChangedRef.current && (Math.abs(diff) < SLOWDOWN_RESET || diff < 0)) {
        // Mil gaye (0.1s ke andar) — ya ab hum hi peechay hain to throttle hatao
        v.playbackRate = 1.0;
        webSpeedChangedRef.current = false;
        setSyncSpeedNotice(null);
      }
    } catch { /* ignore */ }
  }, []);

  // ---- NATIVE MPV helpers ----
  const getNativeBridge = () => {
    try {
      const w = window as any;
      return typeof w.AndroidMpvBridge?.openMpv === 'function' ? w.AndroidMpvBridge : null;
    } catch { return null; }
  };
  getNativeBridgeRef.current = getNativeBridge;

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
        // READINESS (MPV first): duration mil gayi = file khul chuki.
        // 'buffering' = mpv ka paused-for-cache — ye pehle se aa raha tha
        // lekin koi sun nahi raha tha. Yahi asal buffer signal hai.
        if (typeof st.duration === 'number' && st.duration > 0) {
          nativeMediaOpenRef.current = true;
          nativeDurationRef.current = st.duration;
        }
        nativeBufferingRef.current = !!st.buffering;
        setCurrentTime((prev) => {
          // Chhoti drift ignore — warna har 500ms UI render storm
          return Math.abs(prev - pos) > 1.5 ? pos : prev;
        });
        setIsPlaying((prev) => {
          // Gate khula hai to MPV ki apni state ko play mat banne do
          if (readyGateRef.current && !paused) return prev;
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
        // SLOW-PEER PRIORITY: speed events sirf raftaar badalte hain, position nahi.
        // Inhe position/play state pe asar nahi dalne dena, warna seekbar uchhalti hai.
        if (d.action === 'slowdown') {
          setSyncSpeedNotice('🐢 Slow peer ka intezaar — 0.95x');
          return;
        }
        if (d.action === 'speed-reset') {
          setSyncSpeedNotice(null);
          return;
        }
        if (typeof d.position === 'number') setCurrentTime(d.position);
        if (typeof d.paused === 'boolean') {
          // Gate khula ho to remote tick play na kar de
          if (readyGateRef.current && !d.paused) return;
          setIsPlaying(!d.paused);
        }
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
      // READINESS GATE: remote se nayi media aayi — hum bhi PAUSED load karenge
      // aur buffer hote hi "ready" bhejenge. Loader hum nahi hain.
      isLoaderRef.current = false;
      openReadyGate();
      // SLOW-PEER: server ko batao hum bhi yehi file dekh rahe hain (warna min() hamein skip karega)
      lastFileKeyRef.current = null;
      publishFileRef.current?.(active.url, 0);
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

  /* ── READINESS GATE helpers ─────────────────────────────────────── */

  /** Apni readiness server ko batao (sirf jab badle — wire spam se bachao). */
  const publishReady = useCallback((ready: boolean, force = false) => {
    if (!clientRef.current || !currentUser) return;
    if (!force && sentReadyRef.current === ready) return;
    sentReadyRef.current = ready;
    setIsSelfReady(ready);
    // Apni row foran update karo (server echo ka intezaar nahi)
    setMembers((prev) => prev.map((m) => (m.id === currentUser.id ? { ...m, isReady: ready } : m)));
    try {
      clientRef.current.publish('', SyncplayProtocol.ready(currentUser.name, ready));
    } catch { /* ignore */ }
  }, [currentUser]);
  publishReadyRef.current = publishReady;

  /**
   * SLOW-PEER PRIORITY ki buniyad: server ko batao ke hum kaunsi file dekh rahe hain.
   *
   * Server.py ka Room.getPosition() = min(watchers), aur Watcher.__lt__ un watchers ko
   * mukammal nazarandaz karta hai jinki `_file` None ho. Agar hum `Set.file` na bhejein
   * to server hamein kabhi "sab se peechay wala" nahi maan sakta — slow-peer priority
   * kaam hi nahi karegi. Duration player se milte hi dobara bhej dete hain.
   */
  const publishFile = useCallback((url: string, duration = 0) => {
    if (!clientRef.current) return;
    try {
      const label = (() => {
        try {
          const u = new URL(url);
          const last = u.pathname.split('/').filter(Boolean).pop();
          return last || u.hostname;
        } catch { return url.slice(0, 120); }
      })();
      if (lastFileKeyRef.current === `${label}|${Math.round(duration)}`) return;
      lastFileKeyRef.current = `${label}|${Math.round(duration)}`;
      clientRef.current.publish('', SyncplayProtocol.file(label, duration));
    } catch { /* ignore */ }
  }, []);
  publishFileRef.current = publishFile;

  /** Nayi media aayi — gate lagao, sab ko not-ready, PAUSED rakho. */
  const openReadyGate = useCallback(() => {
    readyGateRef.current = true;
    readyGateStartRef.current = Date.now();
    setWaitingForReady(true);
    setIsPlaying(false);          // ← asal fix: foran play NAHI
    sentReadyRef.current = null;  // agli publish force ho
    setIsSelfReady(false);
    setMembers((prev) => prev.map((m) => ({ ...m, isReady: false })));
  }, []);

  /** Sab tayyar — gate kholo aur chalao. Sirf loader room ko play bhejta hai. */
  const closeReadyGateAndPlay = useCallback((byLoader: boolean) => {
    if (!readyGateRef.current) return;
    readyGateRef.current = false;
    setWaitingForReady(false);
    if (byLoader) {
      // Loader hi State bhejta hai — warna sab ek saath bhejte aur server par toofan
      setIsPlaying(true);
      broadcastCommandRef.current?.('play', { time: 0 });
      showStatusRef.current?.('▶️ Sab tayyar — playback shuru!', 2500);
    }
  }, []);

  /* ── BUFFER DETECT: apni ready-state bhejo ──
   * MPV FIRST: native khud 'paused-for-cache' (asal buffering signal) deta hai —
   * duration mil gayi AUR cache-buffering band = sach much tayyar.
   * Web player: <video> ka readyState >= 3 (HAVE_FUTURE_DATA). */
  useEffect(() => {
    if (!joined || !waitingForReady) return;
    const check = () => {
      let bufferedEnough = false;
      try {
        if (nativeMediaOpenRef.current) {
          // MPV FIRST: native ne file khol li — ab sirf cache-buffering dekhni hai
          bufferedEnough = !nativeBufferingRef.current;
          // SLOW-PEER: duration mil gayi to file dobara register karo (ab sahi duration ke saath)
          if (nativeDurationRef.current > 0) {
            publishFileRef.current?.(currentMediaRef.current?.url || '', nativeDurationRef.current);
          }
        } else {
          const v = document.querySelector('video') as HTMLVideoElement | null;
          if (v) {
            bufferedEnough = v.readyState >= 3;
            if (Number.isFinite(v.duration) && v.duration > 0) {
              publishFileRef.current?.(currentMediaRef.current?.url || '', v.duration);
            }
          } else {
            bufferedEnough = Date.now() - readyGateStartRef.current > 2500; // YouTube iframe/audio
          }
        }
      } catch { /* ignore */ }
      if (bufferedEnough) publishReady(true);
    };
    check();
    const t = setInterval(check, 400);
    return () => clearInterval(t);
  }, [joined, waitingForReady, publishReady]);

  /* ── SAB READY? to chalao. 12s safety timeout — koi atke to bhi chalein. */
  useEffect(() => {
    if (!waitingForReady) return;
    const everyoneReady = members.length > 0 && members.every((m) => m.isReady === true);
    if (everyoneReady) {
      closeReadyGateAndPlay(isLoaderRef.current);
      return;
    }
    const t = setInterval(() => {
      if (Date.now() - readyGateStartRef.current > 12000) {
        const waiting = members.filter((m) => m.isReady !== true).map((m) => m.name);
        if (waiting.length) showStatus(`⚠️ ${waiting.join(', ')} ka intezaar khatam — chala rahe hain`, 3000);
        closeReadyGateAndPlay(isLoaderRef.current);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [waitingForReady, members, closeReadyGateAndPlay, showStatus]);

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
              // Server ki List mein bhi isReady aata hai
              const rowReady = (roomData as any)?.[n]?.isReady;
              return {
                id: 'sp_' + n,
                name: n,
                color: COLORS[hash % COLORS.length],
                avatar: av,
                ts: Date.now(),
                isReady: typeof rowReady === 'boolean' ? rowReady : undefined,
              };
            });
          // READINESS: List har 5s aati hai — jahan server ne isReady na bheja ho
          // wahan purani maloom readiness barqarar rakho, warna 🟢 blink karta hai
          setMembers((prev) => {
            const prevReady = new Map(prev.map((m) => [m.name, m.isReady]));
            const merged = others.map((o) =>
              o.isReady === undefined && prevReady.has(o.name)
                ? { ...o, isReady: prevReady.get(o.name) }
                : o,
            );
            return [{ ...user, isReady: sentReadyRef.current ?? undefined }, ...merged];
          });
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
          // SLOW-PEER PRIORITY: har playstate tick pe (apni echo bhi) raftaar ka faisla karo.
          // roomPosition = sab se peechay wale peer ki position, is liye ye har tick pe
          // sach batati hai ke hum aagay hain ya peechay. Position ko haath nahi lagate.
          if (typeof ps.position === 'number' && !ps.doSeek) {
            applyWebSlowPeerRule(ps.position, !!ps.paused);
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

        // --- READINESS: kisi member ne apni ready/not-ready state batayi ---
        if (msg && msg.Set && msg.Set.ready) {
          const r = msg.Set.ready;
          const who = r.username;
          // Server join par {isReady: null} bhejta hai = "abhi bataya hi nahi".
          // Ise false mat samjho warna (a) chat spam hota hai aur (b) jo pehle
          // se ready tha wo null aate hi dobara not-ready ho jata hai.
          const rdy: boolean | undefined = typeof r.isReady === 'boolean' ? r.isReady : undefined;
          if (who) {
            setMembers((prev) => prev.map((m) =>
              m.name === who ? { ...m, isReady: rdy === undefined ? m.isReady : rdy } : m,
            ));
            if (who !== user.name && rdy !== undefined) {
              setMessages((prev) => [...prev, {
                id: generateMid(), senderId: 'system', name: 'System', color: '#38bdf8',
                text: rdy ? `✅ ${who} tayyar hai` : `⏳ ${who} abhi load kar raha hai...`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isSystem: true,
              }]);
            }
          }
        }
        // Set.user payload mein bhi isReady aa sakta hai (join/leave ke saath)
        if (msg && msg.Set && msg.Set.user && typeof msg.Set.user === 'object') {
          for (const [uname, info] of Object.entries<any>(msg.Set.user)) {
            if (info && typeof info.isReady === 'boolean') {
              setMembers((prev) => prev.map((m) => (m.name === uname ? { ...m, isReady: info.isReady } : m)));
            }
          }
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
      // READINESS: reconnect par apni state dobara advertise karo
      sentReadyRef.current = null;
      if (currentMedia) publishReadyRef.current?.(isSelfReadyRef.current, true);
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
      // READINESS GATE: remote load bhi PAUSED — buffer ho kar ready bhejenge
      isLoaderRef.current = false;
      openReadyGate();
      // SLOW-PEER: is file ko apne naam se server par register karo
      lastFileKeyRef.current = null;
      publishFileRef.current?.(cmd.media.url, 0);
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
      // Loader ka play-signal = sab ready the, is liye gate bhi band karo
      // (warna waiting banner atka reh jata hai)
      if (readyGateRef.current) {
        readyGateRef.current = false;
        setWaitingForReady(false);
      }
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
    // READINESS GATE: load hamesha PAUSED @0. Pehle yahan paused=false tha, jis se
    // peer foran chal parta aur phir gate use rokta — yani play/pause flicker.
    // Asli Syncplay bhi load par paused hi bhejta hai.
    else if (action === 'load') { paused = true; doSeek = true; }
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
  broadcastCommandRef.current = broadcastCommand;

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
    // READINESS GATE: pehle yahan setIsPlaying(true) tha — link paste karte hi
    // dono taraf foran play shuru ho jati thi aur slow-net wala peeche reh jata.
    // Ab asli Syncplay ki tarah PAUSED load hoti hai, sab ready hon tab chalti hai.
    isLoaderRef.current = true;
    openReadyGate();
    // SLOW-PEER: file server par register karo — is ke baghair room position
    // kabhi slow peer ki nahi hogi (server.py Watcher.__lt__ _file None ko skip karta hai)
    lastFileKeyRef.current = null;
    publishFileRef.current?.(item.url, 0);
    // INPUT CLEAR MAT KARO — user ka link wahi rahega taake dobara Play dabane se re-play ho
    // (pehle yahan setUrlInput('') tha isliye 2nd press pe "pehle link paste karo" ata tha)

    const newQueue = [item];
    setQueue(newQueue);
    setQueueIndex(0);

    openInNativeMpv(parsed.cleanUrl, true); // force: same link ka re-play bhi chale

    broadcastCommand('load', { media: item, time: 0 });
    syncQueueToRoom(newQueue, 0);
    showStatus('⏳ Load ho rahi hai — sab ke tayyar hone ka intezaar...', 3000);
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
    // READINESS: gate ki saari state saaf karo
    readyGateRef.current = false;
    sentReadyRef.current = null;
    isLoaderRef.current = false;
    nativeMediaOpenRef.current = false;
    nativeDurationRef.current = 0;
    lastFileKeyRef.current = null;
    nativeBufferingRef.current = false;
    setWaitingForReady(false);
    setIsSelfReady(false);
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
                waitingForReady={waitingForReady}
                isSelfReady={isSelfReady}
                onToggleReady={() => publishReady(!isSelfReady, true)}
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

      {/* SLOW-PEER PRIORITY indicator — jab hum tez hain aur 0.95x pe throttle hain */}
      {syncSpeedNotice && joined && (
        <div
          id="sync-speed-pill"
          className="fixed bottom-3.5 left-1/2 -translate-x-1/2 z-[998] px-3 py-1.5 rounded-full bg-amber-950/85 border border-amber-400/40 text-amber-100 text-[11px] font-semibold shadow-xl backdrop-blur-md pointer-events-none"
        >
          {syncSpeedNotice}
        </div>
      )}
    </div>
  );
}
