import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  EqualAreaRussiaComparison,
  computeEqualAreaComparisonGeometry,
  getBangladeshCenteredEqualAreaPath,
} from "../components/GeoMapEngine";
import { FONTS } from "../theme/fonts";
import { TOKENS } from "../theme/tokens";
import type { SceneProps } from "../types/video";

const STAGE_WIDTH = 1792;
const MAP_CARD_HEIGHT = 482;
const MAP_SVG_WIDTH = 1476;
const MAP_SVG_HEIGHT = 472;
const MAP_OFFSET_X = 304;
const MAP_OFFSET_Y = 5;

const INSET_ORIGIN_X = 164;
const INSET_ORIGIN_Y = 364;

const RUSSIA_SPAN_KM = 9_000;
const BANGLADESH_SPAN_KM = 600;
const TRUE_MULTIPLIER = 115.2;
const BANGLADESH_AREA_KM2 = 148_460;

export const Scene02TrueSizeOverlay: React.FC<SceneProps> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.max(150, scene.durationInFrames);

  // Precomputed once at module/memo scope — zero per-frame projection recalculation
  const geo = computeEqualAreaComparisonGeometry(
    MAP_SVG_WIDTH,
    MAP_SVG_HEIGHT,
    26,
  );
  const bdUnitPath = getBangladeshCenteredEqualAreaPath(geo.scale);

  const moscowStageX = MAP_OFFSET_X + geo.moscowPoint[0];
  const moscowStageY = MAP_OFFSET_Y + geo.moscowPoint[1];
  const yakutskStageX = MAP_OFFSET_X + geo.yakutskPoint[0];
  const yakutskStageY = MAP_OFFSET_Y + geo.yakutskPoint[1];
  const kamchatkaStageX = MAP_OFFSET_X + geo.kamchatkaPoint[0];
  const kamchatkaStageY = MAP_OFFSET_Y + geo.kamchatkaPoint[1];

  // Timeline beat frames (adaptive to scene.durationInFrames)
  const glideStartFrame = Math.round(totalFrames * 0.15);
  const glideEndFrame = Math.round(totalFrames * 0.34);
  const swarmStartFrame = Math.round(totalFrames * 0.39);
  const swarmEndFrame = Math.round(totalFrames * 0.8);
  const rulerStartFrame = Math.round(totalFrames * 0.54);
  const rulerEndFrame = Math.round(totalFrames * 0.84);

  const sceneEnter = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Opening Mercator ghost dissolves out to reveal true Equal-Area Russia
  const mercatorGhostOpacity = interpolate(
    frame,
    [4, Math.round(totalFrames * 0.16)],
    [0.52, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    },
  );

  // Phase 1 -> 2: Bangladesh lifts from South Asia inset and glides onto Moscow
  const glideT = interpolate(frame, [glideStartFrame, glideEndFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  // Quadratic Bezier trajectory from South Asia Inset (164, 364) -> Control -> Moscow
  const ctrlX = (INSET_ORIGIN_X + moscowStageX) * 0.46;
  const ctrlY = Math.min(INSET_ORIGIN_Y, moscowStageY) - 96;
  const oneMinusT = 1 - glideT;
  const gliderX =
    oneMinusT * oneMinusT * INSET_ORIGIN_X +
    2 * oneMinusT * glideT * ctrlX +
    glideT * glideT * moscowStageX;
  const gliderY =
    oneMinusT * oneMinusT * INSET_ORIGIN_Y +
    2 * oneMinusT * glideT * ctrlY +
    glideT * glideT * moscowStageY;

  // Subtle physical lift scale mid-flight (1.0 -> 1.14 -> 1.0) — exact true scale at rest & touchdown
  const gliderLiftScale = 1 + Math.sin(glideT * Math.PI) * 0.14;
  const hasLandedOnMoscow = frame >= glideEndFrame;

  // Touchdown sonar ring on Moscow
  const moscowTouchdownProgress = interpolate(
    frame,
    [glideEndFrame, glideEndFrame + 26],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Phase 3: Staggered multiplication from 1x -> 115.2x across Russia's interior
  const tileSwarmProgress = !hasLandedOnMoscow
    ? 0
    : frame < swarmStartFrame
      ? 1
      : interpolate(
          frame,
          [swarmStartFrame, swarmEndFrame],
          [1, TRUE_MULTIPLIER],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.2, 0.85, 0.28, 1),
          },
        );

  // Giant tabular counter: 1.0x -> 115.2x
  const displayedMultiplier =
    frame < glideStartFrame
      ? 1.0
      : frame < swarmStartFrame
        ? 1.0
        : tileSwarmProgress;

  const counterLockSlam = spring({
    frame: frame - (swarmEndFrame - 4),
    fps,
    config: { damping: 14, stiffness: 200, mass: 0.75 },
  });
  const isSwarmComplete = frame >= swarmEndFrame - 4;
  const counterBadgeScale = isSwarmComplete
    ? interpolate(counterLockSlam, [0, 1], [1.1, 1])
    : 1;

  // Trajectory arc SVG path up to current glideT
  const trajectoryPathD = (() => {
    if (glideT <= 0.01) {
      return "";
    }
    const steps = 28;
    const maxStep = Math.max(1, Math.round(glideT * steps));
    const parts: string[] = [];
    for (let s = 0; s <= maxStep; s += 1) {
      const u = s / steps;
      const iu = 1 - u;
      const px =
        iu * iu * INSET_ORIGIN_X +
        2 * iu * u * ctrlX +
        u * u * moscowStageX;
      const py =
        iu * iu * INSET_ORIGIN_Y +
        2 * iu * u * ctrlY +
        u * u * moscowStageY;
      parts.push(`${s === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return parts.join(" ");
  })();

  // Phase 4: Horizontal span ruler (9,000 km vs 600 km)
  const russiaRulerProgress = interpolate(
    frame,
    [rulerStartFrame - 24, rulerEndFrame - 12],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );
  const bdRulerProgress = interpolate(
    frame,
    [rulerStartFrame, rulerEndFrame],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const bdProportionalWidthPct = (BANGLADESH_SPAN_KM / RUSSIA_SPAN_KM) * 100; // 6.6667%

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Full-canvas deep obsidian cartographic lighting */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 58% 38%, rgba(56, 189, 248, 0.1) 0%, rgba(16, 185, 129, 0.06) 42%, rgba(5, 9, 17, 0.98) 78%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          opacity: 0.34,
        }}
      />

      {/* STRICT SAFE-ZONE STAGE: top 88..808, left 64..1856 (1792 x 720) */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          width: STAGE_WIDTH,
          height: 720,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          opacity: sceneEnter,
          boxSizing: "border-box",
        }}
      >
        {/* TOP HEADER & GIANT TABULAR MULTIPLIER COUNTER (102px) */}
        <div
          style={{
            height: 102,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          {/* Left Cartographic Headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  color: TOKENS.colors.russiaCyan,
                }}
              >
                02 // LAMBERT AZIMUTHAL EQUAL-AREA OVERLAY
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  backgroundColor: "rgba(16, 185, 129, 0.14)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#A7F3D0",
                }}
              >
                ZERO MERCATOR DISTORTION
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 42,
                lineHeight: 1.04,
                color: TOKENS.colors.textPrimary,
              }}
            >
              How Many Bangladeshes Fit Inside Russia?
            </div>

            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 14,
                color: TOKENS.colors.textSecondary,
              }}
            >
              True-scale equal-area silhouettes projected at identical km²-per-pixel
              resolution
            </div>
          </div>

          {/* Right Giant Tabular Counter Card: 1x -> 115.2x BANGLADESHES FIT INSIDE RUSSIA */}
          <div
            style={{
              height: 98,
              minWidth: 740,
              padding: "12px 24px",
              boxSizing: "border-box",
              borderRadius: 15,
              backgroundColor: TOKENS.colors.bgCardElevated,
              border: isSwarmComplete
                ? `1.5px solid ${TOKENS.colors.bengalEmerald}`
                : `1px solid ${TOKENS.colors.borderSubtle}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              transform: `scale(${counterBadgeScale})`,
              transformOrigin: "right center",
              boxShadow: isSwarmComplete
                ? "0 14px 38px rgba(16, 185, 129, 0.22)"
                : "0 12px 30px rgba(0, 0, 0, 0.38)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 54,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: isSwarmComplete
                    ? "#6EE7B7"
                    : TOKENS.colors.bengalEmerald,
                  fontVariantNumeric: "tabular-nums",
                  textShadow: "0 0 24px rgba(16, 185, 129, 0.38)",
                }}
              >
                {displayedMultiplier.toFixed(1)}×
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 5,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18.5,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: TOKENS.colors.textPrimary,
                }}
              >
                BANGLADESHES FIT INSIDE RUSSIA
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12.5,
                  color: TOKENS.colors.russiaIce,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                COVERED:{" "}
                {TOKENS.formatNumber(
                  Math.min(
                    17_098_246,
                    displayedMultiplier * BANGLADESH_AREA_KM2,
                  ),
                )}{" "}
                / 17,098,246 km²
              </span>
            </div>
          </div>
        </div>

        {/* CENTER EQUAL-AREA MAP STAGE + SOUTH ASIA INSET + 115.2x SWARM (482px) */}
        <div
          style={{
            width: STAGE_WIDTH,
            height: MAP_CARD_HEIGHT,
            borderRadius: 18,
            backgroundColor: TOKENS.colors.bgPanelGlass,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 18px 46px rgba(0, 0, 0, 0.42)",
          }}
        >
          {/* Projection Telemetry Tag (Top-Left of Map Stage) */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 18,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              zIndex: 3,
            }}
          >
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                backgroundColor: "rgba(5, 9, 17, 0.84)",
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                fontFamily: FONTS.mono,
                fontSize: 11.5,
                color: TOKENS.colors.textSecondary,
              }}
            >
              CENTER: 98°E · 62°N (CENTRAL SIBERIA)
            </div>
            {mercatorGhostOpacity > 0.04 && (
              <div
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  backgroundColor: "rgba(251, 113, 133, 0.14)",
                  border: `1px solid ${TOKENS.colors.coralAccent}`,
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: "#FFE4E6",
                  opacity: Math.min(1, mercatorGhostOpacity * 2.2),
                }}
              >
                -- REMOVING MERCATOR INFLATION
              </div>
            )}
          </div>

          {/* Equal-Area Russia Comparison SVG (1476 x 472 at offset 304, 5) */}
          <div
            style={{
              position: "absolute",
              left: MAP_OFFSET_X,
              top: MAP_OFFSET_Y,
              width: MAP_SVG_WIDTH,
              height: MAP_SVG_HEIGHT,
            }}
          >
            <EqualAreaRussiaComparison
              width={MAP_SVG_WIDTH}
              height={MAP_SVG_HEIGHT}
              padding={26}
              mercatorGhostOpacity={mercatorGhostOpacity}
              tileSwarmProgress={tileSwarmProgress}
              showMoscowAnchorTile={hasLandedOnMoscow}
            />
          </div>

          {/* South Asia True-Scale Origin Inset Card Frame (Lower-Left: x=16..312, y=262..466) */}
          <div
            style={{
              position: "absolute",
              left: 16,
              top: 262,
              width: 296,
              height: 204,
              borderRadius: 14,
              backgroundColor: "rgba(7, 13, 24, 0.92)",
              border: "1px solid rgba(16, 185, 129, 0.42)",
              padding: "10px 14px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "#6EE7B7",
                }}
              >
                SOUTH ASIA INSET (1:1 SCALE)
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  color: TOKENS.colors.textMuted,
                }}
              >
                23.7°N 90.4°E
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 11.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                Bay of Bengal · True Area
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: TOKENS.colors.bengalEmerald,
                }}
              >
                148,460 km² (1.0×)
              </span>
            </div>
          </div>

          {/* Unified Stage Overlay SVG: Inset Footprint, Flight Arc, Gliding Silhouette & Regional Pins */}
          <svg
            width={STAGE_WIDTH}
            height={MAP_CARD_HEIGHT}
            viewBox={`0 0 ${STAGE_WIDTH} ${MAP_CARD_HEIGHT}`}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            {/* Subtle Bay of Bengal shoreline & graticule inside the South Asia Inset */}
            <g opacity={0.5}>
              <line
                x1={28}
                y1={INSET_ORIGIN_Y}
                x2={300}
                y2={INSET_ORIGIN_Y}
                stroke="rgba(16, 185, 129, 0.18)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <line
                x1={INSET_ORIGIN_X}
                y1={296}
                x2={INSET_ORIGIN_X}
                y2={434}
                stroke="rgba(16, 185, 129, 0.18)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
            </g>

            {/* Dashed 1:1 true-scale footprint left behind in South Asia Inset */}
            <g transform={`translate(${INSET_ORIGIN_X}, ${INSET_ORIGIN_Y})`}>
              <path
                d={bdUnitPath}
                fill="rgba(16, 185, 129, 0.14)"
                stroke={TOKENS.colors.bengalEmerald}
                strokeWidth={1.2}
                strokeDasharray="3 2"
              />
            </g>

            {/* Flight trajectory arc from South Asia Inset -> Moscow */}
            {trajectoryPathD && (
              <g opacity={hasLandedOnMoscow ? 0.42 : 0.92}>
                <path
                  d={trajectoryPathD}
                  fill="none"
                  stroke={TOKENS.colors.bengalEmerald}
                  strokeWidth={4}
                  strokeOpacity={0.2}
                />
                <path
                  d={trajectoryPathD}
                  fill="none"
                  stroke="#6EE7B7"
                  strokeWidth={1.7}
                  strokeDasharray="5 4"
                />
              </g>
            )}

            {/* Gliding True-Scale Bangladesh Silhouette (from Inset -> Moscow prior to handoff) */}
            {!hasLandedOnMoscow && (
              <g
                transform={`translate(${gliderX.toFixed(1)}, ${gliderY.toFixed(1)}) scale(${gliderLiftScale.toFixed(3)})`}
              >
                <path
                  d={bdUnitPath}
                  fill="none"
                  stroke={TOKENS.colors.bengalEmerald}
                  strokeWidth={5}
                  strokeOpacity={0.42}
                />
                <path
                  d={bdUnitPath}
                  fill={TOKENS.colors.bengalEmerald}
                  stroke="#FEF2F2"
                  strokeWidth={1.4}
                />
                <circle
                  r={3.2}
                  fill={TOKENS.colors.bengalCrimson}
                  stroke="#FFFFFF"
                  strokeWidth={0.9}
                />
              </g>
            )}

            {/* Moscow Touchdown Sonar Ring & Anchor Callout */}
            {hasLandedOnMoscow && (
              <g transform={`translate(${moscowStageX}, ${moscowStageY})`}>
                {moscowTouchdownProgress < 1 && (
                  <circle
                    r={10 + moscowTouchdownProgress * 44}
                    fill="none"
                    stroke={TOKENS.colors.bengalCrimson}
                    strokeWidth={2}
                    strokeOpacity={1 - moscowTouchdownProgress}
                  />
                )}
                <circle
                  r={4}
                  fill={TOKENS.colors.bengalCrimson}
                  stroke="#FFFFFF"
                  strokeWidth={1.2}
                />
                <g transform="translate(-74, -42)">
                  <rect
                    x={0}
                    y={0}
                    width={148}
                    height={24}
                    rx={5}
                    fill="rgba(5, 9, 17, 0.9)"
                    stroke={TOKENS.colors.bengalEmerald}
                    strokeWidth={1.1}
                  />
                  <text
                    x={74}
                    y={15.5}
                    textAnchor="middle"
                    fill="#ECFDF5"
                    fontFamily={FONTS.mono}
                    fontSize={10.5}
                    fontWeight={700}
                  >
                    MOSCOW · TILE #1
                  </text>
                </g>
              </g>
            )}

            {/* Yakutia Wave Milestone Pin */}
            {tileSwarmProgress >= 78 && (
              <g
                transform={`translate(${yakutskStageX}, ${yakutskStageY})`}
                opacity={Math.min(1, (tileSwarmProgress - 78) / 10)}
              >
                <circle r={3.5} fill={TOKENS.colors.imperialAmber} />
                <g transform="translate(-62, -34)">
                  <rect
                    x={0}
                    y={0}
                    width={124}
                    height={22}
                    rx={5}
                    fill="rgba(5, 9, 17, 0.88)"
                    stroke={TOKENS.colors.imperialAmber}
                    strokeWidth={1}
                  />
                  <text
                    x={62}
                    y={14.5}
                    textAnchor="middle"
                    fill={TOKENS.colors.imperialAmber}
                    fontFamily={FONTS.mono}
                    fontSize={10}
                    fontWeight={700}
                  >
                    YAKUTIA · 85×
                  </text>
                </g>
              </g>
            )}

            {/* Kamchatka / Far East Completion Pin: 115.2x */}
            {tileSwarmProgress >= 112 && (
              <g
                transform={`translate(${kamchatkaStageX}, ${kamchatkaStageY})`}
                opacity={Math.min(1, (tileSwarmProgress - 112) / 3)}
              >
                <circle r={4} fill="#6EE7B7" />
                <g transform="translate(-128, 12)">
                  <rect
                    x={0}
                    y={0}
                    width={146}
                    height={24}
                    rx={5}
                    fill="rgba(5, 9, 17, 0.92)"
                    stroke="#6EE7B7"
                    strokeWidth={1.1}
                  />
                  <text
                    x={73}
                    y={15.5}
                    textAnchor="middle"
                    fill="#6EE7B7"
                    fontFamily={FONTS.mono}
                    fontSize={10.5}
                    fontWeight={700}
                  >
                    PACIFIC EDGE · 115.2×
                  </text>
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* BOTTOM SLEEK HORIZONTAL SPAN RULER (116px): 9,000 km vs 600 km */}
        <div
          style={{
            width: STAGE_WIDTH,
            height: 116,
            borderRadius: 15,
            backgroundColor: TOKENS.colors.bgCardElevated,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            padding: "12px 24px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Upper Track: Russia 9,000 km (11 Time Zones · 11-Hr Flight) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
            }}
          >
            <div style={{ width: 208, flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 14,
                  fontWeight: 700,
                  color: TOKENS.colors.russiaCyan,
                  letterSpacing: "0.06em",
                }}
              >
                RUSSIA EAST–WEST SPAN
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: TOKENS.colors.textMuted,
                }}
              >
                Kaliningrad → Bering Strait
              </div>
            </div>

            <div
              style={{
                flex: 1,
                height: 24,
                borderRadius: 6,
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(56, 189, 248, 0.28)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${russiaRulerProgress * 100}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #0369A1 0%, #38BDF8 72%, #BAE6FD 100%)",
                  boxShadow: "0 0 16px rgba(56, 189, 248, 0.35)",
                }}
              />
              {/* 11 Timezone ruler calibration ticks */}
              {Array.from({ length: 11 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${((idx + 1) / 11) * 100}%`,
                    width: 1,
                    backgroundColor: "rgba(5, 9, 17, 0.5)",
                  }}
                />
              ))}
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: 4,
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#F8FAFC",
                  opacity: russiaRulerProgress,
                }}
              >
                UTC+2 ········ 11 TIME ZONES · 11-HR JET FLIGHT ········ UTC+12
              </span>
            </div>

            <div
              style={{
                width: 340,
                flexShrink: 0,
                textAlign: "right",
                fontFamily: FONTS.mono,
                fontSize: 15,
                fontWeight: 700,
                color: TOKENS.colors.russiaIce,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {TOKENS.formatNumber(RUSSIA_SPAN_KM * russiaRulerProgress)} km{" "}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                (11 Time Zones · 11-Hr Flight)
              </span>
            </div>
          </div>

          {/* Lower Track: Bangladesh 600 km at exact 6.67% proportional width */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
            }}
          >
            <div style={{ width: 208, flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 14,
                  fontWeight: 700,
                  color: TOKENS.colors.bengalEmerald,
                  letterSpacing: "0.06em",
                }}
              >
                BANGLADESH SPAN
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: TOKENS.colors.textMuted,
                }}
              >
                Satkhira → Teknaf / Sylhet
              </div>
            </div>

            <div
              style={{
                flex: 1,
                height: 24,
                borderRadius: 6,
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "flex",
                alignItems: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${bdRulerProgress * bdProportionalWidthPct}%`,
                  height: "100%",
                  borderRadius: "5px 3px 3px 5px",
                  background: `linear-gradient(90deg, ${TOKENS.colors.bengalEmerald} 0%, ${TOKENS.colors.bengalCrimson} 100%)`,
                  boxShadow: "0 0 14px rgba(16, 185, 129, 0.65)",
                }}
              />
              <span
                style={{
                  marginLeft: 12,
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "#6EE7B7",
                  opacity: bdRulerProgress,
                }}
              >
                ← 600 km (6.7% OF RUSSIA&apos;S WIDTH · 15× NARROWER)
              </span>
            </div>

            <div
              style={{
                width: 340,
                flexShrink: 0,
                textAlign: "right",
                fontFamily: FONTS.mono,
                fontSize: 15,
                fontWeight: 700,
                color: "#6EE7B7",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {TOKENS.formatNumber(BANGLADESH_SPAN_KM * bdRulerProgress)} km{" "}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                (1 Time Zone · 45-Min Flight)
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene02TrueSizeOverlay;
