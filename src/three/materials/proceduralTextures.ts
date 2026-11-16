import * as THREE from 'three';
import { EnvironmentProfile } from '../../types/cinema';

export interface AuditoriumTextureSet {
  carpetMap: THREE.CanvasTexture;
  carpetBumpMap: THREE.CanvasTexture;
  wallMap: THREE.CanvasTexture;
  wallBumpMap: THREE.CanvasTexture;
  exitSignMap: THREE.CanvasTexture;
  standbyScreenMap: THREE.CanvasTexture;
  speakerGrilleMap: THREE.CanvasTexture;
  curtainMap: THREE.CanvasTexture;
  posterMap: THREE.CanvasTexture;
  entranceSignMap: THREE.CanvasTexture;
  sconceWashMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface SeatUpholsteryTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createCarpetTexture(env: EnvironmentProfile): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = env.carpetColor;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = env.carpetAccentColor;
  ctx.fillStyle = env.carpetAccentColor;

  if (env.architectureStyle === 'classic') {
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 2;
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x + 32, y + 6);
        ctx.lineTo(x + 58, y + 32);
        ctx.lineTo(x + 32, y + 58);
        ctx.lineTo(x + 6, y + 32);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x + 32, y + 32, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (env.architectureStyle === 'private') {
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 3;
    for (let y = 0; y < 512; y += 32) {
      for (let x = 0; x < 512; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 16, y + 16);
        ctx.lineTo(x + 32, y);
        ctx.stroke();
      }
    }
  } else {
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }

  // Fine plush pile grain
  ctx.globalAlpha = 0.09;
  for (let i = 0; i < 3600; i++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 12);
  tex.anisotropy = 8;
  return tex;
}

export function createCarpetBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 5200; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    ctx.fillStyle = i % 2 === 0 ? '#a8a8a8' : '#565656';
    ctx.fillRect(px, py, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 20);
  tex.anisotropy = 4;
  return tex;
}

export function createAcousticWallTexture(env: EnvironmentProfile): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = env.wallMaterialColor;
  ctx.fillRect(0, 0, 512, 512);

  if (env.architectureStyle === 'dolby') {
    for (let x = 0; x < 512; x += 16) {
      ctx.fillStyle = '#020204';
      ctx.fillRect(x, 0, 6, 512);
      ctx.fillStyle = env.wallMaterialColor;
      ctx.fillRect(x + 6, 0, 10, 512);
    }
  } else if (env.architectureStyle === 'private') {
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, env.wallMaterialColor);
    grad.addColorStop(0.5, env.carpetAccentColor);
    grad.addColorStop(1, env.wallMaterialColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(10, 6, 4, 0.34)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(x * 0.1) * 3, 0);
      ctx.lineTo(x + Math.cos(x * 0.15) * 4, 512);
      ctx.stroke();
    }
  } else {
    // Perforated & woven acoustic theater fabric with recessed panel seams
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 512; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let x = 0; x < 512; x += 64) {
      ctx.fillStyle = 'rgba(0,0,0,0.44)';
      ctx.fillRect(x, 0, 4, 512);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(x + 4, 0, 2, 512);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < 512; y += 128) {
      ctx.fillRect(0, y, 512, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = 8;
  return tex;
}

export function createAcousticWallBumpTexture(env: EnvironmentProfile): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  if (env.architectureStyle === 'dolby') {
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x, 0, 3, 256);
      ctx.fillStyle = '#d0d0d0';
      ctx.fillRect(x + 3, 0, 5, 256);
    }
  } else {
    for (let y = 0; y < 256; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? '#989898' : '#686868';
      ctx.fillRect(0, y, 256, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = 4;
  return tex;
}

export function createSeatUpholsteryTextures(isLeather: boolean): SeatUpholsteryTextureSet {
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = 256;
  mapCanvas.height = 256;
  const mCtx = mapCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Neutral white-ish base so Three.js instanceColor tints accurately without darkening too much
  mCtx.fillStyle = '#ececec';
  mCtx.fillRect(0, 0, 256, 256);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);

  if (isLeather) {
    // Pebbled leather grain + subtle stitched horizontal seams
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const shade = i % 2 === 0 ? 245 : 225;
      mCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
      mCtx.fillRect(x, y, 2, 2);

      const bShade = i % 2 === 0 ? 148 : 108;
      bCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
      bCtx.fillRect(x, y, 2, 2);
    }

    // Twin-needle upholstery seams
    [64, 192].forEach((sy) => {
      mCtx.fillStyle = 'rgba(0,0,0,0.18)';
      mCtx.fillRect(0, sy, 256, 3);
      bCtx.fillStyle = '#303030';
      bCtx.fillRect(0, sy, 256, 3);

      mCtx.strokeStyle = 'rgba(255,255,255,0.22)';
      mCtx.setLineDash([4, 4]);
      mCtx.lineWidth = 1;
      mCtx.beginPath();
      mCtx.moveTo(0, sy - 3);
      mCtx.lineTo(256, sy - 3);
      mCtx.moveTo(0, sy + 5);
      mCtx.lineTo(256, sy + 5);
      mCtx.stroke();
      mCtx.setLineDash([]);
    });
  } else {
    // Plush cinema velvet / acoustic fabric micro-rib
    for (let y = 0; y < 256; y += 3) {
      mCtx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      mCtx.fillRect(0, y, 256, 2);
      bCtx.fillStyle = y % 6 === 0 ? '#949494' : '#6c6c6c';
      bCtx.fillRect(0, y, 256, 2);
    }
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      mCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
      mCtx.fillRect(x, y, 2, 2);
    }
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = 4;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.anisotropy = 4;

  return {
    map,
    bumpMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
    },
  };
}

export function createSconceWashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 256);

  // Dual upward and downward architectural wall sconce light cones
  const upGrad = ctx.createRadialGradient(64, 128, 2, 64, 52, 92);
  upGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  upGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)');
  upGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = upGrad;
  ctx.fillRect(0, 0, 128, 128);

  const downGrad = ctx.createRadialGradient(64, 128, 2, 64, 204, 92);
  downGrad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
  downGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
  downGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = downGrad;
  ctx.fillRect(0, 128, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createExitSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#03120a';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, 248, 88);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 50);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  trackingPx: number,
): number {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((acc, w) => acc + w, 0) + Math.max(0, chars.length - 1) * trackingPx;
  let cursorX = centerX - totalWidth / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, cursorX, centerY);
    cursorX += widths[idx] + trackingPx;
  });
  return totalWidth;
}

export function createStandbyScreenTexture(_theaterName: string): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const cx = W / 2;
  const cy = H / 2;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian-cinema radial stage vignette with warm golden atmospheric center bloom
  const bgGrad = ctx.createRadialGradient(cx, cy - 10, 30, cx, cy, 1080);
  bgGrad.addColorStop(0, '#2a2013');
  bgGrad.addColorStop(0.28, '#141114');
  bgGrad.addColorStop(0.62, '#090a0e');
  bgGrad.addColorStop(1, '#020204');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle horizontal anamorphic spotlight flare behind GSR centerpiece
  const flareGrad = ctx.createRadialGradient(cx, cy - 12, 8, cx, cy - 12, 460);
  flareGrad.addColorStop(0, 'rgba(245, 200, 92, 0.22)');
  flareGrad.addColorStop(0.45, 'rgba(212, 175, 55, 0.08)');
  flareGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
  ctx.fillStyle = flareGrad;
  ctx.fillRect(cx - 500, cy - 280, 1000, 560);

  const streakGrad = ctx.createLinearGradient(cx - 520, cy - 12, cx + 520, cy - 12);
  streakGrad.addColorStop(0, 'rgba(255, 224, 140, 0)');
  streakGrad.addColorStop(0.32, 'rgba(245, 205, 110, 0.09)');
  streakGrad.addColorStop(0.5, 'rgba(255, 240, 190, 0.24)');
  streakGrad.addColorStop(0.68, 'rgba(245, 205, 110, 0.09)');
  streakGrad.addColorStop(1, 'rgba(255, 224, 140, 0)');
  ctx.fillStyle = streakGrad;
  ctx.fillRect(cx - 520, cy - 16, 1040, 8);

  // Theatrical gold double proscenium border
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.42)';
  ctx.lineWidth = 3;
  ctx.strokeRect(72, 72, W - 144, H - 144);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(92, 92, W - 184, H - 184);

  // Safe horizontal span ~900px centered so mobile portrait & desktop widescreen both see 100% of text
  const safeMaxWidth = 880;

  // 1. Top Line: "Tin factory" in refined tracked display serif
  const eyebrowText = 'Tin factory';
  ctx.font = '600 50px "Cormorant Garamond", Georgia, serif';
  ctx.fillStyle = '#E6DEC8';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 12;
  const eyebrowW = drawTrackedText(ctx, eyebrowText, cx, cy - 155, 11);
  ctx.shadowBlur = 0;

  // Subtle flanking hairlines beside "Tin factory"
  const ruleSpan = 108;
  const gapFromText = 28;
  const leftRuleEnd = cx - eyebrowW / 2 - gapFromText;
  const rightRuleStart = cx + eyebrowW / 2 + gapFromText;
  const leftRuleGrad = ctx.createLinearGradient(leftRuleEnd - ruleSpan, cy - 155, leftRuleEnd, cy - 155);
  leftRuleGrad.addColorStop(0, 'rgba(212, 175, 55, 0)');
  leftRuleGrad.addColorStop(1, 'rgba(212, 175, 55, 0.65)');
  ctx.strokeStyle = leftRuleGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftRuleEnd - ruleSpan, cy - 155);
  ctx.lineTo(leftRuleEnd, cy - 155);
  ctx.stroke();

  const rightRuleGrad = ctx.createLinearGradient(rightRuleStart, cy - 155, rightRuleStart + ruleSpan, cy - 155);
  rightRuleGrad.addColorStop(0, 'rgba(212, 175, 55, 0.65)');
  rightRuleGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
  ctx.strokeStyle = rightRuleGrad;
  ctx.beginPath();
  ctx.moveTo(rightRuleStart, cy - 155);
  ctx.lineTo(rightRuleStart + ruleSpan, cy - 155);
  ctx.stroke();

  // 2. Hero Centerpiece Highlight: "GSR" in monumental brushed metallic gold
  const heroText = 'GSR';
  ctx.font = '700 184px "Cormorant Garamond", Georgia, serif';
  const heroTracking = 28;

  // Deep shadow underlayer
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowColor = 'rgba(245, 196, 81, 0.52)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 6;
  drawTrackedText(ctx, heroText, cx, cy - 14, heroTracking);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Multi-stop vertical metallic gold gradient fill
  const goldGrad = ctx.createLinearGradient(0, cy - 102, 0, cy + 72);
  goldGrad.addColorStop(0, '#FFF8DF');
  goldGrad.addColorStop(0.28, '#F6D26C');
  goldGrad.addColorStop(0.54, '#D4AF37');
  goldGrad.addColorStop(0.78, '#9E731A');
  goldGrad.addColorStop(1, '#F8DB82');
  ctx.fillStyle = goldGrad;
  drawTrackedText(ctx, heroText, cx, cy - 14, heroTracking);

  // Subtle bright rim stroke around GSR glyphs
  ctx.strokeStyle = 'rgba(255, 244, 200, 0.48)';
  ctx.lineWidth = 2;
  const gsrChars = Array.from(heroText);
  const gsrWidths = gsrChars.map((ch) => ctx.measureText(ch).width);
  const gsrTotalW =
    gsrWidths.reduce((a, b) => a + b, 0) + (gsrChars.length - 1) * heroTracking;
  let gx = cx - gsrTotalW / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  gsrChars.forEach((ch, idx) => {
    ctx.strokeText(ch, gx, cy - 14);
    gx += gsrWidths[idx] + heroTracking;
  });

  // 3. Ornamental tapered gold divider + central diamond below GSR
  const divY = cy + 102;
  const divGrad = ctx.createLinearGradient(cx - 320, divY, cx + 320, divY);
  divGrad.addColorStop(0, 'rgba(212, 175, 55, 0)');
  divGrad.addColorStop(0.35, 'rgba(212, 175, 55, 0.55)');
  divGrad.addColorStop(0.5, 'rgba(255, 236, 170, 0.92)');
  divGrad.addColorStop(0.65, 'rgba(212, 175, 55, 0.55)');
  divGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 320, divY);
  ctx.lineTo(cx + 320, divY);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, divY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#F7D97E';
  ctx.fillRect(-5.5, -5.5, 11, 11);
  ctx.restore();

  // 4. Bottom Subtitle: "ra neeee akkkkkkkkkaaaaa" auto-fitted inside central 880px safe zone
  const subText = 'ra neeee akkkkkkkkkaaaaa';
  let subSize = 48;
  const subTracking = 5;
  while (subSize > 26) {
    ctx.font = `italic 500 ${subSize}px "Cormorant Garamond", Georgia, serif`;
    const subChars = Array.from(subText);
    const estW =
      subChars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
      (subChars.length - 1) * subTracking;
    if (estW <= safeMaxWidth) break;
    subSize -= 2;
  }

  ctx.fillStyle = '#EFE9DC';
  ctx.shadowColor = 'rgba(212, 175, 55, 0.25)';
  ctx.shadowBlur = 14;
  drawTrackedText(ctx, subText, cx, cy + 168, subTracking);
  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createSpeakerGrilleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141519';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#050507';
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4; x < 128; x += 8) {
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 6);
  return tex;
}

export function createRowMarkerTexture(rowLabel: string, accentHex = '#38bdf8'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#06080c';
  ctx.fillRect(0, 0, 96, 96);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 76, 76);

  ctx.fillStyle = accentHex;
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rowLabel, 48, 50);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCurtainTexture(baseHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let x = 0; x < 256; x += 24) {
    const grad = ctx.createLinearGradient(x, 0, x + 24, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.68)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 24, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.anisotropy = 4;
  return tex;
}

export function createPosterLightboxTexture(theaterName: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, '#0a0e1a');
  grad.addColorStop(0.55, '#1b1410');
  grad.addColorStop(1, '#070709');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 384);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 155, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 228, 356);

  ctx.fillStyle = '#f4f1ea';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('AURELIA PREMIERE', 128, 290);

  ctx.fillStyle = accentHex;
  ctx.font = '600 13px sans-serif';
  ctx.fillText(theaterName.toUpperCase().slice(0, 20), 128, 322);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createEntranceSignTexture(accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, 256, 72);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 64);

  ctx.fillStyle = '#e5f0ff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AUDITORIUM', 128, 37);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAuditoriumTextures(
  env: EnvironmentProfile,
  theaterName: string,
  accentHex = '#38bdf8',
): AuditoriumTextureSet {
  const carpetMap = createCarpetTexture(env);
  const carpetBumpMap = createCarpetBumpTexture();
  const wallMap = createAcousticWallTexture(env);
  const wallBumpMap = createAcousticWallBumpTexture(env);
  const exitSignMap = createExitSignTexture();
  const standbyScreenMap = createStandbyScreenTexture(theaterName);
  const speakerGrilleMap = createSpeakerGrilleTexture();
  const curtainBase =
    env.curtainColor ??
    (env.architectureStyle === 'classic'
      ? '#4b0d17'
      : env.architectureStyle === 'imax'
        ? '#0f2347'
        : env.architectureStyle === 'screenx'
          ? '#0a0e17'
          : env.architectureStyle === 'private'
            ? '#2a1d17'
            : '#111420');
  const curtainMap = createCurtainTexture(curtainBase);
  const posterMap = createPosterLightboxTexture(theaterName, accentHex);
  const entranceSignMap = createEntranceSignTexture(accentHex);
  const sconceWashMap = createSconceWashTexture();

  return {
    carpetMap,
    carpetBumpMap,
    wallMap,
    wallBumpMap,
    exitSignMap,
    standbyScreenMap,
    speakerGrilleMap,
    curtainMap,
    posterMap,
    entranceSignMap,
    sconceWashMap,
    dispose: () => {
      carpetMap.dispose();
      carpetBumpMap.dispose();
      wallMap.dispose();
      wallBumpMap.dispose();
      exitSignMap.dispose();
      standbyScreenMap.dispose();
      speakerGrilleMap.dispose();
      curtainMap.dispose();
      posterMap.dispose();
      entranceSignMap.dispose();
      sconceWashMap.dispose();
    },
  };
}
