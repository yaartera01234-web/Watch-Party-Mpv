package com.watchparty.mpvplayer;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.Rational;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "WatchPartyNative";
    private boolean isVideoPlaying = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } catch (Exception ignored) {}
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                }
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setAllowFileAccessFromFileURLs(true);
                settings.setAllowUniversalAccessFromFileURLs(true);
                settings.setJavaScriptCanOpenWindowsAutomatically(true);
                webView.addJavascriptInterface(new NativeMpvBridge(), "AndroidMpvBridge");
                webView.addJavascriptInterface(new NativeSyncplayBridge(this), "AndroidSyncplayBridge");
            }
        } catch (Exception ignored) {}
    }

    public class NativeMpvBridge {
        @JavascriptInterface
        public void setPlayingState(boolean playing) {
            isVideoPlaying = playing;
        }

        @JavascriptInterface
        public void enterPiP() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                        pipBuilder.setAspectRatio(new Rational(16, 9));
                        enterPictureInPictureMode(pipBuilder.build());
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void openMpv(String url) {
            if (url == null || url.trim().isEmpty()) return;
            Log.d(TAG, "Native MPV open request: " + url);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                    pipBuilder.setAspectRatio(new Rational(16, 9));
                    enterPictureInPictureMode(pipBuilder.build());
                }
            } catch (Exception ignored) {}
        }
    }

    public static class NativeSyncplayBridge {
        private final Context context;

        public NativeSyncplayBridge(Context context) {
            this.context = context.getApplicationContext();
        }

        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public void connect(String host, int port, String room, String username, String password) {
            Log.d(TAG, "Syncplay connect requested: host=" + host + " port=" + port + " room=" + room + " user=" + username);
            // Native Syncplay protocol integration belongs here.
            // The app is ready to call the native layer, but a real transport implementation requires
            // the official Syncplay TCP protocol stack and a proper native library.
        }

        @JavascriptInterface
        public void disconnect() {
            Log.d(TAG, "Syncplay disconnect requested");
        }

        @JavascriptInterface
        public void setRoom(String room) {
            Log.d(TAG, "Syncplay room changed to: " + room);
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        try {
            if (isVideoPlaying && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                pipBuilder.setAspectRatio(new Rational(16, 9));
                enterPictureInPictureMode(pipBuilder.build());
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onStop() {
        super.onStop();
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().resumeTimers();
            }
        } catch (Exception ignored) {}
    }
}
