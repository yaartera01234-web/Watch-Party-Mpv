export type MediaType = 'youtube' | 'mp4' | 'mp3' | 'hls' | 'none';

export interface AvatarData {
  type: 'letter' | 'upload' | 'dicebear';
  data?: string;
  url?: string;
}

export interface User {
  id: string;
  name: string;
  color: string;
  avatar: AvatarData;
  ts: number;
}

export interface MediaItem {
  type: MediaType;
  url: string;
  videoId?: string;
  label: string;
  by: string;
  addedAt?: number;
}

export interface PlaybackState {
  type: MediaType;
  url: string;
  videoId?: string;
  time: number;
  playing: boolean;
  speed: number;
  at: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  name: string;
  color: string;
  text: string;
  reply?: {
    name: string;
    text: string;
  } | null;
  time: string;
  isSystem?: boolean;
}

export interface ReactionEvent {
  id: string;
  emoji: string;
  senderName: string;
  x: number; // percentage across container (10 - 90)
}

export interface BrokerOption {
  id: number;
  name: string;
  label: string;
  url: string;
  serverHost?: string;
  serverPort?: number;
  roomNamespace?: string;
  badge?: string;
  region?: string;
}

export interface QueueState {
  items: MediaItem[];
  index: number;
  lastAdvance: number;
}
