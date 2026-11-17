import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONTS } from "../theme/fonts";
import { TOKENS, formatNumber, seededUnit } from "../theme/tokens";
import {
  CHARACTERS,
  type CharacterId,
  type SceneProps,
  type TurnTiming,
} from "../types/video";

/**
 * Strict safe-zone stage bounds specified for Scene 08:
 * top: 88..808 (height = 720px), left: 64..1856 (width = 1792px).
 */
const SAFE_STAGE = {
  top: 88,
  left: 64,
  width: 1792,
  height: 720,
} as const;

type DominantNation = "bangladesh" | "russia" | "dual";

interface ScoreboardRowSpec {
  readonly indexLabel: string;
  readonly metricLabel: string;
  readonly axisUnit: string;
  readonly dominant: DominantNation;
  /** Left-side visual weight (0..1) on the center comparison spine */
  readonly bdWeight: number;
  /** Right-side visual weight (0..1) on the center comparison spine */
  readonly ruWeight: number;
  readonly renderBangladeshValue: (countProgress: number) => {
    primary: string;
    badge?: string;
  };
  readonly renderRussiaValue: (countProgress: number) => {
    primary: string;
    badge?: string;
  };
  readonly kind:
    | "area"
    | "population"
    | "density"
    | "timezones"
    | "metro"
    | "geography";
}

const SCOREBOARD_ROWS: readonly ScoreboardRowSpec[] = [
  {
    indexLabel: "01",
    metricLabel: "Total Area",
    axisUnit: "LAND MASS",
    dominant: "russia",
    bdWeight: 0.09,
    ruWeight: 1.0,
    kind: "area",
    renderBangladeshValue: (p) => ({
      primary: `${formatNumber(148460 * p)} km²`,
    }),
    renderRussiaValue: (p) => ({
      primary: `${formatNumber(17098246 * p)} km²`,
      badge: "(115.2× Larger)",
    }),
  },
  {
    indexLabel: "02",
    metricLabel: "Population",
    axisUnit: "HUMAN SCALE",
    dominant: "bangladesh",
    bdWeight: 1.0,
    ruWeight: 0.82,
    kind: "population",
    renderBangladeshValue: (p) => ({
      primary: `~${(175.0 * p).toFixed(1)} Million`,
      badge: "(+31M More)",
    }),
    renderRussiaValue: (p) => ({
      primary: `~${(144.0 * p).toFixed(1)} Million`,
    }),
  },
  {
    indexLabel: "03",
    metricLabel: "Land Density",
    axisUnit: "PEOPLE / KM²",
    dominant: "bangladesh",
    bdWeight: 1.0,
    ruWeight: 0.08,
    kind: "density",
    renderBangladeshValue: (p) => ({
      primary: `~${formatNumber(1330 * p)} / km²`,
      badge: "(158× Denser)",
    }),
    renderRussiaValue: (p) => ({
      primary: `~${(8.4 * p).toFixed(1)} / km²`,
    }),
  },
  {
    indexLabel: "04",
    metricLabel: "Time Zones",
    axisUnit: "LONGITUDE SPAN",
    dominant: "russia",
    bdWeight: 0.14,
    ruWeight: 1.0,
    kind: "timezones",
    renderBangladeshValue: () => ({
      primary: "1 Time Zone",
      badge: "(UTC+6)",
    }),
    renderRussiaValue: (p) => ({
      primary: `${Math.max(1, Math.round(11 * p))} Time Zones`,
      badge: "(UTC+2 to +12)",
    }),
  },
  {
    indexLabel: "05",
    metricLabel: "Largest Metro",
    axisUnit: "PRIMATE CITY",
    dominant: "bangladesh",
    bdWeight: 0.96,
    ruWeight: 0.54,
    kind: "metro",
    renderBangladeshValue: (p) => ({
      primary: "Greater Dhaka",
      badge: `(~${Math.max(1, Math.round(24 * p))}M)`,
    }),
    renderRussiaValue: (p) => ({
      primary: "Moscow Metro",
      badge: `(~${Math.max(1, Math.round(13 * p))}M)`,
    }),
  },
  {
    indexLabel: "06",
    metricLabel: "Core Geography",
    axisUnit: "BIOME & SOIL",
    dominant: "dual",
    bdWeight: 0.88,
    ruWeight: 0.88,
    kind: "geography",
    renderBangladeshValue: () => ({
      primary: "Warm Alluvial River Delta",
    }),
    renderRussiaValue: () => ({
      primary: "65% Permafrost & European Core",
    }),
  },
];

interface StarDot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly baseAlpha: number;
  readonly phase: number;
  readonly tint: "emerald" | "cyan" | "neutral";
}

function clampedProgress(
  frame: number,
  startFrame: number,
  endFrame: number,
  easing?: (input: number) => number,
): number {
  const safeEnd = Math.max(startFrame + 1, endFrame);
  return interpolate(frame, [startFrame, safeEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/**
 * Sovereign geometric emblem for Bangladesh:
 * Deep delta green disc, emerald coordinate ring, rising crimson sun, and 3 braided river arcs.
 */
const BangladeshEmblemSvg: React.FC<{ size: number }> = ({ size }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="32"
        cy="32"
        r="30"
        fill={TOKENS.colors.bengalDeepGreen}
        fillOpacity={0.72}
        stroke={TOKENS.colors.bengalEmerald}
        strokeWidth="1.5"
      />
      <circle
        cx="32"
        cy="32"
        r="24.5"
        stroke={TOKENS.colors.bengalEmerald}
        strokeOpacity={0.35}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {/* Rising Bengal Crimson Disc */}
      <circle
        cx="30.5"
        cy="27"
        r="11.5"
        fill={TOKENS.colors.bengalCrimson}
        fillOpacity={0.92}
      />
      <circle
        cx="30.5"
        cy="27"
        r="14"
        stroke={TOKENS.colors.bengalCrimson}
        strokeOpacity={0.35}
        strokeWidth="1"
      />
      {/* Braided Padma-Jamuna-Meghna Delta Channels */}
      <path
        d="M 11 43 C 20 39, 27 45, 34 41 C 41 37, 47 43, 53 40"
        stroke={TOKENS.colors.textPrimary}
        strokeOpacity={0.85}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M 15 48.5 C 23 45, 30 50, 37 46.5 C 43 43.5, 47 47, 50 46"
        stroke={TOKENS.colors.bengalEmerald}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M 22 53 C 28 51, 35 54, 42 51.5"
        stroke={TOKENS.colors.bengalEmerald}
        strokeOpacity={0.65}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
};

/**
 * Sovereign geometric emblem for Russia:
 * Deep Arctic slate-blue sphere, cyan latitude/meridian arcs, 11 time-zone ticks, and imperial amber star.
 */
const RussiaEmblemSvg: React.FC<{ size: number }> = ({ size }) => {
  const ticks = Array.from({ length: 11 }, (_, idx) => {
    const angleDeg = -140 + idx * 10;
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = 32 + Math.cos(rad) * 24;
    const y1 = 32 + Math.sin(rad) * 24;
    const x2 = 32 + Math.cos(rad) * 27.8;
    const y2 = 32 + Math.sin(rad) * 27.8;
    return { idx, x1, y1, x2, y2 };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="32"
        cy="32"
        r="30"
        fill={TOKENS.colors.russiaDeepBlue}
        fillOpacity={0.78}
        stroke={TOKENS.colors.russiaCyan}
        strokeWidth="1.5"
      />
      {/* 11 Time-Zone Radial Ticks */}
      {ticks.map((tick) => (
        <line
          key={tick.idx}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke={
            tick.idx === 5
              ? TOKENS.colors.imperialAmber
              : TOKENS.colors.russiaIce
          }
          strokeOpacity={tick.idx === 5 ? 0.95 : 0.72}
          strokeWidth={tick.idx === 5 ? "1.8" : "1.3"}
          strokeLinecap="round"
        />
      ))}
      {/* Continental Meridian & Arctic Circle */}
      <ellipse
        cx="32"
        cy="34"
        rx="18"
        ry="10"
        stroke={TOKENS.colors.russiaCyan}
        strokeOpacity={0.62}
        strokeWidth="1.3"
      />
      <ellipse
        cx="32"
        cy="34"
        rx="8.5"
        ry="16"
        stroke={TOKENS.colors.russiaIce}
        strokeOpacity={0.45}
        strokeWidth="1.15"
      />
      <line
        x1="13"
        y1="34"
        x2="51"
        y2="34"
        stroke={TOKENS.colors.russiaCyan}
        strokeOpacity={0.75}
        strokeWidth="1.2"
      />
      {/* Imperial Amber Polar Star */}
      <path
        d="M32 13 L34.1 18.9 L40 21 L34.1 23.1 L32 29 L29.9 23.1 L24 21 L29.9 18.9 Z"
        fill={TOKENS.colors.imperialAmber}
      />
    </svg>
  );
};

/**
 * Full-bleed 1920x1080 atmospheric cartographic canvas behind the safe-zone stage.
 */
const BackdropCartography: React.FC<{
  frame: number;
  dollyProgress: number;
  sceneFadeIn: number;
}> = ({ frame, dollyProgress, sceneFadeIn }) => {
  const stars = useMemo<readonly StarDot[]>(() => {
    return Array.from({ length: 44 }, (_, i) => {
      const x = seededUnit(8100 + i * 17) * 1920;
      const y = seededUnit(8200 + i * 29) * 1080;
      const r = 0.8 + seededUnit(8300 + i * 43) * 1.4;
      const baseAlpha = 0.12 + seededUnit(8400 + i * 61) * 0.28;
      const phase = seededUnit(8500 + i * 79) * Math.PI * 2;
      const tintSelector = seededUnit(8600 + i * 97);
      const tint: StarDot["tint"] =
        tintSelector < 0.34
          ? "emerald"
          : tintSelector < 0.68
            ? "cyan"
            : "neutral";
      return { id: i, x, y, r, baseAlpha, phase, tint };
    });
  }, []);

  const gridScale = interpolate(dollyProgress, [0, 1], [1, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const driftX = Math.sin(frame * 0.008) * 8;
  const driftY = Math.cos(frame * 0.007) * 5;

  const leftGlowX = interpolate(dollyProgress, [0, 1], [24, 38], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rightGlowX = interpolate(dollyProgress, [0, 1], [76, 62], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const amberCenterAlpha = interpolate(dollyProgress, [0, 1], [0.03, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Dual-hemisphere ambient cartographic illumination */}
      <AbsoluteFill
        style={{
          opacity: sceneFadeIn,
          background: `
            radial-gradient(ellipse 680px 500px at ${leftGlowX}% 45%, rgba(16, 185, 129, 0.13) 0%, rgba(244, 42, 65, 0.05) 45%, transparent 76%),
            radial-gradient(ellipse 700px 520px at ${rightGlowX}% 45%, rgba(56, 189, 248, 0.13) 0%, rgba(245, 158, 11, 0.05) 46%, transparent 76%),
            radial-gradient(ellipse 640px 420px at 50% 44%, rgba(245, 158, 11, ${amberCenterAlpha.toFixed(3)}) 0%, transparent 72%),
            linear-gradient(180deg, ${TOKENS.colors.bgObsidian} 0%, ${TOKENS.colors.bgDeepSlate} 52%, ${TOKENS.colors.bgObsidian} 100%)
          `,
        }}
      />

      {/* Parallax Equal-Area Cartographic Graticule */}
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.65 * sceneFadeIn,
          transform: `translate(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px) scale(${gridScale.toFixed(4)})`,
          transformOrigin: "960px 448px",
        }}
      >
        {/* Vertical longitude meridians */}
        {Array.from({ length: 15 }, (_, idx) => {
          const x = 120 + idx * 120;
          const isPrime = idx === 7;
          return (
            <line
              key={`v-${idx}`}
              x1={x}
              y1={0}
              x2={x}
              y2={1080}
              stroke={
                isPrime ? "rgba(245, 158, 11, 0.16)" : TOKENS.colors.gridLine
              }
              strokeWidth={isPrime ? 1.2 : 1}
              strokeDasharray={isPrime ? undefined : "4 8"}
            />
          );
        })}

        {/* Horizontal latitude parallels */}
        {Array.from({ length: 9 }, (_, idx) => {
          const y = 90 + idx * 112;
          return (
            <line
              key={`h-${idx}`}
              x1={0}
              y1={y}
              x2={1920}
              y2={y}
              stroke={TOKENS.colors.gridLine}
              strokeWidth={1}
            />
          );
        })}

        {/* Subtle Great-Circle Geodesic Arcs */}
        <path
          d="M -80 680 Q 960 120 2000 680"
          fill="none"
          stroke="rgba(16, 185, 129, 0.10)"
          strokeWidth="1.25"
        />
        <path
          d="M -80 220 Q 960 760 2000 220"
          fill="none"
          stroke="rgba(56, 189, 248, 0.10)"
          strokeWidth="1.25"
        />

        {/* Deterministic coordinate starfield specks */}
        {stars.map((s) => {
          const pulse = 0.65 + 0.35 * Math.sin(frame * 0.04 + s.phase);
          const fill =
            s.tint === "emerald"
              ? TOKENS.colors.bengalEmerald
              : s.tint === "cyan"
                ? TOKENS.colors.russiaCyan
                : TOKENS.colors.textSecondary;
          return (
            <circle
              key={s.id}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill={fill}
              fillOpacity={s.baseAlpha * pulse}
            />
          );
        })}
      </svg>

      {/* Subtle Cinema Vignette */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 1150px 680px at 50% 46%, transparent 55%, rgba(5, 9, 17, 0.72) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

interface ScoreboardRowProps {
  readonly spec: ScoreboardRowSpec;
  readonly rowIndex: number;
  readonly frame: number;
  readonly fps: number;
  readonly startFrame: number;
  readonly dollyProgress: number;
  readonly isScanFocused: boolean;
}

const ScoreboardRowCard: React.FC<ScoreboardRowProps> = ({
  spec,
  rowIndex,
  frame,
  fps,
  startFrame,
  dollyProgress,
  isScanFocused,
}) => {
  const localRowFrame = Math.max(0, frame - startFrame);
  const enterSpring = spring({
    frame: localRowFrame,
    fps,
    config: {
      damping: 22,
      stiffness: 175,
      mass: 0.84,
    },
  });

  const opacity = clampedProgress(frame, startFrame, startFrame + 14);
  const countProgress = clampedProgress(
    frame,
    startFrame + 2,
    startFrame + 24,
    Easing.out(Easing.cubic),
  );
  const barFillProgress = clampedProgress(
    frame,
    startFrame + 6,
    startFrame + 28,
    Easing.out(Easing.cubic),
  );

  // Camera dolly parting motion as scene transitions from 70% scoreboard into 30% end-title
  const dollyPartPx = interpolate(
    dollyProgress,
    [0, 1],
    [0, 22 + rowIndex * 3],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const leftSlideX = (1 - enterSpring) * -26 - dollyPartPx;
  const rightSlideX = (1 - enterSpring) * 26 + dollyPartPx;
  const centerScale = 0.92 + 0.08 * enterSpring;
  const rowRiseY = (1 - enterSpring) * 12;

  const bdText = spec.renderBangladeshValue(countProgress);
  const ruText = spec.renderRussiaValue(countProgress);

  const bdDominant =
    spec.dominant === "bangladesh" || spec.dominant === "dual";
  const ruDominant = spec.dominant === "russia" || spec.dominant === "dual";

  const focusGlowAlpha = isScanFocused ? 0.24 : 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "726px 308px 726px",
        columnGap: 16,
        height: 82,
        alignItems: "stretch",
        opacity,
        transform: `translateY(${rowRiseY.toFixed(2)}px)`,
      }}
    >
      {/* BANGLADESH CELL (Emerald / Crimson) */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          borderRadius: 12,
          background: bdDominant
            ? "linear-gradient(90deg, rgba(0, 106, 78, 0.30) 0%, rgba(15, 25, 42, 0.92) 62%)"
            : TOKENS.colors.bgCardElevated,
          border: `1px solid ${
            bdDominant
              ? `rgba(16, 185, 129, ${(0.38 + focusGlowAlpha).toFixed(2)})`
              : TOKENS.colors.borderSubtle
          }`,
          boxShadow:
            bdDominant && isScanFocused
              ? "0 0 24px rgba(16, 185, 129, 0.14)"
              : "none",
          transform: `translateX(${leftSlideX.toFixed(2)}px)`,
          overflow: "hidden",
        }}
      >
        {/* Sovereign left accent bar (Emerald + Crimson dual stripe) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 3.5,
            borderRadius: "0 3px 3px 0",
            background: bdDominant
              ? `linear-gradient(180deg, ${TOKENS.colors.bengalEmerald} 0%, ${TOKENS.colors.bengalCrimson} 100%)`
              : "rgba(16, 185, 129, 0.35)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: spec.kind === "geography" ? 22 : 25,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: TOKENS.colors.textPrimary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {bdText.primary}
          </span>

          {bdText.badge ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontFamily: FONTS.mono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: bdDominant
                  ? TOKENS.colors.textPrimary
                  : TOKENS.colors.textSecondary,
                backgroundColor: bdDominant
                  ? "rgba(16, 185, 129, 0.18)"
                  : "rgba(100, 116, 139, 0.16)",
                border: `1px solid ${
                  bdDominant
                    ? "rgba(244, 42, 65, 0.52)"
                    : "rgba(148, 163, 184, 0.24)"
                }`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {bdDominant ? (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: TOKENS.colors.bengalCrimson,
                  }}
                />
              ) : null}
              {bdText.badge}
            </span>
          ) : null}
        </div>

        {/* Right-edge micro telemetry visualization */}
        {spec.kind === "timezones" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 18,
                borderRadius: 3,
                backgroundColor: TOKENS.colors.bengalEmerald,
                border: `1px solid ${TOKENS.colors.bengalCrimson}`,
              }}
            />
          </div>
        ) : (
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: bdDominant
                ? TOKENS.colors.bengalEmerald
                : TOKENS.colors.textMuted,
              textTransform: "uppercase",
            }}
          >
            {bdDominant ? "DELTA LEAD" : "BD"}
          </span>
        )}
      </div>

      {/* CENTER ARCHITECTURAL AXIS SPINE */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 14px",
          borderRadius: 12,
          backgroundColor: TOKENS.colors.bgPanelGlass,
          border: `1px solid ${
            isScanFocused
              ? "rgba(245, 158, 11, 0.42)"
              : TOKENS.colors.borderSubtle
          }`,
          transform: `scale(${centerScale.toFixed(4)})`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 7,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              color: isScanFocused
                ? TOKENS.colors.imperialAmber
                : TOKENS.colors.textMuted,
              letterSpacing: "0.08em",
            }}
          >
            {spec.indexLabel}
          </span>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: TOKENS.colors.textPrimary,
            }}
          >
            {spec.metricLabel}
          </span>
        </div>

        {/* Dual-Sided Proportional Comparison Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 10px 1fr",
            alignItems: "center",
            width: "100%",
            gap: 5,
          }}
        >
          {/* Left (Bangladesh) bar growing right-to-left */}
          <div
            style={{
              height: 5,
              borderRadius: 999,
              backgroundColor: "rgba(148, 163, 184, 0.14)",
              display: "flex",
              justifyContent: "flex-end",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(spec.bdWeight * barFillProgress * 100).toFixed(1)}%`,
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${TOKENS.colors.bengalCrimson} 0%, ${TOKENS.colors.bengalEmerald} 100%)`,
              }}
            />
          </div>

          {/* Center Meridian Diamond */}
          <div
            style={{
              width: 6,
              height: 6,
              margin: "0 auto",
              transform: "rotate(45deg)",
              backgroundColor:
                spec.dominant === "bangladesh"
                  ? TOKENS.colors.bengalEmerald
                  : spec.dominant === "russia"
                    ? TOKENS.colors.russiaCyan
                    : TOKENS.colors.imperialAmber,
            }}
          />

          {/* Right (Russia) bar growing left-to-right */}
          <div
            style={{
              height: 5,
              borderRadius: 999,
              backgroundColor: "rgba(148, 163, 184, 0.14)",
              display: "flex",
              justifyContent: "flex-start",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(spec.ruWeight * barFillProgress * 100).toFixed(1)}%`,
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${TOKENS.colors.russiaCyan} 0%, ${TOKENS.colors.imperialAmber} 100%)`,
              }}
            />
          </div>
        </div>

        <span
          style={{
            marginTop: 5,
            fontFamily: FONTS.mono,
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: "0.16em",
            color: TOKENS.colors.textMuted,
          }}
        >
          {spec.axisUnit}
        </span>
      </div>

      {/* RUSSIA CELL (Arctic Cyan / Imperial Amber) */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          borderRadius: 12,
          background: ruDominant
            ? "linear-gradient(270deg, rgba(12, 74, 110, 0.42) 0%, rgba(15, 25, 42, 0.92) 64%)"
            : TOKENS.colors.bgCardElevated,
          border: `1px solid ${
            ruDominant
              ? `rgba(56, 189, 248, ${(0.38 + focusGlowAlpha).toFixed(2)})`
              : TOKENS.colors.borderSubtle
          }`,
          boxShadow:
            ruDominant && isScanFocused
              ? "0 0 24px rgba(56, 189, 248, 0.14)"
              : "none",
          transform: `translateX(${rightSlideX.toFixed(2)}px)`,
          overflow: "hidden",
        }}
      >
        {/* Left-edge micro telemetry visualization */}
        {spec.kind === "timezones" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {Array.from({ length: 11 }, (_, tzIdx) => {
              const lit = countProgress * 11 >= tzIdx + 0.4;
              return (
                <span
                  key={tzIdx}
                  style={{
                    width: 5,
                    height: 16,
                    borderRadius: 2,
                    backgroundColor: lit
                      ? tzIdx === 5
                        ? TOKENS.colors.imperialAmber
                        : TOKENS.colors.russiaCyan
                      : "rgba(148, 163, 184, 0.18)",
                  }}
                />
              );
            })}
          </div>
        ) : (
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: ruDominant
                ? TOKENS.colors.russiaCyan
                : TOKENS.colors.textMuted,
              textTransform: "uppercase",
            }}
          >
            {ruDominant ? "EURASIA SPAN" : "RU"}
          </span>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: spec.kind === "geography" ? 22 : 25,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: TOKENS.colors.textPrimary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ruText.primary}
          </span>

          {ruText.badge ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontFamily: FONTS.mono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: ruDominant
                  ? TOKENS.colors.textPrimary
                  : TOKENS.colors.textSecondary,
                backgroundColor: ruDominant
                  ? "rgba(56, 189, 248, 0.18)"
                  : "rgba(100, 116, 139, 0.16)",
                border: `1px solid ${
                  ruDominant
                    ? "rgba(245, 158, 11, 0.55)"
                    : "rgba(148, 163, 184, 0.24)"
                }`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ruDominant ? (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: TOKENS.colors.imperialAmber,
                  }}
                />
              ) : null}
              {ruText.badge}
            </span>
          ) : null}
        </div>

        {/* Sovereign right accent bar (Arctic Cyan + Imperial Amber dual stripe) */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 10,
            bottom: 10,
            width: 3.5,
            borderRadius: "3px 0 0 3px",
            background: ruDominant
              ? `linear-gradient(180deg, ${TOKENS.colors.russiaCyan} 0%, ${TOKENS.colors.imperialAmber} 100%)`
              : "rgba(56, 189, 248, 0.35)",
          }}
        />
      </div>
    </div>
  );
};

interface EditorialEndTitleProps {
  readonly frame: number;
  readonly fps: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly dollyProgress: number;
}

/**
 * Final 30% of Scene 08: Iconic Editorial End-Title Lockup.
 * - Subtitle: A SPATIAL DEMOGRAPHY DOCUMENTARY
 * - Headline (FONTS.serif italic + FONTS.display): Maps Measure Land. Rivers & Climate Shape Life.
 * - Twin emblem badges: Bangladesh (175M · 148K km²) & Russia (144M · 17.1M km²)
 */
const EditorialEndTitleLockup: React.FC<EditorialEndTitleProps> = ({
  frame,
  fps,
  startFrame,
  endFrame,
  dollyProgress,
}) => {
  const localFrame = Math.max(0, frame - startFrame);

  const containerOpacity = interpolate(dollyProgress, [0.22, 0.88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Smooth continuous optical camera push across the final 30% end-title hold
  const postDollyHold = clampedProgress(frame, startFrame + 18, endFrame);
  const dollyScale =
    interpolate(dollyProgress, [0.2, 1], [0.92, 1.0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }) +
    postDollyHold * 0.016;

  const dollyTranslateY = interpolate(dollyProgress, [0.2, 1], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const subtitleSpring = spring({
    frame: Math.max(0, localFrame - 2),
    fps,
    config: { damping: 24, stiffness: 170, mass: 0.85 },
  });

  const headlineLine1Spring = spring({
    frame: Math.max(0, localFrame - 8),
    fps,
    config: { damping: 22, stiffness: 165, mass: 0.88 },
  });

  const headlineLine2Spring = spring({
    frame: Math.max(0, localFrame - 15),
    fps,
    config: { damping: 22, stiffness: 155, mass: 0.92 },
  });

  const badgesSpring = spring({
    frame: Math.max(0, localFrame - 23),
    fps,
    config: { damping: 20, stiffness: 160, mass: 0.88 },
  });

  const ruleExpand = clampedProgress(
    frame,
    startFrame + 14,
    startFrame + 40,
    Easing.bezier(0.16, 1, 0.3, 1),
  );

  const astrolabeRotateDeg = localFrame * 0.045;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: containerOpacity,
        transform: `translateY(${dollyTranslateY.toFixed(2)}px) scale(${dollyScale.toFixed(4)})`,
        transformOrigin: "center center",
        pointerEvents: "none",
      }}
    >
      {/* Architectural Inner Frame & Corner Reticles strictly within 1792x720 */}
      <div
        style={{
          position: "absolute",
          inset: "14px 20px",
          border: `1px solid ${TOKENS.colors.borderSubtle}`,
          borderRadius: 20,
          background:
            "radial-gradient(ellipse 980px 440px at 50% 48%, rgba(15, 25, 42, 0.78) 0%, rgba(5, 9, 17, 0.36) 72%, transparent 100%)",
        }}
      />

      {/* Rotating Cartographic Astrolabe / Meridian Rose Backdrop */}
      <svg
        width={560}
        height={560}
        viewBox="0 0 560 560"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          marginLeft: -280,
          marginTop: -280,
          opacity: 0.22 * containerOpacity,
          transform: `rotate(${astrolabeRotateDeg.toFixed(2)}deg)`,
        }}
      >
        <circle
          cx="280"
          cy="280"
          r="256"
          fill="none"
          stroke={TOKENS.colors.imperialAmber}
          strokeOpacity="0.32"
          strokeWidth="1"
          strokeDasharray="3 9"
        />
        <circle
          cx="280"
          cy="280"
          r="210"
          fill="none"
          stroke={TOKENS.colors.bengalEmerald}
          strokeOpacity="0.34"
          strokeWidth="1"
        />
        <circle
          cx="280"
          cy="280"
          r="164"
          fill="none"
          stroke={TOKENS.colors.russiaCyan}
          strokeOpacity="0.34"
          strokeWidth="1"
          strokeDasharray="6 6"
        />
        {Array.from({ length: 24 }, (_, idx) => {
          const rad = (idx * 15 * Math.PI) / 180;
          const rInner = idx % 2 === 0 ? 236 : 244;
          const x1 = 280 + Math.cos(rad) * rInner;
          const y1 = 280 + Math.sin(rad) * rInner;
          const x2 = 280 + Math.cos(rad) * 254;
          const y2 = 280 + Math.sin(rad) * 254;
          return (
            <line
              key={idx}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={TOKENS.colors.textSecondary}
              strokeOpacity={idx % 6 === 0 ? 0.7 : 0.3}
              strokeWidth={idx % 6 === 0 ? 1.5 : 1}
            />
          );
        })}
      </svg>

      {/* Editorial Subtitle Kicker */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: 22,
          opacity: subtitleSpring,
          transform: `translateY(${((1 - subtitleSpring) * 12).toFixed(2)}px)`,
        }}
      >
        <div
          style={{
            width: 84 * ruleExpand,
            height: 1.5,
            background: `linear-gradient(90deg, transparent 0%, ${TOKENS.colors.imperialAmber} 100%)`,
          }}
        />
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.32em",
            color: TOKENS.colors.imperialAmber,
            textTransform: "uppercase",
          }}
        >
          A SPATIAL DEMOGRAPHY DOCUMENTARY
        </span>
        <div
          style={{
            width: 84 * ruleExpand,
            height: 1.5,
            background: `linear-gradient(90deg, ${TOKENS.colors.imperialAmber} 0%, transparent 100%)`,
          }}
        />
      </div>

      {/* Iconic Two-Voice Editorial Headline: FONTS.display + FONTS.serif italic */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 1520,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            color: TOKENS.colors.textPrimary,
            opacity: headlineLine1Spring,
            transform: `translateY(${((1 - headlineLine1Spring) * 18).toFixed(2)}px)`,
          }}
        >
          Maps Measure Land.
        </div>

        <div
          style={{
            marginTop: 6,
            fontFamily: FONTS.serif,
            fontStyle: "italic",
            fontSize: 82,
            fontWeight: 400,
            letterSpacing: "-0.012em",
            lineHeight: 1.06,
            color: TOKENS.colors.textPrimary,
            opacity: headlineLine2Spring,
            transform: `translateY(${((1 - headlineLine2Spring) * 22).toFixed(2)}px)`,
          }}
        >
          <span style={{ color: TOKENS.colors.bengalEmerald }}>Rivers</span>
          {" & "}
          <span style={{ color: TOKENS.colors.russiaIce }}>Climate</span>
          {" Shape Life."}
        </div>
      </div>

      {/* Spectral Sovereign Meridian Divider */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          marginTop: 26,
          marginBottom: 30,
          width: 580,
          opacity: headlineLine2Spring,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 2,
            transform: `scaleX(${ruleExpand.toFixed(4)})`,
            transformOrigin: "right center",
            background: `linear-gradient(90deg, transparent 0%, ${TOKENS.colors.bengalCrimson} 38%, ${TOKENS.colors.bengalEmerald} 100%)`,
          }}
        />
        <div
          style={{
            width: 9,
            height: 9,
            transform: "rotate(45deg)",
            backgroundColor: TOKENS.colors.imperialAmber,
            boxShadow: "0 0 12px rgba(245, 158, 11, 0.55)",
          }}
        />
        <div
          style={{
            flex: 1,
            height: 2,
            transform: `scaleX(${ruleExpand.toFixed(4)})`,
            transformOrigin: "left center",
            background: `linear-gradient(90deg, ${TOKENS.colors.russiaCyan} 0%, ${TOKENS.colors.imperialAmber} 62%, transparent 100%)`,
          }}
        />
      </div>

      {/* Twin Sovereign Emblem Badges Lockup */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          opacity: badgesSpring,
          transform: `translateY(${((1 - badgesSpring) * 20).toFixed(2)}px) scale(${(
            0.95 +
            0.05 * badgesSpring
          ).toFixed(4)})`,
        }}
      >
        {/* BANGLADESH EMBLEM BADGE */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 18,
            width: 452,
            padding: "18px 24px",
            borderRadius: 16,
            background:
              "linear-gradient(135deg, rgba(0, 106, 78, 0.34) 0%, rgba(15, 25, 42, 0.94) 68%)",
            border: "1px solid rgba(16, 185, 129, 0.48)",
            boxShadow: "0 14px 36px rgba(5, 9, 17, 0.55)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 14,
              bottom: 14,
              width: 4,
              borderRadius: "0 4px 4px 0",
              background: `linear-gradient(180deg, ${TOKENS.colors.bengalEmerald} 0%, ${TOKENS.colors.bengalCrimson} 100%)`,
            }}
          />
          <BangladeshEmblemSvg size={60} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  color: TOKENS.colors.bengalEmerald,
                }}
              >
                BANGLADESH
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.bengalCrimson,
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  color: TOKENS.colors.textMuted,
                }}
              >
                ALLUVIAL DELTA
              </span>
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 29,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.colors.textPrimary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              175M · 148K km²
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11,
                fontWeight: 500,
                color: TOKENS.colors.textSecondary,
                letterSpacing: "0.04em",
              }}
            >
              ~1,330 / km² · UTC+6 · Greater Dhaka
            </div>
          </div>
        </div>

        {/* Center Scale Equilibrium Medallion */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 54,
            height: 54,
            borderRadius: "50%",
            backgroundColor: TOKENS.colors.bgCardElevated,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: TOKENS.colors.imperialAmber,
            }}
          >
            2026
          </span>
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 8.5,
              fontWeight: 500,
              letterSpacing: "0.10em",
              color: TOKENS.colors.textMuted,
            }}
          >
            ATLAS
          </span>
        </div>

        {/* RUSSIA EMBLEM BADGE */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 18,
            width: 452,
            padding: "18px 24px",
            borderRadius: 16,
            background:
              "linear-gradient(225deg, rgba(12, 74, 110, 0.44) 0%, rgba(15, 25, 42, 0.94) 68%)",
            border: "1px solid rgba(56, 189, 248, 0.48)",
            boxShadow: "0 14px 36px rgba(5, 9, 17, 0.55)",
          }}
        >
          <RussiaEmblemSvg size={60} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  color: TOKENS.colors.russiaCyan,
                }}
              >
                RUSSIA
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.imperialAmber,
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  color: TOKENS.colors.textMuted,
                }}
              >
                EURASIAN CORE
              </span>
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 29,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.colors.textPrimary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              144M · 17.1M km²
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11,
                fontWeight: 500,
                color: TOKENS.colors.textSecondary,
                letterSpacing: "0.04em",
              }}
            >
              ~8.4 / km² · 11 Zones · Moscow Metro
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 14,
              bottom: 14,
              width: 4,
              borderRadius: "4px 0 0 4px",
              background: `linear-gradient(180deg, ${TOKENS.colors.russiaCyan} 0%, ${TOKENS.colors.imperialAmber} 100%)`,
            }}
          />
        </div>
      </div>

      {/* Archival Cartographic Colophon */}
      <div
        style={{
          position: "relative",
          marginTop: 24,
          fontFamily: FONTS.mono,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.20em",
          color: TOKENS.colors.textMuted,
          opacity: badgesSpring * 0.88,
          textTransform: "uppercase",
        }}
      >
        23.68°N 90.35°E · PADMA-MEGHNA BASIN ↔ 61.52°N 105.32°E · EURASIAN
        CONTINENTAL SHELF
      </div>
    </div>
  );
};

export const Scene08FinaleSynthesis: React.FC<SceneProps> = ({
  scene,
  turns,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.max(90, scene.durationInFrames);
  const globalFrame = scene.startFrame + frame;

  // Identify active dialogue speaker for subtle live desk telemetry
  const activeSpeakerId: CharacterId | null = useMemo(() => {
    const matchingTurn: TurnTiming | undefined = turns.find(
      (t) =>
        t.sceneIndex === scene.sceneIndex &&
        globalFrame >= t.startFrame &&
        globalFrame <= t.endFrame,
    );
    return matchingTurn ? matchingTurn.characterId : null;
  }, [turns, scene.sceneIndex, globalFrame]);

  const activeSpeakerMeta = activeSpeakerId
    ? CHARACTERS[activeSpeakerId]
    : null;

  // Phase split at 70% of Scene 8:
  // First 70% = Master 6-Row Architectural Comparison Scoreboard
  // Final 30% = Camera Dolly Transition into Editorial End-Title Lockup
  const splitFrame = Math.round(totalFrames * 0.7);
  const dollyDuration = Math.max(
    18,
    Math.min(34, Math.round(totalFrames * 0.085)),
  );
  const dollyStartFrame = Math.max(
    24,
    splitFrame - Math.round(dollyDuration * 0.55),
  );
  const dollyEndFrame = Math.min(
    totalFrames - 8,
    dollyStartFrame + dollyDuration,
  );

  const dollyProgress = clampedProgress(
    frame,
    dollyStartFrame,
    dollyEndFrame,
    Easing.bezier(0.22, 1, 0.36, 1),
  );

  const sceneFadeIn = clampedProgress(
    frame,
    0,
    Math.round(fps * 0.5),
    Easing.out(Easing.cubic),
  );

  // Scoreboard entrance & stagger choreography
  const headerSpring = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 170, mass: 0.85 },
  });

  const colHeaderSpring = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 22, stiffness: 170, mass: 0.85 },
  });

  const rowStartBase = Math.max(10, Math.min(16, Math.round(splitFrame * 0.06)));
  const rowStagger = Math.max(
    5,
    Math.min(14, Math.round((splitFrame * 0.34) / SCOREBOARD_ROWS.length)),
  );
  const allRowsSettledFrame =
    rowStartBase + (SCOREBOARD_ROWS.length - 1) * rowStagger + 22;

  // Guided reading scan across the 6 rows once staggered in, prior to dolly
  const scanProgress = clampedProgress(
    frame,
    allRowsSettledFrame,
    Math.max(allRowsSettledFrame + 6, dollyStartFrame - 4),
  );
  const activeScanRow =
    frame >= allRowsSettledFrame && frame <= dollyStartFrame
      ? Math.min(
          SCOREBOARD_ROWS.length - 1,
          Math.floor(scanProgress * SCOREBOARD_ROWS.length),
        )
      : -1;

  // Scoreboard camera dolly forward exit
  const scoreboardOpacity = interpolate(dollyProgress, [0, 0.68], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scoreboardScale = interpolate(dollyProgress, [0, 1], [1, 1.065], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scoreboardTranslateY = interpolate(dollyProgress, [0, 1], [0, -16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const endTitleStartFrame =
    dollyStartFrame + Math.round(dollyDuration * 0.22);

  return (
    <AbsoluteFill>
      {/* Full-canvas atmospheric cartographic background (1920x1080) */}
      <BackdropCartography
        frame={frame}
        dollyProgress={dollyProgress}
        sceneFadeIn={sceneFadeIn}
      />

      {/* Strict Safe-Zone Stage Container: top 88..808, left 64..1856 (1792x720) */}
      <div
        style={{
          position: "absolute",
          top: SAFE_STAGE.top,
          left: SAFE_STAGE.left,
          width: SAFE_STAGE.width,
          height: SAFE_STAGE.height,
          overflow: "hidden",
        }}
      >
        {/* ================================================================
            PHASE 1 (First 70%): Master 6-Row Architectural Scoreboard
           ================================================================ */}
        {scoreboardOpacity > 0.002 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              paddingTop: 4,
              paddingBottom: 6,
              display: "flex",
              flexDirection: "column",
              opacity: scoreboardOpacity,
              transform: `translateY(${scoreboardTranslateY.toFixed(2)}px) scale(${scoreboardScale.toFixed(4)})`,
              transformOrigin: "center 360px",
            }}
          >
            {/* Masthead Strip */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                height: 60,
                marginBottom: 10,
                opacity: headerSpring,
                transform: `translateY(${((1 - headerSpring) * -12).toFixed(2)}px)`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: "0.22em",
                      color: TOKENS.colors.imperialAmber,
                    }}
                  >
                    SCENE 08 · MASTER SYNTHESIS LEDGER
                  </span>
                  {activeSpeakerMeta ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "2px 9px",
                        borderRadius: 999,
                        backgroundColor: "rgba(15, 25, 42, 0.85)",
                        border: `1px solid ${TOKENS.colors.borderSubtle}`,
                        fontFamily: FONTS.mono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.10em",
                        color: activeSpeakerMeta.accentColor,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: activeSpeakerMeta.accentColor,
                        }}
                      />
                      {activeSpeakerMeta.originTag}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 30,
                      fontWeight: 700,
                      letterSpacing: "-0.025em",
                      color: TOKENS.colors.textPrimary,
                    }}
                  >
                    Architectural Scale & Demography Scoreboard
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.serif,
                      fontStyle: "italic",
                      fontSize: 25,
                      color: TOKENS.colors.textSecondary,
                    }}
                  >
                    Six Defining Axes Side by Side
                  </span>
                </div>
              </div>

              {/* Right Legend */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "7px 14px",
                  borderRadius: 10,
                  backgroundColor: TOKENS.colors.bgPanelGlass,
                  border: `1px solid ${TOKENS.colors.borderSubtle}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      backgroundColor: TOKENS.colors.bengalEmerald,
                      border: `1.5px solid ${TOKENS.colors.bengalCrimson}`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      color: TOKENS.colors.textSecondary,
                    }}
                  >
                    HUMAN COMPRESSION
                  </span>
                </div>
                <span style={{ color: TOKENS.colors.borderSubtle }}>|</span>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      backgroundColor: TOKENS.colors.russiaCyan,
                      border: `1.5px solid ${TOKENS.colors.imperialAmber}`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      color: TOKENS.colors.textSecondary,
                    }}
                  >
                    CONTINENTAL EXPANSE
                  </span>
                </div>
              </div>
            </div>

            {/* Sovereign Column Header Architecture Bar */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "726px 308px 726px",
                columnGap: 16,
                height: 64,
                marginBottom: 10,
                opacity: colHeaderSpring,
                transform: `translateY(${((1 - colHeaderSpring) * 10).toFixed(2)}px)`,
              }}
            >
              {/* BANGLADESH Column Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 20px",
                  borderRadius: 12,
                  background:
                    "linear-gradient(90deg, rgba(0, 106, 78, 0.46) 0%, rgba(15, 25, 42, 0.94) 75%)",
                  border: "1px solid rgba(16, 185, 129, 0.52)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <BangladeshEmblemSvg size={40} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontFamily: FONTS.display,
                          fontSize: 22,
                          fontWeight: 700,
                          letterSpacing: "0.16em",
                          color: TOKENS.colors.bengalEmerald,
                        }}
                      >
                        BANGLADESH
                      </span>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: TOKENS.colors.bengalCrimson,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 10.5,
                        fontWeight: 500,
                        letterSpacing: "0.14em",
                        color: TOKENS.colors.textSecondary,
                      }}
                    >
                      PADMA-MEGHNA DELTA · 23.68°N 90.35°E
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    backgroundColor: "rgba(244, 42, 65, 0.16)",
                    border: "1px solid rgba(244, 42, 65, 0.45)",
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  SOUTH ASIA
                </span>
              </div>

              {/* Center Spine Column Header */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: TOKENS.colors.bgPanelGlass,
                  border: `1px solid ${TOKENS.colors.borderSubtle}`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.20em",
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  METRIC SPINE
                </span>
                <span
                  style={{
                    marginTop: 2,
                    fontFamily: FONTS.mono,
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.14em",
                    color: TOKENS.colors.textMuted,
                  }}
                >
                  01 — 06 SYNTHESIS
                </span>
              </div>

              {/* RUSSIA Column Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 20px",
                  borderRadius: 12,
                  background:
                    "linear-gradient(270deg, rgba(12, 74, 110, 0.52) 0%, rgba(15, 25, 42, 0.94) 75%)",
                  border: "1px solid rgba(56, 189, 248, 0.52)",
                }}
              >
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    backgroundColor: "rgba(245, 158, 11, 0.16)",
                    border: "1px solid rgba(245, 158, 11, 0.48)",
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  NORTH EURASIA
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: TOKENS.colors.imperialAmber,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: FONTS.display,
                          fontSize: 22,
                          fontWeight: 700,
                          letterSpacing: "0.16em",
                          color: TOKENS.colors.russiaCyan,
                        }}
                      >
                        RUSSIA
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 10.5,
                        fontWeight: 500,
                        letterSpacing: "0.14em",
                        color: TOKENS.colors.textSecondary,
                      }}
                    >
                      EURASIAN EXPANSE · 61.52°N 105.32°E
                    </span>
                  </div>
                  <RussiaEmblemSvg size={40} />
                </div>
              </div>
            </div>

            {/* 6 Staggered Comparison Rows (6 * 82 + 5 * 8 = 532px; 60+10+64+10+532 = 676px <= 710px) */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                rowGap: 8,
              }}
            >
              {SCOREBOARD_ROWS.map((rowSpec, idx) => (
                <ScoreboardRowCard
                  key={rowSpec.indexLabel}
                  spec={rowSpec}
                  rowIndex={idx}
                  frame={frame}
                  fps={fps}
                  startFrame={rowStartBase + idx * rowStagger}
                  dollyProgress={dollyProgress}
                  isScanFocused={activeScanRow === idx}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* ================================================================
            PHASE 2 (Final 30%): Editorial End-Title Lockup
           ================================================================ */}
        {dollyProgress > 0.18 ? (
          <EditorialEndTitleLockup
            frame={frame}
            fps={fps}
            startFrame={endTitleStartFrame}
            endFrame={totalFrames}
            dollyProgress={dollyProgress}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export default Scene08FinaleSynthesis;
