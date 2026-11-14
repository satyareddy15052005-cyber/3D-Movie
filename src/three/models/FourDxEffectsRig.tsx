import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TheaterConfiguration } from '../../types/cinema';

interface FourDxEffectsRigProps {
  config: TheaterConfiguration;
  enabled: boolean;
  isPlaying: boolean;
  intensity: number; // 0..1
  atmosphericLightEnabled: boolean;
  fourDxFlashRef?: React.MutableRefObject<{ level: number; color: string }>;
}

export const FourDxEffectsRig: React.FC<FourDxEffectsRigProps> = ({
  config,
  enabled,
  isPlaying,
  intensity,
  atmosphericLightEnabled,
  fourDxFlashRef,
}) => {
  const windPointsRef = useRef<THREE.Points>(null);
  const fogMeshRef = useRef<THREE.Mesh>(null);
  const strobeLightRef = useRef<THREE.PointLight>(null);
  const strobeBarMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const particleCount = 180;
  const { W, L, H, firstRowZ, screenZ } = useMemo(
    () => ({
      W: config.auditoriumWidth,
      L: config.auditoriumLength,
      H: config.auditoriumHeight,
      firstRowZ: config.firstRowZ,
      screenZ: config.screenPosition[2],
    }),
    [config],
  );

  const windGeo = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (W - 2.5);
      positions[i * 3 + 1] = 1.2 + Math.random() * (H - 2.5);
      positions[i * 3 + 2] = screenZ + Math.random() * (L * 0.85);
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [W, L, H, screenZ]);

  const mistSprite = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }, []);

  const windMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#bae6fd',
        map: mistSprite,
        size: 0.14,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [mistSprite],
  );

  useEffect(() => {
    return () => {
      windGeo.dispose();
      windMat.dispose();
      mistSprite.dispose();
    };
  }, [windGeo, windMat, mistSprite]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const active = enabled && isPlaying && intensity > 0.02;

    if (!active) {
      windMat.opacity = THREE.MathUtils.lerp(windMat.opacity, 0, 0.15);
      if (fogMeshRef.current) {
        const mat = fogMeshRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, 0.15);
      }
      if (strobeLightRef.current) {
        strobeLightRef.current.intensity = THREE.MathUtils.lerp(
          strobeLightRef.current.intensity,
          0,
          0.2,
        );
      }
      if (strobeBarMatRef.current) {
        strobeBarMatRef.current.opacity = THREE.MathUtils.lerp(
          strobeBarMatRef.current.opacity,
          0,
          0.2,
        );
      }
      if (fourDxFlashRef) {
        fourDxFlashRef.current.level = 0;
      }
      return;
    }

    const t = clock.getElapsedTime();
    // Rhythmic theme-park gust wave
    const gustWave = Math.max(0, Math.sin(t * 0.75) * 0.6 + Math.sin(t * 1.9) * 0.4);
    const speed = (6.5 + gustWave * 14.0) * intensity;

    // Move air/mist streak particles toward the back of the hall
    const posAttr = windGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3 + 2] += speed * dt;
      arr[i * 3 + 1] += Math.sin(t * 3 + i) * 0.15 * dt;
      if (arr[i * 3 + 2] > L * 0.45) {
        arr[i * 3] = (Math.random() - 0.5) * (W - 2.5);
        arr[i * 3 + 1] = 1.0 + Math.random() * (H - 2.4);
        arr[i * 3 + 2] = screenZ + 0.8;
      }
    }
    posAttr.needsUpdate = true;
    windMat.opacity = (0.14 + gustWave * 0.35) * intensity;

    // Low stage mist / fog plume oscillation
    if (fogMeshRef.current) {
      const fogWave = (Math.sin(t * 0.65) + 1) * 0.5;
      const mat = fogMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (0.04 + fogWave * 0.12) * intensity;
      fogMeshRef.current.position.x = Math.sin(t * 0.4) * 1.2;
    }

    // Periodic lightning / pyro flash burst synced with motion wave
    const strobeBurst = Math.pow(Math.max(0, Math.sin(t * 1.15) * Math.sin(t * 4.3)), 4);
    const flashLevel = atmosphericLightEnabled ? strobeBurst * intensity : 0;
    const isWarmPyro = Math.sin(t * 0.45) > 0;
    const flashColor = isWarmPyro ? '#f59e0b' : '#7dd3fc';

    if (strobeLightRef.current) {
      strobeLightRef.current.intensity = flashLevel * 28;
      strobeLightRef.current.color.set(flashColor);
    }
    if (strobeBarMatRef.current) {
      strobeBarMatRef.current.opacity = flashLevel * 0.85;
      strobeBarMatRef.current.color.set(flashColor);
    }
    if (fourDxFlashRef) {
      fourDxFlashRef.current.level = flashLevel;
      fourDxFlashRef.current.color = flashColor;
    }
  });

  if (!config.supports4dxEffects) return null;

  return (
    <group>
      {/* Wind / Mist Particle Streams */}
      <points ref={windPointsRef} geometry={windGeo} material={windMat} />

      {/* Front Stage Atmospheric Mist Layer */}
      <mesh
        ref={fogMeshRef}
        position={[0, 0.95, firstRowZ - 1.8]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[W - 2, 4.5]} />
        <meshBasicMaterial color="#cbd5e1" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Overhead 4DX Action Strobe Flash */}
      <pointLight
        ref={strobeLightRef}
        position={[0, H - 1.4, firstRowZ + 2.5]}
        color="#7dd3fc"
        intensity={0}
        distance={L * 0.9}
        decay={1.8}
      />

      {/* Overhead Front Strobe Rig Emitter */}
      <mesh position={[0, H - 0.6, firstRowZ + 1.4]}>
        <boxGeometry args={[W - 4, 0.08, 0.14]} />
        <meshBasicMaterial ref={strobeBarMatRef} color="#7dd3fc" transparent opacity={0} />
      </mesh>
    </group>
  );
};
