export type CharacterId = "noah" | "rafiq" | "dmitri" | "maya";

export type EmotionType =
  | "neutral"
  | "curious"
  | "shocked"
  | "analytical"
  | "proud"
  | "warm"
  | "amused";

export type GestureType =
  | "point_up"
  | "open_palms"
  | "chin_think"
  | "count_fingers"
  | "none";

export interface CharacterMeta {
  id: CharacterId;
  name: string;
  role: string;
  originTag: string;
  accentColor: string;
  secondaryColor: string;
  kokoroVoice: string;
  geminiVoice: string;
}

export const CHARACTERS: Record<CharacterId, CharacterMeta> = {
  noah: {
    id: "noah",
    name: "Noah Vance",
    role: "Documentary Host",
    originTag: "GLOBAL DESK",
    accentColor: "#F59E0B",
    secondaryColor: "#FEF3C7",
    kokoroVoice: "am_michael",
    geminiVoice: "Charon",
  },
  rafiq: {
    id: "rafiq",
    name: "Dr. Rafiq Rahman",
    role: "Delta Demographer",
    originTag: "DHAKA · BANGLADESH",
    accentColor: "#10B981",
    secondaryColor: "#F42A41",
    kokoroVoice: "bm_fable",
    geminiVoice: "Puck",
  },
  dmitri: {
    id: "dmitri",
    name: "Prof. Dmitri Volkov",
    role: "Arctic Cartographer",
    originTag: "MOSCOW · RUSSIA",
    accentColor: "#38BDF8",
    secondaryColor: "#E0F2FE",
    kokoroVoice: "am_fenrir",
    geminiVoice: "Orus",
  },
  maya: {
    id: "maya",
    name: "Maya Lin",
    role: "Lead Data Visualizer",
    originTag: "SPATIAL LAB",
    accentColor: "#FB7185",
    secondaryColor: "#FFE4E6",
    kokoroVoice: "af_heart",
    geminiVoice: "Aoede",
  },
};

export interface ScriptTurn {
  id: string;
  sceneIndex: number; // 1..8
  characterId: CharacterId;
  text: string;
  emotion: EmotionType;
  gesture: GestureType;
  highlightStat?: string;
}

export interface ScriptSceneSpec {
  sceneIndex: number; // 1..8
  sceneId: string;
  title: string;
  subtitle: string;
  turns: ScriptTurn[];
}

export interface ScriptDocument {
  title: string;
  targetDurationSec: number;
  scenes: ScriptSceneSpec[];
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  characterId: CharacterId;
  sceneIndex: number;
  turnId: string;
}

export interface TurnTiming extends ScriptTurn {
  startMs: number;
  endMs: number;
  startFrame: number;
  endFrame: number;
  audioFile: string;
}

export interface SceneTiming {
  sceneIndex: number; // 1..8
  sceneId: string;
  title: string;
  subtitle: string;
  startMs: number;
  endMs: number;
  startFrame: number;
  durationInFrames: number;
  activeCharacters: CharacterId[];
}

export interface TimelineManifest {
  fps: number; // 30
  width: number; // 1920
  height: number; // 1080
  totalDurationMs: number;
  totalFrames: number;
  masterAudioSrc: string; // e.g. "audio/master_mix.wav"
  voiceoverSrc: string; // e.g. "audio/voiceover_master.wav"
  bgmSrc: string; // e.g. "audio/bgm_bed.wav"
  scenes: SceneTiming[];
  turns: TurnTiming[];
  words: WordTiming[];
  /**
   * Per-character mouth-openness array (0..1) sampled at 30fps (index = global frame).
   */
  visemes: Record<CharacterId, number[]>;
}

/**
 * Props passed to every Scene01..Scene08 component.
 * IMPORTANT: Each scene is mounted inside `<Sequence from={scene.startFrame} durationInFrames={scene.durationInFrames}>`,
 * so inside a scene component `useCurrentFrame()` returns `localFrame` in `[0, scene.durationInFrames - 1]`.
 * Global frame is `scene.startFrame + localFrame`.
 */
export interface SceneProps {
  scene: SceneTiming;
  turns: TurnTiming[];
  manifest: TimelineManifest;
}
