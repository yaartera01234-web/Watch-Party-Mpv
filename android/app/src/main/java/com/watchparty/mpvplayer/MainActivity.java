package com.watchparty.mpvplayer;

import android.app.PictureInPictureParams;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean isVideoPlaying = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep screen on during video playback
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
                // Allow media autoplay without user gesture & allow direct MP4/HLS streaming
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
                // Register Internal MPV Native Bridge
                webView.addJavascriptInterface(new NativeMpvBridge(), "AndroidMpvBridge");
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
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Auto-enter Picture-in-Picture when user taps Home button while playing
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
        // Crucial for Background Playback: Keep WebView timers active so Audio/Video doesn't pause
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
