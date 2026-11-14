export type TheaterCategoryId =
  | 'standard_2d'
  | 'imax'
  | '4dx'
  | 'dolby'
  | 'private_luxury';

export type TheaterId =
  | 'standard_2d'
  | 'standard_2d_emerald'
  | 'standard_2d_sapphire'
  | 'imax'
  | 'imax_aurora'
  | 'imax_solar'
  | '4dx'
  | '4dx_crimson'
  | '4dx_arctic'
  | 'dolby'
  | 'dolby_cobalt'
  | 'dolby_bordeaux'
  | 'private_luxury'
  | 'private_champagne'
  | 'private_midnight';

export type SeatModelType =
  | 'standard'
  | 'imax_stadium'
  | '4dx_motion'
  | 'dolby_recliner'
  | 'private_recliner';

export type SeatPatternType = 'straight' | 'curved_arc' | 'twin_pods' | 'staggered';

export type SideLightStyle =
  | 'classic_sconces'
  | 'vertical_pillars'
  | 'diagonal_blades'
  | 'arched_ribs'
  | 'horizontal_coving'
  | 'minimal_wash';

export type CeilingLightStyle =
  | 'puck_grid'
  | 'coffered_beams'
  | 'linear_coves'
  | 'vaulted_ribs'
  | 'star_ceiling'
  | 'perimeter_halo';

export type SeatStatus = 'available' | 'premium' | 'unavailable' | 'accessible';

export interface LightingProfile {
  wallColor: string;
  accentColor: string;
  ceilingColor: string;
  stepLightColor: string;
  ambientOpenIntensity: number;
  mainOpenIntensity: number;
  wallOpenIntensity: number;
  stepOpenIntensity: number;
  screenGlowStrength: number;
}

export interface AudioProfile {
  roomSizeLabel: string;
  reverbDecay: number;
  lowShelfGainDb: number;
  highShelfGainDb: number;
  ambienceLevel: number;
  spatialSpread: number;
}

export interface EnvironmentProfile {
  carpetColor: string;
  carpetAccentColor: string;
  wallMaterialColor: string;
  ceilingColor: string;
  seatPrimaryColor: string;
  seatTrimColor: string;
  curtainColor?: string;
  seatMaterialType: 'fabric' | 'leather' | 'sport_leather';
  architectureStyle: 'classic' | 'imax' | '4dx' | 'dolby' | 'private';
}

export interface TheaterCategoryInfo {
  categoryId: TheaterCategoryId;
  name: string;
  subtitle: string;
  description: string;
}

export interface TheaterConfiguration {
  theaterId: TheaterId;
  categoryId: TheaterCategoryId;
  theaterName: string;
  shortName: string;
  ambienceName: string;
  ambienceSwatches: [string, string, string];
  category: string;
  tagline: string;
  description: string;
  previewImage: string;
  auditoriumWidth: number;
  auditoriumLength: number;
  auditoriumHeight: number;
  screenWidth: number;
  screenHeight: number;
  screenCurvature: number; // 0 = flat, >0 = cylindrical arc angle in radians
  screenPosition: [number, number, number];
  seatingRows: number;
  seatsPerRow: number;
  seatSpacing: number;
  rowSpacing: number;
  rowElevationStep: number;
  firstRowZ: number;
  seatEyeOffsetY: number;
  aisleAfterSeats: number[]; // seat numbers after which an aisle gap is placed
  aisleGapWidth: number;
  premiumRows: number[]; // 0-indexed rows
  accessibleSeatIds: string[];
  unavailableSeatIds: string[];
  seatModel: SeatModelType;
  seatPattern: SeatPatternType;
  seatWidthScale?: number;
  sideLightStyle: SideLightStyle;
  ceilingLightStyle: CeilingLightStyle;
  wallBayCount: number;
  lightingProfile: LightingProfile;
  audioProfile: AudioProfile;
  environmentProfile: EnvironmentProfile;
  screenSpecText: string;
  seatingArrangementText: string;
  audioExperienceText: string;
  lightingStyleText: string;
  features: string[];
  supports4dxEffects?: boolean;
}

export interface SeatData {
  id: string;
  rowIndex: number;
  rowLabel: string;
  seatNumber: number;
  status: SeatStatus;
  mapX: number;
  mapY: number;
  worldPosition: [number, number, number];
  eyePosition: [number, number, number];
  lookAtTarget: [number, number, number];
  nearestAisleX: number;
  yaw?: number;
  theaterId: TheaterId;
}

export type VideoMode = 'without_ads' | 'with_ads';

export interface PlaylistItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string | null;
  objectUrl: string;
  hasIndexedDbBackup: boolean;
  orderIndex: number;
  label?: string;
}

export type ShowState =
  | 'AUDITORIUM_OPEN'
  | 'SHOW_STARTING'
  | 'SHOW_PLAYING'
  | 'SHOW_COMPLETED';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type CameraViewMode = 'seat' | 'hall' | 'screen_full';

export type ScreenFramingMode = 'fill' | 'fit';

export interface AudioSettings {
  masterVolume: number;
  videoVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  muted: boolean;
  spatialSimulation: boolean;
}

export interface FourDxSettings {
  enabled: boolean;
  vibrationIntensity: number; // 0..1
  cameraMotionIntensity: number; // 0..1
  windAudioEnabled: boolean;
  atmosphericLightEnabled: boolean;
}

export type AppRoute =
  | 'home'
  | 'theaters'
  | 'theater_details'
  | 'seat_selection'
  | 'video_upload'
  | 'confirmation'
  | 'virtual_cinema';
