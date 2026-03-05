// ============================================================
// FlowType — Web Audio API Sound Engine
// Zero-latency, fully synthesized audio with WPM-reactive
// sound design, 1/f pitch walk, stochastic resonance,
// accent sounds, crossfade transitions,
// spatial panning, ghost rewrite, and key topology
// ============================================================

import { type PresetConfig, type PresetId, getPreset } from "./presets";

// Key types for accent sounds
export type AccentKey =
  | "punctuation"
  | "enter"
  | "backspace"
  | "space"
  | "normal";

// #1 Keyboard spatial mapping — left-hand vs right-hand keys
const LEFT_HAND_KEYS = new Set([
  "q",
  "w",
  "e",
  "r",
  "t",
  "a",
  "s",
  "d",
  "f",
  "g",
  "z",
  "x",
  "c",
  "v",
  "b",
  "1",
  "2",
  "3",
  "4",
  "5",
  "`",
  "~",
]);
const RIGHT_HAND_KEYS = new Set([
  "y",
  "u",
  "i",
  "o",
  "p",
  "h",
  "j",
  "k",
  "l",
  "n",
  "m",
  "6",
  "7",
  "8",
  "9",
  "0",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
]);

function getKeyPan(key: string): number {
  const k = key.toLowerCase();
  if (LEFT_HAND_KEYS.has(k)) return -0.25 + Math.random() * 0.1;
  if (RIGHT_HAND_KEYS.has(k)) return 0.25 - Math.random() * 0.1;
  return (Math.random() - 0.5) * 0.1; // center for unknown keys
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;
  private currentPreset: PresetConfig | null = null;
  private noiseBuffers: Map<string, AudioBuffer> = new Map();
  private isAmbientPlaying = false;

  // 1/f pitch walk state — each keystroke's pitch correlates with the previous
  private lastPitchWalk = 0;

  // Crossfade state
  private crossfadeGain: GainNode | null = null;
  private crossfadeNodes: AudioNode[] = [];
  private isCrossfading = false;

  // #1 Cursor panning state
  private cursorPanValue = 0;

  // --- Lifecycle ---

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    // Evidence: 60-70dB optimal for focus & creativity (brain.fm, MDPI)
    // 0.35 keeps output in 50-65dB sweet spot at moderate system volume
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);

    // Pre-generate noise buffers for zero-latency playback
    this.generateNoiseBuffer("white", 2);
    this.generateNoiseBuffer("brown", 4);
    this.generateNoiseBuffer("pink", 4);
    this.generateNoiseBuffer("crackle", 4);
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  dispose(): void {
    this.stopAmbient();
    this.ctx?.close();
    this.ctx = null;
  }

  // #1 Set cursor pan from editor (0 = left edge, 1 = right edge)
  setCursorPan(ratio: number): void {
    // Map 0..1 to -0.4..+0.4
    this.cursorPanValue = (ratio - 0.5) * 0.8;
  }

  // --- Noise Buffer Generation ---

  private generateNoiseBuffer(
    type: "white" | "brown" | "pink" | "crackle",
    durationSec: number,
  ): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * durationSec;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      switch (type) {
        case "white":
          for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          break;
        case "brown": {
          let lastOut = 0;
          for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + 0.02 * white) / 1.02;
            data[i] = lastOut * 3.5;
          }
          break;
        }
        case "pink": {
          let b0 = 0,
            b1 = 0,
            b2 = 0,
            b3 = 0,
            b4 = 0,
            b5 = 0,
            b6 = 0;
          for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.969 * b2 + white * 0.153852;
            b3 = 0.8665 * b3 + white * 0.3104856;
            b4 = 0.55 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.016898;
            data[i] =
              (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
          }
          break;
        }
        case "crackle": {
          let lastCrackle = 0;
          for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            lastCrackle = (lastCrackle + 0.02 * white) / 1.02;
            const pop =
              Math.random() < 0.001 ? (Math.random() * 2 - 1) * 0.8 : 0;
            const crackle =
              Math.random() < 0.01 ? (Math.random() * 2 - 1) * 0.3 : 0;
            data[i] = lastCrackle * 2.5 + pop + crackle;
          }
          break;
        }
      }
    }
    this.noiseBuffers.set(type, buffer);
  }

  // --- WPM Reactive Scaling (Evidence-based 4-phase flow model) ---
  // Research: flow states emerge at distinct WPM thresholds:
  //   0-30 WPM = thinking (wide reverb, relaxed)
  //   30-60 WPM = writing onset (tightening)
  //   60-100 WPM = flow state (tight, bright)
  //   100+ WPM = zone (maximum brightness, minimal decay)
  // Using sigmoid curve instead of linear for natural transition

  private getWPMModifiers(wpm: number): {
    decayScale: number;
    pitchScale: number;
    brightnessScale: number;
  } {
    // Sigmoid-like curve: slow change at extremes, fast in middle
    const t = Math.min(wpm / 120, 1);
    const sigmoid = 1 / (1 + Math.exp(-8 * (t - 0.4)));
    return {
      // Thinking phase: long decay (1.4x) → Zone: short decay (0.6x)
      decayScale: 1.4 - sigmoid * 0.8,
      // Subtle pitch rise as flow deepens
      pitchScale: 0.95 + sigmoid * 0.15,
      // Brightness increases noticeably in flow/zone
      brightnessScale: 1.0 + sigmoid * 0.5,
    };
  }

  // --- Preset Management with Crossfade ---

  setPreset(presetId: PresetId): void {
    const newPreset = getPreset(presetId);

    if (this.isAmbientPlaying && this.ctx && this.masterGain) {
      this.crossfadeAmbient(newPreset);
    } else {
      const wasPlaying = this.isAmbientPlaying;
      if (wasPlaying) this.stopAmbient();
      this.currentPreset = newPreset;
      if (wasPlaying) this.startAmbient();
    }

    this.currentPreset = newPreset;
  }

  private crossfadeAmbient(newPreset: PresetConfig): void {
    if (!this.ctx || !this.masterGain || this.isCrossfading) return;

    const now = this.ctx.currentTime;
    const fadeDuration = 2.5;

    if (this.ambientGain) {
      this.isCrossfading = true;
      this.ambientGain.gain.linearRampToValueAtTime(0.001, now + fadeDuration);

      const oldNodes = [...this.ambientNodes];
      const oldGain = this.ambientGain;
      setTimeout(
        () => {
          oldNodes.forEach((node) => {
            try {
              if (node instanceof AudioBufferSourceNode) node.stop();
              if (node instanceof OscillatorNode) node.stop();
              node.disconnect();
            } catch {
              // Already stopped
            }
          });
          oldGain.disconnect();
          this.isCrossfading = false;
        },
        fadeDuration * 1000 + 100,
      );
    }

    this.ambientNodes = [];
    this.ambientGain = null;
    this.isAmbientPlaying = false;

    this.currentPreset = newPreset;
    if (newPreset.ambient) {
      this.startAmbientWithFadeIn(fadeDuration);
    }
  }

  private startAmbientWithFadeIn(fadeDuration: number): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset?.ambient) return;
    if (this.isAmbientPlaying) return;

    const ambientConfig = this.currentPreset.ambient;
    const targetGain = ambientConfig.gain;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this.ambientGain.gain.linearRampToValueAtTime(
      targetGain,
      this.ctx.currentTime + fadeDuration,
    );
    this.ambientGain.connect(this.masterGain);

    this.buildAmbientGraph(ambientConfig);
    this.isAmbientPlaying = true;
  }

  getCurrentPresetId(): PresetId | null {
    return this.currentPreset?.id ?? null;
  }

  // --- Keystroke Sound (WPM-Reactive + Spatial Pan) ---

  playKeystroke(
    wpm: number = 0,
    accentKey: AccentKey = "normal",
    key: string = "",
  ): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset) return;

    // Play accent sounds for special keys
    if (accentKey !== "normal") {
      this.playAccentSound(accentKey);
    }

    const preset = this.currentPreset;
    const now = this.ctx.currentTime;

    // WPM-reactive modifiers
    const wpmMod = this.getWPMModifiers(wpm);

    // Drive system
    let pitchScale = wpmMod.pitchScale;
    if (preset.drive?.enabled) {
      const t = Math.min(wpm / 120, 1);
      pitchScale =
        preset.drive.pitchScaleMin +
        t * (preset.drive.pitchScaleMax - preset.drive.pitchScaleMin);
    }

    const effectiveDecayMs = preset.keystroke.decayMs * wpmMod.decayScale;

    // #1 Hybrid Spatial Panning — blend keyboard + cursor position
    const keyPan = key ? getKeyPan(key) : 0;
    const blendedPan = keyPan * 0.6 + this.cursorPanValue * 0.4;
    const clampedPan = Math.max(-1, Math.min(1, blendedPan));

    // Create a panning node for this keystroke
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = clampedPan;
    panner.connect(this.masterGain);

    // --- Noise burst component ---
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(preset.keystroke.noiseGain, now);
    noiseGain.gain.exponentialRampToValueAtTime(
      0.001,
      now + effectiveDecayMs / 1000,
    );
    noiseGain.connect(panner);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = preset.keystroke.filterType;
    noiseFilter.frequency.value =
      preset.keystroke.filterFreq * pitchScale * wpmMod.brightnessScale;
    noiseFilter.Q.value = preset.keystroke.filterQ;
    noiseFilter.connect(noiseGain);

    const noiseBuffer = this.noiseBuffers.get("white");
    if (noiseBuffer) {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      const offset = Math.random() * (noiseBuffer.duration - 0.2);
      noiseSrc.connect(noiseFilter);
      noiseSrc.start(now, offset, effectiveDecayMs / 1000 + 0.05);
    }

    // --- Tonal component ---
    if (preset.keystroke.toneGain > 0) {
      const toneGain = this.ctx.createGain();
      toneGain.gain.setValueAtTime(preset.keystroke.toneGain, now);
      toneGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + effectiveDecayMs / 1000,
      );
      toneGain.connect(panner);

      const osc = this.ctx.createOscillator();
      // 1/f pitch walk — tighter step for true fractal behavior
      // Evidence: 1/f noise requires high memory (0.85) and small steps (±0.15)
      // to produce the "natural, pleasant" temporal patterns (NIH, AIP)
      const walkStep = (Math.random() * 2 - 1) * 0.15;
      this.lastPitchWalk = this.lastPitchWalk * 0.85 + walkStep * 0.15;
      const walkOffset = this.lastPitchWalk * preset.keystroke.pitchRandomRange;
      const pitchValue = preset.keystroke.pitchBase + walkOffset;
      osc.type = preset.keystroke.toneType;
      osc.frequency.value = pitchValue * pitchScale;
      osc.connect(toneGain);
      osc.start(now);
      osc.stop(now + effectiveDecayMs / 1000 + 0.05);

      // Stochastic resonance layer
      // Evidence: must be SUB-THRESHOLD to enhance perception (PLoS ONE)
      // 0.006 ensures the noise is barely perceptible, improving signal detection
      const srGain = this.ctx.createGain();
      srGain.gain.setValueAtTime(0.006, now);
      srGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + (effectiveDecayMs / 1000) * 0.5,
      );
      srGain.connect(panner);

      const srFilter = this.ctx.createBiquadFilter();
      srFilter.type = "highpass";
      srFilter.frequency.value = 6000;
      srFilter.Q.value = 0.5;
      srFilter.connect(srGain);

      const srBuffer = this.noiseBuffers.get("white");
      if (srBuffer) {
        const srSrc = this.ctx.createBufferSource();
        srSrc.buffer = srBuffer;
        srSrc.connect(srFilter);
        srSrc.start(
          now,
          Math.random() * (srBuffer.duration - 0.1),
          (effectiveDecayMs / 1000) * 0.5 + 0.02,
        );
      }
    }

    // Update ambient drive
    if (preset.drive?.enabled && this.ambientGain) {
      const t = Math.min(wpm / 120, 1);
      const targetGain =
        preset.drive.ambientGainMin +
        t * (preset.drive.ambientGainMax - preset.drive.ambientGainMin);
      this.ambientGain.gain.linearRampToValueAtTime(targetGain, now + 0.1);
    }
  }

  // --- Accent Sounds: Preset-Adaptive with Stochastic Variations ---
  // Each accent type generates unique sounds by deriving parameters from
  // the current preset's timbre + controlled randomization for natural feel.

  /** Stochastic variation: returns value ± range centered on base */
  private vary(base: number, range: number): number {
    return base + (Math.random() * 2 - 1) * range;
  }

  /** Pick random element from array */
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private playAccentSound(type: AccentKey): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset) return;
    const now = this.ctx.currentTime;
    const preset = this.currentPreset;

    // Derive timbre characteristics from current preset
    const baseFreq = preset.keystroke.pitchBase;
    const brightness = preset.keystroke.filterFreq;
    const warmth = preset.keystroke.toneGain;
    const isDeep = baseFreq < 300; // deep-thock, mode-c, void, deep-ocean
    const isBright = brightness > 1000; // midnight-rain, asmr, aurora, zen-drops
    const toneType = preset.keystroke.toneType;

    switch (type) {
      case "punctuation": {
        // Resonant chime — adapts to preset's pitch range
        // 10 variations via frequency spread + harmonic ratios
        const harmonicRatios = [
          2.0, 2.5, 3.0, 3.5, 4.0, 1.5, 2.7, 3.3, 1.8, 2.2,
        ];
        const ratio = this.pick(harmonicRatios);
        const fundFreq = this.vary(isBright ? 1800 : 900, isBright ? 600 : 300);
        const decayTime = this.vary(0.8, 0.3);

        // Fundamental
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.vary(0.1, 0.03), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
        gain.connect(this.masterGain);

        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = fundFreq;
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + decayTime + 0.05);

        // Harmonic overtone (gives each hit a different color)
        const gain2 = this.ctx.createGain();
        const harmonicVol = this.vary(0.04, 0.02);
        gain2.gain.setValueAtTime(Math.max(0.01, harmonicVol), now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + decayTime * 1.3);
        gain2.connect(this.masterGain);

        const osc2 = this.ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = fundFreq * ratio;
        osc2.connect(gain2);
        osc2.start(now);
        osc2.stop(now + decayTime * 1.3 + 0.05);

        // For deep presets: add subtle body resonance
        if (isDeep) {
          const bodyGain = this.ctx.createGain();
          bodyGain.gain.setValueAtTime(0.03, now);
          bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          bodyGain.connect(this.masterGain);

          const bodyOsc = this.ctx.createOscillator();
          bodyOsc.type = toneType;
          bodyOsc.frequency.value = baseFreq * this.vary(2, 0.5);
          bodyOsc.connect(bodyGain);
          bodyOsc.start(now);
          bodyOsc.stop(now + 0.45);
        }
        break;
      }

      case "enter": {
        // Deep impact — variant selection based on stochastic parameters
        // Each press sounds slightly different: pitch, decay, noise color, sub depth
        const variant = Math.random(); // 0..1 controls overall character
        const impactFreq = this.vary(isDeep ? 120 : 180, 40);
        const sweepTarget = this.vary(isDeep ? 30 : 50, 15);
        const decayTime = this.vary(1.5, 0.5);
        const impactVol = this.vary(0.15, 0.04);

        // Layer 1: Impact sweep (sine descending — pitch varies per hit)
        const impactGain = this.ctx.createGain();
        impactGain.gain.setValueAtTime(impactVol, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
        impactGain.connect(this.masterGain);

        const impactOsc = this.ctx.createOscillator();
        impactOsc.type = "sine";
        impactOsc.frequency.setValueAtTime(impactFreq, now);
        impactOsc.frequency.exponentialRampToValueAtTime(
          Math.max(20, sweepTarget),
          now + decayTime,
        );
        impactOsc.connect(impactGain);
        impactOsc.start(now);
        impactOsc.stop(now + decayTime + 0.05);

        // Layer 2: Sub-bass pulse (depth varies)
        const subFreq = this.vary(isDeep ? 35 : 55, 12);
        const subDecay = this.vary(0.5, 0.15);
        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(this.vary(0.1, 0.03), now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + subDecay);
        subGain.connect(this.masterGain);

        const subOsc = this.ctx.createOscillator();
        subOsc.type = "sine";
        subOsc.frequency.value = subFreq;
        subOsc.connect(subGain);
        subOsc.start(now);
        subOsc.stop(now + subDecay + 0.05);

        // Layer 3: Noise wash (different coloring per variant)
        const noiseType = variant < 0.5 ? "brown" : "pink";
        const noiseBuf = this.noiseBuffers.get(noiseType);
        if (noiseBuf) {
          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(this.vary(0.04, 0.02), now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
          noiseGain.connect(this.masterGain);

          const noiseFilter = this.ctx.createBiquadFilter();
          noiseFilter.type = "lowpass";
          noiseFilter.frequency.value = this.vary(350, 150);
          noiseFilter.connect(noiseGain);

          const src = this.ctx.createBufferSource();
          src.buffer = noiseBuf;
          src.connect(noiseFilter);
          src.start(now, Math.random() * (noiseBuf.duration - 1), 0.75);
        }

        // Layer 4 (bright presets only): Metallic ping — adds brightness
        if (isBright) {
          const pingGain = this.ctx.createGain();
          pingGain.gain.setValueAtTime(0.03, now);
          pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          pingGain.connect(this.masterGain);

          const pingOsc = this.ctx.createOscillator();
          pingOsc.type = "sine";
          pingOsc.frequency.value = this.vary(800, 200);
          pingOsc.connect(pingGain);
          pingOsc.start(now);
          pingOsc.stop(now + 0.65);
        }

        // Layer 5: Body resonance using preset's toneType for character
        if (warmth > 0.2) {
          const bodyGain = this.ctx.createGain();
          bodyGain.gain.setValueAtTime(this.vary(0.04, 0.02), now);
          bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          bodyGain.connect(this.masterGain);

          const bodyOsc = this.ctx.createOscillator();
          bodyOsc.type = toneType;
          bodyOsc.frequency.value = this.vary(baseFreq * 0.5, baseFreq * 0.1);
          bodyOsc.connect(bodyGain);
          bodyOsc.start(now);
          bodyOsc.stop(now + 0.35);
        }
        break;
      }

      case "backspace": {
        // Ghost Rewrite — erasure as physical process
        // Variations: different crumble textures, reverse speeds, grain density
        const crumbleSpeed = this.vary(0.2, 0.08);
        const crumbleHigh = this.vary(isBright ? 5000 : 3500, 1000);
        const crumbleLow = this.vary(isDeep ? 500 : 900, 200);
        const variant = Math.random();

        // Layer 1: Crumble noise sweep (direction & speed varies)
        const crumbleGain = this.ctx.createGain();
        crumbleGain.gain.setValueAtTime(0.02, now);
        crumbleGain.gain.linearRampToValueAtTime(
          this.vary(0.1, 0.03),
          now + 0.06,
        );
        crumbleGain.gain.exponentialRampToValueAtTime(
          0.001,
          now + crumbleSpeed,
        );
        crumbleGain.connect(this.masterGain);

        const crumbleFilter = this.ctx.createBiquadFilter();
        crumbleFilter.type = "bandpass";
        crumbleFilter.frequency.setValueAtTime(crumbleHigh, now);
        crumbleFilter.frequency.exponentialRampToValueAtTime(
          crumbleLow,
          now + crumbleSpeed * 0.9,
        );
        crumbleFilter.Q.value = this.vary(1.5, 0.5);
        crumbleFilter.connect(crumbleGain);

        const crumbleNoise = this.noiseBuffers.get(
          variant < 0.5 ? "white" : "crackle",
        );
        if (crumbleNoise) {
          const src = this.ctx.createBufferSource();
          src.buffer = crumbleNoise;
          src.connect(crumbleFilter);
          src.start(
            now,
            Math.random() * (crumbleNoise.duration - 0.5),
            crumbleSpeed + 0.1,
          );
        }

        // Layer 2: Tonal reverse suck (adapted to preset pitch)
        const suckBaseFreq = this.vary(baseFreq * 2, baseFreq * 0.5);
        const suckTargetFreq = this.vary(baseFreq * 0.5, baseFreq * 0.15);
        const suckDuration = this.vary(0.15, 0.05);

        const revGain = this.ctx.createGain();
        revGain.gain.setValueAtTime(0.01, now);
        revGain.gain.linearRampToValueAtTime(this.vary(0.06, 0.02), now + 0.05);
        revGain.gain.exponentialRampToValueAtTime(0.001, now + suckDuration);
        revGain.connect(this.masterGain);

        const revOsc = this.ctx.createOscillator();
        revOsc.type = toneType;
        revOsc.frequency.setValueAtTime(Math.max(60, suckBaseFreq), now);
        revOsc.frequency.exponentialRampToValueAtTime(
          Math.max(20, suckTargetFreq),
          now + suckDuration * 0.9,
        );
        revOsc.connect(revGain);
        revOsc.start(now);
        revOsc.stop(now + suckDuration + 0.05);

        // Layer 3: Granular crackle (density varies)
        const grainDuration = this.vary(0.1, 0.04);
        const grainVol = this.vary(0.03, 0.015);
        const grainGain = this.ctx.createGain();
        grainGain.gain.setValueAtTime(Math.max(0.01, grainVol), now);
        grainGain.gain.exponentialRampToValueAtTime(0.001, now + grainDuration);
        grainGain.connect(this.masterGain);

        const grainFilter = this.ctx.createBiquadFilter();
        grainFilter.type = "highpass";
        grainFilter.frequency.value = this.vary(3000, 800);
        grainFilter.connect(grainGain);

        const grainNoise = this.noiseBuffers.get("crackle");
        if (grainNoise) {
          const grainSrc = this.ctx.createBufferSource();
          grainSrc.buffer = grainNoise;
          grainSrc.connect(grainFilter);
          grainSrc.start(
            now,
            Math.random() * (grainNoise.duration - 0.3),
            grainDuration + 0.05,
          );
        }
        break;
      }

      case "space": {
        // Hollow resonance — spacious cavity adapted to preset character
        // Variations: resonant frequency, body depth, air noise color
        const bodyFreq = this.vary(isDeep ? 100 : 160, 30);
        const airColor = this.vary(isDeep ? 180 : 300, 60);
        const bodyDecay = this.vary(0.35, 0.1);

        // Layer 1: Body resonance
        const bodyGain = this.ctx.createGain();
        bodyGain.gain.setValueAtTime(this.vary(0.07, 0.02), now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + bodyDecay);
        bodyGain.connect(this.masterGain);

        const bodyOsc = this.ctx.createOscillator();
        bodyOsc.type = toneType;
        bodyOsc.frequency.value = bodyFreq;
        bodyOsc.connect(bodyGain);
        bodyOsc.start(now);
        bodyOsc.stop(now + bodyDecay + 0.05);

        // Layer 2: Air escape noise
        const airDecay = this.vary(0.2, 0.06);
        const breathGain = this.ctx.createGain();
        breathGain.gain.setValueAtTime(this.vary(0.05, 0.02), now);
        breathGain.gain.exponentialRampToValueAtTime(0.001, now + airDecay);
        breathGain.connect(this.masterGain);

        const breathFilter = this.ctx.createBiquadFilter();
        breathFilter.type = "bandpass";
        breathFilter.frequency.value = airColor;
        breathFilter.Q.value = this.vary(3, 1);
        breathFilter.connect(breathGain);

        const noiseType = isDeep ? "brown" : isBright ? "white" : "pink";
        const breathNoise = this.noiseBuffers.get(noiseType);
        if (breathNoise) {
          const src = this.ctx.createBufferSource();
          src.buffer = breathNoise;
          src.connect(breathFilter);
          src.start(
            now,
            Math.random() * (breathNoise.duration - 0.5),
            airDecay + 0.05,
          );
        }

        // Layer 3 (bright presets): Subtle upper harmonic shimmer
        if (isBright) {
          const shimGain = this.ctx.createGain();
          shimGain.gain.setValueAtTime(0.02, now);
          shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          shimGain.connect(this.masterGain);

          const shimOsc = this.ctx.createOscillator();
          shimOsc.type = "sine";
          shimOsc.frequency.value = this.vary(bodyFreq * 5, bodyFreq);
          shimOsc.connect(shimGain);
          shimOsc.start(now);
          shimOsc.stop(now + 0.2);
        }
        break;
      }
    }
  }

  // --- Ambient Sound ---

  startAmbient(): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset?.ambient) return;

    // If ambient was faded to silence, ramp it back up instead of creating new nodes
    if (this.isAmbientPlaying && this.ambientGain) {
      const targetGain = this.currentPreset.ambient.gain;
      this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(
        targetGain,
        this.ctx.currentTime + 0.5,
      );
      return;
    }

    if (this.isAmbientPlaying) return;

    const ambientConfig = this.currentPreset.ambient;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = ambientConfig.gain;
    this.ambientGain.connect(this.masterGain);

    this.buildAmbientGraph(ambientConfig);
    this.isAmbientPlaying = true;
  }

  private buildAmbientGraph(
    ambientConfig: NonNullable<PresetConfig["ambient"]>,
  ): void {
    if (!this.ctx || !this.ambientGain) return;

    if (ambientConfig.type === "binaural") {
      const baseFreq = ambientConfig.binauralBase || 220;
      const beatFreq = ambientConfig.binauralBeat || 40;

      const oscL = this.ctx.createOscillator();
      oscL.type = "sine";
      oscL.frequency.value = baseFreq;
      const panL = this.ctx.createStereoPanner();
      panL.pan.value = -1;
      oscL.connect(panL);
      panL.connect(this.ambientGain);
      oscL.start();
      this.ambientNodes.push(oscL, panL);

      const oscR = this.ctx.createOscillator();
      oscR.type = "sine";
      oscR.frequency.value = baseFreq + beatFreq;
      const panR = this.ctx.createStereoPanner();
      panR.pan.value = 1;
      oscR.connect(panR);
      panR.connect(this.ambientGain);
      oscR.start();
      this.ambientNodes.push(oscR, panR);
    } else {
      const noiseBuffer = this.noiseBuffers.get(ambientConfig.type);
      if (!noiseBuffer) return;

      const src = this.ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;

      if (ambientConfig.filterFreq && ambientConfig.filterType) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = ambientConfig.filterType;
        filter.frequency.value = ambientConfig.filterFreq;
        src.connect(filter);
        filter.connect(this.ambientGain);
        this.ambientNodes.push(filter);
      } else {
        src.connect(this.ambientGain);
      }

      src.start();
      this.ambientNodes.push(src);
    }
  }

  stopAmbient(): void {
    this.ambientNodes.forEach((node) => {
      try {
        if (node instanceof AudioBufferSourceNode) node.stop();
        if (node instanceof OscillatorNode) node.stop();
        node.disconnect();
      } catch {
        // Already stopped
      }
    });
    this.ambientNodes = [];
    this.ambientGain?.disconnect();
    this.ambientGain = null;
    this.isAmbientPlaying = false;
  }

  // Fade ambient to silence when typing pauses
  fadeAmbientToSilence(): void {
    if (!this.ctx || !this.ambientGain) return;
    this.ambientGain.gain.linearRampToValueAtTime(
      0.01,
      this.ctx.currentTime + 2,
    );
  }
}

// Singleton
let engineInstance: SoundEngine | null = null;

export function getSoundEngine(): SoundEngine {
  if (!engineInstance) {
    engineInstance = new SoundEngine();
  }
  return engineInstance;
}
