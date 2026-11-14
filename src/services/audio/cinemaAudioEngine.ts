import { AudioProfile, AudioSettings } from '../../types/cinema';

class CinemaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private videoGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private lowShelf: BiquadFilterNode | null = null;
  private highShelf: BiquadFilterNode | null = null;

  private videoSources = new Map<HTMLVideoElement, MediaElementAudioSourceNode>();

  private ambienceSource: AudioBufferSourceNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private isInitialized = false;

  public async initialize(audioProfile: AudioProfile, seatOffsetRatio: number): Promise<void> {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.videoGain = this.ctx.createGain();
      this.ambienceGain = this.ctx.createGain();
      this.effectsGain = this.ctx.createGain();
      this.pannerNode = this.ctx.createStereoPanner();
      this.lowShelf = this.ctx.createBiquadFilter();
      this.highShelf = this.ctx.createBiquadFilter();

      this.lowShelf.type = 'lowshelf';
      this.lowShelf.frequency.value = 110;
      this.highShelf.type = 'highshelf';
      this.highShelf.frequency.value = 4800;

      // Chain: video -> lowShelf -> highShelf -> panner -> videoGain -> masterGain -> destination
      this.lowShelf.connect(this.highShelf);
      this.highShelf.connect(this.pannerNode);
      this.pannerNode.connect(this.videoGain);
      this.videoGain.connect(this.masterGain);

      this.ambienceGain.connect(this.masterGain);
      this.effectsGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.startProceduralAmbience();
      this.startProceduralWind();
      this.isInitialized = true;
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Requires user gesture if not yet unlocked
      }
    }

    this.applyProfile(audioProfile, seatOffsetRatio);
  }

  public async resume(): Promise<void> {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    try {
      await this.ctx.resume();
    } catch {
      // Ignore resume error if blocked by autoplay policy
    }
  }

  public applyProfile(profile: AudioProfile, seatOffsetRatio: number): void {
    if (!this.ctx || !this.lowShelf || !this.highShelf || !this.pannerNode) return;
    const now = this.ctx.currentTime;
    this.lowShelf.gain.setTargetAtTime(profile.lowShelfGainDb, now, 0.25);
    this.highShelf.gain.setTargetAtTime(profile.highShelfGainDb, now, 0.25);
    // Subtle stereo panning opposite to seat offset (sitting left shifts screen slightly right)
    const pan = Math.max(-0.45, Math.min(0.45, -seatOffsetRatio * profile.spatialSpread * 0.4));
    this.pannerNode.pan.setTargetAtTime(pan, now, 0.2);
  }

  public updateSeatPan(profile: AudioProfile, seatOffsetRatio: number): void {
    if (!this.ctx || !this.pannerNode) return;
    const now = this.ctx.currentTime;
    const pan = Math.max(-0.45, Math.min(0.45, -seatOffsetRatio * profile.spatialSpread * 0.4));
    this.pannerNode.pan.setTargetAtTime(pan, now, 0.25);
  }

  public attachVideoElement(videoEl: HTMLVideoElement): void {
    if (!this.ctx || !this.lowShelf) return;
    if (this.videoSources.has(videoEl)) return;

    try {
      const src = this.ctx.createMediaElementSource(videoEl);
      src.connect(this.lowShelf);
      this.videoSources.set(videoEl, src);
    } catch {
      // Fallback: if browser blocks or element already bound, video plays directly
    }
  }

  public updateMix(
    settings: AudioSettings,
    showState: 'AUDITORIUM_OPEN' | 'SHOW_STARTING' | 'SHOW_PLAYING' | 'SHOW_COMPLETED',
    windActive = false,
    windIntensity = 0,
  ): void {
    if (!this.ctx || !this.masterGain || !this.videoGain || !this.ambienceGain || !this.effectsGain) {
      return;
    }

    const now = this.ctx.currentTime;
    const master = settings.muted ? 0 : settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.08);

    // Prioritize uploaded video audio during show
    const targetVideoGain = showState === 'SHOW_PLAYING' ? settings.videoVolume : 0.02;
    this.videoGain.gain.setTargetAtTime(targetVideoGain, now, 0.35);

    // Subtle auditorium ambience before & after show, very quiet during show
    const ambienceMultiplier = showState === 'SHOW_PLAYING' ? 0.08 : 0.22;
    this.ambienceGain.gain.setTargetAtTime(
      settings.ambienceVolume * ambienceMultiplier,
      now,
      0.6,
    );

    // Optional 4DX wind simulation
    const targetEffect = windActive && showState === 'SHOW_PLAYING'
      ? settings.effectsVolume * windIntensity * 0.16
      : 0;
    this.effectsGain.gain.setTargetAtTime(targetEffect, now, 0.3);
  }

  public fadeInVideo(durationSec = 1.0, targetVolume = 1): void {
    if (!this.ctx || !this.videoGain) return;
    const now = this.ctx.currentTime;
    this.videoGain.gain.cancelScheduledValues(now);
    this.videoGain.gain.setValueAtTime(0.001, now);
    this.videoGain.gain.linearRampToValueAtTime(targetVolume, now + durationSec);
  }

  public fadeOutVideo(durationSec = 1.2): void {
    if (!this.ctx || !this.videoGain) return;
    const now = this.ctx.currentTime;
    this.videoGain.gain.cancelScheduledValues(now);
    this.videoGain.gain.setValueAtTime(this.videoGain.gain.value, now);
    this.videoGain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
  }

  public modulateWind(speedFactor: number): void {
    if (!this.ctx || !this.windFilter || !this.windGain) return;
    const now = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(220 + speedFactor * 480, now, 0.25);
  }

  private createPinkNoiseBuffer(seconds = 4): AudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * seconds;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const output = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  private startProceduralAmbience(): void {
    if (!this.ctx || !this.ambienceGain) return;
    const buffer = this.createPinkNoiseBuffer(4);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;

    source.connect(lp);
    lp.connect(this.ambienceGain);
    source.start();
    this.ambienceSource = source;
    this.ambienceGain.gain.value = 0;
  }

  private startProceduralWind(): void {
    if (!this.ctx || !this.effectsGain) return;
    const buffer = this.createPinkNoiseBuffer(3);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.value = 1;

    source.connect(bp);
    bp.connect(gain);
    gain.connect(this.effectsGain);
    source.start();

    this.windSource = source;
    this.windFilter = bp;
    this.windGain = gain;
    this.effectsGain.gain.value = 0;
  }

  public dispose(): void {
    try {
      this.ambienceSource?.stop();
      this.ambienceSource?.disconnect();
    } catch {
      // Ignore
    }
    try {
      this.windSource?.stop();
      this.windSource?.disconnect();
    } catch {
      // Ignore
    }
    this.videoSources.forEach((src) => {
      try {
        src.disconnect();
      } catch {
        // Ignore
      }
    });
    this.videoSources.clear();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.videoGain = null;
    this.ambienceGain = null;
    this.effectsGain = null;
    this.pannerNode = null;
    this.lowShelf = null;
    this.highShelf = null;
    this.ambienceSource = null;
    this.windSource = null;
    this.isInitialized = false;
  }

  public get initialized(): boolean {
    return this.isInitialized;
  }
}

export const cinemaAudioEngine = new CinemaAudioEngine();
