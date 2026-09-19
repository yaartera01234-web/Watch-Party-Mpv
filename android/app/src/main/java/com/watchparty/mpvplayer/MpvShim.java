package com.watchparty.mpvplayer;

import android.content.Context;
import android.view.Surface;
import io.github.yuroyami.libmpvkt.MPVLib;

/**
 * YUROYAMI libmpvKt adapter (syncplay-android wala mpv engine: mpv 0.41,
 * FFmpeg 9, dav1d, libass -- public CI built natives). Purana engine
 * abdallahmehiz ka mpv-android fork tha; ab native stack bilkul wahi hai
 * jo yuroyami ka Syncplay Android use karta hai.
 *
 * MpvPlayerView ki purani instance-API isi shim ke upar chalti hai.
 */
public class MpvShim {
    public interface EventObserver {
        void eventProperty(String property);
        void eventProperty(String property, long value);
        void event(int eventId);
    }

    private EventObserver obs;

    private final MPVLib.EventObserver forward = new MPVLib.EventObserver() {
        @Override public void eventProperty(String property) {
            if (obs != null) obs.eventProperty(property);
        }
        @Override public void eventProperty(String property, long value) {
            if (obs != null) obs.eventProperty(property, value);
        }
        @Override public void eventProperty(String property, boolean value) {}
        @Override public void eventProperty(String property, String value) {}
        @Override public void eventProperty(String property, double value) {}
        @Override public void event(int eventId) {
            if (obs != null) obs.event(eventId);
        }
    };

    public void create(Context ctx) { MPVLib.INSTANCE.create(ctx); }
    public void init() { MPVLib.INSTANCE.init(); }
    public void destroy() { MPVLib.INSTANCE.destroy(); }
    public void attachSurface(Surface s) { MPVLib.INSTANCE.attachSurface(s); }
    public void detachSurface() { MPVLib.INSTANCE.detachSurface(); }
    public void setOptionString(String n, String v) { MPVLib.INSTANCE.setOptionString(n, v); }
    public void setPropertyString(String n, String v) { MPVLib.INSTANCE.setPropertyString(n, v); }
    public void setPropertyBoolean(String n, boolean v) { MPVLib.INSTANCE.setPropertyBoolean(n, v); }
    public void setPropertyDouble(String n, double v) { MPVLib.INSTANCE.setPropertyDouble(n, v); }
    public void setPropertyInt(String n, int v) { MPVLib.INSTANCE.setPropertyInt(n, v); }
    public String getPropertyString(String n) { return MPVLib.INSTANCE.getPropertyString(n); }
    public Double getPropertyDouble(String n) { return MPVLib.INSTANCE.getPropertyDouble(n); }
    public Boolean getPropertyBoolean(String n) { return MPVLib.INSTANCE.getPropertyBoolean(n); }
    public Integer getPropertyInt(String n) { return MPVLib.INSTANCE.getPropertyInt(n); }
    public void command(String[] cmd) { MPVLib.INSTANCE.command(cmd); }

    public void addObserver(EventObserver o) {
        this.obs = o;
        MPVLib.addObserver(this.forward);
    }
    public void removeObserver(EventObserver o) {
        MPVLib.removeObserver(this.forward);
        this.obs = null;
    }
}
