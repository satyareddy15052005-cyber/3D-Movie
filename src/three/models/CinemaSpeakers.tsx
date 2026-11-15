import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TheaterConfiguration } from '../../types/cinema';
import {
  applyScreenBounceToMaterial,
  ScreenBounceUniforms,
} from '../lighting/screenBounceShader';

interface CinemaSpeakersProps {
  config: TheaterConfiguration;
  wallBayZs: number[];
  topTierY: number;
  lightFactor: number;
  speakerGrilleMap: THREE.Texture;
  screenBounceUniforms?: ScreenBounceUniforms;
}

/**
 * Builds a trapezoidal, chamfered cinema surround cabinet oriented along local +Z
 * (narrower rear mounting face, wider flared front acoustic baffle).
 */
function buildTrapezoidCabinetGeometry(
  frontWidth: number,
  rearWidth: number,
  height: number,
  depth: number,
  bevel = 0.018,
): THREE.BufferGeometry {
  const halfFront = frontWidth / 2;
  const halfRear = rearWidth / 2;
  const halfD = depth / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-halfRear, -halfD);
  shape.lineTo(halfRear, -halfD);
  shape.lineTo(halfFront, halfD);
  shape.lineTo(-halfFront, halfD);
  shape.closePath();

  const extrudeH = Math.max(0.08, height - bevel * 2);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeH,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  });

  // Extrude runs along +Z; rotate -90 deg on X so shape X stays X, shape Y (depth) becomes +Z, and extrusion becomes +Y
  geom.rotateX(-Math.PI / 2);
  geom.center();
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a sculpted curved woofer cone via LatheGeometry (concave parabolic diaphragm).
 */
function buildWooferConeGeometry(
  outerRadius: number,
  innerRadius: number,
  coneDepth: number,
  segments = 28,
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(innerRadius * 0.9, 0),
    new THREE.Vector2(innerRadius + (outerRadius - innerRadius) * 0.35, coneDepth * 0.32),
    new THREE.Vector2(innerRadius + (outerRadius - innerRadius) * 0.72, coneDepth * 0.72),
    new THREE.Vector2(outerRadius, coneDepth),
  ];
  const geom = new THREE.LatheGeometry(pts, segments);
  geom.rotateX(Math.PI / 2); // cone opens toward +Z
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a flared constant-directivity high-frequency compression horn mouth via ExtrudeGeometry.
 */
function buildHornWaveguideGeometry(
  mouthW: number,
  mouthH: number,
  throatDepth: number,
): THREE.BufferGeometry {
  const hw = mouthW / 2;
  const hh = mouthH / 2;
  const r = Math.min(hw, hh) * 0.32;

  const outer = new THREE.Shape();
  outer.moveTo(-hw + r, -hh);
  outer.lineTo(hw - r, -hh);
  outer.quadraticCurveTo(hw, -hh, hw, -hh + r);
  outer.lineTo(hw, hh - r);
  outer.quadraticCurveTo(hw, hh, hw - r, hh);
  outer.lineTo(-hw + r, hh);
  outer.quadraticCurveTo(-hw, hh, -hw, hh - r);
  outer.lineTo(-hw, -hh + r);
  outer.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const iw = hw * 0.44;
  const ih = hh * 0.38;
  const hole = new THREE.Path();
  hole.moveTo(-iw, -ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(iw, ih);
  hole.lineTo(-iw, ih);
  hole.closePath();
  outer.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(outer, {
    depth: throatDepth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  geom.center();
  geom.computeVertexNormals();
  return geom;
}

export const CinemaSpeakers: React.FC<CinemaSpeakersProps> = ({
  config,
  wallBayZs,
  topTierY,
  lightFactor,
  speakerGrilleMap,
  screenBounceUniforms,
}) => {
  const {
    auditoriumWidth: W,
    auditoriumLength: L,
    auditoriumHeight: H,
    screenPosition,
    screenWidth,
    lightingProfile,
    environmentProfile,
  } = config;

  const frontZ = -L / 2;
  const backZ = L / 2;
  const isWarmBrass =
    environmentProfile.architectureStyle === 'private' ||
    config.sideLightStyle === 'brass_torchieres' ||
    config.sideLightStyle === 'art_deco_stepped_fins';

  const speakerScale = useMemo(
    () => Math.min(1.18, Math.max(0.76, W / 19.5)),
    [W],
  );

  const geometries = useMemo(() => {
    // Surround enclosure + driver geometries
    const surroundCabinetGeo = buildTrapezoidCabinetGeometry(0.46, 0.34, 0.7, 0.32, 0.018);
    const surroundBaffleGeo = new THREE.BoxGeometry(0.41, 0.63, 0.025);
    const surroundGrilleRimGeo = new THREE.BoxGeometry(0.44, 0.66, 0.02);
    const surroundWooferRimGeo = new THREE.TorusGeometry(0.145, 0.014, 12, 28);
    const surroundWooferSurroundGeo = new THREE.TorusGeometry(0.128, 0.016, 12, 28);
    const surroundWooferConeGeo = buildWooferConeGeometry(0.125, 0.032, 0.036, 28);
    const surroundDustCapGeo = new THREE.SphereGeometry(0.034, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const surroundHornGeo = buildHornWaveguideGeometry(0.24, 0.135, 0.055);
    const surroundHornBackGeo = new THREE.BoxGeometry(0.14, 0.075, 0.03);
    const surroundPortGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.04, 16);
    surroundPortGeo.rotateX(Math.PI / 2);

    // Wall yoke bracket geometries
    const wallPlateGeo = new THREE.BoxGeometry(0.24, 0.36, 0.03);
    const yokeArmGeo = new THREE.BoxGeometry(0.035, 0.055, 0.28);
    const yokeRearBarGeo = new THREE.BoxGeometry(0.56, 0.055, 0.04);
    const pivotBoltGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.05, 14);
    pivotBoltGeo.rotateZ(Math.PI / 2);

    // Overhead Dolby Atmos ceiling pod geometries
    const atmosCabinetGeo = buildTrapezoidCabinetGeometry(0.58, 0.44, 0.28, 0.52, 0.016);
    const atmosBaffleGeo = new THREE.BoxGeometry(0.52, 0.024, 0.46);
    const atmosWooferRimGeo = new THREE.TorusGeometry(0.165, 0.015, 12, 28);
    const atmosWooferConeGeo = buildWooferConeGeometry(0.15, 0.038, 0.04, 28);
    atmosWooferConeGeo.rotateX(Math.PI / 2); // cone opens downward (-Y)
    const atmosTweeterPodGeo = new THREE.CylinderGeometry(0.038, 0.048, 0.04, 18);
    const atmosCeilingPlateGeo = new THREE.BoxGeometry(0.32, 0.03, 0.32);
    const atmosDropArmGeo = new THREE.BoxGeometry(0.04, 0.22, 0.05);

    // Front stage subwoofer + 3-way line-array tower geometries
    const towerPlinthGeo = new THREE.BoxGeometry(0.88, 0.12, 0.78);
    const subCabinetGeo = buildTrapezoidCabinetGeometry(0.82, 0.68, 1.38, 0.7, 0.024);
    const subBaffleGeo = new THREE.BoxGeometry(0.74, 1.28, 0.03);
    const subWooferRimGeo = new THREE.TorusGeometry(0.245, 0.022, 12, 32);
    const subWooferSurroundGeo = new THREE.TorusGeometry(0.218, 0.024, 12, 32);
    const subWooferConeGeo = buildWooferConeGeometry(0.212, 0.055, 0.065, 32);
    const subDustCapGeo = new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const subSlotPortGeo = new THREE.BoxGeometry(0.64, 0.065, 0.04);

    const lineArrayCabinetGeo = buildTrapezoidCabinetGeometry(0.78, 0.58, 0.34, 0.54, 0.016);
    const lineArrayBaffleGeo = new THREE.BoxGeometry(0.7, 0.28, 0.025);
    const lineMidRimGeo = new THREE.TorusGeometry(0.095, 0.011, 10, 24);
    const lineMidConeGeo = buildWooferConeGeometry(0.088, 0.022, 0.026, 22);
    const lineHornGeo = buildHornWaveguideGeometry(0.22, 0.2, 0.05);
    const rigBracketGeo = new THREE.BoxGeometry(0.04, 0.92, 0.24);

    // Shared thin grille mesh bars (vertical & horizontal wire protection look without hiding drivers)
    const grilleBarVGeo = new THREE.BoxGeometry(0.006, 0.6, 0.006);
    const grilleBarHGeo = new THREE.BoxGeometry(0.39, 0.006, 0.006);

    return {
      surroundCabinetGeo,
      surroundBaffleGeo,
      surroundGrilleRimGeo,
      surroundWooferRimGeo,
      surroundWooferSurroundGeo,
      surroundWooferConeGeo,
      surroundDustCapGeo,
      surroundHornGeo,
      surroundHornBackGeo,
      surroundPortGeo,
      wallPlateGeo,
      yokeArmGeo,
      yokeRearBarGeo,
      pivotBoltGeo,
      atmosCabinetGeo,
      atmosBaffleGeo,
      atmosWooferRimGeo,
      atmosWooferConeGeo,
      atmosTweeterPodGeo,
      atmosCeilingPlateGeo,
      atmosDropArmGeo,
      towerPlinthGeo,
      subCabinetGeo,
      subBaffleGeo,
      subWooferRimGeo,
      subWooferSurroundGeo,
      subWooferConeGeo,
      subDustCapGeo,
      subSlotPortGeo,
      lineArrayCabinetGeo,
      lineArrayBaffleGeo,
      lineMidRimGeo,
      lineMidConeGeo,
      lineHornGeo,
      rigBracketGeo,
      grilleBarVGeo,
      grilleBarHGeo,
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((g) => g.dispose());
    };
  }, [geometries]);

  const materials = useMemo(() => {
    const cabinetMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: '#171920',
        roughness: 0.72,
        metalness: 0.12,
      }),
      screenBounceUniforms,
    );

    const baffleMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        map: speakerGrilleMap,
        color: '#101217',
        roughness: 0.86,
        metalness: 0.08,
      }),
      screenBounceUniforms,
    );

    const coneMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: '#20242e',
        roughness: 0.62,
        metalness: 0.14,
      }),
      screenBounceUniforms,
    );

    const rubberMat = new THREE.MeshStandardMaterial({
      color: '#0c0d10',
      roughness: 0.48,
      metalness: 0.05,
    });

    const metalTrimMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: isWarmBrass ? '#a88743' : '#4a5365',
        roughness: 0.24,
        metalness: 0.88,
      }),
      screenBounceUniforms,
    );

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: '#252932',
      roughness: 0.34,
      metalness: 0.82,
    });

    const hornThroatMat = new THREE.MeshStandardMaterial({
      color: '#181c24',
      roughness: 0.28,
      metalness: 0.68,
    });

    const portVoidMat = new THREE.MeshBasicMaterial({
      color: '#040406',
    });

    const statusLedMat = new THREE.MeshStandardMaterial({
      color: lightingProfile.accentColor,
      emissive: lightingProfile.accentColor,
      emissiveIntensity: 0.45 + (1 - lightFactor) * 0.25,
      roughness: 0.2,
    });

    return {
      cabinetMat,
      baffleMat,
      coneMat,
      rubberMat,
      metalTrimMat,
      darkSteelMat,
      hornThroatMat,
      portVoidMat,
      statusLedMat,
    };
  }, [speakerGrilleMap, isWarmBrass, lightingProfile.accentColor, screenBounceUniforms, lightFactor]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Compute safe side-wall surround bay indices (avoid overlapping exit door or front wall)
  const sideSpeakerPositions = useMemo(() => {
    const arr: { x: number; y: number; z: number; side: -1 | 1; bayIdx: number }[] = [];
    const usableBays = wallBayZs.filter((_, idx) => idx >= 1 && idx <= wallBayZs.length - 1);
    usableBays.forEach((bz, idx) => {
      const spkZ = Math.min(backZ - 1.15, bz + 0.82);
      const spkY = Math.min(
        H - 1.35,
        Math.max(2.35, topTierY + 2.25 - (usableBays.length - 1 - idx) * 0.16),
      );
      ([-1, 1] as const).forEach((side) => {
        arr.push({
          x: side * (W / 2 - 0.22),
          y: spkY,
          z: spkZ,
          side,
          bayIdx: idx,
        });
      });
    });
    return arr;
  }, [wallBayZs, backZ, H, topTierY, W]);

  // Rear-wall surround speakers: dedicated speakers directly flanking the projector booth window
  // plus corner rear surrounds in wider halls and an overhead booth-crown rear surround
  const rearSpeakerPositions = useMemo(() => {
    const boothY = Math.min(H - 1.4, topTierY + 3.25);
    const boothWinW = Math.min(4.8, W * 0.42);
    const boothWinH = Math.min(1.42, H * 0.24);
    const winTop = Math.min(H - 0.28, boothY + boothWinH / 2);
    const winBot = Math.max(0.25, boothY - boothWinH / 2);
    const winMidY = (winTop + winBot) / 2;

    const list: { x: number; y: number; z: number; yaw: number; pitch: number }[] = [];

    // Twin primary rear surrounds mounted directly flanking the projection booth window on every hall
    const boothSideX = Math.min(W / 2 - 0.68, boothWinW / 2 + 0.78);
    ([-1, 1] as const).forEach((side) => {
      list.push({
        x: side * boothSideX,
        y: winMidY,
        z: backZ - 0.21,
        yaw: Math.PI - side * 0.14,
        pitch: 0,
      });
    });

    // Wide rear-corner surround pair in medium & large theaters for full rear coverage
    if (W >= 14.0) {
      const cornerX = Math.max(boothSideX + 1.45, Math.min(W * 0.38, W / 2 - 1.05));
      const cornerY = Math.min(H - 1.2, Math.max(2.35, winMidY - 0.12));
      ([-1, 1] as const).forEach((side) => {
        list.push({
          x: side * cornerX,
          y: cornerY,
          z: backZ - 0.21,
          yaw: Math.PI - side * 0.24,
          pitch: 0,
        });
      });
    }

    // Center-rear monitor directly above or below booth window bezel
    const crownClearance = H - winTop;
    const rearCenterY =
      crownClearance >= 0.92
        ? winTop + 0.48
        : Math.max(2.6, topTierY + 1.85);
    if (crownClearance >= 0.92 || winBot - (topTierY + 2.45) >= 0.85) {
      list.push({
        x: 0,
        y: rearCenterY,
        z: backZ - 0.21,
        yaw: Math.PI,
        pitch: 0.12,
      });
    }

    return list;
  }, [W, H, topTierY, backZ]);

  // Overhead Dolby Atmos speaker coordinates
  const atmosSpeakerPositions = useMemo(() => {
    const xs = [-W * 0.22, W * 0.22];
    const zs = [-L * 0.18, L * 0.08];
    const pts: { x: number; y: number; z: number; side: -1 | 1 }[] = [];
    xs.forEach((x, xi) => {
      zs.forEach((z) => {
        pts.push({
          x,
          y: H - 0.2,
          z,
          side: xi === 0 ? -1 : 1,
        });
      });
    });
    return pts;
  }, [W, L, H]);

  // Front Proscenium Dual-18" Subwoofer + 3-Way Line-Array Towers (grounded at stage top y = 0.5)
  const frontTowerPositions = useMemo(() => {
    const safeMinX = Math.min(W / 2 - 0.45, screenWidth / 2 + 0.36);
    const towerX = Math.max(safeMinX, W / 2 - 0.56);
    const towerZ = Math.max(frontZ + 0.65, screenPosition[2] + 0.56);
    return ([-1, 1] as const).map((side) => ({
      x: side * towerX,
      y: 0.5,
      z: towerZ,
      side,
    }));
  }, [W, screenWidth, frontZ, screenPosition]);

  const renderSurroundUnit = (key: string) => (
    <group key={key} scale={speakerScale}>
      {/* Flush Wall Mounting Plate */}
      <mesh position={[0, 0, 0.015]} geometry={geometries.wallPlateGeo} material={materials.darkSteelMat} />

      {/* Steel U-Yoke Bracket */}
      <mesh position={[0, 0, 0.055]} geometry={geometries.yokeRearBarGeo} material={materials.darkSteelMat} />
      {[-0.265, 0.265].map((yx, yi) => (
        <group key={`yoke-${yi}`} position={[yx, 0, 0.18]}>
          <mesh geometry={geometries.yokeArmGeo} material={materials.darkSteelMat} />
          <mesh position={[0, 0, 0.12]} geometry={geometries.pivotBoltGeo} material={materials.metalTrimMat} />
        </group>
      ))}

      {/* Angled Acoustic Cabinet Pivoted Downward 20° Toward Audience Seats */}
      <group position={[0, -0.02, 0.28]} rotation={[0.34, 0, 0]}>
        {/* Main Trapezoidal Cabinet */}
        <mesh
          geometry={geometries.surroundCabinetGeo}
          material={materials.cabinetMat}
          castShadow
        />

        {/* Chamfered Metallic Front Bezel Frame */}
        <mesh
          position={[0, 0, 0.162]}
          geometry={geometries.surroundGrilleRimGeo}
          material={materials.metalTrimMat}
        />

        {/* Recessed Acoustic Baffle Plate */}
        <mesh
          position={[0, 0, 0.166]}
          geometry={geometries.surroundBaffleGeo}
          material={materials.baffleMat}
        />

        {/* Lower 8" Sculpted Woofer Driver Assembly */}
        <group position={[0, -0.11, 0.178]}>
          <mesh geometry={geometries.surroundWooferRimGeo} material={materials.metalTrimMat} />
          <mesh position={[0, 0, 0.002]} geometry={geometries.surroundWooferSurroundGeo} material={materials.rubberMat} />
          <mesh position={[0, 0, -0.032]} geometry={geometries.surroundWooferConeGeo} material={materials.coneMat} />
          <mesh position={[0, 0, -0.018]} rotation={[Math.PI / 2, 0, 0]} geometry={geometries.surroundDustCapGeo} material={materials.rubberMat} />
        </group>

        {/* Upper Flared High-Frequency Constant-Directivity Horn Waveguide */}
        <group position={[0, 0.165, 0.176]}>
          <mesh geometry={geometries.surroundHornGeo} material={materials.hornThroatMat} />
          <mesh position={[0, 0, -0.028]} geometry={geometries.surroundHornBackGeo} material={materials.portVoidMat} />
        </group>

        {/* Dual Tuned Bass Reflex Ports */}
        {[-0.12, 0.12].map((px, pi) => (
          <mesh
            key={`port-${pi}`}
            position={[px, -0.275, 0.172]}
            geometry={geometries.surroundPortGeo}
            material={materials.portVoidMat}
          />
        ))}

        {/* Thin Studio Protective Wire Bars Across Front Baffle */}
        {[-0.14, 0.14].map((gx, gi) => (
          <mesh
            key={`gbar-v-${gi}`}
            position={[gx, 0, 0.194]}
            geometry={geometries.grilleBarVGeo}
            material={materials.darkSteelMat}
          />
        ))}
        {[-0.29, 0.03, 0.29].map((gy, gi) => (
          <mesh
            key={`gbar-h-${gi}`}
            position={[0, gy, 0.194]}
            geometry={geometries.grilleBarHGeo}
            material={materials.darkSteelMat}
          />
        ))}

        {/* Subtle Cinema Power Status Badge LED */}
        <mesh position={[0, -0.285, 0.186]} material={materials.statusLedMat}>
          <boxGeometry args={[0.045, 0.012, 0.008]} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group>
      {/* Side-Wall Surround Speaker Arrays (Wall-Mounted & Angled Toward Seats) */}
      {sideSpeakerPositions.map((sp, i) => (
        <group
          key={`side-surround-${i}`}
          position={[sp.x, sp.y, sp.z]}
          rotation={[0, sp.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          {renderSurroundUnit(`side-unit-${i}`)}
        </group>
      ))}

      {/* Rear-Wall Surround Speakers Flanking & Framing the Projection Booth */}
      {rearSpeakerPositions.map((sp, i) => (
        <group
          key={`rear-surround-${i}`}
          position={[sp.x, sp.y, sp.z]}
          rotation={[sp.pitch, sp.yaw, 0]}
        >
          {renderSurroundUnit(`rear-unit-${i}`)}
        </group>
      ))}

      {/* Overhead Dolby Atmos Ceiling Gimbal Speaker Pods */}
      {atmosSpeakerPositions.map((ap, i) => (
        <group
          key={`atmos-${i}`}
          position={[ap.x, ap.y, ap.z]}
          scale={speakerScale}
        >
          {/* Ceiling Mounting Plate */}
          <mesh position={[0, -0.015, 0]} geometry={geometries.atmosCeilingPlateGeo} material={materials.darkSteelMat} />
          {/* Dual Gimbal Drop Arms */}
          {[-0.24, 0.24].map((ax, ai) => (
            <mesh
              key={`arm-${ai}`}
              position={[ax, -0.12, 0]}
              geometry={geometries.atmosDropArmGeo}
              material={materials.darkSteelMat}
            />
          ))}
          {/* Canted Coaxial Atmos Pod Tilted Inward Toward Sweet Spot */}
          <group position={[0, -0.22, 0]} rotation={[0.1, 0, ap.side * 0.36]}>
            <mesh geometry={geometries.atmosCabinetGeo} material={materials.cabinetMat} />
            <mesh position={[0, -0.145, 0]} geometry={geometries.atmosBaffleGeo} material={materials.baffleMat} />
            {/* Coaxial 10" Driver Ring & Cone */}
            <mesh
              position={[0, -0.158, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={geometries.atmosWooferRimGeo}
              material={materials.metalTrimMat}
            />
            <mesh
              position={[0, -0.118, 0]}
              geometry={geometries.atmosWooferConeGeo}
              material={materials.coneMat}
            />
            {/* Centered Coaxial Compression Tweeter Waveguide */}
            <mesh
              position={[0, -0.155, 0]}
              geometry={geometries.atmosTweeterPodGeo}
              material={materials.hornThroatMat}
            />
            <mesh position={[0, -0.145, 0.21]} material={materials.statusLedMat}>
              <boxGeometry args={[0.05, 0.01, 0.01]} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Front Proscenium Dual-18" Cinema Subwoofers + 3-Way Line-Array Horn Towers */}
      {frontTowerPositions.map((fp, i) => (
        <group
          key={`front-tower-${i}`}
          position={[fp.x, fp.y, fp.z]}
          rotation={[0, -fp.side * 0.28, 0]}
          scale={speakerScale}
        >
          {/* Vibration-Isolation Plinth Base (bottom sits flush at y=0) */}
          <mesh
            position={[0, 0.06, 0]}
            geometry={geometries.towerPlinthGeo}
            material={materials.darkSteelMat}
            castShadow
          />

          {/* Lower Dual-18" Cinema Subwoofer Enclosure */}
          <group position={[0, 0.81, 0]}>
            <mesh geometry={geometries.subCabinetGeo} material={materials.cabinetMat} castShadow />
            <mesh position={[0, 0, 0.35]} geometry={geometries.subBaffleGeo} material={materials.baffleMat} />

            {/* Dual 18" Subwoofer Cones */}
            {[-0.31, 0.28].map((wy, wi) => (
              <group key={`sub-driver-${wi}`} position={[0, wy, 0.365]}>
                <mesh geometry={geometries.subWooferRimGeo} material={materials.metalTrimMat} />
                <mesh position={[0, 0, 0.004]} geometry={geometries.subWooferSurroundGeo} material={materials.rubberMat} />
                <mesh position={[0, 0, -0.055]} geometry={geometries.subWooferConeGeo} material={materials.coneMat} />
                <mesh
                  position={[0, 0, -0.032]}
                  rotation={[Math.PI / 2, 0, 0]}
                  geometry={geometries.subDustCapGeo}
                  material={materials.rubberMat}
                />
              </group>
            ))}

            {/* Bottom Laminar Bass Reflex Slot Port */}
            <mesh
              position={[0, -0.61, 0.35]}
              geometry={geometries.subSlotPortGeo}
              material={materials.portVoidMat}
            />
          </group>

          {/* Steel Rigging Side Struts Connecting Sub to Stacked Line Array */}
          {[-0.38, 0.38].map((rx, ri) => (
            <mesh
              key={`rig-${ri}`}
              position={[rx, 1.94, 0.05]}
              geometry={geometries.rigBracketGeo}
              material={materials.metalTrimMat}
            />
          ))}

          {/* Stacked Twin Line-Array Mid-High Cinema Horn Modules */}
          {[0, 1].map((li) => (
            <group
              key={`line-mod-${li}`}
              position={[0, 1.72 + li * 0.36, 0.04]}
              rotation={[0.06 * (1 - li), 0, 0]}
            >
              <mesh geometry={geometries.lineArrayCabinetGeo} material={materials.cabinetMat} castShadow />
              <mesh position={[0, 0, 0.27]} geometry={geometries.lineArrayBaffleGeo} material={materials.baffleMat} />

              {/* Dual Mid-Range Cones Flanking Center Waveguide */}
              {[-0.22, 0.22].map((mx, mi) => (
                <group key={`mid-${mi}`} position={[mx, 0, 0.285]}>
                  <mesh geometry={geometries.lineMidRimGeo} material={materials.metalTrimMat} />
                  <mesh position={[0, 0, -0.022]} geometry={geometries.lineMidConeGeo} material={materials.coneMat} />
                </group>
              ))}

              {/* Central Planar Ribbon / Horn Waveguide */}
              <mesh position={[0, 0, 0.285]} geometry={geometries.lineHornGeo} material={materials.hornThroatMat} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
};
