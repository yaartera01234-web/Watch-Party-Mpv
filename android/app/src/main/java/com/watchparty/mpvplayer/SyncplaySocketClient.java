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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class SyncplaySocketClient {
    private volatile BufferedReader input;
    private volatile BufferedWriter output;
    private volatile boolean running;
    private volatile Socket socket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<SyncplayListener> listeners = new ArrayList<>();
    private final Object writeLock = new Object();
    private volatile double lastPosition = 0.0;
    private volatile boolean lastPaused = true;
    private volatile long serverIgnoring = 0;

    public interface SyncplayListener {
        void onConnected();
        void onDisconnected();
        void onError(String str);
        void onMessage(String str);
    }

    public void setPlaybackState(double position, boolean paused) {
        this.lastPosition = position;
        this.lastPaused = paused;
    }

    public SyncplaySocketClient(Context context) {}

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
            Socket next = new Socket();
            next.connect(new InetSocketAddress(host, port), 10000);
            next.setKeepAlive(true);
            this.socket = next;
            this.input = new BufferedReader(new InputStreamReader(next.getInputStream(), StandardCharsets.UTF_8));
            this.output = new BufferedWriter(new OutputStreamWriter(next.getOutputStream(), StandardCharsets.UTF_8));
            this.running = true;

            JSONObject roomInfo = new JSONObject().put("name", room);
            JSONObject hello = new JSONObject()
                    .put("username", username)
                    .put("room", roomInfo)
                    .put("version", "1.7.0")
                    .put("realversion", "1.7.0")
                    .put("features", new JSONObject());
            if (password != null && !password.trim().isEmpty()) {
                hello.put("password", password);
            }
            writeRaw(new JSONObject().put("Hello", hello).toString() + "\r\n");
            notifyConnected();

            while (this.running && (line = this.input.readLine()) != null) {
                String msg = line.trim();
                if (!msg.isEmpty()) {
                    autoReplyStatePong(msg);
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

    public void sendMessage(final String message) {
        this.executor.execute(() -> writeRaw(message));
    }

    private void autoReplyStatePong(String raw) {
        try {
            JSONObject parsed = new JSONObject(raw);
            JSONObject state = parsed.optJSONObject("State");
            if (state == null) return;

            JSONObject ignoring = state.optJSONObject("ignoringOnTheFly");
            if (ignoring != null && ignoring.has("server")) {
                try {
                    this.serverIgnoring = ignoring.getLong("server");
                } catch (Exception ignored) {}
            }
            JSONObject ping = state.optJSONObject("ping");
            if (ping != null && ping.has("latencyCalculation")) {
                double latencyCalculation = ping.getDouble("latencyCalculation");
                String ackPart = "";
                long ack = this.serverIgnoring;
                if (ack > 0) {
                    ackPart = ", \"server\": " + ack;
                    this.serverIgnoring = 0L;
                }
                String pong = "{\"State\": {\"ignoringOnTheFly\": {\"client\": 0" + ackPart
                        + "}, \"playstate\": {\"position\": " + plainNumber(this.lastPosition)
                        + ", \"paused\": " + this.lastPaused
                        + ", \"doSeek\": false}, \"ping\": {\"latencyCalculation\": " + plainNumber(latencyCalculation)
                        + ", \"clientLatencyCalculation\": " + plainNumber(System.currentTimeMillis() / 1000.0)
                        + ", \"clientRtt\": 0.0}}}";
                writeRaw(pong + "\r\n");
            }
        } catch (Exception ignored) {}
    }

    private static String plainNumber(double v) {
        try {
            return new BigDecimal(String.valueOf(v)).toPlainString();
        } catch (Exception e) {
            return String.valueOf(v);
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
