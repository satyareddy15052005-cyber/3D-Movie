import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  CameraViewMode,
  FourDxSettings,
  GraphicsQuality,
  ScreenFramingMode,
  SeatData,
  ShowState,
  TheaterConfiguration,
} from '../../types/cinema';
import { AuditoriumShell } from '../models/AuditoriumShell';
import { SeatModels } from '../models/SeatModels';
import { CinemaScreen, ScreenBounceSample } from '../models/CinemaScreen';
import { FourDxEffectsRig } from '../models/FourDxEffectsRig';
import { CinemaLightingRig } from '../lighting/CinemaLightingRig';
import { createScreenBounceUniforms } from '../lighting/screenBounceShader';
import { FirstPersonCameraRig } from '../cameras/FirstPersonCameraRig';
import {
  computeAdaptiveCinemaFov,
  detectWebGLSupport,
  isMobileDevice,
} from '../../utils/formatters';

interface CinemaAuditoriumCanvasProps {
  config: TheaterConfiguration;
  seats: SeatData[];
  selectedSeat: SeatData;
  hoveredSeatId: string | null;
  onSelectSeat: (seatId: string) => void;
  onHoverSeat: (seatId: string | null) => void;
  videoElementA: HTMLVideoElement | null;
  videoElementB: HTMLVideoElement | null;
  activeDeck: 'A' | 'B';
  videoAspectRatio: number;
  screenFraming: ScreenFramingMode;
  viewMode: CameraViewMode;
  showState: ShowState;
  isPaused: boolean;
  graphicsQuality: GraphicsQuality;
  fourDxSettings: FourDxSettings;
  screenReflectionBrightness?: number;
  entranceComplete: boolean;
  onEntranceComplete: () => void;
  resetViewSignal: number;
  skipWalkSignal: number;
  onSceneReady: () => void;
}

export const CinemaAuditoriumCanvas: React.FC<CinemaAuditoriumCanvasProps> = React.memo(({
  config,
  seats,
  selectedSeat,
  hoveredSeatId,
  onSelectSeat,
  onHoverSeat,
  videoElementA,
  videoElementB,
  activeDeck,
  videoAspectRatio,
  screenFraming,
  viewMode,
  showState,
  isPaused,
  graphicsQuality,
  fourDxSettings,
  screenReflectionBrightness = 1,
  entranceComplete,
  onEntranceComplete,
  resetViewSignal,
  skipWalkSignal,
  onSceneReady,
}) => {
  const webglInfo = useMemo(() => detectWebGLSupport(), []);
  const [contextLost, setContextLost] = useState(false);
  const [lightFactor, setLightFactor] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const screenBrightnessRef = useRef(0.34);
  const screenBounceRef = useRef<ScreenBounceSample>({
    r: 0.72,
    g: 0.8,
    b: 0.95,
    luminance: 0.25,
  });
  const fourDxFlashRef = useRef({ level: 0, color: '#7dd3fc' });
  const lastLightUpdateRef = useRef(0);
  const screenBounceUniforms = useMemo(
    () =>
      createScreenBounceUniforms(
        config.screenPosition,
        config.screenWidth,
        config.screenHeight,
      ),
    [config.screenPosition, config.screenWidth, config.screenHeight],
  );

  // Throttle React prop updates for emissive architecture strips so we don't cause excessive re-renders
  const handleLightFactorChange = useCallback((f: number) => {
    const now = performance.now();
    if (now - lastLightUpdateRef.current > 60 || f === 0 || f === 1) {
      lastLightUpdateRef.current = now;
      setLightFactor((prev) => (Math.abs(prev - f) > 0.02 || f === 0 || f === 1 ? f : prev));
    }
  }, []);

  if (!webglInfo.supported) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#070709] p-8 text-center">
        <h2 className="font-display text-3xl text-[#F4F1EA]">WebGL Rendering Unavailable</h2>
        <p className="mt-3 max-w-md text-sm text-neutral-400">
          Your browser or graphics driver currently has WebGL disabled. Enable hardware acceleration
          in browser settings to enter the 3D auditorium.
        </p>
      </div>
    );
  }

  // Cap Retina/4K and mobile pixel ratio cleanly so camera rotation and video decode stay fluid
  const isMobile = isMobileDevice();
  const dpr: number | [number, number] = webglInfo.isSoftwareGl
    ? 0.75
    : isMobile
      ? graphicsQuality === 'low'
        ? [1, 1.0]
        : graphicsQuality === 'medium'
          ? [1, 1.15]
          : [1, 1.25]
      : isFullscreen
        ? graphicsQuality === 'low'
          ? [1, 1.1]
          : [1, 1.25]
        : graphicsQuality === 'low'
          ? [1, 1.2]
          : graphicsQuality === 'medium'
            ? [1, 1.5]
            : [1, 1.75];

  const initialFov = computeAdaptiveCinemaFov(
    config.categoryId,
    typeof window !== 'undefined' ? window.innerWidth : 1280,
    typeof window !== 'undefined' ? window.innerHeight : 720,
  );

  const isPlaying = showState === 'SHOW_PLAYING';
  const isActivelyPlaying = isPlaying && !isPaused;
  const active4dxVibration =
    config.supports4dxEffects && fourDxSettings.enabled && isActivelyPlaying
      ? fourDxSettings.vibrationIntensity
      : 0;
  const active4dxCamera =
    config.supports4dxEffects && fourDxSettings.enabled && isActivelyPlaying
      ? fourDxSettings.cameraMotionIntensity
      : 0;

  return (
    <div className="relative h-full w-full bg-[#030305] touch-none select-none">
      {contextLost && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
          <p className="font-display text-2xl text-[#F4F1EA]">Graphics Context Interrupted</p>
          <p className="mt-2 text-sm text-neutral-400">
            Waiting for WebGL context restoration...
          </p>
        </div>
      )}

      <Canvas
        shadows={!webglInfo.isSoftwareGl && graphicsQuality === 'high' && !isMobile}
        dpr={dpr}
        gl={{
          antialias: !webglInfo.isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: initialFov, near: 0.1, far: 140 }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          canvas.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
          onSceneReady();
        }}
      >
        <CinemaLightingRig
          config={config}
          showState={showState}
          isPaused={isPaused}
          isSoftwareGl={webglInfo.isSoftwareGl || graphicsQuality === 'low'}
          onLightFactorChange={handleLightFactorChange}
          fourDxFlashRef={fourDxFlashRef}
          screenBounceRef={screenBounceRef}
          screenReflectionBrightness={screenReflectionBrightness}
        />

        <AuditoriumShell
          config={config}
          lightFactor={lightFactor}
          screenBounceUniforms={screenBounceUniforms}
        />

        <SeatModels
          config={config}
          seats={seats}
          selectedSeatId={selectedSeat.id}
          hoveredSeatId={hoveredSeatId}
          fourDxVibration={active4dxVibration}
          isPlaying={isPlaying}
          lightFactor={lightFactor}
          interactive={entranceComplete && viewMode !== 'screen_full'}
          enableHover={!isMobile && entranceComplete && viewMode === 'hall'}
          screenBounceUniforms={screenBounceUniforms}
          onSelectSeat={onSelectSeat}
          onHoverSeat={onHoverSeat}
        />

        <CinemaScreen
          config={config}
          videoElementA={videoElementA}
          videoElementB={videoElementB}
          activeDeck={activeDeck}
          videoAspectRatio={videoAspectRatio}
          screenFraming={screenFraming}
          showState={showState}
          isPaused={isPaused}
          isSoftwareGl={webglInfo.isSoftwareGl || graphicsQuality === 'low'}
          screenBrightnessRef={screenBrightnessRef}
          screenBounceRef={screenBounceRef}
          screenBounceUniforms={screenBounceUniforms}
          lightFactor={lightFactor}
          screenReflectionBrightness={screenReflectionBrightness}
        />

        <FourDxEffectsRig
          config={config}
          enabled={fourDxSettings.enabled}
          isPlaying={isActivelyPlaying}
          intensity={fourDxSettings.vibrationIntensity}
          atmosphericLightEnabled={fourDxSettings.atmosphericLightEnabled}
          fourDxFlashRef={fourDxFlashRef}
        />

        <FirstPersonCameraRig
          config={config}
          seat={selectedSeat}
          viewMode={viewMode}
          entranceComplete={entranceComplete}
          onEntranceComplete={onEntranceComplete}
          resetViewSignal={resetViewSignal}
          skipWalkSignal={skipWalkSignal}
          isPlaying={isActivelyPlaying}
          isSoftwareGl={webglInfo.isSoftwareGl}
          fourDxCameraIntensity={active4dxCamera}
        />
      </Canvas>
    </div>
  );
});
