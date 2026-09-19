package com.watchparty.mpvplayer;

import android.content.Context;
import android.view.Surface;
import is.xyz.mpv.MPV;
import is.xyz.mpv.MPVNode;

/**
 * PURANA mpv engine adapter (abdallahmehiz mpv-android-lib 0.1.12 --
 * #54 wala engine, jo purane/32-bit Android 8 phones par chalta hai).
 * V79: user ke hukm par engine wapas purana; sync layer bilkul untouched.
 *
 * Facade surface bilkul wahi hai jo MpvPlayerView use karti hai --
 * MpvPlayerView ka ek line bhi nahi badla.
 */
public class MpvShim {
    public interface EventObserver {
        void eventProperty(String property);
        void eventProperty(String property, long value);
        void event(int eventId);
    }

    private final MPV mpv = new MPV();
    private EventObserver obs;

    private final MPV.EventObserver forward = new MPV.EventObserver() {
        @Override public void eventProperty(String property) {
            if (obs != null) obs.eventProperty(property);
        }
        @Override public void eventProperty(String property, long value) {
            if (obs != null) obs.eventProperty(property, value);
        }
        @Override public void eventProperty(String property, boolean value) {}
        @Override public void eventProperty(String property, String value) {}
        @Override public void eventProperty(String property, double value) {}
        @Override public void eventProperty(String property, MPVNode value) {}
        @Override public void event(int eventId) {
            if (obs != null) obs.event(eventId);
        }
    };

    public void create(Context ctx) { mpv.create(ctx); }
    public void init() { mpv.init(); }
    public void destroy() { mpv.destroy(); }
    public void attachSurface(Surface s) { mpv.attachSurface(s); }
    public void detachSurface() { try { mpv.detachSurface(); } catch (Throwable ignored) {} }
    public void setOptionString(String n, String v) { mpv.setOptionString(n, v); }
    public void setPropertyString(String n, String v) { mpv.setPropertyString(n, v); }
    public void setPropertyBoolean(String n, boolean v) { mpv.setPropertyBoolean(n, v); }
    public void setPropertyDouble(String n, double v) { mpv.setPropertyDouble(n, v); }
    public void setPropertyInt(String n, int v) { mpv.setPropertyInt(n, v); }
    public String getPropertyString(String n) { return mpv.getPropertyString(n); }
    public Double getPropertyDouble(String n) { return mpv.getPropertyDouble(n); }
    public Boolean getPropertyBoolean(String n) { return mpv.getPropertyBoolean(n); }
    public Integer getPropertyInt(String n) { return mpv.getPropertyInt(n); }
    public void command(String[] cmd) { mpv.command(cmd); }

    public void addObserver(EventObserver o) {
        this.obs = o;
        mpv.addObserver(this.forward);
    }
    public void removeObserver(EventObserver o) {
        mpv.removeObserver(this.forward);
        this.obs = null;
    }
}
