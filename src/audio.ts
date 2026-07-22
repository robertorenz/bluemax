/**
 * Fully procedural WebAudio effects — no audio files.
 * The context is created lazily from the first user gesture (start button),
 * so every method is a safe no-op until init() has run.
 */
export class AudioFx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineOscA!: OscillatorNode;
  private engineOscB!: OscillatorNode;
  private rainGain!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // One second of white noise, reused by guns and explosions.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine drone: two detuned oscillators through a lowpass.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.value = 55;
    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = 'square';
    this.engineOscB.frequency.value = 27;
    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOscA.start();
    this.engineOscB.start();

    // Rain: looped noise through a lowpass, silent until weather calls for it.
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = this.noise;
    rainSrc.loop = true;
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = 'lowpass';
    rainLp.frequency.value = 950;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainLp).connect(this.rainGain).connect(this.master);
    rainSrc.start();
  }

  /** Rain bed volume; intensity 0..1. */
  setRain(intensity: number): void {
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(intensity * 0.13, this.ctx.currentTime, 0.6);
  }

  /** Rolling thunder, delayed like a distant strike. */
  thunder(delaySec = 0.8): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delaySec;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.32; // deep and slow
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(240, t);
    lp.frequency.exponentialRampToValueAtTime(55, t + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.14, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 3);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(52, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.38, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + 1.4);
  }

  /** Drive the engine drone; intensity 0..1 maps to rpm pitch and volume. */
  setEngine(intensity: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOscA.frequency.setTargetAtTime(45 + intensity * 52, t, 0.08);
    this.engineOscB.frequency.setTargetAtTime(22 + intensity * 26, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(250 + intensity * 720, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + intensity * 0.12, t, 0.08);
  }

  gun(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 500;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + 0.1);
  }

  explosion(big = false): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(big ? 1000 : 700, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + (big ? 0.7 : 0.45));
    const g = ctx.createGain();
    g.gain.setValueAtTime(big ? 0.65 : 0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.8 : 0.5));
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 1);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(big ? 110 : 90, t);
    thump.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(big ? 0.55 : 0.32, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.45);
  }

  bombWhistle(dur: number): void {
    if (!this.ctx || dur <= 0.1) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1250, t);
    o.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + Math.min(0.15, dur * 0.3));
    g.gain.setValueAtTime(0.09, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
