export type PresetId =
  | "deep-thock"
  | "midnight-rain"
  | "zen-drops"
  | "mode-c"
  | "cafe"
  | "asmr";

export interface PresetConfig {
  id: PresetId;
  name: string;
  description: string;
  emoji: string;
  keystroke: {
    filterType: BiquadFilterType;
    filterFreq: number;
    filterQ: number;
    attackMs: number;
    decayMs: number;
    pitchBase: number;
    pitchRandomRange: number;
    noiseGain: number;
    toneGain: number;
    toneType: OscillatorType;
  };
  ambient: {
    type: "brown" | "pink" | "white" | "crackle" | "binaural";
    gain: number;
    filterFreq?: number;
    filterType?: BiquadFilterType;
    binauralBase?: number;
    binauralBeat?: number;
  } | null;
  drive?: {
    enabled: boolean;
    pitchScaleMin: number;
    pitchScaleMax: number;
    ambientGainMin: number;
    ambientGainMax: number;
  };
}

export const PRESETS: PresetConfig[] = [
  {
    id: "deep-thock",
    name: "Deep Thock",
    description: "極上のメカニカルキーボード音",
    emoji: "⌨️",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 280,
      filterQ: 2.5,
      attackMs: 2,
      decayMs: 80,
      pitchBase: 150,
      pitchRandomRange: 30,
      noiseGain: 0.6,
      toneGain: 0.35,
      toneType: "sine",
    },
    ambient: null,
  },
  {
    id: "midnight-rain",
    name: "Midnight Rain",
    description: "静かな雨音に包まれて書く",
    emoji: "🌧️",
    keystroke: {
      filterType: "highpass",
      filterFreq: 2000,
      filterQ: 1.5,
      attackMs: 1,
      decayMs: 120,
      pitchBase: 3000,
      pitchRandomRange: 1500,
      noiseGain: 0.25,
      toneGain: 0.15,
      toneType: "sine",
    },
    ambient: {
      type: "brown",
      gain: 0.15,
      filterFreq: 800,
      filterType: "lowpass",
    },
  },
  {
    id: "zen-drops",
    name: "Zen Drops",
    description: "水滴の響きとバイノーラルビート",
    emoji: "💧",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 1200,
      filterQ: 8,
      attackMs: 1,
      decayMs: 300,
      pitchBase: 800,
      pitchRandomRange: 400,
      noiseGain: 0.08,
      toneGain: 0.4,
      toneType: "sine",
    },
    ambient: {
      type: "binaural",
      gain: 0.06,
      binauralBase: 220,
      binauralBeat: 40,
    },
  },
  {
    id: "mode-c",
    name: "Mode C",
    description: "WPM連動コンボ・ドライブ",
    emoji: "🎯",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 400,
      filterQ: 3,
      attackMs: 2,
      decayMs: 60,
      pitchBase: 200,
      pitchRandomRange: 40,
      noiseGain: 0.45,
      toneGain: 0.3,
      toneType: "triangle",
    },
    ambient: {
      type: "binaural",
      gain: 0.04,
      binauralBase: 200,
      binauralBeat: 40,
    },
    drive: {
      enabled: true,
      pitchScaleMin: 0.8,
      pitchScaleMax: 1.6,
      ambientGainMin: 0.02,
      ambientGainMax: 0.1,
    },
  },
  {
    id: "cafe",
    name: "Café",
    description: "カフェの雑踏とキーボード音",
    emoji: "☕",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 350,
      filterQ: 2,
      attackMs: 2,
      decayMs: 70,
      pitchBase: 180,
      pitchRandomRange: 25,
      noiseGain: 0.5,
      toneGain: 0.25,
      toneType: "sine",
    },
    ambient: {
      type: "pink",
      gain: 0.12,
      filterFreq: 2000,
      filterType: "lowpass",
    },
  },
  {
    id: "asmr",
    name: "ASMR",
    description: "焚き火の音とトリガーサウンド",
    emoji: "🔥",
    keystroke: {
      filterType: "highpass",
      filterFreq: 4000,
      filterQ: 3,
      attackMs: 1,
      decayMs: 200,
      pitchBase: 5000,
      pitchRandomRange: 3000,
      noiseGain: 0.12,
      toneGain: 0.2,
      toneType: "sine",
    },
    ambient: {
      type: "crackle",
      gain: 0.18,
    },
  },
];

export const DEFAULT_PRESET: PresetId = "mode-c";

export function getPreset(id: PresetId): PresetConfig {
  return PRESETS.find((p) => p.id === id)!;
}
