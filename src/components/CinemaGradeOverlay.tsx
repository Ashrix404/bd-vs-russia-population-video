import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { TOKENS } from "../theme/tokens";

export interface CinemaGradeOverlayProps {
  grainOpacity?: number;
  enableGrain?: boolean;
}

const SPLIT_TONE_WASH_BACKGROUND = [
  "radial-gradient(ellipse 68% 58% at 16% 18%, rgba(56, 189, 248, 0.42) 0%, transparent 70%)",
  "radial-gradient(ellipse 64% 54% at 84% 78%, rgba(16, 185, 129, 0.30) 0%, transparent 68%)",
  "radial-gradient(ellipse 52% 40% at 62% 24%, rgba(245, 158, 11, 0.24) 0%, transparent 66%)",
  "linear-gradient(135deg, rgba(12, 74, 110, 0.28) 0%, rgba(5, 9, 17, 0) 48%, rgba(245, 158, 11, 0.18) 100%)",
].join(", ");

const ANAMORPHIC_VIGNETTE_BACKGROUND =
  "radial-gradient(ellipse 82% 78% at 50% 48%, transparent 58%, rgba(2, 5, 11, 0.58) 100%)";

const FilmGrainLayer: React.FC<{ grainOpacity: number }> = ({
  grainOpacity,
}) => {
  const frame = useCurrentFrame();
  const grainSeed = Math.floor(frame / 2.5) % 97;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${TOKENS.layout.width} ${TOKENS.layout.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: grainOpacity,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    >
      <defs>
        <filter
          id="cinema-35mm-grain-filter"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.78"
            numOctaves={2}
            seed={grainSeed}
            stitchTiles="stitch"
            result="grainNoise"
          />
          <feColorMatrix type="saturate" values="0" in="grainNoise" />
        </filter>
      </defs>
      <rect
        width={TOKENS.layout.width}
        height={TOKENS.layout.height}
        filter="url(#cinema-35mm-grain-filter)"
      />
    </svg>
  );
};

/**
 * Full-frame optical cinema post-processing grade rendered over the composition:
 * split-tone ambient color wash, anamorphic radial vignette, 12fps-stepped 35mm
 * monochrome silver-halide film grain, and a crisp 1px gate hairline.
 */
export const CinemaGradeOverlay: React.FC<CinemaGradeOverlayProps> = ({
  grainOpacity = 0.035,
  enableGrain = true,
}) => {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 90,
        overflow: "hidden",
      }}
    >
      {/* Subtle split-tone ambient wash: cool Arctic cyan shadow lift + warm Delta/Amber highlight warmth */}
      <AbsoluteFill
        style={{
          background: SPLIT_TONE_WASH_BACKGROUND,
          mixBlendMode: "soft-light",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />

      {/* Optical anamorphic radial vignette */}
      <AbsoluteFill
        style={{
          background: ANAMORPHIC_VIGNETTE_BACKGROUND,
          pointerEvents: "none",
        }}
      />

      {/* 12fps-stepped 35mm fine film grain */}
      {enableGrain && grainOpacity > 0 ? (
        <FilmGrainLayer grainOpacity={grainOpacity} />
      ) : null}

      {/* Crisp 1px cinema inner gate frame hairline */}
      <div
        style={{
          position: "absolute",
          inset: 14,
          border: "1px solid rgba(248, 250, 252, 0.05)",
          borderRadius: 2,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

export interface SceneCutFlashProps {
  sceneStartFrames: number[];
}

const CUT_LEAD_FRAMES = 6;
const CUT_TAIL_FRAMES = 8; // 6 + 8 = 14-frame optical bloom window across cut point

/**
 * Subtle 14-frame optical anamorphic flare and halation bloom across scene cut boundaries.
 * Purely additive/screened in place without shifting any timeline frames.
 */
export const SceneCutFlash: React.FC<SceneCutFlashProps> = ({
  sceneStartFrames,
}) => {
  const frame = useCurrentFrame();

  let activeCutFrame: number | null = null;
  let activeCutIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < sceneStartFrames.length; i += 1) {
    const cutFrame = sceneStartFrames[i];
    if (!Number.isFinite(cutFrame) || cutFrame <= 0) {
      continue;
    }

    const delta = frame - cutFrame;
    if (delta >= -CUT_LEAD_FRAMES && delta <= CUT_TAIL_FRAMES) {
      const distance = Math.abs(delta);
      if (distance < minDistance) {
        minDistance = distance;
        activeCutFrame = cutFrame;
        activeCutIndex = i;
      }
    }
  }

  if (activeCutFrame === null) {
    return null;
  }

  const delta = frame - activeCutFrame;

  const intensity =
    delta <= 0
      ? interpolate(delta, [-CUT_LEAD_FRAMES, 0], [0, 1], {
          easing: Easing.bezier(0.22, 0.61, 0.36, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : interpolate(delta, [0, CUT_TAIL_FRAMES], [1, 0], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  const horizontalDriftPx = interpolate(
    delta,
    [-CUT_LEAD_FRAMES, CUT_TAIL_FRAMES],
    [-56, 56],
    {
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const streakScaleX = interpolate(
    delta,
    [-CUT_LEAD_FRAMES, 0, CUT_TAIL_FRAMES],
    [0.52, 1.08, 0.74],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const warmLead = activeCutIndex % 2 === 1;
  const primaryGlow = warmLead
    ? "rgba(16, 185, 129, 0.34)"
    : "rgba(56, 189, 248, 0.36)";
  const secondaryGlow = warmLead
    ? "rgba(245, 158, 11, 0.28)"
    : "rgba(186, 230, 253, 0.30)";

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 88,
        overflow: "hidden",
        mixBlendMode: "screen",
      }}
    >
      {/* Full-frame optical halation cross-glow */}
      <AbsoluteFill
        style={{
          opacity: intensity * 0.16,
          background: `radial-gradient(ellipse 76% 54% at 50% 45%, rgba(248, 250, 252, 0.32) 0%, ${primaryGlow} 42%, transparent 82%)`,
          pointerEvents: "none",
        }}
      />

      {/* Anamorphic horizontal cylindrical lens bloom inside safe stage center */}
      <div
        style={{
          position: "absolute",
          top: 412,
          left: -120,
          right: -120,
          height: 76,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateX(${horizontalDriftPx}px) scaleX(${streakScaleX})`,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: intensity * 0.48,
            background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${secondaryGlow} 0%, ${primaryGlow} 44%, transparent 78%)`,
          }}
        />
        <div
          style={{
            width: "100%",
            height: 2,
            opacity: intensity * 0.62,
            background: warmLead
              ? "linear-gradient(90deg, transparent 6%, rgba(16, 185, 129, 0.55) 28%, rgba(248, 250, 252, 0.88) 50%, rgba(245, 158, 11, 0.55) 72%, transparent 94%)"
              : "linear-gradient(90deg, transparent 6%, rgba(56, 189, 248, 0.58) 28%, rgba(248, 250, 252, 0.88) 50%, rgba(245, 158, 11, 0.48) 72%, transparent 94%)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
