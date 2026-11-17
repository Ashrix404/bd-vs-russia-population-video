import React, { useMemo } from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { ChapterHUD } from "./components/ChapterHUD";
import { CharacterStage } from "./components/CharacterStage";
import {
  CinemaGradeOverlay,
  SceneCutFlash,
} from "./components/CinemaGradeOverlay";
import { SyncedTranscriptBar } from "./components/SyncedTranscriptBar";
import { Scene01ColdOpenShock } from "./scenes/Scene01ColdOpenShock";
import { Scene02TrueSizeOverlay } from "./scenes/Scene02TrueSizeOverlay";
import { Scene03YakutiaVsBangladesh } from "./scenes/Scene03YakutiaVsBangladesh";
import { Scene04OneSqKmSimulator } from "./scenes/Scene04OneSqKmSimulator";
import { Scene05DeltaMiracle } from "./scenes/Scene05DeltaMiracle";
import { Scene06FrozenGiantUralDivide } from "./scenes/Scene06FrozenGiantUralDivide";
import { Scene07DensitySwapExperiment } from "./scenes/Scene07DensitySwapExperiment";
import { Scene08FinaleSynthesis } from "./scenes/Scene08FinaleSynthesis";
import "./theme/fonts";
import { TOKENS } from "./theme/tokens";
import type {
  SceneProps,
  TimelineManifest,
  TurnTiming,
} from "./types/video";

export type MainVideoProps = {
  manifest: TimelineManifest;
  includeAudio?: boolean;
};

const INTERNAL_CUT_FADE_FRAMES = 12;

const SCENE_REGISTRY: Record<number, React.ComponentType<SceneProps>> = {
  1: Scene01ColdOpenShock,
  2: Scene02TrueSizeOverlay,
  3: Scene03YakutiaVsBangladesh,
  4: Scene04OneSqKmSimulator,
  5: Scene05DeltaMiracle,
  6: Scene06FrozenGiantUralDivide,
  7: Scene07DensitySwapExperiment,
  8: Scene08FinaleSynthesis,
};

/**
 * Persistent full-frame (1920x1080) animated cartographic studio backdrop.
 * Remains continuously illuminated underneath all scene sequences so internal
 * cut transitions never flash a stark black void.
 */
const GlobalCartographicBackdrop: React.FC = () => {
  const frame = useCurrentFrame();

  const majorCellPx = 64;
  const minorCellPx = 16;
  const driftX = (frame * 0.14) % majorCellPx;
  const driftY = (frame * 0.08) % majorCellPx;
  const subDriftX = (frame * 0.14) % minorCellPx;
  const subDriftY = (frame * 0.08) % minorCellPx;

  const ambientBreath = 0.88 + 0.12 * Math.sin(frame * 0.018);
  const meridianDashOffset = -(frame * 0.22);

  return (
    <AbsoluteFill
      style={{
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        backgroundColor: TOKENS.colors.bgObsidian,
      }}
    >
      {/* Deep twilight cartographic studio base + dual Eurasian/Bengal horizon glow */}
      <AbsoluteFill
        style={{
          opacity: ambientBreath,
          background: [
            "radial-gradient(ellipse 72% 58% at 50% 44%, rgba(15, 28, 50, 0.76) 0%, rgba(10, 17, 30, 0.54) 54%, rgba(5, 9, 17, 0.96) 100%)",
            "radial-gradient(ellipse 54% 46% at 22% 24%, rgba(56, 189, 248, 0.075) 0%, transparent 70%)",
            "radial-gradient(ellipse 52% 44% at 78% 72%, rgba(16, 185, 129, 0.068) 0%, transparent 70%)",
          ].join(", "),
        }}
      />

      {/* Micro 16px cartographic subdivision mesh */}
      <AbsoluteFill
        style={{
          opacity: 0.28,
          backgroundImage: [
            "linear-gradient(to right, rgba(148, 163, 184, 0.055) 1px, transparent 1px)",
            "linear-gradient(to bottom, rgba(148, 163, 184, 0.055) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: `${minorCellPx}px ${minorCellPx}px`,
          backgroundPosition: `${subDriftX.toFixed(2)}px ${subDriftY.toFixed(2)}px`,
        }}
      />

      {/* Major 64px coordinate grid */}
      <AbsoluteFill
        style={{
          opacity: 0.62,
          backgroundImage: [
            `linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
            `linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
          ].join(", "),
          backgroundSize: `${majorCellPx}px ${majorCellPx}px`,
          backgroundPosition: `${driftX.toFixed(2)}px ${driftY.toFixed(2)}px`,
        }}
      />

      {/* Subtle projected graticule arcs & optical registration crosshairs */}
      <svg
        width={TOKENS.layout.width}
        height={TOKENS.layout.height}
        viewBox={`0 0 ${TOKENS.layout.width} ${TOKENS.layout.height}`}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.5,
        }}
      >
        <g
          fill="none"
          stroke="rgba(148, 163, 184, 0.085)"
          strokeWidth={1}
          strokeDasharray="4 10"
          strokeDashoffset={meridianDashOffset}
        >
          <ellipse cx={960} cy={450} rx={760} ry={310} />
          <ellipse cx={960} cy={450} rx={520} ry={215} />
          <path d="M 120 450 Q 960 320 1800 450" />
          <path d="M 120 450 Q 960 580 1800 450" />
        </g>

        {/* Subtle stage-boundary fiducial crosshairs */}
        {[
          [96, 112],
          [1824, 112],
          [96, 788],
          [1824, 788],
          [960, 450],
        ].map(([cx, cy], idx) => (
          <g
            key={`fiducial-${idx}`}
            stroke="rgba(203, 213, 225, 0.14)"
            strokeWidth={1}
          >
            <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} />
            <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

interface SceneBoundaryEnvelopeProps {
  durationInFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  children: React.ReactNode;
}

/**
 * Applies a smooth 12-frame fade-in / fade-out opacity envelope strictly at
 * internal scene cut boundaries while keeping frame coordinates untouched.
 */
const SceneBoundaryEnvelope: React.FC<SceneBoundaryEnvelopeProps> = ({
  durationInFrames,
  fadeInFrames,
  fadeOutFrames,
  children,
}) => {
  const localFrame = useCurrentFrame();
  const safeDuration = Math.max(2, durationInFrames);
  const maxHalfWindow = Math.floor(safeDuration / 3);

  const inWindow = Math.min(Math.max(0, fadeInFrames), maxHalfWindow);
  const outWindow = Math.min(Math.max(0, fadeOutFrames), maxHalfWindow);

  const fadeInOpacity =
    inWindow > 0
      ? interpolate(localFrame, [0, inWindow], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        })
      : 1;

  const lastFrame = safeDuration - 1;
  const fadeOutStart = Math.max(inWindow, lastFrame - outWindow);
  const fadeOutOpacity =
    outWindow > 0 && lastFrame > fadeOutStart
      ? interpolate(localFrame, [fadeOutStart, lastFrame], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.in(Easing.cubic),
        })
      : 1;

  return (
    <AbsoluteFill
      style={{
        opacity: fadeInOpacity * fadeOutOpacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC<MainVideoProps> = ({
  manifest,
  includeAudio = true,
}) => {
  const scenes = useMemo(
    () =>
      Array.isArray(manifest?.scenes)
        ? [...manifest.scenes].sort((a, b) => a.sceneIndex - b.sceneIndex)
        : [],
    [manifest?.scenes],
  );

  const turnsBySceneIndex = useMemo(() => {
    const grouped = new Map<number, TurnTiming[]>();
    const allTurns = Array.isArray(manifest?.turns) ? manifest.turns : [];
    for (let i = 0; i < allTurns.length; i += 1) {
      const turn = allTurns[i];
      const existing = grouped.get(turn.sceneIndex);
      if (existing) {
        existing.push(turn);
      } else {
        grouped.set(turn.sceneIndex, [turn]);
      }
    }
    return grouped;
  }, [manifest?.turns]);

  const internalCutFrames = useMemo(
    () =>
      scenes
        .map((scene) => scene.startFrame)
        .filter((startFrame) => Number.isFinite(startFrame) && startFrame > 0),
    [scenes],
  );

  const shouldMountMasterAudio =
    includeAudio !== false &&
    Array.isArray(manifest?.turns) &&
    manifest.turns.length > 0 &&
    typeof manifest.masterAudioSrc === "string" &&
    manifest.masterAudioSrc.trim().length > 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Layer 0: Continuous global animated cartographic background grid */}
      <GlobalCartographicBackdrop />

      {/* Layer 10: Sequenced chapters (Scenes 01 .. 08) */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        {scenes.map((scene, index) => {
          const SceneComponent =
            SCENE_REGISTRY[scene.sceneIndex] ?? Scene01ColdOpenShock;
          const sceneTurns = turnsBySceneIndex.get(scene.sceneIndex) ?? [];
          const isFirstScene = index === 0;
          const isLastScene = index === scenes.length - 1;
          const sequenceLabel = `${
            scene.sceneIndex < 10
              ? `0${scene.sceneIndex}`
              : String(scene.sceneIndex)
          } - ${scene.title}`;

          return (
            <Sequence
              key={scene.sceneId}
              name={sequenceLabel}
              from={scene.startFrame}
              durationInFrames={Math.max(1, scene.durationInFrames)}
            >
              <SceneBoundaryEnvelope
                durationInFrames={scene.durationInFrames}
                fadeInFrames={isFirstScene ? 0 : INTERNAL_CUT_FADE_FRAMES}
                fadeOutFrames={isLastScene ? 0 : INTERNAL_CUT_FADE_FRAMES}
              >
                <SceneComponent
                  scene={scene}
                  turns={sceneTurns}
                  manifest={manifest}
                />
              </SceneBoundaryEnvelope>
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {/* Layer 30-35: Broadcast HUD, Rigged Character Stage, Word-Synced Captions */}
      <ChapterHUD manifest={manifest} />
      <CharacterStage manifest={manifest} />
      <SyncedTranscriptBar manifest={manifest} />

      {/* Layer 88-90: Optical cut halation flare & 35mm cinema color-grade overlay */}
      <SceneCutFlash sceneStartFrames={internalCutFrames} />
      <CinemaGradeOverlay />

      {/* Master pre-mixed voiceover + ducked BGM + frame-synced foley audio */}
      {shouldMountMasterAudio ? (
        <Audio src={staticFile(manifest.masterAudioSrc)} volume={1} />
      ) : null}
    </AbsoluteFill>
  );
};

export default MainVideo;
