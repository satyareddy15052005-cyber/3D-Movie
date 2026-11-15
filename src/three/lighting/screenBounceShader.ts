import * as THREE from 'three';

export interface ScreenBounceUniforms {
  uScreenLightTex: { value: THREE.Texture };
  uScreenWorldPos: { value: THREE.Vector3 };
  uScreenWorldSize: { value: THREE.Vector2 };
  uScreenBounceGain: { value: number };
}

let fallbackBlackTex: THREE.DataTexture | null = null;

function getFallbackBlackTexture(): THREE.DataTexture {
  if (!fallbackBlackTex) {
    const data = new Uint8Array([0, 0, 0, 255]);
    fallbackBlackTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    fallbackBlackTex.needsUpdate = true;
  }
  return fallbackBlackTex;
}

export function createScreenBounceUniforms(
  screenPosition: [number, number, number],
  screenWidth: number,
  screenHeight: number,
): ScreenBounceUniforms {
  return {
    uScreenLightTex: { value: getFallbackBlackTexture() },
    uScreenWorldPos: {
      value: new THREE.Vector3(screenPosition[0], screenPosition[1], screenPosition[2]),
    },
    uScreenWorldSize: { value: new THREE.Vector2(screenWidth, screenHeight) },
    uScreenBounceGain: { value: 0 },
  };
}

/**
 * Extends MeshStandardMaterial / MeshPhysicalMaterial with a deterministic 6-zone (3x2)
 * GPU area-light sampled directly from the live downsampled video texture (`uScreenLightTex`).
 * Uses Three.js `RE_Direct` + grazing upholstery sheen + Karis MRP specular reflection
 * so every seat, armrest, and hall surface reflects exact live video colors & brightness
 * with zero CPU readback and zero randomness.
 */
export function applyScreenBounceToMaterial<
  T extends THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
>(material: T, uniforms?: ScreenBounceUniforms): T {
  if (!uniforms) return material;

  material.customProgramCacheKey = () => 'aurelia_screen_bounce_v4';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScreenLightTex = uniforms.uScreenLightTex;
    shader.uniforms.uScreenWorldPos = uniforms.uScreenWorldPos;
    shader.uniforms.uScreenWorldSize = uniforms.uScreenWorldSize;
    shader.uniforms.uScreenBounceGain = uniforms.uScreenBounceGain;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vScreenBounceWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 sbWorldPos = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  sbWorldPos = batchingMatrix * sbWorldPos;
#endif
#ifdef USE_INSTANCING
  sbWorldPos = instanceMatrix * sbWorldPos;
#endif
sbWorldPos = modelMatrix * sbWorldPos;
vScreenBounceWorldPos = sbWorldPos.xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uScreenLightTex;
uniform vec3 uScreenWorldPos;
uniform vec2 uScreenWorldSize;
uniform float uScreenBounceGain;
varying vec3 vScreenBounceWorldPos;

vec3 decodeScreenBounceTex( vec2 uvCoord ) {
  vec3 enc = texture2D( uScreenLightTex, clamp( uvCoord, 0.015, 0.985 ) ).rgb;
  vec3 lin = pow( max( enc, vec3( 1e-4 ) ), vec3( 2.2 ) ) - vec3( 1.5e-9 );
  return max( lin, vec3( 0.0 ) );
}`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        `#include <lights_fragment_begin>
#ifdef RE_Direct
if ( uScreenBounceGain > 0.001 ) {
  IncidentLight sbLight;
  mat3 invViewRot = mat3( viewMatrix );
  vec3 worldNormal = normalize( geometryNormal * invViewRot );
  vec3 worldViewDir = normalize( geometryViewDir * invViewRot );
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  float invSpreadSq = 1.0 / max( 3.2, 0.082 * uScreenWorldSize.x * uScreenWorldSize.x );

  // 3-zone vertically blended screen area-light sampling (cuts PBR RE_Direct ALU in half while keeping full color gradients)
  for ( int sbCol = 0; sbCol < 3; sbCol ++ ) {
    float ox = ( sbCol == 0 ) ? -0.34 : ( ( sbCol == 1 ) ? 0.0 : 0.34 );
    vec3 upperRgb = decodeScreenBounceTex( vec2( 0.5 + ox, 0.72 ) );
    vec3 lowerRgb = decodeScreenBounceTex( vec2( 0.5 + ox, 0.28 ) );
    vec3 patchRgb = mix( upperRgb, lowerRgb, 0.52 );
    vec3 patchWorld = uScreenWorldPos + vec3( ox * uScreenWorldSize.x, 0.0, 0.16 );
    vec3 toPatch = patchWorld - vScreenBounceWorldPos;
    float distSq = dot( toPatch, toPatch );
    float dist = sqrt( max( distSq, 0.25 ) );
    vec3 dirWorld = toPatch / dist;

    float dx = toPatch.x;
    float lateralProx = 0.08 + 1.15 * exp( -dx * dx * invSpreadSq );
    float screenForward = smoothstep( -0.12, 0.32, -dirWorld.z );
    float atten = 1.0 / ( 1.0 + 0.028 * dist + 0.00065 * distSq );

    sbLight.direction = normalize( ( viewMatrix * vec4( dirWorld, 0.0 ) ).xyz );
    sbLight.color = patchRgb * ( uScreenBounceGain * 0.84 * screenForward * atten * lateralProx );
    sbLight.visible = ( sbLight.color.r + sbLight.color.g + sbLight.color.b ) > 0.0003;

    if ( sbLight.visible ) {
      RE_Direct( sbLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      float softWrap = saturate( ( dot( geometryNormal, sbLight.direction ) + 0.38 ) / 1.38 );
      float grazeRim = pow( 1.0 - dotNV, 1.65 );
      // Velvet nap & satin leather topcoat catch true video colors cleanly even on dark upholstery
      vec3 surfaceAlbedo = mix( material.diffuseColor, vec3( 0.135 ), 0.62 );
      reflectedLight.indirectDiffuse += surfaceAlbedo * sbLight.color * ( softWrap * ( 0.22 + 0.18 * grazeRim ) );
    }
  }

  // Roughness-convolved Karis MRP area reflection (crisp on leather/armrests/headrests/metal)
  float rough = clamp( material.roughness, 0.0, 1.0 );
  float specEnergy = pow( 1.0 - rough, 1.45 ) * 1.25;
  vec3 worldRefl = reflect( -worldViewDir, worldNormal );
  if ( specEnergy > 0.01 && vScreenBounceWorldPos.z > uScreenWorldPos.z ) {
    float reflForward = smoothstep( 0.28, -0.14, worldRefl.z );
    if ( reflForward > 0.001 ) {
      float tPlane = ( uScreenWorldPos.z - vScreenBounceWorldPos.z ) / min( worldRefl.z, -0.05 );
      vec2 hitScreenXY = ( vScreenBounceWorldPos.xy + worldRefl.xy * tPlane ) - uScreenWorldPos.xy;
      vec2 localFrontXY = vec2( vScreenBounceWorldPos.x - uScreenWorldPos.x, 0.0 );
      vec2 blendedXY = mix( hitScreenXY, localFrontXY, rough * 0.36 );
      vec2 halfScreen = max( uScreenWorldSize * 0.5, vec2( 0.5 ) );
      vec2 clampedXY = clamp( blendedXY, -halfScreen, halfScreen );
      vec3 mprWorldPos = vec3( uScreenWorldPos.xy + clampedXY, uScreenWorldPos.z );
      vec3 toMpr = normalize( mprWorldPos - vScreenBounceWorldPos );
      float align = max( dot( worldRefl, toMpr ), 0.0 );
      float lobePow = mix( 12.0, 2.2, rough );
      float lobeMask = pow( align, lobePow ) * reflForward;

      if ( lobeMask > 0.001 ) {
        vec2 mprUv = clamp( clampedXY / max( uScreenWorldSize, vec2( 1.0 ) ) + 0.5, 0.02, 0.98 );
        float coneSpread = 0.035 + rough * 0.14;
        vec3 reflRgb = ( decodeScreenBounceTex( vec2( mprUv.x - coneSpread, mprUv.y ) )
                     + decodeScreenBounceTex( vec2( mprUv.x + coneSpread, mprUv.y ) ) ) * 0.5;
        vec3 f0 = max( material.specularColor, vec3( 0.06 ) );
        vec3 fresnel = f0 + ( 1.0 - f0 ) * pow( 1.0 - dotNV, 2.8 );
        float mprDist = length( mprWorldPos - vScreenBounceWorldPos );
        float reflAtten = 1.0 / ( 1.0 + 0.018 * mprDist );
        reflectedLight.indirectSpecular += reflRgb * fresnel * ( lobeMask * specEnergy * reflAtten * uScreenBounceGain * 0.78 );
      }
    }
  }
}
#endif`,
      );
  };

  return material;
}
