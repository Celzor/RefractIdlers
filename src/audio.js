/** Lightweight, gesture-unlocked Web Audio effects. Nothing is downloaded. */
export class GameAudio {
  constructor({ enabled = true } = {}) {
    this._enabled = Boolean(enabled);
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.voices = new Set();
    this.lastPlayed = new Map();
    this.destroyed = false;
  }

  get enabled() {
    return this._enabled;
  }

  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this._enabled ? 0.16 : 0, now, 0.025);
    }
  }

  /** Call directly from a click or key handler, including the sound toggle. */
  async unlock() {
    if (this.destroyed) return false;
    try {
      if (!this.context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = this._enabled ? 0.16 : 0;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.005;
        this.compressor.release.value = 0.15;
        this.master.connect(this.compressor);
        this.compressor.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  /** Options: intensity (0–1), pitch (semitones), pan (-1–1). */
  play(type, options = {}) {
    if (!this._enabled || this.destroyed || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    const throttle = { ray: 0.085, critical: 0.14, collision: 0.12, revolution: 0.12,
      levelup: 0.3, boost: 0.25, purchase: 0.12, reroll: 0.15, countdown: 0.6,
      roundend: 0.5, start: 0.4, click: 0.035, error: 0.15, collect: 0.07, surge: 0.07 };
    if (!(type in throttle) || now - (this.lastPlayed.get(type) ?? -Infinity) < throttle[type]) return;
    if (this.voices.size >= 28) return;
    this.lastPlayed.set(type, now);
    const numeric = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const intensity = Math.max(0, Math.min(1, numeric(options.intensity, 0.65)));
    const pitch = 2 ** (Math.max(-24, Math.min(24, numeric(options.pitch, 0))) / 12);
    const pan = Math.max(-1, Math.min(1, numeric(options.pan, 0)));
    const volume = (0.45 + intensity * 0.55);
    const note = (frequency, offset, duration, gain = 0.2, wave = 'sine', endFrequency = frequency) =>
      this._tone(frequency * pitch, now + offset, duration, gain * volume, wave, endFrequency * pitch, pan);
    const chord = (frequencies, duration = 0.3, gain = 0.12) =>
      frequencies.forEach((frequency, i) => note(frequency, i * 0.045, duration, gain));

    switch (type) {
      case 'ray':
        note(880, 0, 0.115, 0.2, 'sine', 1320);
        note(1760, 0.025, 0.12, 0.06);
        break;
      case 'critical':
        chord([880, 1108.73, 1760], 0.22, 0.17);
        note(2217.46, 0.12, 0.22, 0.05);
        break;
      case 'collect':
        note(1174.66, 0, 0.105, 0.16);
        note(1760, 0.035, 0.15, 0.11);
        break;
      case 'surge':
        note(392, 0, 0.2, 0.11, 'triangle', 783.99);
        note(1174.66, 0.07, 0.22, 0.07);
        break;
      case 'collision':
        note(190, 0, 0.14, 0.24, 'triangle', 85);
        note(760, 0.01, 0.075, 0.08, 'sine', 360);
        break;
      case 'revolution':
        note(523.25, 0, 0.14, 0.11);
        note(783.99, 0.065, 0.18, 0.14);
        break;
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => note(frequency, i * 0.085, 0.3, 0.18));
        note(1567.98, 0.255, 0.4, 0.055);
        break;
      case 'boost':
        note(110, 0, 0.35, 0.24, 'triangle', 660);
        note(330, 0.06, 0.4, 0.11, 'sine', 1320);
        break;
      case 'purchase':
        note(659.25, 0, 0.17, 0.19);
        note(987.77, 0.085, 0.23, 0.2);
        note(1318.51, 0.17, 0.25, 0.09);
        break;
      case 'reroll':
        [392, 523.25, 659.25].forEach((frequency, i) => note(frequency, i * 0.045, 0.1, 0.13, 'triangle'));
        break;
      case 'countdown':
        note(659.25, 0, 0.09, 0.2);
        break;
      case 'roundend':
        chord([523.25, 659.25, 783.99, 1046.5], 0.55, 0.17);
        note(1567.98, 0.24, 0.6, 0.045);
        break;
      case 'start':
        [261.63, 392, 523.25, 783.99].forEach((frequency, i) => note(frequency, i * 0.075, 0.22, 0.17, 'triangle'));
        break;
      case 'click':
        note(740, 0, 0.045, 0.09);
        break;
      case 'error':
        note(220, 0, 0.12, 0.16, 'triangle');
        note(174.61, 0.1, 0.17, 0.13, 'triangle');
        break;
    }
  }

  _tone(frequency, start, duration, volume, wave, endFrequency, pan) {
    if (this.voices.size >= 32 || !this.context || !this.master) return;
    let oscillator;
    let envelope;
    let panner;
    try {
      oscillator = this.context.createOscillator();
      envelope = this.context.createGain();
      panner = this.context.createStereoPanner?.();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.012, duration * 0.2));
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      if (panner) {
        panner.pan.value = pan;
        envelope.connect(panner);
        panner.connect(this.master);
      } else {
        envelope.connect(this.master);
      }
      this.voices.add(oscillator);
      oscillator.onended = () => {
        this.voices.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
        panner?.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.025);
    } catch {
      this.voices.delete(oscillator);
      try { oscillator?.disconnect(); envelope?.disconnect(); panner?.disconnect(); } catch { /* audio unavailable */ }
    }
  }

  destroy() {
    this.destroyed = true;
    for (const oscillator of this.voices) {
      try { oscillator.stop(); } catch { /* already stopped */ }
    }
    this.voices.clear();
    this.lastPlayed.clear();
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.compressor = null;
  }
}
