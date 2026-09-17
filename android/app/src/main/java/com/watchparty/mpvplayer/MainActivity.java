package com.watchparty.mpvplayer;

import android.app.PictureInPictureParams;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.Rational;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "WatchPartyNative";
    private boolean isVideoPlaying = false;
    private MpvPlayerView mpvPlayerView;
    private AndroidSyncplayBridge syncplayBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enterImmersiveMode();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        mpvPlayerView = new MpvPlayerView(this);
        syncplayBridge = new AndroidSyncplayBridge(this::dispatchSyncplayEvent);
        setupWebView();
    }

    private void setupWebView() {
        try {
            WebView webView = getBridge() == null ? null : getBridge().getWebView();
            if (webView == null) return;
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
            // IMPORTANT: addJavascriptInterface must run BEFORE the page's JS needs it.
            // onCreate (right after super) is the earliest safe point — much safer than onStart.
            webView.addJavascriptInterface(new NativeMpvBridge(), "AndroidMpvBridge");
            webView.addJavascriptInterface(syncplayBridge, "AndroidSyncplayBridge");
        } catch (Exception e) {
            Log.e(TAG, "WebView setup failed", e);
        }
    }

    private void enterImmersiveMode() {
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.BLACK);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    public void dispatchSyncplayEvent(String event, String payload) {
        runOnUiThread(() -> {
            try {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView == null) return;
                String safeEvent = org.json.JSONObject.quote(event);
                String safePayload = org.json.JSONObject.quote(payload == null ? "" : payload);
                webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent(" + safeEvent + ", { detail: " + safePayload + " }));",
                        null
                );
            } catch (Exception e) {
                Log.e(TAG, "Unable to dispatch Syncplay event", e);
            }
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        enterImmersiveMode();
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
                        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                        builder.setAspectRatio(new Rational(16, 9));
                        enterPictureInPictureMode(builder.build());
                    }
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void openMpv(String url) {
            if (url == null || url.trim().isEmpty()) return;
            if (mpvPlayerView != null) {
                mpvPlayerView.initialize();
                mpvPlayerView.load(url);
            }
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (isVideoPlaying && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                builder.setAspectRatio(new Rational(16, 9));
                enterPictureInPictureMode(builder.build());
            } catch (Exception ignored) { }
        }
    }
}
