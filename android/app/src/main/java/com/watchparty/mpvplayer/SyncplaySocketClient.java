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
    private volatile String currentUsername = "";

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

                        if (diff > REWIND_THRESHOLD && !doSeek) {
                            // Local client is ahead by > 4s (rewind)
                            if (this.speedChanged) {
                                if (pc != null) pc.executeSpeed(1.0);
                                this.speedChanged = false;
                            }
                            if (pc != null && pc.hasMedia()) {
                                pc.executeSeek(roomPosition);
                            }
                            notifySyncAction("rewind", setBy, roomPosition, paused);
                        } else if (diff < -FASTFORWARD_THRESHOLD && !doSeek) {
                            // Local client is behind by > 5s (fast-forward)
                            if (pc != null && pc.hasMedia()) {
                                pc.executeSeek(roomPosition + FASTFORWARD_EXTRA_TIME);
                            }
                            notifySyncAction("fast-forward", setBy, roomPosition + FASTFORWARD_EXTRA_TIME, paused);
                        } else if (!paused && !doSeek) {
                            // Subtle catch-up via playback speed adjustment
                            if (diff > SLOWDOWN_THRESHOLD && !this.speedChanged) {
                                if (pc != null && pc.hasMedia()) {
                                    pc.executeSpeed(SLOWDOWN_RATE);
                                    this.speedChanged = true;
                                }
                            } else if (this.speedChanged && diff < SLOWDOWN_RESET_THRESHOLD) {
                                if (pc != null && pc.hasMedia()) {
                                    pc.executeSpeed(1.0);
                                    this.speedChanged = false;
                                }
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
            String ackPart = "";
            long ack = this.serverIgnoring;
            if (ack > 0) {
                ackPart = ", \"server\": " + ack;
                this.serverIgnoring = 0L;
            }
            if (this.clientIgnoring > 0) {
                ackPart += ", \"client\": " + this.clientIgnoring;
            }

            SyncplayPlayerController pc = this.playerController;
            boolean hasMedia = (pc != null && pc.hasMedia()) || this.hasWebMedia;
            double pos;
            boolean paused;
            if (hasMedia) {
                pos = (pc != null && pc.hasMedia()) ? pc.getCurrentPosition() : this.lastWebPosition;
                paused = (pc != null && pc.hasMedia()) ? pc.isPaused() : this.lastWebPaused;
            } else if (this.lastGlobalPosition != null) {
                // When we have no media loaded, report room position to avoid dragging room to 0
                pos = this.lastGlobalPosition;
                paused = this.lastGlobalPaused != null ? this.lastGlobalPaused : true;
            } else {
                pos = 0.0;
                paused = true;
            }

            StringBuilder sb = new StringBuilder();
            sb.append("{\"State\": {\"ignoringOnTheFly\": {\"client\": ").append(this.clientIgnoring).append(ackPart).append("}");
            if (hadPlaystate || hasMedia) {
                sb.append(", \"playstate\": {\"position\": ").append(plainNumber(pos))
                  .append(", \"paused\": ").append(paused)
                  .append(", \"doSeek\": false}");
            }
            sb.append(", \"ping\": {\"latencyCalculation\": ").append(plainNumber(serverTime))
              .append(", \"clientLatencyCalculation\": ").append(plainNumber(now))
              .append(", \"clientRtt\": 0.0}}}");

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
