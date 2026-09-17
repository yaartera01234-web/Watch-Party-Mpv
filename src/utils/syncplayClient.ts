export type SyncplayEvent = 'connect' | 'message' | 'error';

export type SyncplayRoomConfig = {
  host: string;
  port: number;
  room: string;
  username: string;
  password?: string;
};

export class SyncplayClient {
  public connected = false;
  private listeners = new Map<string, Set<Function>>();
  private androidBridge?: any;
  private roomConfig: SyncplayRoomConfig;

  constructor(config: SyncplayRoomConfig) {
    this.roomConfig = config;
    this.androidBridge = typeof window !== 'undefined' ? (window as any).AndroidSyncplayBridge : undefined;
  }

  setAndroidBridge(bridge: any) {
    this.androidBridge = bridge;
  }

  on(event: SyncplayEvent, cb: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }

  emit(event: SyncplayEvent, ...args: any[]) {
    for (const cb of this.listeners.get(event) ?? []) {
      cb(...args);
    }
  }

  connect() {
    const bridge = this.androidBridge || (typeof window !== 'undefined' ? (window as any).AndroidSyncplayBridge : undefined);
    if (!bridge || typeof bridge.connect !== 'function') {
      this.connected = false;
      this.emit('error', new Error('Syncplay native bridge is not available on this device.'));
      return this;
    }

    bridge.connect(this.roomConfig.host, this.roomConfig.port, this.roomConfig.room, this.roomConfig.username, this.roomConfig.password ?? '');
    this.connected = false;
    return this;
  }

  subscribe(topics: string[] | string, opts?: any) {
    return this;
  }

  publish(topic: string, payload: string, opts?: any) {
    const bridge = this.androidBridge || (typeof window !== 'undefined' ? (window as any).AndroidSyncplayBridge : undefined);
    if (bridge && typeof bridge.sendMessage === 'function') {
      bridge.sendMessage(topic, payload);
    }
    return this;
  }

  end(force?: boolean) {
    const bridge = this.androidBridge || (typeof window !== 'undefined' ? (window as any).AndroidSyncplayBridge : undefined);
    if (bridge && typeof bridge.disconnect === 'function') {
      bridge.disconnect();
    }
    this.connected = false;
    return this;
  }
}

export function makeSyncplayClient(host: string, port: number, room: string, username: string, password?: string) {
  return new SyncplayClient({ host, port, room, username, password });
}
