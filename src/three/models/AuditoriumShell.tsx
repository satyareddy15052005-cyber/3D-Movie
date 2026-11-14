import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TheaterConfiguration } from '../../types/cinema';
import { getAisleWorldXs } from '../../config/seating/seatGenerator';
import {
  createAuditoriumTextures,
  createRowMarkerTexture,
} from '../materials/proceduralTextures';
import {
  applyScreenBounceToMaterial,
  ScreenBounceUniforms,
} from '../lighting/screenBounceShader';
import { CinemaSpeakers } from './CinemaSpeakers';

interface AuditoriumShellProps {
  config: TheaterConfiguration;
  lightFactor: number; // 0 = dark show playing, 1 = auditorium open
  screenBounceUniforms?: ScreenBounceUniforms;
}

const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates a realistic 3D pleated velvet curtain geometry with undulating vertical folds.
 */
function buildPleatedCurtainGeometry(
  width: number,
  height: number,
  depth: number,
  folds = 7,
): THREE.BufferGeometry {
  const segX = folds * 6;
  const segY = 2;
  const geom = new THREE.PlaneGeometry(width, height, segX, segY);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const normX = x / width + 0.5;
    const pleat = Math.sin(normX * folds * Math.PI * 2) * (depth * 0.5);
    pos.setZ(i, pleat);
  }
  geom.computeVertexNormals();
  return geom;
}

export const AuditoriumShell: React.FC<AuditoriumShellProps> = ({
  config,
  lightFactor,
  screenBounceUniforms,
}) => {
  const {
    auditoriumWidth: W,
    auditoriumLength: L,
    auditoriumHeight: H,
    seatingRows,
    rowSpacing,
    rowElevationStep,
    firstRowZ,
    screenPosition,
    screenWidth,
    screenHeight,
    environmentProfile,
    lightingProfile,
    sideLightStyle,
    ceilingLightStyle,
    wallBayCount,
  } = config;

  const textures = useMemo(
    () =>
      createAuditoriumTextures(
        environmentProfile,
        config.theaterName,
        lightingProfile.accentColor,
      ),
    [environmentProfile, config.theaterName, lightingProfile.accentColor],
  );

  const rowMarkerTextures = useMemo(() => {
    const arr: THREE.CanvasTexture[] = [];
    for (let r = 0; r < seatingRows; r++) {
      const label = ROW_LABELS[r] || `${r + 1}`;
      arr.push(createRowMarkerTexture(label, lightingProfile.stepLightColor));
    }
    return arr;
  }, [seatingRows, lightingProfile.stepLightColor]);

  useEffect(() => {
    return () => {
      textures.dispose();
      rowMarkerTextures.forEach((t) => t.dispose());
    };
  }, [textures, rowMarkerTextures]);

  const aisleXs = useMemo(() => getAisleWorldXs(config), [config]);

  const wingWidth = Math.max(0.75, (W - screenWidth) / 2);
  const valanceHeight = Math.max(0.45, H - (screenPosition[1] + screenHeight / 2) - 0.15);

  const curtainGeos = useMemo(() => {
    const sideCurtainGeo = buildPleatedCurtainGeometry(wingWidth, H - 0.35, 0.22, 6);
    const valanceCurtainGeo = buildPleatedCurtainGeometry(
      screenWidth + 0.8,
      valanceHeight,
      0.16,
      18,
    );
    return { sideCurtainGeo, valanceCurtainGeo };
  }, [wingWidth, H, screenWidth, valanceHeight]);

  useEffect(() => {
    return () => {
      curtainGeos.sideCurtainGeo.dispose();
      curtainGeos.valanceCurtainGeo.dispose();
    };
  }, [curtainGeos]);

  const materials = useMemo(() => {
    const carpetMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        map: textures.carpetMap,
        bumpMap: textures.carpetBumpMap,
        bumpScale: 0.015,
        roughness: 0.94,
        metalness: 0.02,
      }),
      screenBounceUniforms,
    );
    const wallMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        map: textures.wallMap,
        bumpMap: textures.wallBumpMap,
        bumpScale: 0.018,
        roughness: environmentProfile.architectureStyle === 'private' ? 0.52 : 0.86,
        metalness: 0.04,
      }),
      screenBounceUniforms,
    );
    const acousticPanelMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: environmentProfile.wallMaterialColor,
        bumpMap: textures.wallBumpMap,
        bumpScale: 0.014,
        roughness: 0.92,
        metalness: 0.02,
      }),
      screenBounceUniforms,
    );
    const ceilingMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: environmentProfile.ceilingColor,
        roughness: 0.9,
        metalness: 0.06,
      }),
      screenBounceUniforms,
    );
    const trimMetalMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color:
          environmentProfile.architectureStyle === 'private' ||
          sideLightStyle === 'classic_sconces'
            ? '#b89446'
            : '#323744',
        roughness: 0.28,
        metalness: 0.84,
      }),
      screenBounceUniforms,
    );
    const nosingMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: '#1b1d24',
        roughness: 0.36,
        metalness: 0.72,
      }),
      screenBounceUniforms,
    );
    const stageMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: '#090a0d',
        roughness: 0.86,
        metalness: 0.06,
      }),
      screenBounceUniforms,
    );
    const speakerMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        map: textures.speakerGrilleMap,
        color: '#181a20',
        roughness: 0.75,
        metalness: 0.18,
      }),
      screenBounceUniforms,
    );
    const doorMat = applyScreenBounceToMaterial(
      new THREE.MeshStandardMaterial({
        color: '#14161d',
        roughness: 0.45,
        metalness: 0.45,
      }),
      screenBounceUniforms,
    );
    const exitSignMat = new THREE.MeshBasicMaterial({
      map: textures.exitSignMap,
      color: '#7aa896',
    });
    const entranceSignMat = new THREE.MeshBasicMaterial({
      map: textures.entranceSignMap,
      transparent: true,
      opacity: 0.9,
    });
    const posterMat = new THREE.MeshStandardMaterial({
      map: textures.posterMap,
      emissive: '#ffffff',
      emissiveMap: textures.posterMap,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });
    const curtainMat = applyScreenBounceToMaterial(
      new THREE.MeshPhysicalMaterial({
        map: textures.curtainMap,
        roughness: 0.9,
        metalness: 0.02,
        sheen: 0.55,
        sheenRoughness: 0.78,
        sheenColor: new THREE.Color('#3a2528'),
        side: THREE.DoubleSide,
      }),
      screenBounceUniforms,
    );
    const extinguisherMat = new THREE.MeshStandardMaterial({
      color: '#991b1b',
      roughness: 0.38,
      metalness: 0.45,
    });
    const sconceWashMat = new THREE.MeshBasicMaterial({
      map: textures.sconceWashMap,
      color: lightingProfile.wallColor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Dedicated Projection Booth Materials
    const boothInteriorWallMat = new THREE.MeshStandardMaterial({
      color: '#14161d',
      roughness: 0.85,
      metalness: 0.12,
    });
    const boothFloorMat = new THREE.MeshStandardMaterial({
      color: '#0e1015',
      roughness: 0.75,
      metalness: 0.2,
    });
    const boothGlassMat = new THREE.MeshPhysicalMaterial({
      color: '#1b2638',
      transparent: true,
      opacity: 0.2,
      roughness: 0.06,
      metalness: 0.15,
      reflectivity: 0.9,
      depthWrite: false,
    });
    const projectorBodyMat = new THREE.MeshStandardMaterial({
      color: '#1b1e27',
      roughness: 0.34,
      metalness: 0.72,
    });
    const projectorChromeMat = new THREE.MeshStandardMaterial({
      color: '#5a6375',
      roughness: 0.2,
      metalness: 0.9,
    });

    return {
      carpetMat,
      wallMat,
      acousticPanelMat,
      ceilingMat,
      trimMetalMat,
      nosingMat,
      stageMat,
      speakerMat,
      doorMat,
      exitSignMat,
      entranceSignMat,
      posterMat,
      curtainMat,
      extinguisherMat,
      sconceWashMat,
      boothInteriorWallMat,
      boothFloorMat,
      boothGlassMat,
      projectorBodyMat,
      projectorChromeMat,
    };
  }, [textures, environmentProfile, lightingProfile.wallColor, sideLightStyle, screenBounceUniforms]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Step lights remain ALWAYS ON during the entire show; house lights dim cleanly when lightFactor -> 0
  materials.posterMat.emissiveIntensity = 0.02 + lightFactor * 0.46;
  materials.entranceSignMat.opacity = 0.08 + lightFactor * 0.92;
  materials.sconceWashMat.opacity = lightFactor * 0.42;

  const stepEmissiveIntensity = 1.45;
  const rowBadgeOpacity = 0.65 + lightFactor * 0.35;
  const wallAccentIntensity = lightFactor * 1.55;
  const ceilingPuckIntensity = lightFactor * 2.2;
  const boothWorkLightIntensity = 0.06 + lightFactor * 0.52;
  const lensEmissiveIntensity = lightFactor < 0.25 ? 0.58 : 0.28;

  const frontZ = -L / 2;
  const backZ = L / 2;
  const topTierY = (seatingRows - 1) * rowElevationStep;

  const tiers = useMemo(() => {
    const arr: { row: number; y: number; z: number; depth: number; height: number }[] = [];
    for (let r = 0; r < seatingRows; r++) {
      const y = r * rowElevationStep;
      const z = firstRowZ + r * rowSpacing;
      const depth = r === seatingRows - 1 ? backZ - (z - rowSpacing * 0.5) + 0.5 : rowSpacing;
      const centerZ = r === seatingRows - 1 ? (z - rowSpacing * 0.5 + backZ) / 2 : z;
      arr.push({
        row: r,
        y,
        z: centerZ,
        depth,
        height: Math.max(0.18, y + 0.12),
      });
    }
    return arr;
  }, [seatingRows, rowElevationStep, firstRowZ, rowSpacing, backZ]);

  const wallBayZs = useMemo(() => {
    const count = Math.max(3, wallBayCount);
    const span = L * 0.72;
    const start = -L * 0.34;
    return Array.from({ length: count }, (_, i) => start + (i / (count - 1)) * span);
  }, [L, wallBayCount]);

  const ceilingLightPositions = useMemo(() => {
    const pts: [number, number][] = [];
    const xs = [-W * 0.28, 0, W * 0.28];
    const zs = [-L * 0.28, 0, L * 0.28];
    xs.forEach((x) => {
      zs.forEach((z) => {
        pts.push([x, z]);
      });
    });
    return pts;
  }, [W, L]);

  const starPoints = useMemo(() => {
    const pts: [number, number][] = [];
    const cols = 6;
    const rows = 5;
    for (let ix = 0; ix < cols; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const u = (ix + 0.5) / cols - 0.5;
        const v = (iz + 0.5) / rows - 0.5;
        const jitterX = Math.sin(ix * 2.1 + iz * 1.7) * 0.55;
        const jitterZ = Math.cos(ix * 1.3 + iz * 2.9) * 0.55;
        pts.push([u * (W - 3.0) + jitterX, v * (L - 4.0) + jitterZ]);
      }
    }
    return pts;
  }, [W, L]);

  // Real 3D Recessed Projection Room Dimensions (aligned to boothY)
  const boothY = Math.min(H - 1.4, topTierY + 3.25);
  const boothWinW = Math.min(4.8, W * 0.42);
  const boothWinH = Math.min(1.42, H * 0.24);
  const winTop = Math.min(H - 0.28, boothY + boothWinH / 2);
  const winBot = Math.max(0.25, boothY - boothWinH / 2);
  const actualWinH = Math.max(0.6, winTop - winBot);
  const winMidY = (winTop + winBot) / 2;

  const boothChamberW = boothWinW + 1.6;
  const boothFloorY = winBot - 0.42;
  const boothCeilY = Math.min(H + 0.4, winTop + 0.65);
  const boothChamberH = Math.max(1.8, boothCeilY - boothFloorY);
  const boothMidY = (boothFloorY + boothCeilY) / 2;
  const boothDepth = 2.7;
  const boothCenterZ = backZ + boothDepth / 2 - 0.05;

  const sideBackWallW = Math.max(0.5, (W - boothWinW) / 2);

  return (
    <group>
      {/* Flat lower auditorium floor from front wall to first row */}
      <mesh
        position={[0, -0.05, (frontZ + firstRowZ) / 2]}
        receiveShadow
        material={materials.carpetMat}
      >
        <boxGeometry args={[W, 0.1, Math.abs(firstRowZ - frontZ) + 1.5]} />
      </mesh>

      {/* Stepped Seating Tiers + Aluminum Stair Nosing + Micro Step LEDs + Row Badges */}
      {tiers.map((tier) => (
        <group key={`tier-${tier.row}`}>
          <mesh
            position={[0, tier.y - tier.height / 2, tier.z]}
            receiveShadow
            castShadow
            material={materials.carpetMat}
          >
            <boxGeometry args={[W - 0.1, tier.height, tier.depth]} />
          </mesh>

          {aisleXs.map((ax, aIdx) => (
            <React.Fragment key={`step-${tier.row}-${aIdx}`}>
              <mesh
                position={[ax, tier.y + 0.005, tier.z - tier.depth / 2 + 0.03]}
                material={materials.nosingMat}
              >
                <boxGeometry args={[0.96, 0.022, 0.06]} />
              </mesh>

              {/* Always-on recessed safety step LED line */}
              <mesh position={[ax, tier.y + 0.017, tier.z - tier.depth / 2 + 0.028]}>
                <boxGeometry args={[0.88, 0.014, 0.024]} />
                <meshStandardMaterial
                  color={lightingProfile.stepLightColor}
                  emissive={lightingProfile.stepLightColor}
                  emissiveIntensity={stepEmissiveIntensity}
                  toneMapped={false}
                  roughness={0.25}
                />
              </mesh>

              {rowMarkerTextures[tier.row] && (
                <mesh
                  position={[ax, tier.y + 0.011, firstRowZ + tier.row * rowSpacing]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[0.3, 0.3]} />
                  <meshBasicMaterial
                    map={rowMarkerTextures[tier.row]}
                    transparent
                    opacity={rowBadgeOpacity}
                  />
                </mesh>
              )}

              {/* Compact brushed metal aisle safety handrail posts on upper steep tiers */}
              {rowElevationStep >= 0.4 && tier.row >= 2 && tier.row % 2 === 0 && (
                <group position={[ax + (ax >= 0 ? 0.52 : -0.52), tier.y, tier.z - tier.depth / 2 + 0.14]}>
                  <mesh position={[0, 0.38, 0]} material={materials.trimMetalMat}>
                    <cylinderGeometry args={[0.02, 0.022, 0.76, 10]} />
                  </mesh>
                  <mesh position={[0, 0.015, 0]} material={materials.nosingMat}>
                    <cylinderGeometry args={[0.048, 0.052, 0.03, 12]} />
                  </mesh>
                  <mesh position={[0, 0.76, rowSpacing * 0.48]} rotation={[Math.atan2(rowElevationStep, rowSpacing), 0, 0]} material={materials.trimMetalMat}>
                    <boxGeometry args={[0.036, 0.028, Math.hypot(rowSpacing, rowElevationStep) * 1.02]} />
                  </mesh>
                </group>
              )}
            </React.Fragment>
          ))}
        </group>
      ))}

      {/* Raised Front Stage Apron */}
      <group position={[0, 0.25, screenPosition[2] + 0.85]}>
        <mesh receiveShadow material={materials.stageMat}>
          <boxGeometry args={[W - 0.8, 0.5, 1.9]} />
        </mesh>
        <mesh position={[0, 0.252, 0.94]} material={materials.trimMetalMat}>
          <boxGeometry args={[W - 0.8, 0.03, 0.06]} />
        </mesh>
        {[-W * 0.28, 0, W * 0.28].map((gx, gi) => (
          <mesh key={`stage-vent-${gi}`} position={[gx, -0.02, 0.96]} material={materials.speakerMat}>
            <planeGeometry args={[2.2, 0.28]} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <group key={`stage-step-${side}`} position={[side * (W / 2 - 1.15), -0.1, 1.3]}>
            <mesh material={materials.stageMat} position={[0, 0.08, -0.18]}>
              <boxGeometry args={[1.0, 0.32, 0.4]} />
            </mesh>
            <mesh material={materials.stageMat} position={[0, -0.04, 0.2]}>
              <boxGeometry args={[1.0, 0.16, 0.4]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Proscenium / Screen Front Wall */}
      <mesh position={[0, H / 2, frontZ]} receiveShadow material={materials.stageMat}>
        <boxGeometry args={[W, H, 0.4]} />
      </mesh>

      {/* Sculpted 3D Pleated Velvet Side Curtains Flanking the Giant Screen */}
      {[-1, 1].map((side) => (
        <mesh
          key={`wing-${side}`}
          position={[side * (W / 2 - wingWidth / 2 - 0.18), H / 2, frontZ + 0.48]}
          geometry={curtainGeos.sideCurtainGeo}
          material={materials.curtainMat}
          receiveShadow
        />
      ))}

      {/* Overhead Pleated Velvet Valance Header above Screen */}
      {valanceHeight > 0.35 && (
        <mesh
          position={[0, H - valanceHeight / 2 - 0.1, frontZ + 0.56]}
          geometry={curtainGeos.valanceCurtainGeo}
          material={materials.curtainMat}
          receiveShadow
        />
      )}

      {/* Left & Right Side Walls */}
      <mesh position={[-W / 2, H / 2, 0]} receiveShadow material={materials.wallMat}>
        <boxGeometry args={[0.4, H, L]} />
      </mesh>
      <mesh position={[W / 2, H / 2, 0]} receiveShadow material={materials.wallMat}>
        <boxGeometry args={[0.4, H, L]} />
      </mesh>

      {/* Rear Wall Built Around Real Recessed Projection Room Window Opening */}
      {/* Bottom rear wall */}
      <mesh position={[0, winBot / 2, backZ]} receiveShadow material={materials.wallMat}>
        <boxGeometry args={[W, winBot, 0.4]} />
      </mesh>
      {/* Top rear wall above booth window */}
      {H - winTop > 0.05 && (
        <mesh position={[0, (H + winTop) / 2, backZ]} receiveShadow material={materials.wallMat}>
          <boxGeometry args={[W, H - winTop, 0.4]} />
        </mesh>
      )}
      {/* Left & Right walls flanking the booth window */}
      <mesh
        position={[-(W + boothWinW) / 4, winMidY, backZ]}
        receiveShadow
        material={materials.wallMat}
      >
        <boxGeometry args={[sideBackWallW, actualWinH, 0.4]} />
      </mesh>
      <mesh
        position={[(W + boothWinW) / 4, winMidY, backZ]}
        receiveShadow
        material={materials.wallMat}
      >
        <boxGeometry args={[sideBackWallW, actualWinH, 0.4]} />
      </mesh>

      {/* Architectural Floor Skirting & Ceiling Crown Cornice Moldings */}
      {[-1, 1].map((side) => (
        <group key={`wall-molding-${side}`}>
          <mesh position={[side * (W / 2 - 0.22), 0.12, 0]} material={materials.nosingMat}>
            <boxGeometry args={[0.06, 0.24, L]} />
          </mesh>
          <mesh position={[side * (W / 2 - 0.24), H - 0.22, 0]} material={materials.trimMetalMat}>
            <boxGeometry args={[0.14, 0.12, L]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, H - 0.22, backZ - 0.22]} material={materials.trimMetalMat}>
        <boxGeometry args={[W - 0.4, 0.12, 0.14]} />
      </mesh>

      {/* Symmetrical Vertical Acoustic Diffuser Slats on Rear Wall Flanking Booth & Doors */}
      {[-1, 1].map((side) =>
        Array.from({ length: 4 }, (_, si) => {
          const slatX = side * (boothWinW / 2 + 1.55 + si * 0.42);
          if (Math.abs(slatX) > W / 2 - 0.55) return null;
          return (
            <mesh
              key={`rear-diffuser-${side}-${si}`}
              position={[slatX, H * 0.52, backZ - 0.22]}
              material={materials.acousticPanelMat}
            >
              <boxGeometry args={[0.12, H * 0.72, 0.07]} />
            </mesh>
          );
        }),
      )}

      {/* Rear Cinema Entrance Double Doors + Overhead Illuminated Sign + Symmetrical Framed Poster Lightboxes */}
      <group position={[0, Math.min(winBot - 1.35, topTierY + 1.15), backZ - 0.24]}>
        <mesh material={materials.trimMetalMat}>
          <boxGeometry args={[2.5, 2.45, 0.14]} />
        </mesh>
        <mesh position={[-0.58, 0, 0.04]} material={materials.doorMat}>
          <boxGeometry args={[1.1, 2.28, 0.08]} />
        </mesh>
        <mesh position={[0.58, 0, 0.04]} material={materials.doorMat}>
          <boxGeometry args={[1.1, 2.28, 0.08]} />
        </mesh>
        <mesh position={[-0.58, -0.05, 0.1]} material={materials.trimMetalMat}>
          <boxGeometry args={[0.7, 0.06, 0.05]} />
        </mesh>
        <mesh position={[0.58, -0.05, 0.1]} material={materials.trimMetalMat}>
          <boxGeometry args={[0.7, 0.06, 0.05]} />
        </mesh>
        <mesh position={[0, 1.44, 0.05]} material={materials.entranceSignMat}>
          <planeGeometry args={[1.15, 0.3]} />
        </mesh>
        {[-1, 1].map((pside) => (
          <group key={`rear-poster-${pside}`} position={[pside * Math.min(2.25, W * 0.22), 0.12, 0.04]}>
            <mesh material={materials.trimMetalMat}>
              <boxGeometry args={[0.96, 1.36, 0.06]} />
            </mesh>
            <mesh position={[0, 0, 0.04]} material={materials.posterMat}>
              <planeGeometry args={[0.84, 1.22]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ===================================================================== */}
      {/* REAL 3D RECESSED PROJECTION ROOM (BOOTH) + 3D CINEMA PROJECTOR       */}
      {/* ===================================================================== */}
      <group>
        {/* Sealed Booth Room Floor, Ceiling, Back & Side Walls */}
        <mesh position={[0, boothFloorY, boothCenterZ]} material={materials.boothFloorMat}>
          <boxGeometry args={[boothChamberW, 0.18, boothDepth]} />
        </mesh>
        <mesh position={[0, boothCeilY, boothCenterZ]} material={materials.boothInteriorWallMat}>
          <boxGeometry args={[boothChamberW, 0.18, boothDepth]} />
        </mesh>
        <mesh
          position={[0, boothMidY, backZ + boothDepth - 0.1]}
          material={materials.boothInteriorWallMat}
        >
          <boxGeometry args={[boothChamberW, boothChamberH, 0.2]} />
        </mesh>
        <mesh
          position={[-boothChamberW / 2, boothMidY, boothCenterZ]}
          material={materials.boothInteriorWallMat}
        >
          <boxGeometry args={[0.2, boothChamberH, boothDepth]} />
        </mesh>
        <mesh
          position={[boothChamberW / 2, boothMidY, boothCenterZ]}
          material={materials.boothInteriorWallMat}
        >
          <boxGeometry args={[0.2, boothChamberH, boothDepth]} />
        </mesh>

        {/* Window Perimeter Acoustic Steel Bezel & Vertical Glass Mullions */}
        <mesh position={[0, winTop - 0.04, backZ - 0.12]} material={materials.trimMetalMat}>
          <boxGeometry args={[boothWinW + 0.16, 0.1, 0.36]} />
        </mesh>
        <mesh position={[0, winBot + 0.04, backZ - 0.12]} material={materials.trimMetalMat}>
          <boxGeometry args={[boothWinW + 0.16, 0.1, 0.36]} />
        </mesh>
        <mesh position={[-boothWinW / 2, winMidY, backZ - 0.12]} material={materials.trimMetalMat}>
          <boxGeometry args={[0.1, actualWinH + 0.12, 0.36]} />
        </mesh>
        <mesh position={[boothWinW / 2, winMidY, backZ - 0.12]} material={materials.trimMetalMat}>
          <boxGeometry args={[0.1, actualWinH + 0.12, 0.36]} />
        </mesh>
        {[-boothWinW * 0.24, boothWinW * 0.24].map((mx, mi) => (
          <mesh
            key={`booth-mullion-${mi}`}
            position={[mx, winMidY, backZ - 0.04]}
            material={materials.trimMetalMat}
          >
            <boxGeometry args={[0.06, actualWinH, 0.12]} />
          </mesh>
        ))}

        {/* Angled Anti-Reflective Optical Observation Glass */}
        <mesh
          position={[0, winMidY, backZ - 0.02]}
          rotation={[0.09, 0, 0]}
          material={materials.boothGlassMat}
        >
          <planeGeometry args={[boothWinW - 0.06, actualWinH - 0.06]} />
        </mesh>

        {/* Interior Overhead Projectionist Worklight Tube */}
        <mesh position={[0, boothCeilY - 0.14, boothCenterZ]}>
          <boxGeometry args={[boothChamberW * 0.62, 0.045, 0.14]} />
          <meshStandardMaterial
            color="#1e2430"
            emissive={lightingProfile.ceilingColor}
            emissiveIntensity={boothWorkLightIntensity}
            roughness={0.3}
          />
        </mesh>

        {/* Interior Left Operator Desk & Dual Monitoring Displays */}
        <group position={[-boothWinW * 0.34, boothFloorY + 0.42, backZ + 0.95]}>
          <mesh material={materials.projectorBodyMat}>
            <boxGeometry args={[1.05, 0.06, 0.65]} />
          </mesh>
          <mesh position={[0, -0.2, 0]} material={materials.trimMetalMat}>
            <boxGeometry args={[0.92, 0.34, 0.5]} />
          </mesh>
          {/* Console Monitors */}
          <mesh position={[-0.22, 0.24, -0.1]} rotation={[-0.18, 0.15, 0]}>
            <boxGeometry args={[0.36, 0.24, 0.03]} />
            <meshStandardMaterial
              color="#0b1220"
              emissive="#38bdf8"
              emissiveIntensity={0.28 + lightFactor * 0.45}
            />
          </mesh>
          <mesh position={[0.22, 0.24, -0.1]} rotation={[-0.18, -0.1, 0]}>
            <boxGeometry args={[0.34, 0.22, 0.03]} />
            <meshStandardMaterial
              color="#0b1220"
              emissive={lightingProfile.accentColor}
              emissiveIntensity={0.22 + lightFactor * 0.4}
            />
          </mesh>
        </group>

        {/* Interior Right DCP Media Server & Laser Chiller Rack */}
        <group position={[boothWinW * 0.34, boothFloorY + 0.72, backZ + 1.05]}>
          <mesh material={materials.projectorBodyMat}>
            <boxGeometry args={[0.72, 1.32, 0.65]} />
          </mesh>
          {[-0.4, -0.15, 0.1, 0.35].map((ry, ri) => (
            <group key={`rack-u-${ri}`} position={[0, ry, -0.33]}>
              <mesh material={materials.projectorChromeMat}>
                <boxGeometry args={[0.6, 0.14, 0.02]} />
              </mesh>
              <mesh position={[0.22, 0, -0.015]}>
                <boxGeometry args={[0.04, 0.025, 0.01]} />
                <meshBasicMaterial color={ri % 2 === 0 ? '#34d399' : '#38bdf8'} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Multi-Part 3D Digital Laser Cinema Projector Assembly (Centered Behind Window) */}
        <group position={[0, boothY, backZ + 0.75]}>
          {/* Floor Pedestal Column & Base Plate */}
          <mesh
            position={[0, -(boothY - boothFloorY) / 2 - 0.08, 0.15]}
            material={materials.projectorBodyMat}
          >
            <boxGeometry args={[0.36, Math.max(0.4, boothY - boothFloorY - 0.12), 0.46]} />
          </mesh>
          <mesh
            position={[0, -(boothY - boothFloorY) + 0.08, 0.15]}
            material={materials.projectorChromeMat}
          >
            <boxGeometry args={[0.68, 0.06, 0.72]} />
          </mesh>

          {/* Main Projector Chassis */}
          <mesh position={[0, 0, 0.18]} material={materials.projectorBodyMat}>
            <boxGeometry args={[0.78, 0.48, 1.12]} />
          </mesh>
          {/* Upper Thermal Cooling Shroud */}
          <mesh position={[0, 0.28, 0.2]} material={materials.projectorChromeMat}>
            <boxGeometry args={[0.64, 0.1, 0.92]} />
          </mesh>
          {/* Overhead Exhaust Duct Collar */}
          <mesh position={[0, 0.44, 0.25]} material={materials.projectorBodyMat}>
            <cylinderGeometry args={[0.14, 0.16, 0.28, 16]} />
          </mesh>
          {/* Side Intake Louvre Plates */}
          {[-0.4, 0.4].map((sx, si) => (
            <mesh key={`proj-vent-${si}`} position={[sx, 0, 0.2]} material={materials.speakerMat}>
              <boxGeometry args={[0.03, 0.34, 0.82]} />
            </mesh>
          ))}
          {/* Optical Lens Turret Flange */}
          <mesh
            position={[0, 0, -0.4]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.projectorChromeMat}
          >
            <cylinderGeometry args={[0.19, 0.21, 0.08, 24]} />
          </mesh>
          {/* Stepped Anodized Projection Lens Barrel */}
          <mesh
            position={[0, 0, -0.56]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.projectorBodyMat}
          >
            <cylinderGeometry args={[0.14, 0.16, 0.28, 24]} />
          </mesh>
          {/* Focus Ring Trim */}
          <mesh
            position={[0, 0, -0.62]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.trimMetalMat}
          >
            <cylinderGeometry args={[0.152, 0.152, 0.05, 24]} />
          </mesh>
          {/* Glowing Optical Front Projection Element */}
          <mesh position={[0, 0, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.115, 0.115, 0.02, 24]} />
            <meshStandardMaterial
              color="#c8e6ff"
              emissive="#bfe2ff"
              emissiveIntensity={lensEmissiveIntensity}
              roughness={0.05}
              metalness={0.2}
            />
          </mesh>
        </group>
      </group>

      {/* Ceiling Slab + Recessed Acoustic Baffle Strips & HVAC Return Louvers */}
      <mesh position={[0, H, 0]} receiveShadow material={materials.ceilingMat}>
        <boxGeometry args={[W, 0.4, L]} />
      </mesh>
      {[-0.22, 0.22].map((lzFactor, li) => (
        <mesh
          key={`hvac-vent-${li}`}
          position={[0, H - 0.205, L * lzFactor]}
          material={materials.speakerMat}
        >
          <boxGeometry args={[Math.min(2.6, W * 0.18), 0.03, 0.9]} />
        </mesh>
      ))}

      {/* Real Multi-Part 3D Cinema Speakers (Side/Rear Surrounds, Overhead Atmos Pods & Front Line-Array Subwoofers) */}
      <CinemaSpeakers
        config={config}
        wallBayZs={wallBayZs}
        topTierY={topTierY}
        lightFactor={lightFactor}
        speakerGrilleMap={textures.speakerGrilleMap}
        screenBounceUniforms={screenBounceUniforms}
      />

      {/* Emergency Exit Doors near Front Left & Right + Dim EXIT Sign + Red Fire Extinguisher */}
      {[-1, 1].map((side) => (
        <group
          key={`exit-${side}`}
          position={[side * (W / 2 - 0.24), 1.18, frontZ + 2.4]}
          rotation={[0, (side * -Math.PI) / 2, 0]}
        >
          <mesh material={materials.doorMat}>
            <boxGeometry args={[1.15, 2.35, 0.1]} />
          </mesh>
          <mesh position={[0, 1.42, 0.04]} material={materials.exitSignMat}>
            <planeGeometry args={[0.52, 0.2]} />
          </mesh>
          <mesh position={[side * 0.85, -0.35, 0.08]} material={materials.extinguisherMat}>
            <cylinderGeometry args={[0.075, 0.075, 0.54, 12]} />
          </mesh>
        </group>
      ))}

      {/* ===================================================================== */}
      {/* ARCHITECTURAL SIDE WALL BAYS & DISTINCT SIDE LIGHTING FIXTURES        */}
      {/* ===================================================================== */}
      {wallBayZs.map((bz, idx) =>
        [-1, 1].map((side) => {
          const sconceY =
            environmentProfile.architectureStyle === 'private'
              ? Math.min(H * 0.58, 2.55)
              : Math.min(H * 0.56, topTierY + 2.1);

          return (
            <group key={`wall-bay-${idx}-${side}`}>
              {/* Acoustic Wall Pilaster */}
              <mesh
                position={[side * (W / 2 - 0.26), H * 0.48, bz]}
                material={materials.trimMetalMat}
                castShadow
              >
                <boxGeometry args={[0.18, H * 0.88, 0.28]} />
              </mesh>

              {/* Framed Acoustic Wall Panel between Pilasters */}
              {idx < wallBayZs.length - 1 && (
                <mesh
                  position={[
                    side * (W / 2 - 0.22),
                    H * 0.52,
                    (bz + wallBayZs[idx + 1]) / 2,
                  ]}
                  material={materials.acousticPanelMat}
                  receiveShadow
                >
                  <boxGeometry
                    args={[0.08, H * 0.68, Math.abs(wallBayZs[idx + 1] - bz) - 0.6]}
                  />
                </mesh>
              )}

              {/* Style 1: Classic Sculpted Brass Wall Sconces */}
              {sideLightStyle === 'classic_sconces' && (
                <group position={[side * (W / 2 - 0.36), sconceY, bz]}>
                  <mesh material={materials.trimMetalMat}>
                    <boxGeometry args={[0.08, 0.42, 0.24]} />
                  </mesh>
                  <mesh position={[-side * 0.07, 0.06, 0]} material={materials.trimMetalMat}>
                    <cylinderGeometry args={[0.14, 0.06, 0.32, 12]} />
                  </mesh>
                  <mesh position={[-side * 0.07, 0.22, 0]}>
                    <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.wallColor}
                      emissiveIntensity={wallAccentIntensity}
                    />
                  </mesh>
                  <mesh position={[-side * 0.07, -0.14, 0]}>
                    <cylinderGeometry args={[0.07, 0.04, 0.12, 12]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.wallColor}
                      emissiveIntensity={wallAccentIntensity * 0.9}
                    />
                  </mesh>
                </group>
              )}

              {/* Style 2: Tall Vertical Architectural Light Pillars */}
              {sideLightStyle === 'vertical_pillars' && (
                <group position={[side * (W / 2 - 0.38), H * 0.5, bz]}>
                  <mesh material={materials.trimMetalMat}>
                    <boxGeometry args={[0.1, H * 0.72, 0.26]} />
                  </mesh>
                  <mesh position={[-side * 0.04, 0, 0]}>
                    <boxGeometry args={[0.05, H * 0.64, 0.11]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.wallColor}
                      emissiveIntensity={wallAccentIntensity}
                    />
                  </mesh>
                </group>
              )}

              {/* Style 3: Canted 4DX Kinetic Diagonal Blades */}
              {sideLightStyle === 'diagonal_blades' && (
                <group
                  position={[side * (W / 2 - 0.38), sconceY + 0.3, bz + 0.35]}
                  rotation={[0.48, 0, 0]}
                >
                  <mesh material={materials.trimMetalMat}>
                    <boxGeometry args={[0.16, 1.85, 0.24]} />
                  </mesh>
                  <mesh position={[-side * 0.05, 0, 0.04]}>
                    <boxGeometry args={[0.06, 1.68, 0.09]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.wallColor}
                      emissiveIntensity={wallAccentIntensity * 1.08}
                    />
                  </mesh>
                  <mesh position={[-side * 0.05, 0, -0.06]}>
                    <boxGeometry args={[0.05, 1.68, 0.05]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.accentColor}
                      emissiveIntensity={wallAccentIntensity * 0.9}
                    />
                  </mesh>
                </group>
              )}

              {/* Style 4: Sweeping Arched Wall-to-Ceiling Ribs */}
              {sideLightStyle === 'arched_ribs' && (
                <group position={[0, 0, bz]}>
                  {/* Lower vertical rib */}
                  <mesh
                    position={[side * (W / 2 - 0.34), H * 0.38, 0]}
                    material={materials.trimMetalMat}
                  >
                    <boxGeometry args={[0.14, H * 0.66, 0.24]} />
                  </mesh>
                  <mesh position={[side * (W / 2 - 0.42), H * 0.38, 0]}>
                    <boxGeometry args={[0.05, H * 0.6, 0.09]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.wallColor}
                      emissiveIntensity={wallAccentIntensity}
                    />
                  </mesh>
                  {/* Angled upper cove haunch */}
                  <mesh
                    position={[side * (W / 2 - 0.88), H - 0.85, 0]}
                    rotation={[0, 0, side * 0.68]}
                    material={materials.trimMetalMat}
                  >
                    <boxGeometry args={[0.18, 1.8, 0.24]} />
                  </mesh>
                  <mesh
                    position={[side * (W / 2 - 0.94), H - 0.9, 0]}
                    rotation={[0, 0, side * 0.68]}
                  >
                    <boxGeometry args={[0.05, 1.65, 0.09]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.accentColor}
                      emissiveIntensity={wallAccentIntensity * 0.95}
                    />
                  </mesh>
                </group>
              )}

              {/* Style 6: Minimal Boutique Gallery Wash */}
              {sideLightStyle === 'minimal_wash' && (
                <group position={[side * (W / 2 - 0.33), sconceY, bz]}>
                  <mesh material={materials.trimMetalMat}>
                    <boxGeometry args={[0.06, 0.22, 0.68]} />
                  </mesh>
                  <mesh position={[-side * 0.02, 0.08, 0]}>
                    <boxGeometry args={[0.04, 0.05, 0.56]} />
                    <meshStandardMaterial
                      color="#101218"
                      emissive={lightingProfile.wallColor}
                      emissiveIntensity={wallAccentIntensity}
                    />
                  </mesh>
                </group>
              )}

              {/* Soft Up/Down Wall Sconce Light-Wash Halo (Dims completely to 0 during playback) */}
              {lightFactor > 0.01 && (
                <mesh
                  position={[side * (W / 2 - 0.25), sconceY, bz]}
                  rotation={[0, (side * -Math.PI) / 2, 0]}
                  material={materials.sconceWashMat}
                >
                  <planeGeometry args={[1.65, 3.3]} />
                </mesh>
              )}
            </group>
          );
        }),
      )}

      {/* Style 5: Continuous Dual-Level Horizontal Coving Bands Along Left & Right Walls */}
      {sideLightStyle === 'horizontal_coving' &&
        [-1, 1].map((side) => (
          <group key={`horiz-cove-${side}`}>
            {[H * 0.36, H * 0.68].map((cy, ci) => (
              <group key={`hc-${ci}`} position={[side * (W / 2 - 0.31), cy, 0]}>
                <mesh material={materials.trimMetalMat}>
                  <boxGeometry args={[0.12, 0.14, L - 3.8]} />
                </mesh>
                <mesh position={[-side * 0.05, 0, 0]}>
                  <boxGeometry args={[0.04, 0.06, L - 4.0]} />
                  <meshStandardMaterial
                    color="#101218"
                    emissive={ci === 0 ? lightingProfile.wallColor : lightingProfile.accentColor}
                    emissiveIntensity={wallAccentIntensity}
                  />
                </mesh>
              </group>
            ))}
          </group>
        ))}

      {/* ===================================================================== */}
      {/* DISTINCT CEILING ARCHITECTURES & LIGHTING STYLES                      */}
      {/* ===================================================================== */}
      {ceilingLightStyle === 'puck_grid' &&
        ceilingLightPositions.map(([cx, cz], ci) => (
          <group key={`ceiling-puck-${ci}`} position={[cx, H - 0.21, cz]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.trimMetalMat}>
              <ringGeometry args={[0.14, 0.2, 18]} />
            </mesh>
            <mesh position={[0, -0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.14, 18]} />
              <meshStandardMaterial
                color="#0b0c10"
                emissive={lightingProfile.ceilingColor}
                emissiveIntensity={ceilingPuckIntensity}
              />
            </mesh>
          </group>
        ))}

      {ceilingLightStyle === 'coffered_beams' &&
        Array.from({ length: 5 }, (_, i) => (
          <group
            key={`coffer-${i}`}
            position={[0, H - 0.35, frontZ + 3 + i * ((L - 6) / 4)]}
          >
            <mesh material={materials.trimMetalMat}>
              <boxGeometry args={[W - 0.4, 0.34, 0.45]} />
            </mesh>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[W - 2.4, 0.04, 0.14]} />
              <meshStandardMaterial
                color="#101218"
                emissive={lightingProfile.ceilingColor}
                emissiveIntensity={wallAccentIntensity * 0.85}
              />
            </mesh>
          </group>
        ))}

      {ceilingLightStyle === 'linear_coves' &&
        [-W * 0.26, 0, W * 0.26].map((cx, i) => (
          <group key={`linear-cove-${i}`} position={[cx, H - 0.24, 0]}>
            <mesh material={materials.trimMetalMat}>
              <boxGeometry args={[0.24, 0.08, L - 3]} />
            </mesh>
            <mesh position={[0, -0.04, 0]}>
              <boxGeometry args={[0.1, 0.04, L - 3.2]} />
              <meshStandardMaterial
                color="#101218"
                emissive={i === 1 ? lightingProfile.ceilingColor : lightingProfile.accentColor}
                emissiveIntensity={wallAccentIntensity}
              />
            </mesh>
          </group>
        ))}

      {ceilingLightStyle === 'vaulted_ribs' &&
        Array.from({ length: 6 }, (_, i) => (
          <group
            key={`vault-rib-${i}`}
            position={[0, H - 0.45, frontZ + 2.5 + i * ((L - 5) / 5)]}
          >
            <mesh material={materials.trimMetalMat}>
              <boxGeometry args={[W - 0.5, 0.5, 0.35]} />
            </mesh>
            <mesh position={[0, -0.28, 0]}>
              <boxGeometry args={[W - 2.2, 0.06, 0.12]} />
              <meshStandardMaterial
                color="#0e131e"
                emissive={lightingProfile.accentColor}
                emissiveIntensity={wallAccentIntensity}
              />
            </mesh>
          </group>
        ))}

      {ceilingLightStyle === 'star_ceiling' && (
        <group>
          {starPoints.map(([sx, sz], si) => (
            <mesh key={`star-${si}`} position={[sx, H - 0.22, sz]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.045, 8]} />
              <meshStandardMaterial
                color="#090a0e"
                emissive={si % 3 === 0 ? lightingProfile.accentColor : lightingProfile.ceilingColor}
                emissiveIntensity={ceilingPuckIntensity * 1.15}
              />
            </mesh>
          ))}
        </group>
      )}

      {ceilingLightStyle === 'perimeter_halo' && (
        <group position={[0, H - 0.26, 0]}>
          {/* Floating Acoustic Cloud Panel */}
          <mesh material={materials.wallMat}>
            <boxGeometry args={[W - 2.6, 0.14, L - 3.8]} />
          </mesh>
          {/* Glowing 4-Sided Perimeter Halo Strips */}
          {[-1, 1].map((side) => (
            <mesh key={`halo-x-${side}`} position={[side * ((W - 2.6) / 2 + 0.06), 0.04, 0]}>
              <boxGeometry args={[0.08, 0.06, L - 3.6]} />
              <meshStandardMaterial
                color="#101218"
                emissive={lightingProfile.accentColor}
                emissiveIntensity={wallAccentIntensity}
              />
            </mesh>
          ))}
          {[-1, 1].map((end) => (
            <mesh key={`halo-z-${end}`} position={[0, 0.04, end * ((L - 3.8) / 2 + 0.06)]}>
              <boxGeometry args={[W - 2.4, 0.06, 0.08]} />
              <meshStandardMaterial
                color="#101218"
                emissive={lightingProfile.ceilingColor}
                emissiveIntensity={wallAccentIntensity}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 4DX Overhead Wind/Strobe Rig Truss */}
      {environmentProfile.architectureStyle === '4dx' &&
        Array.from({ length: 4 }, (_, i) => (
          <group key={`4dx-rig-${i}`} position={[0, H - 0.58, firstRowZ + i * 3.6]}>
            <mesh material={materials.trimMetalMat}>
              <boxGeometry args={[W - 2.6, 0.16, 0.2]} />
            </mesh>
            <mesh position={[0, -0.09, 0]}>
              <boxGeometry args={[W - 4.0, 0.04, 0.08]} />
              <meshStandardMaterial
                color="#0d1724"
                emissive={lightingProfile.accentColor}
                emissiveIntensity={wallAccentIntensity * 0.9}
              />
            </mesh>
          </group>
        ))}
    </group>
  );
};
