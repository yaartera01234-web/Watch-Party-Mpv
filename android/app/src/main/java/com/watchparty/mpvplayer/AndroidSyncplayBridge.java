package com.watchparty.mpvplayer;

import android.util.Log;
import android.webkit.JavascriptInterface;
import com.watchparty.mpvplayer.SyncplaySocketClient;
import org.json.JSONObject;

/* loaded from: /home/user/watchparty/apk_extracted/classes6.dex */
public final class AndroidSyncplayBridge {
    private static final String TAG = "AndroidSyncplayBridge";
    private final JsEventDispatcher eventDispatcher;
    private final SyncplaySocketClient socketClient = new SyncplaySocketClient(null);

    /* loaded from: /home/user/watchparty/apk_extracted/classes6.dex */
    public interface JsEventDispatcher {
        void dispatch(String str, String str2);
    }

    public AndroidSyncplayBridge(JsEventDispatcher dispatcher) {
        this.eventDispatcher = dispatcher;
        this.socketClient.addListener(new SyncplaySocketClient.SyncplayListener() { // from class: com.watchparty.mpvplayer.AndroidSyncplayBridge.1
            @Override // com.watchparty.mpvplayer.SyncplaySocketClient.SyncplayListener
            public void onConnected() {
                Log.d(AndroidSyncplayBridge.TAG, "Syncplay connected");
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-connected", "");
            }

            @Override // com.watchparty.mpvplayer.SyncplaySocketClient.SyncplayListener
            public void onMessage(String raw) {
                Log.d(AndroidSyncplayBridge.TAG, "Syncplay message: " + raw);
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-message", raw);
            }

            @Override // com.watchparty.mpvplayer.SyncplaySocketClient.SyncplayListener
            public void onError(String message) {
                Log.e(AndroidSyncplayBridge.TAG, message);
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-error", message);
            }

            @Override // com.watchparty.mpvplayer.SyncplaySocketClient.SyncplayListener
            public void onDisconnected() {
                Log.d(AndroidSyncplayBridge.TAG, "Syncplay disconnected");
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-disconnected", "");
            }
        });
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void dispatchToJs(String eventName, String payload) {
        try {
            if (this.eventDispatcher != null) {
                this.eventDispatcher.dispatch(eventName, payload);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to dispatch event to JS", e);
        }
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public void connect(String host, int port, String room, String username, String password) {
        this.socketClient.connect(host, port, room, username, password == null ? "" : password);
    }

    @JavascriptInterface
    public void disconnect() {
        this.socketClient.disconnect();
    }

    @JavascriptInterface
    public void setRoom(String room) {
    }

    @JavascriptInterface
    public void setPlaybackState(double position, boolean paused) {
        this.socketClient.setPlaybackState(position, paused);
    }

    @JavascriptInterface
    public void sendMessage(String topic, String payload) {
        if (payload == null || payload.trim().isEmpty()) {
            return;
        }
        try {
            new JSONObject(payload);
            this.socketClient.sendMessage(payload + "\r\n");
        } catch (Exception e) {
            Log.e(TAG, "Invalid Syncplay payload", e);
        }
    }
}
