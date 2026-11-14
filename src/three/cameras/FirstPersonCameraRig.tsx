import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import gsap from 'gsap';
import { CameraViewMode, SeatData, TheaterConfiguration } from '../../types/cinema';
import { cinemaAudioEngine } from '../../services/audio/cinemaAudioEngine';

const _listenerFwd = new THREE.Vector3();
const _listenerUp = new THREE.Vector3();

interface FirstPersonCameraRigProps {
  config: TheaterConfiguration;
  seat: SeatData;
  viewMode: CameraViewMode;
  entranceComplete: boolean;
  onEntranceComplete: () => void;
  resetViewSignal: number;
  skipWalkSignal: number;
  isPlaying: boolean;
  fourDxCameraIntensity: number; // 0..1
}

function clampInsideHall(
  pos: { x: number; y: number; z: number },
  config: TheaterConfiguration,
) {
  const maxHalfX = Math.max(1.2, config.auditoriumWidth / 2 - 0.72);
  const minZ = config.screenPosition[2] + 1.25;
  const maxZ = config.auditoriumLength / 2 - 0.72;

  pos.x = THREE.MathUtils.clamp(pos.x, -maxHalfX, maxHalfX);
  pos.z = THREE.MathUtils.clamp(pos.z, minZ, maxZ);

  let floorY = 0;
  if (pos.z >= config.firstRowZ - config.rowSpacing * 0.5) {
    const r = THREE.MathUtils.clamp(
      Math.round((pos.z - config.firstRowZ) / Math.max(0.5, config.rowSpacing)),
      0,
      Math.max(0, config.seatingRows - 1),
    );
    floorY = r * config.rowElevationStep;
  }
  const minY = floorY + 0.85;
  const maxY = Math.max(minY + 0.5, config.auditoriumHeight - 0.75);
  pos.y = THREE.MathUtils.clamp(pos.y, minY, maxY);
}

export const FirstPersonCameraRig: React.FC<FirstPersonCameraRigProps> = ({
  config,
  seat,
  viewMode,
  entranceComplete,
  onEntranceComplete,
  resetViewSignal,
  skipWalkSignal,
  isPlaying,
  fourDxCameraIntensity,
}) => {
  const { camera, gl, size } = useThree();
  const walkTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const glideTweenRef = useRef<gsap.core.Tween | null>(null);
  const isGlidingRef = useRef(false);

  // Unlimited 360-degree yaw + comfortable pitch offset while seated
  const lookOffsetRef = useRef({ yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 });
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const baseQuatRef = useRef(new THREE.Quaternion());
  const baseAnglesRef = useRef({ yaw: 0, pitch: 0 });
  const screenFullQuatRef = useRef(new THREE.Quaternion());
  const startQuatRef = useRef(new THREE.Quaternion());
  const lookEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const offsetEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const offsetQuatRef = useRef(new THREE.Quaternion());
  const lookTargetVec = useRef(new THREE.Vector3());

  const prevSeatIdRef = useRef<string>(seat.id);
  const prevViewModeRef = useRef<CameraViewMode>(viewMode);
  const entranceStartedRef = useRef(false);
  const onEntranceCompleteRef = useRef(onEntranceComplete);
  onEntranceCompleteRef.current = onEntranceComplete;

  // Compute exact base orientation pointing from seat.eyePosition to seat.lookAtTarget
  useEffect(() => {
    const dummyCam = new THREE.PerspectiveCamera();
    dummyCam.position.set(...seat.eyePosition);
    dummyCam.lookAt(...seat.lookAtTarget);
    baseQuatRef.current.copy(dummyCam.quaternion);

    const euler = new THREE.Euler().setFromQuaternion(dummyCam.quaternion, 'YXZ');
    baseAnglesRef.current = { yaw: euler.y, pitch: euler.x };

    const fullDummy = new THREE.PerspectiveCamera();
    const fov = config.categoryId === 'imax' ? 62 : 54;
    const fovRad = THREE.MathUtils.degToRad(fov);
    const viewportAspect = size.width / Math.max(1, size.height);
    const halfH = config.screenHeight / 2;
    const halfW = config.screenWidth / 2;
    const distV = halfH / Math.tan(fovRad / 2);
    const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * viewportAspect);
    const distH = halfW / Math.tan(hFovRad / 2);
    const idealDist = Math.max(distV, distH) * 1.02;
    const clampedZ = Math.min(
      config.auditoriumLength / 2 - 0.8,
      config.screenPosition[2] + idealDist,
    );

    fullDummy.position.set(config.screenPosition[0], config.screenPosition[1], clampedZ);
    fullDummy.lookAt(...config.screenPosition);
    screenFullQuatRef.current.copy(fullDummy.quaternion);
  }, [seat, config, size.width, size.height]);

  // First-person entrance walk-in animation via GSAP (runs once on initial entry)
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = config.categoryId === 'imax' ? 62 : 54;
    persp.updateProjectionMatrix();

    if (entranceComplete || entranceStartedRef.current) {
      return;
    }
    entranceStartedRef.current = true;

    const topTierY = (config.seatingRows - 1) * config.rowElevationStep;
    const rearEntranceZ = config.auditoriumLength / 2 - 1.1;
    const targetRowPassageZ = seat.worldPosition[2] + 0.45;
    const aisleX = seat.nearestAisleX;

    const proxy = {
      x: 0,
      y: topTierY + 1.68,
      z: rearEntranceZ,
      lookX: 0,
      lookY: config.screenPosition[1] - 0.8,
      lookZ: config.screenPosition[2],
    };

    camera.position.set(proxy.x, proxy.y, proxy.z);
    camera.lookAt(proxy.lookX, proxy.lookY, proxy.lookZ);

    const tl = gsap.timeline({
      onUpdate: () => {
        camera.position.set(proxy.x, proxy.y, proxy.z);
        lookTargetVec.current.set(proxy.lookX, proxy.lookY, proxy.lookZ);
        camera.lookAt(lookTargetVec.current);
      },
      onComplete: () => {
        camera.position.set(...seat.eyePosition);
        camera.quaternion.copy(baseQuatRef.current);
        onEntranceCompleteRef.current();
      },
    });

    tl.to(proxy, {
      x: aisleX,
      y: topTierY + 1.66,
      z: rearEntranceZ - 0.8,
      duration: 0.9,
      ease: 'power2.inOut',
    });

    const aisleDistance = Math.abs(rearEntranceZ - 0.8 - targetRowPassageZ);
    const walkDuration = Math.min(2.4, Math.max(1.2, aisleDistance * 0.14));
    tl.to(proxy, {
      x: aisleX,
      y: seat.worldPosition[1] + 1.62,
      z: targetRowPassageZ,
      lookX: seat.worldPosition[0] * 0.4,
      lookY: config.screenPosition[1],
      duration: walkDuration,
      ease: 'power1.inOut',
    });

    const rowDistance = Math.abs(aisleX - seat.worldPosition[0]);
    const rowDuration = Math.min(1.2, Math.max(0.55, rowDistance * 0.25));
    tl.to(proxy, {
      x: seat.eyePosition[0],
      y: seat.worldPosition[1] + 1.54,
      z: targetRowPassageZ,
      lookX: seat.lookAtTarget[0],
      lookY: seat.lookAtTarget[1],
      lookZ: seat.lookAtTarget[2],
      duration: rowDuration,
      ease: 'power2.inOut',
    });

    tl.to(proxy, {
      x: seat.eyePosition[0],
      y: seat.eyePosition[1],
      z: seat.eyePosition[2],
      lookX: seat.lookAtTarget[0],
      lookY: seat.lookAtTarget[1],
      lookZ: seat.lookAtTarget[2],
      duration: 0.75,
      ease: 'power3.out',
    });

    walkTimelineRef.current = tl;

    return () => {
      tl.kill();
      walkTimelineRef.current = null;
    };
    // Intentionally run once for initial auditorium walk-in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, camera]);

  // Smooth GSAP camera glide when shifting seats mid-show or switching viewMode (Seat / Hall / Screen Full)
  useEffect(() => {
    if (!entranceComplete) return;

    const seatChanged = prevSeatIdRef.current !== seat.id;
    const modeChanged = prevViewModeRef.current !== viewMode;

    if (!seatChanged && !modeChanged) return;
    prevSeatIdRef.current = seat.id;
    prevViewModeRef.current = viewMode;

    glideTweenRef.current?.kill();
    isGlidingRef.current = true;
    lookOffsetRef.current.targetYaw = 0;
    lookOffsetRef.current.targetPitch = 0;
    lookOffsetRef.current.yaw = 0;
    lookOffsetRef.current.pitch = 0;

    let targetPos: [number, number, number];
    const targetQuat = new THREE.Quaternion();

    if (viewMode === 'hall') {
      const topTierY = (config.seatingRows - 1) * config.rowElevationStep;
      targetPos = [
        config.auditoriumWidth * 0.24,
        Math.min(config.auditoriumHeight - 1.1, topTierY + 2.4),
        config.auditoriumLength * 0.3,
      ];
      const clampedHall = { x: targetPos[0], y: targetPos[1], z: targetPos[2] };
      clampInsideHall(clampedHall, config);
      targetPos = [clampedHall.x, clampedHall.y, clampedHall.z];
      const dummy = new THREE.PerspectiveCamera();
      dummy.position.set(...targetPos);
      dummy.lookAt(0, Math.min(config.screenPosition[1] * 0.5, config.auditoriumHeight * 0.45), -config.auditoriumLength * 0.06);
      targetQuat.copy(dummy.quaternion);
    } else if (viewMode === 'screen_full') {
      const fov = config.categoryId === 'imax' ? 62 : 54;
      const fovRad = THREE.MathUtils.degToRad(fov);
      const viewportAspect = size.width / Math.max(1, size.height);
      const halfH = config.screenHeight / 2;
      const halfW = config.screenWidth / 2;
      const distV = halfH / Math.tan(fovRad / 2);
      const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * viewportAspect);
      const distH = halfW / Math.tan(hFovRad / 2);
      const idealDist = Math.max(distV, distH) * 1.02;
      const clampedZ = Math.min(
        config.auditoriumLength / 2 - 0.8,
        config.screenPosition[2] + idealDist,
      );

      targetPos = [
        config.screenPosition[0],
        config.screenPosition[1],
        clampedZ,
      ];
      targetQuat.copy(screenFullQuatRef.current);
    } else {
      targetPos = [...seat.eyePosition];
      targetQuat.copy(baseQuatRef.current);
    }

    const startPos = camera.position.clone();
    startQuatRef.current.copy(camera.quaternion);
    const proxy = { t: 0 };

    glideTweenRef.current = gsap.to(proxy, {
      t: 1,
      duration: 0.78,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.position.set(
          THREE.MathUtils.lerp(startPos.x, targetPos[0], proxy.t),
          THREE.MathUtils.lerp(startPos.y, targetPos[1], proxy.t),
          THREE.MathUtils.lerp(startPos.z, targetPos[2], proxy.t),
        );
        camera.quaternion.slerpQuaternions(startQuatRef.current, targetQuat, proxy.t);
      },
      onComplete: () => {
        camera.position.set(...targetPos);
        camera.quaternion.copy(targetQuat);
        isGlidingRef.current = false;
      },
    });

    return () => {
      glideTweenRef.current?.kill();
    };
  }, [seat, viewMode, entranceComplete, camera, config, size.width, size.height]);

  // Allow skipping entrance walk directly into exact seat
  useEffect(() => {
    if (skipWalkSignal > 0 && !entranceComplete) {
      if (walkTimelineRef.current) {
        walkTimelineRef.current.kill();
        walkTimelineRef.current = null;
      }
      camera.position.set(...seat.eyePosition);
      camera.quaternion.copy(baseQuatRef.current);
      onEntranceCompleteRef.current();
    }
  }, [skipWalkSignal, entranceComplete, camera, seat]);

  // Reset View back to screen center via shortest 360-degree turn
  useEffect(() => {
    if (resetViewSignal > 0) {
      const nearestTurn =
        Math.round(lookOffsetRef.current.yaw / (Math.PI * 2)) * (Math.PI * 2);
      lookOffsetRef.current.targetYaw = nearestTurn;
      lookOffsetRef.current.targetPitch = 0;
    }
  }, [resetViewSignal]);

  // Full 360-degree horizontal drag look + wide vertical pitch while seated
  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (!entranceComplete || viewMode !== 'seat') return;
      isDraggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !entranceComplete || viewMode !== 'seat') return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };

      // Unrestricted 360-degree horizontal rotation so viewer can inspect sides, ceiling & rear projector booth
      lookOffsetRef.current.targetYaw += dx * 0.0044;
      lookOffsetRef.current.targetPitch = THREE.MathUtils.clamp(
        lookOffsetRef.current.targetPitch + dy * 0.0032,
        -1.22,
        1.22,
      );
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl, entranceComplete, viewMode]);

  const syncAudioListener = () => {
    if (!cinemaAudioEngine.initialized) return;
    _listenerFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    cinemaAudioEngine.updateListenerPose(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      _listenerFwd.x,
      _listenerFwd.y,
      _listenerFwd.z,
      _listenerUp.x,
      _listenerUp.y,
      _listenerUp.z,
    );
  };

  useFrame(({ clock }, delta) => {
    if (!entranceComplete) {
      clampInsideHall(camera.position, config);
      syncAudioListener();
      return;
    }

    if (viewMode === 'hall' || isGlidingRef.current) {
      clampInsideHall(camera.position, config);
      syncAudioListener();
      return;
    }

    const dt = Math.min(delta, 0.05);

    const look = lookOffsetRef.current;
    look.yaw = THREE.MathUtils.damp(look.yaw, look.targetYaw, 9, dt);
    look.pitch = THREE.MathUtils.damp(look.pitch, look.targetPitch, 9, dt);

    // Synchronized theme-park 4DX camera heave, pitch & roll matching SeatModels physics
    let motionX = 0;
    let motionY = 0;
    let swayPitch = 0;
    let swayRoll = 0;
    if (isPlaying && fourDxCameraIntensity > 0.01) {
      const t = clock.getElapsedTime();
      motionY = (Math.sin(t * 2.4) * 0.03 + Math.sin(t * 14.5) * 0.009) * fourDxCameraIntensity;
      motionX = Math.cos(t * 1.25) * 0.024 * fourDxCameraIntensity;
      swayPitch =
        (Math.sin(t * 1.65) * 0.022 + Math.cos(t * 3.1) * 0.007) * fourDxCameraIntensity;
      swayRoll = Math.cos(t * 1.25) * 0.02 * fourDxCameraIntensity;
    }

    if (viewMode === 'screen_full') {
      const fov = config.categoryId === 'imax' ? 62 : 54;
      const fovRad = THREE.MathUtils.degToRad(fov);
      const viewportAspect = size.width / Math.max(1, size.height);
      const halfH = config.screenHeight / 2;
      const halfW = config.screenWidth / 2;
      const distV = halfH / Math.tan(fovRad / 2);
      const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * viewportAspect);
      const distH = halfW / Math.tan(hFovRad / 2);
      const idealDist = Math.max(distV, distH) * 1.02;
      const clampedZ = Math.min(
        config.auditoriumLength / 2 - 0.8,
        config.screenPosition[2] + idealDist,
      );

      camera.position.set(
        config.screenPosition[0] + motionX * 0.5,
        config.screenPosition[1] + motionY * 0.5,
        clampedZ,
      );
      clampInsideHall(camera.position, config);
      offsetEulerRef.current.set(swayPitch * 0.45, 0, swayRoll * 0.45, 'YXZ');
      offsetQuatRef.current.setFromEuler(offsetEulerRef.current);
      camera.quaternion.copy(screenFullQuatRef.current).multiply(offsetQuatRef.current);
      syncAudioListener();
      return;
    }

    camera.position.set(
      seat.eyePosition[0] + motionX,
      seat.eyePosition[1] + motionY,
      seat.eyePosition[2],
    );
    clampInsideHall(camera.position, config);

    // Apply world-up 360-degree yaw + local pitch so turning 180° keeps horizon completely level
    const finalPitch = THREE.MathUtils.clamp(
      baseAnglesRef.current.pitch + look.pitch + swayPitch,
      -1.35,
      1.35,
    );
    const finalYaw = baseAnglesRef.current.yaw + look.yaw;
    lookEulerRef.current.set(finalPitch, finalYaw, swayRoll, 'YXZ');
    camera.quaternion.setFromEuler(lookEulerRef.current);
    syncAudioListener();
  });

  if (entranceComplete && viewMode === 'hall' && !isGlidingRef.current) {
    const hallMaxDistance = Math.max(
      3.5,
      Math.min(config.auditoriumWidth * 0.45, config.auditoriumLength * 0.48),
    );
    return (
      <OrbitControls
        target={[
          0,
          Math.min(config.screenPosition[1] * 0.5, config.auditoriumHeight * 0.45),
          -config.auditoriumLength * 0.06,
        ]}
        enablePan={false}
        enableDamping={false}
        minDistance={2.8}
        maxDistance={hallMaxDistance}
        minAzimuthAngle={-Infinity}
        maxAzimuthAngle={Infinity}
        maxPolarAngle={Math.PI * 0.58}
        minPolarAngle={0.22}
        onChange={() => clampInsideHall(camera.position, config)}
      />
    );
  }

  return null;
};
