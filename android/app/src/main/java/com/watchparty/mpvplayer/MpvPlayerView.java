package com.watchparty.mpvplayer;

import android.content.Context;
import android.graphics.Color;
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
    private JsEmitter jsEmitter;
    private final SurfaceView surfaceView;
    private final Handler poll = new Handler(Looper.getMainLooper());
    private boolean polling = false;

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
            this.mpv.setOptionString("force-window", "yes");
            this.mpv.setOptionString("hwdec", "auto-safe");
            this.mpv.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1");
            this.mpv.setOptionString("ao", "audiotrack,opensles");
            this.mpv.setOptionString("profile", "fast");
            this.mpv.setOptionString("video-sync", "audio");
            this.mpv.setOptionString("demuxer-max-bytes", "67108864");
            this.mpv.setOptionString("demuxer-max-back-bytes", "67108864");
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
            this.mpv.command(new String[]{"loadfile", videoUrl, "replace"});
            if (audioUrl != null && !audioUrl.trim().isEmpty() && !audioUrl.equals(videoUrl)) {
                this.mpv.command(new String[]{"audio-add", audioUrl, "select"});
            }
            this.mpv.setPropertyString("vid", "auto");
            Log.i(TAG, "loadfile: " + videoUrl + (audioUrl != null ? " + audio: " + audioUrl : ""));
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

    public void seekTo(double seconds) {
        if (this.coreReady && this.mpv != null) {
            try { this.mpv.command(new String[]{"seek", String.valueOf(seconds), "absolute"}); } catch (Throwable ignored) {}
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
