package com.watchparty.mpvplayer;

import android.util.Log;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

/** JavaScript bridge for the native Syncplay TCP client. */
public final class AndroidSyncplayBridge {
    private static final String TAG = "AndroidSyncplayBridge";
    private final SyncplaySocketClient socketClient;
    private final JsEventDispatcher eventDispatcher;

    /** Dispatches window events into the WebView so syncplayClient.ts can hear them. */
    public interface JsEventDispatcher {
        void dispatch(String eventName, String payload);
    }

    public AndroidSyncplayBridge(JsEventDispatcher dispatcher) {
        this.eventDispatcher = dispatcher;
        socketClient = new SyncplaySocketClient(null);
        socketClient.addListener(new SyncplaySocketClient.SyncplayListener() {
            @Override public void onConnected() {
                Log.d(TAG, "Syncplay connected");
                dispatchToJs("syncplay-connected", "");
            }
            @Override public void onMessage(String raw) {
                Log.d(TAG, "Syncplay message: " + raw);
                dispatchToJs("syncplay-message", raw);
            }
            @Override public void onError(String message) {
                Log.e(TAG, message);
                dispatchToJs("syncplay-error", message);
            }
            @Override public void onDisconnected() {
                Log.d(TAG, "Syncplay disconnected");
                dispatchToJs("syncplay-disconnected", "");
            }
        });
    }

    private void dispatchToJs(String eventName, String payload) {
        try {
            if (eventDispatcher != null) eventDispatcher.dispatch(eventName, payload);
        } catch (Exception e) {
            Log.e(TAG, "Failed to dispatch event to JS", e);
        }
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
            // Syncplay protocol frames messages with CRLF (\r\n), not plain \n.
            socketClient.sendMessage(new JSONObject(payload).toString() + "\r\n");
        } catch (Exception e) {
            Log.e(TAG, "Invalid Syncplay payload", e);
        }
    }
}
