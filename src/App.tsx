import React, { useState, useEffect, useRef, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';
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

import { Navbar } from './components/Navbar';
import { VideoPlayer } from './components/VideoPlayer';
import { PlaylistQueue } from './components/PlaylistQueue';
import { ChatPanel } from './components/ChatPanel';
import { JoinModal } from './components/JoinModal';
import { MpvModal } from './components/MpvModal';
import { InstallAppModal } from './components/InstallAppModal';
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
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // In-App MPV Engine Settings
  const [brightness, setBrightness] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState('contain');
  const [audioBoost, setAudioBoost] = useState(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // MQTT Client ref & deduplication
  const clientRef = useRef<MqttClient | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Load saved preferences & URL room param
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

  // Connect to MQTT Broker when user joins
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

    try {
      localStorage.setItem('wp_prefs', JSON.stringify({
        name: user.name,
        room: cleanRoom,
        broker: brokerIdx,
      }));
    } catch {
      // ignore
    }

    connectMqtt(user, cleanRoom, brokerIdx);
  };

  const connectMqtt = (user: User, room: string, brokerIdx: number) => {
    if (clientRef.current) {
      try {
        clientRef.current.end(true);
      } catch {
        // ignore
      }
    }

    const broker = BROKERS[brokerIdx] || BROKERS[0];
    const ns = broker.roomNamespace ? `${broker.roomNamespace}/` : '';
    const roomTopic = `${ROOM_PREFIX}${ns}${room}`;
    const topics = {
      cmd: `${roomTopic}/cmd`,
      state: `${roomTopic}/state`,
      queue: `${roomTopic}/queue`,
      chat: `${roomTopic}/chat`,
      events: `${roomTopic}/events`,
      members: `${roomTopic}/members/+`,
      typing: `${roomTopic}/typing/+`,
    };

    try {
      const client = mqtt.connect(broker.url, {
        clientId: `wp_${user.id}_${Math.random().toString(36).slice(2, 6)}`,
        clean: true,
        connectTimeout: 9000,
        reconnectPeriod: 3000,
        will: {
          topic: `${roomTopic}/members/${user.id}`,
          payload: '',
          qos: 1,
          retain: true,
        },
      });

      clientRef.current = client;

      client.on('connect', () => {
        setStatusMessage(`Connected to ${broker.name} (Port ${broker.serverPort || 8999})`);
        setTimeout(() => setStatusMessage(null), 3500);

        // Subscribe to all room channels
        client.subscribe(Object.values(topics), { qos: 1 });

        // Publish own presence
        client.publish(
          `${roomTopic}/members/${user.id}`,
          JSON.stringify({ ...user, ts: Date.now() }),
          { qos: 1, retain: true }
        );

        // Announce join event
        client.publish(
          topics.events,
          JSON.stringify({
            type: 'join',
            name: user.name,
            from: user.id,
            mid: generateMid(),
          }),
          { qos: 1 }
        );

        if (soundEnabled) playJoinTune();
        confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
      });

      client.on('message', (topic, payload) => {
        try {
          const str = payload.toString();
          if (!str && topic.startsWith(`${roomTopic}/members/`)) {
            // User left
            const departedId = topic.slice(`${roomTopic}/members/`.length);
            setMembers((prev) => {
              const departed = prev.find((m) => m.id === departedId);
              if (departed && departed.id !== user.id) {
                if (soundEnabled) playLeaveTune();
                setMessages((mPrev) => [
                  ...mPrev,
                  {
                    id: generateMid(),
                    senderId: 'system',
                    name: 'System',
                    color: '#f59e0b',
                    text: `${departed.name} left the room 👋`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isSystem: true,
                  },
                ]);
              }
              return prev.filter((m) => m.id !== departedId);
            });
            return;
          }

          const data = JSON.parse(str);

          // Handle Members presence
          if (topic.startsWith(`${roomTopic}/members/`)) {
            if (data && data.name) {
              setMembers((prev) => {
                const idx = prev.findIndex((m) => m.id === data.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = data;
                  return copy;
                }
                return [...prev, data];
              });
            }
          }

          // Handle Commands
          else if (topic === topics.cmd) {
            if (data.from === user.id || isDuplicate(data.mid)) return;
            handleRemoteCommand(data);
          }

          // Handle Retained State (Late Joiner Sync)
          else if (topic === topics.state) {
            if (isDuplicate(data.mid)) return;
            handleRemoteState(data);
          }

          // Handle Queue Sync
          else if (topic === topics.queue) {
            if (Array.isArray(data.items)) {
              setQueue(data.items);
              if (data.index !== undefined) setQueueIndex(data.index);
            }
          }

          // Handle Chat messages
          else if (topic === topics.chat) {
            if (isDuplicate(data.id)) return;
            setMessages((prev) => [...prev, data]);
            if (data.senderId !== user.id) {
              if (soundEnabled) {
                playMsgTune();
              }
              // Native Web Notification if user is on another tab/app
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
                try {
                  new Notification(`${data.name} (Watch Party)`, {
                    body: data.text,
                    tag: 'wp-chat-msg',
                  });
                } catch {
                  // ignore
                }
              }
            }
          }

          // Handle Events (e.g. Join or Reaction)
          else if (topic === topics.events) {
            if (isDuplicate(data.mid)) return;
            if (data.type === 'join' && data.from !== user.id) {
              if (soundEnabled) playJoinTune();
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMid(),
                  senderId: 'system',
                  name: 'System',
                  color: '#10b981',
                  text: `${data.name} joined the party 🎉`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  isSystem: true,
                },
              ]);
            } else if (data.type === 'reaction') {
              triggerLocalReaction(data.emoji, data.senderName, data.x);
            }
          }

          // Handle Typing indicators
          else if (topic.startsWith(`${roomTopic}/typing/`)) {
            const senderId = topic.slice(`${roomTopic}/typing/`.length);
            if (senderId === user.id) return;
            if (data && data.name) {
              setTypingText(`${data.name} is typing...`);
              if (typingTimersRef.current.has(senderId)) {
                clearTimeout(typingTimersRef.current.get(senderId));
              }
              const timeout = setTimeout(() => {
                setTypingText(null);
                typingTimersRef.current.delete(senderId);
              }, 2500);
              typingTimersRef.current.set(senderId, timeout);
            }
          }
        } catch {
          // ignore parse errors
        }
      });
    } catch {
      setStatusMessage('Connection failed. Please choose another broker.');
    }
  };

  // Heartbeat presence interval
  useEffect(() => {
    if (!joined || !currentUser || !clientRef.current) return;
    const interval = setInterval(() => {
      if (clientRef.current?.connected) {
        const topic = `${ROOM_PREFIX}${roomName}/members/${currentUser.id}`;
        clientRef.current.publish(
          topic,
          JSON.stringify({ ...currentUser, ts: Date.now() }),
          { qos: 1, retain: true }
        );
      }
    }, 25000);
    return () => clearInterval(interval);
  }, [joined, currentUser, roomName]);

  // Periodic Host Sync Heartbeat (keeps all room members in perfect sync)
  useEffect(() => {
    if (!joined || !currentUser || !clientRef.current || !isPlaying || !currentMedia) return;

    // Check if currentUser is the room host (first member by join time)
    const sortedMembers = [...members].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const isHost = sortedMembers.length === 0 || sortedMembers[0]?.id === currentUser.id;

    if (!isHost) return;

    const interval = setInterval(() => {
      if (clientRef.current?.connected && isPlaying) {
        const stateTopic = `${ROOM_PREFIX}${roomName}/state`;
        const state: PlaybackState = {
          type: currentMedia.type,
          url: currentMedia.url,
          videoId: currentMedia.videoId,
          time: currentTime,
          playing: isPlaying,
          speed: playbackSpeed,
          at: Date.now(),
        };
        clientRef.current.publish(stateTopic, JSON.stringify(state), { qos: 1, retain: true });
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [joined, currentUser, roomName, isPlaying, currentMedia, currentTime, playbackSpeed, members]);

  // Handle remote video commands
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

    // Only update media if different to prevent re-initializing player
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

    // Seamlessly correct drift if > 2.5s
    setCurrentTime((prev) => {
      if (Math.abs(prev - targetTime) > 2.5) {
        return targetTime;
      }
      return prev;
    });

    setIsPlaying(state.playing);
  };

  // Broadcast Commands
  const broadcastCommand = (action: string, extra: Record<string, any> = {}) => {
    if (!clientRef.current || !currentUser) return;
    const cmdTopic = `${ROOM_PREFIX}${roomName}/cmd`;
    const payload = {
      action,
      from: currentUser.id,
      by: currentUser.name,
      mid: generateMid(),
      ...extra,
    };
    clientRef.current.publish(cmdTopic, JSON.stringify(payload), { qos: 1 });

    // Update retained state
    if (action === 'play' || action === 'pause' || action === 'seek' || action === 'load') {
      const stateTopic = `${ROOM_PREFIX}${roomName}/state`;
      const state: PlaybackState = {
        type: currentMedia?.type || 'none',
        url: currentMedia?.url || '',
        videoId: currentMedia?.videoId,
        time: extra.time !== undefined ? extra.time : currentTime,
        playing: action === 'play' ? true : action === 'pause' ? false : isPlaying,
        speed: 1,
        at: Date.now(),
      };
      clientRef.current.publish(stateTopic, JSON.stringify(state), { qos: 1, retain: true });
    }
  };

  // User Actions
  const handleLoadMedia = () => {
    if (!urlInput.trim()) return;
    const parsed = parseMediaUrl(urlInput);
    if (parsed.type === 'none') return;

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
    setUrlInput('');

    // Update Queue
    const newQueue = [item];
    setQueue(newQueue);
    setQueueIndex(0);

    // Broadcast
    broadcastCommand('load', { media: item, time: 0 });
    if (clientRef.current) {
      clientRef.current.publish(
        `${ROOM_PREFIX}${roomName}/queue`,
        JSON.stringify({ items: newQueue, index: 0, lastAdvance: Date.now() }),
        { qos: 1, retain: true }
      );
    }
  };

  const handleAddToQueue = () => {
    if (!urlInput.trim()) return;
    const parsed = parseMediaUrl(urlInput);
    if (parsed.type === 'none') return;

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
    }

    setQueue(newQueue);
    setQueueIndex(newIndex);
    setUrlInput('');

    if (clientRef.current) {
      clientRef.current.publish(
        `${ROOM_PREFIX}${roomName}/queue`,
        JSON.stringify({ items: newQueue, index: newIndex, lastAdvance: Date.now() }),
        { qos: 1, retain: true }
      );
    }

    setMessages((prev) => [
      ...prev,
      {
        id: generateMid(),
        senderId: 'system',
        name: 'System',
        color: '#c084fc',
        text: `➕ ${currentUser?.name} added to queue: ${item.label}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSystem: true,
      },
    ]);
  };

  const handlePlayQueueIndex = (index: number) => {
    if (index < 0 || index >= queue.length) return;
    const item = queue[index];
    setQueueIndex(index);
    setCurrentMedia(item);
    setCurrentTime(0);
    setIsPlaying(true);
    broadcastCommand('load', { media: item, time: 0 });

    if (clientRef.current) {
      clientRef.current.publish(
        `${ROOM_PREFIX}${roomName}/queue`,
        JSON.stringify({ items: queue, index, lastAdvance: Date.now() }),
        { qos: 1, retain: true }
      );
    }
  };

  const handleRemoveQueueIndex = (index: number) => {
    const updated = queue.filter((_, i) => i !== index);
    let nextIndex = queueIndex;
    if (index <= queueIndex) {
      nextIndex = Math.max(0, queueIndex - 1);
    }
    setQueue(updated);
    setQueueIndex(nextIndex);

    if (clientRef.current) {
      clientRef.current.publish(
        `${ROOM_PREFIX}${roomName}/queue`,
        JSON.stringify({ items: updated, index: nextIndex, lastAdvance: Date.now() }),
        { qos: 1, retain: true }
      );
    }
  };

  const handleClearQueue = () => {
    setQueue([]);
    setQueueIndex(-1);
    if (clientRef.current) {
      clientRef.current.publish(
        `${ROOM_PREFIX}${roomName}/queue`,
        JSON.stringify({ items: [], index: -1, lastAdvance: Date.now() }),
        { qos: 1, retain: true }
      );
    }
  };

  const handleMediaEnd = () => {
    if (queue.length > 0 && queueIndex + 1 < queue.length) {
      handlePlayQueueIndex(queueIndex + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const handleForceSync = () => {
    if (!currentMedia) return;
    broadcastCommand('sync', { time: currentTime, playing: isPlaying });
  };

  const handleSwitchBroker = (newBrokerIdx: number) => {
    if (newBrokerIdx === brokerId || !currentUser) return;
    setBrokerId(newBrokerIdx);
    const targetBroker = BROKERS[newBrokerIdx] || BROKERS[0];
    setStatusMessage(`Connecting to ${targetBroker.name} (Port ${targetBroker.serverPort || 8999})...`);
    try {
      const saved = localStorage.getItem('wp_prefs');
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem('wp_prefs', JSON.stringify({ ...parsed, broker: newBrokerIdx }));
    } catch {
      // ignore
    }
    connectMqtt(currentUser, roomName, newBrokerIdx);
  };

  // Chat send
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
    clientRef.current.publish(`${ROOM_PREFIX}${roomName}/chat`, JSON.stringify(msg), { qos: 1 });
  };

  const handleTyping = () => {
    if (!currentUser || !clientRef.current) return;
    const topic = `${ROOM_PREFIX}${roomName}/typing/${currentUser.id}`;
    clientRef.current.publish(topic, JSON.stringify({ name: currentUser.name }), { qos: 0 });
  };

  // Reactions
  const handleSendReaction = (emoji: string) => {
    if (!currentUser || !clientRef.current) return;
    const x = Math.floor(Math.random() * 80) + 10;
    triggerLocalReaction(emoji, currentUser.name, x);

    const event = {
      type: 'reaction',
      emoji,
      senderName: currentUser.name,
      x,
      mid: generateMid(),
    };
    clientRef.current.publish(`${ROOM_PREFIX}${roomName}/events`, JSON.stringify(event), { qos: 1 });
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
    if (clientRef.current && currentUser) {
      const willTopic = `${ROOM_PREFIX}${roomName}/members/${currentUser.id}`;
      clientRef.current.publish(willTopic, '', { qos: 1, retain: true });
      clientRef.current.end(true);
    }
    setJoined(false);
    setCurrentUser(null);
    setMessages([]);
    setMembers([]);
    setQueue([]);
    setCurrentMedia(null);
  };

  return (
    <div id="app-root" className="min-h-screen flex flex-col bg-[#0a0815] text-white selection:bg-purple-600 selection:text-white overflow-hidden">
      {/* Join Screen Modal */}
      {!joined && (
        <JoinModal
          initialRoom={roomName}
          brokers={BROKERS}
          onJoin={handleJoinParty}
          onOpenInstallModal={() => setIsInstallModalOpen(true)}
        />
      )}

      {/* MPV Built-In Player Hub & Control Center */}
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

      {/* Android PWA / APK Guide Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Main App Layout */}
      {joined && (
        <>
          {/* Top Navbar */}
          <Navbar
            roomName={roomName}
            onlineCount={members.length}
            currentUser={currentUser}
            brokerName={BROKERS[brokerId]?.badge || BROKERS[brokerId]?.name || 'Port 8999'}
            onOpenMpv={() => setIsMpvModalOpen(true)}
            onOpenInstallModal={() => setIsInstallModalOpen(true)}
            onSyncAll={handleForceSync}
            onLeaveRoom={handleLeaveRoom}
          />

          {/* Body Content: Grid Layout */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-h-0 overflow-y-auto lg:overflow-hidden">
            {/* Left Side: Video Player, URL Bar, Playlist Queue (col-span-7 or 8) */}
            <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 min-h-0 overflow-y-visible lg:overflow-y-auto no-scrollbar">
              {/* URL Input Bar */}
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
                    <span>Play Sab Ke Liye</span>
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

              {/* Video Player Viewport */}
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

              {/* Playlist & Queue Component */}
              <PlaylistQueue
                items={queue}
                currentIndex={queueIndex}
                onPlayIndex={handlePlayQueueIndex}
                onRemoveIndex={handleRemoveQueueIndex}
                onClearQueue={handleClearQueue}
              />
            </section>

            {/* Right Side: Live Chat, Active Members (col-span-5 or 4) */}
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
    </div>
  );
}
