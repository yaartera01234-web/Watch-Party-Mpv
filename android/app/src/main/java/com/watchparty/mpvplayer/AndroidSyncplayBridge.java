package com.watchparty.mpvplayer;

import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

/** JavaScript bridge for the native Syncplay TCP client. */
public final class AndroidSyncplayBridge {
    private static final String TAG = "AndroidSyncplayBridge";
    private final SyncplaySocketClient socketClient;

    public AndroidSyncplayBridge(Context context) {
        socketClient = new SyncplaySocketClient(context);
        socketClient.addListener(new SyncplaySocketClient.SyncplayListener() {
            @Override public void onConnected() { Log.d(TAG, "Syncplay connected"); }
            @Override public void onMessage(String raw) { Log.d(TAG, "Syncplay message: " + raw); }
            @Override public void onError(String message) { Log.e(TAG, message); }
            @Override public void onDisconnected() { Log.d(TAG, "Syncplay disconnected"); }
        });
    }

    @JavascriptInterface
    public boolean isAvailable() { return true; }

    @JavascriptInterface
    public void connect(String host, int port, String room, String username, String password) {
        socketClient.connect(host, port, room, username, password == null ? "" : password);
    }

    @JavascriptInterface
    public void disconnect() { socketClient.disconnect(); }

    @JavascriptInterface
    public void setRoom(String room) { /* room changes are sent by reconnecting */ }

    @JavascriptInterface
    public void sendMessage(String topic, String payload) {
        if (payload == null || payload.trim().isEmpty()) return;
        try {
            socketClient.sendMessage(new JSONObject(payload).toString() + "\n");
        } catch (Exception e) {
            Log.e(TAG, "Invalid Syncplay payload", e);
        }
    }
}
