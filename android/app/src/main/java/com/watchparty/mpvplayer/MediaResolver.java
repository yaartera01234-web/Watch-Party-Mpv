package com.watchparty.mpvplayer;

import android.os.Handler;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamType;
import org.schabi.newpipe.extractor.stream.VideoStream;

public final class MediaResolver {
    private static final String TAG = "MediaResolver";
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static volatile boolean newpipeReady = false;

    public static class ResolvedMedia {
        public final String videoUrl;
        public final String audioUrl; // Can be null if stream is already muxed
        public final String title;
        public final double duration;

        public ResolvedMedia(String videoUrl, String audioUrl, String title, double duration) {
            this.videoUrl = videoUrl;
            this.audioUrl = audioUrl;
            this.title = title != null ? title : "";
            this.duration = duration;
        }
    }

    public interface Callback {
        void onResolved(ResolvedMedia media);
        void onFailed(String reason);
    }

    private MediaResolver() {}

    public static boolean urlLooksLikeDirectMedia(String url) {
        if (url == null) return false;
        String p = url;
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        int h = p.indexOf('#');
        if (h >= 0) p = p.substring(0, h);
        String lower = p.toLowerCase();
        String[] exts = {
            ".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".flv", ".wmv",
            ".3gp", ".ts", ".mts", ".m2ts", ".mpg", ".mpeg", ".vob", ".m3u8",
            ".mpd", ".mp3", ".m4a", ".ogg", ".oga", ".opus", ".flac", ".wav", ".aac"
        };
        for (String e : exts) {
            if (lower.endsWith(e)) return true;
        }
        return false;
    }

    private static void ensureNewPipe() throws Exception {
        if (newpipeReady) return;
        synchronized (MediaResolver.class) {
            if (newpipeReady) return;
            NewPipe.init(new SimpleHttpDownloader());
            newpipeReady = true;
            Log.i(TAG, "NewPipe initialized");
        }
    }

    private static final class SimpleHttpDownloader extends Downloader {
        @Override
        public Response execute(Request request) throws IOException {
            HttpURLConnection c = (HttpURLConnection) new URL(request.url()).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            try {
                Map<String, List<String>> reqHeaders = request.headers();
                if (reqHeaders != null) {
                    for (Map.Entry<String, List<String>> e : reqHeaders.entrySet()) {
                        if (e.getValue() != null) {
                            for (String v : e.getValue()) {
                                c.addRequestProperty(e.getKey(), v);
                            }
                        }
                    }
                }
                c.setRequestMethod(request.httpMethod());
                byte[] body = request.dataToSend();
                if (body != null && body.length > 0) {
                    c.setDoOutput(true);
                    c.getOutputStream().write(body);
                    c.getOutputStream().flush();
                    c.getOutputStream().close();
                }
                int code = c.getResponseCode();
                InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                String text = readAll(is);
                Map<String, List<String>> respHeaders = c.getHeaderFields();
                String message = c.getResponseMessage();
                String latestUrl = c.getURL().toString();
                return new Response(code, message, respHeaders, text, latestUrl);
            } finally {
                c.disconnect();
            }
        }

        private static String readAll(InputStream is) throws IOException {
            if (is == null) return "";
            ByteArrayOutputStream bout = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            while (true) {
                int n = is.read(buf);
                if (n == -1) {
                    is.close();
                    return new String(bout.toByteArray(), StandardCharsets.UTF_8);
                }
                bout.write(buf, 0, n);
            }
        }
    }

    public static void resolveAsync(final String pageUrl, final Handler ui, final Callback cb) {
        IO.execute(() -> {
            ResolvedMedia media = null;
            String failReason = null;
            try {
                ensureNewPipe();
                StreamInfo info = StreamInfo.getInfo(pageUrl);
                media = pickStreams(info);
                if (media == null) {
                    failReason = "koi direct stream nahi mili";
                }
            } catch (Throwable t) {
                failReason = t.getClass().getSimpleName() + ": " + t.getMessage();
                Log.w(TAG, "resolve failed for " + pageUrl + " — " + failReason);
            }

            final ResolvedMedia fMedia = media;
            final String fFail = failReason;
            ui.post(() -> {
                if (fMedia == null) {
                    cb.onFailed(fFail == null ? "unknown" : fFail);
                } else {
                    cb.onResolved(fMedia);
                }
            });
        });
    }

    private static ResolvedMedia pickStreams(StreamInfo info) {
        String title = info.getName() != null ? info.getName() : "";
        double duration = info.getDuration() > 0 ? (double) info.getDuration() : 0.0;

        // 1. Live stream (HLS)
        StreamType st = info.getStreamType();
        if (st == StreamType.LIVE_STREAM || st == StreamType.AUDIO_LIVE_STREAM) {
            String hls = info.getHlsUrl();
            if (hls != null && !hls.isEmpty()) {
                return new ResolvedMedia(hls, null, title, duration);
            }
        }

        // Best Audio Stream (for pairing with adaptive video stream)
        AudioStream bestAudio = null;
        List<AudioStream> audios = info.getAudioStreams();
        if (audios != null && !audios.isEmpty()) {
            for (AudioStream a : audios) {
                if (bestAudio == null || a.getAverageBitrate() > bestAudio.getAverageBitrate()) {
                    bestAudio = a;
                }
            }
        }
        String audioUrl = (bestAudio != null) ? bestAudio.getContent() : null;

        // 2. Check for high quality muxed video streams (>= 720p with audio included)
        List<VideoStream> muxedVideos = info.getVideoStreams();
        VideoStream bestMuxed = null;
        int bestMuxedH = -1;
        if (muxedVideos != null && !muxedVideos.isEmpty()) {
            for (VideoStream v : muxedVideos) {
                int h = v.getHeight();
                if (isH264(v) && h >= 720 && h > bestMuxedH) {
                    bestMuxedH = h;
                    bestMuxed = v;
                }
            }
            if (bestMuxed == null) {
                for (VideoStream v : muxedVideos) {
                    int h = v.getHeight();
                    if (h > bestMuxedH) {
                        bestMuxedH = h;
                        bestMuxed = v;
                    }
                }
            }
        }

        if (bestMuxed != null && bestMuxedH >= 720 && bestMuxed.getContent() != null) {
            return new ResolvedMedia(bestMuxed.getContent(), null, title, duration);
        }

        // 3. Adaptive Video Only streams (1080p, 720p paired with external audio)
        // CRITICAL FIX: Modern YouTube has separated video and audio streams!
        List<VideoStream> videoOnly = info.getVideoOnlyStreams();
        VideoStream bestVideoOnly = null;
        int bestVOH = -1;
        if (videoOnly != null && !videoOnly.isEmpty()) {
            for (VideoStream v : videoOnly) {
                int h = v.getHeight();
                if (isH264(v) && h <= 1080 && h > bestVOH) {
                    bestVOH = h;
                    bestVideoOnly = v;
                }
            }
            if (bestVideoOnly == null) {
                for (VideoStream v : videoOnly) {
                    int h = v.getHeight();
                    if (h <= 1080 && h > bestVOH) {
                        bestVOH = h;
                        bestVideoOnly = v;
                    }
                }
            }
        }

        if (bestVideoOnly != null && bestVideoOnly.getContent() != null) {
            return new ResolvedMedia(bestVideoOnly.getContent(), audioUrl, title, duration);
        }

        // 4. Fallback to any muxed video
        if (bestMuxed != null && bestMuxed.getContent() != null) {
            return new ResolvedMedia(bestMuxed.getContent(), null, title, duration);
        }

        // 5. Fallback to audio stream if this is audio-only media
        if (audioUrl != null) {
            return new ResolvedMedia(audioUrl, null, title, duration);
        }

        return null;
    }

    private static boolean isH264(VideoStream v) {
        try {
            String c = v.getCodec();
            if (c != null) {
                String cl = c.toLowerCase();
                if (cl.contains("h264") || cl.contains("avc") || cl.contains("mp4")) return true;
            }
            String url = v.getContent();
            return url != null && (url.contains(".mp4") || url.contains("mime=video%2Fmp4"));
        } catch (Throwable ignored) {
            return false;
        }
    }
}
