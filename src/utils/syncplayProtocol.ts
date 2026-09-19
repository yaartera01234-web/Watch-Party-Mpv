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
