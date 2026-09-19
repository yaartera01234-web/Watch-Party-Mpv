package com.watchparty.mpvplayer;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.widget.FrameLayout;
import is.xyz.mpv.MPV;
import is.xyz.mpv.MPVNode;
import org.json.JSONArray;
import org.json.JSONObject;

public class MpvPlayerView extends FrameLayout implements SurfaceHolder.Callback {
    private static final String TAG = "MpvPlayerView";
    private static final int MPV_EVENT_START_FILE = 6;
    private static final int MPV_EVENT_END_FILE = 7;
    private static final int MPV_EVENT_FILE_LOADED = 8;

    public interface JsEmitter {
        void emit(String event, String payload);
    }

    private MPV mpv;
    private boolean coreReady = false;
    private boolean surfaceReady = false;
    private String pendingVideoUrl = null;
    private String pendingAudioUrl = null;
    private String currentAudioUrl = null;
    private JsEmitter jsEmitter;
    private final SurfaceView surfaceView;
    private final Handler poll = new Handler(Looper.getMainLooper());
    private boolean polling = false;

    /**
     * DEBUG HUD -- sirf napne ke liye. Screen par live numbers dikhata hai taake
     * andaza lagane ke bajaye asal data mile: har poll ka gap (ms), mpv ki asal
     * time-pos, aur paused flag. Release build se hata diya jayega.
     */
    private android.widget.TextView debugHud;
    private long lastPollAt = 0L;
    private double lastPollPos = -1.0;
    private int pollCount = 0;
    private long maxGap = 0L;
    private int gapOver400 = 0;
    private int secondFlips = 0;
    private int lastShownSecond = -1;
    private int jump2s = 0;
    // CULPRIT CATCHERS: 2s-jump ki asal wajah pakarne ke liye. seek = mpv ko har
    // seek (khud sync ya remote), ff/rw = hamari autonomous sync seeks.
    private int seekCount = 0;
    private String lastSeekInfo = "-";
    private int ffCount = 0;
    private int rwCount = 0;
    private String lastAct = "-";
    private int rawBack = 0;   // DEBUG: mpv raw position kitni baar peeche gayi (oscillation)

    /**
     * SLOW-PEER PRIORITY: mpv ka 'paused-for-cache' -- yaani player ruka hua hai
     * kyunke cache khali ho gaya (buffering). Poll loop ise pehle se parhta tha
     * aur JS ko bhejta tha, lekin sync layer tak kabhi nahi pohanchta tha.
     * Ab SyncplaySocketClient ise parhta hai taake buffering ke dauran hum room
     * ko apni ruki hui position report karein, aagay barhti hui nahi.
     */
    private volatile boolean buffering = false;

    private final Runnable pollTask = new Runnable() {
        @Override
        public void run() {
            if (!coreReady || mpv == null) return;
            try {
                Double pos = mpv.getPropertyDouble("time-pos");
                Double dur = mpv.getPropertyDouble("duration");
                Boolean paused = mpv.getPropertyBoolean("pause");
                Integer vol = mpv.getPropertyInt("volume");
                Double spd = mpv.getPropertyDouble("speed");
                Boolean buf = mpv.getPropertyBoolean("paused-for-cache");
                MpvPlayerView.this.buffering = (buf != null && buf);

                // CACHE METER: kitna ahead load hua (seconds + MB) -- 200MB cap ki
                // live tasdeeq ke liye.
                double cSec = -1.0, cMB = -1.0;
                try {
                    Double ct = mpv.getPropertyDouble("demuxer-cache-time");
                    if (ct != null && pos != null) cSec = ct - pos;
                } catch (Throwable ignored) {}
                try {
                    MPVNode st = mpv.getPropertyNode("demuxer-cache-state");
                    if (st != null && st.get("fw-bytes") != null)
                        cMB = st.get("fw-bytes").asInt() / 1048576.0;
                } catch (Throwable ignored) {}
                MpvPlayerView.this.hudCacheSec = cSec;
                MpvPlayerView.this.hudCacheMB = cMB;

                // ---- DEBUG HUD measurement ----
                long nowMs = android.os.SystemClock.elapsedRealtime();
                long gap = (lastPollAt == 0L) ? 0L : (nowMs - lastPollAt);
                lastPollAt = nowMs;
                pollCount++;
                if (gap > maxGap) maxGap = gap;
                if (gap > 400) gapOver400++;
                double dpos = (pos == null ? 0.0 : pos);
                boolean dpaused = (paused != null && paused);
                int shownSec = (int) Math.floor(dpos);
                if (lastShownSecond >= 0 && shownSec != lastShownSecond) {
                    secondFlips++;
                    if (Math.abs(shownSec - lastShownSecond) >= 2) jump2s++;
                }
                lastShownSecond = shownSec;
                double posDelta = (lastPollPos < 0) ? 0.0 : (dpos - lastPollPos);
                if (posDelta < -0.05) this.rawBack++;
                lastPollPos = dpos;
                updateDebugHud(gap, dpos, posDelta, dpaused, (buf != null && buf));

                JSONObject o = new JSONObject();
                o.put("position", pos == null ? 0.0 : pos);
                o.put("duration", dur == null ? 0.0 : dur);
                o.put("paused", paused != null && paused);
                o.put("volume", vol == null ? 100 : vol);
                o.put("speed", spd == null ? 1.0 : spd);
                o.put("buffering", buf != null && buf);

                if (jsEmitter != null) {
                    jsEmitter.emit("mpv-state", o.toString());
                }
            } catch (Throwable t) {
                Log.w(TAG, "poll fail", t);
            }
            poll.postDelayed(this, 250);
        }
    };

    private final MPV.EventObserver observer = new MPV.EventObserver() {
        @Override public void eventProperty(String property) {}
        @Override public void eventProperty(String property, long value) {}
        @Override public void eventProperty(String property, boolean value) {}
        @Override public void eventProperty(String property, String value) {}
        @Override public void eventProperty(String property, double value) {}
        @Override public void eventProperty(String property, MPVNode value) {}

        @Override
        public void event(int eventId, MPVNode node) {
            if (eventId == MPV_EVENT_START_FILE) {
                if (jsEmitter != null) jsEmitter.emit("mpv-loading", "{}");
            } else if (eventId == MPV_EVENT_FILE_LOADED) {
                String title = "";
                double dur = 0.0;
                try {
                    title = mpv.getPropertyString("media-title");
                } catch (Throwable ignored) {}
                try {
                    Double d = mpv.getPropertyDouble("duration");
                    if (d != null) dur = d;
                } catch (Throwable ignored) {}

                try {
                    JSONObject o = new JSONObject();
                    o.put("title", title == null ? "" : title);
                    o.put("duration", dur);
                    if (jsEmitter != null) jsEmitter.emit("mpv-loaded", o.toString());
                } catch (Throwable ignored) {}

                // CRITICAL AUDIO FIX: Attach external audio stream as soon as video file finishes loading
                if (currentAudioUrl != null && !currentAudioUrl.isEmpty()) {
                    final String aUrl = currentAudioUrl;
                    currentAudioUrl = null;
                    try {
                        Log.i(TAG, "Attaching external audio on MPV_EVENT_FILE_LOADED: " + aUrl);
                        mpv.command(new String[]{"audio-add", aUrl, "select"});
                        mpv.setPropertyString("aid", "auto");
                        mpv.setPropertyBoolean("mute", false);
                    } catch (Throwable t) {
                        Log.e(TAG, "audio-add on MPV_EVENT_FILE_LOADED failed", t);
                    }
                }

                emitTracks();
                emitChapters();
            } else if (eventId == MPV_EVENT_END_FILE) {
                if (jsEmitter != null) jsEmitter.emit("mpv-ended", "{}");
            }
        }
    };

    public MpvPlayerView(Context context) {
        super(context);
        // CRITICAL FIX: Background MUST be transparent so SurfaceView beneath window is never blocked!
        setBackgroundColor(Color.TRANSPARENT);

        this.surfaceView = new SurfaceView(context);
        this.surfaceView.getHolder().addCallback(this);
        this.surfaceView.getHolder().setFormat(PixelFormat.RGBX_8888);
        addView(this.surfaceView, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER));

        setVisibility(View.GONE);
    }

    public void setJsEmitter(JsEmitter e) {
        this.jsEmitter = e;
    }

    private void ensureCore() {
        if (this.coreReady) return;
        try {
            this.mpv = new MPV();
            this.mpv.create(getContext().getApplicationContext());

            this.mpv.setOptionString("vo", "gpu");
            this.mpv.setOptionString("gpu-context", "android");
            this.mpv.setOptionString("opengl-es", "yes");
            this.mpv.setOptionString("force-window", "yes");
            this.mpv.setOptionString("hwdec", "auto-safe");
            this.mpv.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1");
            this.mpv.setOptionString("ao", "audiotrack,opensles");
            this.mpv.setOptionString("profile", "fast");
            this.mpv.setOptionString("video-sync", "audio");
            // 200MB BUFFER CACHE: desktop Syncplay ki tarah demuxer ko 200MiB tak
            // ahead readahead rakhne do taake slow network par playback ruke nahi.
            // readahead-secs itna bara ke sirf 200MB cap hi limit kare (60s rakha
            // tha to high bitrate par waqt ki limit pehle aa jati thi).
            this.mpv.setOptionString("demuxer-max-bytes", "209715200");
            this.mpv.setOptionString("demuxer-max-back-bytes", "67108864");
            this.mpv.setOptionString("demuxer-readahead-secs", "600");
            this.mpv.setOptionString("keep-open", "yes");
            this.mpv.setOptionString("input-default-bindings", "no");
            this.mpv.setOptionString("volume-max", "200");
            this.mpv.setOptionString("user-agent", "Mozilla/5.0 (Android) WatchPartyMPV/1.0");
            this.mpv.setOptionString("referrer", "https://www.youtube.com/");

            this.mpv.init();

            try {
                this.mpv.addObserver(this.observer);
            } catch (Throwable ignored) {}

            this.coreReady = true;
            Log.i(TAG, "libmpv core ready");

            if (this.surfaceReady) {
                attachSurface();
            }
            startPolling();
            flushPending();
        } catch (Throwable t) {
            Log.e(TAG, "libmpv init FAILED", t);
            this.coreReady = false;
            try {
                if (this.mpv != null) this.mpv.destroy();
            } catch (Throwable ignored) {}
            this.mpv = null;
            if (this.jsEmitter != null) {
                this.jsEmitter.emit("mpv-failed", "{\"error\":\"libmpv init fail\"}");
            }
        }
    }

    private void attachSurface() {
        try {
            if (this.mpv != null && this.surfaceView.getHolder().getSurface() != null && this.surfaceView.getHolder().getSurface().isValid()) {
                Log.i(TAG, "Attaching Surface to libmpv");
                this.mpv.attachSurface(this.surfaceView.getHolder().getSurface());
                this.mpv.setPropertyString("force-window", "yes");
                this.mpv.setPropertyString("vo", "gpu");
                this.mpv.setPropertyString("vid", "auto");
            }
        } catch (Throwable t) {
            Log.e(TAG, "attachSurface failed", t);
        }
    }

    public void reattachSurface() {
        if (!this.coreReady || !this.surfaceReady) return;
        attachSurface();
    }

    private void flushPending() {
        if (this.pendingVideoUrl != null && this.coreReady && this.surfaceReady) {
            String v = this.pendingVideoUrl;
            String a = this.pendingAudioUrl;
            this.pendingVideoUrl = null;
            this.pendingAudioUrl = null;
            loadNow(v, a);
        }
    }

    private void startPolling() {
        if (this.polling) return;
        this.polling = true;
        this.poll.postDelayed(this.pollTask, 250);
    }

    public void open(String videoUrl) {
        open(videoUrl, null);
    }

    public void open(String videoUrl, String audioUrl) {
        setVisibility(View.VISIBLE);
        ensureCore();
        this.pendingVideoUrl = videoUrl;
        this.pendingAudioUrl = audioUrl;
        if (this.coreReady && this.surfaceReady) {
            loadNow(videoUrl, audioUrl);
        }
    }

        private void loadNow(String videoUrl, String audioUrl) {
        try {
            this.pendingVideoUrl = null;
            this.pendingAudioUrl = null;
            this.currentAudioUrl = (audioUrl != null && !audioUrl.trim().isEmpty() && !audioUrl.equals(videoUrl)) ? audioUrl.trim() : null;

            boolean loadedWithOption = false;
            if (this.currentAudioUrl != null) {
                try {
                    this.mpv.command(new String[]{"loadfile", videoUrl, "replace", "-1", "audio-file=" + this.currentAudioUrl});
                    loadedWithOption = true;
                    Log.i(TAG, "loadfile with audio-file option: " + videoUrl);
                } catch (Throwable fallback) {
                    Log.w(TAG, "loadfile option fallback: " + fallback.getMessage());
                }
            }

            if (!loadedWithOption) {
                this.mpv.command(new String[]{"loadfile", videoUrl, "replace"});
            }

            this.mpv.setPropertyString("vid", "auto");
            this.mpv.setPropertyString("aid", "auto");
            this.mpv.setPropertyBoolean("mute", false);
            Log.i(TAG, "loadfile started: " + videoUrl + (this.currentAudioUrl != null ? " + audio: " + this.currentAudioUrl : ""));
        } catch (Throwable t) {
            Log.e(TAG, "loadfile failed", t);
            if (this.jsEmitter != null) {
                this.jsEmitter.emit("mpv-failed", "{\"error\":\"loadfile fail\"}");
            }
        }
    }

    public void play() {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.setPropertyBoolean("pause", false); } catch (Throwable ignored) {}
        }
    }

    public void pause() {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.setPropertyBoolean("pause", true); } catch (Throwable ignored) {}
        }
    }

    public void setPaused(boolean paused) {
        if (paused) pause(); else play();
    }

    public double getCurrentPosition() {
        if (!this.coreReady || this.mpv == null) return 0.0;
        try {
            Double d = this.mpv.getPropertyDouble("time-pos");
            return d != null ? d : 0.0;
        } catch (Throwable ignored) {
            return 0.0;
        }
    }

    public double getDuration() {
        if (!this.coreReady || this.mpv == null) return 0.0;
        try {
            Double d = this.mpv.getPropertyDouble("duration");
            return d != null ? d : 0.0;
        } catch (Throwable ignored) {
            return 0.0;
        }
    }

    public boolean isPaused() {
        if (!this.coreReady || this.mpv == null) return true;
        try {
            Boolean b = this.mpv.getPropertyBoolean("pause");
            return b != null ? b : true;
        } catch (Throwable ignored) {
            return true;
        }
    }

    /**
     * DEBUG HUD -- screen ke ooper live numbers. Sirf napne ke liye.
     */
    private long hudGap; private double hudPos; private double hudDelta;
    private boolean hudPaused; private boolean hudBuf;
    private double hudCacheSec = -1.0; private double hudCacheMB = -1.0;

    private void updateDebugHud(long gap, double pos, double posDelta,
                                boolean paused, boolean buffering) {
        this.hudGap = gap; this.hudPos = pos; this.hudDelta = posDelta;
        this.hudPaused = paused; this.hudBuf = buffering;
        renderHud();
    }

    private void renderHud() {
        long gap = this.hudGap; double pos = this.hudPos;
        double posDelta = this.hudDelta; boolean paused = this.hudPaused;
        boolean buffering = this.hudBuf;
        try {
            if (this.debugHud == null) {
                this.debugHud = new android.widget.TextView(getContext());
                this.debugHud.setTextColor(0xFF00FF66);
                this.debugHud.setBackgroundColor(0xCC000000);
                this.debugHud.setTextSize(10.0f);
                this.debugHud.setPadding(10, 6, 10, 6);
                this.debugHud.setTypeface(android.graphics.Typeface.MONOSPACE);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT);
                lp.gravity = Gravity.TOP | Gravity.START;
                lp.topMargin = 4;
                lp.leftMargin = 4;
                addView(this.debugHud, lp);
            }
            String s =
                "POLL gap=" + gap + "ms  max=" + this.maxGap + "ms  >400ms x" + this.gapOver400 + "\n"
              + "time-pos=" + String.format(java.util.Locale.US, "%.3f", pos)
              + "  delta=" + String.format(java.util.Locale.US, "%+.3f", posDelta) + "\n"
              + "dikhta=" + String.format(java.util.Locale.US, "%02d:%02d",
                    (int) (pos / 60), ((int) pos) % 60)
              + "   badla x" + this.secondFlips + "   2s-jump x" + this.jump2s + "\n"
              + "paused=" + paused + "  buffering=" + buffering + "  polls=" + this.pollCount + "\n"
              + "seek x" + this.seekCount + " (" + this.lastSeekInfo + "s)"
              + "  ff x" + this.ffCount + "  rw x" + this.rwCount + "  rb x" + this.rawBack
              + "  act=" + this.lastAct + "\n"
              + (this.hudCacheSec >= 0
                    ? "cache=+" + String.format(java.util.Locale.US, "%.0f", this.hudCacheSec) + "s"
                    : "cache=-")
              + (this.hudCacheMB >= 0
                    ? " (" + String.format(java.util.Locale.US, "%.0f", this.hudCacheMB) + "MB)"
                    : "")
              + " / 200MB cap";
            this.debugHud.setText(s);
            this.debugHud.bringToFront();
        } catch (Throwable ignored) {
        }
    }

    /** DEBUG: sync action counter (MainActivity syncplay-sync-action se bhejta hai) */
    public void noteSyncAction(String action, String by) {
        if (action == null) return;
        if ("fast-forward".equals(action)) this.ffCount++;
        else if ("rewind".equals(action)) this.rwCount++;
        this.lastAct = action + (by == null ? "" : "(" + by + ")");
        renderHud();
    }

    /** DEBUG: counters sifar karo */
    public void resetDebugStats() {
        this.maxGap = 0L;
        this.gapOver400 = 0;
        this.secondFlips = 0;
        this.jump2s = 0;
        this.pollCount = 0;
    }

    /**
     * SLOW-PEER PRIORITY: kya mpv is waqt cache bharne ka intezaar kar raha hai.
     * Poll loop (250ms) ise refresh karta hai. Live property bhi parhi jati hai
     * taake do poll ke darmiyan ka waqfa bhi cover ho jaye.
     */
    public boolean isBuffering() {
        if (!this.coreReady || this.mpv == null) return false;
        try {
            Boolean b = this.mpv.getPropertyBoolean("paused-for-cache");
            if (b != null) {
                this.buffering = b;
                return b;
            }
        } catch (Throwable ignored) {
            // property abhi mayassar nahi -- aakhri poll wali value par bharosa karo
        }
        return this.buffering;
    }

    public boolean hasMedia() {
        if (!this.coreReady || this.mpv == null) return false;
        try {
            Integer count = this.mpv.getPropertyInt("playlist-count");
            return count != null && count > 0;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public void seekTo(double seconds) {
        // DEBUG: har seek ko gino taake 2s-jump ka culprit pakra jaye
        this.seekCount++;
        double d = seconds - (this.lastPollPos < 0 ? 0.0 : this.lastPollPos);
        this.lastSeekInfo = String.format(java.util.Locale.US, "%+.1f", d);
        if (this.coreReady && this.mpv != null) {
            try {
                this.mpv.setPropertyDouble("time-pos", Math.max(0.0, seconds));
            } catch (Throwable t) {
                try {
                    this.mpv.command(new String[]{"seek", String.valueOf(seconds), "absolute"});
                } catch (Throwable ignored) {}
            }
        }
    }

    public void seekRelative(double delta) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.command(new String[]{"seek", String.valueOf(delta), "relative"}); } catch (Throwable ignored) {}
        }
    }

    public void setVolume(int percent) {
        if (this.coreReady && this.mpv != null) {
            int v = Math.max(0, Math.min(200, percent));
            try { this.mpv.setPropertyInt("volume", v); } catch (Throwable ignored) {}
        }
    }

    public void setSpeed(double speed) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.setPropertyDouble("speed", Math.max(0.25, Math.min(4.0, speed))); } catch (Throwable ignored) {}
        }
    }

    public void setAspectRatio(String mode) {
        if (!this.coreReady || this.mpv == null) return;
        try {
            if ("crop".equalsIgnoreCase(mode) || "cover".equalsIgnoreCase(mode)) {
                this.mpv.setPropertyString("keepaspect", "yes");
                this.mpv.setPropertyString("video-aspect-override", "-1");
                this.mpv.setPropertyDouble("panscan", 1.0);
            } else if ("stretch".equalsIgnoreCase(mode) || "fill".equalsIgnoreCase(mode)) {
                this.mpv.setPropertyDouble("panscan", 0.0);
                this.mpv.setPropertyString("keepaspect", "no");
                this.mpv.setPropertyString("video-aspect-override", "-1");
            } else if ("fit".equalsIgnoreCase(mode) || "contain".equalsIgnoreCase(mode)) {
                this.mpv.setPropertyDouble("panscan", 0.0);
                this.mpv.setPropertyString("keepaspect", "yes");
                this.mpv.setPropertyString("video-aspect-override", "-1");
            } else if (mode != null && (mode.contains("2.35") || mode.toLowerCase().contains("pan"))) {
                this.mpv.setPropertyString("keepaspect", "yes");
                this.mpv.setPropertyString("video-aspect-override", "2.35:1");
                this.mpv.setPropertyDouble("panscan", 1.0);
            } else if (mode != null && !mode.isEmpty()) {
                String normalized = mode.replace('/', ':');
                this.mpv.setPropertyDouble("panscan", 0.0);
                this.mpv.setPropertyString("keepaspect", "yes");
                this.mpv.setPropertyString("video-aspect-override", normalized);
            } else {
                this.mpv.setPropertyDouble("panscan", 0.0);
                this.mpv.setPropertyString("keepaspect", "yes");
                this.mpv.setPropertyString("video-aspect-override", "-1");
            }
        } catch (Throwable t) {
            Log.w(TAG, "setAspectRatio fail", t);
        }
    }

    public void setSubScale(double scale) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.setPropertyDouble("sub-scale", Math.max(0.3, Math.min(3.0, scale))); } catch (Throwable ignored) {}
        }
    }

    public void setSubDelay(double seconds) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.setPropertyDouble("sub-delay", Math.max(-10.0, Math.min(10.0, seconds))); } catch (Throwable ignored) {}
        }
    }

    public void setAudioDelay(double seconds) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.setPropertyDouble("audio-delay", Math.max(-10.0, Math.min(10.0, seconds))); } catch (Throwable ignored) {}
        }
    }

    public void setAudioTrack(int id) {
        if (this.coreReady && this.mpv != null) {
            try {
                if (id < 0) this.mpv.setPropertyString("aid", "no");
                else this.mpv.setPropertyInt("aid", id);
            } catch (Throwable ignored) {}
            emitTracks();
        }
    }

    public void setSubTrack(int id) {
        if (this.coreReady && this.mpv != null) {
            try {
                if (id < 0) this.mpv.setPropertyString("sid", "no");
                else this.mpv.setPropertyInt("sid", id);
            } catch (Throwable ignored) {}
            emitTracks();
        }
    }

    public void jumpChapter(double timeSec) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.command(new String[]{"seek", String.valueOf(timeSec), "absolute"}); } catch (Throwable ignored) {}
        }
    }

    public String getTracksJson() {
        JSONObject out = new JSONObject();
        try {
            JSONArray audioArr = new JSONArray();
            JSONArray subArr = new JSONArray();
            out.put("audio", audioArr);
            out.put("sub", subArr);

            if (this.coreReady && this.mpv != null) {
                MPVNode trackList = this.mpv.getPropertyNode("track-list");
                if (trackList != null && trackList.asArray() != null) {
                    for (MPVNode item : trackList.asArray()) {
                        String type = item.get("type") != null ? item.get("type").asString() : "";
                        if (!"audio".equals(type) && !"sub".equals(type)) continue;

                        long id = item.get("id") != null ? item.get("id").asInt().longValue() : -1L;
                        String lang = item.get("lang") != null ? item.get("lang").asString() : "";
                        String title = item.get("title") != null ? item.get("title").asString() : "";
                        String codec = item.get("codec") != null ? item.get("codec").asString() : "";
                        boolean selected = Boolean.TRUE.equals(item.get("selected") != null ? item.get("selected").asBoolean() : false);
                        boolean forced = Boolean.TRUE.equals(item.get("forced") != null ? item.get("forced").asBoolean() : false);
                        boolean external = Boolean.TRUE.equals(item.get("external") != null ? item.get("external").asBoolean() : false);

                        String name = (title != null && !title.isEmpty()) ? title
                                : ((lang != null && !lang.isEmpty()) ? lang : "Track " + id);

                        JSONObject t = new JSONObject();
                        t.put("id", id);
                        t.put("name", name);
                        t.put("lang", lang != null ? lang : "");
                        t.put("codec", codec != null ? codec : "");
                        t.put("selected", selected);
                        t.put("forced", forced);
                        t.put("external", external);

                        if ("audio".equals(type)) audioArr.put(t);
                        else subArr.put(t);
                    }
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "tracks parse fail", t);
        }
        return out.toString();
    }

    private void emitTracks() {
        if (this.jsEmitter == null) return;
        this.poll.post(() -> {
            try {
                this.jsEmitter.emit("mpv-tracks", getTracksJson());
            } catch (Throwable ignored) {}
        });
    }

    public String getChaptersJson() {
        JSONArray out = new JSONArray();
        if (this.coreReady && this.mpv != null) {
            try {
                MPVNode node = this.mpv.getPropertyNode("chapter-list");
                if (node != null && node.asArray() != null) {
                    int idx = 1;
                    for (MPVNode item : node.asArray()) {
                        String title = item.get("title") != null ? item.get("title").asString() : null;
                        double time = item.get("time") != null && item.get("time").asDouble() != null ? item.get("time").asDouble() : 0.0;
                        if (title == null || title.isEmpty()) {
                            title = "Chapter " + idx;
                        }
                        JSONObject c = new JSONObject();
                        c.put("title", title);
                        c.put("time", time);
                        out.put(c);
                        idx++;
                    }
                }
            } catch (Throwable t) {
                Log.w(TAG, "chapters parse fail", t);
            }
        }
        return out.toString();
    }

    private void emitChapters() {
        if (this.jsEmitter == null) return;
        this.poll.post(() -> {
            try {
                this.jsEmitter.emit("mpv-chapters", getChaptersJson());
            } catch (Throwable ignored) {}
        });
    }

    public void closePlayer() {
        try {
            if (this.coreReady && this.mpv != null) {
                this.mpv.command(new String[]{"stop"});
            }
        } catch (Throwable ignored) {}
        setVisibility(View.GONE);
    }

    public void destroyPlayer() {
        this.polling = false;
        this.poll.removeCallbacksAndMessages(null);
        try {
            if (this.mpv != null) {
                this.mpv.removeObserver(this.observer);
                this.mpv.detachSurface();
                this.mpv.destroy();
            }
        } catch (Throwable ignored) {}
        this.coreReady = false;
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        this.surfaceReady = true;
        if (this.coreReady) {
            attachSurface();
        }
        flushPending();
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        if (this.coreReady && this.mpv != null) {
            try {
                // Pass exact surface dimensions to mpv so it scales and aligns properly
                this.mpv.setPropertyString("android-surface-size", width + "x" + height);
            } catch (Throwable ignored) {}
        }
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        this.surfaceReady = false;
        if (this.coreReady && this.mpv != null) {
            try {
                this.mpv.setPropertyString("vo", "null");
                this.mpv.setPropertyString("force-window", "no");
                this.mpv.detachSurface();
            } catch (Throwable ignored) {}
        }
    }
}
