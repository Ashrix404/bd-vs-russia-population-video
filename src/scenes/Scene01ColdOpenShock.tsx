import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { OrthographicGlobe } from "../components/GeoMapEngine";
import { FONTS } from "../theme/fonts";
import { TOKENS } from "../theme/tokens";
import type { SceneProps } from "../types/video";

const RUSSIA_AREA_KM2 = 17_098_246;
const BANGLADESH_AREA_KM2 = 148_460;
const RUSSIA_POPULATION = 144_000_000;
const BANGLADESH_POPULATION = 175_000_000;
const POPULATION_SURPLUS = BANGLADESH_POPULATION - RUSSIA_POPULATION; // 31,000,000

export const Scene01ColdOpenShock: React.FC<SceneProps> = ({
  scene,
  turns,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.max(120, scene.durationInFrames);

  // If spoken turns exist in CI manifest, anchor the population twist near the middle turn,
  // clamped strictly so both halves always have full breathing room.
  const defaultTwistFrame = Math.round(totalFrames * 0.47);
  const turnAnchoredTwist =
    turns.length >= 2
      ? turns[Math.floor(turns.length / 2)].startFrame - scene.startFrame
      : defaultTwistFrame;
  const twistStartFrame = Math.max(
    Math.round(totalFrames * 0.38),
    Math.min(Math.round(totalFrames * 0.56), turnAnchoredTwist),
  );

  // Scene entrance & exit envelope
  const sceneEnter = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const sceneExit = interpolate(
    frame,
    [totalFrames - 14, totalFrames],
    [1, 0.94],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Globe choreography:
  // Phase A (0 -> slewStart): sweep across Siberia/Moscow [88, 60] while 11 timezone arcs illuminate
  // Phase B (slewStart -> slewEnd): majestic orbital tilt down to Bay of Bengal [90.4, 24]
  const slewStart = Math.round(totalFrames * 0.24);
  const slewEnd = Math.round(totalFrames * 0.54);

  const prePanLon = interpolate(frame, [0, slewStart], [72, 88], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const slewProgress = interpolate(frame, [slewStart, slewEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  const postSlewDriftLon =
    frame > slewEnd ? Math.sin((frame - slewEnd) * 0.025) * 1.3 : 0;
  const postSlewDriftLat =
    frame > slewEnd ? Math.cos((frame - slewEnd) * 0.02) * 0.7 : 0;

  const rotateLon =
    (frame <= slewStart ? prePanLon : 88 + (90.4 - 88) * slewProgress) +
    postSlewDriftLon;
  const rotateLat = 60 + (24 - 60) * slewProgress + postSlewDriftLat;

  const globeScale = interpolate(
    frame,
    [0, slewStart, slewEnd, totalFrames],
    [244, 254, 286, 292],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const globeRoll = interpolate(
    frame,
    [0, slewStart, slewEnd],
    [-4.5, -2.0, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // 11 Timezones sweep across Russia in first third of scene
  const timezoneSweepProgress = interpolate(
    frame,
    [8, Math.round(totalFrames * 0.3)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );
  const activeTimezoneCount = Math.max(
    1,
    Math.min(11, Math.round(timezoneSweepProgress * 11)),
  );

  const connectionArcProgress = interpolate(
    frame,
    [slewStart + 6, slewEnd + 8],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const bangladeshFocus = interpolate(
    frame,
    [slewStart, slewEnd - 8],
    [0.45, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Card 1: Land Area Comparison choreography
  const areaCardSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 20, stiffness: 130, mass: 0.9 },
  });

  const russiaAreaProgress = interpolate(
    frame,
    [16, Math.round(totalFrames * 0.27)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const bdAreaProgress = interpolate(
    frame,
    [Math.round(totalFrames * 0.22), Math.round(totalFrames * 0.38)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const displayedRussiaArea = RUSSIA_AREA_KM2 * russiaAreaProgress;
  const displayedBdArea = BANGLADESH_AREA_KM2 * bdAreaProgress;

  // Card 2: The Population Twist choreography
  const popCardEnter = spring({
    frame: frame - (twistStartFrame - 18),
    fps,
    config: { damping: 19, stiffness: 135, mass: 0.85 },
  });

  const russiaPopProgress = interpolate(
    frame,
    [twistStartFrame - 10, twistStartFrame + 24],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
    },
  );

  // Bangladesh population surges past 144,000,000 all the way to 175,000,000
  const bdSurgeStart = twistStartFrame + 14;
  const bdSurgeEnd = twistStartFrame + 64;
  const bdPopProgress = interpolate(frame, [bdSurgeStart, bdSurgeEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.18, 0.95, 0.28, 1),
  });

  const displayedRussiaPop = RUSSIA_POPULATION * russiaPopProgress;
  const displayedBdPop = BANGLADESH_POPULATION * bdPopProgress;
  const surpassedRussia = displayedBdPop >= RUSSIA_POPULATION;

  // Dramatic spring slam for "+31 MILLION MORE PEOPLE" badge right as BD hits 175M
  const slamTriggerFrame = bdSurgeEnd - 6;
  const badgeSlamSpring = spring({
    frame: frame - slamTriggerFrame,
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.72 },
  });
  const badgeVisible = frame >= slamTriggerFrame;
  const badgeScale = badgeVisible
    ? interpolate(badgeSlamSpring, [0, 1], [1.42, 1])
    : 0.7;
  const badgeOpacity = interpolate(
    frame,
    [slamTriggerFrame, slamTriggerFrame + 7],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Subtle impact micro-jolt on Card 2 when the +31M twist slams in
  const cardRecoilY =
    frame >= slamTriggerFrame && frame <= slamTriggerFrame + 10
      ? Math.sin(((frame - slamTriggerFrame) / 10) * Math.PI) * 3.2
      : 0;

  const russiaPopRatioPct = (RUSSIA_POPULATION / BANGLADESH_POPULATION) * 100; // 82.2857%

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Full-canvas atmospheric background (safe behind HUD & CharacterStage) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 24% 44%, rgba(56, 189, 248, 0.11) 0%, rgba(16, 185, 129, 0.05) 36%, rgba(5, 9, 17, 0.98) 76%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          opacity: 0.38,
        }}
      />

      {/* STRICT SAFE-ZONE STAGE: top 88..808, left 64..1856 (1792 x 720) */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          width: 1792,
          height: 720,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          justifyContent: "space-between",
          gap: 28,
          opacity: sceneEnter * sceneExit,
          boxSizing: "border-box",
        }}
      >
        {/* LEFT PANEL: 3D Orthographic Globe & 11-Timezone Telemetry (776 x 720) */}
        <div
          style={{
            width: 776,
            height: 720,
            backgroundColor: TOKENS.colors.bgPanelGlass,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            borderRadius: 18,
            padding: "16px 20px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.45)",
          }}
        >
          {/* Top Orbital Telemetry Strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 36,
              borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
              paddingBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor:
                    slewProgress > 0.6
                      ? TOKENS.colors.bengalEmerald
                      : TOKENS.colors.russiaCyan,
                  boxShadow:
                    slewProgress > 0.6
                      ? `0 0 10px ${TOKENS.colors.bengalEmerald}`
                      : `0 0 10px ${TOKENS.colors.russiaCyan}`,
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: TOKENS.colors.textSecondary,
                }}
              >
                ORTHOGRAPHIC SPHERE ·{" "}
                {slewProgress < 0.45
                  ? "SIBERIA / MOSCOW SECTOR"
                  : "BAY OF BENGAL LOCK"}
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12,
                fontWeight: 500,
                color: TOKENS.colors.russiaIce,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {rotateLat.toFixed(1)}°N · {rotateLon.toFixed(1)}°E
            </div>
          </div>

          {/* Center 3D Orthographic Globe */}
          <div
            style={{
              width: 736,
              height: 592,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <OrthographicGlobe
              width={736}
              height={592}
              rotateLon={rotateLon}
              rotateLat={rotateLat}
              scale={globeScale}
              rollDeg={globeRoll}
              timezoneSweepProgress={timezoneSweepProgress}
              beaconPulsePhase={frame * 0.026}
              bangladeshFocus={bangladeshFocus}
              connectionArcProgress={connectionArcProgress}
              showLabels
            />
          </div>

          {/* Bottom Globe Legend & Timezone Sweep Readout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 44,
              borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
              paddingTop: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  backgroundColor: "rgba(56, 189, 248, 0.14)",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: TOKENS.colors.russiaIce,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {activeTimezoneCount} / 11 TIME ZONES
              </span>
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 12.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                UTC+2 Kaliningrad → UTC+12 Kamchatka
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.bengalCrimson,
                  border: `2px solid ${TOKENS.colors.bengalEmerald}`,
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "#A7F3D0",
                }}
              >
                DHAKA · 1 TIME ZONE (UTC+6)
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Kinetic Editorial Comparison Cards (988 x 720) */}
        <div
          style={{
            width: 988,
            height: 720,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          {/* Editorial Headline Block (92px) */}
          <div
            style={{
              height: 92,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  color: TOKENS.colors.imperialAmber,
                }}
              >
                01 // THE GEOGRAPHIC SCALE PARADOX
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  color: TOKENS.colors.textMuted,
                }}
              >
                LAND RATIO 115.2 : 1
              </span>
            </div>
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 44,
                lineHeight: 1.05,
                color: TOKENS.colors.textPrimary,
                letterSpacing: "-0.01em",
              }}
            >
              Continental Colossus vs. Crowded Delta
            </div>
          </div>

          {/* CARD 1: LAND AREA COMPARISON (274px) */}
          <div
            style={{
              height: 274,
              backgroundColor: TOKENS.colors.bgCardElevated,
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              borderRadius: 16,
              padding: "18px 24px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: areaCardSpring,
              transform: `translateY(${(1 - areaCardSpring) * 18}px)`,
              boxShadow: "0 14px 36px rgba(0, 0, 0, 0.36)",
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
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: TOKENS.colors.textSecondary,
                }}
              >
                METRIC A · TOTAL SURFACE LAND AREA
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  color: TOKENS.colors.russiaCyan,
                }}
              >
                11% OF EARTH&apos;S LANDMASS VS. 0.10%
              </span>
            </div>

            {/* Russia Giant Cyan Bar */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 7,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: TOKENS.colors.russiaCyan,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 18,
                      fontWeight: 700,
                      color: TOKENS.colors.textPrimary,
                      letterSpacing: "0.04em",
                    }}
                  >
                    RUSSIA
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.sans,
                      fontSize: 13,
                      color: TOKENS.colors.textMuted,
                    }}
                  >
                    World Rank #1 · 11 Time Zones
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 27,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaCyan,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {TOKENS.formatNumber(displayedRussiaArea)} km²
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 26,
                  borderRadius: 7,
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${russiaAreaProgress * 100}%`,
                    height: "100%",
                    background:
                      "linear-gradient(90deg, #0284C7 0%, #38BDF8 65%, #BAE6FD 100%)",
                    boxShadow: "0 0 20px rgba(56, 189, 248, 0.45)",
                    position: "relative",
                  }}
                />
                {/* 11 Timezone division ticks */}
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${((idx + 1) / 11) * 100}%`,
                      width: 1,
                      backgroundColor: "rgba(5, 9, 17, 0.42)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Bangladesh Razor-Thin 0.87% Emerald Sliver */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 7,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: TOKENS.colors.bengalEmerald,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 18,
                      fontWeight: 700,
                      color: TOKENS.colors.textPrimary,
                      letterSpacing: "0.04em",
                    }}
                  >
                    BANGLADESH
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.sans,
                      fontSize: 13,
                      color: TOKENS.colors.textMuted,
                    }}
                  >
                    World Rank #92 · Padma-Meghna Delta
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 27,
                    fontWeight: 700,
                    color: TOKENS.colors.bengalEmerald,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {TOKENS.formatNumber(displayedBdArea)} km²
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 30,
                  borderRadius: 7,
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  paddingRight: 12,
                  boxSizing: "border-box",
                }}
              >
                {/* Exact 0.87% razor-thin emerald sliver (~8px wide out of 940px) */}
                <div
                  style={{
                    width: `${Math.max(0, bdAreaProgress * 0.87)}%`,
                    minWidth: bdAreaProgress > 0.05 ? 7 : 0,
                    height: "100%",
                    borderRadius: "6px 2px 2px 6px",
                    backgroundColor: TOKENS.colors.bengalEmerald,
                    boxShadow: "0 0 14px rgba(16, 185, 129, 0.95)",
                  }}
                />

                {/* Precision optical callout pointing directly to the 0.87% sliver */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginLeft: 12,
                    opacity: bdAreaProgress,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#6EE7B7",
                    }}
                  >
                    ← RAZOR-THIN 0.87% SLIVER
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      backgroundColor: "rgba(16, 185, 129, 0.16)",
                      border: "1px solid rgba(16, 185, 129, 0.45)",
                      fontFamily: FONTS.mono,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "#ECFDF5",
                    }}
                  >
                    115.2× SMALLER AREA
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: THE POPULATION TWIST (326px) */}
          <div
            style={{
              height: 326,
              backgroundColor: TOKENS.colors.bgCardElevated,
              border: surpassedRussia
                ? "1px solid rgba(244, 42, 65, 0.55)"
                : `1px solid ${TOKENS.colors.borderSubtle}`,
              borderRadius: 16,
              padding: "18px 24px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: Math.max(0.18, popCardEnter),
              transform: `translateY(${(1 - popCardEnter) * 22 + cardRecoilY}px)`,
              boxShadow: surpassedRussia
                ? "0 18px 46px rgba(244, 42, 65, 0.16)"
                : "0 14px 36px rgba(0, 0, 0, 0.36)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Card Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: surpassedRussia
                      ? "#FDA4AF"
                      : TOKENS.colors.textSecondary,
                  }}
                >
                  METRIC B · THE POPULATION TWIST
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    backgroundColor: surpassedRussia
                      ? "rgba(244, 42, 65, 0.22)"
                      : "rgba(245, 158, 11, 0.16)",
                    border: surpassedRussia
                      ? `1px solid ${TOKENS.colors.bengalCrimson}`
                      : `1px solid ${TOKENS.colors.imperialAmber}`,
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    color: surpassedRussia
                      ? "#FFE4E6"
                      : TOKENS.colors.imperialAmber,
                  }}
                >
                  {surpassedRussia ? "OVERTAKEN!" : "HUMAN SCALE"}
                </span>
              </div>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  color: TOKENS.colors.textMuted,
                }}
              >
                2025–2026 DEMOGRAPHIC ESTIMATE
              </span>
            </div>

            {/* Russia Population Row: 144,000,000 */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 17,
                    fontWeight: 700,
                    color: TOKENS.colors.textSecondary,
                    letterSpacing: "0.04em",
                  }}
                >
                  RUSSIA POPULATION
                </span>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 26,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaIce,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {TOKENS.formatNumber(displayedRussiaPop)}
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${russiaPopProgress * russiaPopRatioPct}%`,
                    height: "100%",
                    background:
                      "linear-gradient(90deg, #0369A1 0%, #38BDF8 100%)",
                    borderRadius: 5,
                  }}
                />
                {/* 144M Parity Marker */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${russiaPopRatioPct}%`,
                    width: 2,
                    backgroundColor: "rgba(248, 250, 252, 0.55)",
                  }}
                />
              </div>
            </div>

            {/* Bangladesh Population Surge Row: Surges past 144,000,000 -> 175,000,000 */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#ECFDF5",
                      letterSpacing: "0.04em",
                    }}
                  >
                    BANGLADESH POPULATION
                  </span>
                  {surpassedRussia && (
                    <span
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "#6EE7B7",
                      }}
                    >
                      SURPASSED 144M →
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 34,
                    fontWeight: 700,
                    color: surpassedRussia
                      ? "#6EE7B7"
                      : TOKENS.colors.bengalEmerald,
                    fontVariantNumeric: "tabular-nums",
                    textShadow: surpassedRussia
                      ? "0 0 22px rgba(16, 185, 129, 0.5)"
                      : "none",
                  }}
                >
                  {TOKENS.formatNumber(displayedBdPop)}
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 28,
                  borderRadius: 7,
                  backgroundColor: "rgba(15, 23, 42, 0.92)",
                  border: surpassedRussia
                    ? "1px solid rgba(16, 185, 129, 0.65)"
                    : "1px solid rgba(148, 163, 184, 0.2)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${bdPopProgress * 100}%`,
                    height: "100%",
                    background: surpassedRussia
                      ? `linear-gradient(90deg, #006A4E 0%, ${TOKENS.colors.bengalEmerald} ${russiaPopRatioPct}%, ${TOKENS.colors.bengalCrimson} 100%)`
                      : `linear-gradient(90deg, #006A4E 0%, ${TOKENS.colors.bengalEmerald} 100%)`,
                    boxShadow: "0 0 20px rgba(16, 185, 129, 0.45)",
                  }}
                />
                {/* 144M Parity Threshold Line */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${russiaPopRatioPct}%`,
                    width: 2,
                    backgroundColor: "#F8FAFC",
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>

            {/* DRAMATIC SPRING-SLAM CALLOUT BADGE: +31 MILLION MORE PEOPLE */}
            <div
              style={{
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 18px",
                borderRadius: 11,
                background:
                  "linear-gradient(90deg, rgba(244, 42, 65, 0.24) 0%, rgba(0, 106, 78, 0.36) 55%, rgba(16, 185, 129, 0.22) 100%)",
                border: `1.5px solid ${TOKENS.colors.bengalCrimson}`,
                opacity: badgeOpacity,
                transform: `scale(${badgeScale})`,
                transformOrigin: "left center",
                boxShadow: "0 10px 28px rgba(244, 42, 65, 0.26)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    backgroundColor: TOKENS.colors.bengalCrimson,
                    fontFamily: FONTS.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    letterSpacing: "0.08em",
                  }}
                >
                  TWIST
                </span>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    letterSpacing: "0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  +{TOKENS.formatNumber(POPULATION_SURPLUS / 1_000_000)} MILLION
                  MORE PEOPLE
                </span>
              </div>

              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "#A7F3D0",
                }}
              >
                IN 0.87% OF RUSSIA&apos;S LAND
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene01ColdOpenShock;
