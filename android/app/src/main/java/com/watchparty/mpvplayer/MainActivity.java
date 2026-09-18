package com.watchparty.mpvplayer;

import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.Rational;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "WatchPartyNative";
    private static final int WINDOW_BG = 0xFF0B0A16; // #0b0a16
    private MpvPlayerView mpvPlayerView;
    private AndroidSyncplayBridge syncplayBridge;
    private boolean isVideoPlaying = false;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean fullscreenActive = false;
    private int slotX = -1;
    private int slotY = -1;
    private int slotW = -1;
    private int slotH = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));

        // Cutout fix: allow extending fully into display notch / camera cutouts (edge-to-edge)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(lp);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            getWindow().getDecorView().setFitsSystemWindows(false);
        } catch (Throwable ignored) {}

        this.syncplayBridge = new AndroidSyncplayBridge(this::dispatchSyncplayEvent);
        setupWebView();
    }

    private void setupWebView() {
        try {
            WebView webView = getBridge() == null ? null : getBridge().getWebView();
            if (webView == null) return;

            webView.setFitsSystemWindows(false);
            webView.setBackgroundColor(0); // Transparent so native MPV underneath shows
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
            webView.addJavascriptInterface(this.syncplayBridge, "AndroidSyncplayBridge");
        } catch (Exception e) {
            Log.e(TAG, "WebView setup failed", e);
        }
    }

    public void ensureMpvCreated() {
        if (this.mpvPlayerView != null) return;

        this.mpvPlayerView = new MpvPlayerView(this);
        this.mpvPlayerView.setJsEmitter(this::dispatchSyncplayEvent);

        FrameLayout root = (FrameLayout) getWindow().getDecorView().findViewById(android.R.id.content);
        root.setFitsSystemWindows(false);
        root.setBackgroundColor(Color.TRANSPARENT);
        root.addView(this.mpvPlayerView, 0, new FrameLayout.LayoutParams(1, 1));
        this.mpvPlayerView.setVisibility(View.GONE);
        applySlotRect();
    }

    public void applySlotRect() {
        if (this.mpvPlayerView == null) return;

        ViewGroup.LayoutParams base = this.mpvPlayerView.getLayoutParams();
        FrameLayout.LayoutParams lp = (base instanceof FrameLayout.LayoutParams)
                ? (FrameLayout.LayoutParams) base
                : new FrameLayout.LayoutParams(1, 1);

        if (this.fullscreenActive) {
            // Edge-to-edge MATCH_PARENT fills 100% of the window including cutout area
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.height = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.leftMargin = 0;
            lp.topMargin = 0;
            lp.rightMargin = 0;
            lp.bottomMargin = 0;
            this.mpvPlayerView.setLayoutParams(lp);
            return;
        }

        float density = getResources().getDisplayMetrics().density;
        int w, h, x, y;
        if (this.slotW > 48 && this.slotH > 40) {
            w = (int) (this.slotW * density);
            h = (int) (this.slotH * density);
            x = (int) (this.slotX * density);
            y = (int) (this.slotY * density);
        } else {
            int screenW = getResources().getDisplayMetrics().widthPixels;
            w = screenW;
            h = (int) ((w * 9.0f) / 16.0f);
            x = 0;
            y = 0;
        }

        lp.width = Math.max(1, w);
        lp.height = Math.max(1, h);
        lp.leftMargin = Math.max(0, x);
        lp.topMargin = Math.max(0, y);
        this.mpvPlayerView.setLayoutParams(lp);
    }

    public void dispatchSyncplayEvent(final String event, final String payload) {
        runOnUiThread(() -> {
            try {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView == null) return;
                String safeEvent = JSONObject.quote(event);
                String safePayload = JSONObject.quote(payload == null ? "" : payload);
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent(" + safeEvent + ", { detail: " + safePayload + " }));", null);
            } catch (Exception e) {
                Log.e(TAG, "Unable to dispatch event", e);
            }
        });
    }

    private void applyImmersive(boolean immersive) {
        Window window = getWindow();

        // 1. Cutout short edges (ALWAYS on API 30+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            window.setAttributes(lp);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        // 2. Window flags for true edge-to-edge fullscreen without side bars
        if (immersive) {
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        }

        // 3. UI visibility flags (essential across all Android OEMs including Samsung & Xiaomi)
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (immersive) {
            flags |= View.SYSTEM_UI_FLAG_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        }
        window.getDecorView().setSystemUiVisibility(flags);

        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = window.getInsetsController();
            if (c != null) {
                if (immersive) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                } else {
                    c.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            }
        }

        try {
            WindowCompat.setDecorFitsSystemWindows(window, !immersive);
        } catch (Throwable ignored) {}
    }

    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent event) {
        if (event.getAction() == android.view.KeyEvent.ACTION_UP &&
           (event.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER || event.getKeyCode() == android.view.KeyEvent.KEYCODE_NUMPAD_ENTER)) {
            WebView wv = getBridge() == null ? null : getBridge().getWebView();
            if (wv != null) {
                wv.evaluateJavascript("(function(){" +
                        "var btn = document.getElementById('chat-send-btn');" +
                        "var inp = document.getElementById('chat-message-input');" +
                        "if(inp && document.activeElement === inp && btn){ btn.click(); return '1'; }" +
                        "return '0';})();", null);
            }
        }
        return super.dispatchKeyEvent(event);
    }

    public void setFullscreen(boolean enter) {
        this.fullscreenActive = enter;
        applyImmersive(enter);
        setRequestedOrientation(enter ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        runOnUiThread(this::applySlotRect);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (this.fullscreenActive) {
            applyImmersive(true);
            runOnUiThread(this::applySlotRect);
        }
        if (this.mpvPlayerView != null) {
            this.mpvPlayerView.reattachSurface();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (this.mpvPlayerView != null) {
            this.mpvPlayerView.reattachSurface();
        }
        if (this.fullscreenActive) {
            applyImmersive(true);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && this.fullscreenActive) {
            applyImmersive(true);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (this.fullscreenActive) {
            applyImmersive(true);
        }
    }

    @Override
    public void onBackPressed() {
        if (this.fullscreenActive) {
            setFullscreen(false);
            dispatchSyncplayEvent("mpv-exit-fullscreen", "{}");
            return;
        }
        WebView wv = null;
        try {
            wv = getBridge() == null ? null : getBridge().getWebView();
        } catch (Exception ignored) {
        }
        if (wv != null) {
            wv.evaluateJavascript("(window.__mpvBack && window.__mpvBack()) ? '1' : '0'", value -> {
                boolean consumed = value != null && value.contains("1");
                if (!consumed) {
                    superOnBackPressedCompat();
                }
            });
        } else {
            superOnBackPressedCompat();
        }
    }

    private void superOnBackPressedCompat() {
        try {
            super.onBackPressed();
        } catch (Exception e) {
            finish();
        }
    }

    @Override
    public void onDestroy() {
        if (this.mpvPlayerView != null) {
            this.mpvPlayerView.destroyPlayer();
        }
        super.onDestroy();
    }

    public class NativeMpvBridge {
        public NativeMpvBridge() {}

        @JavascriptInterface
        public void setPlayingState(boolean playing) {
            MainActivity.this.isVideoPlaying = playing;
        }

        @JavascriptInterface
        public void enterPiP() {
            MainActivity.this.runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder();
                        b.setAspectRatio(new Rational(16, 9));
                        MainActivity.this.enterPictureInPictureMode(b.build());
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void openMpv(String url) {
            if (url == null || url.trim().isEmpty()) return;
            final String trimmed = url.trim();
            MainActivity.this.runOnUiThread(() -> {
                MainActivity.this.ensureMpvCreated();

                if (MediaResolver.urlLooksLikeDirectMedia(trimmed)) {
                    MainActivity.this.dispatchSyncplayEvent("mpv-resolving", "{\"status\":\"direct\"}");
                    MainActivity.this.mpvPlayerView.open(trimmed, null);
                } else {
                    MainActivity.this.dispatchSyncplayEvent("mpv-resolving", "{\"status\":\"resolving\"}");
                    MediaResolver.resolveAsync(trimmed, MainActivity.this.ui, new MediaResolver.Callback() {
                        @Override
                        public void onResolved(MediaResolver.ResolvedMedia media) {
                            String safeTitle = media.title.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
                            MainActivity.this.dispatchSyncplayEvent("mpv-resolved", "{\"title\":\"" + safeTitle + "\",\"duration\":" + media.duration + "}");
                            MainActivity.this.mpvPlayerView.open(media.videoUrl, media.audioUrl);
                        }

                        @Override
                        public void onFailed(String reason) {
                            String safeReason = reason.replace("\"", "'");
                            MainActivity.this.dispatchSyncplayEvent("mpv-resolved", "{\"title\":\"\",\"duration\":0,\"fallback\":true,\"reason\":\"" + safeReason + "\"}");
                            MainActivity.this.mpvPlayerView.open(trimmed, null);
                        }
                    });
                }
            });
        }

        @JavascriptInterface
        public void mpvSetRect(int x, int y, int w, int h) {
            MainActivity.this.slotX = x;
            MainActivity.this.slotY = y;
            MainActivity.this.slotW = w;
            MainActivity.this.slotH = h;
            MainActivity.this.runOnUiThread(MainActivity.this::applySlotRect);
        }

        @JavascriptInterface
        public void mpvSetFullscreen(final boolean enter) {
            MainActivity.this.runOnUiThread(() -> MainActivity.this.setFullscreen(enter));
        }

        @JavascriptInterface
        public void mpvPlay() {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.play();
                }
            });
        }

        @JavascriptInterface
        public void mpvPause(final boolean paused) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setPaused(paused);
                }
            });
        }

        @JavascriptInterface
        public void mpvSeekTo(final double seconds) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.seekTo(seconds);
                }
            });
        }

        @JavascriptInterface
        public void mpvSeekRelative(final double delta) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.seekRelative(delta);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetVolume(final int percent) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setVolume(percent);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetSpeed(final double speed) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setSpeed(speed);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetAspectRatio(final String mode) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setAspectRatio(mode);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetAudioTrack(final int id) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setAudioTrack(id);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetSubTrack(final int id) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setSubTrack(id);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetSubScale(final double scale) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setSubScale(scale);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetSubDelay(final double sec) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setSubDelay(sec);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetAudioDelay(final double sec) {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.setAudioDelay(sec);
                }
            });
        }

        @JavascriptInterface
        public void mpvSetScreenBrightness(final float value) {
            MainActivity.this.runOnUiThread(() -> {
                try {
                    WindowManager.LayoutParams lp = MainActivity.this.getWindow().getAttributes();
                    lp.screenBrightness = Math.max(0.01f, Math.min(1.0f, value));
                    MainActivity.this.getWindow().setAttributes(lp);
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public String mpvGetTracks() {
            return MainActivity.this.mpvPlayerView != null ? MainActivity.this.mpvPlayerView.getTracksJson() : "{\"audio\":[],\"sub\":[]}";
        }

        @JavascriptInterface
        public String mpvGetChapters() {
            return MainActivity.this.mpvPlayerView != null ? MainActivity.this.mpvPlayerView.getChaptersJson() : "[]";
        }

        @JavascriptInterface
        public void closeMpv() {
            MainActivity.this.runOnUiThread(() -> {
                if (MainActivity.this.fullscreenActive) {
                    MainActivity.this.setFullscreen(false);
                }
                if (MainActivity.this.mpvPlayerView != null) {
                    MainActivity.this.mpvPlayerView.closePlayer();
                }
            });
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (this.isVideoPlaying && Build.VERSION.SDK_INT >= 26) {
            try {
                PictureInPictureParams.Builder b = new PictureInPictureParams.Builder();
                b.setAspectRatio(new Rational(16, 9));
                enterPictureInPictureMode(b.build());
            } catch (Exception ignored) {
            }
        }
    }
}

