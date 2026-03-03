// ============================================================
// FlowType — Web Audio API Sound Engine
// Zero-latency, fully synthesized audio with 6 immersive presets
// ============================================================

import { type PresetConfig, type PresetId, getPreset } from "./presets";

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;
  private currentPreset: PresetConfig | null = null;
  private noiseBuffers: Map<string, AudioBuffer> = new Map();
  private isAmbientPlaying = false;

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
          // Campfire crackle: sparse random pops/clicks layered on brown noise
          let lastCrackle = 0;
          for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            lastCrackle = (lastCrackle + 0.02 * white) / 1.02;
            // Sparse pops
            const pop =
              Math.random() < 0.001 ? (Math.random() * 2 - 1) * 0.8 : 0;
            // Crackle texture
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

  // --- Preset Management ---

  setPreset(presetId: PresetId): void {
    const wasPlaying = this.isAmbientPlaying;
    if (wasPlaying) this.stopAmbient();
    this.currentPreset = getPreset(presetId);
    if (wasPlaying) this.startAmbient();
  }

  getCurrentPresetId(): PresetId | null {
    return this.currentPreset?.id ?? null;
  }

  // --- Keystroke Sound ---

  playKeystroke(wpm: number = 0): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset) return;

    const preset = this.currentPreset;
    const now = this.ctx.currentTime;

    // Calculate WPM-based pitch scale for Mode C drive system
    let pitchScale = 1;
    if (preset.drive?.enabled) {
      const t = Math.min(wpm / 120, 1); // normalize WPM to 0-1
      pitchScale =
        preset.drive.pitchScaleMin +
        t * (preset.drive.pitchScaleMax - preset.drive.pitchScaleMin);
    }

    // --- Noise burst component ---
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(preset.keystroke.noiseGain, now);
    noiseGain.gain.exponentialRampToValueAtTime(
      0.001,
      now + preset.keystroke.decayMs / 1000,
    );
    noiseGain.connect(this.masterGain);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = preset.keystroke.filterType;
    noiseFilter.frequency.value = preset.keystroke.filterFreq * pitchScale;
    noiseFilter.Q.value = preset.keystroke.filterQ;
    noiseFilter.connect(noiseGain);

    // Use a short segment of white noise buffer
    const noiseBuffer = this.noiseBuffers.get("white");
    if (noiseBuffer) {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      // Start at random offset for variation
      const offset = Math.random() * (noiseBuffer.duration - 0.2);
      noiseSrc.connect(noiseFilter);
      noiseSrc.start(now, offset, preset.keystroke.decayMs / 1000 + 0.05);
    }

    // --- Tonal component (optional resonance) ---
    if (preset.keystroke.toneGain > 0) {
      const toneGain = this.ctx.createGain();
      toneGain.gain.setValueAtTime(preset.keystroke.toneGain, now);
      toneGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + preset.keystroke.decayMs / 1000,
      );
      toneGain.connect(this.masterGain);

      const osc = this.ctx.createOscillator();
      const randomPitch =
        preset.keystroke.pitchBase +
        (Math.random() * 2 - 1) * preset.keystroke.pitchRandomRange;
      osc.type = preset.keystroke.toneType;
      osc.frequency.value = randomPitch * pitchScale;
      osc.connect(toneGain);
      osc.start(now);
      osc.stop(now + preset.keystroke.decayMs / 1000 + 0.05);
    }

    // Update ambient drive if Mode C
    if (preset.drive?.enabled && this.ambientGain) {
      const t = Math.min(wpm / 120, 1);
      const targetGain =
        preset.drive.ambientGainMin +
        t * (preset.drive.ambientGainMax - preset.drive.ambientGainMin);
      this.ambientGain.gain.linearRampToValueAtTime(targetGain, now + 0.1);
    }
  }

  // --- Ambient Sound ---

  startAmbient(): void {
    if (!this.ctx || !this.masterGain || !this.currentPreset?.ambient) return;
    if (this.isAmbientPlaying) return;

    const preset = this.currentPreset;
    const ambientConfig = preset.ambient!;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = ambientConfig.gain;
    this.ambientGain.connect(this.masterGain);

    if (ambientConfig.type === "binaural") {
      // Binaural beat: two slightly detuned sine waves, panned L/R
      const baseFreq = ambientConfig.binauralBase || 220;
      const beatFreq = ambientConfig.binauralBeat || 40;

      // Left channel
      const oscL = this.ctx.createOscillator();
      oscL.type = "sine";
      oscL.frequency.value = baseFreq;
      const panL = this.ctx.createStereoPanner();
      panL.pan.value = -1;
      oscL.connect(panL);
      panL.connect(this.ambientGain);
      oscL.start();
      this.ambientNodes.push(oscL, panL);

      // Right channel
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
      // Noise-based ambient
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

    this.isAmbientPlaying = true;
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

  // Fade ambient to silence when typing pauses (Mode C)
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
