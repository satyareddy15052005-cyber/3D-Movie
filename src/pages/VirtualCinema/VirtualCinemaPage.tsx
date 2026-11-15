import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Armchair,
  Compass,
  Eye,
  EyeOff,
  Home,
  LogOut,
  Maximize,
  Maximize2,
  Minimize,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCinemaStore } from '../../store/cinemaStore';
import { CinemaAuditoriumCanvas } from '../../three/scenes/CinemaAuditoriumCanvas';
import { cinemaAudioEngine } from '../../services/audio/cinemaAudioEngine';
import { formatDuration, isMobileDevice } from '../../utils/formatters';
import { screenWakeLock } from '../../utils/wakeLock';
import { CameraViewMode } from '../../types/cinema';

export const VirtualCinemaPage: React.FC = () => {
  const {
    selectedTheaterConfig,
    theaterSeats,
    selectedSeat,
    selectSeat,
    playlist,
    currentPlaybackIndex,
    setCurrentPlaybackIndex,
    showState,
    setShowState,
    isPaused,
    setIsPaused,
    showCompleted,
    setShowCompleted,
    graphicsQuality,
    audioSettings,
    updateAudioSettings,
    fourDxSettings,
    updateFourDxSettings,
    screenReflectionBrightness,
    setScreenReflectionBrightness,
    screenFraming,
    setScreenFraming,
    resetShowSession,
    navigate,
  } = useCinemaStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoHostRef = useRef<HTMLDivElement>(null);

  // Dual-Deck persistent HTMLVideoElements mounted in DOM for continuous hardware decoding
  const deckARef = useRef<HTMLVideoElement | null>(null);
  const deckBRef = useRef<HTMLVideoElement | null>(null);
  const [deckAEl, setDeckAEl] = useState<HTMLVideoElement | null>(null);
  const [deckBEl, setDeckBEl] = useState<HTMLVideoElement | null>(null);
  const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');
  const loadedUrlRef = useRef<{ A: string; B: string }>({ A: '', B: '' });
  const advancingForIndexRef = useRef<number | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');
  activeDeckRef.current = activeDeck;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const showStateRef = useRef(showState);
  showStateRef.current = showState;
  const audioSettingsRef = useRef(audioSettings);
  audioSettingsRef.current = audioSettings;
  const videoVolumeRef = useRef(audioSettings.videoVolume);
  videoVolumeRef.current = audioSettings.videoVolume;
  const selectedSeatRef = useRef(selectedSeat);
  selectedSeatRef.current = selectedSeat;

  const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
  const [sceneReady, setSceneReady] = useState(false);
  const [entranceComplete, setEntranceComplete] = useState(false);
  const [viewMode, setViewMode] = useState<CameraViewMode>('seat');
  const [hoveredSeatId, setHoveredSeatId] = useState<string | null>(null);
  const [seatShiftToast, setSeatShiftToast] = useState<string | null>(null);

  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [skipWalkSignal, setSkipWalkSignal] = useState(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [hudVisible, setHudVisible] = useState(true);
  const hudVisibleRef = useRef(true);
  hudVisibleRef.current = hudVisible;
  const [controlsManuallyHidden, setControlsManuallyHidden] = useState(false);
  const [showMixerPopover, setShowMixerPopover] = useState(false);
  const [show4dxPopover, setShow4dxPopover] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [audioRunning, setAudioRunning] = useState(() => cinemaAudioEngine.isRunning);

  const inactivityTimerRef = useRef<number | null>(null);
  const showStartingTimerRef = useRef<number | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const currentItem = playlist[currentPlaybackIndex] || null;

  const getActiveVideoEl = useCallback((): HTMLVideoElement | null => {
    return activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);

  const silenceStreakRef = useRef(0);
  const lastProgressedTimeRef = useRef(-1);
  const frozenTicksRef = useRef(0);
  const lastUiTimeRef = useRef(-1);

  const showNativeFullVideo =
    viewMode === 'screen_full' &&
    (showState === 'SHOW_PLAYING' || showState === 'SHOW_COMPLETED');

  const createDeckElement = useCallback((host: HTMLElement) => {
    const vid = document.createElement('video');
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.preload = 'auto';
    vid.muted = audioSettingsRef.current.muted;
    vid.volume = audioSettingsRef.current.muted
      ? 0
      : audioSettingsRef.current.masterVolume * audioSettingsRef.current.videoVolume;
    vid.disableRemotePlayback = true;
    vid.style.width = '32px';
    vid.style.height = '18px';
    vid.style.position = 'absolute';
    vid.style.top = '0';
    vid.style.left = '0';
    vid.style.transform = 'translateZ(0)';
    vid.style.pointerEvents = 'none';
    host.appendChild(vid);
    return vid;
  }, []);

  const replaceActiveDeckWithNative = useCallback(() => {
    const host = videoHostRef.current || containerRef.current || document.body;
    const deckKey = activeDeckRef.current;
    const oldVid = deckKey === 'A' ? deckARef.current : deckBRef.current;
    if (!oldVid) return;

    cinemaAudioEngine.disableVideoHijack();
    silenceStreakRef.current = 0;

    const resumeTime = Number.isFinite(oldVid.currentTime) ? oldVid.currentTime : 0;
    const oldSrc = oldVid.currentSrc || oldVid.src;
    const wasPlaying = !oldVid.paused && !isPausedRef.current;

    try {
      oldVid.pause();
      oldVid.removeAttribute('src');
      oldVid.load();
      oldVid.remove();
    } catch {
      // Ignore cleanup error
    }

    const freshVid = createDeckElement(host);
    freshVid.muted = audioSettingsRef.current.muted;
    freshVid.volume = audioSettingsRef.current.muted
      ? 0
      : audioSettingsRef.current.masterVolume * audioSettingsRef.current.videoVolume;

    if (oldSrc) {
      loadedUrlRef.current[deckKey] = oldSrc;
      freshVid.src = oldSrc;
      freshVid.load();
      if (resumeTime > 0.05) {
        const seekOnReady = () => {
          try {
            freshVid.currentTime = resumeTime;
          } catch {
            // Ignore seek before duration ready
          }
          freshVid.removeEventListener('loadedmetadata', seekOnReady);
        };
        freshVid.addEventListener('loadedmetadata', seekOnReady);
      }
    }

    if (deckKey === 'A') {
      deckARef.current = freshVid;
      setDeckAEl(freshVid);
    } else {
      deckBRef.current = freshVid;
      setDeckBEl(freshVid);
    }

    if (wasPlaying) {
      freshVid.play().catch(() => {});
    }
  }, [createDeckElement]);

  // Track Web Audio running state + unlock audio cleanly on any mobile tap/touch/click gesture
  useEffect(() => {
    const unsubscribe = cinemaAudioEngine.onStateChange((running) => {
      setAudioRunning(running);
      if (running && showStateRef.current === 'SHOW_PLAYING') {
        const activeVid = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
        if (activeVid && !activeVid.paused && activeVid.readyState >= 2) {
          cinemaAudioEngine.attachVideoElement(activeVid);
        }
      }
    });

    const handleGestureUnlock = () => {
      if (!cinemaAudioEngine.isRunning) {
        cinemaAudioEngine.unlockFromGesture();
      }
      const activeVid = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (
        activeVid &&
        showStateRef.current === 'SHOW_PLAYING' &&
        !isPausedRef.current &&
        activeVid.readyState >= 2
      ) {
        activeVid.muted = audioSettingsRef.current.muted;
        if (cinemaAudioEngine.isRunning && !activeVid.paused) {
          cinemaAudioEngine.attachVideoElement(activeVid);
        }
      }
    };

    window.addEventListener('pointerdown', handleGestureUnlock, { capture: true, passive: true });
    window.addEventListener('touchend', handleGestureUnlock, { capture: true, passive: true });
    window.addEventListener('keydown', handleGestureUnlock, { capture: true });

    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', handleGestureUnlock, { capture: true });
      window.removeEventListener('touchend', handleGestureUnlock, { capture: true });
      window.removeEventListener('keydown', handleGestureUnlock, { capture: true });
    };
  }, []);

  // Create persistent Dual-Deck HTMLVideoElements mounted INSIDE containerRef (so Fullscreen Top Layer never occludes or stalls decoding)
  useEffect(() => {
    const host = videoHostRef.current || containerRef.current || document.body;
    const vidA = createDeckElement(host);
    const vidB = createDeckElement(host);
    deckARef.current = vidA;
    deckBRef.current = vidB;
    setDeckAEl(vidA);
    setDeckBEl(vidB);

    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      [vidA, vidB].forEach((vid) => {
        try {
          vid.pause();
          vid.removeAttribute('src');
          vid.load();
          vid.remove();
        } catch {
          // Ignore video cleanup error
        }
      });
      deckARef.current = null;
      deckBRef.current = null;
      setDeckAEl(null);
      setDeckBEl(null);
      try {
        cinemaAudioEngine.dispose();
      } catch {
        // Ignore audio disposal error
      }
      screenWakeLock.setActive(false);
    };
  }, []);

  // Keep mobile and laptop displays awake while watching movies
  useEffect(() => {
    const keepDisplayAwake =
      showState === 'SHOW_STARTING' || (showState === 'SHOW_PLAYING' && !isPaused);
    screenWakeLock.setActive(keepDisplayAwake);
    return () => {
      if (!keepDisplayAwake) {
        screenWakeLock.setActive(false);
      }
    };
  }, [showState, isPaused]);

  // Style active vs standby <video> deck so Full Screen plays 1:1 native hardware video without WebGL overhead
  useEffect(() => {
    const vidA = deckARef.current;
    const vidB = deckBRef.current;
    const activeEl = activeDeck === 'A' ? vidA : vidB;
    const standbyEl = activeDeck === 'A' ? vidB : vidA;

    if (activeEl) {
      if (showNativeFullVideo) {
        activeEl.style.display = 'block';
        activeEl.style.position = 'static';
        activeEl.style.width = '100%';
        activeEl.style.height = '100%';
        activeEl.style.objectFit = 'contain';
        activeEl.style.opacity = '1';
      } else {
        activeEl.style.display = 'block';
        activeEl.style.position = 'absolute';
        activeEl.style.top = '0';
        activeEl.style.left = '0';
        activeEl.style.width = '32px';
        activeEl.style.height = '18px';
        activeEl.style.objectFit = 'contain';
        activeEl.style.opacity = '1';
      }
    }

    if (standbyEl) {
      standbyEl.style.display = showNativeFullVideo ? 'none' : 'block';
      standbyEl.style.position = 'absolute';
      standbyEl.style.top = '0';
      standbyEl.style.left = '0';
      standbyEl.style.width = '1px';
      standbyEl.style.height = '1px';
      standbyEl.style.opacity = '0';
    }
  }, [activeDeck, deckAEl, deckBEl, showNativeFullVideo]);

  // Preload current item on active deck & next playlist item metadata on standby deck (desktop only to prevent mobile decoder exhaustion)
  useEffect(() => {
    const vidA = deckARef.current;
    const vidB = deckBRef.current;
    if (!vidA || !vidB || playlist.length === 0) return;

    const curr = playlist[currentPlaybackIndex];
    const next = playlist[currentPlaybackIndex + 1];
    const mobile = isMobileDevice();

    const activeKey = mobile ? 'A' : activeDeck;
    const standbyKey: 'A' | 'B' = activeKey === 'A' ? 'B' : 'A';
    const activeEl = activeKey === 'A' ? vidA : vidB;
    const standbyEl = standbyKey === 'A' ? vidA : vidB;

    activeEl.preload = 'auto';

    if (curr && loadedUrlRef.current[activeKey] !== curr.objectUrl) {
      loadedUrlRef.current[activeKey] = curr.objectUrl;
      activeEl.src = curr.objectUrl;
      activeEl.currentTime = 0;
      activeEl.load();
    }

    if (mobile) {
      if (loadedUrlRef.current[standbyKey]) {
        loadedUrlRef.current[standbyKey] = '';
        try {
          standbyEl.pause();
          standbyEl.removeAttribute('src');
          standbyEl.load();
        } catch {
          // Ignore cleanup
        }
      }
    } else {
      standbyEl.preload = 'metadata';
      if (next && loadedUrlRef.current[standbyKey] !== next.objectUrl) {
        loadedUrlRef.current[standbyKey] = next.objectUrl;
        standbyEl.pause();
        standbyEl.src = next.objectUrl;
        standbyEl.currentTime = 0;
        standbyEl.load();
      }
    }
  }, [playlist, currentPlaybackIndex, activeDeck]);

  // Initialize Web Audio API profile once when entering theater (never attach/hijack <video> until playing)
  useEffect(() => {
    const seat = selectedSeatRef.current;
    if (!selectedTheaterConfig || !seat) return;
    const seatOffsetRatio =
      seat.worldPosition[0] / Math.max(1, selectedTheaterConfig.auditoriumWidth / 2);
    cinemaAudioEngine
      .initialize(selectedTheaterConfig.audioProfile, seatOffsetRatio, selectedTheaterConfig)
      .then(() => {
        cinemaAudioEngine.updateMix(
          audioSettingsRef.current,
          showStateRef.current,
          Boolean(selectedTheaterConfig.supports4dxEffects) &&
            fourDxSettings.enabled &&
            fourDxSettings.windAudioEnabled,
          fourDxSettings.vibrationIntensity,
        );
      })
      .catch(() => {});
  }, [selectedTheaterConfig]);

  // Sync audio settings with Web Audio engine & native HTMLVideoElement fallback until AudioContext runs
  useEffect(() => {
    [deckARef.current, deckBRef.current].forEach((vid) => {
      if (!vid) return;
      vid.muted = audioSettings.muted;
      if (!cinemaAudioEngine.isVideoAttached(vid)) {
        vid.volume = audioSettings.muted
          ? 0
          : audioSettings.masterVolume * audioSettings.videoVolume;
      } else {
        vid.volume = 1;
      }
    });

    const windActive =
      Boolean(selectedTheaterConfig?.supports4dxEffects) &&
      fourDxSettings.enabled &&
      fourDxSettings.windAudioEnabled;
    cinemaAudioEngine.updateMix(
      audioSettings,
      showState,
      windActive,
      fourDxSettings.vibrationIntensity,
    );
  }, [audioSettings, showState, selectedTheaterConfig, fourDxSettings, audioRunning]);

  const primeVideoForGesture = useCallback((vid: HTMLVideoElement | null) => {
    if (!vid || (!vid.src && !vid.currentSrc)) return;
    vid.muted = audioSettingsRef.current.muted;
    if (!cinemaAudioEngine.isVideoAttached(vid)) {
      vid.volume = audioSettingsRef.current.muted
        ? 0
        : audioSettingsRef.current.masterVolume * audioSettingsRef.current.videoVolume;
    }
    try {
      const playAttempt = vid.play();
      if (playAttempt && typeof playAttempt.then === 'function') {
        playAttempt
          .then(() => {
            if (showStateRef.current !== 'SHOW_PLAYING') {
              vid.pause();
              vid.currentTime = 0;
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore if not yet ready
    }
  }, []);

  // Begin the lighting dim -> video start sequence
  const beginShowSequence = useCallback(() => {
    if (showState !== 'AUDITORIUM_OPEN') return;
    cinemaAudioEngine.unlockFromGesture();
    primeVideoForGesture(getActiveVideoEl());
    if (autoStartTimerRef.current) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }

    setShowState('SHOW_STARTING');

    showStartingTimerRef.current = window.setTimeout(() => {
      setShowState('SHOW_PLAYING');
    }, 1250);
  }, [showState, setShowState, primeVideoForGesture, getActiveVideoEl]);

  // Once entrance walk finishes, smoothly start the show after a brief moment in the lit hall
  useEffect(() => {
    if (entranceComplete && showState === 'AUDITORIUM_OPEN') {
      autoStartTimerRef.current = window.setTimeout(() => {
        beginShowSequence();
      }, 900);
    }
    return () => {
      if (autoStartTimerRef.current) {
        window.clearTimeout(autoStartTimerRef.current);
      }
    };
  }, [entranceComplete, showState, beginShowSequence]);

  useEffect(() => {
    return () => {
      if (showStartingTimerRef.current) {
        window.clearTimeout(showStartingTimerRef.current);
      }
    };
  }, []);

  // Reset track-advance guard & stall counters cleanly after React finishes transitioning to a new track
  useEffect(() => {
    advancingForIndexRef.current = null;
    silenceStreakRef.current = 0;
    frozenTicksRef.current = 0;
    lastProgressedTimeRef.current = -1;
    lastUiTimeRef.current = -1;
  }, [currentPlaybackIndex, showState]);

  // Load and play current playlist item cleanly using Dual-Deck (desktop) or Single-Blessed-Deck (mobile)
  useEffect(() => {
    const vidA = deckARef.current;
    const vidB = deckBRef.current;
    if (!vidA || !vidB || !currentItem) return;

    const activeEl = activeDeck === 'A' ? vidA : vidB;
    const standbyEl = activeDeck === 'A' ? vidB : vidA;

    if (showState !== 'SHOW_PLAYING') {
      if (showState === 'AUDITORIUM_OPEN' || showState === 'SHOW_COMPLETED') {
        vidA.pause();
        vidB.pause();
      }
      return;
    }

    standbyEl.pause();
    setPlaybackError(null);
    setAutoplayBlocked(false);

    if (loadedUrlRef.current[activeDeck] !== currentItem.objectUrl) {
      loadedUrlRef.current[activeDeck] = currentItem.objectUrl;
      activeEl.src = currentItem.objectUrl;
      activeEl.currentTime = 0;
      activeEl.load();
    }

    setCurrentTime(activeEl.currentTime || 0);
    setDuration(
      Number.isFinite(activeEl.duration) && activeEl.duration > 0
        ? activeEl.duration
        : currentItem.duration || 0,
    );
    if (activeEl.videoWidth > 0 && activeEl.videoHeight > 0) {
      setVideoAspect(activeEl.videoWidth / activeEl.videoHeight);
    } else if (currentItem.width > 0 && currentItem.height > 0) {
      setVideoAspect(currentItem.width / currentItem.height);
    }

    let cancelled = false;

    const waitUntilPlayable = (el: HTMLVideoElement): Promise<void> => {
      if (el.readyState >= 2 || el.error) return Promise.resolve();
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          el.removeEventListener('canplay', finish);
          el.removeEventListener('canplaythrough', finish);
          el.removeEventListener('loadeddata', finish);
          el.removeEventListener('error', finish);
          window.clearTimeout(timer);
          resolve();
        };
        el.addEventListener('canplay', finish);
        el.addEventListener('canplaythrough', finish);
        el.addEventListener('loadeddata', finish);
        el.addEventListener('error', finish);
        const timer = window.setTimeout(finish, 6000);
      });
    };

    const startActivePlayback = async () => {
      try {
        const seat = selectedSeatRef.current;
        if (selectedTheaterConfig && seat) {
          const seatOffsetRatio =
            seat.worldPosition[0] /
            Math.max(1, selectedTheaterConfig.auditoriumWidth / 2);
          await cinemaAudioEngine.initialize(
            selectedTheaterConfig.audioProfile,
            seatOffsetRatio,
            selectedTheaterConfig,
          );
          cinemaAudioEngine.fadeInVideo(0.55, videoVolumeRef.current);
        }

        await waitUntilPlayable(activeEl);
        if (cancelled) return;

        if (activeEl.videoWidth > 0 && activeEl.videoHeight > 0) {
          setVideoAspect(activeEl.videoWidth / activeEl.videoHeight);
        }
        if (Number.isFinite(activeEl.duration) && activeEl.duration > 0) {
          setDuration(activeEl.duration);
        }

        activeEl.muted = audioSettingsRef.current.muted;
        if (!cinemaAudioEngine.isVideoAttached(activeEl)) {
          activeEl.volume = audioSettingsRef.current.muted
            ? 0
            : audioSettingsRef.current.masterVolume * audioSettingsRef.current.videoVolume;
        }

        if (!isPausedRef.current) {
          await cinemaAudioEngine.resume().catch(() => {});
          await activeEl.play();
          if (cinemaAudioEngine.isRunning && !cinemaAudioEngine.isVideoHijackDisabled) {
            cinemaAudioEngine.attachVideoElement(activeEl);
          }
        } else {
          activeEl.pause();
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name === 'AbortError') {
          return;
        }
        if (name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        } else {
          setPlaybackError(
            `Unable to play "${currentItem.fileName}". Verify the file uses a browser-supported codec.`,
          );
        }
      }
    };

    startActivePlayback();

    return () => {
      cancelled = true;
    };
  }, [showState, currentItem, activeDeck, selectedTheaterConfig]);

  // Dedicated lightweight pause/resume sync (never reloads or fades audio)
  useEffect(() => {
    if (showState !== 'SHOW_PLAYING') return;
    const vid = activeDeck === 'A' ? deckARef.current : deckBRef.current;
    if (!vid) return;
    if (isPaused) {
      if (!vid.paused) vid.pause();
    } else {
      cinemaAudioEngine.resume().catch(() => {});
      if (vid.paused && vid.readyState >= 2) {
        vid.play().catch(() => {});
      }
    }
  }, [isPaused, showState, activeDeck]);

  // Advance cleanly without double-skipping; reuse gesture-blessed Deck A on mobile
  const advancePlaylistOrComplete = useCallback(() => {
    if (advancingForIndexRef.current === currentPlaybackIndex) return;
    advancingForIndexRef.current = currentPlaybackIndex;

    const mobile = isMobileDevice();
    const currentKey = activeDeckRef.current;
    const currentEl = currentKey === 'A' ? deckARef.current : deckBRef.current;
    if (currentEl) {
      currentEl.pause();
    }

    if (currentPlaybackIndex + 1 < playlist.length) {
      const nextIndex = currentPlaybackIndex + 1;
      const nextItem = playlist[nextIndex];
      const nextDeck: 'A' | 'B' = mobile ? currentKey : currentKey === 'A' ? 'B' : 'A';

      if (mobile && currentEl && nextItem) {
        loadedUrlRef.current[nextDeck] = nextItem.objectUrl;
        currentEl.src = nextItem.objectUrl;
        currentEl.currentTime = 0;
        currentEl.load();
      }

      setCurrentTime(0);
      if (nextDeck !== currentKey) {
        setActiveDeck(nextDeck);
      }
      setCurrentPlaybackIndex(nextIndex);
    } else {
      cinemaAudioEngine.fadeOutVideo(0.9);
      setShowState('SHOW_COMPLETED');
      setShowCompleted(true);
    }
  }, [
    currentPlaybackIndex,
    playlist,
    setCurrentPlaybackIndex,
    setShowState,
    setShowCompleted,
  ]);

  // Attach media event listeners + automatic stall recovery to the currently active deck
  useEffect(() => {
    const vid = activeDeck === 'A' ? deckARef.current : deckBRef.current;
    if (!vid) return;

    const syncMetadataAndDuration = () => {
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        setDuration(vid.duration);
      } else if (currentItem && currentItem.duration > 0) {
        setDuration(currentItem.duration);
      }
      if (vid.videoWidth > 0 && vid.videoHeight > 0) {
        setVideoAspect(vid.videoWidth / vid.videoHeight);
      }
    };

    const onTimeUpdate = () => {
      const t = vid.currentTime || 0;
      const d = Number.isFinite(vid.duration) ? vid.duration : 0;
      if (Math.abs(t - lastUiTimeRef.current) >= 0.2 || t === 0) {
        lastUiTimeRef.current = t;
        setCurrentTime(t);
      }
      if (d > 0) {
        setDuration((prev) => (Math.abs(prev - d) > 0.25 ? d : prev));
      }

      // Near-end guard for codecs that stall slightly before dispatching 'ended'
      if (showState === 'SHOW_PLAYING' && d > 0.35 && t >= d - 0.04) {
        advancePlaylistOrComplete();
      }
    };

    const onCanPlay = () => {
      syncMetadataAndDuration();
      if (showState === 'SHOW_PLAYING' && !isPausedRef.current && vid.paused && !vid.ended) {
        cinemaAudioEngine.resume().catch(() => {});
        vid.play().catch(() => {});
      }
    };

    const onPlayEvent = () => {
      syncMetadataAndDuration();
      setAutoplayBlocked(false);
      if (isPausedRef.current) {
        setIsPaused(false);
      }
    };

    const onPauseEvent = () => {
      if (showState === 'SHOW_PLAYING' && !vid.ended && !isPausedRef.current) {
        // Keep store synced if mobile OS / headphone paused playback
        if (document.visibilityState === 'hidden') return;
      }
    };

    const onStallOrWait = () => {
      if (
        showState === 'SHOW_PLAYING' &&
        !isPausedRef.current &&
        !vid.ended &&
        vid.paused &&
        vid.readyState >= 2
      ) {
        cinemaAudioEngine.resume().catch(() => {});
        vid.play().catch(() => {});
      }
    };

    const onEnded = () => {
      if (showState === 'SHOW_PLAYING') {
        advancePlaylistOrComplete();
      }
    };

    const onError = () => {
      if (showState === 'SHOW_PLAYING' && vid.error) {
        setPlaybackError(
          `Playback error on "${currentItem?.fileName || 'video'}". The media stream may use an unsupported codec.`,
        );
      }
    };

    syncMetadataAndDuration();
    vid.addEventListener('loadedmetadata', syncMetadataAndDuration);
    vid.addEventListener('loadeddata', syncMetadataAndDuration);
    vid.addEventListener('durationchange', syncMetadataAndDuration);
    vid.addEventListener('timeupdate', onTimeUpdate);
    vid.addEventListener('canplay', onCanPlay);
    vid.addEventListener('play', onPlayEvent);
    vid.addEventListener('pause', onPauseEvent);
    vid.addEventListener('waiting', onStallOrWait);
    vid.addEventListener('stalled', onStallOrWait);
    vid.addEventListener('ended', onEnded);
    vid.addEventListener('error', onError);

    // Watchdog prevents unexpected browser media suspension, fullscreen decoder stalls, or silent mobile hijack
    const watchdogId = window.setInterval(() => {
      if (showState !== 'SHOW_PLAYING' || isPausedRef.current || autoplayBlocked || vid.ended) {
        silenceStreakRef.current = 0;
        frozenTicksRef.current = 0;
        lastProgressedTimeRef.current = vid.currentTime;
        return;
      }

      if (vid.paused && vid.readyState >= 2) {
        cinemaAudioEngine.resume().catch(() => {});
        vid.play().catch(() => {});
        return;
      }

      // Detect active playback stall/freeze (e.g., Chromium fullscreen compositor stall) and kick decoder gently
      const nowTime = vid.currentTime;
      if (Math.abs(nowTime - lastProgressedTimeRef.current) < 0.004 && vid.readyState >= 3) {
        frozenTicksRef.current += 1;
        if (frozenTicksRef.current === 3) {
          cinemaAudioEngine.resume().catch(() => {});
          vid.play().catch(() => {});
        } else if (frozenTicksRef.current >= 5) {
          try {
            const dur = Number.isFinite(vid.duration) ? vid.duration : 0;
            if (dur === 0 || nowTime + 0.04 < dur) {
              vid.currentTime = nowTime + 0.02;
            }
            vid.play().catch(() => {});
          } catch {
            // Ignore seek failure
          }
          frozenTicksRef.current = 0;
        }
      } else {
        lastProgressedTimeRef.current = nowTime;
        frozenTicksRef.current = 0;
      }

      const audioCfg = audioSettingsRef.current;
      vid.muted = audioCfg.muted;
      if (!cinemaAudioEngine.isVideoAttached(vid)) {
        vid.volume = audioCfg.muted ? 0 : audioCfg.masterVolume * audioCfg.videoVolume;
        silenceStreakRef.current = 0;
        return;
      }

      // If Web Audio hijacked <video> yet produces dead silence while decoded audio exists (mobile quirk), recover cleanly to native audio
      if (!audioCfg.muted && audioCfg.masterVolume > 0.05 && audioCfg.videoVolume > 0.05 && !vid.paused) {
        if (!cinemaAudioEngine.isRunning) {
          silenceStreakRef.current += 1;
        } else {
          const decodedAudioBytes =
            (vid as HTMLVideoElement & { webkitAudioDecodedByteCount?: number })
              .webkitAudioDecodedByteCount ?? 0;
          const mobileDevice = isMobileDevice();
          if (
            !cinemaAudioEngine.hasActiveVideoSignal() &&
            vid.currentTime > 0.7 &&
            (decodedAudioBytes > 0 || mobileDevice)
          ) {
            silenceStreakRef.current += 1;
          } else {
            silenceStreakRef.current = 0;
          }
        }

        if (silenceStreakRef.current >= 2) {
          replaceActiveDeckWithNative();
        }
      }
    }, 600);

    return () => {
      window.clearInterval(watchdogId);
      vid.removeEventListener('loadedmetadata', syncMetadataAndDuration);
      vid.removeEventListener('loadeddata', syncMetadataAndDuration);
      vid.removeEventListener('durationchange', syncMetadataAndDuration);
      vid.removeEventListener('timeupdate', onTimeUpdate);
      vid.removeEventListener('canplay', onCanPlay);
      vid.removeEventListener('play', onPlayEvent);
      vid.removeEventListener('pause', onPauseEvent);
      vid.removeEventListener('waiting', onStallOrWait);
      vid.removeEventListener('stalled', onStallOrWait);
      vid.removeEventListener('ended', onEnded);
      vid.removeEventListener('error', onError);
    };
  }, [
    activeDeck,
    deckAEl,
    deckBEl,
    showState,
    currentItem,
    selectedTheaterConfig,
    fourDxSettings,
    autoplayBlocked,
    advancePlaylistOrComplete,
    replaceActiveDeckWithNative,
    setIsPaused,
  ]);

  // Mid-show click-on-seat shifting
  const handleSelectSeatInShow = useCallback(
    (seatId: string) => {
      if (!selectedTheaterConfig || !selectedSeat) return;
      const target = theaterSeats.find((s) => s.id === seatId);
      if (!target || target.status === 'unavailable') return;

      if (seatId !== selectedSeat.id) {
        selectSeat(seatId);
        const seatOffsetRatio =
          target.worldPosition[0] / Math.max(1, selectedTheaterConfig.auditoriumWidth / 2);
        cinemaAudioEngine.updateSeatPan(selectedTheaterConfig.audioProfile, seatOffsetRatio);
        setSeatShiftToast(`Shifted to Seat ${seatId}`);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setSeatShiftToast(null), 2200);
      }
      setHoveredSeatId(null);
      setViewMode('seat');
    },
    [selectedTheaterConfig, selectedSeat, theaterSeats, selectSeat],
  );

  const isHoveringHudRef = useRef(false);

  // Auto-hide HUD during active playback on inactivity (avoid redundant state churn while dragging)
  const bumpHudActivity = useCallback(() => {
    if (!hudVisibleRef.current) {
      setHudVisible(true);
    }
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
    }
    if (
      showState === 'SHOW_PLAYING' &&
      !isPaused &&
      !showMixerPopover &&
      !show4dxPopover &&
      !showExitConfirm &&
      !isHoveringHudRef.current &&
      viewMode === 'seat'
    ) {
      inactivityTimerRef.current = window.setTimeout(() => {
        if (!isHoveringHudRef.current) {
          setHudVisible(false);
        }
      }, 7500);
    }
  }, [showState, isPaused, showMixerPopover, show4dxPopover, showExitConfirm, viewMode]);

  useEffect(() => {
    bumpHudActivity();
    return () => {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    };
  }, [bumpHudActivity]);

  // Keyboard shortcuts (Space = Pause/Resume, H = Hide Controls)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setControlsManuallyHidden((v) => !v);
      } else if (e.code === 'Space' && showState === 'SHOW_PLAYING') {
        e.preventDefault();
        const vid = getActiveVideoEl();
        if (!vid) return;
        if (vid.paused) {
          vid.play().catch(() => {});
          setIsPaused(false);
        } else {
          vid.pause();
          setIsPaused(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showState, setIsPaused, getActiveVideoEl]);

  // Fullscreen listener: re-verify continuous smooth video & audio playback after fullscreen transitions
  useEffect(() => {
    const keepPlayingAfterFullscreen = () => {
      const vid = getActiveVideoEl();
      if (
        showState === 'SHOW_PLAYING' &&
        !isPausedRef.current &&
        vid &&
        !vid.ended &&
        vid.readyState >= 2 &&
        vid.paused
      ) {
        cinemaAudioEngine.resume().catch(() => {});
        vid.play().catch(() => {});
      }
    };

    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      keepPlayingAfterFullscreen();
      window.setTimeout(keepPlayingAfterFullscreen, 120);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [showState, getActiveVideoEl]);

  if (!selectedTheaterConfig || !selectedSeat || playlist.length === 0) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070709] p-6 text-center text-[#F4F1EA]">
        <h1 className="font-display text-3xl">Auditorium Session Unavailable</h1>
        <p className="mt-2 max-w-md text-sm text-neutral-400">
          Theater configuration, seat coordinates, or local video playlist is missing.
        </p>
        <button
          type="button"
          onClick={() => navigate('home')}
          className="mt-6 rounded-md bg-[#D4AF37] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer"
        >
          Return Home
        </button>
      </div>
    );
  }

  const togglePlayPause = () => {
    const vid = getActiveVideoEl();
    if (!vid) return;
    cinemaAudioEngine.unlockFromGesture();
    if (vid.paused) {
      cinemaAudioEngine.attachVideoElement(vid);
      vid.muted = audioSettings.muted;
      vid
        .play()
        .then(() => {
          setIsPaused(false);
          setAutoplayBlocked(false);
        })
        .catch(() => setAutoplayBlocked(true));
    } else {
      vid.pause();
      setIsPaused(true);
    }
  };

  const handleRestartShow = () => {
    cinemaAudioEngine.unlockFromGesture();
    advancingForIndexRef.current = null;
    silenceStreakRef.current = 0;
    frozenTicksRef.current = 0;
    lastProgressedTimeRef.current = -1;
    const vidA = deckARef.current;
    const vidB = deckBRef.current;
    const mobile = isMobileDevice();
    if (vidA && playlist[0]) {
      vidA.pause();
      if (loadedUrlRef.current.A !== playlist[0].objectUrl) {
        loadedUrlRef.current.A = playlist[0].objectUrl;
        vidA.src = playlist[0].objectUrl;
        vidA.load();
      }
      vidA.currentTime = 0;
    }
    if (vidB) {
      vidB.pause();
      if (!mobile && playlist[1]) {
        loadedUrlRef.current.B = playlist[1].objectUrl;
        vidB.src = playlist[1].objectUrl;
        vidB.currentTime = 0;
        vidB.load();
      }
    }
    setActiveDeck('A');
    setShowCompleted(false);
    setCurrentPlaybackIndex(0);
    setCurrentTime(0);
    setIsPaused(false);
    setShowState('SHOW_PLAYING');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    const vid = getActiveVideoEl();
    if (!vid) return;
    const target = e.currentTarget;
    const nextTime = parseFloat(target.value);
    if (!Number.isFinite(nextTime)) return;
    vid.currentTime = nextTime;
    setCurrentTime(nextTime);
    bumpHudActivity();
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen denied or unsupported
    }
  };

  const handleManualUnlockPlay = async () => {
    const vid = getActiveVideoEl();
    if (!vid) return;
    try {
      cinemaAudioEngine.unlockFromGesture();
      vid.muted = audioSettings.muted;
      if (!cinemaAudioEngine.isVideoAttached(vid)) {
        vid.volume = audioSettings.muted
          ? 0
          : audioSettings.masterVolume * audioSettings.videoVolume;
      }
      const playPromise = vid.play();
      const seatOffsetRatio =
        selectedSeat.worldPosition[0] /
        Math.max(1, selectedTheaterConfig.auditoriumWidth / 2);
      await playPromise;
      await cinemaAudioEngine.initialize(
        selectedTheaterConfig.audioProfile,
        seatOffsetRatio,
        selectedTheaterConfig,
      );
      if (cinemaAudioEngine.isRunning && !cinemaAudioEngine.isVideoHijackDisabled) {
        cinemaAudioEngine.attachVideoElement(vid);
      }
      setAutoplayBlocked(false);
      setIsPaused(false);
    } catch {
      setPlaybackError('Unable to start browser media playback.');
    }
  };

  const handleEnableMobileAudio = () => {
    cinemaAudioEngine.unlockFromGesture();
    const vid = getActiveVideoEl();
    if (vid) {
      cinemaAudioEngine.attachVideoElement(vid);
      vid.muted = false;
      if (vid.paused && !isPaused) {
        vid.play().catch(() => {});
      }
    }
    if (audioSettings.muted) {
      updateAudioSettings({ muted: false });
    }
    bumpHudActivity();
  };

  const handleExitAndReturnHome = () => {
    if (isLeaving) return;
    setIsLeaving(true);
    [deckARef.current, deckBRef.current].forEach((vid) => {
      if (vid) vid.pause();
    });
    try {
      cinemaAudioEngine.fadeOutVideo(0.4);
    } catch {
      // Ignore fade-out error if audio context unavailable
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    leaveTimerRef.current = window.setTimeout(() => {
      try {
        cinemaAudioEngine.dispose();
      } catch {
        // Ignore audio disposal error
      }
      resetShowSession();
    }, 250);
  };

  const handleEntranceComplete = useCallback(() => setEntranceComplete(true), []);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  const effectiveHudVisible = !controlsManuallyHidden && hudVisible;

  return (
    <div
      ref={containerRef}
      onMouseMove={bumpHudActivity}
      onPointerDown={bumpHudActivity}
      onTouchStart={bumpHudActivity}
      className="relative h-screen w-screen overflow-hidden bg-[#040406] text-[#F4F1EA] select-none"
    >
      {/* Hardware-decode video host: minimal compositor anchor in 3D modes, native 1:1 full-bleed player in Full Screen */}
      <div
        ref={videoHostRef}
        aria-hidden={!showNativeFullVideo}
        className={
          showNativeFullVideo
            ? 'pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[#030305]'
            : 'pointer-events-none absolute bottom-0 left-0 z-[1] h-[18px] w-[32px] overflow-hidden opacity-[0.005]'
        }
      />

      {/* 3D Auditorium Canvas */}
      <CinemaAuditoriumCanvas
        config={selectedTheaterConfig}
        seats={theaterSeats}
        selectedSeat={selectedSeat}
        hoveredSeatId={hoveredSeatId}
        onSelectSeat={handleSelectSeatInShow}
        onHoverSeat={setHoveredSeatId}
        videoElementA={deckAEl}
        videoElementB={deckBEl}
        activeDeck={activeDeck}
        videoAspectRatio={videoAspect}
        screenFraming={screenFraming}
        viewMode={viewMode}
        showState={showState}
        isPaused={isPaused}
        graphicsQuality={graphicsQuality}
        fourDxSettings={fourDxSettings}
        screenReflectionBrightness={screenReflectionBrightness}
        entranceComplete={entranceComplete}
        onEntranceComplete={handleEntranceComplete}
        resetViewSignal={resetViewSignal}
        skipWalkSignal={skipWalkSignal}
        onSceneReady={handleSceneReady}
      />

      {/* Cinematic Fade-Out Transition Overlay when Leaving */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 bg-black transition-opacity duration-300 ${
          isLeaving ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Loading Auditorium Overlay */}
      {!sceneReady && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#070709] p-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D4AF37]/25 border-t-[#D4AF37]" />
          <p className="mt-5 font-display text-2xl text-[#F4F1EA]">
            {selectedTheaterConfig.theaterName}
          </p>
        </div>
      )}

      {/* Entrance Walk Prompt */}
      {sceneReady && !entranceComplete && (
        <div className="absolute bottom-6 left-1/2 z-30 flex items-center gap-3 rounded-lg border border-white/15 bg-[#090A0E]/92 px-4 py-2">
          <span className="text-xs text-neutral-300">
            Seat <strong className="text-[#E5C158]">{selectedSeat.id}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              cinemaAudioEngine.unlockFromGesture();
              primeVideoForGesture(getActiveVideoEl());
              setSkipWalkSignal((n) => n + 1);
            }}
            className="shrink-0 rounded border border-white/20 px-3 py-1 text-[11px] font-medium text-[#F4F1EA] hover:border-[#D4AF37] cursor-pointer"
          >
            Skip
          </button>
        </div>
      )}

      {/* Seated Pre-Show Start CTA */}
      {sceneReady && entranceComplete && showState === 'AUDITORIUM_OPEN' && (
        <div className="absolute bottom-36 sm:bottom-28 left-1/2 z-30 -translate-x-1/2">
          <button
            type="button"
            onClick={beginShowSequence}
            className="inline-flex items-center gap-2 rounded-md bg-[#D4AF37] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#070709] hover:bg-[#E5C158] cursor-pointer shadow-lg whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Start Show</span>
          </button>
        </div>
      )}

      {/* Mobile Audio Unlock Prompt only if Web Audio attached a video yet OS suspended AudioContext */}
      {showState === 'SHOW_PLAYING' &&
        !isPaused &&
        !audioSettings.muted &&
        !audioRunning &&
        !cinemaAudioEngine.isVideoHijackDisabled &&
        cinemaAudioEngine.isVideoAttached(activeDeck === 'A' ? deckAEl : deckBEl) &&
        !autoplayBlocked && (
          <div className="absolute top-24 sm:top-16 left-1/2 z-30 -translate-x-1/2">
            <button
              type="button"
              onClick={handleEnableMobileAudio}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/60 bg-[#090A0E]/94 px-4 py-2 text-xs font-semibold text-[#E5C158] shadow-lg cursor-pointer hover:bg-[#D4AF37] hover:text-[#070709] transition-colors whitespace-nowrap"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Tap to Enable Audio</span>
            </button>
          </div>
        )}

      {/* Mid-show Interactive Seat Hover Target */}
      {entranceComplete && hoveredSeatId && hoveredSeatId !== selectedSeat.id && (
        <div className="pointer-events-none absolute top-24 sm:top-16 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[#38bdf8]/45 bg-[#090A0E]/92 px-3.5 py-1.5 text-[11px] sm:text-xs text-[#bae6fd] whitespace-nowrap">
          Seat <strong className="text-white">{hoveredSeatId}</strong>
        </div>
      )}

      {seatShiftToast && !hoveredSeatId && (
        <div className="pointer-events-none absolute top-24 sm:top-16 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[#D4AF37]/45 bg-[#090A0E]/92 px-3.5 py-1.5 text-[11px] sm:text-xs text-[#E5C158] whitespace-nowrap">
          {seatShiftToast}
        </div>
      )}

      {/* Autoplay Blocked Prompt */}
      {autoplayBlocked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-md rounded-xl border border-[#D4AF37]/40 bg-[#0E0F13] p-6 text-center space-y-4">
            <h2 className="font-display text-2xl text-[#F4F1EA]">Start Projection & Audio</h2>
            <p className="text-sm text-neutral-300">
              Your browser paused automatic audio playback after the walk-in sequence. Tap below
              to start your video with full Web Audio sound.
            </p>
            <button
              type="button"
              onClick={handleManualUnlockPlay}
              className="inline-flex items-center gap-2 rounded-md bg-[#D4AF37] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#070709] hover:bg-[#E5C158] cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Play Video With Audio</span>
            </button>
          </div>
        </div>
      )}

      {/* Playback Error Modal */}
      {playbackError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6">
          <div className="max-w-md rounded-xl border border-red-500/40 bg-[#0E0F13] p-6 text-center space-y-4">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
            <h2 className="font-display text-2xl text-[#F4F1EA]">Playback Interrupted</h2>
            <p className="text-sm text-neutral-300">{playbackError}</p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('video_upload')}
                className="rounded-md border border-white/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-200 hover:bg-white/5 cursor-pointer"
              >
                Re-select Video
              </button>
              <button
                type="button"
                onClick={handleExitAndReturnHome}
                className="rounded-md bg-[#D4AF37] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top-Left & Top-Right Corner Controls */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          e.stopPropagation();
          bumpHudActivity();
        }}
        onMouseEnter={() => {
          isHoveringHudRef.current = true;
          bumpHudActivity();
        }}
        onMouseLeave={() => {
          isHoveringHudRef.current = false;
          bumpHudActivity();
        }}
        className={`absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-20 flex flex-wrap items-center justify-between gap-2 transition-opacity duration-300 ${
          effectiveHudVisible
            ? 'opacity-100'
            : controlsManuallyHidden
              ? 'opacity-0 pointer-events-none'
              : 'opacity-0 hover:opacity-100'
        }`}
      >
        <div className="max-w-[52vw] sm:max-w-none truncate rounded-lg border border-white/10 bg-[#090A0E]/88 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs">
          <span className="font-medium text-[#F4F1EA]">{selectedTheaterConfig.shortName}</span>
          <span className="mx-1.5 sm:mx-2 text-neutral-600">·</span>
          <span className="font-mono-tabular text-[#E5C158]">Seat {selectedSeat.id}</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* View Mode Switcher: Seat / Hall (Click Any Seat) / Full Screen */}
          {entranceComplete && (
            <div className="flex items-center rounded-lg border border-white/10 bg-[#090A0E]/88 p-0.5 text-[11px] sm:text-xs">
              <button
                type="button"
                onClick={() => setViewMode('seat')}
                className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-2.5 py-1 sm:py-1.5 cursor-pointer transition-colors ${
                  viewMode === 'seat'
                    ? 'bg-[#D4AF37] text-[#070709] font-semibold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                <Armchair className="h-3.5 w-3.5" />
                <span>Seat</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hall')}
                className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-2.5 py-1 sm:py-1.5 cursor-pointer transition-colors ${
                  viewMode === 'hall'
                    ? 'bg-[#D4AF37] text-[#070709] font-semibold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Hall</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('screen_full')}
                className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-2.5 py-1 sm:py-1.5 cursor-pointer transition-colors ${
                  viewMode === 'screen_full'
                    ? 'bg-[#D4AF37] text-[#070709] font-semibold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="sm:hidden">Full</span>
                <span className="hidden sm:inline">Full Screen</span>
              </button>
            </div>
          )}

          {viewMode === 'seat' && (
            <button
              type="button"
              onClick={() => setResetViewSignal((n) => n + 1)}
              title="Reset View to Screen Center"
              aria-label="Reset View to Screen Center"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#090A0E]/88 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs text-neutral-200 hover:border-[#D4AF37]/60 cursor-pointer"
            >
              <Compass className="h-3.5 w-3.5 text-[#D4AF37]" />
              <span className="hidden md:inline">Reset View</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            aria-label="Exit Show"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#090A0E]/88 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs text-neutral-200 hover:border-red-400/60 hover:text-red-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit Show</span>
          </button>
        </div>
      </div>

      {/* Show Controls Toggle Button when Manually Hidden */}
      {controlsManuallyHidden && !showCompleted && entranceComplete && (
        <button
          type="button"
          onClick={() => setControlsManuallyHidden(false)}
          className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#090A0E]/85 px-3 py-2 text-xs text-neutral-300 hover:text-white cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Show Controls</span>
        </button>
      )}

      {/* Minimal Bottom Cinema Control Dock */}
      {!showCompleted && entranceComplete && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            e.stopPropagation();
            bumpHudActivity();
          }}
          onMouseEnter={() => {
            isHoveringHudRef.current = true;
            bumpHudActivity();
          }}
          onMouseLeave={() => {
            isHoveringHudRef.current = false;
            bumpHudActivity();
          }}
          className={`absolute bottom-2.5 sm:bottom-4 left-1/2 z-20 w-[min(940px,96vw)] -translate-x-1/2 transition-opacity duration-300 ${
            effectiveHudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Audio & Screen Reflection Mixer Popover */}
          {showMixerPopover && (
            <div className="mb-2 ml-auto w-full sm:w-80 rounded-xl border border-white/15 bg-[#0B0C10]/96 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-semibold text-[#F4F1EA]">Audio &amp; Visual Mixer</span>
                <button
                  type="button"
                  onClick={() => setShowMixerPopover(false)}
                  className="text-neutral-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div>
                <div className="flex justify-between text-neutral-300 mb-1">
                  <span>Master Volume</span>
                  <span className="font-mono-tabular">
                    {audioSettings.muted ? 'Muted' : `${Math.round(audioSettings.masterVolume * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioSettings.muted ? 0 : audioSettings.masterVolume}
                  onChange={(e) => {
                    cinemaAudioEngine.unlockFromGesture();
                    updateAudioSettings({
                      masterVolume: parseFloat(e.target.value),
                      muted: false,
                    });
                  }}
                  className="w-full touch-none accent-[#D4AF37]"
                />
              </div>
              <div>
                <div className="flex justify-between text-neutral-300 mb-1">
                  <span>Video Audio</span>
                  <span className="font-mono-tabular">
                    {Math.round(audioSettings.videoVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioSettings.videoVolume}
                  onChange={(e) => {
                    cinemaAudioEngine.unlockFromGesture();
                    updateAudioSettings({ videoVolume: parseFloat(e.target.value) });
                  }}
                  className="w-full touch-none accent-[#D4AF37]"
                />
              </div>
              <div className="border-t border-white/10 pt-2.5">
                <div className="flex justify-between text-neutral-300 mb-1">
                  <span>Screen Light Reflection</span>
                  <span className="font-mono-tabular text-[#E5C158]">
                    {Math.round(screenReflectionBrightness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  aria-label="Screen Light Reflection Brightness"
                  value={screenReflectionBrightness}
                  onChange={(e) =>
                    setScreenReflectionBrightness(parseFloat(e.target.value))
                  }
                  className="w-full accent-[#D4AF37] cursor-pointer"
                />
              </div>
              <label className="flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-neutral-300 cursor-pointer">
                <span>Dolby 3D Spatial Audio</span>
                <input
                  type="checkbox"
                  checked={audioSettings.spatialSimulation}
                  onChange={(e) =>
                    updateAudioSettings({ spatialSimulation: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#D4AF37]"
                />
              </label>
            </div>
          )}

          {/* 4DX Theme-Park Motion & Wind Controls Popover */}
          {show4dxPopover && selectedTheaterConfig.supports4dxEffects && (
            <div className="mb-2 ml-auto w-full sm:w-80 rounded-xl border border-white/15 bg-[#0B0C10]/96 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-semibold text-[#F4F1EA]">
                  4DX Motion & Effects
                </span>
                <button
                  type="button"
                  onClick={() => setShow4dxPopover(false)}
                  className="text-neutral-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-neutral-300">Motion-Synchronized Seats</span>
                <input
                  type="checkbox"
                  checked={fourDxSettings.enabled}
                  onChange={(e) => updateFourDxSettings({ enabled: e.target.checked })}
                  className="h-4 w-4 accent-[#D4AF37]"
                />
              </label>
              <div>
                <div className="flex justify-between text-neutral-400 mb-1">
                  <span>Seat Hydraulic Heave & Pitch</span>
                  <span className="font-mono-tabular">
                    {Math.round(fourDxSettings.vibrationIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!fourDxSettings.enabled}
                  value={fourDxSettings.vibrationIntensity}
                  onChange={(e) =>
                    updateFourDxSettings({ vibrationIntensity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-[#D4AF37]"
                />
              </div>
              <div>
                <div className="flex justify-between text-neutral-400 mb-1">
                  <span>Synchronized Camera Motion</span>
                  <span className="font-mono-tabular">
                    {Math.round(fourDxSettings.cameraMotionIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!fourDxSettings.enabled}
                  value={fourDxSettings.cameraMotionIntensity}
                  onChange={(e) =>
                    updateFourDxSettings({ cameraMotionIntensity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-[#D4AF37]"
                />
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-neutral-300">Lightning & Strobe Pulses</span>
                <input
                  type="checkbox"
                  disabled={!fourDxSettings.enabled}
                  checked={fourDxSettings.atmosphericLightEnabled}
                  onChange={(e) =>
                    updateFourDxSettings({ atmosphericLightEnabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#D4AF37]"
                />
              </label>
            </div>
          )}

          {/* Main Compact Control Bar */}
          <div className="rounded-xl border border-white/12 bg-[#090A0E]/92 px-3 py-2.5 sm:px-4 sm:py-3 space-y-2">
            {/* Video Progress Scrubber & Exact Timing */}
            <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono-tabular text-neutral-300">
              <span className="min-w-[38px] text-right shrink-0">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.1}
                value={Math.min(currentTime, Math.max(duration, 0.1))}
                onInput={handleSeek}
                onChange={handleSeek}
                disabled={showState !== 'SHOW_PLAYING'}
                aria-label="Video playback progress"
                className="h-5 flex-1 touch-none accent-[#D4AF37] cursor-pointer"
              />
              <span className="min-w-[38px] shrink-0 text-neutral-400">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Buttons & Playlist Readout */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  disabled={showState !== 'SHOW_PLAYING'}
                  aria-label={isPaused ? 'Resume playback' : 'Pause playback'}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md bg-[#D4AF37] text-[#070709] hover:bg-[#E5C158] disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {isPaused ? (
                    <Play className="h-4 w-4 fill-current" />
                  ) : (
                    <Pause className="h-4 w-4 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRestartShow}
                  title="Restart Show"
                  aria-label="Restart show"
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:text-white cursor-pointer shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>

                <div className="min-w-0 flex-1 pl-0.5 sm:pl-1">
                  <p className="truncate text-[11px] sm:text-xs font-medium text-[#F4F1EA]">
                    {currentItem ? currentItem.fileName : 'Loading'}
                  </p>
                  <p className="font-mono-tabular text-[10px] sm:text-[11px] text-neutral-400">
                    {String(currentPlaybackIndex + 1).padStart(2, '0')} /{' '}
                    {String(playlist.length).padStart(2, '0')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Screen Fill vs Aspect Fit Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setScreenFraming(screenFraming === 'fill' ? 'fit' : 'fill')
                  }
                  title={
                    screenFraming === 'fill'
                      ? 'Screen framing: Fill entire projection screen (click for Fit)'
                      : 'Screen framing: Fit original aspect ratio (click for Fill)'
                  }
                  className="inline-flex h-8 sm:h-9 items-center gap-1 rounded-md border border-white/10 px-2 sm:px-2.5 text-[11px] text-neutral-200 hover:border-[#D4AF37]/60 cursor-pointer"
                >
                  <Monitor className="h-3.5 w-3.5 text-[#D4AF37]" />
                  <span className="sm:hidden">
                    {screenFraming === 'fill' ? 'Fill' : 'Fit'}
                  </span>
                  <span className="hidden sm:inline">
                    {screenFraming === 'fill' ? 'Fill Screen' : 'Fit Frame'}
                  </span>
                </button>

                {/* 4DX Effects Trigger */}
                {selectedTheaterConfig.supports4dxEffects && (
                  <button
                    type="button"
                    onClick={() => {
                      setShow4dxPopover((v) => !v);
                      setShowMixerPopover(false);
                    }}
                    className={`inline-flex h-8 sm:h-9 items-center gap-1 rounded-md border px-2 sm:px-2.5 text-[11px] cursor-pointer ${
                      fourDxSettings.enabled
                        ? 'border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#7dd3fc]'
                        : 'border-white/10 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">4DX</span>
                  </button>
                )}

                {/* Mute & Master Volume */}
                <button
                  type="button"
                  onClick={() => {
                    cinemaAudioEngine.unlockFromGesture();
                    updateAudioSettings({ muted: !audioSettings.muted });
                  }}
                  aria-label={audioSettings.muted ? 'Unmute' : 'Mute'}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:text-white cursor-pointer"
                >
                  {audioSettings.muted ? (
                    <VolumeX className="h-4 w-4 text-red-400" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioSettings.muted ? 0 : audioSettings.masterVolume}
                  onChange={(e) =>
                    updateAudioSettings({
                      masterVolume: parseFloat(e.target.value),
                      muted: false,
                    })
                  }
                  aria-label="Master Volume"
                  className="hidden md:block w-20 accent-[#D4AF37] cursor-pointer"
                />

                <button
                  type="button"
                  onClick={() => {
                    setShowMixerPopover((v) => !v);
                    setShow4dxPopover(false);
                  }}
                  title="Audio & Visual Mixer"
                  aria-label="Open audio mixer"
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:text-white cursor-pointer"
                >
                  <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setControlsManuallyHidden(true)}
                  title="Hide Controls (H)"
                  aria-label="Hide controls"
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:text-white cursor-pointer"
                >
                  <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Browser Fullscreen' : 'Enter Browser Fullscreen'}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:text-white cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show Completed Overlay */}
      {showCompleted && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-6">
          <div className="max-w-lg rounded-2xl border border-[#D4AF37]/40 bg-[#0B0C10]/96 p-8 sm:p-10 text-center space-y-5">
            <p className="text-xs font-medium tracking-[0.24em] text-[#D4AF37] uppercase">
              {selectedTheaterConfig.theaterName} · Seat {selectedSeat.id}
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-semibold text-[#F4F1EA]">
              Show Ended
            </h2>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRestartShow}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#F4F1EA] hover:border-[#D4AF37] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Replay</span>
              </button>
              <button
                type="button"
                onClick={handleExitAndReturnHome}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#D4AF37] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#070709] hover:bg-[#E5C158] cursor-pointer"
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0E0F13] p-6 space-y-5">
            <h2 className="font-display text-2xl font-semibold text-[#F4F1EA]">
              Leave Auditorium?
            </h2>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="rounded-md border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-200 hover:bg-white/5 cursor-pointer"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleExitAndReturnHome}
                className="rounded-md bg-[#D4AF37] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[#070709] hover:bg-[#E5C158] cursor-pointer"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
