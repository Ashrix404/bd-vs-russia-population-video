import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { CHARACTERS, type SceneProps } from "../types/video";
import { FONTS } from "../theme/fonts";
import { TOKENS, formatNumber, seededUnit } from "../theme/tokens";

const DEG_TO_RAD = Math.PI / 180;

const RUSSIA_LAND_KM2 = 16_376_870;
const RUSSIA_START_POP_B = 0.146;
const INDIA_POP_B = 1.4;
const EARTH_POP_B = 8.2;
const RUSSIA_SWAPPED_POP_B = 20.1;
const RUSSIA_SWAPPED_EXACT = 20_143_550_100;

const BD_START_POP = 175_000_000;
const BD_SWAPPED_POP = 1_250_000;
const BD_REMAINING_RATIO = BD_SWAPPED_POP / BD_START_POP; // 0.007142857... (~0.71%)

/**
 * Recognizable stylized cartographic silhouette of the Russian Federation
 * spanning Kaliningrad/Kola across the Urals, Taymyr, Baikal, Chukotka, and Kamchatka
 * in viewBox 0 0 240 124.
 */
const RUSSIA_SILHOUETTE_PATH =
  "M 14 66 L 22 50 L 31 44 L 36 33 L 45 31 L 49 41 L 59 38 L 69 30 L 80 32 L 90 25 L 103 27 L 116 17 L 130 14 L 143 22 L 157 20 L 173 24 L 190 23 L 207 28 L 224 34 L 233 43 L 226 52 L 214 55 L 219 72 L 213 84 L 205 75 L 203 61 L 191 64 L 185 78 L 192 92 L 183 97 L 175 86 L 161 88 L 146 95 L 128 93 L 111 96 L 94 91 L 76 89 L 60 85 L 44 88 L 29 84 L 20 76 Z";

/**
 * Recognizable stylized cartographic silhouette of Bangladesh
 * spanning Rangpur/Tetulia NW, Sylhet NE, Padma-Meghna estuary, Sundarbans, and Chittagong SE
 * in viewBox 0 0 176 204.
 */
const BANGLADESH_SILHOUETTE_PATH =
  "M 52 14 L 74 20 L 82 36 L 96 42 L 116 40 L 142 46 L 148 62 L 132 76 L 128 96 L 144 114 L 156 142 L 160 178 L 150 192 L 138 172 L 130 144 L 114 138 L 104 152 L 92 146 L 84 162 L 68 166 L 54 162 L 46 140 L 42 114 L 30 96 L 34 74 L 46 58 L 38 36 Z";

interface DotNode {
  x: number;
  y: number;
  weight: number;
  threshold: number;
}

const RUSSIA_DENSITY_DOTS: readonly DotNode[] = Array.from(
  { length: 168 },
  (_, i) => {
    const col = i % 21;
    const row = Math.floor(i / 21);
    const jitterX = (seededUnit(i * 17 + 3) - 0.5) * 7.5;
    const jitterY = (seededUnit(i * 31 + 11) - 0.5) * 6.5;
    const x = 20 + col * 9.8 + jitterX;
    const y = 24 + row * 8.8 + jitterY;
    const westToEastOrder = col / 20;
    const threshold = Math.min(
      0.98,
      Math.max(0.02, westToEastOrder * 0.82 + seededUnit(i * 53 + 7) * 0.18)
    );
    return {
      x,
      y,
      weight: 0.65 + seededUnit(i * 71 + 19) * 0.75,
      threshold,
    };
  }
);

const BANGLADESH_DENSITY_DOTS: readonly DotNode[] = Array.from(
  { length: 132 },
  (_, i) => {
    const col = i % 11;
    const row = Math.floor(i / 11);
    const jitterX = (seededUnit(i * 23 + 101) - 0.5) * 9;
    const jitterY = (seededUnit(i * 41 + 211) - 0.5) * 9;
    const x = 38 + col * 10.2 + jitterX;
    const y = 26 + row * 12.6 + jitterY;
    // Keep 6 evenly distributed survivor dots representing 8.4 people/km² sparsity
    const isSurvivor =
      i === 14 || i === 38 || i === 59 || i === 74 || i === 96 || i === 119;
    return {
      x,
      y,
      weight: 0.8 + seededUnit(i * 67 + 307) * 0.6,
      threshold: isSurvivor ? 2.0 : 0.08 + seededUnit(i * 89 + 401) * 0.88,
    };
  }
);

interface GeoHub {
  lon: number;
  lat: number;
  size: number;
  warm: boolean;
}

const CONTINENTAL_HUBS: readonly [number, number][] = [
  // Europe & Mediterranean
  [-5, 38],
  [2, 48],
  [10, 51],
  [14, 42],
  [20, 52],
  [29, 41],
  [37, 55],
  [18, 59],
  [24, 38],
  // South & Southeast Asia
  [67, 25],
  [73, 19],
  [77, 28],
  [80, 13],
  [88, 22],
  [90, 24],
  [96, 17],
  [101, 14],
  [104, 1],
  [106, -6],
  [107, 11],
  [121, 14],
  // East & North Asia
  [104, 31],
  [114, 23],
  [116, 40],
  [121, 31],
  [127, 37],
  [135, 35],
  [139, 36],
  [73, 55],
  [92, 56],
  [104, 52],
  [132, 43],
  // Africa & Middle East
  [-17, 15],
  [-7, 33],
  [3, 6],
  [15, -4],
  [18, -34],
  [28, -26],
  [31, 30],
  [37, -1],
  [39, 9],
  [44, 33],
  [55, 25],
  // Americas
  [-123, 49],
  [-122, 38],
  [-118, 34],
  [-105, 40],
  [-99, 19],
  [-95, 30],
  [-87, 42],
  [-80, 26],
  [-79, 44],
  [-74, 41],
  [-71, 42],
  [-74, 5],
  [-77, -12],
  [-71, -33],
  [-58, -35],
  [-46, -23],
  [-43, -23],
  [-38, -13],
  // Oceania
  [116, -32],
  [145, -38],
  [151, -34],
  [153, -27],
  [175, -37],
];

const EARTH_CITY_LIGHTS: readonly GeoHub[] = CONTINENTAL_HUBS.flatMap(
  ([lon, lat], idx) => {
    const cluster: GeoHub[] = [
      {
        lon,
        lat,
        size: 1.9 + seededUnit(idx * 13 + 1) * 1.1,
        warm: idx % 3 !== 0,
      },
    ];
    for (let k = 1; k <= 2; k += 1) {
      const dLon = (seededUnit(idx * 47 + k * 19) - 0.5) * 9.5;
      const dLat = (seededUnit(idx * 59 + k * 29) - 0.5) * 6.5;
      cluster.push({
        lon: lon + dLon,
        lat: lat + dLat,
        size: 1.1 + seededUnit(idx * 83 + k * 7) * 0.9,
        warm: (idx + k) % 2 === 0,
      });
    }
    return cluster;
  }
);

const GRATICULE_GEOMETRY = geoGraticule10();

const SceneBackdrop: React.FC<{ swapActivation: number }> = ({
  swapActivation,
}) => {
  const topGlowOpacity = interpolate(swapActivation, [0, 1], [0.24, 0.16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bottomGlowOpacity = interpolate(swapActivation, [0, 1], [0.12, 0.24], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        backgroundImage: `
          radial-gradient(960px 440px at 28% 26%, rgba(56, 189, 248, ${topGlowOpacity}), transparent 70%),
          radial-gradient(840px 420px at 78% 28%, rgba(245, 158, 11, 0.14), transparent 72%),
          radial-gradient(980px 440px at 66% 72%, rgba(16, 185, 129, ${bottomGlowOpacity}), transparent 72%),
          linear-gradient(180deg, ${TOKENS.colors.bgObsidian} 0%, ${TOKENS.colors.bgDeepSlate} 52%, ${TOKENS.colors.bgObsidian} 100%)
        `,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px),
            linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          opacity: 0.42,
        }}
      />
    </AbsoluteFill>
  );
};

interface OrthographicEarthGlobeProps {
  globeIndex: number;
  fraction: 1 | 0.5;
  activation: number;
  rotationDeg: number;
  label: string;
  sublabel: string;
}

const OrthographicEarthGlobe: React.FC<OrthographicEarthGlobeProps> = ({
  globeIndex,
  fraction,
  activation,
  rotationDeg,
  label,
  sublabel,
}) => {
  const size = 114;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 47;
  const centerLon = -rotationDeg;
  const centerLat = 16;

  const projection = geoOrthographic()
    .scale(radius)
    .translate([cx, cy])
    .rotate([rotationDeg, -centerLat, 0])
    .clipAngle(90);

  const graticulePath = geoPath(projection)(GRATICULE_GEOMETRY) ?? "";

  const phi0 = centerLat * DEG_TO_RAD;
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);

  const visiblePoints: Array<{
    x: number;
    y: number;
    r: number;
    warm: boolean;
    alpha: number;
  }> = [];

  for (let i = 0; i < EARTH_CITY_LIGHTS.length; i += 1) {
    const pt = EARTH_CITY_LIGHTS[i];
    const lambda = (pt.lon - centerLon) * DEG_TO_RAD;
    const phi = pt.lat * DEG_TO_RAD;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const cosC = sinPhi0 * sinPhi + cosPhi0 * cosPhi * Math.cos(lambda);
    if (cosC > 0.08) {
      const px = cx + radius * cosPhi * Math.sin(lambda);
      const py =
        cy - radius * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * Math.cos(lambda));
      visiblePoints.push({
        x: px,
        y: py,
        r: pt.size,
        warm: pt.warm,
        alpha: Math.min(1, cosC * 1.25),
      });
    }
  }

  const clipSphereId = `s07-earth-sphere-${globeIndex}`;
  const clipHalfId = `s07-earth-half-${globeIndex}`;
  const oceanGradId = `s07-earth-ocean-${globeIndex}`;

  const scalePop = interpolate(activation, [0, 1], [0.86, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const litOpacity = interpolate(activation, [0, 0.35, 1], [0.2, 0.75, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: 126,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `scale(${scalePop})`,
        opacity: interpolate(activation, [0, 0.2, 1], [0.38, 0.85, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <clipPath id={clipSphereId}>
            <circle cx={cx} cy={cy} r={radius} />
          </clipPath>
          <clipPath id={clipHalfId}>
            <rect x={0} y={0} width={cx} height={size} />
          </clipPath>
          <radialGradient id={oceanGradId} cx="36%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#134E6F" />
            <stop offset="58%" stopColor="#08283D" />
            <stop offset="100%" stopColor="#041320" />
          </radialGradient>
        </defs>

        {/* Outer atmospheric bloom */}
        <circle
          cx={cx}
          cy={cy}
          r={radius + 5}
          fill="none"
          stroke={
            fraction === 0.5
              ? "rgba(245, 158, 11, 0.38)"
              : "rgba(56, 189, 248, 0.42)"
          }
          strokeWidth={fraction === 0.5 ? 1.2 : 2.2}
          strokeDasharray={fraction === 0.5 ? "4 4" : undefined}
          opacity={activation}
        />

        {/* Ghost wireframe on full circle when fraction === 0.5 so 0.5x cut is unmistakable */}
        {fraction === 0.5 && (
          <g clipPath={`url(#${clipSphereId})`} opacity={0.2}>
            <circle cx={cx} cy={cy} r={radius} fill="#071525" />
            <path
              d={graticulePath}
              fill="none"
              stroke={TOKENS.colors.russiaIce}
              strokeWidth={0.7}
            />
          </g>
        )}

        {/* Active illuminated globe (full or 0.5 left hemisphere) */}
        <g
          clipPath={
            fraction === 0.5 ? `url(#${clipHalfId})` : `url(#${clipSphereId})`
          }
          opacity={litOpacity}
        >
          <g clipPath={`url(#${clipSphereId})`}>
            <circle cx={cx} cy={cy} r={radius} fill={`url(#${oceanGradId})`} />
            <path
              d={graticulePath}
              fill="none"
              stroke="rgba(186, 230, 253, 0.24)"
              strokeWidth={0.75}
            />
            {visiblePoints.map((pt, idx) => (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r={pt.r}
                fill={
                  pt.warm
                    ? TOKENS.colors.imperialAmber
                    : TOKENS.colors.bengalEmerald
                }
                opacity={pt.alpha * (0.45 + 0.55 * activation)}
              />
            ))}
          </g>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={TOKENS.colors.russiaCyan}
            strokeWidth={1.8}
          />
        </g>

        {/* Precision meridian cutline on the 0.5x Earth */}
        {fraction === 0.5 && (
          <g opacity={interpolate(activation, [0, 0.4, 1], [0.3, 0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}>
            <line
              x1={cx}
              y1={cy - radius - 4}
              x2={cx}
              y2={cy + radius + 4}
              stroke={TOKENS.colors.imperialAmber}
              strokeWidth={2.2}
            />
            <rect
              x={cx - 17}
              y={cy - 9}
              width={34}
              height={18}
              rx={5}
              fill={TOKENS.colors.bgObsidian}
              stroke={TOKENS.colors.imperialAmber}
              strokeWidth={1.2}
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill={TOKENS.colors.imperialAmber}
              fontFamily={FONTS.mono}
              fontSize={10}
              fontWeight={700}
            >
              0.5×
            </text>
          </g>
        )}
      </svg>

      <div
        style={{
          marginTop: 2,
          fontFamily: FONTS.mono,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color:
            activation > 0.55
              ? TOKENS.colors.textPrimary
              : TOKENS.colors.textMuted,
          lineHeight: 1.15,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 10.5,
          color:
            fraction === 0.5
              ? TOKENS.colors.imperialAmber
              : TOKENS.colors.russiaCyan,
          lineHeight: 1.15,
        }}
      >
        {sublabel}
      </div>
    </div>
  );
};

/**
 * Computes piecewise odometer progression in billions so every milestone
 * (1.4B India -> 8.2B Entire Earth -> 20.1B Russia Swapped) reads clearly.
 */
function interpolateRussiaBillions(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped <= 0.28) {
    const u = Easing.out(Easing.quad)(clamped / 0.28);
    return RUSSIA_START_POP_B + (INDIA_POP_B - RUSSIA_START_POP_B) * u;
  }
  if (clamped <= 0.64) {
    const u = Easing.inOut(Easing.quad)((clamped - 0.28) / 0.36);
    return INDIA_POP_B + (EARTH_POP_B - INDIA_POP_B) * u;
  }
  const u = Easing.out(Easing.cubic)((clamped - 0.64) / 0.36);
  return EARTH_POP_B + (RUSSIA_SWAPPED_POP_B - EARTH_POP_B) * u;
}

export const Scene07DensitySwapExperiment: React.FC<SceneProps> = ({
  scene,
  turns,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.max(180, scene.durationInFrames || 450);
  const globalFrame = scene.startFrame + frame;

  const sceneTurns = turns.filter((t) => t.sceneIndex === scene.sceneIndex);
  const activeTurn = sceneTurns.find(
    (t) => globalFrame >= t.startFrame && globalFrame <= t.endFrame
  );
  const activeCharacter = activeTurn
    ? CHARACTERS[activeTurn.characterId]
    : null;

  const rawSecondBeatRatio =
    sceneTurns.length >= 2
      ? (sceneTurns[sceneTurns.length - 1].startFrame - scene.startFrame) /
        totalFrames
      : 0.46;
  const swapBeatStartRatio = Math.min(0.54, Math.max(0.4, rawSecondBeatRatio));

  const beatFrame = (ratio: number): number => Math.round(ratio * totalFrames);

  // Header & Card entrances
  const headerIntro = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 140 },
  });

  const topModuleIntro = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 190, stiffness: 130 },
  });

  const bottomModuleIntro = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 190, stiffness: 130 },
  });

  // Top Module (Russia at Bangladesh's Density) choreography
  const russiaFormulaReveal = interpolate(
    frame,
    [beatFrame(0.05), beatFrame(0.16)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  const russiaCounterProgress = interpolate(
    frame,
    [beatFrame(0.13), beatFrame(0.41)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const currentRussiaBillions = interpolateRussiaBillions(russiaCounterProgress);
  const currentRussiaExact = Math.round(
    (currentRussiaBillions / RUSSIA_SWAPPED_POP_B) * RUSSIA_SWAPPED_EXACT
  );

  const passedIndia = currentRussiaBillions >= INDIA_POP_B - 0.02;
  const passedEarth = currentRussiaBillions >= EARTH_POP_B - 0.05;
  const lockedRussia20B = russiaCounterProgress >= 0.995;

  const indiaBadgePop = spring({
    frame: Math.max(0, frame - beatFrame(0.205)),
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  const earthBadgePop = spring({
    frame: Math.max(0, frame - beatFrame(0.305)),
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  const globe1Activation = interpolate(
    currentRussiaBillions,
    [1.2, EARTH_POP_B],
    [0.15, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const globe2Activation = interpolate(
    currentRussiaBillions,
    [EARTH_POP_B, EARTH_POP_B * 2],
    [0.12, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const globeHalfActivation = interpolate(
    currentRussiaBillions,
    [EARTH_POP_B * 2, RUSSIA_SWAPPED_POP_B],
    [0.1, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const russiaBannerReveal = interpolate(
    frame,
    [beatFrame(0.35), beatFrame(0.43)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  // Bottom Module (Bangladesh at Russia's Density) choreography
  const swapActivation = interpolate(
    frame,
    [beatFrame(swapBeatStartRatio - 0.02), beatFrame(swapBeatStartRatio + 0.06)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }
  );

  const bdFormulaReveal = interpolate(
    frame,
    [beatFrame(swapBeatStartRatio), beatFrame(swapBeatStartRatio + 0.1)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  const bdCompressionProgress = interpolate(
    frame,
    [beatFrame(swapBeatStartRatio + 0.08), beatFrame(swapBeatStartRatio + 0.31)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }
  );

  const currentBdPopulation = Math.round(
    interpolate(
      bdCompressionProgress,
      [0, 1],
      [BD_START_POP, BD_SWAPPED_POP],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }
    )
  );

  const currentCompressionPct = interpolate(
    bdCompressionProgress,
    [0, 1],
    [0, 99.3],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const currentBdBarRatio = interpolate(
    bdCompressionProgress,
    [0, 1],
    [1, BD_REMAINING_RATIO],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const bdCalloutReveal = interpolate(
    frame,
    [beatFrame(swapBeatStartRatio + 0.25), beatFrame(swapBeatStartRatio + 0.35)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  const baseGlobeRotation = 22 + frame * 0.32;
  const indiaMarkerPct = (INDIA_POP_B / RUSSIA_SWAPPED_POP_B) * 100; // 6.965%
  const earthMarkerPct = (EARTH_POP_B / RUSSIA_SWAPPED_POP_B) * 100; // 40.796%
  const russiaBarFillPct = Math.min(
    100,
    (currentRussiaBillions / RUSSIA_SWAPPED_POP_B) * 100
  );

  const russiaFormulaText = "16,376,870 km² land × 1,230–1,330 / km²";
  const visibleRussiaFormulaChars = Math.round(
    russiaFormulaReveal * russiaFormulaText.length
  );

  const bdFormulaText = "148,460 km² × 8.4 / km²";
  const visibleBdFormulaChars = Math.round(
    bdFormulaReveal * bdFormulaText.length
  );

  return (
    <AbsoluteFill>
      <SceneBackdrop swapActivation={swapActivation} />

      {/* Strict Safe-Zone Stage: top 88..808 (720px), left 64..1856 (1792px) */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          width: 1792,
          height: 720,
          boxSizing: "border-box",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ================= HEADER STRIP (52px) ================= */}
        <div
          style={{
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: headerIntro,
            transform: `translateY(${(1 - headerIntro) * -12}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                padding: "5px 11px",
                borderRadius: 6,
                backgroundColor: "rgba(245, 158, 11, 0.14)",
                border: "1px solid rgba(245, 158, 11, 0.42)",
                fontFamily: FONTS.mono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: TOKENS.colors.imperialAmber,
              }}
            >
              THOUGHT EXPERIMENT · 07
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 27,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.colors.textPrimary,
                lineHeight: 1.1,
              }}
            >
              WHAT IF THEY{" "}
              <span
                style={{
                  color: TOKENS.colors.imperialAmber,
                }}
              >
                SWAPPED
              </span>{" "}
              POPULATION DENSITIES?
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {activeCharacter && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 11px",
                  borderRadius: 999,
                  backgroundColor: "rgba(15, 25, 42, 0.85)",
                  border: `1px solid ${activeCharacter.accentColor}55`,
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: activeCharacter.accentColor,
                    display: "inline-block",
                  }}
                />
                {activeCharacter.name.toUpperCase()}
              </div>
            )}
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                backgroundColor: TOKENS.colors.bgCardElevated,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                fontFamily: FONTS.mono,
                fontSize: 13,
                fontWeight: 700,
                color: TOKENS.colors.textSecondary,
                letterSpacing: "0.04em",
              }}
            >
              <span style={{ color: TOKENS.colors.bengalEmerald }}>
                1,330 / km²
              </span>
              {"  ⇄  "}
              <span style={{ color: TOKENS.colors.russiaCyan }}>
                8.4 / km²
              </span>
            </div>
          </div>
        </div>

        {/* ================= TOP / LEFT HERO MODULE — RUSSIA AT BANGLADESH'S DENSITY (334px) ================= */}
        <div
          style={{
            marginTop: 10,
            height: 334,
            boxSizing: "border-box",
            borderRadius: 18,
            padding: "16px 24px",
            backgroundColor: TOKENS.colors.bgPanelGlass,
            border: `1px solid ${
              lockedRussia20B
                ? "rgba(245, 158, 11, 0.46)"
                : "rgba(56, 189, 248, 0.28)"
            }`,
            boxShadow: "0 18px 42px rgba(0, 0, 0, 0.42)",
            display: "grid",
            gridTemplateColumns: "996px 724px",
            columnGap: 24,
            opacity: topModuleIntro,
            transform: `translateY(${(1 - topModuleIntro) * 16}px)`,
          }}
        >
          {/* Top-Left Analytics & Odometer Column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: 300,
            }}
          >
            {/* Eyebrow Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 26,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    backgroundColor: TOKENS.colors.russiaCyan,
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: TOKENS.colors.russiaCyan,
                  }}
                >
                  RUSSIA AT BANGLADESH&apos;S DENSITY
                </span>
              </div>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  color: TOKENS.colors.textMuted,
                }}
              >
                BASELINE: 146M →{" "}
                <strong style={{ color: TOKENS.colors.imperialAmber }}>
                  138× SURGE
                </strong>
              </span>
            </div>

            {/* Formula Terminal Strip */}
            <div
              style={{
                height: 42,
                borderRadius: 10,
                padding: "0 16px",
                backgroundColor: "rgba(5, 9, 17, 0.78)",
                border: "1px solid rgba(56, 189, 248, 0.24)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 18,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                  letterSpacing: "-0.01em",
                }}
              >
                <span style={{ color: TOKENS.colors.russiaIce }}>
                  {russiaFormulaText.slice(0, visibleRussiaFormulaChars)}
                </span>
                {russiaFormulaReveal < 1 && (
                  <span style={{ color: TOKENS.colors.imperialAmber }}>▋</span>
                )}
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: TOKENS.colors.imperialAmber,
                  opacity: russiaFormulaReveal,
                }}
              >
                = {formatNumber(RUSSIA_LAND_KM2 * 1230)}+
              </div>
            </div>

            {/* Giant Odometer Counter */}
            <div
              style={{
                height: 94,
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 76,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: "-0.035em",
                    fontVariantNumeric: "tabular-nums",
                    color: lockedRussia20B
                      ? TOKENS.colors.textPrimary
                      : TOKENS.colors.russiaIce,
                  }}
                >
                  {lockedRussia20B
                    ? "20.1"
                    : currentRussiaBillions.toFixed(1)}
                </span>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 36,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: "-0.01em",
                    color: TOKENS.colors.imperialAmber,
                  }}
                >
                  BILLION PEOPLE
                </span>
              </div>

              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  backgroundColor: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.36)",
                  fontFamily: FONTS.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: TOKENS.colors.imperialAmber,
                }}
              >
                {formatNumber(currentRussiaExact)}
              </div>
            </div>

            {/* Scale Contrast Runway Bar + Milestones (1.4B India -> 8.2B Entire Earth -> 20.1B) */}
            <div style={{ height: 104, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              {/* Milestone Pills Row */}
              <div
                style={{
                  position: "relative",
                  height: 30,
                  marginBottom: 8,
                }}
              >
                {/* 1.4B (India) Checkpoint */}
                <div
                  style={{
                    position: "absolute",
                    left: `${indiaMarkerPct}%`,
                    top: 0,
                    transform: `scale(${passedIndia ? 0.92 + 0.08 * indiaBadgePop : 0.92})`,
                    transformOrigin: "left bottom",
                    padding: "4px 10px",
                    borderRadius: 6,
                    backgroundColor: passedIndia
                      ? "rgba(16, 185, 129, 0.20)"
                      : "rgba(15, 25, 42, 0.78)",
                    border: `1px solid ${
                      passedIndia
                        ? TOKENS.colors.bengalEmerald
                        : TOKENS.colors.borderSubtle
                    }`,
                    fontFamily: FONTS.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: passedIndia
                      ? TOKENS.colors.textPrimary
                      : TOKENS.colors.textMuted,
                    whiteSpace: "nowrap",
                  }}
                >
                  1.4B (India) {passedIndia ? "✓" : ""}
                </div>

                {/* 8.2B (Entire Earth!) Checkpoint */}
                <div
                  style={{
                    position: "absolute",
                    left: `${earthMarkerPct}%`,
                    top: 0,
                    transform: `translateX(-50%) scale(${
                      passedEarth ? 0.92 + 0.08 * earthBadgePop : 0.92
                    })`,
                    transformOrigin: "center bottom",
                    padding: "4px 11px",
                    borderRadius: 6,
                    backgroundColor: passedEarth
                      ? "rgba(56, 189, 248, 0.22)"
                      : "rgba(15, 25, 42, 0.78)",
                    border: `1px solid ${
                      passedEarth
                        ? TOKENS.colors.russiaCyan
                        : TOKENS.colors.borderSubtle
                    }`,
                    fontFamily: FONTS.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: passedEarth
                      ? TOKENS.colors.textPrimary
                      : TOKENS.colors.textMuted,
                    whiteSpace: "nowrap",
                  }}
                >
                  8.2B (Entire Earth!) {passedEarth ? "✓" : ""}
                </div>

                {/* 20.1B Final Lock Tag */}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    padding: "4px 11px",
                    borderRadius: 6,
                    backgroundColor: lockedRussia20B
                      ? "rgba(245, 158, 11, 0.24)"
                      : "rgba(15, 25, 42, 0.78)",
                    border: `1px solid ${
                      lockedRussia20B
                        ? TOKENS.colors.imperialAmber
                        : TOKENS.colors.borderSubtle
                    }`,
                    fontFamily: FONTS.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: lockedRussia20B
                      ? TOKENS.colors.imperialAmber
                      : TOKENS.colors.textMuted,
                  }}
                >
                  20.1B LOCKED
                </div>
              </div>

              {/* Main Rocket Progress Bar */}
              <div
                style={{
                  position: "relative",
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: "rgba(5, 9, 17, 0.88)",
                  border: `1px solid ${TOKENS.colors.borderSubtle}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${russiaBarFillPct}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${TOKENS.colors.bengalEmerald} 0%, ${TOKENS.colors.russiaCyan} 42%, ${TOKENS.colors.imperialAmber} 100%)`,
                    boxShadow: "0 0 22px rgba(245, 158, 11, 0.45)",
                  }}
                />
                {/* 1.4B Tick */}
                <div
                  style={{
                    position: "absolute",
                    left: `${indiaMarkerPct}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    backgroundColor: TOKENS.colors.textPrimary,
                    opacity: 0.75,
                  }}
                />
                {/* 8.2B Tick */}
                <div
                  style={{
                    position: "absolute",
                    left: `${earthMarkerPct}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    backgroundColor: TOKENS.colors.textPrimary,
                    opacity: 0.85,
                  }}
                />
              </div>

              {/* Axis Legend */}
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                <span>0 · RUSSIA ACTUAL: 0.146B (0.7%)</span>
                <span>1 EARTH = 8.2B (40.8%)</span>
                <span style={{ color: TOKENS.colors.imperialAmber }}>
                  UPPER RANGE @ 1,330/km²: 21.8B
                </span>
              </div>
            </div>
          </div>

          {/* Top-Right Visual Stage: Russia Silhouette + 2.5 Glowing Earth Globes */}
          <div
            style={{
              height: 300,
              borderRadius: 14,
              padding: "12px 16px",
              boxSizing: "border-box",
              backgroundColor: "rgba(5, 9, 17, 0.64)",
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: FONTS.mono,
                fontSize: 11.5,
                color: TOKENS.colors.textSecondary,
              }}
            >
              <span>EQUIVALENT HUMAN SCALE</span>
              <span style={{ color: TOKENS.colors.russiaCyan }}>
                20.1B ÷ 8.2B = 2.45× ≈ 2.5 EARTHS
              </span>
            </div>

            {/* Horizontal Lineup: Russia Map + 2.5 Glowing Earth Globes */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 194,
              }}
            >
              {/* Russia Territory Box */}
              <div
                style={{
                  width: 244,
                  height: 184,
                  borderRadius: 12,
                  padding: "8px 10px",
                  boxSizing: "border-box",
                  backgroundColor: "rgba(10, 17, 30, 0.85)",
                  border: "1px solid rgba(56, 189, 248, 0.28)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <svg width={224} height={124} viewBox="0 0 240 124">
                  <defs>
                    <clipPath id="s07-russia-clip">
                      <path d={RUSSIA_SILHOUETTE_PATH} />
                    </clipPath>
                    <linearGradient
                      id="s07-russia-fill"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="#0C3554" />
                      <stop offset="100%" stopColor="#092136" />
                    </linearGradient>
                  </defs>

                  <path
                    d={RUSSIA_SILHOUETTE_PATH}
                    fill="url(#s07-russia-fill)"
                  />

                  <g clipPath="url(#s07-russia-clip)">
                    {RUSSIA_DENSITY_DOTS.map((dot, idx) => {
                      const lit = interpolate(
                        russiaCounterProgress,
                        [
                          Math.max(0, dot.threshold - 0.14),
                          Math.min(1, dot.threshold + 0.08),
                        ],
                        [0.08, 0.96],
                        {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }
                      );
                      return (
                        <circle
                          key={idx}
                          cx={dot.x}
                          cy={dot.y}
                          r={1.35 * dot.weight}
                          fill={
                            idx % 3 === 0
                              ? TOKENS.colors.bengalEmerald
                              : TOKENS.colors.imperialAmber
                          }
                          opacity={lit}
                        />
                      );
                    })}
                  </g>

                  <path
                    d={RUSSIA_SILHOUETTE_PATH}
                    fill="none"
                    stroke={
                      lockedRussia20B
                        ? TOKENS.colors.imperialAmber
                        : TOKENS.colors.russiaCyan
                    }
                    strokeWidth={2}
                  />
                </svg>

                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  <span>RUSSIA · 16.38M km²</span>
                  <span style={{ color: TOKENS.colors.imperialAmber }}>
                    20.1B INSIDE
                  </span>
                </div>
              </div>

              {/* Equivalence Sign */}
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: TOKENS.colors.imperialAmber,
                  padding: "0 4px",
                }}
              >
                =
              </div>

              {/* 2.5 Glowing Earth Globes Lined Up */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <OrthographicEarthGlobe
                  globeIndex={0}
                  fraction={1}
                  activation={globe1Activation}
                  rotationDeg={baseGlobeRotation}
                  label="1.0× EARTH"
                  sublabel="8.2 BILLION"
                />
                <OrthographicEarthGlobe
                  globeIndex={1}
                  fraction={1}
                  activation={globe2Activation}
                  rotationDeg={baseGlobeRotation + 120}
                  label="2.0× EARTH"
                  sublabel="16.4 BILLION"
                />
                <OrthographicEarthGlobe
                  globeIndex={2}
                  fraction={0.5}
                  activation={globeHalfActivation}
                  rotationDeg={baseGlobeRotation + 240}
                  label="+0.5× EARTH"
                  sublabel="+3.7 BILLION"
                />
              </div>
            </div>

            {/* Bottom Callout Banner */}
            <div
              style={{
                height: 38,
                borderRadius: 9,
                backgroundColor: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245, 158, 11, 0.52)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONTS.display,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: TOKENS.colors.textPrimary,
                opacity: interpolate(russiaBannerReveal, [0, 1], [0.45, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <span style={{ color: TOKENS.colors.imperialAmber, marginRight: 8 }}>
                2.5×
              </span>
              ALL HUMANITY ON EARTH INSIDE ONE BORDER
            </div>
          </div>
        </div>

        {/* ================= SWAP CONNECTOR DIVIDER (16px) ================= */}
        <div
          style={{
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "100%",
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${TOKENS.colors.borderSubtle} 20%, ${TOKENS.colors.borderSubtle} 80%, transparent 100%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              padding: "2px 14px",
              borderRadius: 999,
              backgroundColor: TOKENS.colors.bgObsidian,
              border: `1px solid ${
                swapActivation > 0.4
                  ? TOKENS.colors.bengalEmerald
                  : TOKENS.colors.borderSubtle
              }`,
              fontFamily: FONTS.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color:
                swapActivation > 0.4
                  ? TOKENS.colors.bengalEmerald
                  : TOKENS.colors.textMuted,
            }}
          >
            ⇄ FLIP DENSITY TO 8.4 PEOPLE / KM² ⇄
          </div>
        </div>

        {/* ================= BOTTOM / RIGHT HERO MODULE — BANGLADESH AT RUSSIA'S DENSITY (308px) ================= */}
        <div
          style={{
            height: 308,
            boxSizing: "border-box",
            borderRadius: 18,
            padding: "16px 24px",
            backgroundColor: TOKENS.colors.bgPanelGlass,
            border: `1px solid ${
              bdCompressionProgress > 0.5
                ? "rgba(16, 185, 129, 0.48)"
                : "rgba(226, 232, 240, 0.16)"
            }`,
            boxShadow: "0 18px 42px rgba(0, 0, 0, 0.42)",
            display: "grid",
            gridTemplateColumns: "564px 1156px",
            columnGap: 24,
            opacity: bottomModuleIntro,
            transform: `translateY(${(1 - bottomModuleIntro) * 16}px)`,
          }}
        >
          {/* Bottom-Left Visual Stage: Emptying Bangladesh Delta + Dhaka Single District Benchmark */}
          <div
            style={{
              height: 274,
              display: "grid",
              gridTemplateColumns: "272px 272px",
              columnGap: 20,
            }}
          >
            {/* Card 1: Bangladesh Delta Territory Emptying */}
            <div
              style={{
                borderRadius: 14,
                padding: "10px 14px",
                boxSizing: "border-box",
                backgroundColor: "rgba(5, 9, 17, 0.68)",
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                <span>BANGLADESH</span>
                <span style={{ color: TOKENS.colors.bengalEmerald }}>
                  148,460 km²
                </span>
              </div>

              <svg width={166} height={192} viewBox="0 0 176 204">
                <defs>
                  <clipPath id="s07-bd-clip">
                    <path d={BANGLADESH_SILHOUETTE_PATH} />
                  </clipPath>
                  <linearGradient
                    id="s07-bd-fill"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#073429" />
                    <stop offset="100%" stopColor="#061D28" />
                  </linearGradient>
                </defs>

                <path
                  d={BANGLADESH_SILHOUETTE_PATH}
                  fill="url(#s07-bd-fill)"
                />

                <g clipPath="url(#s07-bd-clip)">
                  {BANGLADESH_DENSITY_DOTS.map((dot, idx) => {
                    const isSurvivor = dot.threshold > 1.5;
                    const dotAlpha = isSurvivor
                      ? 0.98
                      : interpolate(
                          bdCompressionProgress,
                          [
                            Math.max(0, dot.threshold - 0.18),
                            Math.min(1, dot.threshold + 0.04),
                          ],
                          [0.92, 0],
                          {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                          }
                        );
                    return (
                      <circle
                        key={idx}
                        cx={dot.x}
                        cy={dot.y}
                        r={isSurvivor ? 3.1 : 2.1 * dot.weight}
                        fill={
                          isSurvivor && bdCompressionProgress > 0.55
                            ? TOKENS.colors.russiaCyan
                            : TOKENS.colors.bengalEmerald
                        }
                        opacity={dotAlpha}
                      />
                    );
                  })}
                </g>

                <path
                  d={BANGLADESH_SILHOUETTE_PATH}
                  fill="none"
                  stroke={
                    bdCompressionProgress > 0.7
                      ? TOKENS.colors.russiaCyan
                      : TOKENS.colors.bengalEmerald
                  }
                  strokeWidth={2.2}
                />
              </svg>

              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                <span>DENSITY:</span>
                <span style={{ color: TOKENS.colors.russiaCyan }}>
                  {bdCompressionProgress > 0.65
                    ? "8.4 / km² (SPARSE)"
                    : "1,330 / km² (ACTUAL)"}
                </span>
              </div>
            </div>

            {/* Card 2: Dhaka Single District Scale Comparison */}
            <div
              style={{
                borderRadius: 14,
                padding: "10px 14px",
                boxSizing: "border-box",
                backgroundColor: "rgba(5, 9, 17, 0.68)",
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                <span>DHAKA SCALE CHECK</span>
                <span style={{ color: TOKENS.colors.coralAccent }}>
                  1 DISTRICT
                </span>
              </div>

              {/* Nested Area / Capacity Box Comparison */}
              <div
                style={{
                  position: "relative",
                  height: 176,
                  borderRadius: 10,
                  padding: "12px",
                  boxSizing: "border-box",
                  backgroundColor: "rgba(251, 113, 133, 0.08)",
                  border: "1.5px dashed rgba(251, 113, 133, 0.55)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 13,
                      fontWeight: 700,
                      color: TOKENS.colors.coralAccent,
                    }}
                  >
                    ONE DHAKA DISTRICT
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      color: TOKENS.colors.textSecondary,
                    }}
                  >
                    ~1.6M+ RESIDENTS (MIRPUR / UTTARA)
                  </div>
                </div>

                {/* Inner Nested Box: Entire Swapped Bangladesh (1.25M < 1.6M) */}
                <div
                  style={{
                    width: "78%",
                    height: 92,
                    borderRadius: 8,
                    padding: "10px 12px",
                    boxSizing: "border-box",
                    backgroundColor: "rgba(56, 189, 248, 0.16)",
                    border: `1.5px solid ${TOKENS.colors.russiaCyan}`,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transform: `scale(${interpolate(
                      bdCalloutReveal,
                      [0, 1],
                      [0.92, 1],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    )})`,
                    transformOrigin: "left bottom",
                  }}
                >
                  <div
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: TOKENS.colors.russiaIce,
                    }}
                  >
                    SWAPPED NATION
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 22,
                      fontWeight: 700,
                      color: TOKENS.colors.textPrimary,
                      lineHeight: 1,
                    }}
                  >
                    1,250,000
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10,
                      color: TOKENS.colors.russiaCyan,
                    }}
                  >
                    ALL 64 DISTRICTS COMBINED
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                  textAlign: "center",
                }}
              >
                ENTIRE NATION &lt; 1 URBAN DISTRICT
              </div>
            </div>
          </div>

          {/* Bottom-Right Formula, Collapsing Counter & 99.3% Compression Bar */}
          <div
            style={{
              height: 274,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {/* Eyebrow Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    backgroundColor: TOKENS.colors.bengalEmerald,
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: TOKENS.colors.bengalEmerald,
                  }}
                >
                  BANGLADESH AT RUSSIA&apos;S DENSITY
                </span>
              </div>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  color: TOKENS.colors.textMuted,
                }}
              >
                175,000,000 →{" "}
                <strong style={{ color: TOKENS.colors.coralAccent }}>
                  99.3% REDUCTION
                </strong>
              </span>
            </div>

            {/* Formula Terminal Strip */}
            <div
              style={{
                height: 40,
                borderRadius: 10,
                padding: "0 16px",
                backgroundColor: "rgba(5, 9, 17, 0.78)",
                border: "1px solid rgba(16, 185, 129, 0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 18,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                }}
              >
                {bdFormulaReveal > 0 ? (
                  <>
                    <span style={{ color: TOKENS.colors.bengalEmerald }}>
                      {bdFormulaText.slice(0, visibleBdFormulaChars)}
                    </span>
                    {bdFormulaReveal < 1 && (
                      <span style={{ color: TOKENS.colors.russiaCyan }}>▋</span>
                    )}
                  </>
                ) : (
                  <span
                    style={{
                      color: TOKENS.colors.textMuted,
                      fontSize: 15,
                    }}
                  >
                    STANDBY · 148,460 km² DELTA READY FOR INVERSION
                  </span>
                )}
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: TOKENS.colors.russiaCyan,
                  opacity: bdFormulaReveal,
                }}
              >
                = 1,247,064 ≈ 1,250,000
              </div>
            </div>

            {/* Giant Collapsing Odometer + -99.3% Badge */}
            <div
              style={{
                height: 74,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 64,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  {formatNumber(currentBdPopulation)}
                </span>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1,
                    color:
                      bdCompressionProgress > 0.7
                        ? TOKENS.colors.russiaCyan
                        : TOKENS.colors.bengalEmerald,
                  }}
                >
                  PEOPLE
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: 9,
                    backgroundColor: "rgba(244, 42, 65, 0.16)",
                    border: `1px solid ${TOKENS.colors.bengalCrimson}`,
                    fontFamily: FONTS.mono,
                    fontSize: 16,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: TOKENS.colors.coralAccent,
                  }}
                >
                  −{currentCompressionPct.toFixed(1)}% COMPRESSED
                </div>
              </div>
            </div>

            {/* Dramatic 175,000,000 -> 1,250,000 (99.3%) Scale Contrast Compression Bar */}
            <div style={{ height: 64, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div
                style={{
                  position: "relative",
                  height: 36,
                  borderRadius: 9,
                  backgroundColor: "rgba(5, 9, 17, 0.90)",
                  border: `1px solid ${TOKENS.colors.borderSubtle}`,
                  overflow: "hidden",
                }}
              >
                {/* Ghosted 175,000,000 full-width diagonal hatch reference */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, rgba(16, 185, 129, 0.11) 0px, rgba(16, 185, 129, 0.11) 8px, rgba(5, 9, 17, 0.2) 8px, rgba(5, 9, 17, 0.2) 16px)",
                  }}
                />

                {/* Right-aligned Vanished Zone Label uncovered as bar shrinks */}
                <div
                  style={{
                    position: "absolute",
                    right: 14,
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    fontFamily: FONTS.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: TOKENS.colors.textSecondary,
                    zIndex: 2,
                  }}
                >
                  ORIGINAL 175,000,000 BAR · −99.3% VANISHED
                </div>

                {/* Active Compressing Bar: shrinks from 100% down to 0.714% (~8.3px) */}
                <div
                  style={{
                    position: "relative",
                    width: `${currentBdBarRatio * 100}%`,
                    minWidth: 8,
                    height: "100%",
                    background: `linear-gradient(90deg, ${TOKENS.colors.russiaCyan} 0%, ${TOKENS.colors.bengalEmerald} 100%)`,
                    boxShadow: "0 0 18px rgba(56, 189, 248, 0.65)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 14,
                    boxSizing: "border-box",
                    zIndex: 3,
                  }}
                >
                  {bdCompressionProgress < 0.36 && (
                    <span
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 12,
                        fontWeight: 700,
                        color: TOKENS.colors.bgObsidian,
                        whiteSpace: "nowrap",
                        opacity: interpolate(
                          bdCompressionProgress,
                          [0.18, 0.35],
                          [1, 0],
                          {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                          }
                        ),
                      }}
                    >
                      175,000,000 ACTUAL BANGLADESH (100% BASELINE)
                    </span>
                  )}
                </div>

                {/* Glowing Laser Compression Edge */}
                <div
                  style={{
                    position: "absolute",
                    left: `calc(${currentBdBarRatio * 100}% + 1px)`,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    backgroundColor: TOKENS.colors.coralAccent,
                    boxShadow: "0 0 12px rgba(251, 113, 133, 0.9)",
                    zIndex: 4,
                  }}
                />

                {/* Magnifier Tag pointing to the tiny 0.71% sliver once compressed */}
                {bdCompressionProgress > 0.45 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 20,
                      top: 5,
                      padding: "3px 10px",
                      borderRadius: 5,
                      backgroundColor: "rgba(10, 17, 30, 0.94)",
                      border: `1px solid ${TOKENS.colors.russiaCyan}`,
                      fontFamily: FONTS.mono,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: TOKENS.colors.russiaIce,
                      zIndex: 5,
                    }}
                  >
                    ◀ 0.71% SLIVER = 1,250,000 PEOPLE
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                <span style={{ color: TOKENS.colors.russiaCyan }}>
                  SWAPPED LOCK: 1,250,000 (0.71% OF TODAY)
                </span>
                <span>−173,750,000 PEOPLE REMOVED FROM THE DELTA</span>
              </div>
            </div>

            {/* Bottom Callout Banner */}
            <div
              style={{
                height: 38,
                borderRadius: 9,
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.52)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONTS.display,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: TOKENS.colors.textPrimary,
                opacity: interpolate(bdCalloutReveal, [0, 1], [0.45, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <span style={{ color: TOKENS.colors.bengalEmerald, marginRight: 8 }}>
                99.3% SMALLER ·
              </span>
              FEWER PEOPLE THAN ONE DISTRICT OF DHAKA
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene07DensitySwapExperiment;
