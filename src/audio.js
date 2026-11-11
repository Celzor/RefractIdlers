/** Soft arcade bleeps and coin ticks, synthesized after a user gesture. */
const MASTER_LEVEL = 0.12;
export class GameAudio {
  constructor({ enabled = true } = {}) {
    this._enabled = Boolean(enabled);
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.toneFilter = null;
    this.voices = new Set();
    this.lastPlayed = new Map();
    this.destroyed = false;
    this.finaleActive = false;
    this.noiseBuffer = null;
  }

  get enabled() {
    return this._enabled;
  }

  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this._enabled ? MASTER_LEVEL : 0, now, 0.025);
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
        this.master.gain.value = this._enabled ? MASTER_LEVEL : 0;
        // Round the sharp edge off the pulse waves, especially during rapid clicks.
        this.toneFilter = this.context.createBiquadFilter();
        this.toneFilter.type = 'lowpass';
        this.toneFilter.frequency.value = 2800;
        this.toneFilter.Q.value = 0.45;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.005;
        this.compressor.release.value = 0.15;
        this.master.connect(this.toneFilter);
        this.toneFilter.connect(this.compressor);
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
    if (this.finaleActive || !this._enabled || this.destroyed || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    const throttle = { ray: 0.085, critical: 0.14, collision: 0.12, revolution: 0.12,
      levelup: 0.3, boost: 0.25, purchase: 0.12, reroll: 0.15, countdown: 0.6,
      roundend: 0.5, start: 0.4, click: 0.035, error: 0.15, collect: 0.07, surge: 0.07,
      water: 0.12, sprinkle: 0.12, hit: 0.05, shatter: 0.12, boss: 0.45, mouse: 0.18, laser: 0.9, probe: 0.35, gate: 1.5 };
    if (!(type in throttle) || now - (this.lastPlayed.get(type) ?? -Infinity) < throttle[type]) return;
    if (this.voices.size >= 28) return;
    this.lastPlayed.set(type, now);
    const numeric = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const intensity = Math.max(0, Math.min(1, numeric(options.intensity, 0.65)));
    const pitch = 2 ** (Math.max(-24, Math.min(24, numeric(options.pitch, 0))) / 12);
    const pan = Math.max(-1, Math.min(1, numeric(options.pan, 0)));
    const volume = (0.45 + intensity * 0.55);
    const note = (frequency, offset, duration, gain = 0.2, wave = 'triangle', endFrequency = frequency) =>
      this._tone(frequency * pitch, now + offset, duration, gain * volume, wave, endFrequency * pitch, pan);
    const arpeggio = (frequencies, step = 0.055, duration = 0.1, gain = 0.12) =>
      frequencies.forEach((frequency, i) => note(frequency, i * step, duration, gain, i % 2 ? 'triangle' : 'square'));

    switch (type) {
      case 'mouse':
        note(680, 0, 0.025, 0.07, 'square', 420);
        note(1360, 0.018, 0.02, 0.035, 'triangle');
        break;
      case 'laser':
        // A deliberately ridiculous arcade BWAAAH, made from oscillators.
        note(170, 0, 0.34, 0.13, 'sawtooth', 48);
        note(340, 0.012, 0.27, 0.075, 'square', 74);
        note(1100, 0, 0.07, 0.04, 'triangle', 160);
        break;
      case 'probe':
        note(1568, 0, 0.085, 0.07, 'sine', 784);
        note(2093, 0.055, 0.05, 0.03, 'triangle', 1047);
        break;
      case 'gate':
        note(65.41, 0, 0.4, 0.14, 'triangle', 130.81);
        arpeggio([261.63, 392, 523.25, 1046.5], 0.055, 0.12, 0.055);
        note(1567.98, 0.19, 0.19, 0.035, 'sine', 392);
        break;
      case 'hit':
        note(220, 0, 0.04, 0.12, 'triangle', 130);
        note(880, 0.005, 0.025, 0.06, 'square');
        break;
      case 'shatter':
        // A small glassy crack followed by coins settling onto the table.
        note(164, 0, 0.055, 0.16, 'triangle', 82);
        note(1760, 0.008, 0.06, 0.065, 'square', 1320);
        arpeggio([1046.5, 1567.98, 2093], 0.035, 0.08, 0.12);
        break;
      case 'boss':
        note(130.81, 0, 0.19, 0.15, 'triangle', 65.41);
        arpeggio([392, 523.25, 659.25, 783.99, 1046.5], 0.06, 0.15, 0.14);
        note(1567.98, 0.24, 0.16, 0.06, 'sine');
        break;
      case 'ray':
        note(784, 0, 0.055, 0.10, 'square');
        note(1046.5, 0.022, 0.055, 0.065);
        break;
      case 'critical':
        arpeggio([783.99, 1046.5, 1567.98], 0.045, 0.11, 0.16);
        note(2093, 0.11, 0.095, 0.035, 'sine');
        break;
      case 'collect':
        note(1046.5, 0, 0.055, 0.12, 'square');
        note(1567.98, 0.045, 0.115, 0.105, 'sine');
        break;
      case 'surge':
        arpeggio([392, 523.25, 659.25, 1046.5], 0.055, 0.14, 0.13);
        note(196, 0, 0.25, 0.12);
        break;
      case 'collision':
        note(180, 0, 0.075, 0.18, 'triangle', 90);
        note(540, 0.005, 0.035, 0.065, 'square');
        break;
      case 'revolution':
        arpeggio([523.25, 783.99], 0.07, 0.1, 0.11);
        break;
      case 'levelup':
        arpeggio([523.25, 659.25, 783.99, 1046.5], 0.065, 0.15, 0.15);
        note(523.25, 0.2, 0.22, 0.095);
        break;
      case 'boost':
        arpeggio([196, 261.63, 392, 523.25, 783.99], 0.04, 0.075, 0.13);
        break;
      case 'purchase':
        // A low wooden tick followed by a tiny till-register melody.
        note(196, 0, 0.04, 0.12, 'triangle', 140);
        arpeggio([659.25, 987.77, 1318.51], 0.05, 0.095, 0.15);
        break;
      case 'water':
        // A watering can: a soft pour and two bright drips.
        note(523.25, 0, 0.06, 0.08, 'sine', 392);
        note(1046.5, 0.035, 0.04, 0.05, 'triangle', 1318.51);
        note(783.99, 0.08, 0.09, 0.06, 'sine', 659.25);
        break;
      case 'sprinkle':
        // A shake of the fertiliser sack: three dry little ticks.
        note(220, 0, 0.03, 0.09, 'square', 180);
        note(246.94, 0.04, 0.03, 0.08, 'square', 200);
        note(261.63, 0.08, 0.05, 0.07, 'triangle', 196);
        break;
      case 'reroll':
        arpeggio([392, 493.88, 587.33], 0.04, 0.07, 0.12);
        break;
      case 'countdown':
        note(523.25, 0, 0.07, 0.13, 'square');
        break;
      case 'roundend':
        arpeggio([523.25, 659.25, 783.99, 1046.5], 0.085, 0.16, 0.14);
        note(261.63, 0.25, 0.3, 0.10);
        break;
      case 'start':
        arpeggio([261.63, 392, 523.25, 783.99], 0.065, 0.12, 0.14);
        break;
      case 'click':
        note(392, 0, 0.035, 0.13, 'square', 330);
        note(1046.5, 0.009, 0.045, 0.08, 'sine');
        break;
      case 'error':
        note(220, 0, 0.08, 0.12, 'square');
        note(174.61, 0.08, 0.1, 0.10, 'triangle');
        break;
    }
  }

  /** Collapse a batch of orb breaks into one bounded, throttled reward cue. */
  orbBreak(kills = 1, boss = false) {
    if (this.finaleActive || !Number.isFinite(kills) || kills <= 0) return;
    const weight = Math.log2(1 + Math.min(kills, 1e6));
    this.play(boss ? 'boss' : 'shatter', {
      intensity: Math.min(0.85, 0.45 + weight * 0.08),
      pitch: Math.min(5, Math.floor(weight - 1)),
    });
  }

  /** Silence every scheduled source before giving the finale the audio channel. */
  beginFinale() {
    if (this.destroyed) return;
    this.finaleActive = true;
    this._stopVoices();
    this.lastPlayed.clear();
  }

  /** An original synthesized score. No samples, movie audio, or wall-clock timers. */
  playFinale({elapsed=0}={}) {
    if (!this.finaleActive || !this._enabled || this.destroyed || this.context?.state !== 'running') return false;
    this._stopVoices();
    const now = this.context.currentTime;
    const offset=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
    const voice = (options) => {if((options.at||0)>=offset)this._finaleVoice({...options,start:now+(options.at||0)-offset});};
    // A breath of near-silence, an inward pull, then a deliberate quarter-second gap.
    voice({at:.55,duration:2.62,noise:true,gain:.055,attack:2.35,filterFrom:180,filterTo:2400,pan:-.2});
    voice({at:.8,duration:2.37,frequency:82,to:49,gain:.12,attack:2.05,wave:'sine'});
    voice({at:1.45,duration:1.72,frequency:148,to:295,gain:.045,attack:1.35,wave:'triangle',pan:.25});
    // The first transient and descending body are independently enveloped. Their
    // combined level stays below the master compressor's bounded output.
    voice({at:3.55,duration:3.1,frequency:94,to:27,gain:.43,attack:.009,wave:'triangle'});
    voice({at:3.55,duration:3.9,frequency:53,to:26,gain:.38,attack:.025,wave:'sine'});
    voice({at:3.55,duration:1.5,noise:true,gain:.23,attack:.004,filterFrom:6500,filterTo:190});
    voice({at:3.56,duration:.22,noise:true,gain:.11,attack:.002,filterFrom:9000,filterTo:1700,pan:.1});
    voice({at:3.64,duration:1.6,frequency:440,to:55,gain:.13,attack:.02,wave:'sine'});
    voice({at:3.9,duration:3.4,noise:true,gain:.055,attack:.14,filterFrom:1800,filterTo:110,pan:-.55});
    voice({at:4.05,duration:3.2,noise:true,gain:.045,attack:.17,filterFrom:2200,filterTo:130,pan:.55});
    [392,493.88,587.33,783.99].forEach((frequency,index)=>voice({at:4.1+index*.16,duration:4.3,frequency,to:frequency*.995,gain:.055,attack:.025,wave:'sine',pan:(index-1.5)*.3}));
    [196,293.66,440,587.33].forEach((frequency,index)=>voice({at:6.8+index*.12,duration:6.1,frequency,to:frequency*1.003,gain:.052,attack:1.6,wave:'sine',pan:(index-1.5)*.28}));
    [1174.66,1567.98,1975.53].forEach((frequency,index)=>voice({at:8.3+index*.7,duration:2.8,frequency,gain:.035,attack:.025,wave:'sine',pan:index%2?.65:-.65}));
    [392,587.33,783.99,1174.66].forEach((frequency,index)=>voice({at:12.5+index*.22,duration:3.1,frequency,gain:.045,attack:.08,wave:'sine',pan:(index-1.5)*.2}));
    return true;
  }

  /** Closing or skipping the film never leaves scheduled sounds behind. */
  endFinale() {
    this._stopVoices();
    this.finaleActive = false;
    this.lastPlayed.clear();
  }

  _stopVoices() {
    for (const source of this.voices) {
      try { source.stop(); } catch { /* ended or never started */ }
      try { source.disconnect(); } catch { /* detached */ }
    }
    this.voices.clear();
  }

  _finaleVoice({start,duration,frequency=220,to=frequency,gain=.1,attack=.01,wave='sine',pan=0,noise=false,filterFrom=2800,filterTo=500}) {
    if (!this.finaleActive || !this.context || !this.master || this.voices.size>=32) return;
    const context=this.context,nodes=[];let source;
    try {
      if(noise){
        if(!this.noiseBuffer){
          this.noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*2),context.sampleRate);
          const samples=this.noiseBuffer.getChannelData(0);let random=0x52454652;
          for(let i=0;i<samples.length;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;samples[i]=(random/0x100000000*2-1)*.7;}
        }
        source=context.createBufferSource();source.buffer=this.noiseBuffer;source.loop=true;
      }else{
        source=context.createOscillator();source.type=wave;
        source.frequency.setValueAtTime(Math.max(20,Math.min(12000,frequency)),start);
        if(to!==frequency)source.frequency.exponentialRampToValueAtTime(Math.max(20,Math.min(12000,to)),start+duration);
      }
      const envelope=context.createGain(),panner=context.createStereoPanner?.();nodes.push(envelope);
      const peak=Math.max(0,Math.min(.5,gain)),rise=Math.max(.002,Math.min(duration*.93,attack));
      envelope.gain.setValueAtTime(0,start);
      envelope.gain.linearRampToValueAtTime(peak,start+rise);
      envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
      if(noise){
        const filter=context.createBiquadFilter();nodes.push(filter);filter.type='lowpass';filter.Q.value=.65;
        filter.frequency.setValueAtTime(filterFrom,start);filter.frequency.exponentialRampToValueAtTime(filterTo,start+duration);
        source.connect(filter);filter.connect(envelope);
      }else source.connect(envelope);
      if(panner){nodes.push(panner);panner.pan.value=Math.max(-1,Math.min(1,pan));envelope.connect(panner);panner.connect(this.master);}else envelope.connect(this.master);
      this.voices.add(source);
      source.onended=()=>{this.voices.delete(source);try{source.disconnect();for(const node of nodes)node.disconnect();}catch{/* disposed */}};
      source.start(start);source.stop(start+duration+.04);
    }catch{
      this.voices.delete(source);try{source?.disconnect();for(const node of nodes)node.disconnect();}catch{/* audio unavailable */}
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
      envelope.gain.linearRampToValueAtTime(volume * (wave === 'square' ? 0.5 : 1), start + Math.min(0.004, duration * 0.15));
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
    this._stopVoices();
    this.finaleActive = false;
    this.lastPlayed.clear();
    this.master?.disconnect();
    this.toneFilter?.disconnect();
    this.compressor?.disconnect();
    this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.toneFilter = null;
    this.noiseBuffer = null;
  }
}
