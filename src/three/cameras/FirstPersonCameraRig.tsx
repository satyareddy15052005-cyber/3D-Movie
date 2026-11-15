import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import gsap from 'gsap';
import { CameraViewMode, SeatData, TheaterConfiguration } from '../../types/cinema';
import { cinemaAudioEngine } from '../../services/audio/cinemaAudioEngine';
import { computeAdaptiveCinemaFov, isMobileDevice } from '../../utils/formatters';

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
  isSoftwareGl?: boolean;
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
  isSoftwareGl = false,
  fourDxCameraIntensity,
}) => {
  const { camera, gl, size } = useThree();
  const walkTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const glideTweenRef = useRef<gsap.core.Tween | null>(null);
  const isGlidingRef = useRef(false);

  // Unlimited 360-degree yaw + comfortable pitch offset while seated, with smooth inertia momentum
  const lookOffsetRef = useRef({
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    yawVel: 0,
    pitchVel: 0,
  });
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const isFirstTouchMoveRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0, timeMs: 0 });

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
    const fov = computeAdaptiveCinemaFov(config.categoryId, size.width, size.height);
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

  // Dynamically adapt FOV on viewport resize / mobile portrait-landscape orientation changes
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const nextFov = computeAdaptiveCinemaFov(config.categoryId, size.width, size.height);
    if (Math.abs(persp.fov - nextFov) > 0.05) {
      persp.fov = nextFov;
      persp.updateProjectionMatrix();
    }
  }, [camera, config.categoryId, size.width, size.height]);

  // First-person entrance walk-in animation via GSAP (runs once on initial entry)
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = computeAdaptiveCinemaFov(config.categoryId, size.width, size.height);
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
    lookOffsetRef.current.yawVel = 0;
    lookOffsetRef.current.pitchVel = 0;

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
      const fov = computeAdaptiveCinemaFov(config.categoryId, size.width, size.height);
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
      lookOffsetRef.current.yawVel = 0;
      lookOffsetRef.current.pitchVel = 0;
    }
  }, [resetViewSignal]);

  // Full 360-degree horizontal drag look + smooth touch momentum inertia while seated
  useEffect(() => {
    const dom = gl.domElement;
    dom.style.touchAction = 'none';

    const onPointerDown = (e: PointerEvent) => {
      if (!entranceComplete || viewMode !== 'seat') return;
      if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
        return;
      }
      activePointerIdRef.current = e.pointerId;
      isDraggingRef.current = true;
      isFirstTouchMoveRef.current = e.pointerType === 'touch';
      lastPointerRef.current = { x: e.clientX, y: e.clientY, timeMs: performance.now() };
      lookOffsetRef.current.yawVel = 0;
      lookOffsetRef.current.pitchVel = 0;
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture unsupported
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !entranceComplete || viewMode !== 'seat') return;
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }

      const nowMs = performance.now();
      const elapsedSec = Math.max(0.008, Math.min(0.05, (nowMs - lastPointerRef.current.timeMs) / 1000));
      const rawDx = e.clientX - lastPointerRef.current.x;
      const rawDy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY, timeMs: nowMs };

      // Ignore tiny sub-pixel jitter and absorb browser touch-slop initial jump cleanly
      const maxStep = isFirstTouchMoveRef.current ? 18 : 70;
      isFirstTouchMoveRef.current = false;
      const dx = THREE.MathUtils.clamp(rawDx, -maxStep, maxStep);
      const dy = THREE.MathUtils.clamp(rawDy, -maxStep, maxStep);

      const isTouch = e.pointerType === 'touch';
      const yawStep = dx * (isTouch ? 0.0046 : 0.0042);
      const pitchStep = dy * (isTouch ? 0.0033 : 0.0031);

      const look = lookOffsetRef.current;
      look.targetYaw += yawStep;
      look.targetPitch = THREE.MathUtils.clamp(look.targetPitch + pitchStep, -1.22, 1.22);

      if (isTouch) {
        const instYawVel = THREE.MathUtils.clamp(yawStep / elapsedSec, -5.0, 5.0);
        const instPitchVel = THREE.MathUtils.clamp(pitchStep / elapsedSec, -2.8, 2.8);
        look.yawVel = THREE.MathUtils.lerp(look.yawVel, instYawVel, 0.35);
        look.pitchVel = THREE.MathUtils.lerp(look.pitchVel, instPitchVel, 0.35);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }
      if (activePointerIdRef.current !== null) {
        try {
          if (dom.hasPointerCapture(activePointerIdRef.current)) {
            dom.releasePointerCapture(activePointerIdRef.current);
          }
        } catch {
          // Ignore release failure
        }
      }
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
      isFirstTouchMoveRef.current = false;
      // Only carry forward touch inertia if the last move was recent (< 75ms)
      if (performance.now() - lastPointerRef.current.timeMs > 75) {
        lookOffsetRef.current.yawVel = 0;
        lookOffsetRef.current.pitchVel = 0;
      }
    };

    const onBlur = () => {
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
      isFirstTouchMoveRef.current = false;
      lookOffsetRef.current.yawVel = 0;
      lookOffsetRef.current.pitchVel = 0;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl, entranceComplete, viewMode]);

  const lastListenerPoseRef = useRef<number[] | null>(null);

  const syncAudioListener = () => {
    if (!cinemaAudioEngine.initialized) return;
    _listenerFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const px = camera.position.x;
    const py = camera.position.y;
    const pz = camera.position.z;
    const fx = _listenerFwd.x;
    const fy = _listenerFwd.y;
    const fz = _listenerFwd.z;
    const prev = lastListenerPoseRef.current;
    if (
      prev &&
      Math.abs(prev[0] - px) < 1e-4 &&
      Math.abs(prev[1] - py) < 1e-4 &&
      Math.abs(prev[2] - pz) < 1e-4 &&
      Math.abs(prev[3] - fx) < 1e-4 &&
      Math.abs(prev[4] - fy) < 1e-4 &&
      Math.abs(prev[5] - fz) < 1e-4
    ) {
      return;
    }
    if (prev) {
      prev[0] = px;
      prev[1] = py;
      prev[2] = pz;
      prev[3] = fx;
      prev[4] = fy;
      prev[5] = fz;
    } else {
      lastListenerPoseRef.current = [px, py, pz, fx, fy, fz];
    }
    cinemaAudioEngine.updateListenerPose(
      px,
      py,
      pz,
      fx,
      fy,
      fz,
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
    if (!isDraggingRef.current && (Math.abs(look.yawVel) > 0.002 || Math.abs(look.pitchVel) > 0.002)) {
      look.targetYaw += look.yawVel * dt;
      look.targetPitch = THREE.MathUtils.clamp(look.targetPitch + look.pitchVel * dt, -1.22, 1.22);
      const decay = Math.exp(-4.8 * dt);
      look.yawVel *= decay;
      look.pitchVel *= decay;
    } else if (!isDraggingRef.current) {
      look.yawVel = 0;
      look.pitchVel = 0;
    }

    const followLambda = isDraggingRef.current ? 16 : 11;
    look.yaw = THREE.MathUtils.damp(look.yaw, look.targetYaw, followLambda, dt);
    look.pitch = THREE.MathUtils.damp(look.pitch, look.targetPitch, followLambda, dt);

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
      const fov = computeAdaptiveCinemaFov(config.categoryId, size.width, size.height);
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
    const mobile = isMobileDevice();
    return (
      <OrbitControls
        target={[
          0,
          Math.min(config.screenPosition[1] * 0.5, config.auditoriumHeight * 0.45),
          -config.auditoriumLength * 0.06,
        ]}
        enablePan={false}
        enableDamping={!isSoftwareGl}
        dampingFactor={0.075}
        rotateSpeed={mobile ? 0.62 : 0.72}
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
