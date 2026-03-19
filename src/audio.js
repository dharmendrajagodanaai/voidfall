// Procedural audio using Web Audio API
export class AudioManager {
  constructor() {
    this._ctx = null;
    this._ready = false;
    this._masterGain = null;
    // Init on first user interaction
    window.addEventListener('keydown', () => this._init(), { once: true });
    window.addEventListener('mousedown', () => this._init(), { once: true });
  }

  _init() {
    if (this._ready) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 0.4;
      this._masterGain.connect(this._ctx.destination);
      this._ready = true;
    } catch(e) { /* Audio not available */ }
  }

  _play(fn) {
    if (!this._ready || !this._ctx) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();
    fn(this._ctx, this._masterGain);
  }

  playJump() {
    this._play((ctx, out) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain); gain.connect(out);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    });
  }

  playLand() {
    this._play((ctx, out) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      src.connect(gain); gain.connect(out);
      src.start();
    });
  }

  playDash() {
    this._play((ctx, out) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain); gain.connect(out);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    });
  }

  playDissolve() {
    this._play((ctx, out) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.5) * 0.5;
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.value = 0.15;
      src.connect(gain); gain.connect(out);
      src.start();
    });
  }

  playDeath() {
    this._play((ctx, out) => {
      [80, 60, 40].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 2, ctx.currentTime + i * 0.12);
        osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + i * 0.12 + 0.6);
        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.8);
        osc.connect(gain); gain.connect(out);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.8);
      });
    });
  }

  playCheckpoint() {
    this._play((ctx, out) => {
      [440, 550, 660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.3);
        osc.connect(gain); gain.connect(out);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.3);
      });
    });
  }

  playWin() {
    this._play((ctx, out) => {
      [440, 554, 659, 880, 1108].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.6);
        osc.connect(gain); gain.connect(out);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.7);
      });
    });
  }

  playBounce() {
    this._play((ctx, out) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(out);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
    });
  }
}
