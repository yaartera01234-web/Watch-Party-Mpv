export type SyncplayEvent = 'connect' | 'message' | 'error' | 'disconnect' | 'reconnecting';

export type SyncplayRoomConfig = { host: string; port: number; room: string; username: string; password?: string };

type BrowserWindow = Window & typeof globalThis & { AndroidSyncplayBridge?: any };

/**
 * Syncplay client with AUTO-RECONNECT.
 *
 * Slow net / WiFi-4G switch / temporary cut hone par:
 *   - 'disconnect' (ya native 'error') aate hi backoff ke saath dobara connect karta hai
 *   - Delay: 2s -> 3.2s -> 5.1s -> ... (max 30s), max 15 koshishein (~6-7 minute)
 *   - Manual end() ya successful connect ke baad timers reset
 */
export class SyncplayClient {
  public connected = false;
  private listeners = new Map<SyncplayEvent, Set<Function>>();
  private androidBridge?: any;
  private roomConfig: SyncplayRoomConfig;
  private handlers: Array<[string, EventListener]> = [];

  // Reconnect engine
  private manualClose = true;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 15;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SyncplayRoomConfig) {
    this.roomConfig = config;
    const win = typeof window !== 'undefined' ? window as BrowserWindow : undefined;
    this.androidBridge = win?.AndroidSyncplayBridge;
    if (typeof window !== 'undefined') {
      const bind = (name: string, event: SyncplayEvent) => {
        // NOTE: inner param MUST NOT be named `event` — it would shadow the
        // SyncplayEvent string above and silently break all .on() callbacks.
        const handler: EventListener = (domEvent) => {
          const detail = (domEvent as CustomEvent<string>).detail || '';
          if (domEvent.type === 'syncplay-connected') {
            this.connected = true;
            this.clearReconnect(); // kamyab connect = backoff reset
          }
          if (domEvent.type === 'syncplay-disconnected' || domEvent.type === 'syncplay-error') {
            const wasConnected = this.connected;
            this.connected = false;
            this.emit(event, detail);
            // Auto-reconnect sirf tab jab manual band na kiya ho
            if (!this.manualClose) {
              // error tab bhi retry karo jab pehle connected thay ya bridge mojood hai
              const bridgeAvailable = typeof this.getBridge()?.connect === 'function';
              if (event === 'disconnect' || (wasConnected || bridgeAvailable)) {
                this.scheduleReconnect();
              }
            }
            return;
          }
          this.emit(event, detail);
        };
        window.addEventListener(name, handler);
        this.handlers.push([name, handler]);
      };
      bind('syncplay-connected', 'connect');
      bind('syncplay-message', 'message');
      bind('syncplay-error', 'error');
      bind('syncplay-disconnected', 'disconnect');
    }
  }

  private getBridge(): any {
    return this.androidBridge || (typeof window !== 'undefined' ? (window as BrowserWindow).AndroidSyncplayBridge : undefined);
  }

  private clearReconnect() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Auto-reconnect bhi na kar saka — net check kar ke dobara join karein.'));
      return;
    }
    // Exponential backoff: 2s, 3.2s, 5.1s, 8.2s, 13s, 21s, 30s, 30s...
    const delay = Math.min(30000, Math.round(2000 * Math.pow(1.6, this.reconnectAttempts)));
    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts, delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualClose) return;
      try {
        this.connectInternal();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  setAndroidBridge(bridge: any) { this.androidBridge = bridge; }
  on(event: SyncplayEvent, cb: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }
  emit(event: SyncplayEvent, ...args: any[]) { for (const cb of this.listeners.get(event) ?? []) cb(...args); }

  private connectInternal() {
    const bridge = this.getBridge();
    if (!bridge || typeof bridge.connect !== 'function') {
      this.connected = false;
      this.emit('error', new Error('Native Syncplay bridge is unavailable.'));
      return false;
    }
    this.connected = false;
    bridge.connect(this.roomConfig.host, this.roomConfig.port, this.roomConfig.room, this.roomConfig.username, this.roomConfig.password ?? '');
    return true;
  }

  connect() {
    this.manualClose = false; // fresh/manual connect -> reconnect engine arm
    this.connectInternal();
    return this;
  }

  setPlaybackState(position: number, paused: boolean) {
    const bridge = this.getBridge();
    if (bridge && typeof bridge.setPlaybackState === 'function') bridge.setPlaybackState(position, paused);
    return this;
  }

  subscribe(_topics: string[] | string, _opts?: any) { return this; }
  publish(_topic: string, payload: string, _opts?: any) {
    const bridge = this.getBridge();
    if (bridge && typeof bridge.sendMessage === 'function') bridge.sendMessage('', payload);
    return this;
  }
  end(_force?: boolean) {
    this.manualClose = true; // auto-reconnect BAND
    this.clearReconnect();
    const bridge = this.getBridge();
    if (bridge && typeof bridge.disconnect === 'function') bridge.disconnect();
    this.connected = false;
    if (typeof window !== 'undefined') {
      for (const [name, handler] of this.handlers) window.removeEventListener(name, handler);
    }
    this.handlers = [];
    return this;
  }
}

export function makeSyncplayClient(host: string, port: number, room: string, username: string, password?: string) {
  return new SyncplayClient({ host, port, room, username, password });
}
