export type PresetId =
  | "deep-thock"
  | "midnight-rain"
  | "zen-drops"
  | "mode-c"
  | "cafe"
  | "asmr"
  | "void"
  | "forest-temple"
  | "deep-ocean"
  | "aurora";

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
  // === 既存プリセット ===
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
    description: "水滴の響き — α波(10Hz)で創造性を引き出す",
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
      binauralBeat: 10,
    },
  },
  {
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

  // === 没入感プリセット ===

  {
    // Void — 虚空の中でタイプする感覚。極低音のドローンに沈み込み、
    // キーストロークが暗い空間に反響するような深い残響。
    id: "void",
    name: "Void",
    description: "虚空に沈み込む極低音ドローン",
    emoji: "🕳️",
    keystroke: {
      filterType: "lowpass",
      filterFreq: 200,
      filterQ: 4,
      attackMs: 5,
      decayMs: 500,
      pitchBase: 60,
      pitchRandomRange: 10,
      noiseGain: 0.15,
      toneGain: 0.5,
      toneType: "sine",
    },
    ambient: {
      type: "brown",
      gain: 0.2,
      filterFreq: 150,
      filterType: "lowpass",
    },
  },
  {
    // Forest Temple — 森の奥の神殿。鳥の声のような高い倍音と
    // 風のようなpinkノイズ。キーストロークは木の床を叩くような音。
    id: "forest-temple",
    name: "Forest Temple",
    description: "森の神殿で書く — 風と木霊",
    emoji: "🌿",
    keystroke: {
      filterType: "bandpass",
      filterFreq: 600,
      filterQ: 1.5,
      attackMs: 3,
      decayMs: 250,
      pitchBase: 400,
      pitchRandomRange: 200,
      noiseGain: 0.3,
      toneGain: 0.25,
      toneType: "triangle",
    },
    ambient: {
      type: "pink",
      gain: 0.1,
      filterFreq: 3000,
      filterType: "lowpass",
    },
  },
  {
    // Deep Ocean — 深海の静寂。水中にいるような低くこもった音。
    // バイノーラルビートでシータ波(4Hz)を誘導し深い集中状態へ。
    id: "deep-ocean",
    name: "Deep Ocean",
    description: "深海の静寂 — θ波(4Hz)で深いリラックスへ",
    emoji: "🫧",
    keystroke: {
      filterType: "lowpass",
      filterFreq: 400,
      filterQ: 2,
      attackMs: 4,
      decayMs: 400,
      pitchBase: 120,
      pitchRandomRange: 40,
      noiseGain: 0.2,
      toneGain: 0.35,
      toneType: "sine",
    },
    ambient: {
      type: "binaural",
      gain: 0.05,
      binauralBase: 180,
      binauralBeat: 4,
    },
  },
  {
    // Aurora — オーロラの下でタイプする幻想的な体験。
    // WPM連動で音が変化し、速く打つほど光が増すイメージ。
    // 高い倍音のきらめきと、ゆっくり揺れるバイノーラルビート。
    id: "aurora",
    name: "Aurora",
    description: "オーロラの揺らぎ — α波(10Hz)+WPM連動",
    emoji: "🌌",
    keystroke: {
      filterType: "highpass",
      filterFreq: 1500,
      filterQ: 1,
      attackMs: 2,
      decayMs: 350,
      pitchBase: 1200,
      pitchRandomRange: 800,
      noiseGain: 0.1,
      toneGain: 0.3,
      toneType: "sine",
    },
    ambient: {
      type: "binaural",
      gain: 0.03,
      binauralBase: 280,
      binauralBeat: 10,
    },
    drive: {
      enabled: true,
      pitchScaleMin: 0.6,
      pitchScaleMax: 2.0,
      ambientGainMin: 0.02,
      ambientGainMax: 0.08,
    },
  },
];

export const DEFAULT_PRESET: PresetId = "mode-c";

export function getPreset(id: PresetId): PresetConfig {
  return PRESETS.find((p) => p.id === id)!;
}
