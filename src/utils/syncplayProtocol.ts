/**
 * Official Syncplay protocol message builders.
 *
 * WARNING: Syncplay server sirf yeh top-level keys samajhta hai:
 *   Hello, Set, State, Chat, List, Auth
 * In ke ilawa KUCH BHI bhejo ge to server connection foran KAAT dega
 * (isliye har outgoing message yahin se banana chahiye — kabhi raw JSON nahi!).
 */

export const SyncplayProtocol = {
  /** Chat: client bhejta hai plain string; server room ko {username, message} mein relay karta hai. */
  chat(text: string): string {
    return JSON.stringify({ Chat: text });
  },

  /** Member roster maangne ke liye. */
  list(): string {
    return JSON.stringify({ List: null });
  },

  /** Room ki playlist set karna (files = URLs/filenames ki list). */
  playlistChange(user: string, files: string[]): string {
    return JSON.stringify({ Set: { playlistChange: { user, files } } });
  },

  /** Playlist mein kaunsa item chal raha hai. */
  playlistIndex(user: string, index: number | null): string {
    return JSON.stringify({ Set: { playlistIndex: { user, index } } });
  },

  /** Ready / not-ready toggle. */
  ready(user: string, isReady: boolean): string {
    return JSON.stringify({ Set: { ready: { username: user, isReady, manuallyInitiated: true } } });
  },

  /**
   * SLOW-PEER PRIORITY ki BUNIYAD — `Set.file`.
   *
   * Syncplay server room ki position yun chunta hai (server.py Room.getPosition):
   *     watcher = min(self._watchers.values())
   * aur `Watcher.__lt__` sab se pehle yeh dekhta hai:
   *     if self.getPosition() is None or self._file is None: return False
   *
   * Yaani jis watcher ne kabhi `Set.file` nahi bheji, uska `_file` None rehta hai,
   * wo kabhi `min()` nahi jeet sakta — server usay "sab se peechay wala" mante hi
   * nahi. Nateeja: room position hamesha kisi aur ki hoti hai aur slow peer ko
   * priority milti hi nahi.
   *
   * Is liye media load karte waqt file ka naam/duration bhejna LAZMI hai.
   */
  file(name: string, duration: number, size = 0): string {
    return JSON.stringify({
      Set: {
        file: {
          name,
          duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
          size,
          path: null,
        },
      },
    });
  },

  /**
   * Play / pause / seek — official State message.
   * clientIgnoring: har user-initiated change pe +1 (echo loops rokne ke liye).
   * latencyCalculation: server ke aakhri ping ka echo (keep-alive ka hissa).
   */
  state(opts: {
    position: number;
    paused: boolean;
    doSeek: boolean;
    clientIgnoring: number;
    latencyCalculation?: number;
  }): string {
    return JSON.stringify({
      State: {
        ignoringOnTheFly: { client: opts.clientIgnoring },
        playstate: {
          position: opts.position,
          paused: opts.paused,
          doSeek: opts.doSeek,
        },
        ping: {
          latencyCalculation: opts.latencyCalculation ?? Date.now() / 1000,
          clientLatencyCalculation: Date.now() / 1000,
          clientRtt: 0,
        },
      },
    });
  },
};
