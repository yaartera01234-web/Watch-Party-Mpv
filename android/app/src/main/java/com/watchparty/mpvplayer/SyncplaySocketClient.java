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

                writeRaw(new JSONObject().put("Hello", hello).toString() + "\n");
                notifyConnected();

                String line;
                while (running && (line = input.readLine()) != null) {
                    if (!line.trim().isEmpty()) notifyMessage(line.trim());
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

    public void disconnect() {
        running = false;
        closeQuietly();
    }

    private void writeRaw(String message) {
        synchronized (writeLock) {
            try {
                BufferedWriter writer = output;
                if (!running || writer == null) return;
                writer.write(message);
                writer.flush();
            } catch (Exception e) {
                notifyError("Syncplay send failed: " + e.getMessage());
            }
        }
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
