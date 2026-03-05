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
    // Deep Thock — 極上のメカニカルキーボード音
    // Evidence: ASMR研究で打鍵音に120ms以上のdecayが報酬系を活性化(NIH fMRI)
    // noiseGain 0.6→0.35: 60-70dBの最適音量域に収まるよう調整
    id: "deep-thock",
    name: "Deep Thock",
    description: "極上のメカニカルキーボード音",
    emoji: "⌨️",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 280,
      filterQ: 2.5,
      attackMs: 2,
      decayMs: 120,
      pitchBase: 150,
      pitchRandomRange: 30,
      noiseGain: 0.35,
      toneGain: 0.35,
      toneType: "sine",
    },
    ambient: null,
  },
  {
    // Midnight Rain — 森の雨音に包まれて書く
    // ← forest-templeの特徴を統合: triangle波の木の響き + brownノイズ
    id: "midnight-rain",
    name: "Midnight Rain",
    description: "雨音と木霊に包まれて書く",
    emoji: "🌧️",
    keystroke: {
      filterType: "highpass",
      filterFreq: 2000,
      filterQ: 1.5,
      attackMs: 2,
      decayMs: 150,
      pitchBase: 2500,
      pitchRandomRange: 1200,
      noiseGain: 0.2,
      toneGain: 0.2,
      toneType: "triangle",
    },
    ambient: {
      type: "brown",
      gain: 0.15,
      filterFreq: 1200,
      filterType: "lowpass",
    },
  },
  {
    // Zen Drops — 水滴の響き + オーロラのきらめき
    // ← auroraの特徴を統合: WPM連動drive + 高い倍音のきらめき
    id: "zen-drops",
    name: "Zen Drops",
    description: "水滴の響き — α波(10Hz)+WPM連動で覚醒",
    emoji: "💧",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 1200,
      filterQ: 8,
      attackMs: 1,
      decayMs: 300,
      pitchBase: 800,
      pitchRandomRange: 500,
      noiseGain: 0.08,
      toneGain: 0.4,
      toneType: "sine",
    },
    // Evidence: 440Hzキャリアが35-40Hz以下の変調に最適(NIH 2025 Review)
    ambient: {
      type: "binaural",
      gain: 0.07,
      binauralBase: 440,
      binauralBeat: 10,
    },
    drive: {
      enabled: true,
      pitchScaleMin: 0.7,
      pitchScaleMax: 1.8,
      ambientGainMin: 0.03,
      ambientGainMax: 0.09,
    },
  },
  {
    // Mode C — γ波(40Hz)集中モード
    // WPM連動でキー音もambientも加速。集中力を極限まで高める。
    id: "mode-c",
    name: "Mode C",
    description: "γ波(40Hz)集中 — WPM連動コンボ・ドライブ",
    emoji: "🎯",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 400,
      filterQ: 3,
      attackMs: 2,
      decayMs: 60,
      pitchBase: 200,
      pitchRandomRange: 40,
      noiseGain: 0.28,
      toneGain: 0.3,
      toneType: "triangle",
    },
    // Evidence: 40Hzγ波が認知向上に最も効果大(2024 NIH), 440Hzキャリア最適
    ambient: {
      type: "binaural",
      gain: 0.06,
      binauralBase: 440,
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
    // Café — カフェの雑踏の中、キーボードを叩く
    // pink noiseで人々のざわめきを表現。warm系bandpass。
    id: "cafe",
    name: "Café",
    description: "カフェの雑踏とキーボード音",
    emoji: "☕",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 350,
      filterQ: 2,
      attackMs: 2,
      decayMs: 100,
      pitchBase: 180,
      pitchRandomRange: 25,
      noiseGain: 0.3,
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
    // ASMR — 焚き火の音とトリガーサウンド
    // crackle bufferで焚き火の独特な質感を再現。高域中心の繊細な音。
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
