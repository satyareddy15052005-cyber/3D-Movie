import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ShowState, TheaterConfiguration } from '../../types/cinema';
import { ScreenBounceSample } from '../models/CinemaScreen';

interface CinemaLightingRigProps {
  config: TheaterConfiguration;
  showState: ShowState;
  isPaused?: boolean;
  isFullscreen?: boolean;
  isSoftwareGl: boolean;
  onLightFactorChange?: (factor: number) => void;
  fourDxFlashRef?: React.MutableRefObject<{ level: number; color: string }>;
  screenBounceRef?: React.MutableRefObject<ScreenBounceSample>;
  screenReflectionBrightness?: number;
}

export const CinemaLightingRig: React.FC<CinemaLightingRigProps> = ({
  config,
  showState,
  isPaused = false,
  isFullscreen = false,
  isSoftwareGl,
  onLightFactorChange,
  fourDxFlashRef,
  screenBounceRef,
  screenReflectionBrightness = 1,
}) => {
  const { lightingProfile, auditoriumWidth, auditoriumLength, auditoriumHeight, screenPosition } = config;
  const { scene, gl } = useThree();

  const ambientRef = useRef<THREE.HemisphereLight>(null);
  const mainCeilingRef = useRef<THREE.DirectionalLight>(null);
  const rearFillRef = useRef<THREE.PointLight>(null);
  const midCeilingRef = useRef<THREE.PointLight>(null);
  const screenGlowRef = useRef<THREE.PointLight>(null);
  const screenHallBounceRef = useRef<THREE.PointLight>(null);
  const wallLeftRef = useRef<THREE.PointLight>(null);
  const wallRightRef = useRef<THREE.PointLight>(null);

  const lightFactorRef = useRef(1);

  // Procedural studio environment reflections (dynamically dimmed during playback)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.36;
    return () => {
      scene.environment = null;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.25);

    // Lights stay ON when auditorium is open, completed, or when video is paused; OFF when actively playing
    const targetFactor =
      showState === 'AUDITORIUM_OPEN' ||
      showState === 'SHOW_COMPLETED' ||
      (showState === 'SHOW_PLAYING' && isPaused)
        ? 1.0
        : showState === 'SHOW_STARTING'
          ? 0.1
          : 0.0;

    const dampSpeed = showState === 'SHOW_STARTING' ? 2.2 : targetFactor === 1.0 ? 2.8 : 3.4;
    lightFactorRef.current = THREE.MathUtils.damp(lightFactorRef.current, targetFactor, dampSpeed, dt);
    const f = lightFactorRef.current < 0.004 && targetFactor === 0 ? 0 : lightFactorRef.current;

    if (onLightFactorChange) {
      onLightFactorChange(f);
    }

    // Dim IBL reflections completely to 0 when house lights turn off so video reflections dominate cleanly
    scene.environmentIntensity = f * 0.36;

    // Skip expensive shadow map geometry passes when house lights are dimmed or during fullscreen movie playback
    if (gl.shadowMap.enabled) {
      const shouldUpdateShadows =
        !isSoftwareGl &&
        !isFullscreen &&
        f > 0.02 &&
        !(showState === 'SHOW_PLAYING' && !isPaused);
      if (shouldUpdateShadows) {
        if (!gl.shadowMap.autoUpdate) {
          gl.shadowMap.autoUpdate = true;
          gl.shadowMap.needsUpdate = true;
        }
      } else if (gl.shadowMap.autoUpdate) {
        gl.shadowMap.autoUpdate = false;
      }
    }

    const flashLevel = config.supports4dxEffects ? (fourDxFlashRef?.current.level ?? 0) : 0;
    const flashColor = fourDxFlashRef?.current.color ?? '#7dd3fc';

    const bounce = screenBounceRef?.current ?? { r: 0.72, g: 0.8, b: 0.95, luminance: 0.25 };
    // Compensate inverse-square light falloff across 6m Private salons vs 18m IMAX mega-domes
    const roomScale = Math.pow(Math.max(0.62, auditoriumHeight / 10.6), 1.4);

    if (ambientRef.current) {
      const swBoost = isSoftwareGl ? 1.35 : 1.08;
      ambientRef.current.intensity = 0.003 + f * lightingProfile.ambientOpenIntensity * swBoost;
    }
    if (mainCeilingRef.current) {
      const mainBoost = isSoftwareGl ? 1.45 : 1.15;
      mainCeilingRef.current.intensity = f * lightingProfile.mainOpenIntensity * mainBoost;
    }
    if (rearFillRef.current) {
      rearFillRef.current.intensity = f * lightingProfile.mainOpenIntensity * 38 * roomScale;
    }
    if (midCeilingRef.current) {
      midCeilingRef.current.intensity = f * lightingProfile.mainOpenIntensity * 44 * roomScale;
    }
    if (wallLeftRef.current) {
      wallLeftRef.current.intensity =
        f * lightingProfile.wallOpenIntensity * 24 * roomScale + flashLevel * 18;
      wallLeftRef.current.color.set(
        flashLevel > 0.05 ? flashColor : lightingProfile.wallColor,
      );
    }
    if (wallRightRef.current) {
      wallRightRef.current.intensity =
        f * lightingProfile.wallOpenIntensity * 24 * roomScale + flashLevel * 18;
      wallRightRef.current.color.set(
        flashLevel > 0.05 ? flashColor : lightingProfile.wallColor,
      );
    }

    if (screenGlowRef.current) {
      const targetScreenLight =
        (showState === 'SHOW_PLAYING'
          ? flashLevel * 6
          : showState === 'SHOW_STARTING'
            ? lightingProfile.screenGlowStrength * 1.1
            : lightingProfile.screenGlowStrength * 0.55) * screenReflectionBrightness;
      screenGlowRef.current.intensity = THREE.MathUtils.damp(
        screenGlowRef.current.intensity,
        targetScreenLight,
        3.5,
        dt,
      );
      screenGlowRef.current.color.setRGB(bounce.r, bounce.g, bounce.b);
    }

    if (screenHallBounceRef.current) {
      screenHallBounceRef.current.intensity = THREE.MathUtils.damp(
        screenHallBounceRef.current.intensity,
        0,
        3.5,
        dt,
      );
    }
  });

  return (
    <>
      <color attach="background" args={['#030305']} />
      <fogExp2 attach="fog" args={['#030305', 0.01]} />

      {/* Cool/Warm Hemisphere Fill */}
      <hemisphereLight
        ref={ambientRef}
        args={[lightingProfile.ceilingColor, '#100e14', lightingProfile.ambientOpenIntensity]}
      />

      {/* Primary Overhead Key Light (shadow caster) */}
      <directionalLight
        ref={mainCeilingRef}
        position={[2, auditoriumHeight - 0.6, 2]}
        color={lightingProfile.ceilingColor}
        intensity={lightingProfile.mainOpenIntensity}
        castShadow={!isSoftwareGl}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-left={-auditoriumWidth / 2}
        shadow-camera-right={auditoriumWidth / 2}
        shadow-camera-top={auditoriumLength / 2}
        shadow-camera-bottom={-auditoriumLength / 2}
        shadow-camera-near={0.5}
        shadow-camera-far={auditoriumHeight + 14}
      />

      {/* Mid & Rear Auditorium Ceiling Lights (active across all quality tiers for balanced room depth) */}
      <pointLight
        ref={midCeilingRef}
        position={[0, auditoriumHeight - 1.0, -1.5]}
        color={lightingProfile.ceilingColor}
        intensity={44}
        distance={auditoriumLength * 1.15}
        decay={1.8}
      />
      <pointLight
        ref={rearFillRef}
        position={[0, auditoriumHeight - 1.0, auditoriumLength * 0.25]}
        color={lightingProfile.ceilingColor}
        intensity={38}
        distance={auditoriumLength * 1.15}
        decay={1.8}
      />
      {!isSoftwareGl && (
        <>
          <pointLight
            ref={wallLeftRef}
            position={[-auditoriumWidth / 2 + 1.4, auditoriumHeight * 0.5, 0]}
            color={lightingProfile.wallColor}
            intensity={24}
            distance={auditoriumWidth * 1.2}
            decay={1.8}
          />
          <pointLight
            ref={wallRightRef}
            position={[auditoriumWidth / 2 - 1.4, auditoriumHeight * 0.5, 0]}
            color={lightingProfile.wallColor}
            intensity={24}
            distance={auditoriumWidth * 1.2}
            decay={1.8}
          />
        </>
      )}

      {/* Primary Dynamic Movie Screen Bounce Light */}
      <pointLight
        ref={screenGlowRef}
        position={[screenPosition[0], screenPosition[1], screenPosition[2] + 3.4]}
        color="#c8dcff"
        intensity={2}
        distance={auditoriumLength * 1.25}
        decay={1.7}
      />

      {/* Secondary Subtle Mid-Hall Screen Reflection Bounce */}
      <pointLight
        ref={screenHallBounceRef}
        position={[0, auditoriumHeight * 0.65, -auditoriumLength * 0.06]}
        color="#c8dcff"
        intensity={0}
        distance={auditoriumLength * 1.3}
        decay={1.8}
      />
    </>
  );
};
