package com.watchparty.mpvplayer;

import android.util.Log;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

public final class AndroidSyncplayBridge {
    private static final String TAG = "AndroidSyncplayBridge";
    private final JsEventDispatcher eventDispatcher;
    private final SyncplaySocketClient socketClient = new SyncplaySocketClient(null);

    public interface JsEventDispatcher {
        void dispatch(String str, String str2);
    }

    public AndroidSyncplayBridge(JsEventDispatcher dispatcher) {
        this.eventDispatcher = dispatcher;
        this.socketClient.addListener(new SyncplaySocketClient.SyncplayListener() {
            @Override
            public void onConnected() {
                Log.d(AndroidSyncplayBridge.TAG, "Syncplay connected");
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-connected", "");
            }

            @Override
            public void onMessage(String raw) {
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-message", raw);
            }

            @Override
            public void onSyncAction(String json) {
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-sync-action", json);
            }

            @Override
            public void onError(String message) {
                Log.e(AndroidSyncplayBridge.TAG, message);
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-error", message);
            }

            @Override
            public void onDisconnected() {
                Log.d(AndroidSyncplayBridge.TAG, "Syncplay disconnected");
                AndroidSyncplayBridge.this.dispatchToJs("syncplay-disconnected", "");
            }
        });
    }

    public void setPlayerController(SyncplaySocketClient.SyncplayPlayerController controller) {
        this.socketClient.setPlayerController(controller);
    }

    private void dispatchToJs(String eventName, String payload) {
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
    public void setHasWebMedia(boolean has) {
        this.socketClient.setHasWebMedia(has);
    }

    @JavascriptInterface
    public void sendLocalState(double position, boolean paused, boolean doSeek) {
        this.socketClient.sendLocalState(position, paused, doSeek);
    }

    @JavascriptInterface
    public void sendMessage(String topic, String payload) {
        if (payload == null || payload.trim().isEmpty()) {
            return;
        }
        try {
            JSONObject obj = new JSONObject(payload);
            if (obj.has("State")) {
                JSONObject st = obj.getJSONObject("State");
                JSONObject ign = st.optJSONObject("ignoringOnTheFly");
                if (ign != null && ign.has("client")) {
                    this.socketClient.noteOutboundClientIgnore(ign.optLong("client", 0));
                }
            }
            this.socketClient.sendMessage(payload + "\r\n");
        } catch (Exception e) {
            Log.e(TAG, "Invalid Syncplay payload", e);
        }
    }
}
