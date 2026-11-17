import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONTS } from "../theme/fonts";
import { TOKENS, seededUnit } from "../theme/tokens";
import {
  CHARACTERS,
  CharacterId,
  EmotionType,
  GestureType,
  SceneTiming,
  TimelineManifest,
  TurnTiming,
} from "../types/video";
import { CharacterRig } from "./CharacterRig";

export interface CharacterStageProps {
  manifest: TimelineManifest;
}

const ALL_CHARACTER_IDS: readonly CharacterId[] = [
  "noah",
  "rafiq",
  "dmitri",
  "maya",
];

const COMPACT_ORIGIN_LABEL: Record<CharacterId, string> = {
  noah: "DESK",
  rafiq: "DHAKA",
  dmitri: "MOSCOW",
  maya: "LAB",
};

const COMPACT_DISPLAY_NAME: Record<CharacterId, string> = {
  noah: "Noah Vance",
  rafiq: "Dr. Rafiq",
  dmitri: "Prof. Dmitri",
  maya: "Maya Lin",
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) {
    return `rgba(248, 250, 252, ${clamp01(alpha)})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
}

/**
 * Resolves the active SceneTiming for a global frame, gracefully clamping
 * across inter-scene gaps or trailing frames.
 */
function findSceneAtFrame(
  scenes: SceneTiming[],
  frame: number
): SceneTiming | undefined {
  if (scenes.length === 0) {
    return undefined;
  }

  for (const scene of scenes) {
    if (
      frame >= scene.startFrame &&
      frame < scene.startFrame + scene.durationInFrames
    ) {
      return scene;
    }
  }

  let latestBefore: SceneTiming | undefined;
  for (const scene of scenes) {
    if (scene.startFrame <= frame) {
      latestBefore = scene;
    }
  }

  return latestBefore ?? scenes[0];
}

/**
 * Resolves the TurnTiming actively speaking on the exact global frame.
 */
function findActiveTurn(
  turns: TurnTiming[],
  frame: number
): TurnTiming | undefined {
  for (const turn of turns) {
    if (frame >= turn.startFrame && frame <= turn.endFrame) {
      return turn;
    }
  }
  return undefined;
}

/**
 * Samples the 30fps viseme envelope for a character at a target global frame.
 * Includes a deterministic syllable-cadence fallback only if the manifest's
 * viseme array is empty (e.g. dry-run previews prior to Whisper alignment).
 */
function sampleVisemeEnvelope(
  manifest: TimelineManifest,
  characterId: CharacterId,
  targetFrame: number,
  isSpeakingNow: boolean
): number {
  const series = manifest.visemes?.[characterId];
  if (series && series.length > 0) {
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(targetFrame)));
    return clamp01(series[idx] ?? 0);
  }

  if (!isSpeakingNow) {
    return 0;
  }

  const f = Math.max(0, targetFrame);
  const syllableWindow = Math.floor(f / 5);
  const amp = 0.28 + seededUnit(syllableWindow * 73 + characterId.length * 19) * 0.58;
  const wave = 0.5 + 0.5 * Math.sin(f * 0.62 + syllableWindow * 0.9);
  return clamp01(amp * wave);
}

/**
 * Computes a smooth, stateless 0..1 speaking prominence curve for studio card
 * scaling, rim-light bloom, and waveform energy.
 */
function computeSpeakingPresence(
  characterId: CharacterId,
  frame: number,
  turns: TurnTiming[],
  fps: number
): number {
  let maxPresence = 0;

  for (const turn of turns) {
    if (turn.characterId !== characterId) {
      continue;
    }
    if (frame < turn.startFrame || frame > turn.endFrame + 10) {
      continue;
    }

    const attack = spring({
      frame: Math.max(0, frame - turn.startFrame),
      fps,
      config: { damping: 16, stiffness: 170, mass: 0.72 },
    });

    const release =
      frame <= turn.endFrame
        ? 1
        : interpolate(frame, [turn.endFrame, turn.endFrame + 10], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

    const presence = clamp01(attack * release);
    if (presence > maxPresence) {
      maxPresence = presence;
    }
  }

  return maxPresence;
}

/**
 * Resolves smooth foreground gesture arm progress (0..1) and active GestureType
 * with spring entrance at turn start and smooth settle at turn end.
 */
function resolveGestureState(
  characterId: CharacterId,
  frame: number,
  turns: TurnTiming[],
  fps: number
): { gesture: GestureType; gestureProgress: number } {
  for (const turn of turns) {
    if (turn.characterId !== characterId || turn.gesture === "none") {
      continue;
    }
    if (frame < turn.startFrame || frame > turn.endFrame + 6) {
      continue;
    }

    const enter = spring({
      frame: Math.max(0, frame - turn.startFrame),
      fps,
      config: { damping: 14, stiffness: 145, mass: 0.76 },
    });

    const settleStart = Math.max(turn.startFrame + 4, turn.endFrame - 8);
    const settleEnd = Math.max(settleStart + 1, turn.endFrame + 6);
    const exit = interpolate(frame, [settleStart, settleEnd], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const progress = clamp01(enter * exit);
    if (progress > 0.01) {
      return { gesture: turn.gesture, gestureProgress: progress };
    }
  }

  return { gesture: "none", gestureProgress: 0 };
}

/**
 * Derives a natural reactive emotion for a listening co-speaker so partners
 * visibly respond to the active speaker's tone.
 */
function deriveListenerEmotion(
  speakerEmotion: EmotionType | undefined
): EmotionType {
  switch (speakerEmotion) {
    case "shocked":
      return "curious";
    case "amused":
    case "warm":
    case "proud":
      return "warm";
    case "analytical":
      return "curious";
    default:
      return "neutral";
  }
}

/**
 * Resolves stable [leftSpeaker, rightSpeaker] assignments for Scenes 1-7.
 * Prevents jarring left/right side-swapping mid-scene while guaranteeing the
 * active speaker and primary co-speaker are always docked on stage.
 */
function resolveTwoSpeakerDocks(
  scene: SceneTiming,
  allTurns: TurnTiming[],
  frame: number
): [CharacterId, CharacterId] {
  const sceneTurns = allTurns.filter((t) => t.sceneIndex === scene.sceneIndex);
  const orderedCast: CharacterId[] = [];

  for (const c of scene.activeCharacters) {
    if (!orderedCast.includes(c)) {
      orderedCast.push(c);
    }
  }
  for (const t of sceneTurns) {
    if (!orderedCast.includes(t.characterId)) {
      orderedCast.push(t.characterId);
    }
  }

  if (orderedCast.length === 0) {
    return ["noah", "rafiq"];
  }

  if (orderedCast.length === 1) {
    const primary = orderedCast[0];
    const fallbackPartner: CharacterId = primary === "noah" ? "rafiq" : "noah";
    return [primary, fallbackPartner];
  }

  if (orderedCast.length === 2) {
    return [orderedCast[0], orderedCast[1]];
  }

  // 3+ speakers in a non-finale scene: walk turns up to current frame with sticky slots
  let leftSlot: CharacterId = sceneTurns[0]?.characterId ?? orderedCast[0];
  let rightSlot: CharacterId =
    sceneTurns.find((t) => t.characterId !== leftSlot)?.characterId ??
    orderedCast.find((c) => c !== leftSlot) ??
    "rafiq";

  for (let i = 1; i < sceneTurns.length; i++) {
    const turn = sceneTurns[i];
    if (frame < turn.startFrame) {
      break;
    }
    const speaker = turn.characterId;
    if (speaker === leftSlot || speaker === rightSlot) {
      continue;
    }
    const prevSpeaker = sceneTurns[i - 1].characterId;
    if (prevSpeaker === leftSlot) {
      rightSlot = speaker;
    } else {
      leftSlot = speaker;
    }
  }

  return [leftSlot, rightSlot];
}

/**
 * Resolves the 4-character ensemble order [leftOuter, leftInner, rightInner, rightOuter]
 * for Scene 8 compact 2+2 corner studio pods.
 */
function resolveFinaleQuartet(scene: SceneTiming): [
  CharacterId,
  CharacterId,
  CharacterId,
  CharacterId,
] {
  const ordered: CharacterId[] = [];
  for (const id of scene.activeCharacters) {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  }
  for (const id of ALL_CHARACTER_IDS) {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  }
  return [ordered[0], ordered[1], ordered[2], ordered[3]];
}

interface MiniWaveformProps {
  levels: number[];
  accentColor: string;
  speakPresence: number;
  compact?: boolean;
}

const MiniAudioWaveform: React.FC<MiniWaveformProps> = ({
  levels,
  accentColor,
  speakPresence,
  compact = false,
}) => {
  const maxBarHeight = compact ? 11 : 14;
  const minBarHeight = 2.5;
  const barWidth = compact ? 2.2 : 2.8;
  const gap = compact ? 2 : 2.5;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: `${gap}px`,
        height: `${maxBarHeight + 2}px`,
      }}
    >
      {levels.map((lvl, idx) => {
        const activeHeight =
          minBarHeight + clamp01(lvl) * (maxBarHeight - minBarHeight);
        const heightPx = interpolate(
          speakPresence,
          [0, 1],
          [minBarHeight, activeHeight],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        return (
          <div
            key={idx}
            style={{
              width: `${barWidth}px`,
              height: `${heightPx.toFixed(2)}px`,
              borderRadius: "999px",
              backgroundColor:
                speakPresence > 0.15
                  ? accentColor
                  : "rgba(148, 163, 184, 0.42)",
              boxShadow:
                speakPresence > 0.25
                  ? `0 0 6px ${hexToRgba(accentColor, 0.65 * speakPresence)}`
                  : "none",
            }}
          />
        );
      })}
    </div>
  );
};

interface StudioDockCardProps {
  characterId: CharacterId;
  facing: "left" | "right";
  positionStyle: React.CSSProperties;
  width: number;
  height: number;
  rigSize: number;
  compact?: boolean;
  isSpeaking: boolean;
  speakPresence: number;
  mouthOpen: number;
  emotion: EmotionType;
  gesture: GestureType;
  gestureProgress: number;
  waveformLevels: number[];
  entranceProgress: number;
}

const StudioDockCard: React.FC<StudioDockCardProps> = ({
  characterId,
  facing,
  positionStyle,
  width,
  height,
  rigSize,
  compact = false,
  isSpeaking,
  speakPresence,
  mouthOpen,
  emotion,
  gesture,
  gestureProgress,
  waveformLevels,
  entranceProgress,
}) => {
  const meta = CHARACTERS[characterId];

  // Speaking character scales smoothly 0.94 -> 1.0 -> 1.04; listening partner stays at 0.94
  const activeMaxScale = compact ? 1.032 : 1.04;
  const listeningScale = compact ? 0.95 : 0.94;
  const scaleValue =
    interpolate(
      speakPresence,
      [0, 0.28, 1],
      [listeningScale, 1.0, activeMaxScale],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    ) + (isSpeaking ? mouthOpen * 0.005 : 0);

  // Listening partner softly dimmed at 0.85; active speaker 1.0
  const baseOpacity = interpolate(speakPresence, [0, 1], [0.85, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const entranceLiftY = interpolate(entranceProgress, [0, 1], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const entranceOpacity = interpolate(entranceProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const borderColor =
    speakPresence > 0.08
      ? hexToRgba(meta.accentColor, 0.32 + 0.62 * speakPresence)
      : TOKENS.colors.borderSubtle;

  const rimGlowShadow =
    speakPresence > 0.06
      ? [
          `0 12px 30px rgba(2, 6, 15, 0.68)`,
          `0 0 ${Math.round(24 * speakPresence)}px ${hexToRgba(
            meta.accentColor,
            0.38 * speakPresence
          )}`,
          `inset 0 0 ${Math.round(18 * speakPresence)}px ${hexToRgba(
            meta.accentColor,
            0.18 * speakPresence
          )}`,
        ].join(", ")
      : "0 10px 26px rgba(2, 6, 15, 0.56)";

  const headerHeight = compact ? 24 : 28;
  const footerHeight = compact ? 42 : 46;
  const portraitTop = compact ? 20 : 14;

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: compact ? "14px" : "18px",
        backgroundColor: TOKENS.colors.bgCardElevated,
        backgroundImage: [
          `radial-gradient(circle at 50% 24%, ${hexToRgba(
            meta.accentColor,
            0.07 + 0.16 * speakPresence
          )} 0%, rgba(10, 17, 30, 0) 68%)`,
          `linear-gradient(180deg, rgba(13, 23, 40, 0.94) 0%, rgba(6, 11, 20, 0.97) 100%)`,
        ].join(", "),
        border: `1.5px solid ${borderColor}`,
        boxShadow: rimGlowShadow,
        opacity: baseOpacity * entranceOpacity,
        transform: `translateY(${entranceLiftY.toFixed(2)}px) scale(${scaleValue.toFixed(4)})`,
        transformOrigin: "50% 72%",
        overflow: "hidden",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      {/* Subtle architectural grid texture inside studio booth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
          backgroundSize: compact ? "18px 18px" : "22px 22px",
          opacity: 0.35,
        }}
      />

      {/* Top glowing accent rim light bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: compact ? "14px" : "20px",
          right: compact ? "14px" : "20px",
          height: "2px",
          borderRadius: "0 0 4px 4px",
          background: `linear-gradient(90deg, transparent 0%, ${meta.accentColor} 50%, transparent 100%)`,
          opacity: 0.22 + 0.78 * speakPresence,
        }}
      />

      {/* Studio card micro-header: Origin badge + Live 5-Bar Audio Waveform */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${headerHeight}px`,
          padding: compact ? "0 8px" : "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 3,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: compact ? "4px" : "6px",
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: compact ? "5px" : "6px",
              height: compact ? "5px" : "6px",
              borderRadius: "50%",
              backgroundColor:
                speakPresence > 0.2
                  ? meta.accentColor
                  : TOKENS.colors.textMuted,
              boxShadow:
                speakPresence > 0.2
                  ? `0 0 8px ${hexToRgba(meta.accentColor, 0.9)}`
                  : "none",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: compact ? "8.5px" : "9.5px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color:
                speakPresence > 0.2
                  ? TOKENS.colors.textPrimary
                  : TOKENS.colors.textMuted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {compact ? COMPACT_ORIGIN_LABEL[characterId] : meta.originTag}
          </span>
        </div>

        <MiniAudioWaveform
          levels={waveformLevels}
          accentColor={meta.accentColor}
          speakPresence={speakPresence}
          compact={compact}
        />
      </div>

      {/* Rigged 2D SVG Character Portrait */}
      <div
        style={{
          position: "absolute",
          top: `${portraitTop}px`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${rigSize}px`,
          height: `${rigSize}px`,
          zIndex: 2,
        }}
      >
        <CharacterRig
          characterId={characterId}
          mouthOpen={mouthOpen}
          isSpeaking={isSpeaking}
          emotion={emotion}
          gesture={gesture}
          facing={facing}
          size={rigSize}
          gestureProgress={gestureProgress}
        />
      </div>

      {/* Frosted Studio Lower-Third Nameplate */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: `${footerHeight}px`,
          padding: compact ? "5px 8px" : "6px 12px",
          background:
            "linear-gradient(180deg, rgba(5, 9, 17, 0.78) 0%, rgba(5, 9, 17, 0.96) 100%)",
          borderTop: `1px solid ${
            speakPresence > 0.2
              ? hexToRgba(meta.accentColor, 0.36)
              : "rgba(226, 232, 240, 0.10)"
          }`,
          display: "flex",
          alignItems: "center",
          gap: compact ? "6px" : "8px",
          zIndex: 4,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "3px",
            height: compact ? "24px" : "28px",
            borderRadius: "999px",
            backgroundColor: meta.accentColor,
            opacity: 0.55 + 0.45 * speakPresence,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: compact ? "11.5px" : "13.5px",
              fontWeight: 700,
              lineHeight: 1.15,
              color: TOKENS.colors.textPrimary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {compact ? COMPACT_DISPLAY_NAME[characterId] : meta.name}
          </div>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: compact ? "9px" : "10.5px",
              fontWeight: 500,
              lineHeight: 1.2,
              marginTop: "1px",
              color:
                speakPresence > 0.25
                  ? meta.secondaryColor
                  : TOKENS.colors.textSecondary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              opacity: speakPresence > 0.25 ? 0.95 : 0.8,
            }}
          >
            {meta.role}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CharacterStage: React.FC<CharacterStageProps> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentScene = findSceneAtFrame(manifest.scenes, frame);
  if (!currentScene) {
    return null;
  }

  const activeTurn = findActiveTurn(manifest.turns, frame);
  const stageEntrance = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 125, mass: 0.85 },
  });

  const buildCardDriver = (characterId: CharacterId) => {
    const isSpeaking =
      activeTurn !== undefined && activeTurn.characterId === characterId;
    const speakPresence = computeSpeakingPresence(
      characterId,
      frame,
      manifest.turns,
      fps
    );
    const mouthOpen = sampleVisemeEnvelope(
      manifest,
      characterId,
      frame,
      isSpeaking
    );

    const emotion: EmotionType =
      activeTurn !== undefined && activeTurn.characterId === characterId
        ? activeTurn.emotion
        : deriveListenerEmotion(activeTurn?.emotion);

    const { gesture, gestureProgress } = resolveGestureState(
      characterId,
      frame,
      manifest.turns,
      fps
    );

    const barWeights = [0.6, 0.88, 1.0, 0.85, 0.58];
    const barFrameOffsets = [-2, -1, 0, 1, 2];
    const waveformLevels = barFrameOffsets.map((offset, barIdx) => {
      const env = sampleVisemeEnvelope(
        manifest,
        characterId,
        frame + offset,
        isSpeaking || speakPresence > 0.1
      );
      const harmonic =
        0.8 + 0.2 * Math.sin(frame * (0.36 + barIdx * 0.09) + barIdx * 1.15);
      return clamp01(env * barWeights[barIdx] * harmonic * 1.35 + 0.08);
    });

    return {
      isSpeaking,
      speakPresence,
      mouthOpen,
      emotion,
      gesture,
      gestureProgress,
      waveformLevels,
    };
  };

  // Finale Scene 8 (or 4-speaker finale): compact 2+2 corner studio pods
  // Strictly inside x < 305 (left: 20..296) and x > 1615 (right: 1624..1900), y >= 815 (top: 828..1056)
  const isFinaleEnsemble =
    currentScene.sceneIndex >= 8 ||
    (currentScene.sceneIndex === manifest.scenes.length &&
      currentScene.activeCharacters.length >= 4);

  if (isFinaleEnsemble) {
    const [leftOuter, leftInner, rightInner, rightOuter] =
      resolveFinaleQuartet(currentScene);
    const finaleLocalFrame = Math.max(0, frame - currentScene.startFrame);

    const pods: Array<{
      id: CharacterId;
      facing: "left" | "right";
      style: React.CSSProperties;
      staggerFrames: number;
    }> = [
      {
        id: leftOuter,
        facing: "right",
        style: { left: 20, bottom: 24 },
        staggerFrames: 0,
      },
      {
        id: leftInner,
        facing: "right",
        style: { left: 162, bottom: 24 },
        staggerFrames: 3,
      },
      {
        id: rightInner,
        facing: "left",
        style: { right: 162, bottom: 24 },
        staggerFrames: 3,
      },
      {
        id: rightOuter,
        facing: "left",
        style: { right: 20, bottom: 24 },
        staggerFrames: 0,
      },
    ];

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${TOKENS.layout.width}px`,
          height: `${TOKENS.layout.height}px`,
          pointerEvents: "none",
          zIndex: 30,
        }}
      >
        {pods.map((pod) => {
          const driver = buildCardDriver(pod.id);
          const podEntrance = spring({
            frame: Math.max(0, finaleLocalFrame - pod.staggerFrames),
            fps,
            config: { damping: 17, stiffness: 140, mass: 0.8 },
          });

          return (
            <StudioDockCard
              key={pod.id}
              characterId={pod.id}
              facing={pod.facing}
              positionStyle={pod.style}
              width={134}
              height={228}
              rigSize={138}
              compact
              isSpeaking={driver.isSpeaking}
              speakPresence={driver.speakPresence}
              mouthOpen={driver.mouthOpen}
              emotion={driver.emotion}
              gesture={driver.gesture}
              gestureProgress={driver.gestureProgress}
              waveformLevels={driver.waveformLevels}
              entranceProgress={Math.min(stageEntrance, podEntrance)}
            />
          );
        })}
      </div>
    );
  }

  // Scenes 1-7: Primary speaker & co-speaker docked cleanly in bottom-left and bottom-right studio cards
  const [leftSpeakerId, rightSpeakerId] = resolveTwoSpeakerDocks(
    currentScene,
    manifest.turns,
    frame
  );

  const leftDriver = buildCardDriver(leftSpeakerId);
  const rightDriver = buildCardDriver(rightSpeakerId);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: `${TOKENS.layout.width}px`,
        height: `${TOKENS.layout.height}px`,
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      <StudioDockCard
        characterId={leftSpeakerId}
        facing="right"
        positionStyle={{ left: 44, bottom: 28 }}
        width={236}
        height={232}
        rigSize={184}
        isSpeaking={leftDriver.isSpeaking}
        speakPresence={leftDriver.speakPresence}
        mouthOpen={leftDriver.mouthOpen}
        emotion={leftDriver.emotion}
        gesture={leftDriver.gesture}
        gestureProgress={leftDriver.gestureProgress}
        waveformLevels={leftDriver.waveformLevels}
        entranceProgress={stageEntrance}
      />

      <StudioDockCard
        characterId={rightSpeakerId}
        facing="left"
        positionStyle={{ right: 44, bottom: 28 }}
        width={236}
        height={232}
        rigSize={184}
        isSpeaking={rightDriver.isSpeaking}
        speakPresence={rightDriver.speakPresence}
        mouthOpen={rightDriver.mouthOpen}
        emotion={rightDriver.emotion}
        gesture={rightDriver.gesture}
        gestureProgress={rightDriver.gestureProgress}
        waveformLevels={rightDriver.waveformLevels}
        entranceProgress={stageEntrance}
      />
    </div>
  );
};

export default CharacterStage;
