import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TheaterConfiguration } from '../../types/cinema';

interface SideWallLightingProps {
  config: TheaterConfiguration;
  wallBayZs: number[];
  topTierY: number;
  lightFactor: number;
  trimMetalMat: THREE.Material;
  acousticPanelMat: THREE.Material;
}

interface DiagonalSegmentProps {
  start: [number, number, number];
  end: [number, number, number];
  thickness: number;
  depth: number;
  material: THREE.Material;
  housingMaterial?: THREE.Material;
}

/**
 * Renders an exact architectural linear LED channel bar from 3D point A to point B
 * with optional recessed dark anodized aluminum backing profile.
 */
const ArchitecturalChannelBar: React.FC<DiagonalSegmentProps> = ({
  start,
  end,
  thickness,
  depth,
  material,
  housingMaterial,
}) => {
  const { mid, length, quaternion } = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      len > 1e-4 ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0),
    );
    return { mid: m, length: Math.max(0.05, len), quaternion: q };
  }, [start, end]);

  return (
    <group position={[mid.x, mid.y, mid.z]} quaternion={quaternion}>
      {housingMaterial && (
        <mesh material={housingMaterial}>
          <boxGeometry args={[depth * 1.45, length + thickness * 0.6, thickness * 1.9]} />
        </mesh>
      )}
      <mesh material={material}>
        <boxGeometry args={[depth, length, thickness]} />
      </mesh>
    </group>
  );
};

export const SideWallLighting: React.FC<SideWallLightingProps> = ({
  config,
  wallBayZs,
  topTierY,
  lightFactor,
  trimMetalMat,
  acousticPanelMat,
}) => {
  const {
    auditoriumWidth: W,
    auditoriumLength: L,
    auditoriumHeight: H,
    sideLightStyle,
    lightingProfile,
    environmentProfile,
  } = config;

  const isPrivate = environmentProfile.architectureStyle === 'private';

  // Shared realistic architectural fixture materials (eliminates redundant shader compilations)
  const mats = useMemo(() => {
    const channelMetalMat = new THREE.MeshStandardMaterial({
      color: '#181b22',
      roughness: 0.34,
      metalness: 0.82,
    });
    const brassHardwareMat = new THREE.MeshStandardMaterial({
      color: '#c69e4a',
      roughness: 0.24,
      metalness: 0.88,
    });
    const walnutWoodMat = new THREE.MeshStandardMaterial({
      color: '#3a2417',
      roughness: 0.56,
      metalness: 0.06,
    });
    const primaryEmitterMat = new THREE.MeshStandardMaterial({
      color: '#101218',
      emissive: lightingProfile.wallColor,
      emissiveIntensity: 1.5,
      roughness: 0.18,
      metalness: 0.05,
    });
    const secondaryEmitterMat = new THREE.MeshStandardMaterial({
      color: '#101218',
      emissive: lightingProfile.accentColor,
      emissiveIntensity: 1.3,
      roughness: 0.2,
      metalness: 0.05,
    });
    const alabasterGlassMat = new THREE.MeshStandardMaterial({
      color: '#f2e4cb',
      emissive: lightingProfile.wallColor,
      emissiveIntensity: 1.2,
      roughness: 0.42,
      metalness: 0.02,
    });

    return {
      channelMetalMat,
      brassHardwareMat,
      walnutWoodMat,
      primaryEmitterMat,
      secondaryEmitterMat,
      alabasterGlassMat,
    };
  }, [lightingProfile.wallColor, lightingProfile.accentColor]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  // Smooth dim control (house lighting off cleanly while movie plays)
  const wallAccentIntensity = lightFactor * 1.65;
  mats.primaryEmitterMat.emissiveIntensity = wallAccentIntensity;
  mats.secondaryEmitterMat.emissiveIntensity = wallAccentIntensity * 0.9;
  mats.alabasterGlassMat.emissiveIntensity = wallAccentIntensity * 0.95;

  const sconceY = isPrivate ? Math.min(H * 0.58, 2.55) : Math.min(H * 0.56, topTierY + 2.05);
  const wallInnerX = W / 2 - 0.22;

  // Continuous crisscross geometric LED lattice coordinates inspired by architectural cinema halls
  const crisscrossSegments = useMemo(() => {
    if (sideLightStyle !== 'crisscross_geometric') return [];
    const wx = W / 2 - 0.245;
    const ceilY = H - 0.225;
    const floorY = 0.04;
    const zFront = -L * 0.42;
    const zMid1 = -L * 0.16;
    const zMid2 = L * 0.12;
    const zBack = L * 0.4;

    const segs: { start: [number, number, number]; end: [number, number, number]; accent?: boolean }[] = [];

    [-1, 1].forEach((side) => {
      const sx = side * wx;
      const ceilInX = side * (W * 0.16);
      const floorInX = side * (W * 0.36);

      // Floor perimeter architectural channels
      segs.push({ start: [sx, floorY, zFront], end: [sx, floorY, zBack] });
      segs.push({ start: [floorInX, floorY, zFront], end: [floorInX, floorY, zBack], accent: true });
      segs.push({ start: [sx, floorY, zFront], end: [floorInX, floorY, zFront + 1.8] });
      segs.push({ start: [sx, floorY, zBack], end: [floorInX, floorY, zBack - 1.4] });

      // Bold crisscrossing wall-to-ceiling diagonal channels across acoustic matte walls
      segs.push({ start: [sx, floorY, zBack], end: [sx, ceilY, zMid2] });
      segs.push({ start: [sx, floorY, zMid2 - 0.4], end: [sx, ceilY, zBack - 0.6] });

      segs.push({ start: [sx, floorY, zMid2 + 1.1], end: [sx, ceilY, zMid1 - 0.6] });
      segs.push({ start: [sx, floorY, zMid1 - 1.2], end: [sx, ceilY, zMid2 + 0.5] });

      segs.push({ start: [sx, floorY, zMid1 + 0.4], end: [sx, ceilY, zFront + 0.9] });
      segs.push({ start: [sx, floorY, zFront], end: [sx, ceilY, zMid1 + 0.2] });

      // Ceiling continuation lines tying left & right wall diagonals across the dark ceiling plane
      segs.push({ start: [sx, ceilY, zBack - 0.6], end: [ceilInX, ceilY, zMid1], accent: true });
      segs.push({ start: [sx, ceilY, zMid2], end: [-side * W * 0.12, ceilY, zMid1 - 1.2] });
      segs.push({ start: [sx, ceilY, zFront + 0.9], end: [ceilInX, ceilY, zMid1 - 1.4] });
    });

    // Cross-hall ceiling connector ribs bridging left/right architectural channels
    segs.push({ start: [-wx, ceilY, zFront + 0.9], end: [wx, ceilY, zMid1 - 1.4] });
    segs.push({ start: [wx, ceilY, zFront + 0.9], end: [-wx, ceilY, zMid1 - 1.4] });

    return segs;
  }, [sideLightStyle, W, L, H]);

  return (
    <group>
      {/* Standard Acoustic Pilasters & Framed Wall Panels (skipped on crisscross & tiered strip styles for clean architectural canvas) */}
      {sideLightStyle !== 'crisscross_geometric' &&
        sideLightStyle !== 'horizon_tier_strips' &&
        wallBayZs.map((bz, idx) =>
          [-1, 1].map((side) => (
            <group key={`wall-bay-${idx}-${side}`}>
              {/* Architectural Acoustic Pilaster */}
              <mesh
                position={[side * (W / 2 - 0.25), H * 0.49, bz]}
                material={trimMetalMat}
                castShadow
              >
                <boxGeometry args={[0.14, H * 0.88, 0.24]} />
              </mesh>

              {/* Framed Fabric Acoustic Wall Tile between Pilasters */}
              {idx < wallBayZs.length - 1 && (
                <group
                  position={[
                    side * (W / 2 - 0.215),
                    H * 0.52,
                    (bz + wallBayZs[idx + 1]) / 2,
                  ]}
                >
                  <mesh material={acousticPanelMat} receiveShadow>
                    <boxGeometry
                      args={[0.07, H * 0.68, Math.max(0.4, Math.abs(wallBayZs[idx + 1] - bz) - 0.56)]}
                    />
                  </mesh>
                  {/* Beveled acoustic frame trim */}
                  <mesh position={[-side * 0.036, 0, 0]} material={mats.channelMetalMat}>
                    <boxGeometry
                      args={[0.014, H * 0.64, Math.max(0.32, Math.abs(wallBayZs[idx + 1] - bz) - 0.68)]}
                    />
                  </mesh>
                </group>
              )}
            </group>
          )),
        )}

      {/* Flush Matte Acoustic Bays + Crisscross Continuous Geometric LED Channels */}
      {sideLightStyle === 'crisscross_geometric' && (
        <group>
          {wallBayZs.slice(0, -1).map((bz, idx) =>
            [-1, 1].map((side) => (
              <mesh
                key={`mat-bay-${idx}-${side}`}
                position={[
                  side * (W / 2 - 0.21),
                  H * 0.5,
                  (bz + wallBayZs[idx + 1]) / 2,
                ]}
                material={acousticPanelMat}
                receiveShadow
              >
                <boxGeometry
                  args={[0.05, H * 0.84, Math.max(0.4, Math.abs(wallBayZs[idx + 1] - bz) - 0.14)]}
                />
              </mesh>
            )),
          )}
          {crisscrossSegments.map((seg, i) => (
            <ArchitecturalChannelBar
              key={`crisscross-${i}`}
              start={seg.start}
              end={seg.end}
              thickness={0.055}
              depth={0.042}
              material={seg.accent ? mats.secondaryEmitterMat : mats.primaryEmitterMat}
              housingMaterial={mats.channelMetalMat}
            />
          ))}
        </group>
      )}

      {/* ===================================================================== */}
      {/* BAY-MOUNTED BESPOKE ARCHITECTURAL SIDE LIGHT DESIGNS (14 MORE STYLES) */}
      {/* ===================================================================== */}
      {sideLightStyle !== 'crisscross_geometric' &&
        sideLightStyle !== 'horizon_tier_strips' &&
        wallBayZs.map((bz, idx) =>
          [-1, 1].map((side) => {
            const xBase = side * (wallInnerX - 0.08);
            const inDir = -side; // points inward into the auditorium

            return (
              <group key={`fixture-${idx}-${side}`}>
                {/* 1. Standard 2D — Grand Crimson Palace: Sculpted Twin-Arm Fluted Brass Torchiere Sconce */}
                {sideLightStyle === 'brass_torchieres' && (
                  <group position={[xBase, sconceY, bz]}>
                    {/* Ornate Stepped Brass Wall Backplate */}
                    <mesh material={mats.brassHardwareMat}>
                      <boxGeometry args={[0.05, 0.72, 0.26]} />
                    </mesh>
                    <mesh position={[inDir * 0.03, 0, 0]} material={mats.channelMetalMat}>
                      <boxGeometry args={[0.03, 0.56, 0.18]} />
                    </mesh>
                    {/* Twin Brass Sconce Arms + Frosted Alabaster Diffuser Bowls */}
                    {[-0.14, 0.14].map((az, ai) => (
                      <group key={`arm-${ai}`} position={[inDir * 0.11, -0.02, az]}>
                        <mesh material={mats.brassHardwareMat}>
                          <boxGeometry args={[0.16, 0.035, 0.035]} />
                        </mesh>
                        <mesh position={[inDir * 0.06, 0.08, 0]} material={mats.brassHardwareMat}>
                          <cylinderGeometry args={[0.075, 0.035, 0.11, 14]} />
                        </mesh>
                        <mesh position={[inDir * 0.06, 0.21, 0]} material={mats.alabasterGlassMat}>
                          <cylinderGeometry args={[0.085, 0.055, 0.2, 16]} />
                        </mesh>
                        <mesh
                          position={[inDir * 0.06, 0.31, 0]}
                          rotation={[-Math.PI / 2, 0, 0]}
                          material={mats.brassHardwareMat}
                        >
                          <ringGeometry args={[0.055, 0.088, 16]} />
                        </mesh>
                      </group>
                    ))}
                  </group>
                )}

                {/* 2. Standard 2D Emerald — Emerald Art Deco Hall: 3-Tier Stepped Ziggurat Art Deco Fin */}
                {sideLightStyle === 'art_deco_stepped_fins' && (
                  <group position={[xBase, H * 0.5, bz]}>
                    {/* Outer Stepped Brass & Charcoal Ziggurat Chassis */}
                    <mesh material={mats.channelMetalMat}>
                      <boxGeometry args={[0.08, H * 0.74, 0.52]} />
                    </mesh>
                    <mesh position={[inDir * 0.045, 0, 0]} material={mats.brassHardwareMat}>
                      <boxGeometry args={[0.05, H * 0.62, 0.36]} />
                    </mesh>
                    <mesh position={[inDir * 0.08, 0, 0]} material={mats.channelMetalMat}>
                      <boxGeometry args={[0.05, H * 0.5, 0.2]} />
                    </mesh>
                    {/* Three Tiered Indirect Side-Light Diffuser Channels */}
                    <mesh position={[inDir * 0.025, 0, 0.21]} material={mats.primaryEmitterMat}>
                      <boxGeometry args={[0.03, H * 0.7, 0.035]} />
                    </mesh>
                    <mesh position={[inDir * 0.025, 0, -0.21]} material={mats.primaryEmitterMat}>
                      <boxGeometry args={[0.03, H * 0.7, 0.035]} />
                    </mesh>
                    <mesh position={[inDir * 0.065, 0, 0.13]} material={mats.secondaryEmitterMat}>
                      <boxGeometry args={[0.025, H * 0.58, 0.03]} />
                    </mesh>
                    <mesh position={[inDir * 0.065, 0, -0.13]} material={mats.secondaryEmitterMat}>
                      <boxGeometry args={[0.025, H * 0.58, 0.03]} />
                    </mesh>
                    {/* Crown Sunburst Finials */}
                    <mesh position={[inDir * 0.05, H * 0.34, 0]} material={mats.brassHardwareMat}>
                      <boxGeometry args={[0.09, 0.08, 0.44]} />
                    </mesh>
                  </group>
                )}

                {/* 4. IMAX Cobalt — IMAX Cobalt Horizon: Monumental Twin-Slotted Anodized Steel Monolith Totem */}
                {sideLightStyle === 'monolith_totems' && (
                  <group position={[xBase, H * 0.49, bz]}>
                    {/* Broad Architectural Acoustic Baffle Wing */}
                    <mesh material={mats.channelMetalMat}>
                      <boxGeometry args={[0.14, H * 0.82, 0.68]} />
                    </mesh>
                    {/* Twin Slotted Recessed Knife-Edge Diffuser Reveals */}
                    {[-0.18, 0.18].map((tz, ti) => (
                      <group key={`slot-${ti}`} position={[inDir * 0.06, 0, tz]}>
                        <mesh material={mats.primaryEmitterMat}>
                          <boxGeometry args={[0.04, H * 0.76, 0.06]} />
                        </mesh>
                        <mesh position={[inDir * 0.035, 0, 0]} material={trimMetalMat}>
                          <boxGeometry args={[0.03, H * 0.78, 0.03]} />
                        </mesh>
                      </group>
                    ))}
                    {/* Central Horizontal Telemetry Cross-Braces */}
                    {[-H * 0.24, 0, H * 0.24].map((cy, ci) => (
                      <mesh key={`brace-${ci}`} position={[inDir * 0.075, cy, 0]} material={trimMetalMat}>
                        <boxGeometry args={[0.04, 0.09, 0.62]} />
                      </mesh>
                    ))}
                  </group>
                )}

                {/* 5. IMAX Aurora — IMAX Polar Aurora: Cantilevered Sculpted Wave-Rib Arch */}
                {sideLightStyle === 'aurora_ribbon_waves' && (
                  <group position={[0, 0, bz]}>
                    {/* Lower Vertical Rib Segment */}
                    <mesh position={[side * (W / 2 - 0.31), H * 0.27, 0]} material={mats.channelMetalMat}>
                      <boxGeometry args={[0.16, H * 0.44, 0.28]} />
                    </mesh>
                    <mesh position={[side * (W / 2 - 0.4), H * 0.27, 0]} material={mats.primaryEmitterMat}>
                      <boxGeometry args={[0.045, H * 0.4, 0.09]} />
                    </mesh>
                    {/* Mid Cantilevered Angled Facet */}
                    <mesh
                      position={[side * (W / 2 - 0.56), H * 0.61, 0]}
                      rotation={[0, 0, side * 0.36]}
                      material={mats.channelMetalMat}
                    >
                      <boxGeometry args={[0.16, H * 0.32, 0.26]} />
                    </mesh>
                    <mesh
                      position={[side * (W / 2 - 0.64), H * 0.6, 0]}
                      rotation={[0, 0, side * 0.36]}
                      material={mats.secondaryEmitterMat}
                    >
                      <boxGeometry args={[0.045, H * 0.29, 0.085]} />
                    </mesh>
                    {/* Upper Sweeping Haunch Connecting Toward Ceiling Coves */}
                    <mesh
                      position={[side * (W / 2 - 1.25), H - 0.75, 0]}
                      rotation={[0, 0, side * 0.88]}
                      material={mats.channelMetalMat}
                    >
                      <boxGeometry args={[0.16, 1.85, 0.24]} />
                    </mesh>
                    <mesh
                      position={[side * (W / 2 - 1.3), H - 0.82, 0]}
                      rotation={[0, 0, side * 0.88]}
                      material={mats.primaryEmitterMat}
                    >
                      <boxGeometry args={[0.04, 1.72, 0.08]} />
                    </mesh>
                  </group>
                )}

                {/* 7. 4DX Thunder — Kinetic V-Chevron Dual-Color Aerodynamic Fin */}
                {sideLightStyle === 'kinetic_chevron_blades' && (
                  <group position={[xBase, sconceY + 0.15, bz]}>
                    {/* Upper Swept Blade Wing */}
                    <group position={[inDir * 0.04, 0.62, 0.18]} rotation={[0.56, 0, 0]}>
                      <mesh material={mats.channelMetalMat}>
                        <boxGeometry args={[0.15, 1.45, 0.22]} />
                      </mesh>
                      <mesh position={[inDir * 0.065, 0, 0.04]} material={mats.primaryEmitterMat}>
                        <boxGeometry args={[0.04, 1.32, 0.06]} />
                      </mesh>
                    </group>
                    {/* Lower Counter-Swept Blade Wing forming V-Chevron */}
                    <group position={[inDir * 0.04, -0.62, 0.18]} rotation={[-0.56, 0, 0]}>
                      <mesh material={mats.channelMetalMat}>
                        <boxGeometry args={[0.15, 1.45, 0.22]} />
                      </mesh>
                      <mesh position={[inDir * 0.065, 0, -0.04]} material={mats.secondaryEmitterMat}>
                        <boxGeometry args={[0.04, 1.32, 0.06]} />
                      </mesh>
                    </group>
                    {/* Center Machined Pivot Hub */}
                    <mesh position={[inDir * 0.09, 0, -0.25]} material={trimMetalMat}>
                      <boxGeometry args={[0.14, 0.28, 0.28]} />
                    </mesh>
                  </group>
                )}

                {/* 8. 4DX Crimson Velocity — Triple-Raked Motorsport Carbon Light Pod */}
                {sideLightStyle === 'velocity_racing_stripes' && (
                  <group position={[xBase, sconceY + 0.1, bz]} rotation={[0.32, 0, 0]}>
                    {/* Angled Carbon-Anodized Pod Chassis */}
                    <mesh material={mats.channelMetalMat}>
                      <boxGeometry args={[0.12, 2.25, 0.56]} />
                    </mesh>
                    {/* Three Parallel High-Speed Light Channels */}
                    {[-0.16, 0, 0.16].map((sz, si) => (
                      <mesh
                        key={`stripe-${si}`}
                        position={[inDir * 0.055, 0, sz]}
                        material={si === 1 ? mats.secondaryEmitterMat : mats.primaryEmitterMat}
                      >
                        <boxGeometry args={[0.04, 2.04 - Math.abs(si - 1) * 0.22, 0.055]} />
                      </mesh>
                    ))}
                  </group>
                )}

                {/* 9. 4DX Arctic Storm — Faceted Diamond-Hex Crystalline Frame */}
                {sideLightStyle === 'glacier_hex_matrix' && (
                  <group position={[xBase, sconceY + 0.1, bz]}>
                    {/* Backing Dark Acoustic Diamond Core */}
                    <mesh rotation={[Math.PI / 4, 0, 0]} material={mats.channelMetalMat}>
                      <boxGeometry args={[0.09, 1.28, 1.28]} />
                    </mesh>
                    {/* Glowing Edge-Lit Diamond Perimeter Frame */}
                    <mesh
                      position={[inDir * 0.045, 0, 0]}
                      rotation={[Math.PI / 4, 0, 0]}
                      material={mats.primaryEmitterMat}
                    >
                      <boxGeometry args={[0.035, 1.18, 1.18]} />
                    </mesh>
                    {/* Raised Dark Faceted Acoustic Inner Shield leaving Crisp Edge Halo */}
                    <mesh
                      position={[inDir * 0.065, 0, 0]}
                      rotation={[Math.PI / 4, 0, 0]}
                      material={acousticPanelMat}
                    >
                      <boxGeometry args={[0.04, 0.98, 0.98]} />
                    </mesh>
                    {/* Horizontal Central Glacier Crossbar */}
                    <mesh position={[inDir * 0.088, 0, 0]} material={mats.secondaryEmitterMat}>
                      <boxGeometry args={[0.025, 0.04, 0.85]} />
                    </mesh>
                  </group>
                )}

                {/* 10. Dolby Obsidian — Knife-Edge Slotted Vertical Acoustic Timber/Obsidian Louver Grazers */}
                {sideLightStyle === 'obsidian_slat_grazers' && (
                  <group position={[xBase, H * 0.5, bz]}>
                    {/* Deep Matte Wall Baffle Box */}
                    <mesh material={mats.channelMetalMat}>
                      <boxGeometry args={[0.08, H * 0.72, 0.78]} />
                    </mesh>
                    {/* Hidden Indirect Rear-Facing Knife-Edge Champagne Strips */}
                    {[-0.2, 0.2].map((gz, gi) => (
                      <mesh
                        key={`graze-${gi}`}
                        position={[inDir * 0.03, 0, gz]}
                        material={mats.primaryEmitterMat}
                      >
                        <boxGeometry args={[0.025, H * 0.66, 0.08]} />
                      </mesh>
                    ))}
                    {/* 5 Vertical Dark Acoustic Privacy Louvers Blocking Direct Bulb Glare */}
                    {[-0.3, -0.15, 0, 0.15, 0.3].map((lz, li) => (
                      <mesh
                        key={`louver-${li}`}
                        position={[inDir * 0.075, 0, lz]}
                        rotation={[0, inDir * 0.35, 0]}
                        material={acousticPanelMat}
                      >
                        <boxGeometry args={[0.09, H * 0.7, 0.04]} />
                      </mesh>
                    ))}
                  </group>
                )}

                {/* 11. Dolby Cobalt Noir — Precision Staggered Twin Parabolic Cobalt Ribs */}
                {sideLightStyle === 'diagonal_parabolic_ribs' && (
                  <group position={[xBase, sconceY + 0.15, bz]}>
                    {/* Two Staggered Parabolic Angled Slats per Bay */}
                    {[-0.2, 0.2].map((oz, oi) => (
                      <group
                        key={`parab-${oi}`}
                        position={[inDir * (0.04 + oi * 0.03), oi === 0 ? 0.24 : -0.24, oz]}
                        rotation={[-0.42, 0, 0]}
                      >
                        <mesh material={mats.channelMetalMat}>
                          <boxGeometry args={[0.1, 1.9, 0.16]} />
                        </mesh>
                        <mesh
                          position={[inDir * 0.045, 0, 0]}
                          material={oi === 0 ? mats.primaryEmitterMat : mats.secondaryEmitterMat}
                        >
                          <boxGeometry args={[0.035, 1.78, 0.06]} />
                        </mesh>
                      </group>
                    ))}
                  </group>
                )}

                {/* 12. Dolby Noir Bordeaux — Alternating Cantilevered Rose-Gold Shelf Coves */}
                {sideLightStyle === 'tiered_cantilever_shelves' && (
                  <group position={[xBase, sconceY + (idx % 2 === 0 ? 0.45 : -0.35), bz]}>
                    {/* Wide Architectural Acoustic Shelf Hood */}
                    <mesh material={mats.channelMetalMat}>
                      <boxGeometry args={[0.24, 0.14, 1.65]} />
                    </mesh>
                    {/* Brushed Metal Under-Trim */}
                    <mesh position={[inDir * 0.04, 0.075, 0]} material={trimMetalMat}>
                      <boxGeometry args={[0.26, 0.025, 1.68]} />
                    </mesh>
                    {/* Indirect Up-Wash + Down-Wash Diffuser Lenses */}
                    <mesh position={[inDir * 0.06, 0.095, 0]} material={mats.primaryEmitterMat}>
                      <boxGeometry args={[0.12, 0.03, 1.48]} />
                    </mesh>
                    <mesh position={[inDir * 0.06, -0.08, 0]} material={mats.secondaryEmitterMat}>
                      <boxGeometry args={[0.1, 0.025, 1.48]} />
                    </mesh>
                  </group>
                )}

                {/* 13. Private Walnut Reserve — Carved Walnut & Brushed-Brass Alabaster Lantern */}
                {sideLightStyle === 'walnut_alabaster_lanterns' && (
                  <group position={[xBase, sconceY, bz]}>
                    {/* Carved Walnut Architectural Backboard */}
                    <mesh material={mats.walnutWoodMat}>
                      <boxGeometry args={[0.06, 0.92, 0.44]} />
                    </mesh>
                    {/* Glowing Frosted Alabaster Cylinder Core */}
                    <mesh position={[inDir * 0.11, 0, 0]} material={mats.alabasterGlassMat}>
                      <cylinderGeometry args={[0.11, 0.11, 0.62, 18]} />
                    </mesh>
                    {/* Precision Brushed-Brass Lantern Cage Ribs & End Caps */}
                    <mesh position={[inDir * 0.11, 0.33, 0]} material={mats.brassHardwareMat}>
                      <boxGeometry args={[0.26, 0.05, 0.28]} />
                    </mesh>
                    <mesh position={[inDir * 0.11, -0.33, 0]} material={mats.brassHardwareMat}>
                      <boxGeometry args={[0.26, 0.05, 0.28]} />
                    </mesh>
                    {[-0.12, 0.12].map((rz, ri) => (
                      <mesh
                        key={`cage-${ri}`}
                        position={[inDir * 0.21, 0, rz]}
                        material={mats.brassHardwareMat}
                      >
                        <boxGeometry args={[0.025, 0.64, 0.025]} />
                      </mesh>
                    ))}
                  </group>
                )}

                {/* 14. Private Champagne Lounge — Backlit Circular Brass Halo Medallion Alcove */}
                {sideLightStyle === 'floating_halo_alcoves' && (
                  <group position={[xBase, sconceY, bz]}>
                    {/* Framed Smoked-Oak Wall Alcove Recess */}
                    <mesh material={mats.walnutWoodMat}>
                      <boxGeometry args={[0.06, 1.24, 1.24]} />
                    </mesh>
                    {/* Recessed Halo Emitter Ring */}
                    <mesh
                      position={[inDir * 0.045, 0, 0]}
                      rotation={[0, (inDir * Math.PI) / 2, 0]}
                      material={mats.primaryEmitterMat}
                    >
                      <torusGeometry args={[0.38, 0.042, 12, 32]} />
                    </mesh>
                    {/* Floating Outer Brushed-Brass Disc Shield */}
                    <mesh
                      position={[inDir * 0.085, 0, 0]}
                      rotation={[0, 0, Math.PI / 2]}
                      material={mats.brassHardwareMat}
                    >
                      <cylinderGeometry args={[0.33, 0.33, 0.04, 28]} />
                    </mesh>
                    {/* Dark Velvet Acoustic Center Inlay */}
                    <mesh
                      position={[inDir * 0.11, 0, 0]}
                      rotation={[0, 0, Math.PI / 2]}
                      material={acousticPanelMat}
                    >
                      <cylinderGeometry args={[0.26, 0.26, 0.02, 28]} />
                    </mesh>
                  </group>
                )}

                {/* 15. Private Midnight Suite — Herringbone Acoustic Louver Rose-Amber Column */}
                {sideLightStyle === 'chevron_louver_columns' && (
                  <group position={[xBase, sconceY + 0.05, bz]}>
                    <mesh material={mats.channelMetalMat}>
                      <boxGeometry args={[0.08, 2.35, 0.56]} />
                    </mesh>
                    {/* Concealed Warm Rose-Amber Indirect Spine */}
                    <mesh position={[inDir * 0.04, 0, 0]} material={mats.primaryEmitterMat}>
                      <boxGeometry args={[0.03, 2.18, 0.14]} />
                    </mesh>
                    {/* 6 Precision Angled Brass Chevron Louver Blades */}
                    {[-0.85, -0.51, -0.17, 0.17, 0.51, 0.85].map((ly, li) => (
                      <group key={`her-${li}`} position={[inDir * 0.085, ly, 0]}>
                        <mesh rotation={[0.38, 0, 0]} position={[0, 0, 0.12]} material={mats.brassHardwareMat}>
                          <boxGeometry args={[0.05, 0.04, 0.28]} />
                        </mesh>
                        <mesh rotation={[-0.38, 0, 0]} position={[0, 0, -0.12]} material={mats.brassHardwareMat}>
                          <boxGeometry args={[0.05, 0.04, 0.28]} />
                        </mesh>
                      </group>
                    ))}
                  </group>
                )}
              </group>
            );
          }),
        )}

      {/* 6. IMAX Obsidian Amber — Continuous Triple-Tier Brushed-Bronze Horizontal Architectural Light Shelves */}
      {sideLightStyle === 'horizon_tier_strips' &&
        [-1, 1].map((side) => {
          const xWall = side * (wallInnerX - 0.07);
          const inDir = -side;
          const shelfLen = L - 3.6;
          return (
            <group key={`horizon-shelves-${side}`}>
              {[H * 0.28, H * 0.52, H * 0.74].map((sy, si) => (
                <group key={`shelf-${si}`} position={[xWall, sy, 0]}>
                  {/* Structural Extruded Aluminum & Bronze Baffle */}
                  <mesh material={mats.channelMetalMat}>
                    <boxGeometry args={[0.16, 0.18, shelfLen]} />
                  </mesh>
                  {/* Angled Glare Shield Hood */}
                  <mesh position={[inDir * 0.09, 0.06, 0]} material={mats.brassHardwareMat}>
                    <boxGeometry args={[0.06, 0.05, shelfLen]} />
                  </mesh>
                  {/* Recessed Indirect Diffuser Strip */}
                  <mesh
                    position={[inDir * 0.055, -0.02, 0]}
                    material={si === 1 ? mats.secondaryEmitterMat : mats.primaryEmitterMat}
                  >
                    <boxGeometry args={[0.045, 0.06, shelfLen - 0.2]} />
                  </mesh>
                </group>
              ))}
            </group>
          );
        })}
    </group>
  );
};
