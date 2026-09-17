package com.watchparty.mpvplayer;

import android.content.Context;
import android.util.Log;
import java.lang.reflect.Method;

public class MpvPlayerView {
    private static final String TAG = "MpvPlayerView";
    private final Context context;
    private Object mpv;
    private boolean initialized;

    public MpvPlayerView(Context context) { this.context = context.getApplicationContext(); }

    public void initialize() {
        if (initialized) return;
        try {
            Class<?> type = Class.forName("org.mpv.MPVLib");
            mpv = type.getDeclaredConstructor().newInstance();
            initialized = true;
        } catch (Exception e) { Log.e(TAG, "MPV library unavailable", e); }
    }

    public void load(String url) { command(new String[]{"loadfile", url, "replace"}); }
    public void play() { command(new String[]{"set", "pause", "no"}); }
    public void pause() { command(new String[]{"set", "pause", "yes"}); }
    public void seekTo(double seconds) { command(new String[]{"seek", String.valueOf(seconds), "absolute"}); }
    public void setVolume(int volume) { command(new String[]{"set", "volume", String.valueOf(volume)}); }
    public void setPlaybackSpeed(double speed) { command(new String[]{"set", "speed", String.valueOf(speed)}); }

    private void command(String[] args) {
        initialize();
        if (!initialized || mpv == null) return;
        try {
            Method method = mpv.getClass().getMethod("command", String[].class);
            method.invoke(mpv, (Object) args);
        } catch (Exception e) { Log.e(TAG, "MPV command failed", e); }
    }

    public void destroy() {
        if (mpv == null) return;
        try { mpv.getClass().getMethod("shutdown").invoke(mpv); }
        catch (Exception e) { Log.e(TAG, "MPV shutdown failed", e); }
        mpv = null; initialized = false;
    }
}
