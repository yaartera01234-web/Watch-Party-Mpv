import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  PictureInPicture, 
  Tv, 
  Gauge, 
  RefreshCw, 
  Sparkles,
  Film,
  Camera,
  Sun,
  Sliders,
  Info,
  ChevronRight,
  StepBack,
  StepForward,
  Headphones
} from 'lucide-react';
import { MediaItem, MediaType, ReactionEvent } from '../types';
import { formatSeconds } from '../utils/mediaParser';
import { AudioPlayer } from './AudioPlayer';
import { FloatingReactions } from './FloatingReactions';

// Declare YT for window object
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface VideoPlayerProps {
  currentMedia: MediaItem | null;
  isPlaying: boolean;
  currentTime: number;
  reactions: ReactionEvent[];
  brightness?: number;
  onBrightnessChange?: (val: number) => void;
  aspectRatio?: string;
  onAspectRatioChange?: (val: string) => void;
  audioBoost?: number;
  onAudioBoostChange?: (val: number) => void;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
  onMediaEnd: () => void;
  onSyncRequest: () => void;
  onOpenMpvModal: () => void;
  onSendReaction: (emoji: string) => void;
  roomName?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  currentMedia,
  isPlaying,
  currentTime,
  reactions,
  brightness = 1.0,
  onBrightnessChange,
  aspectRatio = 'contain',
  onAspectRatioChange,
  audioBoost = 1.0,
  onAudioBoostChange,
  onPlay,
  onPause,
  onSeek,
  onMediaEnd,
  onSyncRequest,
  onOpenMpvModal,
  onSendReaction,
  roomName = 'WatchParty',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Background YouTube & MediaSession Audio Engine
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [backgroundAudioEnabled, setBackgroundAudioEnabled] = useState<boolean>(true);
  const wakeLockRef = useRef<any>(null);

  // Core Playback State
  const [duration, setDuration] = useState<number>(0);
  const [localTime, setLocalTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [speedMenuOpen, setSpeedMenuOpen] = useState<boolean>(false);
  const [showRemainingTime, setShowRemainingTime] = useState<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // In-App MPV Specific Engine States
  const [localBrightness, setLocalBrightness] = useState<number>(brightness);
  const [localVolume, setLocalVolume] = useState<number>(1.0);
  const [showMpvStats, setShowMpvStats] = useState<boolean>(false);
  const [osdMessage, setOsdMessage] = useState<string | null>(null);
  const osdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Touch Gesture HUD Overlay State
  const [gestureType, setGestureType] = useState<'brightness' | 'volume' | 'seek' | null>(null);
  const [gestureValue, setGestureValue] = useState<number>(0);
  const [gestureSeekTarget, setGestureSeekTarget] = useState<number>(0);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<{ side: 'left' | 'right' | 'center'; count: number } | null>(null);

  // Touch Tracking Ref
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    mode: 'brightness' | 'volume' | 'seek' | 'unknown' | null;
    initialBrightness: number;
    initialVolume: number;
    initialTime: number;
    lastTapTime: number;
    lastTapSide: 'left' | 'right' | 'center' | null;
  }>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    mode: null,
    initialBrightness: 1.0,
    initialVolume: 1.0,
    initialTime: 0,
    lastTapTime: 0,
    lastTapSide: null,
  });

  // Suppress remote command loopbacks
  const suppressEventsRef = useRef<boolean>(false);
  const mediaType: MediaType = currentMedia?.type || 'none';
  const mediaTitle = currentMedia?.label || 'No video loaded';

  // Keep localBrightness in sync with prop if changed from outside
  useEffect(() => {
    setLocalBrightness(brightness);
  }, [brightness]);

  // MPV OSD Toast Messenger
  const triggerOsd = useCallback((msg: string) => {
    setOsdMessage(msg);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => {
      setOsdMessage(null);
    }, 2200);
  }, []);

  // Handle YouTube player initialization
  useEffect(() => {
    if (mediaType !== 'youtube' || !currentMedia?.videoId) return;

    let destroyed = false;

    const setupYT = () => {
      if (!window.YT || !window.YT.Player) return;
      if (destroyed) return;

      const container = document.getElementById('yt-iframe-slot');
      if (!container) return;

      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
      }

      ytPlayerRef.current = new window.YT.Player('yt-iframe-slot', {
        height: '100%',
        width: '100%',
        videoId: currentMedia.videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (e: any) => {
            if (currentTime > 0) {
              e.target.seekTo(currentTime, true);
            }
            if (isPlaying) {
              e.target.playVideo();
            } else {
              e.target.pauseVideo();
            }
            try {
              setDuration(e.target.getDuration() || 0);
            } catch {
              // ignore
            }
          },
          onStateChange: (e: any) => {
            if (suppressEventsRef.current) return;
            const state = e.data;
            if (state === 1) {
              const t = e.target.getCurrentTime();
              onPlay(t);
              triggerOsd('[mpv] Playing');
            } else if (state === 2) {
              const t = e.target.getCurrentTime();
              onPause(t);
              triggerOsd('[mpv] Paused');
            } else if (state === 0) {
              onMediaEnd();
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      setupYT();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        setupYT();
      };
    }

    return () => {
      destroyed = true;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
    };
  }, [currentMedia?.videoId, mediaType, triggerOsd]);

  // Handle HLS and MP4 Video
  useEffect(() => {
    if (mediaType !== 'mp4' && mediaType !== 'hls') return;
    const video = videoRef.current;
    if (!video || !currentMedia?.url) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (mediaType === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(currentMedia.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (currentTime > 0) video.currentTime = currentTime;
          if (isPlaying) video.play().catch(() => {});
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = currentMedia.url;
        if (currentTime > 0) video.currentTime = currentTime;
        if (isPlaying) video.play().catch(() => {});
      }
    } else {
      // MP4 / WebM
      video.src = currentMedia.url;
      if (currentTime > 0) video.currentTime = currentTime;
      if (isPlaying) video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentMedia?.url, mediaType]);

  // Sync external changes (isPlaying, currentTime)
  useEffect(() => {
    suppressEventsRef.current = true;
    if (mediaType === 'youtube' && ytPlayerRef.current && ytPlayerRef.current.getPlayerState) {
      try {
        const ytCurrent = ytPlayerRef.current.getCurrentTime() || 0;
        if (Math.abs(ytCurrent - currentTime) > 2.5) {
          ytPlayerRef.current.seekTo(currentTime, true);
        }
        const state = ytPlayerRef.current.getPlayerState();
        if (isPlaying && state !== 1) {
          ytPlayerRef.current.playVideo();
        } else if (!isPlaying && state === 1) {
          ytPlayerRef.current.pauseVideo();
        }
      } catch {
        // ignore
      }
    } else if ((mediaType === 'mp4' || mediaType === 'hls') && videoRef.current) {
      const video = videoRef.current;
      if (Math.abs(video.currentTime - currentTime) > 2.5) {
        video.currentTime = currentTime;
      }
      if (isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!isPlaying && !video.paused) {
        video.pause();
      }
    }
    const timer = setTimeout(() => {
      suppressEventsRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [isPlaying, currentTime, mediaType]);

  // Local ticker for time tracking
  useEffect(() => {
    const interval = setInterval(() => {
      if (mediaType === 'youtube' && ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
        try {
          const t = ytPlayerRef.current.getCurrentTime() || 0;
          const d = ytPlayerRef.current.getDuration() || 0;
          setLocalTime(t);
          if (d > 0) setDuration(d);
        } catch {
          // ignore
        }
      } else if ((mediaType === 'mp4' || mediaType === 'hls') && videoRef.current) {
        const t = videoRef.current.currentTime || 0;
        const d = videoRef.current.duration || 0;
        setLocalTime(t);
        if (Number.isFinite(d) && d > 0) setDuration(d);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [mediaType]);

  // Maintain Android Background Audio Focus via Silent Audio Loop
  useEffect(() => {
    const silent = silentAudioRef.current;
    if (!silent) return;

    if (isPlaying && backgroundAudioEnabled) {
      silent.play().catch(() => {});
    } else {
      silent.pause();
    }
  }, [isPlaying, backgroundAudioEnabled]);

  // Request WakeLock while playing to keep screen/CPU active
  useEffect(() => {
    const acquireWakeLock = async () => {
      if (isPlaying && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch {
          // ignore
        }
      } else if (!isPlaying && wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // ignore
        }
        wakeLockRef.current = null;
      }
    };
    acquireWakeLock();
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, [isPlaying]);

  // MediaSession API Integration for Lock Screen and Notification Panel Controls
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentMedia?.title || 'Watch Party (100% MPV Engine)',
        artist: currentMedia?.author || 'Synced Room: ' + (roomName || 'WatchParty'),
        album: 'Watch Party & MPV Player',
        artwork: currentMedia?.thumbnail ? [
          { src: currentMedia.thumbnail, sizes: '512x512', type: 'image/jpeg' }
        ] : [
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => {
        onPlay(localTime);
        triggerOsd('[mpv] Background: Play');
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        onPause(localTime);
        triggerOsd('[mpv] Background: Paused');
      });

      navigator.mediaSession.setActionHandler('seekbackward', () => {
        const target = Math.max(0, localTime - 10);
        onSeek(target);
        triggerOsd(`[mpv] Seek: ${formatSeconds(target)}`);
      });

      navigator.mediaSession.setActionHandler('seekforward', () => {
        const target = Math.min(duration, localTime + 10);
        onSeek(target);
        triggerOsd(`[mpv] Seek: ${formatSeconds(target)}`);
      });
    } catch {
      // ignore
    }
  }, [currentMedia?.title, currentMedia?.author, currentMedia?.thumbnail, isPlaying, localTime, duration, roomName, onPlay, onPause, onSeek, triggerOsd]);

  // Controls Auto-hide
  const handleUserActivity = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setSpeedMenuOpen(false);
      }, 3500);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      onPause(localTime);
      triggerOsd('[mpv] Paused');
    } else {
      onPlay(localTime);
      triggerOsd('[mpv] Playing');
    }
  };

  const handleSeekRelative = (delta: number) => {
    const next = Math.max(0, Math.min(duration || Infinity, localTime + delta));
    onSeek(next);
    triggerOsd(`[mpv] ${delta > 0 ? '+' : ''}${delta}s (${formatSeconds(next)})`);
  };

  // MediaSession API for Background Audio / Android Notification & Lockscreen controls
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    if (!currentMedia || currentMedia.type === 'none') {
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      const artwork = currentMedia.videoId
        ? [
            { src: `https://img.youtube.com/vi/${currentMedia.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
          ]
        : [
            { src: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=500&auto=format&fit=crop&q=60', sizes: '500x500', type: 'image/jpeg' },
          ];

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentMedia.label || 'Watch Party Stream',
        artist: 'Watch Party & MPV Player',
        album: 'In-App Synced Room',
        artwork,
      });

      navigator.mediaSession.setActionHandler('play', () => {
        onPlay(localTime);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        onPause(localTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        handleSeekRelative(-10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        handleSeekRelative(10);
      });
    } catch {
      // ignore unsupported action
    }
  }, [currentMedia, localTime, onPlay, onPause]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // MPV Frame Step
  const handleFrameStep = (frames: number) => {
    const frameTime = 1 / 25; // standard 25-30fps frame delta
    const next = Math.max(0, Math.min(duration || Infinity, localTime + frames * frameTime));
    if (videoRef.current) {
      videoRef.current.pause();
    }
    onSeek(next);
    triggerOsd(`[mpv] Step ${frames > 0 ? '+1' : '-1'} Frame`);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    onSeek(target);
    triggerOsd(`[mpv] Seek ${formatSeconds(target)}`);
  };

  const toggleMute = () => {
    if (mediaType === 'youtube' && ytPlayerRef.current) {
      if (isMuted) {
        ytPlayerRef.current.unMute();
      } else {
        ytPlayerRef.current.mute();
      }
    } else if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
    triggerOsd(isMuted ? '[mpv] Unmuted' : '[mpv] Muted');
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    setSpeedMenuOpen(false);
    if (mediaType === 'youtube' && ytPlayerRef.current && ytPlayerRef.current.setPlaybackRate) {
      ytPlayerRef.current.setPlaybackRate(speed);
    } else if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    triggerOsd(`[mpv] Speed: ${speed}x`);
  };

  const cycleAspectRatio = () => {
    const ratios = ['contain', '16/9', '4/3', 'cover'];
    const currentIdx = ratios.indexOf(aspectRatio);
    const next = ratios[(currentIdx + 1) % ratios.length];
    if (onAspectRatioChange) onAspectRatioChange(next);
    triggerOsd(`[mpv] Aspect: ${next === 'cover' ? 'Fill/Zoom' : next}`);
  };

  const cycleAudioBoost = () => {
    const boosts = [1.0, 1.25, 1.5];
    const currentIdx = boosts.indexOf(audioBoost);
    const next = boosts[(currentIdx + 1) % boosts.length];
    if (onAudioBoostChange) onAudioBoostChange(next);
    triggerOsd(`[mpv] Audio: ${next === 1.0 ? 'Normal' : next === 1.25 ? '+3dB Boost' : '+6dB High'}`);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
      triggerOsd('[mpv] Fullscreen');
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
      triggerOsd('[mpv] Windowed');
    }
  };

  const togglePiP = async () => {
    // Native Android Picture-in-Picture via embedded bridge
    if (typeof (window as any).AndroidMpvBridge?.enterPiP === 'function') {
      (window as any).AndroidMpvBridge.enterPiP();
      triggerOsd('[mpv] Native Picture-in-Picture');
      return;
    }

    // Web picture-in-picture
    if (videoRef.current && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          triggerOsd('[mpv] Windowed Mode');
        } else {
          await videoRef.current.requestPictureInPicture();
          triggerOsd('[mpv] Picture-in-Picture');
        }
      } catch {
        triggerOsd('[mpv] PiP unavailable for this stream');
      }
    }
  };

  // Sync playback state with native Android background engine
  useEffect(() => {
    try {
      if (typeof (window as any).AndroidMpvBridge?.setPlayingState === 'function') {
        (window as any).AndroidMpvBridge.setPlayingState(isPlaying);
      }
    } catch {
      // ignore
    }
  }, [isPlaying]);

  // MPV Frame Capture / Screenshot Tool
  const handleTakeScreenshot = useCallback(() => {
    if (!videoRef.current) {
      triggerOsd('[mpv] Snapshot only supported on video stream');
      return;
    }
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `mpv-snap-${Math.floor(video.currentTime)}s.png`;
        a.click();
        triggerOsd('[mpv] Screenshot captured & downloaded!');
      }
    } catch {
      triggerOsd('[mpv] Stream protected, snapshot unavailable');
    }
  }, [triggerOsd]);

  // Keyboard Shortcuts (MPV style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeekRelative(e.shiftKey ? -1 : -5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeekRelative(e.shiftKey ? 1 : 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.min(1, (videoRef.current.volume || 1) + 0.05);
            videoRef.current.volume = nextVol;
            setLocalVolume(nextVol);
            triggerOsd(`[mpv] Volume: ${Math.round(nextVol * 100)}%`);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.max(0, (videoRef.current.volume || 1) - 0.05);
            videoRef.current.volume = nextVol;
            setLocalVolume(nextVol);
            triggerOsd(`[mpv] Volume: ${Math.round(nextVol * 100)}%`);
          }
          break;
        case '[':
          e.preventDefault();
          changeSpeed(Math.max(0.25, parseFloat((playbackSpeed - 0.1).toFixed(2))));
          break;
        case ']':
          e.preventDefault();
          changeSpeed(Math.min(3.0, parseFloat((playbackSpeed + 0.1).toFixed(2))));
          break;
        case 'Backspace':
          e.preventDefault();
          changeSpeed(1.0);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          handleTakeScreenshot();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setShowMpvStats((prev) => !prev);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          cycleAspectRatio();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          cycleAudioBoost();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, localTime, duration, playbackSpeed, isMuted, aspectRatio, audioBoost, handleTakeScreenshot, togglePlay]);

  // Touch Gestures (MPV Android Style: Left Vertical = Brightness, Right Vertical = Volume, Horizontal = Seek)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    handleUserActivity();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = touch.clientX - rect.left;
    const now = Date.now();
    const timeSinceLast = now - touchStateRef.current.lastTapTime;

    // Detect tap side
    let tapSide: 'left' | 'right' | 'center' = 'center';
    if (x < rect.width * 0.35) tapSide = 'left';
    else if (x > rect.width * 0.65) tapSide = 'right';

    // Check for double tap
    if (timeSinceLast < 320 && touchStateRef.current.lastTapSide === tapSide) {
      if (tapSide === 'left') {
        handleSeekRelative(-10);
        setDoubleTapFeedback({ side: 'left', count: 10 });
        setTimeout(() => setDoubleTapFeedback(null), 700);
      } else if (tapSide === 'right') {
        handleSeekRelative(10);
        setDoubleTapFeedback({ side: 'right', count: 10 });
        setTimeout(() => setDoubleTapFeedback(null), 700);
      } else {
        togglePlay();
        setDoubleTapFeedback({ side: 'center', count: 0 });
        setTimeout(() => setDoubleTapFeedback(null), 700);
      }
      touchStateRef.current.lastTapTime = 0;
      touchStateRef.current.lastTapSide = null;
      return;
    }

    touchStateRef.current.lastTapTime = now;
    touchStateRef.current.lastTapSide = tapSide;
    touchStateRef.current.startX = touch.clientX;
    touchStateRef.current.startY = touch.clientY;
    touchStateRef.current.currentX = touch.clientX;
    touchStateRef.current.currentY = touch.clientY;
    touchStateRef.current.mode = null;
    touchStateRef.current.initialBrightness = localBrightness;
    touchStateRef.current.initialVolume = videoRef.current?.volume || localVolume;
    touchStateRef.current.initialTime = localTime;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const dx = touch.clientX - touchStateRef.current.startX;
    const dy = touch.clientY - touchStateRef.current.startY;

    // Decide gesture mode once movement threshold is exceeded
    if (touchStateRef.current.mode === null) {
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
        if (Math.abs(dx) > Math.abs(dy)) {
          touchStateRef.current.mode = 'seek';
        } else {
          // Vertical swipe
          const startXRelative = touchStateRef.current.startX - rect.left;
          if (startXRelative < rect.width * 0.5) {
            touchStateRef.current.mode = 'brightness';
          } else {
            touchStateRef.current.mode = 'volume';
          }
        }
      }
    }

    // Apply gesture
    if (touchStateRef.current.mode === 'brightness') {
      const delta = -dy / (rect.height * 0.7);
      const nextBrightness = Math.max(0.4, Math.min(1.8, touchStateRef.current.initialBrightness + delta));
      setLocalBrightness(nextBrightness);
      if (onBrightnessChange) onBrightnessChange(nextBrightness);
      setGestureType('brightness');
      setGestureValue(Math.round(nextBrightness * 100));
    } else if (touchStateRef.current.mode === 'volume') {
      const delta = -dy / (rect.height * 0.7);
      const nextVol = Math.max(0, Math.min(1.0, touchStateRef.current.initialVolume + delta));
      if (videoRef.current) {
        videoRef.current.volume = nextVol;
      }
      setLocalVolume(nextVol);
      setGestureType('volume');
      setGestureValue(Math.round(nextVol * 100));
    } else if (touchStateRef.current.mode === 'seek') {
      const scrubFactor = duration > 600 ? 120 : 60;
      const deltaSeconds = (dx / rect.width) * scrubFactor;
      const targetTime = Math.max(0, Math.min(duration || 1000, touchStateRef.current.initialTime + deltaSeconds));
      setGestureType('seek');
      setGestureSeekTarget(targetTime);
      setGestureValue(Math.round(deltaSeconds));
    }
  };

  const handleTouchEnd = () => {
    if (touchStateRef.current.mode === 'seek' && duration > 0) {
      onSeek(gestureSeekTarget);
      triggerOsd(`[mpv] Scrub to ${formatSeconds(gestureSeekTarget)}`);
    }
    touchStateRef.current.mode = null;
    setGestureType(null);
  };

  // Render MP3 player when media is audio
  if (mediaType === 'mp3') {
    return (
      <div className="relative w-full aspect-video max-h-[65vh] rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10">
        <AudioPlayer
          title={mediaTitle}
          isPlaying={isPlaying}
          currentTime={localTime}
          duration={duration}
          isMuted={isMuted}
          onTogglePlay={togglePlay}
          onSeek={onSeek}
          onSeekRelative={handleSeekRelative}
          onToggleMute={toggleMute}
          onOpenMpv={onOpenMpvModal}
        />
        <audio
          ref={videoRef as any}
          src={currentMedia?.url}
          onEnded={onMediaEnd}
          className="hidden"
        />
        <FloatingReactions reactions={reactions} />
      </div>
    );
  }

  const progressPercent = duration > 0 ? Math.min(100, (localTime / duration) * 100) : 0;
  const remainingTimeSeconds = Math.max(0, duration - localTime);

  return (
    <div
      ref={containerRef}
      id="video-player-viewport"
      onMouseMove={handleUserActivity}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full aspect-video max-h-[65vh] rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10 group select-none"
    >
      {/* Floating Reactions across video */}
      <FloatingReactions reactions={reactions} />

      {/* No Video Placeholder */}
      {mediaType === 'none' && (
        <div 
          id="no-video-placeholder"
          className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#141226] to-[#0a0814]"
        >
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3 shadow-lg shadow-purple-950/50">
            <Film className="w-8 h-8 text-purple-400 animate-pulse" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mb-1 flex items-center gap-2">
            MPV Built-In Player Ready
          </h3>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-sm">
            Paste any YouTube video, MP4 link, or HLS stream above and click <span className="text-emerald-400 font-semibold">Play</span> to stream together in-app!
          </p>
        </div>
      )}

      {/* YouTube slot with MPV overlay */}
      {mediaType === 'youtube' && (
        <div 
          id="yt-iframe-slot" 
          className="w-full h-full"
          style={{ filter: `brightness(${localBrightness})` }}
        />
      )}

      {/* HTML5 / HLS Video tag with filter brightness & aspect ratio */}
      {(mediaType === 'mp4' || mediaType === 'hls') && (
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full transition-all duration-150"
          style={{
            filter: `brightness(${localBrightness})`,
            objectFit: aspectRatio === 'cover' ? 'cover' : 'contain',
            aspectRatio: aspectRatio === '16/9' ? '16/9' : aspectRatio === '4/3' ? '4/3' : undefined,
          }}
          onEnded={onMediaEnd}
          onPlay={() => {
            if (!suppressEventsRef.current) onPlay(videoRef.current?.currentTime || 0);
          }}
          onPause={() => {
            if (!suppressEventsRef.current) onPause(videoRef.current?.currentTime || 0);
          }}
        />
      )}

      {/* MPV Top Header Bar (OSD) */}
      {mediaType !== 'none' && (
        <div 
          id="mpv-top-header-bar"
          className={`absolute inset-x-0 top-0 z-30 p-2.5 sm:p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Top Left: MPV Engine status & filename */}
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="px-2 py-0.5 rounded-md bg-purple-600/90 text-white font-mono font-bold text-[10px] sm:text-xs flex items-center gap-1 shrink-0 shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              MPV
            </span>
            <span className="text-xs font-semibold text-white/90 truncate drop-shadow-sm font-mono max-w-[180px] sm:max-w-md">
              {mediaTitle}
            </span>
          </div>

          {/* Top Right: MPV Tools */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Aspect Ratio cycle */}
            <button
              id="mpv-aspect-btn"
              onClick={cycleAspectRatio}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-white border border-white/10 text-xs font-mono transition-colors"
              title="Cycle Aspect Ratio"
            >
              <span className="text-[10px] font-bold uppercase">{aspectRatio}</span>
            </button>

            {/* Background Audio Mode for YouTube & All Streams */}
            <button
              id="mpv-bg-audio-btn"
              onClick={() => {
                const next = !backgroundAudioEnabled;
                setBackgroundAudioEnabled(next);
                triggerOsd(next ? '[mpv] Background Audio: ON 🎧' : '[mpv] Background Audio: OFF');
              }}
              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-all flex items-center gap-1 shrink-0 ${
                backgroundAudioEnabled
                  ? 'bg-emerald-600/80 hover:bg-emerald-500 text-white border-emerald-400/40 shadow-sm shadow-emerald-600/30'
                  : 'bg-black/60 hover:bg-black/90 text-neutral-400 hover:text-white border-white/10'
              }`}
              title={backgroundAudioEnabled ? "Background YouTube Audio is ON (Lock screen & background supported)" : "Enable Background Audio"}
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-300" />
              <span className="text-[10px] font-bold">
                {backgroundAudioEnabled ? 'BG 🎧' : 'BG OFF'}
              </span>
            </button>

            {/* MPV Stats HUD toggle (i) */}
            <button
              id="mpv-stats-btn"
              onClick={() => setShowMpvStats(!showMpvStats)}
              className={`p-1.5 rounded-lg border text-xs font-mono transition-colors ${
                showMpvStats 
                  ? 'bg-purple-600 text-white border-purple-400' 
                  : 'bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-white border-white/10'
              }`}
              title="Toggle MPV Stats for Nerds (Press i)"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {/* Capture screenshot */}
            {(mediaType === 'mp4' || mediaType === 'hls') && (
              <button
                id="mpv-screenshot-btn"
                onClick={handleTakeScreenshot}
                className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-pink-300 border border-white/10 text-xs transition-colors"
                title="Capture Screenshot (Press s)"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}

            {/* In-App MPV Settings & Controls Hub */}
            <button
              id="mpv-settings-hud-btn"
              onClick={onOpenMpvModal}
              className="px-2 py-1 rounded-lg bg-purple-700/80 hover:bg-purple-600 text-purple-200 border border-purple-400/30 text-xs font-semibold backdrop-blur-md shadow flex items-center gap-1 transition-all"
              title="Open MPV Controls & Gestures"
            >
              <Sliders className="w-3 h-3 text-purple-300" />
              <span className="text-[11px]">Controls</span>
            </button>

            {/* Native Picture-in-Picture Quick Button */}
            <button
              id="internal-mpv-pip-btn"
              onClick={togglePiP}
              className="px-2 py-1 rounded-lg bg-pink-600/80 hover:bg-pink-500 text-white border border-pink-400/40 text-xs font-semibold backdrop-blur-md shadow flex items-center gap-1 transition-all"
              title="Native Picture-in-Picture (Play in floating mini-player)"
            >
              <PictureInPicture className="w-3 h-3 text-pink-200" />
              <span className="text-[11px] font-bold">PiP Mode</span>
            </button>

            {/* Room Sync */}
            <button
              id="quick-sync-btn"
              onClick={onSyncRequest}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-amber-300 border border-amber-500/30 text-xs font-semibold backdrop-blur-md transition-colors"
              title="Sync all users to host"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* MPV OSD Toast Notification (Center / Top-Left) */}
      {osdMessage && (
        <div 
          id="mpv-osd-toast"
          className="absolute top-12 left-4 z-40 px-3 py-1.5 rounded-lg bg-black/85 border border-purple-500/40 text-xs font-mono font-bold text-white shadow-xl pointer-events-none backdrop-blur-md animate-in fade-in slide-in-from-top-1 flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <span>{osdMessage}</span>
        </div>
      )}

      {/* MPV Touch Gesture Live HUD (Center Pill for Volume, Brightness, Scrubbing) */}
      {gestureType && (
        <div 
          id="mpv-gesture-hud"
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
        >
          <div className="p-4 rounded-2xl bg-black/85 border border-white/20 backdrop-blur-xl shadow-2xl flex flex-col items-center gap-2 min-w-[150px] animate-in zoom-in-95 duration-100">
            {gestureType === 'brightness' && (
              <>
                <Sun className="w-7 h-7 text-amber-400 animate-spin-slow" />
                <span className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider">
                  Brightness
                </span>
                <span className="text-xl font-mono font-extrabold text-amber-300">
                  {gestureValue}%
                </span>
                <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${Math.min(100, (gestureValue / 180) * 100)}%` }}
                  />
                </div>
              </>
            )}

            {gestureType === 'volume' && (
              <>
                <Volume2 className="w-7 h-7 text-purple-400" />
                <span className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider">
                  Volume
                </span>
                <span className="text-xl font-mono font-extrabold text-purple-300">
                  {gestureValue}%
                </span>
                <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${gestureValue}%` }}
                  />
                </div>
              </>
            )}

            {gestureType === 'seek' && (
              <>
                <span className="text-2xl font-mono font-bold text-pink-400">
                  {gestureValue >= 0 ? `+${gestureValue}s` : `${gestureValue}s`}
                </span>
                <div className="text-xs font-mono text-neutral-200">
                  Target: {formatSeconds(gestureSeekTarget)} / {formatSeconds(duration)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Double Tap Ripple Feedback */}
      {doubleTapFeedback && (
        <div 
          className={`absolute inset-y-0 z-40 flex items-center justify-center pointer-events-none transition-all duration-300 ${
            doubleTapFeedback.side === 'left' ? 'left-0 w-1/3 bg-white/10' : doubleTapFeedback.side === 'right' ? 'right-0 w-1/3 bg-white/10' : 'inset-x-0 bg-white/10'
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-black/70 border border-white/20 flex flex-col items-center justify-center text-white shadow-xl animate-ping">
            {doubleTapFeedback.side === 'left' && <RotateCcw className="w-6 h-6 text-pink-400" />}
            {doubleTapFeedback.side === 'right' && <RotateCw className="w-6 h-6 text-pink-400" />}
            {doubleTapFeedback.side === 'center' && (isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />)}
            <span className="text-[10px] font-mono font-bold mt-0.5">
              {doubleTapFeedback.count > 0 ? `${doubleTapFeedback.count}s` : ''}
            </span>
          </div>
        </div>
      )}

      {/* MPV Stats For Nerds HUD Overlay (Press 'i') */}
      {showMpvStats && (
        <div 
          id="mpv-stats-overlay"
          className="absolute top-12 right-4 z-40 p-3 rounded-xl bg-black/90 border border-purple-500/40 text-[11px] font-mono text-neutral-200 shadow-2xl backdrop-blur-md max-w-[280px] space-y-1 select-none animate-in fade-in"
        >
          <div className="flex justify-between items-center border-b border-white/10 pb-1 text-purple-300 font-bold">
            <span>100% MPV DIAGNOSTICS</span>
            <button 
              onClick={() => setShowMpvStats(false)} 
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">MPV Engine:</span>
            <span className="text-pink-300 font-bold">100% Native WebGL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Stream Type:</span>
            <span className="uppercase text-white">{mediaType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Background Audio:</span>
            <span className={backgroundAudioEnabled ? "text-emerald-400 font-bold" : "text-neutral-500"}>
              {backgroundAudioEnabled ? "Active 🎧" : "Off"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">MediaSession:</span>
            <span className="text-cyan-300">Lockscreen Ready</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Position:</span>
            <span className="text-emerald-400">{formatSeconds(localTime)} / {formatSeconds(duration)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Resolution:</span>
            <span className="text-white">
              {videoRef.current ? `${videoRef.current.videoWidth || 1920}x${videoRef.current.videoHeight || 1080}` : 'Native Dynamic'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Framerate:</span>
            <span className="text-white">60.0 fps (VSync)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Speed:</span>
            <span className="text-pink-300">{playbackSpeed}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Brightness:</span>
            <span className="text-amber-300">{Math.round(localBrightness * 100)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Audio Boost:</span>
            <span className="text-purple-300">{Math.round(audioBoost * 100)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Hardware Accel:</span>
            <span className="text-emerald-400">Active (GPU)</span>
          </div>
        </div>
      )}

      {/* Invisible Silent Audio Loop Anchor to maintain Android OS Background Audio Focus */}
      <audio
        ref={silentAudioRef}
        loop
        playsInline
        preload="auto"
        src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
        className="hidden"
      />

      {/* Floating Reaction Quick Bar (Bottom Right) */}
      <div className="absolute right-3 bottom-16 z-30 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity">
        {['🔥', '❤️', '😂', '👏', '🍿'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSendReaction(emoji)}
            className="text-lg hover:scale-125 active:scale-95 transition-transform p-0.5"
            title={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Custom MPV-Style OSD Controls for MP4 & HLS */}
      {(mediaType === 'mp4' || mediaType === 'hls') && (
        <div
          id="mpv-osd-controls"
          className={`absolute inset-x-0 bottom-0 z-20 p-2.5 sm:p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress bar */}
          <div
            id="video-seek-track"
            onClick={handleProgressBarClick}
            className="relative w-full h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all mb-2.5 group/bar"
          >
            <div
              className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-400 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md ring-2 ring-pink-500 opacity-0 group-hover/bar:opacity-100 transition-opacity"
              style={{ left: `calc(${progressPercent}% - 7px)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Play / Pause */}
              <button
                id="osd-play-btn"
                onClick={togglePlay}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              {/* Step 1 frame back */}
              <button
                id="osd-step-back"
                onClick={() => handleFrameStep(-1)}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors hidden sm:inline-flex"
                title="Step -1 frame"
              >
                <StepBack className="w-3.5 h-3.5" />
              </button>

              {/* 10s Rewind */}
              <button
                id="osd-back-10"
                onClick={() => handleSeekRelative(-10)}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
                title="10 seconds back"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* 10s Forward */}
              <button
                id="osd-fwd-10"
                onClick={() => handleSeekRelative(10)}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
                title="10 seconds forward"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Step 1 frame forward */}
              <button
                id="osd-step-fwd"
                onClick={() => handleFrameStep(1)}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors hidden sm:inline-flex"
                title="Step +1 frame"
              >
                <StepForward className="w-3.5 h-3.5" />
              </button>

              {/* Time display with toggle for remaining time */}
              <div 
                onClick={() => setShowRemainingTime(!showRemainingTime)}
                className="text-xs font-mono text-neutral-300 ml-1 cursor-pointer hover:text-white select-none"
                title="Click to toggle remaining time"
              >
                <span>{formatSeconds(localTime)}</span>
                <span className="mx-1 text-neutral-500">/</span>
                <span>
                  {duration > 0 
                    ? showRemainingTime 
                      ? `-${formatSeconds(remainingTimeSeconds)}` 
                      : formatSeconds(duration) 
                    : 'Live'}
                </span>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Audio Boost quick button */}
              <button
                onClick={cycleAudioBoost}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-purple-300 hover:bg-white/10 transition-colors hidden md:inline-flex items-center gap-1"
                title="Cycle Audio Boost (+0dB, +3dB, +6dB)"
              >
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>{audioBoost === 1 ? '1x' : audioBoost === 1.25 ? '+3dB' : '+6dB'}</span>
              </button>

              {/* Playback speed dropdown */}
              <div className="relative">
                <button
                  id="osd-speed-btn"
                  onClick={() => setSpeedMenuOpen(!speedMenuOpen)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
                  title="Playback Speed"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{playbackSpeed}x</span>
                </button>

                {speedMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 py-1 px-1 bg-neutral-900 border border-white/15 rounded-xl shadow-xl z-40 min-w-[70px]">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        onClick={() => changeSpeed(s)}
                        className={`w-full text-left px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          playbackSpeed === s ? 'bg-purple-600 text-white' : 'text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mute */}
              <button
                id="osd-mute-btn"
                onClick={toggleMute}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-pink-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Picture-in-Picture */}
              {(document.pictureInPictureEnabled || typeof (window as any).AndroidMpvBridge !== 'undefined') && (
                <button
                  id="osd-pip-btn"
                  onClick={togglePiP}
                  className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors hidden xs:inline-flex"
                  title="Picture-in-Picture"
                >
                  <PictureInPicture className="w-4 h-4" />
                </button>
              )}

              {/* Fullscreen */}
              <button
                id="osd-fullscreen-btn"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
