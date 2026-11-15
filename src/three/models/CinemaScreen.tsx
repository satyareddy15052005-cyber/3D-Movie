import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  ScreenFramingMode,
  ShowState,
  TheaterConfiguration,
} from '../../types/cinema';
import { createStandbyScreenTexture } from '../materials/proceduralTextures';
import { ScreenBounceUniforms } from '../lighting/screenBounceShader';
import { isMobileDevice } from '../../utils/formatters';

export interface ScreenBounceSample {
  r: number;
  g: number;
  b: number;
  luminance: number;
}

interface CinemaScreenProps {
  config: TheaterConfiguration;
  videoElementA: HTMLVideoElement | null;
  videoElementB: HTMLVideoElement | null;
  activeDeck: 'A' | 'B';
  videoAspectRatio: number;
  screenFraming: ScreenFramingMode;
  showState: ShowState;
  isPaused?: boolean;
  isSoftwareGl?: boolean;
  screenBrightnessRef: React.MutableRefObject<number>;
  screenBounceRef?: React.MutableRefObject<ScreenBounceSample>;
  screenBounceUniforms?: ScreenBounceUniforms;
  lightFactor?: number;
  screenReflectionBrightness?: number;
}

/**
 * Builds a cylindrical arc screen geometry facing +Z (toward the audience).
 * UV coordinates run 0..1 left-to-right from the audience's perspective.
 */
function buildCurvedScreenGeometry(
  width: number,
  height: number,
  arcAngle: number,
  segmentsX = 48,
  segmentsY = 12,
): THREE.BufferGeometry {
  if (arcAngle <= 0.01) {
    return new THREE.PlaneGeometry(width, height, 4, 4);
  }

  const radius = width / arcAngle;
  const geom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const y = (v - 0.5) * height;
    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const theta = (u - 0.5) * arcAngle;
      const x = Math.sin(theta) * radius;
      const z = radius - Math.cos(theta) * radius;
      positions.push(x, y, z);
      normals.push(-Math.sin(theta), 0, Math.cos(theta));
      uvs.push(u, v);
    }
  }

  const rowStride = segmentsX + 1;
  for (let iy = 0; iy < segmentsY; iy++) {
    for (let ix = 0; ix < segmentsX; ix++) {
      const a = iy * rowStride + ix;
      const b = a + 1;
      const c = (iy + 1) * rowStride + ix;
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

/**
 * Builds a realistic 3D rectangular volumetric projector beam frustum from the
 * projection booth lens directly to the four edges of the cinema screen.
 * Each vertex carries the corresponding screen UV so the volumetric rays match
 * the exact real-time video frame with zero randomness.
 */
function buildProjectorFrustumGeometry(
  lensPos: [number, number, number],
  screenPos: [number, number, number],
  screenWidth: number,
  screenHeight: number,
  innerScale = 1.0,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const beamTs: number[] = [];
  const indices: number[] = [];

  const lensHalfW = 0.19 * innerScale;
  const lensHalfH = 0.11 * innerScale;
  const scrHalfW = (screenWidth * 0.5) * innerScale;
  const scrHalfH = (screenHeight * 0.5) * innerScale;

  // 4 corners in CCW order looking from audience toward screen:
  // 0: Bottom-Left (u=0,v=0), 1: Bottom-Right (u=1,v=0), 2: Top-Right (u=1,v=1), 3: Top-Left (u=0,v=1)
  const cornerSigns: [number, number, number, number][] = [
    [-1, -1, 0, 0],
    [1, -1, 1, 0],
    [1, 1, 1, 1],
    [-1, 1, 0, 1],
  ];

  const lengthSegs = 8;
  const sideSubdivs = 4;

  // Build 4 smooth frustum side panels (Bottom, Right, Top, Left)
  for (let side = 0; side < 4; side++) {
    const c0 = cornerSigns[side];
    const c1 = cornerSigns[(side + 1) % 4];
    const baseVertex = positions.length / 3;

    for (let it = 0; it <= lengthSegs; it++) {
      const t = it / lengthSegs;
      for (let is = 0; is <= sideSubdivs; is++) {
        const s = is / sideSubdivs;
        const sxSign = THREE.MathUtils.lerp(c0[0], c1[0], s);
        const sySign = THREE.MathUtils.lerp(c0[1], c1[1], s);
        const u = THREE.MathUtils.lerp(c0[2], c1[2], s);
        const v = THREE.MathUtils.lerp(c0[3], c1[3], s);

        const lx = lensPos[0] + sxSign * lensHalfW;
        const ly = lensPos[1] + sySign * lensHalfH;
        const lz = lensPos[2];

        const fx = screenPos[0] + sxSign * scrHalfW;
        const fy = screenPos[1] + sySign * scrHalfH;
        const fz = screenPos[2] + 0.04;

        positions.push(
          THREE.MathUtils.lerp(lx, fx, t),
          THREE.MathUtils.lerp(ly, fy, t),
          THREE.MathUtils.lerp(lz, fz, t),
        );
        uvs.push(u, v);
        beamTs.push(t);
      }
    }

    const stride = sideSubdivs + 1;
    for (let it = 0; it < lengthSegs; it++) {
      for (let is = 0; is < sideSubdivs; is++) {
        const a = baseVertex + it * stride + is;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }
  }

  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute('aBeamT', new THREE.Float32BufferAttribute(beamTs, 1));
  geom.computeVertexNormals();
  return geom;
}

export const CinemaScreen: React.FC<CinemaScreenProps> = ({
  config,
  videoElementA,
  videoElementB,
  activeDeck,
  videoAspectRatio,
  screenFraming,
  showState,
  isPaused = false,
  isSoftwareGl = false,
  screenBrightnessRef,
  screenBounceRef,
  screenBounceUniforms,
  lightFactor = 1,
  screenReflectionBrightness = 1,
}) => {
  const {
    screenWidth,
    screenHeight,
    screenCurvature,
    screenPosition,
    theaterName,
    auditoriumLength,
    auditoriumHeight,
    seatingRows,
    rowElevationStep,
    lightingProfile,
  } = config;

  const surfaceMeshRef = useRef<THREE.Mesh>(null);
  const shaderMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const outerBeamMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const innerBeamMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const lensFlareMatRef = useRef<THREE.ShaderMaterial | null>(null);

  const texARef = useRef<THREE.VideoTexture | null>(null);
  const texBRef = useRef<THREE.VideoTexture | null>(null);

  const lastVideoTimeRef = useRef(-1);
  const lastDecodedFramesRef = useRef(-1);
  const lastActiveTexRef = useRef<THREE.Texture | null>(null);
  const lastUploadMsRef = useRef(0);
  const lastSamplerMsRef = useRef(0);
  const lastSamplerTexRef = useRef<THREE.Texture | null>(null);
  const uploadedDeckRef = useRef<{ A: boolean; B: boolean }>({ A: false, B: false });
  const currentBounceGainRef = useRef(0);
  const isMobile = useMemo(() => isMobileDevice(), []);

  const standbyTexture = useMemo(
    () => createStandbyScreenTexture(theaterName),
    [theaterName],
  );

  useEffect(() => {
    return () => {
      standbyTexture.dispose();
    };
  }, [standbyTexture]);

  // Reset frame-upload cache on fullscreen/resize so the next render always uploads fresh video pixels
  useEffect(() => {
    const invalidateUpload = () => {
      lastVideoTimeRef.current = -1;
      lastDecodedFramesRef.current = -1;
      lastUploadMsRef.current = 0;
      lastSamplerMsRef.current = 0;
    };
    document.addEventListener('fullscreenchange', invalidateUpload);
    window.addEventListener('resize', invalidateUpload);
    return () => {
      document.removeEventListener('fullscreenchange', invalidateUpload);
      window.removeEventListener('resize', invalidateUpload);
    };
  }, []);

  // Tiny 32x18 GPU RenderTarget + 9-tap filtered downsample pass for zero-stall real-time video reflections
  const gpuLightSampler = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(32, 18, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: standbyTexture },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uIsVideo: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform vec2 uRepeat;
        uniform vec2 uOffset;
        uniform float uIsVideo;

        vec3 srgbToLinear(vec3 c) {
          vec3 safeC = max(c, vec3(1e-4));
          vec3 lo = c / 12.92;
          vec3 hi = pow((safeC + 0.055) / 1.055, vec3(2.4));
          return mix(lo, hi, step(vec3(0.04045), c));
        }

        vec3 sampleScreen(vec2 uvCoord) {
          vec2 mapped = clamp(uvCoord * uRepeat + uOffset, 0.002, 0.998);
          vec3 col = texture2D(uMap, mapped).rgb;
          return uIsVideo > 0.5 ? srgbToLinear(col) : col;
        }

        void main() {
          // 9-tap box blur across each screen cell for silky area-light irradiance
          vec2 stepUv = vec2(0.025, 0.042);
          vec3 acc = vec3(0.0);
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              acc += sampleScreen(vUv + vec2(float(x), float(y)) * stepUv);
            }
          }
          vec3 linearAvg = acc / 9.0;
          // Encode gamma 2.2 into UnsignedByte RenderTarget to preserve dark-scene precision
          vec3 encoded = pow(clamp(linearAvg, vec3(1e-4), vec3(1.0)), vec3(1.0 / 2.2));
          gl_FragColor = vec4(encoded, 1.0);
        }
      `,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, mat);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return { rt, mat, geo, scene, camera };
  }, [standbyTexture]);

  useEffect(() => {
    if (screenBounceUniforms) {
      screenBounceUniforms.uScreenLightTex.value = gpuLightSampler.rt.texture;
    }
    return () => {
      gpuLightSampler.geo.dispose();
      gpuLightSampler.mat.dispose();
      gpuLightSampler.rt.dispose();
    };
  }, [gpuLightSampler, screenBounceUniforms]);

  useEffect(() => {
    if (!videoElementA) {
      texARef.current?.dispose();
      texARef.current = null;
      return;
    }
    const tex = new THREE.VideoTexture(videoElementA);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    texARef.current = tex;
    uploadedDeckRef.current.A = false;

    return () => {
      uploadedDeckRef.current.A = false;
      tex.dispose();
      if (texARef.current === tex) texARef.current = null;
    };
  }, [videoElementA]);

  useEffect(() => {
    if (!videoElementB) {
      texBRef.current?.dispose();
      texBRef.current = null;
      return;
    }
    const tex = new THREE.VideoTexture(videoElementB);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    texBRef.current = tex;
    uploadedDeckRef.current.B = false;

    return () => {
      uploadedDeckRef.current.B = false;
      tex.dispose();
      if (texBRef.current === tex) texBRef.current = null;
    };
  }, [videoElementB]);

  const outerFrameGeo = useMemo(
    () => buildCurvedScreenGeometry(screenWidth + 0.56, screenHeight + 0.46, screenCurvature, 48, 4),
    [screenWidth, screenHeight, screenCurvature],
  );

  const velvetMaskGeo = useMemo(
    () => buildCurvedScreenGeometry(screenWidth + 0.3, screenHeight + 0.24, screenCurvature, 48, 4),
    [screenWidth, screenHeight, screenCurvature],
  );

  const screenGeo = useMemo(
    () => buildCurvedScreenGeometry(screenWidth, screenHeight, screenCurvature, 48, 12),
    [screenWidth, screenHeight, screenCurvature],
  );

  useEffect(() => {
    return () => {
      outerFrameGeo.dispose();
      velvetMaskGeo.dispose();
      screenGeo.dispose();
    };
  }, [outerFrameGeo, velvetMaskGeo, screenGeo]);

  // Projector booth lens origin coordinates aligned directly with the 3D booth glass & projector lens
  const boothLensPos = useMemo<[number, number, number]>(() => {
    const topTierY = (seatingRows - 1) * rowElevationStep;
    const boothY = Math.min(auditoriumHeight - 1.4, topTierY + 3.25);
    const boothZ = auditoriumLength / 2 - 0.04;
    return [0, boothY, boothZ];
  }, [auditoriumHeight, auditoriumLength, seatingRows, rowElevationStep]);

  const screenAspect = screenWidth / screenHeight;
  const safeVideoAspect = videoAspectRatio > 0.1 ? videoAspectRatio : screenAspect;

  const { scaleX, scaleY, uvRepeatX, uvRepeatY, uvOffsetX, uvOffsetY } = useMemo(() => {
    if (screenFraming === 'fill') {
      if (Math.abs(safeVideoAspect - screenAspect) < 0.03) {
        return { scaleX: 1, scaleY: 1, uvRepeatX: 1, uvRepeatY: 1, uvOffsetX: 0, uvOffsetY: 0 };
      }
      if (safeVideoAspect > screenAspect) {
        const repX = screenAspect / safeVideoAspect;
        return {
          scaleX: 1,
          scaleY: 1,
          uvRepeatX: repX,
          uvRepeatY: 1,
          uvOffsetX: (1 - repX) / 2,
          uvOffsetY: 0,
        };
      } else {
        const repY = safeVideoAspect / screenAspect;
        return {
          scaleX: 1,
          scaleY: 1,
          uvRepeatX: 1,
          uvRepeatY: repY,
          uvOffsetX: 0,
          uvOffsetY: (1 - repY) / 2,
        };
      }
    }

    if (Math.abs(safeVideoAspect - screenAspect) < 0.02) {
      return { scaleX: 1, scaleY: 1, uvRepeatX: 1, uvRepeatY: 1, uvOffsetX: 0, uvOffsetY: 0 };
    }
    if (safeVideoAspect > screenAspect) {
      return {
        scaleX: 1,
        scaleY: screenAspect / safeVideoAspect,
        uvRepeatX: 1,
        uvRepeatY: 1,
        uvOffsetX: 0,
        uvOffsetY: 0,
      };
    }
    return {
      scaleX: safeVideoAspect / screenAspect,
      scaleY: 1,
      uvRepeatX: 1,
      uvRepeatY: 1,
      uvOffsetX: 0,
      uvOffsetY: 0,
    };
  }, [screenFraming, safeVideoAspect, screenAspect]);

  // Dual volumetric frustum geometries (outer atmospheric cone + inner concentrated ray core)
  const outerBeamGeo = useMemo(
    () =>
      buildProjectorFrustumGeometry(
        boothLensPos,
        screenPosition,
        screenWidth * scaleX,
        screenHeight * scaleY,
        1.0,
      ),
    [boothLensPos, screenPosition, screenWidth, screenHeight, scaleX, scaleY],
  );

  const innerBeamGeo = useMemo(
    () =>
      buildProjectorFrustumGeometry(
        boothLensPos,
        screenPosition,
        screenWidth * scaleX,
        screenHeight * scaleY,
        0.62,
      ),
    [boothLensPos, screenPosition, screenWidth, screenHeight, scaleX, scaleY],
  );

  const createBeamMaterial = (edgePow: number) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uScreenLightTex: { value: gpuLightSampler.rt.texture },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        attribute float aBeamT;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        varying float vBeamT;
        void main() {
          vUv = uv;
          vBeamT = aBeamT;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        varying float vBeamT;
        uniform sampler2D uScreenLightTex;
        uniform float uOpacity;
        void main() {
          // Sample live video light map directly at the ray's exact screen coordinate (no randomness)
          vec3 enc = texture2D(uScreenLightTex, clamp(vUv, 0.02, 0.98)).rgb;
          vec3 beamCol = pow(max(enc, vec3(1e-4)), vec3(2.2));
          float lum = dot(beamCol, vec3(0.2126, 0.7152, 0.0722));
          if (lum < 0.002) discard;

          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(abs(dot(normalize(vNormal), viewDir)), ${edgePow.toFixed(2)});
          // Delicate dusty atmospheric beam exiting projector lens, softly fading toward screen
          float distFade = smoothstep(0.0, 0.14, vBeamT) * mix(0.68, 0.12, pow(vBeamT, 0.55));
          float alpha = fresnel * distFade * uOpacity * (0.07 + min(lum * 0.65, 0.45));
          gl_FragColor = vec4(beamCol * 0.85, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

  const outerBeamMaterial = useMemo(() => {
    const mat = createBeamMaterial(1.55);
    outerBeamMatRef.current = mat;
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpuLightSampler]);

  const innerBeamMaterial = useMemo(() => {
    const mat = createBeamMaterial(1.3);
    innerBeamMatRef.current = mat;
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpuLightSampler]);

  const lensFlareMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uScreenLightTex: { value: gpuLightSampler.rt.texture },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uScreenLightTex;
        uniform float uOpacity;
        void main() {
          vec3 c1 = pow(max(texture2D(uScreenLightTex, vec2(0.35, 0.5)).rgb, vec3(1e-4)), vec3(2.2));
          vec3 c2 = pow(max(texture2D(uScreenLightTex, vec2(0.65, 0.5)).rgb, vec3(1e-4)), vec3(2.2));
          vec3 col = (c1 + c2) * 0.5;
          float d = distance(vUv, vec2(0.5)) * 2.0;
          float glow = pow(max(0.0, 1.0 - d), 3.0);
          gl_FragColor = vec4(col * 0.95, glow * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    lensFlareMatRef.current = mat;
    return mat;
  }, [gpuLightSampler]);

  useEffect(() => {
    return () => {
      outerBeamGeo.dispose();
      innerBeamGeo.dispose();
      outerBeamMaterial.dispose();
      innerBeamMaterial.dispose();
      lensFlareMaterial.dispose();
    };
  }, [outerBeamGeo, innerBeamGeo, outerBeamMaterial, innerBeamMaterial, lensFlareMaterial]);

  // Unified cinema projection shader (exact sRGB video decode + optical lens uniformity)
  const screenShaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: standbyTexture },
        uBrightness: { value: 0.34 },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uIsVideo: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform float uBrightness;
        uniform vec2 uRepeat;
        uniform vec2 uOffset;
        uniform float uIsVideo;

        vec3 srgbToLinear(vec3 c) {
          vec3 lo = c / 12.92;
          vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
          return mix(lo, hi, step(vec3(0.04045), c));
        }

        void main() {
          vec2 mappedUv = vUv * uRepeat + uOffset;
          vec4 tex = texture2D(uMap, mappedUv);
          vec3 linearRgb = uIsVideo > 0.5 ? srgbToLinear(tex.rgb) : tex.rgb;

          vec2 centered = vUv - 0.5;
          float radial = dot(centered, centered);
          float projectorFalloff = 1.0 - radial * 0.08;

          vec3 finalCol = linearRgb * uBrightness * projectorFalloff;
          gl_FragColor = vec4(finalCol, 1.0);
          #include <colorspace_fragment>
        }
      `,
      toneMapped: false,
    });
    shaderMatRef.current = mat;
    return mat;
  }, [standbyTexture]);

  useEffect(() => {
    return () => {
      screenShaderMaterial.dispose();
    };
  }, [screenShaderMaterial]);

  useFrame(({ gl }, delta) => {
    const dt = Math.min(delta, 0.25);
    const targetBrightness =
      showState === 'AUDITORIUM_OPEN'
        ? 0.34
        : showState === 'SHOW_STARTING'
          ? 0.62
          : showState === 'SHOW_PLAYING'
            ? isPaused
              ? 0.78
              : 0.96
            : 0.12;

    screenBrightnessRef.current = THREE.MathUtils.damp(
      screenBrightnessRef.current,
      targetBrightness,
      2.6,
      dt,
    );

    const currentEl = activeDeck === 'A' ? videoElementA : videoElementB;
    const currentTex = activeDeck === 'A' ? texARef.current : texBRef.current;
    const backupTex = activeDeck === 'A' ? texBRef.current : texARef.current;
    const backupEl = activeDeck === 'A' ? videoElementB : videoElementA;

    const currentHasData = (currentEl?.readyState ?? 0) >= 2;
    const backupHasData = (backupEl?.readyState ?? 0) >= 2;

    if (currentHasData) {
      uploadedDeckRef.current[activeDeck] = true;
    }
    const standbyKey = activeDeck === 'A' ? 'B' : 'A';
    if (backupHasData) {
      uploadedDeckRef.current[standbyKey] = true;
    }

    const currentReady =
      Boolean(currentEl) &&
      Boolean(currentEl?.currentSrc || currentEl?.src) &&
      (currentHasData || uploadedDeckRef.current[activeDeck]);

    const backupReady =
      Boolean(backupEl) &&
      Boolean(backupEl?.currentSrc || backupEl?.src) &&
      (backupHasData || uploadedDeckRef.current[standbyKey]);

    let activeTex: THREE.Texture = standbyTexture;
    let activeVideo: HTMLVideoElement | null = null;
    if (showState === 'SHOW_PLAYING' || showState === 'SHOW_COMPLETED') {
      if (currentTex && currentReady) {
        activeTex = currentTex;
        activeVideo = currentEl;
      } else if (backupTex && backupReady) {
        activeTex = backupTex;
        activeVideo = backupEl;
      }
    }

    const isVideo = activeTex !== standbyTexture;
    const nowMs = performance.now();

    // Exact 1:1 decoded frame upload: relies on THREE.VideoTexture's built-in rVFC plus decoded-frame counter check
    // so texImage2D never stalls by re-uploading identical frames on 60/120Hz displays.
    if (isVideo && activeVideo && activeVideo.readyState >= 2) {
      const quality = typeof activeVideo.getVideoPlaybackQuality === 'function'
        ? activeVideo.getVideoPlaybackQuality()
        : null;
      const totalFrames = quality ? quality.totalVideoFrames : -1;
      const decodedChanged = totalFrames >= 0 && totalFrames !== lastDecodedFramesRef.current;
      const texChanged = activeTex !== lastActiveTexRef.current;
      const hasRvfc = 'requestVideoFrameCallback' in activeVideo;
      const timeChanged = !hasRvfc && activeVideo.currentTime !== lastVideoTimeRef.current;

      if (decodedChanged || texChanged || timeChanged) {
        if (totalFrames >= 0) {
          lastDecodedFramesRef.current = totalFrames;
        }
        lastVideoTimeRef.current = activeVideo.currentTime;
        lastActiveTexRef.current = activeTex;
        lastUploadMsRef.current = nowMs;
        activeTex.needsUpdate = true;
      }
    }

    // Pace 32x18 GPU screen light sampling cleanly (~24Hz) during active playback and skip when paused/static
    const samplerDue =
      activeTex !== lastSamplerTexRef.current ||
      (isVideo && !isPaused && nowMs - lastSamplerMsRef.current >= 42);
    if (samplerDue) {
      lastSamplerTexRef.current = activeTex;
      lastSamplerMsRef.current = nowMs;

      gpuLightSampler.mat.uniforms.uMap.value = activeTex;
      gpuLightSampler.mat.uniforms.uIsVideo.value = isVideo ? 1.0 : 0.0;
      gpuLightSampler.mat.uniforms.uRepeat.value.set(
        isVideo ? uvRepeatX : 1,
        isVideo ? uvRepeatY : 1,
      );
      gpuLightSampler.mat.uniforms.uOffset.value.set(
        isVideo ? uvOffsetX : 0,
        isVideo ? uvOffsetY : 0,
      );

      const prevTarget = gl.getRenderTarget();
      const prevAutoClear = gl.autoClear;
      gl.autoClear = true;
      gl.setRenderTarget(gpuLightSampler.rt);
      gl.render(gpuLightSampler.scene, gpuLightSampler.camera);
      gl.setRenderTarget(prevTarget);
      gl.autoClear = prevAutoClear;
    }

    // Strong deterministic screen bounce reflections on seats scaled by user brightness preference
    const baseBounceGain =
      showState === 'SHOW_PLAYING' && isVideo
        ? isPaused
          ? 0.45 * lightingProfile.screenGlowStrength
          : 2.9 * lightingProfile.screenGlowStrength
        : showState === 'SHOW_STARTING'
          ? 0.55
          : showState === 'AUDITORIUM_OPEN'
            ? 0.22
            : 0.14;
    const targetBounceGain = baseBounceGain * screenReflectionBrightness;

    currentBounceGainRef.current = THREE.MathUtils.damp(
      currentBounceGainRef.current,
      targetBounceGain,
      3.8,
      dt,
    );
    if (screenBounceUniforms) {
      screenBounceUniforms.uScreenLightTex.value = gpuLightSampler.rt.texture;
      screenBounceUniforms.uScreenBounceGain.value = currentBounceGainRef.current;
    }

    if (screenBounceRef) {
      screenBounceRef.current.luminance =
        showState === 'SHOW_PLAYING' && !isPaused ? 0.38 : 0.16;
    }

    if (shaderMatRef.current) {
      shaderMatRef.current.uniforms.uMap.value = activeTex;
      shaderMatRef.current.uniforms.uBrightness.value = screenBrightnessRef.current;
      shaderMatRef.current.uniforms.uIsVideo.value = isVideo ? 1.0 : 0.0;
      shaderMatRef.current.uniforms.uRepeat.value.set(
        isVideo ? uvRepeatX : 1,
        isVideo ? uvRepeatY : 1,
      );
      shaderMatRef.current.uniforms.uOffset.value.set(
        isVideo ? uvOffsetX : 0,
        isVideo ? uvOffsetY : 0,
      );
    }

    // Restrained atmospheric projector beam (kept ultra-subtle on mobile wide FOV so frame stays crisp)
    const beamActive = showState === 'SHOW_PLAYING' && isVideo;
    const outerTarget = beamActive ? (isPaused ? 0.008 : isMobile ? 0.022 : 0.042) : 0.0;
    const innerTarget = beamActive ? (isPaused ? 0.005 : isMobile ? 0.014 : 0.026) : 0.0;
    const flareTarget = beamActive ? (isPaused ? 0.05 : isMobile ? 0.1 : 0.16) : 0.02;

    if (outerBeamMatRef.current) {
      outerBeamMatRef.current.uniforms.uScreenLightTex.value = gpuLightSampler.rt.texture;
      outerBeamMatRef.current.uniforms.uOpacity.value = THREE.MathUtils.damp(
        outerBeamMatRef.current.uniforms.uOpacity.value,
        outerTarget,
        3.2,
        dt,
      );
    }
    if (innerBeamMatRef.current) {
      innerBeamMatRef.current.uniforms.uScreenLightTex.value = gpuLightSampler.rt.texture;
      innerBeamMatRef.current.uniforms.uOpacity.value = THREE.MathUtils.damp(
        innerBeamMatRef.current.uniforms.uOpacity.value,
        innerTarget,
        3.2,
        dt,
      );
    }
    if (lensFlareMatRef.current) {
      lensFlareMatRef.current.uniforms.uScreenLightTex.value = gpuLightSampler.rt.texture;
      lensFlareMatRef.current.uniforms.uOpacity.value = THREE.MathUtils.damp(
        lensFlareMatRef.current.uniforms.uOpacity.value,
        flareTarget,
        3.2,
        dt,
      );
    }

    if (surfaceMeshRef.current) {
      surfaceMeshRef.current.scale.set(
        isVideo ? scaleX : 1,
        isVideo ? scaleY : 1,
        1,
      );
    }
  });

  const stageFootlightIntensity = lightFactor * 0.95;

  return (
    <group>
      <group position={screenPosition}>
        {/* Brushed Dark Anodized Outer Structural Frame */}
        <mesh geometry={outerFrameGeo} position={[0, 0, -0.05]}>
          <meshStandardMaterial color="#0b0c10" roughness={0.42} metalness={0.62} />
        </mesh>

        {/* Deep Light-Absorbing Velvet Masking Frame */}
        <mesh geometry={velvetMaskGeo} position={[0, 0, -0.01]}>
          <meshStandardMaterial color="#040406" roughness={0.96} metalness={0.0} />
        </mesh>

        {/* Pure Black Backing Matte for Letterbox / Pillarbox Fit */}
        <mesh geometry={screenGeo} position={[0, 0, 0.008]}>
          <meshBasicMaterial color="#020203" />
        </mesh>

        {/* Active Cinema Projection Surface */}
        <mesh
          ref={surfaceMeshRef}
          geometry={screenGeo}
          position={[0, 0, 0.028]}
          material={screenShaderMaterial}
        />

        {/* Subtle Under-Screen Stage Footlight Wash (OFF when movie plays, ON when paused) */}
        <mesh position={[0, -screenHeight / 2 - 0.14, 0.06]}>
          <boxGeometry args={[screenWidth * 0.92, 0.035, 0.04]} />
          <meshStandardMaterial
            color="#0e0e12"
            emissive={lightingProfile.accentColor}
            emissiveIntensity={stageFootlightIntensity}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* Real-Time Video-Matched Volumetric Projector Frustum Beam (Booth -> Screen) */}
      <mesh geometry={outerBeamGeo} material={outerBeamMaterial} renderOrder={4} />
      <mesh geometry={innerBeamGeo} material={innerBeamMaterial} renderOrder={5} />

      {/* Projector Booth Optical Lens Glow Halo */}
      <mesh
        position={[boothLensPos[0], boothLensPos[1], boothLensPos[2] - 0.04]}
        material={lensFlareMaterial}
        renderOrder={6}
      >
        <planeGeometry args={[0.46, 0.28]} />
      </mesh>
    </group>
  );
};
