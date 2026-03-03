// ============================================================
// FlowType — Web Audio API Sound Engine
// Zero-latency, fully synthesized audio with WPM-reactive
// sound design, 1/f pitch walk, stochastic resonance,
// accent sounds, and crossfade transitions
// ============================================================

import { type PresetConfig, type PresetId, getPreset } from "./presets";

// Key types for accent sounds
export type AccentKey = "punctuation" | "enter" | "backspace" | "normal";

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

  // --- Lifecycle ---

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;
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

  // --- WPM Reactive Scaling ---
  // All presets now respond to WPM, not just drive-enabled ones.
  // Low WPM → wide decay, spacious. High WPM → tight, bright.

  private getWPMModifiers(wpm: number): {
    decayScale: number;
    pitchScale: number;
    brightnessScale: number;
  } {
    const t = Math.min(wpm / 120, 1); // normalize 0-1
    return {
      // Decay shortens as WPM increases (1.3x → 0.7x)
      decayScale: 1.3 - t * 0.6,
      // Pitch rises subtly with WPM (0.95x → 1.1x)
      pitchScale: 0.95 + t * 0.15,
      // Filter opens up slightly at high WPM (1.0x → 1.3x)
      brightnessScale: 1.0 + t * 0.3,
    };
  }

  // --- Preset Management with Crossfade ---

  setPreset(presetId: PresetId): void {
    const newPreset = getPreset(presetId);

    if (this.isAmbientPlaying && this.ctx && this.masterGain) {
      // Crossfade: fade out old ambient, start new
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
    const fadeDuration = 2.5; // seconds

    // Fade out old ambient
    if (this.ambientGain) {
      this.isCrossfading = true;
      this.ambientGain.gain.linearRampToValueAtTime(0.001, now + fadeDuration);

      // Schedule cleanup of old nodes
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

    // Reset ambient state for new preset
    this.ambientNodes = [];
    this.ambientGain = null;
    this.isAmbientPlaying = false;

    // Start new ambient (will fade in via startAmbient)
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

  // --- Keystroke Sound (WPM-Reactive for ALL presets) ---

  playKeystroke(wpm: number = 0, accentKey: AccentKey = "normal"): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset) return;

    // Play accent sounds for special keys
    if (accentKey !== "normal") {
      this.playAccentSound(accentKey);
    }

    const preset = this.currentPreset;
    const now = this.ctx.currentTime;

    // WPM-reactive modifiers (applies to ALL presets)
    const wpmMod = this.getWPMModifiers(wpm);

    // Drive system overrides pitch scale if enabled
    let pitchScale = wpmMod.pitchScale;
    if (preset.drive?.enabled) {
      const t = Math.min(wpm / 120, 1);
      pitchScale =
        preset.drive.pitchScaleMin +
        t * (preset.drive.pitchScaleMax - preset.drive.pitchScaleMin);
    }

    // Effective decay with WPM scaling
    const effectiveDecayMs = preset.keystroke.decayMs * wpmMod.decayScale;

    // --- Noise burst component ---
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(preset.keystroke.noiseGain, now);
    noiseGain.gain.exponentialRampToValueAtTime(
      0.001,
      now + effectiveDecayMs / 1000,
    );
    noiseGain.connect(this.masterGain);

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
      toneGain.connect(this.masterGain);

      const osc = this.ctx.createOscillator();
      // 1/f pitch walk: pitch correlates with previous via Brownian walk
      // instead of pure random (white noise = 0/f), creating organic melody
      const walkStep = (Math.random() * 2 - 1) * 0.3;
      this.lastPitchWalk = this.lastPitchWalk * 0.7 + walkStep * 0.3;
      const walkOffset = this.lastPitchWalk * preset.keystroke.pitchRandomRange;
      const pitchValue = preset.keystroke.pitchBase + walkOffset;
      osc.type = preset.keystroke.toneType;
      osc.frequency.value = pitchValue * pitchScale;
      osc.connect(toneGain);
      osc.start(now);
      osc.stop(now + effectiveDecayMs / 1000 + 0.05);

      // Stochastic resonance layer: sub-threshold high-freq noise
      // enhances perception of the tonal signal (NIH research)
      const srGain = this.ctx.createGain();
      srGain.gain.setValueAtTime(0.015, now);
      srGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + (effectiveDecayMs / 1000) * 0.5,
      );
      srGain.connect(this.masterGain);

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

  // --- Accent Sounds for Punctuation / Enter / Backspace ---

  private playAccentSound(type: AccentKey): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    switch (type) {
      case "punctuation": {
        // Soft bell / chime — high resonant tone with long decay
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        gain.connect(this.masterGain);

        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 1200 + Math.random() * 400;
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.85);

        // Subtle second harmonic
        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.05, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        gain2.connect(this.masterGain);

        const osc2 = this.ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = osc.frequency.value * 2.5;
        osc2.connect(gain2);
        osc2.start(now);
        osc2.stop(now + 1.25);
        break;
      }
      case "enter": {
        // Deep resonance — space opening up
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        gain.connect(this.masterGain);

        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 1.5);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 1.55);

        // Subtle noise wash for spaciousness
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.04, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        noiseGain.connect(this.masterGain);

        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 500;
        filter.connect(noiseGain);

        const noiseBuffer = this.noiseBuffers.get("white");
        if (noiseBuffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = noiseBuffer;
          src.connect(filter);
          src.start(now, 0, 0.85);
        }
        break;
      }
      case "backspace": {
        // Reverse-suck sound — pitch goes up, noise pulls inward
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        gain.connect(this.masterGain);

        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
    }
  }

  // --- Ambient Sound ---

  startAmbient(): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset?.ambient) return;
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
