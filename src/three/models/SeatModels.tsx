import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { SeatData, SeatModelType, TheaterConfiguration } from '../../types/cinema';
import { createSeatUpholsteryTextures } from '../materials/proceduralTextures';
import {
  applyScreenBounceToMaterial,
  ScreenBounceUniforms,
} from '../lighting/screenBounceShader';

interface SeatModelsProps {
  config: TheaterConfiguration;
  seats: SeatData[];
  selectedSeatId: string | null;
  hoveredSeatId?: string | null;
  fourDxVibration: number; // 0..1 active motion intensity
  isPlaying: boolean;
  lightFactor?: number; // 0 = dark show, 1 = house lights on
  interactive?: boolean;
  screenBounceUniforms?: ScreenBounceUniforms;
  onSelectSeat?: (seatId: string) => void;
  onHoverSeat?: (seatId: string | null) => void;
}

interface SeatPartOffsets {
  cushionWidth: number;
  cushionHeight: number;
  cushionDepth: number;
  cushionPos: [number, number, number];
  backrestWidth: number;
  backrestHeight: number;
  backrestDepth: number;
  backrestPos: [number, number, number];
  backrestTilt: number;
  headrestWidth: number;
  headrestHeight: number;
  headrestDepth: number;
  headrestPos: [number, number, number];
  armWidth: number;
  armHeight: number;
  armDepth: number;
  armOffsetX: number;
  armPosY: number;
  armPosZ: number;
  pedestalRadius: number;
  pedestalHeight: number;
  pedestalPos: [number, number, number];
  hasFootrest?: boolean;
  is4dxPod?: boolean;
}

function getSeatProportions(model: SeatModelType, widthScale = 1): SeatPartOffsets {
  const s = widthScale;
  switch (model) {
    case 'dolby_recliner':
      return {
        cushionWidth: 0.66 * s,
        cushionHeight: 0.2,
        cushionDepth: 0.62,
        cushionPos: [0, 0.42, 0.02],
        backrestWidth: 0.64 * s,
        backrestHeight: 0.68,
        backrestDepth: 0.18,
        backrestPos: [0, 0.78, 0.27],
        backrestTilt: 0.14,
        headrestWidth: 0.48 * s,
        headrestHeight: 0.22,
        headrestDepth: 0.16,
        headrestPos: [0, 1.15, 0.34],
        armWidth: 0.14,
        armHeight: 0.16,
        armDepth: 0.66,
        armOffsetX: 0.41 * s,
        armPosY: 0.56,
        armPosZ: 0.04,
        pedestalRadius: 0.3,
        pedestalHeight: 0.34,
        pedestalPos: [0, 0.17, 0.02],
        hasFootrest: true,
      };
    case 'private_recliner':
      return {
        cushionWidth: 0.74 * s,
        cushionHeight: 0.22,
        cushionDepth: 0.65,
        cushionPos: [0, 0.44, 0.02],
        backrestWidth: 0.72 * s,
        backrestHeight: 0.72,
        backrestDepth: 0.2,
        backrestPos: [0, 0.82, 0.28],
        backrestTilt: 0.16,
        headrestWidth: 0.54 * s,
        headrestHeight: 0.24,
        headrestDepth: 0.17,
        headrestPos: [0, 1.2, 0.36],
        armWidth: 0.16,
        armHeight: 0.18,
        armDepth: 0.7,
        armOffsetX: 0.46 * s,
        armPosY: 0.58,
        armPosZ: 0.04,
        pedestalRadius: 0.34,
        pedestalHeight: 0.36,
        pedestalPos: [0, 0.18, 0.02],
        hasFootrest: true,
      };
    case '4dx_motion':
      return {
        cushionWidth: 0.58 * s,
        cushionHeight: 0.17,
        cushionDepth: 0.56,
        cushionPos: [0, 0.54, 0],
        backrestWidth: 0.56 * s,
        backrestHeight: 0.72,
        backrestDepth: 0.16,
        backrestPos: [0, 0.92, 0.22],
        backrestTilt: 0.1,
        headrestWidth: 0.42 * s,
        headrestHeight: 0.24,
        headrestDepth: 0.15,
        headrestPos: [0, 1.32, 0.27],
        armWidth: 0.11,
        armHeight: 0.12,
        armDepth: 0.58,
        armOffsetX: 0.35 * s,
        armPosY: 0.71,
        armPosZ: 0.02,
        pedestalRadius: 0.18,
        pedestalHeight: 0.46,
        pedestalPos: [0, 0.23, 0.04],
        is4dxPod: true,
      };
    case 'imax_stadium':
      return {
        cushionWidth: 0.54 * s,
        cushionHeight: 0.16,
        cushionDepth: 0.52,
        cushionPos: [0, 0.42, 0],
        backrestWidth: 0.52 * s,
        backrestHeight: 0.64,
        backrestDepth: 0.14,
        backrestPos: [0, 0.76, 0.21],
        backrestTilt: 0.1,
        headrestWidth: 0.42 * s,
        headrestHeight: 0.18,
        headrestDepth: 0.13,
        headrestPos: [0, 1.11, 0.25],
        armWidth: 0.09,
        armHeight: 0.09,
        armDepth: 0.48,
        armOffsetX: 0.32 * s,
        armPosY: 0.58,
        armPosZ: 0.02,
        pedestalRadius: 0.085,
        pedestalHeight: 0.36,
        pedestalPos: [0, 0.18, 0.05],
      };
    case 'standard':
    default:
      return {
        cushionWidth: 0.53 * s,
        cushionHeight: 0.15,
        cushionDepth: 0.5,
        cushionPos: [0, 0.42, 0],
        backrestWidth: 0.51 * s,
        backrestHeight: 0.62,
        backrestDepth: 0.13,
        backrestPos: [0, 0.74, 0.21],
        backrestTilt: 0.09,
        headrestWidth: 0.4 * s,
        headrestHeight: 0.16,
        headrestDepth: 0.12,
        headrestPos: [0, 1.08, 0.25],
        armWidth: 0.09,
        armHeight: 0.09,
        armDepth: 0.46,
        armOffsetX: 0.31 * s,
        armPosY: 0.57,
        armPosZ: 0.02,
        pedestalRadius: 0.075,
        pedestalHeight: 0.36,
        pedestalPos: [0, 0.18, 0.05],
      };
  }
}

/**
 * Side-profile extruded waterfall seat cushion (rotated so -Z is front edge).
 */
function buildErgonomicCushionGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const hd = d / 2;
  const hh = h / 2;
  const shape = new THREE.Shape();
  // x runs -hd (front) to +hd (rear)
  shape.moveTo(-hd + 0.05, -hh);
  shape.lineTo(hd - 0.03, -hh + 0.02);
  shape.quadraticCurveTo(hd, -hh + 0.02, hd, 0);
  shape.lineTo(hd - 0.01, hh - 0.02);
  shape.quadraticCurveTo(0, hh + 0.015, -hd + 0.04, hh);
  shape.quadraticCurveTo(-hd - 0.015, hh - 0.02, -hd, -hh + 0.03);
  shape.quadraticCurveTo(-hd, -hh, -hd + 0.05, -hh);

  const innerW = Math.max(0.1, w - 0.055);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.022,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.translate(0, 0, -innerW / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Side-profile extruded lumbar-contoured backrest.
 */
function buildErgonomicBackrestGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const hd = d / 2;
  const hh = h / 2;
  const shape = new THREE.Shape();
  // Lumbar bulge at lower-mid front (-x), curved back at top
  shape.moveTo(-hd + 0.01, -hh);
  shape.lineTo(hd, -hh);
  shape.quadraticCurveTo(hd + 0.02, 0, hd - 0.01, hh - 0.02);
  shape.quadraticCurveTo(0, hh + 0.02, -hd + 0.02, hh - 0.02);
  shape.quadraticCurveTo(-hd - 0.028, -hh * 0.25, -hd + 0.01, -hh);

  const innerW = Math.max(0.1, w - 0.055);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.022,
    bevelSegments: 4,
    curveSegments: 10,
  });
  geo.translate(0, 0, -innerW / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Side-profile plush pillow headrest.
 */
function buildHeadrestPillowGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const hd = d / 2;
  const hh = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hd + 0.02, -hh);
  shape.lineTo(hd - 0.01, -hh);
  shape.quadraticCurveTo(hd + 0.015, 0, hd - 0.015, hh);
  shape.quadraticCurveTo(0, hh + 0.015, -hd + 0.02, hh - 0.01);
  shape.quadraticCurveTo(-hd - 0.025, 0, -hd + 0.02, -hh);

  const innerW = Math.max(0.1, w - 0.045);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.02,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.translate(0, 0, -innerW / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved ergonomic armrest body.
 */
function buildSculptedArmrestGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const hd = d / 2;
  const hh = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hd + 0.04, -hh);
  shape.lineTo(hd, -hh);
  shape.lineTo(hd, hh * 0.75);
  shape.quadraticCurveTo(0, hh + 0.02, -hd + 0.03, hh * 0.85);
  shape.quadraticCurveTo(-hd - 0.02, 0, -hd + 0.04, -hh);

  const innerW = Math.max(0.04, w - 0.028);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geo.translate(0, 0, -innerW / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export const SeatModels: React.FC<SeatModelsProps> = ({
  config,
  seats,
  selectedSeatId,
  hoveredSeatId = null,
  fourDxVibration,
  isPlaying,
  lightFactor = 1,
  interactive = false,
  screenBounceUniforms,
  onSelectSeat,
  onHoverSeat,
}) => {
  const { environmentProfile, seatModel, seatWidthScale = 1 } = config;
  const props = useMemo(() => getSeatProportions(seatModel, seatWidthScale), [seatModel, seatWidthScale]);

  const cushionRef = useRef<THREE.InstancedMesh>(null);
  const backrestRef = useRef<THREE.InstancedMesh>(null);
  const headrestRef = useRef<THREE.InstancedMesh>(null);
  const leftArmRef = useRef<THREE.InstancedMesh>(null);
  const rightArmRef = useRef<THREE.InstancedMesh>(null);
  const cupholderRef = useRef<THREE.InstancedMesh>(null);
  const cupRimRef = useRef<THREE.InstancedMesh>(null);
  const pedestalRef = useRef<THREE.InstancedMesh>(null);
  const pedestalFlangeRef = useRef<THREE.InstancedMesh>(null);
  const footrestRef = useRef<THREE.InstancedMesh>(null);
  const nozzleRef = useRef<THREE.InstancedMesh>(null);
  const seatGroupRef = useRef<THREE.Group>(null);

  const count = seats.length;
  const isLeather = environmentProfile.seatMaterialType !== 'fabric';

  const upholsteryTex = useMemo(() => createSeatUpholsteryTextures(isLeather), [isLeather]);

  useEffect(() => {
    return () => {
      upholsteryTex.dispose();
    };
  }, [upholsteryTex]);

  const materials = useMemo(() => {
    const primaryMat = applyScreenBounceToMaterial(
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        map: upholsteryTex.map,
        bumpMap: upholsteryTex.bumpMap,
        bumpScale: isLeather ? 0.008 : 0.012,
        roughness: isLeather ? 0.28 : 0.68,
        metalness: isLeather ? 0.06 : 0.01,
        sheen: isLeather ? 0 : 1.0,
        sheenRoughness: 0.42,
        sheenColor: new THREE.Color('#f4f4f8'),
        clearcoat: isLeather ? 0.7 : 0,
        clearcoatRoughness: 0.22,
      }),
      screenBounceUniforms,
    );
    const trimMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: environmentProfile.seatTrimColor,
        roughness: seatModel === '4dx_motion' ? 0.28 : 0.38,
        metalness: seatModel === '4dx_motion' ? 0.65 : 0.28,
      }),
      screenBounceUniforms,
    );
    const baseMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: seatModel === '4dx_motion' ? '#1e293b' : '#121318',
        roughness: 0.38,
        metalness: 0.74,
      }),
      screenBounceUniforms,
    );
    const cupMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: '#07080a',
        roughness: 0.28,
        metalness: 0.75,
      }),
      screenBounceUniforms,
    );
    const cupRimMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: seatModel === 'private_recliner' ? '#b89446' : '#525866',
        roughness: 0.22,
        metalness: 0.88,
      }),
      screenBounceUniforms,
    );
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.82,
    });
    return { primaryMat, trimMat, baseMat, cupMat, cupRimMat, nozzleMat };
  }, [environmentProfile, seatModel, upholsteryTex, isLeather, screenBounceUniforms]);

  useEffect(() => {
    materials.nozzleMat.emissiveIntensity = isPlaying ? 0.18 : 0.35;
  }, [materials, isPlaying]);

  const geometries = useMemo(() => {
    const cushionGeo = buildErgonomicCushionGeo(
      props.cushionWidth,
      props.cushionHeight,
      props.cushionDepth,
    );
    const backrestGeo = buildErgonomicBackrestGeo(
      props.backrestWidth,
      props.backrestHeight,
      props.backrestDepth,
    );
    const headrestGeo = buildHeadrestPillowGeo(
      props.headrestWidth,
      props.headrestHeight,
      props.headrestDepth,
    );
    const armGeo = buildSculptedArmrestGeo(props.armWidth, props.armHeight, props.armDepth);
    const cupGeo = new THREE.CylinderGeometry(0.036, 0.031, 0.055, 14);
    const cupRimGeo = new THREE.TorusGeometry(0.039, 0.0055, 8, 18);
    cupRimGeo.rotateX(Math.PI / 2);

    const pedestalGeo = props.hasFootrest
      ? new THREE.BoxGeometry(props.cushionWidth * 0.92, props.pedestalHeight, 0.56)
      : new THREE.CylinderGeometry(
          props.pedestalRadius * 0.82,
          props.pedestalRadius * 1.12,
          props.pedestalHeight,
          14,
        );
    const pedestalFlangeGeo = new THREE.CylinderGeometry(
      props.pedestalRadius * 1.9,
      props.pedestalRadius * 2.1,
      0.035,
      16,
    );
    const footrestGeo = buildErgonomicCushionGeo(props.cushionWidth * 0.88, 0.095, 0.36);
    const nozzleGeo = new THREE.CylinderGeometry(0.025, 0.032, 0.56, 10);
    nozzleGeo.rotateZ(Math.PI / 2);

    return {
      cushionGeo,
      backrestGeo,
      headrestGeo,
      armGeo,
      cupGeo,
      cupRimGeo,
      pedestalGeo,
      pedestalFlangeGeo,
      footrestGeo,
      nozzleGeo,
    };
  }, [props]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
      Object.values(geometries).forEach((g) => g.dispose());
    };
  }, [materials, geometries]);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    // During movie playback, selected seat blends naturally instead of glowing bright yellow
    const selectedColor = new THREE.Color(isPlaying ? environmentProfile.seatPrimaryColor : '#e0a938');
    const hoveredColor = new THREE.Color('#38bdf8');
    const unavailableColor = new THREE.Color('#334155');
    const normalColor = new THREE.Color(environmentProfile.seatPrimaryColor);

    const setSeatPart = (
      sx: number,
      sy: number,
      sz: number,
      yaw: number,
      cosY: number,
      sinY: number,
      lx: number,
      ly: number,
      lz: number,
      rx = 0,
    ) => {
      dummy.position.set(sx + lx * cosY + lz * sinY, sy + ly, sz - lx * sinY + lz * cosY);
      dummy.rotation.set(rx, yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
    };

    seats.forEach((seat, idx) => {
      const [sx, sy, sz] = seat.worldPosition;
      const yaw = seat.yaw ?? 0;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const isSelected = seat.id === selectedSeatId;
      const isHovered = seat.id === hoveredSeatId && !isSelected;
      const isUnavailable = seat.status === 'unavailable';

      const instanceColor = isSelected
        ? selectedColor
        : isHovered
          ? hoveredColor
          : isUnavailable
            ? unavailableColor
            : normalColor;

      // Seat cushion
      setSeatPart(sx, sy, sz, yaw, cosY, sinY, props.cushionPos[0], props.cushionPos[1], props.cushionPos[2], -0.05);
      cushionRef.current?.setMatrixAt(idx, dummy.matrix);
      cushionRef.current?.setColorAt(idx, instanceColor);

      // Lumbar Backrest
      setSeatPart(sx, sy, sz, yaw, cosY, sinY, props.backrestPos[0], props.backrestPos[1], props.backrestPos[2], props.backrestTilt);
      backrestRef.current?.setMatrixAt(idx, dummy.matrix);
      backrestRef.current?.setColorAt(idx, instanceColor);

      // Plush Headrest
      setSeatPart(sx, sy, sz, yaw, cosY, sinY, props.headrestPos[0], props.headrestPos[1], props.headrestPos[2], props.backrestTilt * 0.55);
      headrestRef.current?.setMatrixAt(idx, dummy.matrix);
      headrestRef.current?.setColorAt(idx, instanceColor);

      // Left & Right Sculpted Armrests
      setSeatPart(sx, sy, sz, yaw, cosY, sinY, -props.armOffsetX, props.armPosY, props.armPosZ);
      leftArmRef.current?.setMatrixAt(idx, dummy.matrix);

      setSeatPart(sx, sy, sz, yaw, cosY, sinY, props.armOffsetX, props.armPosY, props.armPosZ);
      rightArmRef.current?.setMatrixAt(idx, dummy.matrix);

      // Recessed Cupholder & Brushed Trim Rim
      const cupLx = props.armOffsetX;
      const cupLy = props.armPosY + props.armHeight * 0.42;
      const cupLz = props.armPosZ - props.armDepth * 0.34;
      setSeatPart(sx, sy, sz, yaw, cosY, sinY, cupLx, cupLy, cupLz);
      cupholderRef.current?.setMatrixAt(idx, dummy.matrix);

      setSeatPart(sx, sy, sz, yaw, cosY, sinY, cupLx, cupLy + 0.027, cupLz);
      cupRimRef.current?.setMatrixAt(idx, dummy.matrix);

      // Pedestal / Hydraulic Base + Floor Mounting Flange
      setSeatPart(sx, sy, sz, yaw, cosY, sinY, props.pedestalPos[0], props.pedestalPos[1], props.pedestalPos[2]);
      pedestalRef.current?.setMatrixAt(idx, dummy.matrix);

      setSeatPart(sx, sy, sz, yaw, cosY, sinY, props.pedestalPos[0], 0.018, props.pedestalPos[2]);
      pedestalFlangeRef.current?.setMatrixAt(idx, dummy.matrix);

      // Optional Footrest for recliners
      if (props.hasFootrest && footrestRef.current) {
        setSeatPart(sx, sy, sz, yaw, cosY, sinY, 0, 0.25, -0.37, -0.34);
        footrestRef.current.setMatrixAt(idx, dummy.matrix);
        footrestRef.current.setColorAt(idx, instanceColor);
      }

      // Optional 4DX Headrest Air/Mist Jet Nozzle Pod
      if (props.is4dxPod && nozzleRef.current) {
        setSeatPart(sx, sy, sz, yaw, cosY, sinY, 0, props.headrestPos[1] - 0.02, props.headrestPos[2] + 0.03);
        nozzleRef.current.setMatrixAt(idx, dummy.matrix);
      }
    });

    const meshes = [
      cushionRef.current,
      backrestRef.current,
      headrestRef.current,
      leftArmRef.current,
      rightArmRef.current,
      cupholderRef.current,
      cupRimRef.current,
      pedestalRef.current,
      pedestalFlangeRef.current,
      footrestRef.current,
      nozzleRef.current,
    ];

    meshes.forEach((m) => {
      if (!m) return;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [seats, selectedSeatId, hoveredSeatId, props, environmentProfile.seatPrimaryColor, isPlaying]);

  useFrame(({ clock }) => {
    if (!seatGroupRef.current) return;
    if (seatModel === '4dx_motion' && isPlaying && fourDxVibration > 0.01) {
      const t = clock.getElapsedTime();
      const heave = Math.sin(t * 2.4) * 0.032 + Math.sin(t * 14.5) * 0.01;
      const pitch = Math.sin(t * 1.65) * 0.024 + Math.cos(t * 3.1) * 0.008;
      const roll = Math.cos(t * 1.25) * 0.022;
      seatGroupRef.current.position.y = heave * fourDxVibration;
      seatGroupRef.current.rotation.x = pitch * fourDxVibration;
      seatGroupRef.current.rotation.z = roll * fourDxVibration;
    } else {
      seatGroupRef.current.position.y = THREE.MathUtils.lerp(seatGroupRef.current.position.y, 0, 0.12);
      seatGroupRef.current.rotation.x = THREE.MathUtils.lerp(seatGroupRef.current.rotation.x, 0, 0.12);
      seatGroupRef.current.rotation.z = THREE.MathUtils.lerp(seatGroupRef.current.rotation.z, 0, 0.12);
    }
  });

  const handleSeatPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.instanceId === undefined) return;
    if (e.nativeEvent.pointerType === 'touch') return;
    e.stopPropagation();
    const seat = seats[e.instanceId];
    if (!seat || seat.status === 'unavailable') {
      document.body.style.cursor = 'not-allowed';
      onHoverSeat?.(null);
      return;
    }
    document.body.style.cursor = 'pointer';
    onHoverSeat?.(seat.id);
  };

  const handleSeatPointerOut = () => {
    if (!interactive) return;
    document.body.style.cursor = 'auto';
    onHoverSeat?.(null);
  };

  const handleSeatClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.instanceId === undefined) return;
    e.stopPropagation();
    const seat = seats[e.instanceId];
    if (!seat || seat.status === 'unavailable') return;
    onSelectSeat?.(seat.id);
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  const selectedSeat = useMemo(
    () => seats.find((s) => s.id === selectedSeatId) || null,
    [seats, selectedSeatId],
  );
  const hoveredSeat = useMemo(
    () => (hoveredSeatId ? seats.find((s) => s.id === hoveredSeatId) || null : null),
    [seats, hoveredSeatId],
  );

  return (
    <group ref={seatGroupRef}>
      <instancedMesh
        ref={cushionRef}
        args={[geometries.cushionGeo, materials.primaryMat, count]}
        castShadow
        receiveShadow
        onClick={handleSeatClick}
        onPointerMove={handleSeatPointerMove}
        onPointerOut={handleSeatPointerOut}
      />
      <instancedMesh
        ref={backrestRef}
        args={[geometries.backrestGeo, materials.primaryMat, count]}
        castShadow
        receiveShadow
        onClick={handleSeatClick}
        onPointerMove={handleSeatPointerMove}
        onPointerOut={handleSeatPointerOut}
      />
      <instancedMesh
        ref={headrestRef}
        args={[geometries.headrestGeo, materials.primaryMat, count]}
        castShadow
        receiveShadow
        onClick={handleSeatClick}
        onPointerMove={handleSeatPointerMove}
        onPointerOut={handleSeatPointerOut}
      />
      <instancedMesh
        ref={leftArmRef}
        args={[geometries.armGeo, materials.trimMat, count]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={rightArmRef}
        args={[geometries.armGeo, materials.trimMat, count]}
        castShadow
        receiveShadow
      />
      <instancedMesh ref={cupholderRef} args={[geometries.cupGeo, materials.cupMat, count]} />
      <instancedMesh ref={cupRimRef} args={[geometries.cupRimGeo, materials.cupRimMat, count]} />
      <instancedMesh
        ref={pedestalRef}
        args={[geometries.pedestalGeo, materials.baseMat, count]}
        receiveShadow
      />
      <instancedMesh
        ref={pedestalFlangeRef}
        args={[geometries.pedestalFlangeGeo, materials.baseMat, count]}
        receiveShadow
      />
      {props.hasFootrest && (
        <instancedMesh
          ref={footrestRef}
          args={[geometries.footrestGeo, materials.primaryMat, count]}
          castShadow
          receiveShadow
        />
      )}
      {props.is4dxPod && (
        <instancedMesh ref={nozzleRef} args={[geometries.nozzleGeo, materials.nozzleMat, count]} />
      )}

      {/* Gold beacon ring on reserved seat only when house lights are up */}
      {selectedSeat && !isPlaying && lightFactor > 0.15 && (
        <mesh
          position={[
            selectedSeat.worldPosition[0],
            selectedSeat.worldPosition[1] + 0.58,
            selectedSeat.worldPosition[2],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.17, 0.23, 32]} />
          <meshBasicMaterial color="#d4af37" transparent opacity={0.85 * lightFactor} />
        </mesh>
      )}

      {/* Cyan hover target ring when hovering seats in Hall View */}
      {hoveredSeat && hoveredSeat.id !== selectedSeatId && (
        <mesh
          position={[
            hoveredSeat.worldPosition[0],
            hoveredSeat.worldPosition[1] + 0.6,
            hoveredSeat.worldPosition[2],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.18, 0.25, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.95} />
        </mesh>
      )}
    </group>
  );
};
