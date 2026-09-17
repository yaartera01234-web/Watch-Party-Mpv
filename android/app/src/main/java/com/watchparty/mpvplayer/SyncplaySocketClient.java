package com.watchparty.mpvplayer;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SyncplaySocketClient {
    private static final String TAG = "SyncplaySocketClient";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<SyncplayListener> listeners = new ArrayList<>();

    private Socket socket;
    private BufferedReader input;
    private BufferedWriter output;
    private volatile boolean running;

    public interface SyncplayListener {
        void onConnected();
        void onMessage(String raw);
        void onError(String message);
        void onDisconnected();
    }

    public SyncplaySocketClient(Context context) {
        // no-op; kept for compatibility with native bridge setup
    }

    public void addListener(SyncplayListener listener) {
        synchronized (listeners) {
            listeners.add(listener);
        }
    }

    public void removeListener(SyncplayListener listener) {
        synchronized (listeners) {
            listeners.remove(listener);
        }
    }

    public void connect(String host, int port, String room, String username, String password) {
        executor.execute(() -> {
            try {
                disconnect();

                socket = new Socket(host, port);
                socket.setKeepAlive(true);

                input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                output = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));

                running = true;

                JSONObject roomInfo = new JSONObject();
                roomInfo.put("name", room);

                JSONObject hello = new JSONObject();
                hello.put("username", username);
                hello.put("room", roomInfo);
                hello.put("version", "1.2.255");
                hello.put("realversion", "1.7.0");
                hello.put("features", new JSONObject());

                if (password != null && !password.trim().isEmpty()) {
                    hello.put("password", password);
                }

                JSONObject payload = new JSONObject();
                payload.put("Hello", hello);

                writeRaw(payload.toString() + "\n");
                notifyConnected();

                String line;
                while (running && (line = input.readLine()) != null) {
                    String msg = line.trim();
                    if (!msg.isEmpty()) {
                        notifyMessage(msg);
                    }
                }
            } catch (Exception e) {
                notifyError("Syncplay connection failed: " + e.getMessage());
            } finally {
                running = false;
                notifyDisconnected();
                closeQuietly();
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

    private synchronized void writeRaw(String message) {
        try {
            if (output == null || socket == null || socket.isClosed()) {
                return;
            }
            output.write(message);
            output.flush();
        } catch (Exception e) {
            notifyError("Syncplay send failed: " + e.getMessage());
        }
    }

    private synchronized void closeQuietly() {
        try { if (input != null) input.close(); } catch (Exception ignored) {}
        try { if (output != null) output.close(); } catch (Exception ignored) {}
        try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        input = null;
        output = null;
        socket = null;
    }

    private void notifyConnected() {
        mainHandler.post(() -> {
            synchronized (listeners) {
                for (SyncplayListener listener : listeners) {
                    listener.onConnected();
                }
            }
        });
    }

    private void notifyMessage(String raw) {
        mainHandler.post(() -> {
            synchronized (listeners) {
                for (SyncplayListener listener : listeners) {
                    listener.onMessage(raw);
                }
            }
        });
    }

    private void notifyError(String message) {
        mainHandler.post(() -> {
            synchronized (listeners) {
                for (SyncplayListener listener : listeners) {
                    listener.onError(message);
                }
            }
        });
    }

    private void notifyDisconnected() {
        mainHandler.post(() -> {
            synchronized (listeners) {
                for (SyncplayListener listener : listeners) {
                    listener.onDisconnected();
                }
            }
        });
    }
}
