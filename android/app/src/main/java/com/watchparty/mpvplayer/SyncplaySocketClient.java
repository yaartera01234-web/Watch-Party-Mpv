package com.watchparty.mpvplayer;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Native Syncplay socket client fully compliant with the Syncplay 1.7.5 protocol
 * and yuroyami/syncplay-mobile (SyncDecision & PositionReport algorithms).
 */
public class SyncplaySocketClient {
    // Protocol thresholds matching yuroyami/syncplay-mobile and reference client constants.py
    public static final double REWIND_THRESHOLD = 4.0;
    public static final double FASTFORWARD_THRESHOLD = 5.0;
    public static final double FASTFORWARD_EXTRA_TIME = 0.25;
    public static final double SLOWDOWN_THRESHOLD = 1.5;
    public static final double SLOWDOWN_RESET_THRESHOLD = 0.1;
    public static final double SLOWDOWN_RATE = 0.95;

    /**
     * SLOW-PEER PRIORITY.
     *
     * Syncplay server (server.py Room.getPosition) picks min(watchers) -- i.e. the room
     * position IS the slowest watcher's position. So "diff = localPos - roomPosition"
     * is literally "how far ahead am I of the slowest peer in the room".
     *
     * Policy: a peer that is BEHIND is never yanked forward (that only re-triggers
     * buffering on a weak connection). Instead the peer that is AHEAD throttles to
     * SLOWDOWN_RATE until the room converges. Seeking a behind peer forward is a last
     * resort, used only past BEHIND_HARD_SEEK_THRESHOLD.
     */
    public static final double BEHIND_HARD_SEEK_THRESHOLD = 4.0;

    public static final String SYNCPLAY_LEGACY_VERSION = "1.2.255";
    public static final String SYNCPLAY_PROTOCOL_VERSION = "1.7.5";

    public interface SyncplayPlayerController {
        double getCurrentPosition();
        double getDuration();
        boolean isPaused();
        boolean hasMedia();
        void executeSeek(double seconds);
        void executePause(boolean paused);
        void executeSpeed(double speed);

        /**
         * SLOW-PEER PRIORITY: kya player is waqt buffer kar raha hai (mpv ka
         * 'paused-for-cache'). Default false rakha hai taake koi bhi purana
         * implementation bina badle kaam karta rahe.
         */
        default boolean isBuffering() { return false; }
    }

    public interface SyncplayListener {
        void onConnected();
        void onDisconnected();
        void onError(String str);
        void onMessage(String str);
        void onSyncAction(String json);
    }

    private volatile BufferedReader input;
    private volatile BufferedWriter output;
    private volatile boolean running;
    private volatile Socket socket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<SyncplayListener> listeners = new ArrayList<>();
    private final Object writeLock = new Object();

    private volatile SyncplayPlayerController playerController;
    private volatile double lastWebPosition = 0.0;
    private volatile boolean lastWebPaused = true;
    private volatile boolean hasWebMedia = false;
    private volatile long serverIgnoring = 0;
    private volatile long clientIgnoring = 0;

    private volatile Double lastGlobalPosition = null;
    private volatile Boolean lastGlobalPaused = null;
    private volatile double lastServerTime = 0.0;
    private volatile boolean firstSyncNeeded = true;
    private volatile boolean speedChanged = false;
    /** SLOW-PEER PRIORITY: buffering ke dauran position freeze karne ke liye */
    private volatile boolean wasBuffering = false;
    private volatile double bufferFreezePosition = 0.0;
    private volatile String currentUsername = "";
    private volatile Boolean lastAckPaused = null;

    public SyncplaySocketClient(Context context) {}

    public void setPlayerController(SyncplayPlayerController controller) {
        this.playerController = controller;
    }

    public void setPlaybackState(double position, boolean paused) {
        this.lastWebPosition = position;
        this.lastWebPaused = paused;
    }

    public void setHasWebMedia(boolean has) {
        this.hasWebMedia = has;
    }

    /** Kya native (MPV) player controller is waqt media chala raha hai? */
    public boolean hasControllerMedia() {
        SyncplayPlayerController pc = this.playerController;
        return pc != null && pc.hasMedia();
    }

    public void noteOutboundClientIgnore(long count) {
        if (count > this.clientIgnoring) {
            this.clientIgnoring = count;
        }
    }

    public void addListener(SyncplayListener listener) {
        synchronized (this.listeners) {
            this.listeners.add(listener);
        }
    }

    public void removeListener(SyncplayListener listener) {
        synchronized (this.listeners) {
            this.listeners.remove(listener);
        }
    }

    public void connect(final String host, final int port, final String room, final String username, final String password) {
        this.executor.execute(() -> doConnect(host, port, room, username, password));
    }

    private void doConnect(String host, int port, String room, String username, String password) {
        String line;
        try {
            disconnect();
            this.currentUsername = username != null ? username : "";
            this.firstSyncNeeded = true;
            this.speedChanged = false;
            this.wasBuffering = false;
            this.bufferFreezePosition = 0.0;
            this.clientIgnoring = 0;
            this.serverIgnoring = 0;
            this.lastGlobalPosition = null;
            this.lastGlobalPaused = null;

            Socket next = new Socket();
            next.connect(new InetSocketAddress(host, port), 10000);
            next.setKeepAlive(true);
            next.setTcpNoDelay(true);
            this.socket = next;
            this.input = new BufferedReader(new InputStreamReader(next.getInputStream(), StandardCharsets.UTF_8));
            this.output = new BufferedWriter(new OutputStreamWriter(next.getOutputStream(), StandardCharsets.UTF_8));
            this.running = true;

            JSONObject roomInfo = new JSONObject().put("name", room);
            JSONObject features = new JSONObject()
                    .put("isolateRooms", true)
                    .put("readiness", true)
                    .put("managedRooms", true)
                    .put("persistentRooms", true)
                    .put("chat", true)
                    .put("sharedPlaylists", true)
                    .put("featureList", true)
                    .put("setOthersReadiness", true);

            JSONObject hello = new JSONObject()
                    .put("username", username)
                    .put("room", roomInfo)
                    .put("version", SYNCPLAY_LEGACY_VERSION)
                    .put("realversion", SYNCPLAY_PROTOCOL_VERSION)
                    .put("features", features);

            if (password != null && !password.trim().isEmpty()) {
                hello.put("password", md5(password.trim()));
            }

            writeRaw(new JSONObject().put("Hello", hello).toString() + "\r\n");
            notifyConnected();

            while (this.running && (line = this.input.readLine()) != null) {
                String msg = line.trim();
                if (!msg.isEmpty()) {
                    handleInboundMessage(msg);
                    notifyMessage(msg);
                }
            }
        } catch (Exception e) {
            notifyError("Syncplay connection failed: " + e.getMessage());
        } finally {
            boolean wasRunning = this.running;
            this.running = false;
            closeQuietly();
            if (wasRunning) {
                notifyDisconnected();
            }
        }
    }

    private void handleInboundMessage(String raw) {
        try {
            JSONObject root = new JSONObject(raw);
            if (root.has("State")) {
                handleState(root.getJSONObject("State"));
            }
        } catch (Exception ignored) {}
    }

    /**
     * Implements Syncplay SyncDecision protocol logic from yuroyami/syncplay-mobile
     */
    private void handleState(JSONObject state) {
        try {
            // 1. ignoringOnTheFly bookkeeping
            JSONObject ign = state.optJSONObject("ignoringOnTheFly");
            if (ign != null) {
                if (ign.has("server")) {
                    this.serverIgnoring = ign.optLong("server", 0);
                    this.clientIgnoring = 0;
                }
                if (ign.has("client") && ign.optLong("client", -1) == this.clientIgnoring) {
                    this.clientIgnoring = 0;
                }
            }

            // 2. Ping & messageAge calculation
            double serverTime = 0.0;
            JSONObject ping = state.optJSONObject("ping");
            if (ping != null && ping.has("latencyCalculation")) {
                serverTime = ping.optDouble("latencyCalculation", 0.0);
                this.lastServerTime = serverTime;
            }

            double now = System.currentTimeMillis() / 1000.0;
            double messageAge = (serverTime > 0.0 && now > serverTime) ? Math.min(2.0, now - serverTime) : 0.0;

            // 3. Playstate sync decision
            JSONObject ps = state.optJSONObject("playstate");
            if (ps != null && ps.has("paused")) {
                double pos = ps.optDouble("position", 0.0);
                boolean paused = ps.optBoolean("paused", true);
                boolean doSeek = ps.optBoolean("doSeek", false);
                String setBy = ps.optString("setBy", "");

                // Only evaluate if we are not currently ignoring the server on the fly
                if (this.clientIgnoring == 0) {
                    double roomPosition = paused ? pos : (pos + messageAge);
                    boolean pausedChanged = (this.lastGlobalPaused == null || this.lastGlobalPaused != paused);
                    this.lastGlobalPaused = paused;
                    this.lastGlobalPosition = roomPosition;

                    // SYNC FIX (tug-of-war): jab room state kisi DOOSRE user ne badli ho,
                    // apni reported web-state ko foran room ke mutabiq seed kar do.
                    // Warna agla ACK purani (stale) local position bhejta hai aur server ka
                    // min(watchers) poore room ko wapas peeche kheench leta hai.
                    boolean remoteChange = setBy != null && !setBy.isEmpty() && !setBy.equals(this.currentUsername);
                    if (remoteChange && (doSeek || this.lastAckPaused == null || this.lastAckPaused != paused)) {
                        this.lastWebPosition = roomPosition;
                        this.lastWebPaused = paused;
                    }
                    this.lastAckPaused = paused;

                    SyncplayPlayerController pc = this.playerController;
                    boolean localHasMedia = (pc != null && pc.hasMedia()) || this.hasWebMedia;
                    double localPos = (pc != null && pc.hasMedia()) ? pc.getCurrentPosition() : this.lastWebPosition;

                    // FIRST SYNC: joining active room
                    if (this.firstSyncNeeded && localHasMedia) {
                        this.firstSyncNeeded = false;
                        if (pc != null && pc.hasMedia()) {
                            pc.executeSeek(roomPosition);
                            pc.executePause(paused);
                        }
                        notifySyncAction("first-sync", setBy, roomPosition, paused);
                    } else if (doSeek && !setBy.equals(this.currentUsername)) {
                        // Someone seeked
                        if (this.speedChanged) {
                            if (pc != null) pc.executeSpeed(1.0);
                            this.speedChanged = false;
                        }
                        if (pc != null && pc.hasMedia()) {
                            pc.executeSeek(roomPosition);
                        }
                        notifySyncAction("seek", setBy, roomPosition, paused);
                    } else if (localHasMedia) {
                        double diff = localPos - roomPosition;

                        // SLOW-PEER PRIORITY: agar HUM khud buffer kar rahe hain to hum hi
                        // slow peer hain. Is halat mein na khud ko dheema karna hai (pehle
                        // se ruke hue hain) aur na hi aagay seek karna hai -- seek karne se
                        // cache dobara khali hota hai aur buffering ka na-khatam hone wala
                        // chakkar shuru ho jata hai. Bas throttle hata kar khamosh raho;
                        // baqi room ko hamari freeze position se pata chal jayega.
                        boolean selfBuffering = (pc != null && pc.hasMedia() && pc.isBuffering());
                        if (selfBuffering) {
                            if (this.speedChanged) {
                                if (pc != null) pc.executeSpeed(1.0);
                                this.speedChanged = false;
                                notifySyncAction("speed-reset", setBy, roomPosition, paused);
                            }
                        } else if (diff > REWIND_THRESHOLD && !doSeek && !paused) {
                            // PAUSE-SAFE: room paused hone par position by definition
                            // frozen hai -- autonomous seek sirf flapping paida karega.
                            // Local client is ahead by > 4s (rewind)
                            if (this.speedChanged) {
                                if (pc != null) pc.executeSpeed(1.0);
                                this.speedChanged = false;
                            }
                            if (pc != null && pc.hasMedia()) {
                                pc.executeSeek(roomPosition);
                            }
                            notifySyncAction("rewind", setBy, roomPosition, paused);
                        } else if (diff < -BEHIND_HARD_SEEK_THRESHOLD && !doSeek && !paused) {
                            // YUROYAMI RULE (SyncDecision.kt): "In a normal room everyone can
                            // control, so the room follows its slowest member instead."
                            // Normal room mein forced fast-forward seek KABHI nahi -- desktop
                            // Syncplay aur yuroyami dono sirf controlled rooms mein yank karte
                            // hain. Hamara yahi autonomous seek MPV player ko har buffering
                            // stall ke baad aagay phek deta tha = jhatke + 2s jump. Ab hum
                            // slow peer hain to server ka min(watchers) room ko hamare paas
                            // rokta hai; tez peer khud 0.95x par aata hai. Koi yank nahi.
                            if (this.speedChanged) {
                                if (pc != null && pc.hasMedia()) pc.executeSpeed(1.0);
                                this.speedChanged = false;
                            }
                        } else if (!paused && !doSeek) {
                            // Subtle catch-up via playback speed adjustment.
                            //
                            // SLOW-PEER PRIORITY: roomPosition is the SLOWEST watcher's position
                            // (server.py Room.getPosition -> min(watchers)). So a positive diff
                            // means "I am ahead of the slowest peer" -> throttle myself to 0.95x
                            // so the room converges on the slow peer, instead of the slow peer
                            // being forced to skip forward and re-buffer.
                            if (diff > SLOWDOWN_THRESHOLD && !this.speedChanged) {
                                if (pc != null && pc.hasMedia()) {
                                    pc.executeSpeed(SLOWDOWN_RATE);
                                    this.speedChanged = true;
                                }
                                notifySyncAction("slowdown", setBy, roomPosition, paused);
                            } else if (this.speedChanged && Math.abs(diff) < SLOWDOWN_RESET_THRESHOLD) {
                                // Converged (within 0.1s) -> back to normal speed.
                                if (pc != null && pc.hasMedia()) {
                                    pc.executeSpeed(1.0);
                                    this.speedChanged = false;
                                }
                                notifySyncAction("speed-reset", setBy, roomPosition, paused);
                            } else if (this.speedChanged && diff < 0) {
                                // We are the slow peer now -- never stay throttled while behind.
                                if (pc != null && pc.hasMedia()) {
                                    pc.executeSpeed(1.0);
                                    this.speedChanged = false;
                                }
                                notifySyncAction("speed-reset", setBy, roomPosition, paused);
                            }
                        }
                    }

                    // Paused changed state
                    if (pausedChanged) {
                        if (paused) {
                            if (this.speedChanged) {
                                if (pc != null) pc.executeSpeed(1.0);
                                this.speedChanged = false;
                            }
                            if (pc != null && pc.hasMedia()) {
                                pc.executePause(true);
                                if (!setBy.equals(this.currentUsername)) {
                                    pc.executeSeek(roomPosition);
                                }
                            }
                            notifySyncAction("pause", setBy, roomPosition, true);
                        } else {
                            if (pc != null && pc.hasMedia()) {
                                pc.executePause(false);
                            }
                            notifySyncAction("play", setBy, roomPosition, false);
                        }
                    }
                }
            }

            // 4. Send State ACK
            sendStateAck(serverTime, state.has("playstate"));
        } catch (Exception ignored) {}
    }

    /**
     * Reports actual live position from MPV to avoid frozen 0.0 desync loops.
     */
    private void sendStateAck(double serverTime, boolean hadPlaystate) {
        try {
            double now = System.currentTimeMillis() / 1000.0;
            long ack = this.serverIgnoring;
            if (ack > 0) {
                this.serverIgnoring = 0L;
            }

            SyncplayPlayerController pc = this.playerController;
            boolean hasMedia = (pc != null && pc.hasMedia()) || this.hasWebMedia;
            double pos;
            boolean paused;
            boolean posKnown = true;
            if (hasMedia) {
                pos = (pc != null && pc.hasMedia()) ? pc.getCurrentPosition() : this.lastWebPosition;
                paused = (pc != null && pc.hasMedia()) ? pc.isPaused() : this.lastWebPaused;

                // SLOW-PEER PRIORITY -- buffering ke dauran apni position FREEZE karo.
                //
                // Jab mpv ka cache khali hota hai (paused-for-cache) to video ruk jati
                // hai, lekin mpv ka 'pause' flag false hi rehta hai kyunke user ne pause
                // nahi kiya. Purana code isi liye room ko "main chal raha hoon" batata
                // tha, aur server (_updatePositionByAge) hamari ruki hui position mein
                // network delay bhi jama kar deta tha -- yaani hum haqiqat se AAGAY
                // report hote the. Nateeja: room ka min(watchers) hamein slow peer
                // maanne mein der karta tha aur tez peer be-rok aagay nikalta rehta.
                //
                // Ab buffering shuru hote hi hum wahi position dobara bhejte hain jahan
                // ruke the. Server use aagay nahi barhata, is liye tez peer ko foran
                // pata chal jata hai ke room peechay ruk gaya hai aur wo 0.95x par aa
                // jata hai -- ek pooray ping ka intezaar kiye baghair.
                //
                // AHEM: 'paused' ko HAATH NAHI lagate. Agar hum paused=true bhejte to
                // server ka __hasPauseChanged() trigger hota aur POORA ROOM pause ho
                // jata (server.py updateState -> room.setPaused), saath hi doosre peer
                // ke chat mein jhoota "pause kiya" message bhi jata. Sirf position
                // rokna hi kaafi hai aur mehfooz bhi.
                boolean nowBuffering = (pc != null && pc.hasMedia() && pc.isBuffering());
                if (nowBuffering && !paused) {
                    if (!this.wasBuffering) {
                        // Buffering abhi shuru hui -- yahin apni jagah pakad lo
                        this.bufferFreezePosition = pos;
                        this.wasBuffering = true;
                    }
                    pos = this.bufferFreezePosition;
                } else if (this.wasBuffering) {
                    // Cache bhar gaya -- dobara asal position report karna shuru
                    this.wasBuffering = false;
                }
            } else if (this.lastGlobalPosition != null) {
                // When we have no media loaded, report room position to avoid dragging room to 0
                pos = this.lastGlobalPosition;
                paused = this.lastGlobalPaused != null ? this.lastGlobalPaused : true;
            } else {
                pos = 0.0;
                paused = true;
                posKnown = false;
            }

            // SYNC FIX - Syncplay reference (protocols.py SyncClientProtocol.sendState):
            // jab tak apni local change ka echo server se wapas na aa jaye, playstate
            // bhejna BAND rakho. Warna hamari purani state room ko ulta kheenchti hai
            // (server min(watchers) position leta hai) -> play/pause tug-of-war.
            boolean clientIgnoreIsNotSet = (this.clientIgnoring == 0) || (ack > 0);

            StringBuilder sb = new StringBuilder();
            sb.append("{\"State\": {");
            boolean wroteAny = false;
            if (clientIgnoreIsNotSet && posKnown && (hadPlaystate || hasMedia)) {
                sb.append("\"playstate\": {\"position\": ").append(plainNumber(pos))
                  .append(", \"paused\": ").append(paused)
                  .append(", \"doSeek\": false}");
                wroteAny = true;
            }
            if (wroteAny) sb.append(", ");
            sb.append("\"ping\": {\"latencyCalculation\": ").append(plainNumber(serverTime))
              .append(", \"clientLatencyCalculation\": ").append(plainNumber(now))
              .append(", \"clientRtt\": 0.0}");
            // ignoringOnTheFly sirf tab bhejo jab koi counter live ho (reference behavior)
            if (ack > 0 || this.clientIgnoring > 0) {
                sb.append(", \"ignoringOnTheFly\": {");
                boolean first = true;
                if (ack > 0) { sb.append("\"server\": ").append(ack); first = false; }
                if (this.clientIgnoring > 0) {
                    if (!first) sb.append(", ");
                    sb.append("\"client\": ").append(this.clientIgnoring);
                }
                sb.append("}");
            }
            sb.append("}}");

            writeRaw(sb.toString() + "\r\n");
        } catch (Exception ignored) {}
    }

    public void sendLocalState(double position, boolean paused, boolean doSeek) {
        this.clientIgnoring++;
        this.lastWebPosition = position;
        this.lastWebPaused = paused;
        double now = System.currentTimeMillis() / 1000.0;
        String wire = "{\"State\": {\"ignoringOnTheFly\": {\"client\": " + this.clientIgnoring
                + "}, \"playstate\": {\"position\": " + plainNumber(position)
                + ", \"paused\": " + paused
                + ", \"doSeek\": " + doSeek
                + "}, \"ping\": {\"latencyCalculation\": " + plainNumber(this.lastServerTime)
                + ", \"clientLatencyCalculation\": " + plainNumber(now)
                + ", \"clientRtt\": 0.0}}}\r\n";
        writeRaw(wire);
    }

    public void sendMessage(final String message) {
        this.executor.execute(() -> writeRaw(message));
    }

    private static String plainNumber(double v) {
        try {
            return new BigDecimal(String.valueOf(v)).toPlainString();
        } catch (Exception e) {
            return String.valueOf(v);
        }
    }

    private static String md5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] bytes = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return input;
        }
    }

    public void disconnect() {
        this.running = false;
        closeQuietly();
    }

    private void writeRaw(String message) {
        synchronized (this.writeLock) {
            BufferedWriter writer = null;
            try {
                writer = this.output;
                if (this.running && writer != null) {
                    String wire = message;
                    while (wire.endsWith("\n") || wire.endsWith("\r")) {
                        wire = wire.substring(0, wire.length() - 1);
                    }
                    writer.write(toSpacedJson(wire) + "\r\n");
                    writer.flush();
                }
            } catch (Exception e) {
                notifyError("Syncplay send failed: " + e.getMessage());
            }
        }
    }

    private static String toSpacedJson(String compact) {
        StringBuilder out = new StringBuilder(compact.length() + 32);
        boolean inString = false;
        boolean escaped = false;
        for (int i = 0; i < compact.length(); i++) {
            char c = compact.charAt(i);
            if (inString) {
                out.append(c);
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '\"') {
                    inString = false;
                }
            } else {
                boolean nextIsSpace = i + 1 < compact.length() && compact.charAt(i + 1) == ' ';
                if (c == '\"') {
                    inString = true;
                    out.append(c);
                } else if (c == ':') {
                    out.append(nextIsSpace ? ":" : ": ");
                } else if (c == ',') {
                    out.append(nextIsSpace ? "," : ", ");
                } else {
                    out.append(c);
                }
            }
        }
        return out.toString();
    }

    private synchronized void closeQuietly() {
        try { if (this.input != null) this.input.close(); } catch (Exception ignored) {}
        try { if (this.output != null) this.output.close(); } catch (Exception ignored) {}
        try { if (this.socket != null) this.socket.close(); } catch (Exception ignored) {}
        this.input = null;
        this.output = null;
        this.socket = null;
    }

    private void notifyConnected() {
        this.mainHandler.post(() -> {
            synchronized (this.listeners) {
                for (SyncplayListener l : this.listeners) l.onConnected();
            }
        });
    }

    private void notifyMessage(final String raw) {
        this.mainHandler.post(() -> {
            synchronized (this.listeners) {
                for (SyncplayListener l : this.listeners) l.onMessage(raw);
            }
        });
    }

    private void notifySyncAction(String action, String setBy, double position, boolean paused) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("action", action);
            obj.put("by", setBy);
            obj.put("position", position);
            obj.put("paused", paused);
            final String json = obj.toString();
            this.mainHandler.post(() -> {
                synchronized (this.listeners) {
                    for (SyncplayListener l : this.listeners) l.onSyncAction(json);
                }
            });
        } catch (Exception ignored) {}
    }

    private void notifyError(final String message) {
        this.mainHandler.post(() -> {
            synchronized (this.listeners) {
                for (SyncplayListener l : this.listeners) l.onError(message);
            }
        });
    }

    private void notifyDisconnected() {
        this.mainHandler.post(() -> {
            synchronized (this.listeners) {
                for (SyncplayListener l : this.listeners) l.onDisconnected();
            }
        });
    }
}
