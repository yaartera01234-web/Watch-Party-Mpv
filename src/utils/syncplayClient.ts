export type SyncplayEvent = 'connect' | 'message' | 'error' | 'disconnect';

export type SyncplayRoomConfig = { host: string; port: number; room: string; username: string; password?: string };

type BrowserWindow = Window & typeof globalThis & { AndroidSyncplayBridge?: any };

export class SyncplayClient {
  public connected = false;
  private listeners = new Map<SyncplayEvent, Set<Function>>();
  private androidBridge?: any;
  private roomConfig: SyncplayRoomConfig;
  private handlers: Array<[string, EventListener]> = [];

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
          if (domEvent.type === 'syncplay-connected') this.connected = true;
          if (domEvent.type === 'syncplay-disconnected' || domEvent.type === 'syncplay-error') this.connected = false;
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

  setAndroidBridge(bridge: any) { this.androidBridge = bridge; }
  on(event: SyncplayEvent, cb: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }
  emit(event: SyncplayEvent, ...args: any[]) { for (const cb of this.listeners.get(event) ?? []) cb(...args); }

  connect() {
    const bridge = this.androidBridge || (typeof window !== 'undefined' ? (window as BrowserWindow).AndroidSyncplayBridge : undefined);
    if (!bridge || typeof bridge.connect !== 'function') {
      this.connected = false;
      this.emit('error', new Error('Native Syncplay bridge is unavailable.'));
      return this;
    }
    this.connected = false;
    bridge.connect(this.roomConfig.host, this.roomConfig.port, this.roomConfig.room, this.roomConfig.username, this.roomConfig.password ?? '');
    return this;
  }

  subscribe(_topics: string[] | string, _opts?: any) { return this; }
  publish(_topic: string, payload: string, _opts?: any) {
    const bridge = this.androidBridge || (typeof window !== 'undefined' ? (window as BrowserWindow).AndroidSyncplayBridge : undefined);
    if (bridge && typeof bridge.sendMessage === 'function') bridge.sendMessage('', payload);
    return this;
  }
  end(_force?: boolean) {
    const bridge = this.androidBridge || (typeof window !== 'undefined' ? (window as BrowserWindow).AndroidSyncplayBridge : undefined);
    if (bridge && typeof bridge.disconnect === 'function') bridge.disconnect();
    this.connected = false;
    for (const [name, handler] of this.handlers) window.removeEventListener(name, handler);
    this.handlers = [];
    return this;
  }
}

export function makeSyncplayClient(host: string, port: number, room: string, username: string, password?: string) {
  return new SyncplayClient({ host, port, room, username, password });
}
