import { create } from 'zustand';
import {
  AppRoute,
  AudioSettings,
  FourDxSettings,
  GraphicsQuality,
  PlaylistItem,
  ScreenFramingMode,
  SeatData,
  ShowState,
  TheaterConfiguration,
  TheaterId,
  VideoMode,
} from '../types/cinema';
import { THEATER_CONFIGS } from '../config/theaters/theaterConfigs';
import { generateSeatsForTheater } from '../config/seating/seatGenerator';
import {
  clearAllVideosFromIndexedDb,
  deleteVideoFromIndexedDb,
  loadSessionFromIndexedDb,
  saveSessionToIndexedDb,
} from '../services/storage/indexedDbService';
import {
  revokeAllTrackedObjectUrls,
  revokeTrackedObjectUrl,
  trackObjectUrl,
} from '../services/media/videoProcessor';
import { detectDefaultGraphicsQuality } from '../utils/formatters';

const PREFS_STORAGE_KEY = 'aurelia_cinema_prefs_v2';
const LEGACY_PREFS_STORAGE_KEY = 'aurelia_cinema_prefs_v1';

interface StoredPreferences {
  graphicsQuality: GraphicsQuality;
  audioSettings: AudioSettings;
  fourDxSettings: FourDxSettings;
  screenReflectionBrightness: number;
}

function loadSavedPreferences(): Partial<StoredPreferences> {
  try {
    const rawV2 = localStorage.getItem(PREFS_STORAGE_KEY);
    if (rawV2) {
      return JSON.parse(rawV2) as Partial<StoredPreferences>;
    }
    const rawLegacy = localStorage.getItem(LEGACY_PREFS_STORAGE_KEY);
    if (rawLegacy) {
      const legacy = JSON.parse(rawLegacy) as Partial<StoredPreferences>;
      // Re-detect optimal graphicsQuality once so mobile devices upgrade from old forced 'low'
      return {
        audioSettings: legacy.audioSettings,
        fourDxSettings: legacy.fourDxSettings,
        screenReflectionBrightness: legacy.screenReflectionBrightness,
      };
    }
    return {};
  } catch {
    return {};
  }
}

function persistPreferences(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore localStorage quota issues
  }
}

const savedPrefs = loadSavedPreferences();

const DEFAULT_AUDIO: AudioSettings = {
  masterVolume: 0.85,
  videoVolume: 1.0,
  ambienceVolume: 0,
  effectsVolume: 0,
  spatialSimulation: true,
  ...savedPrefs.audioSettings,
  muted: false,
};

const DEFAULT_FOUR_DX: FourDxSettings = {
  enabled: false,
  vibrationIntensity: 0.3,
  cameraMotionIntensity: 0.25,
  windAudioEnabled: false,
  atmosphericLightEnabled: true,
  ...savedPrefs.fourDxSettings,
};

export interface CinemaStoreState {
  route: AppRoute;
  selectedTheaterId: TheaterId | null;
  selectedTheaterConfig: TheaterConfiguration | null;
  theaterSeats: SeatData[];
  selectedSeatId: string | null;
  selectedSeat: SeatData | null;

  videoMode: VideoMode;
  playlist: PlaylistItem[];
  currentPlaybackIndex: number;
  showState: ShowState;
  isPaused: boolean;
  showCompleted: boolean;
  screenFraming: ScreenFramingMode;

  graphicsQuality: GraphicsQuality;
  audioSettings: AudioSettings;
  fourDxSettings: FourDxSettings;
  screenReflectionBrightness: number;

  recoveryNotice: string | null;
  isSettingsOpen: boolean;

  // Navigation & Theater actions
  navigate: (route: AppRoute) => void;
  selectTheater: (theaterId: TheaterId, nextRoute?: AppRoute) => void;
  selectSeat: (seatId: string | null) => void;

  // Playlist & Video Mode actions
  setVideoMode: (mode: VideoMode) => void;
  addPlaylistItems: (items: PlaylistItem[]) => void;
  replacePlaylistItem: (id: string, newItem: PlaylistItem) => void;
  removePlaylistItem: (id: string) => void;
  reorderPlaylist: (fromIndex: number, toIndex: number) => void;
  clearPlaylist: () => void;

  // Show & Playback actions
  setShowState: (state: ShowState) => void;
  setCurrentPlaybackIndex: (index: number) => void;
  setIsPaused: (paused: boolean) => void;
  setShowCompleted: (completed: boolean) => void;
  setScreenFraming: (framing: ScreenFramingMode) => void;

  // Settings actions
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  updateAudioSettings: (partial: Partial<AudioSettings>) => void;
  updateFourDxSettings: (partial: Partial<FourDxSettings>) => void;
  setScreenReflectionBrightness: (value: number) => void;
  setSettingsOpen: (open: boolean) => void;
  dismissRecoveryNotice: () => void;

  // Session lifecycle
  rehydrateFromIndexedDb: () => Promise<void>;
  resetShowSession: () => void;
  clearLocalCache: () => Promise<void>;
}

export const useCinemaStore = create<CinemaStoreState>((set, get) => ({
  route: 'home',
  selectedTheaterId: null,
  selectedTheaterConfig: null,
  theaterSeats: [],
  selectedSeatId: null,
  selectedSeat: null,

  videoMode: 'without_ads',
  playlist: [],
  currentPlaybackIndex: 0,
  showState: 'AUDITORIUM_OPEN',
  isPaused: false,
  showCompleted: false,
  screenFraming: 'fill',

  graphicsQuality: savedPrefs.graphicsQuality || detectDefaultGraphicsQuality(),
  audioSettings: DEFAULT_AUDIO,
  fourDxSettings: DEFAULT_FOUR_DX,
  screenReflectionBrightness:
    typeof savedPrefs.screenReflectionBrightness === 'number'
      ? Math.max(0, Math.min(2, savedPrefs.screenReflectionBrightness))
      : 1.0,

  recoveryNotice: null,
  isSettingsOpen: false,

  navigate: (route) => {
    set({ route });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  selectTheater: (theaterId, nextRoute) => {
    const config = THEATER_CONFIGS[theaterId];
    if (!config) return;
    const seats = generateSeatsForTheater(config);
    const prevTheaterId = get().selectedTheaterId;
    // Keep seat only if same theater and still valid, else reset seat
    const prevSeatId = prevTheaterId === theaterId ? get().selectedSeatId : null;
    const matchedSeat = prevSeatId ? seats.find((s) => s.id === prevSeatId) || null : null;

    const nextFourDx = config.supports4dxEffects
      ? {
          enabled: true,
          vibrationIntensity: Math.max(0.65, get().fourDxSettings.vibrationIntensity),
          cameraMotionIntensity: Math.max(0.55, get().fourDxSettings.cameraMotionIntensity),
          windAudioEnabled: false,
          atmosphericLightEnabled: true,
        }
      : {
          ...get().fourDxSettings,
          enabled: false,
        };

    set({
      selectedTheaterId: theaterId,
      selectedTheaterConfig: config,
      theaterSeats: seats,
      selectedSeatId: matchedSeat ? matchedSeat.id : null,
      selectedSeat: matchedSeat,
      fourDxSettings: nextFourDx,
      ...(nextRoute ? { route: nextRoute } : {}),
    });

    if (nextRoute) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const state = get();
    saveSessionToIndexedDb({
      theaterId,
      seatId: matchedSeat ? matchedSeat.id : null,
      videoMode: state.videoMode,
      playlistIds: state.playlist.map((p) => p.id),
    });
  },

  selectSeat: (seatId) => {
    const seats = get().theaterSeats;
    if (!seatId) {
      set({ selectedSeatId: null, selectedSeat: null });
      return;
    }
    const found = seats.find((s) => s.id === seatId);
    if (!found || found.status === 'unavailable') return;
    set({ selectedSeatId: found.id, selectedSeat: found });

    const state = get();
    saveSessionToIndexedDb({
      theaterId: state.selectedTheaterId,
      seatId: found.id,
      videoMode: state.videoMode,
      playlistIds: state.playlist.map((p) => p.id),
    });
  },

  setVideoMode: (mode) => {
    const current = get().playlist;
    let nextPlaylist = current;
    if (mode === 'without_ads' && current.length > 1) {
      // Keep only the first video when switching to single-video Without Ads mode
      const [first, ...rest] = current;
      rest.forEach((item) => {
        revokeTrackedObjectUrl(item.objectUrl);
        deleteVideoFromIndexedDb(item.id);
      });
      nextPlaylist = [{ ...first, orderIndex: 0 }];
    }
    set({ videoMode: mode, playlist: nextPlaylist });

    const state = get();
    saveSessionToIndexedDb({
      theaterId: state.selectedTheaterId,
      seatId: state.selectedSeatId,
      videoMode: mode,
      playlistIds: nextPlaylist.map((p) => p.id),
    });
  },

  addPlaylistItems: (items) => {
    const { videoMode, playlist } = get();
    if (videoMode === 'without_ads') {
      // Replace existing single item cleanly
      playlist.forEach((p) => {
        revokeTrackedObjectUrl(p.objectUrl);
        deleteVideoFromIndexedDb(p.id);
      });
      const single = items.slice(0, 1).map((item) => ({ ...item, orderIndex: 0 }));
      set({ playlist: single, recoveryNotice: null });
    } else {
      const merged = [...playlist, ...items].map((item, idx) => ({
        ...item,
        orderIndex: idx,
      }));
      set({ playlist: merged, recoveryNotice: null });
    }

    const state = get();
    saveSessionToIndexedDb({
      theaterId: state.selectedTheaterId,
      seatId: state.selectedSeatId,
      videoMode: state.videoMode,
      playlistIds: state.playlist.map((p) => p.id),
    });
  },

  replacePlaylistItem: (id, newItem) => {
    const playlist = get().playlist;
    const next = playlist.map((item, idx) => {
      if (item.id !== id) return item;
      revokeTrackedObjectUrl(item.objectUrl);
      deleteVideoFromIndexedDb(item.id);
      return { ...newItem, orderIndex: idx };
    });
    set({ playlist: next });

    const state = get();
    saveSessionToIndexedDb({
      theaterId: state.selectedTheaterId,
      seatId: state.selectedSeatId,
      videoMode: state.videoMode,
      playlistIds: next.map((p) => p.id),
    });
  },

  removePlaylistItem: (id) => {
    const playlist = get().playlist;
    const target = playlist.find((p) => p.id === id);
    if (target) {
      revokeTrackedObjectUrl(target.objectUrl);
      deleteVideoFromIndexedDb(target.id);
    }
    const next = playlist
      .filter((p) => p.id !== id)
      .map((item, idx) => ({ ...item, orderIndex: idx }));
    set({ playlist: next });

    const state = get();
    saveSessionToIndexedDb({
      theaterId: state.selectedTheaterId,
      seatId: state.selectedSeatId,
      videoMode: state.videoMode,
      playlistIds: next.map((p) => p.id),
    });
  },

  reorderPlaylist: (fromIndex, toIndex) => {
    const list = [...get().playlist];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    const reindexed = list.map((item, idx) => ({ ...item, orderIndex: idx }));
    set({ playlist: reindexed });

    const state = get();
    saveSessionToIndexedDb({
      theaterId: state.selectedTheaterId,
      seatId: state.selectedSeatId,
      videoMode: state.videoMode,
      playlistIds: reindexed.map((p) => p.id),
    });
  },

  clearPlaylist: () => {
    get().playlist.forEach((p) => {
      revokeTrackedObjectUrl(p.objectUrl);
      deleteVideoFromIndexedDb(p.id);
    });
    set({ playlist: [] });
  },

  setShowState: (showState) => set({ showState }),
  setCurrentPlaybackIndex: (currentPlaybackIndex) => set({ currentPlaybackIndex }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setShowCompleted: (showCompleted) => set({ showCompleted }),
  setScreenFraming: (screenFraming) => set({ screenFraming }),

  setGraphicsQuality: (graphicsQuality) => {
    set({ graphicsQuality });
    const state = get();
    persistPreferences({
      graphicsQuality,
      audioSettings: state.audioSettings,
      fourDxSettings: state.fourDxSettings,
      screenReflectionBrightness: state.screenReflectionBrightness,
    });
  },

  updateAudioSettings: (partial) => {
    const nextAudio = { ...get().audioSettings, ...partial };
    set({ audioSettings: nextAudio });
    const state = get();
    persistPreferences({
      graphicsQuality: state.graphicsQuality,
      audioSettings: nextAudio,
      fourDxSettings: state.fourDxSettings,
      screenReflectionBrightness: state.screenReflectionBrightness,
    });
  },

  updateFourDxSettings: (partial) => {
    const next4dx = { ...get().fourDxSettings, ...partial };
    set({ fourDxSettings: next4dx });
    const state = get();
    persistPreferences({
      graphicsQuality: state.graphicsQuality,
      audioSettings: state.audioSettings,
      fourDxSettings: next4dx,
      screenReflectionBrightness: state.screenReflectionBrightness,
    });
  },

  setScreenReflectionBrightness: (value) => {
    const clamped = Math.max(0, Math.min(2, Number(value.toFixed(2))));
    set({ screenReflectionBrightness: clamped });
    const state = get();
    persistPreferences({
      graphicsQuality: state.graphicsQuality,
      audioSettings: state.audioSettings,
      fourDxSettings: state.fourDxSettings,
      screenReflectionBrightness: clamped,
    });
  },

  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  dismissRecoveryNotice: () => set({ recoveryNotice: null }),

  rehydrateFromIndexedDb: async () => {
    const { session, videos, available } = await loadSessionFromIndexedDb();
    if (!available) {
      return;
    }

    if (session?.theaterId && THEATER_CONFIGS[session.theaterId as TheaterId]) {
      const config = THEATER_CONFIGS[session.theaterId as TheaterId];
      const seats = generateSeatsForTheater(config);
      const matchedSeat = session.seatId
        ? seats.find((s) => s.id === session.seatId) || null
        : null;

      const videoMap = new Map(videos.map((v) => [v.id, v]));
      const restoredPlaylist: PlaylistItem[] = [];
      let missingCount = 0;

      for (const vidId of session.playlistIds || []) {
        const rec = videoMap.get(vidId);
        if (rec && rec.file) {
          const objectUrl = trackObjectUrl(URL.createObjectURL(rec.file));
          restoredPlaylist.push({
            id: rec.id,
            fileName: rec.fileName,
            fileSize: rec.fileSize,
            mimeType: rec.mimeType,
            duration: rec.duration,
            width: rec.width,
            height: rec.height,
            thumbnailUrl: rec.thumbnailUrl,
            objectUrl,
            hasIndexedDbBackup: true,
            orderIndex: restoredPlaylist.length,
            label: rec.label,
          });
        } else {
          missingCount++;
        }
      }

      set({
        selectedTheaterId: config.theaterId,
        selectedTheaterConfig: config,
        theaterSeats: seats,
        selectedSeatId: matchedSeat ? matchedSeat.id : null,
        selectedSeat: matchedSeat,
        videoMode: session.videoMode || 'without_ads',
        playlist: restoredPlaylist,
        recoveryNotice:
          missingCount > 0
            ? 'Some previously queued local videos were cleared by your browser after refresh. Please re-select them on the Upload page.'
            : null,
      });
    }
  },

  resetShowSession: () => {
    set({
      currentPlaybackIndex: 0,
      showState: 'AUDITORIUM_OPEN',
      isPaused: false,
      showCompleted: false,
      route: 'home',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  clearLocalCache: async () => {
    revokeAllTrackedObjectUrls();
    await clearAllVideosFromIndexedDb();
    set({
      playlist: [],
      selectedSeatId: null,
      selectedSeat: null,
      currentPlaybackIndex: 0,
      showState: 'AUDITORIUM_OPEN',
      showCompleted: false,
      recoveryNotice: null,
    });
  },
}));
