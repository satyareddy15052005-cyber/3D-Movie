import { AudioProfile, AudioSettings, TheaterConfiguration } from '../../types/cinema';
import { isIosDevice, isMobileDevice } from '../../utils/formatters';

type SpeakerChannelId =
  | 'L'
  | 'C'
  | 'R'
  | 'Ls'
  | 'Rs'
  | 'Lrs'
  | 'Rrs'
  | 'TopL'
  | 'TopR';

interface SpeakerPose {
  position: [number, number, number];
  orientation: [number, number, number];
  refDistance: number;
  rolloffFactor: number;
}

class CinemaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private videoGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;

  // Input conditioning & spatial bypass vs Dolby 7.1.2 spatial array
  private lowShelf: BiquadFilterNode | null = null;
  private highShelf: BiquadFilterNode | null = null;
  private inputBus: GainNode | null = null;
  private signalAnalyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private stereoDirectGain: GainNode | null = null;
  private dolbyBusGain: GainNode | null = null;

  // Channel matrix & panners (kept cleanly separated so profile tuning never blasts surrounds)
  private splitter: ChannelSplitterNode | null = null;
  private panners = new Map<SpeakerChannelId, PannerNode>();
  private sideSurroundGains: GainNode[] = [];
  private rearSurroundGains: GainNode[] = [];
  private atmosHeightGains: GainNode[] = [];
  private reverbNode: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private lfeGain: GainNode | null = null;

  private videoSources = new Map<HTMLVideoElement, MediaElementAudioSourceNode>();
  private pendingVideos = new Set<HTMLVideoElement>();
  private stateListeners = new Set<(running: boolean) => void>();
  private lastMixState: {
    settings: AudioSettings;
    showState: 'AUDITORIUM_OPEN' | 'SHOW_STARTING' | 'SHOW_PLAYING' | 'SHOW_COMPLETED';
    windActive: boolean;
    windIntensity: number;
  } | null = null;

  private currentProfile: AudioProfile | null = null;
  private currentConfig: TheaterConfiguration | null = null;
  private lastSpatialEnabled = true;
  private isInitialized = false;
  private iosSilenceUnlocked = false;
  private videoHijackDisabled = isIosDevice();

  public async initialize(
    audioProfile: AudioProfile,
    seatOffsetRatio: number,
    theaterConfig?: TheaterConfiguration | null,
  ): Promise<void> {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.ctx.onstatechange = () => {
        if (this.ctx?.state === 'running') {
          this.flushPendingVideos();
        }
        this.notifyStateChange();
      };
      this.buildAudioGraph();
      this.isInitialized = true;
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Requires user gesture if not yet unlocked
      }
    }

    if (this.ctx.state === 'running') {
      this.flushPendingVideos();
    }

    if (theaterConfig) {
      this.configureAuditoriumSpeakers(theaterConfig);
    }
    this.applyProfile(audioProfile, seatOffsetRatio);
    this.notifyStateChange();
  }

  /**
   * Synchronously unlocks mobile iOS/Android Web Audio inside a user gesture handler
   * and connects any pending video elements once the AudioContext is running.
   */
  public unlockFromGesture(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.ctx.onstatechange = () => {
        if (this.ctx?.state === 'running') {
          this.flushPendingVideos();
        }
        this.notifyStateChange();
      };
      this.buildAudioGraph();
      this.isInitialized = true;
    }

    const ctx = this.ctx;
    if (ctx.state === 'suspended') {
      try {
        void ctx.resume().then(() => {
          if (this.ctx?.state === 'running') {
            this.flushPendingVideos();
          }
          this.notifyStateChange();
        });
      } catch {
        // Ignore
      }
    }

    // Play a 1-sample silent buffer to unlock iOS Safari WebKit audio session
    if (!this.iosSilenceUnlocked) {
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        this.iosSilenceUnlocked = true;
      } catch {
        // Ignore
      }
    }

    if (ctx.state === 'running') {
      this.flushPendingVideos();
    }
    this.notifyStateChange();
  }

  private buildAudioGraph(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.masterGain = ctx.createGain();
    // Transparent cinema mastering limiter (protects headroom without pumping or distortion)
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -2.5;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 2.0;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.22;

    this.videoGain = ctx.createGain();
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0;
    this.effectsGain = ctx.createGain();
    this.effectsGain.gain.value = 0;

    this.lowShelf = ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 95;

    this.highShelf = ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 5400;

    this.inputBus = ctx.createGain();
    this.inputBus.channelCount = 2;
    this.inputBus.channelCountMode = 'explicit';
    this.inputBus.channelInterpretation = 'speakers';

    this.signalAnalyser = ctx.createAnalyser();
    this.signalAnalyser.fftSize = 256;
    this.analyserBuf = new Float32Array(this.signalAnalyser.fftSize);

    this.stereoDirectGain = ctx.createGain();
    this.stereoDirectGain.gain.value = 0;

    this.dolbyBusGain = ctx.createGain();
    this.dolbyBusGain.gain.value = 0.95;

    // Input conditioning chain
    this.lowShelf.connect(this.highShelf);
    this.highShelf.connect(this.inputBus);
    this.inputBus.connect(this.signalAnalyser);

    // Direct Stereo Bypass path (used when spatialSimulation === false)
    this.inputBus.connect(this.stereoDirectGain);
    this.stereoDirectGain.connect(this.videoGain);

    // Build Clean 7.1.2 Dolby Cinema Spatial Array -> HRTF (desktop) / equalpower (mobile)
    this.splitter = ctx.createChannelSplitter(2);
    this.inputBus.connect(this.splitter);

    const mobile = isMobileDevice();
    const createSpatialPanner = (
      id: SpeakerChannelId,
      pos: [number, number, number],
      dir: [number, number, number],
      refDist = 14,
      rolloff = 0.4,
    ): PannerNode => {
      const p = ctx.createPanner();
      if (mobile) {
        p.panningModel = 'equalpower';
      } else {
        try {
          p.panningModel = 'HRTF';
        } catch {
          p.panningModel = 'equalpower';
        }
      }
      p.distanceModel = 'inverse';
      p.refDistance = refDist;
      p.maxDistance = 140;
      p.rolloffFactor = rolloff;
      p.coneInnerAngle = 135;
      p.coneOuterAngle = 250;
      p.coneOuterGain = 0.62;
      this.setPannerTransform(p, pos, dir);
      p.connect(this.dolbyBusGain!);
      this.panners.set(id, p);
      return p;
    };

    const panL = createSpatialPanner('L', [-6, 5, -12], [0.25, -0.1, 1], 15, 0.38);
    const panC = createSpatialPanner('C', [0, 5, -12], [0, -0.1, 1], 15, 0.36);
    const panR = createSpatialPanner('R', [6, 5, -12], [-0.25, -0.1, 1], 15, 0.38);
    const panLs = createSpatialPanner('Ls', [-10, 4.5, 0], [1, -0.25, 0], 12, 0.45);
    const panRs = createSpatialPanner('Rs', [10, 4.5, 0], [-1, -0.25, 0], 12, 0.45);
    const panLrs = createSpatialPanner('Lrs', [-6, 4.5, 12], [0.35, -0.2, -1], 12, 0.45);
    const panRrs = createSpatialPanner('Rrs', [6, 4.5, 12], [-0.35, -0.2, -1], 12, 0.45);
    const panTopL = createSpatialPanner('TopL', [-4.5, 9.5, -1], [0.2, -1, 0], 11, 0.42);
    const panTopR = createSpatialPanner('TopR', [4.5, 9.5, -1], [-0.2, -1, 0], 11, 0.42);

    // 1. Front Screen L / R Direct Screen Feeds (crisp, clear stereo soundstage)
    const lMainGain = ctx.createGain();
    lMainGain.gain.value = 0.82;
    const rMainGain = ctx.createGain();
    rMainGain.gain.value = 0.82;
    this.splitter.connect(lMainGain, 0);
    this.splitter.connect(rMainGain, 1);
    lMainGain.connect(panL);
    rMainGain.connect(panR);

    // 2. Center Screen Dialogue Channel (balanced L+R mid -> warm vocal presence -> Center Panner)
    const cMixL = ctx.createGain();
    const cMixR = ctx.createGain();
    cMixL.gain.value = 0.36;
    cMixR.gain.value = 0.36;
    const centerPresence = ctx.createBiquadFilter();
    centerPresence.type = 'peaking';
    centerPresence.frequency.value = 2400;
    centerPresence.Q.value = 0.75;
    centerPresence.gain.value = 1.2;

    this.splitter.connect(cMixL, 0);
    this.splitter.connect(cMixR, 1);
    cMixL.connect(centerPresence);
    cMixR.connect(centerPresence);
    centerPresence.connect(panC);

    // 3. Side & Rear Surrounds — Decorrelated Mid-Side Difference + Clean Acoustic Timing + Warm Air Absorption
    const buildSurroundFeed = (
      primaryCh: 0 | 1,
      oppositeCh: 0 | 1,
      delaySec: number,
      cutoffHz: number,
      targetPanner: PannerNode,
      rearPanner: PannerNode,
      rearExtraDelaySec: number,
    ) => {
      const sumNode = ctx.createGain();
      const primGain = ctx.createGain();
      const oppGain = ctx.createGain();
      primGain.gain.value = 0.44;
      oppGain.gain.value = -0.36; // Cleanly cancels centered speech from leaking into rear speakers

      this.splitter!.connect(primGain, primaryCh);
      this.splitter!.connect(oppGain, oppositeCh);
      primGain.connect(sumNode);
      oppGain.connect(sumNode);

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;

      const delay = ctx.createDelay(0.12);
      delay.delayTime.value = delaySec;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoffHz;

      const sideOutGain = ctx.createGain();
      sideOutGain.gain.value = 0.24;
      this.sideSurroundGains.push(sideOutGain);

      sumNode.connect(hp);
      hp.connect(delay);
      delay.connect(lp);
      lp.connect(sideOutGain);
      sideOutGain.connect(targetPanner);

      // Rear Surround wrap
      const rearDelay = ctx.createDelay(0.12);
      rearDelay.delayTime.value = rearExtraDelaySec;
      const rearLp = ctx.createBiquadFilter();
      rearLp.type = 'lowpass';
      rearLp.frequency.value = 2800;
      const rearOutGain = ctx.createGain();
      rearOutGain.gain.value = 0.16;
      this.rearSurroundGains.push(rearOutGain);

      lp.connect(rearDelay);
      rearDelay.connect(rearLp);
      rearLp.connect(rearOutGain);
      rearOutGain.connect(rearPanner);
    };

    buildSurroundFeed(0, 1, 0.026, 3800, panLs, panLrs, 0.018);
    buildSurroundFeed(1, 0, 0.029, 3800, panRs, panRrs, 0.021);

    // 4. Overhead Dolby Atmos Height Channels (Subtle spacious air lift)
    const buildAtmosFeed = (ch: 0 | 1, delaySec: number, targetPanner: PannerNode) => {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      const delay = ctx.createDelay(0.12);
      delay.delayTime.value = delaySec;
      const gain = ctx.createGain();
      gain.gain.value = 0.14;
      this.atmosHeightGains.push(gain);

      this.splitter!.connect(hp, ch);
      hp.connect(lp);
      lp.connect(delay);
      delay.connect(gain);
      gain.connect(targetPanner);
    };

    buildAtmosFeed(0, 0.031, panTopL);
    buildAtmosFeed(1, 0.034, panTopR);

    // 5. Cinema LFE Subwoofer Bus (Deep, tight sub-bass foundation without boom)
    const lfeMixL = ctx.createGain();
    const lfeMixR = ctx.createGain();
    lfeMixL.gain.value = 0.5;
    lfeMixR.gain.value = 0.5;
    const lfeFilter = ctx.createBiquadFilter();
    lfeFilter.type = 'lowpass';
    lfeFilter.frequency.value = 85;
    lfeFilter.Q.value = 0.707;
    this.lfeGain = ctx.createGain();
    this.lfeGain.gain.value = 0.34;

    this.splitter.connect(lfeMixL, 0);
    this.splitter.connect(lfeMixR, 1);
    lfeMixL.connect(lfeFilter);
    lfeMixR.connect(lfeFilter);
    lfeFilter.connect(this.lfeGain);
    this.lfeGain.connect(this.dolbyBusGain);

    // 6. Smooth Acoustic Theater Room Impulse Convolver (Velvet damped hall warmth, zero harsh clicks)
    const revInL = ctx.createGain();
    const revInR = ctx.createGain();
    revInL.gain.value = 0.5;
    revInR.gain.value = 0.5;
    const revHp = ctx.createBiquadFilter();
    revHp.type = 'highpass';
    revHp.frequency.value = 220;
    const revLp = ctx.createBiquadFilter();
    revLp.type = 'lowpass';
    revLp.frequency.value = 2600;
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = this.createCinemaImpulseResponse(0.85);
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = 0.075;

    this.splitter.connect(revInL, 0);
    this.splitter.connect(revInR, 1);
    revInL.connect(revHp);
    revInR.connect(revHp);
    revHp.connect(revLp);
    revLp.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(panLs);
    this.reverbWetGain.connect(panRs);
    this.reverbWetGain.connect(panLrs);
    this.reverbWetGain.connect(panRrs);

    // Final Clean Cinema Bus -> Transparent Mastering Limiter -> Destination
    this.dolbyBusGain.connect(this.videoGain);
    this.videoGain.connect(this.compressor);
    this.ambienceGain.connect(this.compressor);
    this.effectsGain.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  private setPannerTransform(
    panner: PannerNode,
    pos: [number, number, number],
    dir: [number, number, number],
  ): void {
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const ox = dir[0] / len;
    const oy = dir[1] / len;
    const oz = dir[2] / len;

    if (panner.positionX) {
      panner.positionX.value = pos[0];
      panner.positionY.value = pos[1];
      panner.positionZ.value = pos[2];
      panner.orientationX.value = ox;
      panner.orientationY.value = oy;
      panner.orientationZ.value = oz;
    } else {
      panner.setPosition(pos[0], pos[1], pos[2]);
      panner.setOrientation(ox, oy, oz);
    }
  }

  /**
   * Builds a smooth, acoustically damped cinema hall impulse response with soft 18ms onset
   * and dual-pole warm absorption (zero delta spikes, metallic slaps, or static fizz).
   */
  private createCinemaImpulseResponse(decaySeconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const duration = Math.min(1.25, Math.max(0.5, decaySeconds));
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp1 = 0;
      let lp2 = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const fadeIn = Math.min(1, t / 0.018);
        const decayEnv = Math.exp(-t / (duration * 0.24));
        const raw = (Math.random() * 2 - 1) * fadeIn * decayEnv * 0.14;
        lp1 = lp1 * 0.72 + raw * 0.28;
        lp2 = lp2 * 0.65 + lp1 * 0.35;
        data[i] = lp2;
      }
    }
    return buffer;
  }

  public configureAuditoriumSpeakers(config: TheaterConfiguration): void {
    this.currentConfig = config;
    if (!this.ctx || this.panners.size === 0) return;

    const {
      auditoriumWidth: W,
      auditoriumLength: L,
      auditoriumHeight: H,
      screenWidth,
      screenPosition,
      seatingRows,
      rowSpacing,
      rowElevationStep,
      firstRowZ,
    } = config;

    const topTierY = (seatingRows - 1) * rowElevationStep;
    const seatingMidZ = firstRowZ + ((seatingRows - 1) * rowSpacing) / 2;
    const sweetSpotY = Math.min(H - 1.5, topTierY * 0.55 + 1.3);
    const surroundY = Math.min(H - 1.4, Math.max(2.5, topTierY + 2.0));
    const backZ = L / 2;

    const screenRefDist = Math.max(9.0, L * 0.82);
    const surroundRefDist = Math.max(7.5, Math.min(W, L) * 0.68);

    const poses: Record<SpeakerChannelId, SpeakerPose> = {
      L: {
        position: [-screenWidth * 0.36, screenPosition[1], screenPosition[2] + 0.35],
        orientation: [screenWidth * 0.36, sweetSpotY - screenPosition[1], seatingMidZ - screenPosition[2]],
        refDistance: screenRefDist,
        rolloffFactor: 0.42,
      },
      C: {
        position: [0, screenPosition[1], screenPosition[2] + 0.35],
        orientation: [0, sweetSpotY - screenPosition[1], seatingMidZ - screenPosition[2]],
        refDistance: screenRefDist,
        rolloffFactor: 0.4,
      },
      R: {
        position: [screenWidth * 0.36, screenPosition[1], screenPosition[2] + 0.35],
        orientation: [-screenWidth * 0.36, sweetSpotY - screenPosition[1], seatingMidZ - screenPosition[2]],
        refDistance: screenRefDist,
        rolloffFactor: 0.42,
      },
      Ls: {
        position: [-(W / 2 - 0.35), surroundY, seatingMidZ],
        orientation: [W * 0.45, sweetSpotY - surroundY, 0],
        refDistance: surroundRefDist,
        rolloffFactor: 0.48,
      },
      Rs: {
        position: [W / 2 - 0.35, surroundY, seatingMidZ],
        orientation: [-W * 0.45, sweetSpotY - surroundY, 0],
        refDistance: surroundRefDist,
        rolloffFactor: 0.48,
      },
      Lrs: {
        position: [-Math.min(W * 0.34, Math.max(2.6, W / 2 - 1.4)), surroundY + 0.15, backZ - 0.3],
        orientation: [W * 0.25, sweetSpotY - surroundY, -(backZ - seatingMidZ)],
        refDistance: surroundRefDist,
        rolloffFactor: 0.48,
      },
      Rrs: {
        position: [Math.min(W * 0.34, Math.max(2.6, W / 2 - 1.4)), surroundY + 0.15, backZ - 0.3],
        orientation: [-W * 0.25, sweetSpotY - surroundY, -(backZ - seatingMidZ)],
        refDistance: surroundRefDist,
        rolloffFactor: 0.48,
      },
      TopL: {
        position: [-W * 0.22, H - 0.35, -L * 0.05],
        orientation: [W * 0.12, -(H - sweetSpotY), 0.1],
        refDistance: Math.max(5.0, H * 0.78),
        rolloffFactor: 0.45,
      },
      TopR: {
        position: [W * 0.22, H - 0.35, -L * 0.05],
        orientation: [-W * 0.12, -(H - sweetSpotY), 0.1],
        refDistance: Math.max(5.0, H * 0.78),
        rolloffFactor: 0.45,
      },
    };

    (Object.keys(poses) as SpeakerChannelId[]).forEach((id) => {
      const p = this.panners.get(id);
      const spec = poses[id];
      if (!p) return;
      p.refDistance = spec.refDistance;
      p.rolloffFactor = spec.rolloffFactor;
      this.setPannerTransform(p, spec.position, spec.orientation);
    });

    if (this.reverbNode) {
      this.reverbNode.buffer = this.createCinemaImpulseResponse(config.audioProfile.reverbDecay);
    }
  }

  private lastPose = {
    px: Number.NaN,
    py: Number.NaN,
    pz: Number.NaN,
    fx: Number.NaN,
    fy: Number.NaN,
    fz: Number.NaN,
    ux: Number.NaN,
    uy: Number.NaN,
    uz: Number.NaN,
  };

  /**
   * Smoothly interpolates Web Audio AudioListener position and head orientation only on meaningful
   * pose change so HRTF panning shifts seamlessly without zipper noise or stationary frame churn.
   */
  public updateListenerPose(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.isInitialized) return;

    const lp = this.lastPose;
    if (
      Math.abs(px - lp.px) < 5e-4 &&
      Math.abs(py - lp.py) < 5e-4 &&
      Math.abs(pz - lp.pz) < 5e-4 &&
      Math.abs(fx - lp.fx) < 5e-4 &&
      Math.abs(fy - lp.fy) < 5e-4 &&
      Math.abs(fz - lp.fz) < 5e-4 &&
      Math.abs(ux - lp.ux) < 5e-4 &&
      Math.abs(uy - lp.uy) < 5e-4 &&
      Math.abs(uz - lp.uz) < 5e-4
    ) {
      return;
    }
    const isFirstSet = Number.isNaN(lp.px);
    lp.px = px;
    lp.py = py;
    lp.pz = pz;
    lp.fx = fx;
    lp.fy = fy;
    lp.fz = fz;
    lp.ux = ux;
    lp.uy = uy;
    lp.uz = uz;

    const listener = ctx.listener;
    if (listener.positionX) {
      if (isFirstSet) {
        listener.positionX.value = px;
        listener.positionY.value = py;
        listener.positionZ.value = pz;
        listener.forwardX.value = fx;
        listener.forwardY.value = fy;
        listener.forwardZ.value = fz;
        listener.upX.value = ux;
        listener.upY.value = uy;
        listener.upZ.value = uz;
      } else {
        const now = ctx.currentTime;
        listener.positionX.setTargetAtTime(px, now, 0.02);
        listener.positionY.setTargetAtTime(py, now, 0.02);
        listener.positionZ.setTargetAtTime(pz, now, 0.02);
        listener.forwardX.setTargetAtTime(fx, now, 0.02);
        listener.forwardY.setTargetAtTime(fy, now, 0.02);
        listener.forwardZ.setTargetAtTime(fz, now, 0.02);
        listener.upX.setTargetAtTime(ux, now, 0.02);
        listener.upY.setTargetAtTime(uy, now, 0.02);
        listener.upZ.setTargetAtTime(uz, now, 0.02);
      }
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(px, py, pz);
      listener.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  public async resume(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore resume error if blocked by autoplay policy
      }
    }
    if (this.ctx.state === 'running') {
      this.flushPendingVideos();
    }
    this.notifyStateChange();
  }

  public applyProfile(profile: AudioProfile, _seatOffsetRatio: number): void {
    this.currentProfile = profile;
    if (!this.ctx || !this.lowShelf || !this.highShelf) return;
    const now = this.ctx.currentTime;
    // Gentle cinema acoustic EQ curve (avoids muddy sub bloat or sibilant hiss)
    this.lowShelf.gain.setTargetAtTime(Math.min(2.2, profile.lowShelfGainDb * 0.6), now, 0.25);
    this.highShelf.gain.setTargetAtTime(Math.min(1.0, profile.highShelfGainDb * 0.5), now, 0.25);

    const spread = Math.max(0.35, Math.min(1.0, profile.spatialSpread));
    this.sideSurroundGains.forEach((g) => {
      g.gain.setTargetAtTime(0.16 + spread * 0.14, now, 0.25);
    });
    this.rearSurroundGains.forEach((g) => {
      g.gain.setTargetAtTime(0.11 + spread * 0.1, now, 0.25);
    });
    this.atmosHeightGains.forEach((g) => {
      g.gain.setTargetAtTime(0.1 + spread * 0.08, now, 0.25);
    });
    if (this.reverbWetGain) {
      this.reverbWetGain.gain.setTargetAtTime(0.04 + spread * 0.055, now, 0.25);
    }
  }

  public updateSeatPan(profile: AudioProfile, seatOffsetRatio: number): void {
    this.applyProfile(profile, seatOffsetRatio);
    if (this.currentConfig) {
      this.configureAuditoriumSpeakers(this.currentConfig);
    }
  }

  public attachVideoElement(videoEl: HTMLVideoElement): void {
    if (this.videoHijackDisabled) return;
    this.pendingVideos.add(videoEl);
    if (!this.ctx || !this.lowShelf) return;
    if (this.videoSources.has(videoEl)) return;
    // Only bind <video> after AudioContext is running and media has decoded frames
    if (this.ctx.state !== 'running' || videoEl.readyState < 2) return;

    try {
      const src = this.ctx.createMediaElementSource(videoEl);
      src.connect(this.lowShelf);
      videoEl.volume = 1;
      this.videoSources.set(videoEl, src);
    } catch {
      // Fallback: if browser blocks or element already bound, video plays directly
    }
  }

  private flushPendingVideos(): void {
    if (this.videoHijackDisabled || !this.ctx || !this.lowShelf || this.ctx.state !== 'running') return;
    this.pendingVideos.forEach((videoEl) => {
      if (this.videoSources.has(videoEl) || videoEl.readyState < 2) return;
      try {
        const src = this.ctx!.createMediaElementSource(videoEl);
        src.connect(this.lowShelf!);
        videoEl.volume = 1;
        this.videoSources.set(videoEl, src);
      } catch {
        // Ignore if element cannot be attached
      }
    });
    if (this.lastMixState) {
      const { settings, showState, windActive, windIntensity } = this.lastMixState;
      this.updateMix(settings, showState, windActive, windIntensity);
    }
  }

  public disableVideoHijack(): void {
    this.videoHijackDisabled = true;
    this.pendingVideos.clear();
    this.videoSources.forEach((src) => {
      try {
        src.disconnect();
      } catch {
        // Ignore
      }
    });
    this.videoSources.clear();
  }

  public hasActiveVideoSignal(): boolean {
    if (!this.signalAnalyser || !this.analyserBuf || this.ctx?.state !== 'running') {
      return false;
    }
    this.signalAnalyser.getFloatTimeDomainData(this.analyserBuf);
    for (let i = 0; i < this.analyserBuf.length; i++) {
      if (Math.abs(this.analyserBuf[i]) > 1e-5) {
        return true;
      }
    }
    return false;
  }

  public updateMix(
    settings: AudioSettings,
    showState: 'AUDITORIUM_OPEN' | 'SHOW_STARTING' | 'SHOW_PLAYING' | 'SHOW_COMPLETED',
    windActive = false,
    windIntensity = 0,
  ): void {
    this.lastMixState = { settings, showState, windActive, windIntensity };
    if (
      !this.ctx ||
      !this.masterGain ||
      !this.videoGain ||
      !this.ambienceGain ||
      !this.effectsGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const master = settings.muted ? 0 : settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.08);

    // Crossfade cleanly between full 3D Dolby speaker array and direct stereo bypass
    if (this.dolbyBusGain && this.stereoDirectGain) {
      this.lastSpatialEnabled = settings.spatialSimulation;
      this.dolbyBusGain.gain.setTargetAtTime(settings.spatialSimulation ? 0.95 : 0, now, 0.12);
      this.stereoDirectGain.gain.setTargetAtTime(settings.spatialSimulation ? 0 : 1, now, 0.12);
    }

    // Pure movie soundtrack output (zero artificial pink-noise ambience or wind static)
    const targetVideoGain = showState === 'SHOW_PLAYING' ? settings.videoVolume : 0.02;
    this.videoGain.gain.setTargetAtTime(targetVideoGain, now, 0.18);
    this.ambienceGain.gain.setTargetAtTime(0, now, 0.1);
    this.effectsGain.gain.setTargetAtTime(0, now, 0.1);
  }

  public fadeInVideo(durationSec = 1.0, targetVolume = 1): void {
    if (!this.ctx || !this.videoGain) return;
    const now = this.ctx.currentTime;
    this.videoGain.gain.cancelScheduledValues(now);
    if (this.ctx.state !== 'running') {
      this.videoGain.gain.setValueAtTime(targetVolume, now);
      return;
    }
    this.videoGain.gain.setValueAtTime(Math.max(0.04, Math.min(targetVolume, 0.08)), now);
    this.videoGain.gain.linearRampToValueAtTime(targetVolume, now + durationSec);
  }

  public fadeOutVideo(durationSec = 1.2): void {
    if (!this.ctx || !this.videoGain) return;
    const now = this.ctx.currentTime;
    this.videoGain.gain.cancelScheduledValues(now);
    this.videoGain.gain.setValueAtTime(this.videoGain.gain.value, now);
    this.videoGain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
  }

  public modulateWind(_speedFactor: number): void {
    // Wind pink-noise modulation removed to keep cinema playback completely disturbance-free
  }

  public dispose(): void {
    this.videoSources.forEach((src) => {
      try {
        src.disconnect();
      } catch {
        // Ignore
      }
    });
    this.videoSources.clear();
    this.pendingVideos.clear();
    this.panners.clear();
    this.sideSurroundGains = [];
    this.rearSurroundGains = [];
    this.atmosHeightGains = [];
    if (this.ctx) {
      this.ctx.onstatechange = null;
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.videoGain = null;
    this.ambienceGain = null;
    this.effectsGain = null;
    this.lowShelf = null;
    this.highShelf = null;
    this.inputBus = null;
    this.signalAnalyser = null;
    this.analyserBuf = null;
    this.stereoDirectGain = null;
    this.dolbyBusGain = null;
    this.splitter = null;
    this.reverbNode = null;
    this.reverbWetGain = null;
    this.lfeGain = null;
    this.currentProfile = null;
    this.currentConfig = null;
    this.lastMixState = null;
    this.isInitialized = false;
    this.iosSilenceUnlocked = false;
    this.videoHijackDisabled = isIosDevice();
    this.lastPose.px = Number.NaN;
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    const running = this.isRunning;
    this.stateListeners.forEach((cb) => cb(running));
  }

  public onStateChange(cb: (running: boolean) => void): () => void {
    this.stateListeners.add(cb);
    cb(this.isRunning);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  public isVideoAttached(videoEl: HTMLVideoElement | null): boolean {
    return Boolean(videoEl && this.videoSources.has(videoEl));
  }

  public get isVideoHijackDisabled(): boolean {
    return this.videoHijackDisabled;
  }

  public get initialized(): boolean {
    return this.isInitialized;
  }

  public get isRunning(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  public get spatialActive(): boolean {
    return this.isInitialized && this.lastSpatialEnabled;
  }

  public get speakerCount(): number {
    return this.panners.size;
  }
}

export const cinemaAudioEngine = new CinemaAudioEngine();
