package com.watchparty.mpvplayer;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SyncplaySocketClient {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<SyncplayListener> listeners = new ArrayList<>();
    private final Object writeLock = new Object();
    private volatile Socket socket;
    private volatile BufferedReader input;
    private volatile BufferedWriter output;
    private volatile boolean running;
    // Real playback state (JS se ata hai) — taake ping-pong server ko sahi halat bataye.
    private volatile double lastPosition = 0.0;
    private volatile boolean lastPaused = true;
    // Server ka ignoring counter — isay agle pong mein {server: N} se ACK karna LAZMI hai
    // warna server pings bhejna band kar deta hai aur ~13s mein connection kaat deta hai.
    private volatile long serverIgnoring = 0;

    /** JS layer apni current playback state yahan update karti hai. */
    public void setPlaybackState(double position, boolean paused) {
        lastPosition = position;
        lastPaused = paused;
    }

    public interface SyncplayListener {
        void onConnected();
        void onMessage(String raw);
        void onError(String message);
        void onDisconnected();
    }

    public SyncplaySocketClient(Context context) { }

    public void addListener(SyncplayListener listener) {
        synchronized (listeners) { listeners.add(listener); }
    }

    public void removeListener(SyncplayListener listener) {
        synchronized (listeners) { listeners.remove(listener); }
    }

    public void connect(String host, int port, String room, String username, String password) {
        executor.execute(() -> {
            try {
                disconnect();
                Socket next = new Socket();
                next.connect(new InetSocketAddress(host, port), 10000);
                next.setKeepAlive(true);
                socket = next;
                input = new BufferedReader(new InputStreamReader(next.getInputStream(), StandardCharsets.UTF_8));
                output = new BufferedWriter(new OutputStreamWriter(next.getOutputStream(), StandardCharsets.UTF_8));
                running = true;

                JSONObject roomInfo = new JSONObject().put("name", room);
                JSONObject hello = new JSONObject()
                        .put("username", username)
                        .put("room", roomInfo)
                        .put("version", "1.7.0")
                        .put("realversion", "1.7.0")
                        .put("features", new JSONObject());
                if (password != null && !password.trim().isEmpty()) hello.put("password", password);

                writeRaw(new JSONObject().put("Hello", hello).toString() + "\r\n");
                notifyConnected();

                String line;
                while (running && (line = input.readLine()) != null) {
                    String msg = line.trim();
                    if (msg.isEmpty()) continue;
                    // PROTOCOL KEEP-ALIVE: Syncplay server har ~1s State ping bhejta hai.
                    // Jawab na milne par ~15s mein silent KICK. Har ping ka fori jawab bhejo.
                    autoReplyStatePong(msg);
                    notifyMessage(msg);
                }
            } catch (Exception e) {
                notifyError("Syncplay connection failed: " + e.getMessage());
            } finally {
                boolean wasRunning = running;
                running = false;
                closeQuietly();
                if (wasRunning) notifyDisconnected();
            }
        });
    }

    public void sendMessage(String message) {
        executor.execute(() -> writeRaw(message));
    }

    /**
     * Syncplay protocol keep-alive. Server sends {"State": {"ping": {"latencyCalculation": X}}}
     * roughly every second and expects this echo back — otherwise it drops the client
     * after ~15 seconds (silent kick, no Error message).
     */
    private void autoReplyStatePong(String raw) {
        try {
            JSONObject parsed = new JSONObject(raw);
            JSONObject state = parsed.optJSONObject("State");
            if (state == null) return;

            // 1) Server ke ignoringOnTheFly.server ko yaad rakho (ACK ke liye)
            JSONObject ignoring = state.optJSONObject("ignoringOnTheFly");
            if (ignoring != null && ignoring.has("server")) {
                try { serverIgnoring = ignoring.getLong("server"); } catch (Exception ignored) { }
            }

            JSONObject ping = state.optJSONObject("ping");
            if (ping == null || !ping.has("latencyCalculation")) return;
            double latencyCalculation = ping.getDouble("latencyCalculation");

            // 2) Pending server-ACK ho to isi pong ke saath bhej do (PROTOCOL KA RULE)
            String ackPart = "";
            long ack = serverIgnoring;
            if (ack > 0) {
                ackPart = ", \"server\": " + ack;
                serverIgnoring = 0;
            }

            // OUTBOUND FRAME: hand-built — plain decimals (E-notation server ko nahi chalti)
            // aur spaced format (compact JSON server reject karta hai).
            String pong = "{\"State\": {\"ignoringOnTheFly\": {\"client\": 0" + ackPart + "}, "
                    + "\"playstate\": {\"position\": " + plainNumber(lastPosition)
                    + ", \"paused\": " + lastPaused + ", \"doSeek\": false}, "
                    + "\"ping\": {\"latencyCalculation\": " + plainNumber(latencyCalculation)
                    + ", \"clientLatencyCalculation\": " + plainNumber(System.currentTimeMillis() / 1000.0)
                    + ", \"clientRtt\": 0.0}}}";
            writeRaw(pong + "\r\n");
        } catch (Exception ignored) { }
    }

    /** Doubles ko hamesha plain decimal mein likho (server 1.23E9 format nahi samajhta). */
    private static String plainNumber(double v) {
        try {
            return new java.math.BigDecimal(String.valueOf(v)).toPlainString();
        } catch (Exception e) {
            return String.valueOf(v);
        }
    }

    public void disconnect() {
        running = false;
        closeQuietly();
    }

    private void writeRaw(String message) {
        synchronized (writeLock) {
            try {
                BufferedWriter writer = output;
                if (!running || writer == null) return;
                // syncplay.pl ka server COMPACT JSON reject karta hai
                // ("Not a json encoded string") — har message spaced format mein jayega.
                String wire = message;
                while (wire.endsWith("\n") || wire.endsWith("\r")) wire = wire.substring(0, wire.length() - 1);
                writer.write(toSpacedJson(wire) + "\r\n");
                writer.flush();
            } catch (Exception e) {
                notifyError("Syncplay send failed: " + e.getMessage());
            }
        }
    }

    /**
     * Compact JSON ko Python json.dumps jaisa format deta hai: {"a": 1, "b": 2}
     * (':' aur ',' ke baad ek space — sirf strings ke BAHAR, escape-aware).
     */
    private static String toSpacedJson(String compact) {
        StringBuilder out = new StringBuilder(compact.length() + 32);
        boolean inString = false;
        boolean escaped = false;
        for (int i = 0; i < compact.length(); i++) {
            char c = compact.charAt(i);
            if (inString) {
                out.append(c);
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
            } else {
                boolean nextIsSpace = (i + 1 < compact.length()) && compact.charAt(i + 1) == ' ';
                if (c == '"') { inString = true; out.append(c); }
                else if (c == ':') out.append(nextIsSpace ? ":" : ": ");
                else if (c == ',') out.append(nextIsSpace ? "," : ", ");
                else out.append(c);
            }
        }
        return out.toString();
    }

    private synchronized void closeQuietly() {
        try { if (input != null) input.close(); } catch (Exception ignored) { }
        try { if (output != null) output.close(); } catch (Exception ignored) { }
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
        input = null; output = null; socket = null;
    }

    private void notifyConnected() { mainHandler.post(() -> { synchronized (listeners) { for (SyncplayListener l : listeners) l.onConnected(); } }); }
    private void notifyMessage(String raw) { mainHandler.post(() -> { synchronized (listeners) { for (SyncplayListener l : listeners) l.onMessage(raw); } }); }
    private void notifyError(String message) { mainHandler.post(() -> { synchronized (listeners) { for (SyncplayListener l : listeners) l.onError(message); } }); }
    private void notifyDisconnected() { mainHandler.post(() -> { synchronized (listeners) { for (SyncplayListener l : listeners) l.onDisconnected(); } }); }
}
