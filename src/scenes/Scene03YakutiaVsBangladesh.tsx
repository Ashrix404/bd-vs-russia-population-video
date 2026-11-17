import React, { useId } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Feature, LineString, MultiPolygon, Polygon } from "geojson";
import {
  geoArea,
  geoAzimuthalEqualArea,
  geoGraticule10,
  geoPath,
} from "d3-geo";
import {
  BANGLADESH_CENTROID_LON_LAT,
  BANGLADESH_FEATURE,
  DHAKA_LON_LAT,
  RUSSIA_FEATURE,
  YAKUTSK_LON_LAT,
} from "../components/GeoMapEngine";
import { FONTS } from "../theme/fonts";
import { TOKENS, formatNumber, seededUnit } from "../theme/tokens";
import type { CharacterId, SceneProps, TurnTiming } from "../types/video";

// ---------------------------------------------------------------------------
// Deterministic Geometry & Constants (Module-Scope Memoized, Zero Per-Frame Cost)
// ---------------------------------------------------------------------------

const YAKUTIA_AREA_KM2 = 3_083_523;
const BANGLADESH_AREA_KM2 = 148_460;
const SIBERIA_AREA_KM2 = 13_100_000;
const TRUE_AREA_RATIO = YAKUTIA_AREA_KM2 / BANGLADESH_AREA_KM2; // 20.77006 -> 20.8x

const YAKUTIA_POP_MILLIONS = 1.0;
const BANGLADESH_POP_MILLIONS = 175.0;
const DHAKA_METRO_MILLIONS = 24.0;
const SIBERIA_POP_MILLIONS = 36.0;

const OYMYAKON_LON_LAT: [number, number] = [142.79, 63.46];
const YAKUTIA_CENTER_LON_LAT: [number, number] = [132.2, 65.2];

const MAP_VIEW_W = 520;
const MAP_VIEW_H = 328;

/**
 * Ensures any `[lon, lat]` exterior polygon ring satisfies d3-geo's spherical
 * right-hand winding rule (`geoArea < Math.PI`), preventing inverted hemisphere fills.
 */
function ensureSmallSphericalRing(
  ring: ReadonlyArray< readonly [number, number] >,
): [number, number][] {
  const coords: [number, number][] = ring.map(([lon, lat]) => [lon, lat]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    coords.push([first[0], first[1]]);
  }
  const testFeature: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
  if (geoArea(testFeature) > Math.PI) {
    coords.reverse();
  }
  return coords;
}

/**
 * High-precision cartographic boundary of the Sakha Republic (Yakutia):
 * Anabar Bay -> Lena Delta -> Laptev & East Siberian Seas -> Kolyma Gulf ->
 * Suntar-Khayata & Stanovoy Ranges -> Vitim Plateau -> Evenkia / Mirny border.
 */
const YAKUTIA_MAINLAND_RING: [number, number][] = ensureSmallSphericalRing([
  [113.2, 73.6],
  [115.6, 73.1],
  [119.2, 73.2],
  [123.6, 73.8],
  [127.2, 73.6],
  [129.4, 72.4],
  [129.9, 71.5],
  [132.6, 71.2],
  [135.8, 71.6],
  [139.8, 72.8],
  [144.8, 72.3],
  [149.6, 71.9],
  [153.8, 70.9],
  [158.0, 70.6],
  [161.5, 69.6],
  [162.5, 68.3],
  [160.7, 67.1],
  [159.0, 65.9],
  [157.2, 64.8],
  [154.4, 64.1],
  [151.8, 63.5],
  [148.4, 63.0],
  [146.3, 62.0],
  [145.6, 60.4],
  [142.3, 59.5],
  [139.4, 58.6],
  [138.1, 57.3],
  [135.7, 56.5],
  [133.2, 55.9],
  [130.6, 55.8],
  [127.4, 56.1],
  [124.6, 56.4],
  [121.6, 56.6],
  [119.3, 57.1],
  [117.1, 58.3],
  [115.3, 59.4],
  [112.5, 59.2],
  [109.6, 59.8],
  [108.3, 61.2],
  [107.2, 62.5],
  [108.1, 64.1],
  [106.9, 65.6],
  [108.3, 66.9],
  [109.9, 68.3],
  [111.1, 69.7],
  [112.4, 71.3],
  [113.2, 72.6],
  [113.2, 73.6],
]);

const NEW_SIBERIAN_ISLAND_RINGS: [number, number][][] = [
  ensureSmallSphericalRing([
    [137.4, 76.1],
    [141.9, 76.0],
    [144.6, 75.4],
    [143.7, 74.7],
    [139.2, 74.8],
    [137.4, 75.5],
    [137.4, 76.1],
  ]),
  ensureSmallSphericalRing([
    [146.5, 75.5],
    [150.6, 75.2],
    [150.7, 74.7],
    [146.8, 74.8],
    [146.5, 75.5],
  ]),
  ensureSmallSphericalRing([
    [140.4, 73.9],
    [143.6, 73.8],
    [143.5, 73.2],
    [140.5, 73.3],
    [140.4, 73.9],
  ]),
];

const YAKUTIA_MAINLAND_FEATURE: Feature<Polygon, { name: string }> = {
  type: "Feature",
  properties: { name: "Sakha Republic (Mainland)" },
  geometry: {
    type: "Polygon",
    coordinates: [YAKUTIA_MAINLAND_RING],
  },
};

const YAKUTIA_ISLANDS_FEATURE: Feature<MultiPolygon, { name: string }> = {
  type: "Feature",
  properties: { name: "New Siberian Islands" },
  geometry: {
    type: "MultiPolygon",
    coordinates: NEW_SIBERIAN_ISLAND_RINGS.map((ring) => [ring]),
  },
};

const YAKUTIA_FULL_FEATURE: Feature<MultiPolygon, { name: string }> = {
  type: "Feature",
  properties: { name: "Sakha Republic (Yakutia)" },
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      [YAKUTIA_MAINLAND_RING],
      ...NEW_SIBERIAN_ISLAND_RINGS.map((ring) => [ring]),
    ],
  },
};

const LENA_RIVER_LINESTRING: LineString = {
  type: "LineString",
  coordinates: [
    [112.8, 59.6],
    [116.5, 60.4],
    [120.4, 60.4],
    [124.8, 60.9],
    [128.4, 61.5],
    [129.73, 62.03],
    [129.3, 63.5],
    [126.8, 64.6],
    [124.2, 66.8],
    [123.7, 68.8],
    [125.4, 70.6],
    [126.9, 72.4],
    [127.8, 73.2],
  ],
};

const ARCTIC_CIRCLE_LINESTRING: LineString = (() => {
  const pts: [number, number][] = [];
  for (let lon = 96; lon <= 172; lon += 2) {
    pts.push([lon, 66.56]);
  }
  return {
    type: "LineString",
    coordinates: pts,
  };
})();

interface Scene03CartographyData {
  graticulePath: string;
  easternRussiaContextPath: string;
  yakutiaMainlandPath: string;
  yakutiaIslandsPath: string;
  yakutiaFullPath: string;
  lenaRiverPath: string;
  arcticCirclePath: string;
  yakutskPt: [number, number];
  oymyakonPt: [number, number];
  arcticLabelPt: [number, number];
  bdTrueAnchor: [number, number];
  bdTruePath: string;
  bdTrueDhakaPt: [number, number];
  bdZoomPath: string;
  bdZoomDhakaPt: [number, number];
}

const CARTOGRAPHY: Scene03CartographyData = (() => {
  const yakutiaProjection = geoAzimuthalEqualArea()
    .rotate([-YAKUTIA_CENTER_LON_LAT[0], -YAKUTIA_CENTER_LON_LAT[1]])
    .clipAngle(82)
    .fitExtent(
      [
        [28, 20],
        [MAP_VIEW_W - 28, MAP_VIEW_H - 36],
      ],
      YAKUTIA_FULL_FEATURE,
    );

  const yakutiaPathGen = geoPath(yakutiaProjection);
  const graticulePath = yakutiaPathGen(geoGraticule10()) ?? "";
  const easternRussiaContextPath = yakutiaPathGen(RUSSIA_FEATURE) ?? "";
  const yakutiaMainlandPath = yakutiaPathGen(YAKUTIA_MAINLAND_FEATURE) ?? "";
  const yakutiaIslandsPath = yakutiaPathGen(YAKUTIA_ISLANDS_FEATURE) ?? "";
  const yakutiaFullPath = yakutiaPathGen(YAKUTIA_FULL_FEATURE) ?? "";
  const lenaRiverPath = yakutiaPathGen(LENA_RIVER_LINESTRING) ?? "";
  const arcticCirclePath = yakutiaPathGen(ARCTIC_CIRCLE_LINESTRING) ?? "";

  const projectPoint = (
    proj: (coords: [number, number]) => [number, number] | null,
    coords: [number, number],
    fallback: [number, number],
  ): [number, number] => {
    const pt = proj(coords);
    return pt ? [pt[0], pt[1]] : fallback;
  };

  const yakutskPt = projectPoint(yakutiaProjection, YAKUTSK_LON_LAT, [
    MAP_VIEW_W * 0.49,
    MAP_VIEW_H * 0.58,
  ]);
  const oymyakonPt = projectPoint(yakutiaProjection, OYMYAKON_LON_LAT, [
    MAP_VIEW_W * 0.67,
    MAP_VIEW_H * 0.52,
  ]);
  const arcticLabelPt = projectPoint(yakutiaProjection, [114.5, 66.56], [
    84,
    132,
  ]);

  // Calibrate Bangladesh's Lambert Azimuthal Equal-Area scale so its screen pixel
  // area equals Yakutia's rendered pixel area divided by exact 20.77006 (20.8x).
  const yakutiaAreaPx = Math.max(1, yakutiaPathGen.area(YAKUTIA_FULL_FEATURE));
  const sharedScale = yakutiaProjection.scale();

  const rawBdProjection = geoAzimuthalEqualArea()
    .rotate([
      -BANGLADESH_CENTROID_LON_LAT[0],
      -BANGLADESH_CENTROID_LON_LAT[1],
    ])
    .scale(sharedScale)
    .translate([0, 0]);
  const rawBdAreaPx = Math.max(
    1,
    geoPath(rawBdProjection).area(BANGLADESH_FEATURE),
  );
  const targetBdAreaPx = yakutiaAreaPx / TRUE_AREA_RATIO;
  const calibratedTrueScale =
    sharedScale * Math.sqrt(targetBdAreaPx / rawBdAreaPx);

  const bdTrueAnchor: [number, number] = [214, 158];
  const bdTrueProjection = geoAzimuthalEqualArea()
    .rotate([
      -BANGLADESH_CENTROID_LON_LAT[0],
      -BANGLADESH_CENTROID_LON_LAT[1],
    ])
    .scale(calibratedTrueScale)
    .translate(bdTrueAnchor);

  const bdTruePath = geoPath(bdTrueProjection)(BANGLADESH_FEATURE) ?? "";
  const bdTrueDhakaPt = projectPoint(bdTrueProjection, DHAKA_LON_LAT, [
    bdTrueAnchor[0] + 1,
    bdTrueAnchor[1] - 2,
  ]);

  // Magnified inset lens (124 x 124 box) for crisp Dhaka & delta river mouth visibility
  const bdZoomProjection = geoAzimuthalEqualArea()
    .rotate([
      -BANGLADESH_CENTROID_LON_LAT[0],
      -BANGLADESH_CENTROID_LON_LAT[1],
    ])
    .fitExtent(
      [
        [18, 22],
        [106, 108],
      ],
      BANGLADESH_FEATURE,
    );
  const bdZoomPath = geoPath(bdZoomProjection)(BANGLADESH_FEATURE) ?? "";
  const bdZoomDhakaPt = projectPoint(bdZoomProjection, DHAKA_LON_LAT, [
    62,
    62,
  ]);

  return {
    graticulePath,
    easternRussiaContextPath,
    yakutiaMainlandPath,
    yakutiaIslandsPath,
    yakutiaFullPath,
    lenaRiverPath,
    arcticCirclePath,
    yakutskPt,
    oymyakonPt,
    arcticLabelPt,
    bdTrueAnchor,
    bdTruePath,
    bdTrueDhakaPt,
    bdZoomPath,
    bdZoomDhakaPt,
  };
})();

interface FrostParticleSpec {
  id: number;
  baseX: number;
  baseY: number;
  size: number;
  speedY: number;
  driftX: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  opacity: number;
  isCrystal: boolean;
}

const FROST_PARTICLES: ReadonlyArray<FrostParticleSpec> = Array.from(
  { length: 34 },
  (_, i) => {
    const s1 = seededUnit(3101 + i * 29);
    const s2 = seededUnit(3107 + i * 37);
    const s3 = seededUnit(3119 + i * 43);
    const s4 = seededUnit(3137 + i * 53);
    const s5 = seededUnit(3163 + i * 61);
    return {
      id: i,
      baseX: s1 * MAP_VIEW_W,
      baseY: s2 * MAP_VIEW_H,
      size: i < 9 ? 4.2 + s3 * 3.4 : 1.4 + s3 * 2.1,
      speedY: 0.32 + s4 * 0.58,
      driftX: 0.14 + s5 * 0.28,
      swayAmp: 4 + s3 * 9,
      swayFreq: 0.024 + s4 * 0.028,
      phase: s5 * Math.PI * 2,
      opacity: i < 9 ? 0.48 + s2 * 0.34 : 0.28 + s1 * 0.42,
      isCrystal: i < 9,
    };
  },
);

interface MonsoonStreakSpec {
  id: number;
  baseX: number;
  baseY: number;
  length: number;
  speed: number;
  opacity: number;
  isGold: boolean;
}

const MONSOON_STREAKS: ReadonlyArray<MonsoonStreakSpec> = Array.from(
  { length: 26 },
  (_, i) => {
    const r1 = seededUnit(5209 + i * 31);
    const r2 = seededUnit(5227 + i * 41);
    const r3 = seededUnit(5233 + i * 47);
    return {
      id: i,
      baseX: r1 * MAP_VIEW_W,
      baseY: r2 * MAP_VIEW_H,
      length: 11 + r3 * 15,
      speed: 1.55 + r2 * 1.35,
      opacity: 0.16 + r3 * 0.24,
      isGold: i % 3 === 0,
    };
  },
);

interface UrbanCellSpec {
  id: number;
  xPct: number;
  yPct: number;
  wPx: number;
  hPx: number;
  warm: boolean;
  twinklePhase: number;
}

const DHAKA_URBAN_CELLS: ReadonlyArray<UrbanCellSpec> = Array.from(
  { length: 38 },
  (_, i) => {
    const u1 = seededUnit(7103 + i * 19);
    const u2 = seededUnit(7121 + i * 23);
    const u3 = seededUnit(7129 + i * 31);
    return {
      id: i,
      xPct: 3 + ((i * 2.55 + u1 * 1.8) % 93),
      yPct: 16 + u2 * 64,
      wPx: 4 + u3 * 7,
      hPx: 4 + u1 * 6,
      warm: i % 3 !== 0,
      twinklePhase: u2 * Math.PI * 2,
    };
  },
);

interface SiberiaOutpostSpec {
  id: number;
  xPct: number;
  yPct: number;
  r: number;
  phase: number;
}

const SIBERIA_OUTPOSTS: ReadonlyArray<SiberiaOutpostSpec> = Array.from(
  { length: 14 },
  (_, i) => {
    const p1 = seededUnit(8311 + i * 37);
    const p2 = seededUnit(8329 + i * 43);
    return {
      id: i,
      xPct: 5 + ((i * 6.9 + p1 * 3.1) % 90),
      yPct: 24 + p2 * 52,
      r: i % 4 === 0 ? 2.6 : 1.7,
      phase: p1 * Math.PI * 2,
    };
  },
);

// ---------------------------------------------------------------------------
// Deterministic Timing Helpers
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function progressWindow(
  frame: number,
  startFrame: number,
  durationFrames: number,
  easingFn?: (input: number) => number,
): number {
  const safeEnd = startFrame + Math.max(1, durationFrames);
  return interpolate(frame, [startFrame, safeEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easingFn,
  });
}

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN_OUT_CUBIC = Easing.bezier(0.65, 0, 0.35, 1);

function resolveActiveSpeaker(
  globalFrame: number,
  sceneIndex: number,
  turns: TurnTiming[],
): CharacterId | null {
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    if (
      turn &&
      turn.sceneIndex === sceneIndex &&
      globalFrame >= turn.startFrame &&
      globalFrame <= turn.endFrame
    ) {
      return turn.characterId;
    }
  }
  return null;
}

function resolveSecondHalfRevealFrame(
  sceneStartFrame: number,
  durationInFrames: number,
  sceneIndex: number,
  turns: TurnTiming[],
): number {
  const fallback = Math.round(durationInFrames * 0.48);
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    if (!turn || turn.sceneIndex !== sceneIndex) {
      continue;
    }
    const lower = `${turn.text} ${turn.highlightStat ?? ""}`.toLowerCase();
    if (
      lower.includes("siberia") ||
      lower.includes("13,100,000") ||
      lower.includes("13.1") ||
      (lower.includes("dhaka") && lower.includes("24"))
    ) {
      const localStart = turn.startFrame - sceneStartFrame - 6;
      if (
        localStart >= Math.round(durationInFrames * 0.34) &&
        localStart <= Math.round(durationInFrames * 0.72)
      ) {
        return localStart;
      }
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface CryoThermometerProps {
  mode: "arctic" | "monsoon";
  progress: number;
  frame: number;
  uid: string;
}

const THERM_TICKS: ReadonlyArray<number> = [40, 20, 0, -20, -40, -60];

const DualScaleThermometer: React.FC<CryoThermometerProps> = ({
  mode,
  progress,
  frame,
  uid,
}) => {
  const isArctic = mode === "arctic";
  const targetTemp = isArctic ? -50 : 28;
  const currentTemp = isArctic
    ? interpolate(progress, [0, 1], [0, -50], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(progress, [0, 1], [0, 28], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Scale mapping: +40°C -> y=16, -60°C -> y=166 (1.5px per 1°C)
  const tempToY = (deg: number): number => 16 + ((40 - deg) / 100) * 150;
  const zeroY = tempToY(0);
  const currentY = tempToY(currentTemp);
  const bulbCy = 185;
  const tubeBottomY = 172;
  const stemX = 39;

  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.12 + (isArctic ? 0 : 1.4));
  const accent = isArctic
    ? TOKENS.colors.russiaCyan
    : TOKENS.colors.imperialAmber;
  const secondary = isArctic
    ? TOKENS.colors.russiaIce
    : TOKENS.colors.bengalEmerald;

  const liquidGradId = `therm-liq-${mode}-${uid}`;
  const zoneGradId = `therm-zone-${mode}-${uid}`;

  const formattedTemp =
    currentTemp > 0.4
      ? `+${Math.round(currentTemp)}°C`
      : `${Math.round(currentTemp)}°C`;

  return (
    <div
      style={{
        width: 108,
        height: 328,
        borderRadius: 12,
        background: "rgba(5, 11, 21, 0.78)",
        border: `1px solid ${
          isArctic ? "rgba(56, 189, 248, 0.24)" : "rgba(16, 185, 129, 0.26)"
        }`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 6px 10px",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: TOKENS.colors.textSecondary,
          textAlign: "center",
        }}
      >
        {isArctic ? "WINTER MEAN" : "MONSOON MEAN"}
      </div>

      <svg
        width={96}
        height={210}
        viewBox="0 0 96 210"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={liquidGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            {isArctic ? (
              <>
                <stop offset="0%" stopColor="#E0F2FE" />
                <stop offset="45%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0284C7" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="35%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#10B981" />
              </>
            )}
          </linearGradient>
          <linearGradient id={zoneGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop
              offset="0%"
              stopColor={accent}
              stopOpacity={isArctic ? 0.06 : 0.28}
            />
            <stop
              offset="100%"
              stopColor={secondary}
              stopOpacity={isArctic ? 0.3 : 0.06}
            />
          </linearGradient>
        </defs>

        {/* Sub-zero or warm thermal excursion band from 0°C */}
        <rect
          x={stemX - 11}
          y={Math.min(zeroY, currentY)}
          width={22}
          height={Math.max(2, Math.abs(currentY - zeroY))}
          rx={4}
          fill={`url(#${zoneGradId})`}
        />

        {/* Reference 0°C freezing line */}
        <line
          x1={14}
          y1={zeroY}
          x2={84}
          y2={zeroY}
          stroke="rgba(226, 232, 240, 0.32)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />

        {/* Degree scale ticks */}
        {THERM_TICKS.map((deg) => {
          const ty = tempToY(deg);
          const isZero = deg === 0;
          return (
            <g key={deg}>
              <line
                x1={50}
                y1={ty}
                x2={57}
                y2={ty}
                stroke={
                  isZero
                    ? TOKENS.colors.textSecondary
                    : "rgba(148, 163, 184, 0.38)"
                }
                strokeWidth={isZero ? 1.3 : 0.9}
              />
              <text
                x={60}
                y={ty + 3}
                fill={
                  isZero ? TOKENS.colors.textPrimary : TOKENS.colors.textMuted
                }
                fontFamily={FONTS.mono}
                fontSize={8.5}
                fontWeight={isZero ? 700 : 500}
              >
                {deg > 0 ? `+${deg}°` : `${deg}°`}
              </text>
            </g>
          );
        })}

        {/* Outer glass capillary stem & bulb */}
        <rect
          x={stemX - 6}
          y={12}
          width={12}
          height={tubeBottomY - 12}
          rx={6}
          fill="rgba(15, 23, 42, 0.92)"
          stroke="rgba(186, 230, 253, 0.28)"
          strokeWidth={1.2}
        />
        <circle
          cx={stemX}
          cy={bulbCy}
          r={13}
          fill="rgba(15, 23, 42, 0.95)"
          stroke={isArctic ? "rgba(56, 189, 248, 0.5)" : "rgba(245, 158, 11, 0.5)"}
          strokeWidth={1.4}
        />

        {/* Active mercury / cryo column from bulb up to currentY */}
        <rect
          x={stemX - 3.6}
          y={currentY}
          width={7.2}
          height={Math.max(4, bulbCy - currentY)}
          rx={3.6}
          fill={`url(#${liquidGradId})`}
        />

        {/* Glowing bulb core + subtle aura */}
        <circle
          cx={stemX}
          cy={bulbCy}
          r={14 + pulse * 3}
          fill={accent}
          fillOpacity={0.16 + pulse * 0.1}
        />
        <circle cx={stemX} cy={bulbCy} r={9.5} fill={`url(#${liquidGradId})`} />
        <circle
          cx={stemX - 3}
          cy={bulbCy - 3}
          r={2.6}
          fill="#FFFFFF"
          fillOpacity={0.65}
        />

        {/* Plunge / rise directional indicator & target meniscus marker */}
        <circle
          cx={stemX}
          cy={currentY}
          r={5.2}
          fill={isArctic ? TOKENS.colors.russiaIce : "#FEF3C7"}
          stroke={accent}
          strokeWidth={1.6}
        />
        <line
          x1={12}
          y1={currentY}
          x2={stemX - 7}
          y2={currentY}
          stroke={accent}
          strokeWidth={1.6}
        />
        <polygon
          points={
            isArctic
              ? `${14},${currentY - 4} ${20},${currentY - 4} ${17},${currentY + 3}`
              : `${14},${currentY + 4} ${20},${currentY + 4} ${17},${currentY - 3}`
          }
          fill={accent}
          opacity={progress > 0.15 ? 0.95 : 0}
        />

        {/* Frost crystal spokes around bulb when Arctic reaches sub-zero extreme */}
        {isArctic && progress > 0.45 && (
          <g
            transform={`translate(${stemX}, ${bulbCy})`}
            opacity={interpolate(progress, [0.45, 1], [0, 0.85], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          >
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <line
                key={deg}
                x1={0}
                y1={-15}
                x2={0}
                y2={-19.5}
                stroke={TOKENS.colors.russiaIce}
                strokeWidth={1.1}
                strokeLinecap="round"
                transform={`rotate(${deg})`}
              />
            ))}
          </g>
        )}

        {/* Target lock label */}
        <text
          x={5}
          y={currentY - 7}
          fill={isArctic ? TOKENS.colors.russiaIce : "#FEF3C7"}
          fontFamily={FONTS.mono}
          fontSize={8.5}
          fontWeight={700}
          opacity={progress > 0.65 ? 1 : 0}
        >
          {targetTemp > 0 ? `+${targetTemp}°` : `${targetTemp}°`}
        </text>
      </svg>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.05,
            color: isArctic ? TOKENS.colors.russiaCyan : TOKENS.colors.imperialAmber,
            textShadow: isArctic
              ? "0 0 14px rgba(56, 189, 248, 0.45)"
              : "0 0 14px rgba(245, 158, 11, 0.4)",
          }}
        >
          {formattedTemp}
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: FONTS.mono,
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: "0.09em",
            color: isArctic ? TOKENS.colors.russiaIce : "#6EE7B7",
          }}
        >
          {isArctic ? "ICY PERMAFROST" : "TROPICAL DELTA"}
        </div>
      </div>
    </div>
  );
};

interface PopulationColumnBayProps {
  mode: "yakutia" | "bangladesh";
  progress: number;
  badgePop: number;
  uid: string;
}

const SHAFT_GRID_MILLIONS: ReadonlyArray<number> = [175, 125, 75, 25, 0];

const PopulationColumnBay: React.FC<PopulationColumnBayProps> = ({
  mode,
  progress,
  badgePop,
  uid,
}) => {
  const isYakutia = mode === "yakutia";
  const shaftTopY = 38;
  const shaftBottomY = 224;
  const maxBarHeight = shaftBottomY - shaftTopY; // 186px = 175.0M

  const displayedMillions = isYakutia
    ? YAKUTIA_POP_MILLIONS * progress
    : BANGLADESH_POP_MILLIONS * progress;

  // Yakutia 1.0M true height is 1.06px; clamp to 4px architectural slab so the sliver is crisp
  const barHeight = isYakutia
    ? 4 * progress
    : maxBarHeight * progress;
  const barTopY = shaftBottomY - barHeight;
  const dhakaCrownHeight = isYakutia
    ? 0
    : barHeight * (DHAKA_METRO_MILLIONS / BANGLADESH_POP_MILLIONS);

  const colGradId = `pop-col-${mode}-${uid}`;
  const crownGradId = `pop-crown-${mode}-${uid}`;

  return (
    <div
      style={{
        width: 184,
        height: 328,
        borderRadius: 12,
        background: "rgba(5, 11, 21, 0.78)",
        border: `1px solid ${
          isYakutia ? "rgba(56, 189, 248, 0.24)" : "rgba(16, 185, 129, 0.3)"
        }`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 10px 10px",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 2px",
        }}
      >
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.09em",
            color: TOKENS.colors.textSecondary,
          }}
        >
          POPULATION
        </span>
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 8.5,
            color: TOKENS.colors.textMuted,
          }}
        >
          0–175M
        </span>
      </div>

      <svg
        width={162}
        height={246}
        viewBox="0 0 162 246"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={colGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            {isYakutia ? (
              <>
                <stop offset="0%" stopColor="#BAE6FD" />
                <stop offset="100%" stopColor="#0284C7" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="48%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#065F46" />
              </>
            )}
          </linearGradient>
          <linearGradient id={crownGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="55%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>

        {/* Empty 175M reference shaft outline */}
        <rect
          x={46}
          y={shaftTopY}
          width={76}
          height={maxBarHeight}
          rx={4}
          fill="rgba(15, 23, 42, 0.52)"
          stroke="rgba(148, 163, 184, 0.18)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Horizontal axis ticks (0M .. 175M) */}
        {SHAFT_GRID_MILLIONS.map((val) => {
          const gy = shaftBottomY - (val / 175) * maxBarHeight;
          return (
            <g key={val}>
              <line
                x1={38}
                y1={gy}
                x2={126}
                y2={gy}
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth={0.8}
              />
              <text
                x={34}
                y={gy + 3}
                textAnchor="end"
                fill={TOKENS.colors.textMuted}
                fontFamily={FONTS.mono}
                fontSize={8}
              >
                {val}M
              </text>
            </g>
          );
        })}

        {/* Pedestal floor plate */}
        <line
          x1={36}
          y1={shaftBottomY + 0.5}
          x2={132}
          y2={shaftBottomY + 0.5}
          stroke={isYakutia ? "rgba(56, 189, 248, 0.5)" : "rgba(16, 185, 129, 0.6)"}
          strokeWidth={1.6}
        />

        {isYakutia ? (
          <>
            {/* Empty capacity annotation inside Yakutia shaft */}
            <text
              x={84}
              y={104}
              textAnchor="middle"
              fill="rgba(148, 163, 184, 0.46)"
              fontFamily={FONTS.mono}
              fontSize={8.5}
              fontWeight={700}
            >
              99.4% EMPTY
            </text>
            <text
              x={84}
              y={116}
              textAnchor="middle"
              fill="rgba(148, 163, 184, 0.36)"
              fontFamily={FONTS.mono}
              fontSize={7.5}
            >
              VS. 175M CEILING
            </text>

            {/* Tiny 1.0M icy monolith sliver at the base */}
            {barHeight > 0.2 && (
              <g>
                <rect
                  x={46}
                  y={barTopY}
                  width={76}
                  height={Math.max(1.5, barHeight)}
                  fill={`url(#${colGradId})`}
                />
                {/* Crisp 3D isometric top bevel */}
                <polygon
                  points={`46,${barTopY} 53,${barTopY - 4} 129,${barTopY - 4} 122,${barTopY}`}
                  fill={TOKENS.colors.russiaIce}
                  fillOpacity={0.92}
                />
                <line
                  x1={46}
                  y1={barTopY}
                  x2={122}
                  y2={barTopY}
                  stroke="#FFFFFF"
                  strokeWidth={1.1}
                />
              </g>
            )}

            {/* Precision callout pointing down to the tiny monolith */}
            <g
              opacity={interpolate(progress, [0.25, 0.85], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            >
              <rect
                x={36}
                y={156}
                width={96}
                height={38}
                rx={6}
                fill="rgba(8, 30, 52, 0.94)"
                stroke="rgba(56, 189, 248, 0.55)"
                strokeWidth={1}
              />
              <text
                x={84}
                y={173}
                textAnchor="middle"
                fill={TOKENS.colors.russiaIce}
                fontFamily={FONTS.mono}
                fontSize={12.5}
                fontWeight={700}
              >
                {displayedMillions.toFixed(1)} MILLION
              </text>
              <text
                x={84}
                y={186}
                textAnchor="middle"
                fill={TOKENS.colors.russiaCyan}
                fontFamily={FONTS.mono}
                fontSize={8}
                fontWeight={700}
                letterSpacing="0.06em"
              >
                TINY MONOLITH
              </text>
              <line
                x1={84}
                y1={194}
                x2={84}
                y2={barTopY - 6}
                stroke={TOKENS.colors.russiaCyan}
                strokeWidth={1.2}
              />
              <polygon
                points={`80,${barTopY - 9} 88,${barTopY - 9} 84,${barTopY - 3}`}
                fill={TOKENS.colors.russiaCyan}
              />
            </g>
          </>
        ) : (
          <>
            {/* Towering 175.0 MILLION emerald + Dhaka gold crown column */}
            {barHeight > 1 && (
              <g>
                <rect
                  x={46}
                  y={barTopY}
                  width={76}
                  height={barHeight}
                  rx={2}
                  fill={`url(#${colGradId})`}
                  stroke="#6EE7B7"
                  strokeWidth={1}
                />

                {/* Top 24M Greater Dhaka Metro golden-amber crown */}
                {dhakaCrownHeight > 2 && (
                  <rect
                    x={46.5}
                    y={barTopY}
                    width={75}
                    height={dhakaCrownHeight}
                    fill={`url(#${crownGradId})`}
                  />
                )}

                {/* Dense architectural strata lines every 12.5M */}
                {Array.from({ length: 13 }, (_, idx) => {
                  const sy = shaftBottomY - ((idx + 1) / 14) * maxBarHeight;
                  if (sy <= barTopY + 3) {
                    return null;
                  }
                  return (
                    <line
                      key={idx}
                      x1={47}
                      y1={sy}
                      x2={121}
                      y2={sy}
                      stroke="rgba(5, 9, 17, 0.34)"
                      strokeWidth={1}
                    />
                  );
                })}

                {/* 3D isometric side & top cap */}
                <polygon
                  points={`122,${barTopY} 129,${barTopY - 5} 129,${shaftBottomY - 5} 122,${shaftBottomY}`}
                  fill="#064E3B"
                  fillOpacity={0.9}
                />
                <polygon
                  points={`46,${barTopY} 53,${barTopY - 5} 129,${barTopY - 5} 122,${barTopY}`}
                  fill="#FEF3C7"
                  fillOpacity={0.92}
                />

                {/* Side micro-callout for 24M Dhaka crown */}
                {progress > 0.82 && (
                  <g opacity={(progress - 0.82) / 0.18}>
                    <text
                      x={84}
                      y={barTopY + dhakaCrownHeight * 0.64}
                      textAnchor="middle"
                      fill="#050911"
                      fontFamily={FONTS.mono}
                      fontSize={8.5}
                      fontWeight={700}
                    >
                      24M DHAKA
                    </text>
                  </g>
                )}
              </g>
            )}

            {/* Reference hairline showing Yakutia's 1.0M level at bottom */}
            <line
              x1={42}
              y1={shaftBottomY - 3.5}
              x2={132}
              y2={shaftBottomY - 3.5}
              stroke={TOKENS.colors.russiaCyan}
              strokeWidth={1.1}
              strokeDasharray="2 2"
            />

            {/* Towering top counter pill */}
            <g transform={`translate(84, ${Math.max(17, barTopY - 16)})`}>
              <rect
                x={-58}
                y={-13}
                width={116}
                height={22}
                rx={5}
                fill="rgba(5, 19, 16, 0.95)"
                stroke={TOKENS.colors.bengalEmerald}
                strokeWidth={1.2}
              />
              <text
                x={0}
                y={2}
                textAnchor="middle"
                fill="#ECFDF5"
                fontFamily={FONTS.mono}
                fontSize={12.5}
                fontWeight={700}
              >
                {displayedMillions.toFixed(1)} MILLION
              </text>
            </g>
          </>
        )}
      </svg>

      {/* Bottom comparative badge inside the population bay */}
      <div
        style={{
          height: 30,
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isYakutia
            ? "rgba(12, 74, 110, 0.36)"
            : "linear-gradient(90deg, rgba(0, 106, 78, 0.78), rgba(217, 119, 6, 0.55))",
          border: isYakutia
            ? "1px solid rgba(56, 189, 248, 0.34)"
            : "1px solid rgba(245, 158, 11, 0.65)",
          transform: `scale(${isYakutia ? 1 : 0.92 + 0.08 * badgePop})`,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: isYakutia ? TOKENS.colors.russiaIce : "#FEF3C7",
          }}
        >
          {isYakutia ? "0.32 PEOPLE / km²" : "175× MORE PEOPLE"}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Scene Component
// ---------------------------------------------------------------------------

export const Scene03YakutiaVsBangladesh: React.FC<SceneProps> = ({
  scene,
  turns,
}) => {
  const localFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rawUid = useId().replace(/:/g, "");

  const totalFrames = Math.max(150, scene.durationInFrames);
  const globalFrame = scene.startFrame + localFrame;
  const activeSpeaker = resolveActiveSpeaker(
    globalFrame,
    scene.sceneIndex,
    turns,
  );

  // Timeline choreography scaled proportionally to scene.durationInFrames
  const headerEntrance = progressWindow(localFrame, 0, Math.round(0.55 * fps), EASE_OUT_EXPO);
  const leftPanelEntrance = spring({
    fps,
    frame: localFrame - 4,
    config: { damping: 24, stiffness: 130, mass: 0.9 },
  });
  const rightPanelEntrance = spring({
    fps,
    frame: localFrame - 12,
    config: { damping: 24, stiffness: 130, mass: 0.9 },
  });

  // Left Panel (Sakha / Yakutia) beats
  const yakutiaDraw = progressWindow(localFrame, 10, 48, EASE_OUT_EXPO);
  const yakutiaFillAlpha = progressWindow(localFrame, 20, 38, EASE_OUT_EXPO);
  const yakutiaThermo = progressWindow(localFrame, 18, 66, EASE_OUT_EXPO);
  const yakutiaPopProgress = progressWindow(localFrame, 30, 44, EASE_OUT_EXPO);
  const yakutiaBadgeSpring = spring({
    fps,
    frame: localFrame - 34,
    config: { damping: 18, stiffness: 170, mass: 0.8 },
  });

  // Right Panel (Bangladesh + Greater Dhaka) beats
  const bdDraw = progressWindow(localFrame, 34, 46, EASE_OUT_EXPO);
  const bdThermo = progressWindow(localFrame, 42, 62, EASE_OUT_EXPO);
  const bdColumnProgress = progressWindow(localFrame, 48, 72, EASE_OUT_EXPO);
  const bdBadgeSpring = spring({
    fps,
    frame: localFrame - 84,
    config: { damping: 16, stiffness: 180, mass: 0.8 },
  });

  // Second-Half Reveal Banner timing (inside y = 650..795)
  const revealStartFrame = resolveSecondHalfRevealFrame(
    scene.startFrame,
    totalFrames,
    scene.sceneIndex,
    turns,
  );

  const act1BridgeEnter = progressWindow(localFrame, 24, 24, EASE_OUT_EXPO);
  const act1BridgeExit = progressWindow(
    localFrame,
    revealStartFrame - 10,
    14,
    EASE_IN_OUT_CUBIC,
  );
  const act1BridgeOpacity = clamp01(act1BridgeEnter * (1 - act1BridgeExit));

  const revealBannerSpring = spring({
    fps,
    frame: localFrame - revealStartFrame,
    config: { damping: 22, stiffness: 145, mass: 0.88 },
  });
  const dhakaBarProgress = progressWindow(
    localFrame,
    revealStartFrame + 10,
    46,
    EASE_OUT_EXPO,
  );
  const siberiaBarProgress = progressWindow(
    localFrame,
    revealStartFrame + 16,
    54,
    EASE_OUT_EXPO,
  );

  // Subtle speaker-reactive border emphasis
  const yakutiaSpeakerBoost =
    activeSpeaker === "dmitri"
      ? 1
      : activeSpeaker === null && localFrame < revealStartFrame * 0.55
        ? 0.55
        : 0.15;
  const bdSpeakerBoost =
    activeSpeaker === "rafiq"
      ? 1
      : activeSpeaker === null &&
          localFrame >= revealStartFrame * 0.45 &&
          localFrame < revealStartFrame
        ? 0.55
        : 0.15;

  const yakutiaAreaCounter = formatNumber(YAKUTIA_AREA_KM2 * yakutiaDraw);
  const bdAreaCounter = formatNumber(BANGLADESH_AREA_KM2 * bdDraw);
  const dhakaMetroCounter = (DHAKA_METRO_MILLIONS * dhakaBarProgress).toFixed(1);
  const siberiaPopCounter = (SIBERIA_POP_MILLIONS * siberiaBarProgress).toFixed(1);
  const siberiaAreaCounter = formatNumber(SIBERIA_AREA_KM2 * siberiaBarProgress);

  // SVG IDs
  const yakutiaFillId = `yak-fill-${rawUid}`;
  const yakutiaClipId = `yak-clip-${rawUid}`;
  const yakutiaMapClipId = `yak-map-clip-${rawUid}`;
  const bdFillId = `bd-fill-${rawUid}`;
  const bdMapClipId = `bd-map-clip-${rawUid}`;
  const bdZoomClipId = `bd-zoom-clip-${rawUid}`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Full-canvas atmospheric background (permitted 1920x1080 backdrop) */}
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(circle at 24% 40%, rgba(56, 189, 248, 0.11) 0%, rgba(12, 74, 110, 0.06) 34%, transparent 62%),
            radial-gradient(circle at 76% 42%, rgba(16, 185, 129, 0.11) 0%, rgba(245, 158, 11, 0.05) 34%, transparent 62%),
            linear-gradient(180deg, #040810 0%, #070D19 52%, #050911 100%)
          `,
        }}
      />

      {/* Subtle architectural coordinate grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px),
            linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          opacity: 0.55,
        }}
      />

      {/* =====================================================================
          ROW 1: EDITORIAL HEADER STRIP (strictly inside y = 88..142, x = 64..1856)
         ===================================================================== */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          width: 1792,
          height: 54,
          borderRadius: 12,
          background: TOKENS.colors.bgPanelGlass,
          border: `1px solid ${TOKENS.colors.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          boxSizing: "border-box",
          opacity: headerEntrance,
          transform: `translateY(${(1 - headerEntrance) * 10}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              fontFamily: FONTS.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: TOKENS.colors.russiaCyan,
            }}
          >
            SUB-NATIONAL CONTRAST
          </div>
          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 25,
              color: TOKENS.colors.textPrimary,
              letterSpacing: "0.01em",
            }}
          >
            One Frozen Russian Republic vs. A Nation of 175 Million
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: FONTS.mono,
              fontSize: 11,
              color: TOKENS.colors.textSecondary,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: TOKENS.colors.russiaCyan,
                display: "inline-block",
              }}
            />
            <span>SAKHA 3.08M km²</span>
            <span style={{ color: TOKENS.colors.textMuted }}>·</span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: TOKENS.colors.bengalEmerald,
                display: "inline-block",
              }}
            />
            <span>BANGLADESH 148K km²</span>
          </div>

          <div
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.38)",
              fontFamily: FONTS.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: TOKENS.colors.imperialAmber,
            }}
          >
            LAMBERT EQUAL-AREA · 20.8 : 1
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 2 LEFT: SAKHA REPUBLIC (YAKUTIA), RUSSIA (x = 64..938, y = 152..636)
         ===================================================================== */}
      <div
        style={{
          position: "absolute",
          top: 152,
          left: 64,
          width: 874,
          height: 484,
          borderRadius: 16,
          background: TOKENS.colors.bgCardElevated,
          border: `1.5px solid rgba(56, 189, 248, ${(
            0.26 + yakutiaSpeakerBoost * 0.34
          ).toFixed(2)})`,
          boxShadow: `0 18px 44px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(186, 230, 253, 0.12)`,
          boxSizing: "border-box",
          overflow: "hidden",
          opacity: clamp01(leftPanelEntrance),
          transform: `translateY(${(1 - leftPanelEntrance) * 18}px)`,
        }}
      >
        {/* Top Header of Left Panel */}
        <div
          style={{
            height: 74,
            padding: "12px 20px 10px",
            borderBottom: "1px solid rgba(56, 189, 248, 0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            background:
              "linear-gradient(90deg, rgba(12, 74, 110, 0.32) 0%, rgba(10, 17, 30, 0.1) 100%)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: TOKENS.colors.russiaCyan,
              }}
            >
              RUSSIAN FEDERATION · LARGEST SUB-NATIONAL REPUBLIC
            </div>
            <div
              style={{
                marginTop: 2,
                fontFamily: FONTS.display,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.colors.textPrimary,
              }}
            >
              SAKHA REPUBLIC (YAKUTIA)
            </div>
          </div>

          <div
            style={{
              padding: "6px 14px",
              borderRadius: 10,
              background:
                "linear-gradient(135deg, rgba(12, 74, 110, 0.85), rgba(8, 47, 73, 0.95))",
              border: "1px solid rgba(56, 189, 248, 0.62)",
              textAlign: "right",
              transform: `scale(${0.86 + 0.14 * clamp01(yakutiaBadgeSpring)})`,
              opacity: clamp01(yakutiaBadgeSpring),
            }}
          >
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 17.5,
                fontWeight: 700,
                lineHeight: 1.1,
                color: TOKENS.colors.russiaIce,
              }}
            >
              20.8× LARGER
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.09em",
                color: TOKENS.colors.russiaCyan,
              }}
            >
              THAN ALL OF BANGLADESH
            </div>
          </div>
        </div>

        {/* Middle 3-Zone Instrument Stage (Thermometer | Map | Population Monolith) */}
        <div
          style={{
            height: 356,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxSizing: "border-box",
          }}
        >
          {/* Zone L1: Plunging -50°C Cryo Thermometer */}
          <DualScaleThermometer
            mode="arctic"
            progress={yakutiaThermo}
            frame={localFrame}
            uid={rawUid}
          />

          {/* Zone L2: Sakha / Yakutia Cartographic Polygon + Deterministic Frost/Snow */}
          <div
            style={{
              width: MAP_VIEW_W,
              height: MAP_VIEW_H,
              borderRadius: 14,
              background:
                "radial-gradient(circle at 50% 44%, rgba(14, 65, 102, 0.44) 0%, rgba(5, 10, 20, 0.94) 78%)",
              border: "1px solid rgba(56, 189, 248, 0.28)",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <svg
              width={MAP_VIEW_W}
              height={MAP_VIEW_H}
              viewBox={`0 0 ${MAP_VIEW_W} ${MAP_VIEW_H}`}
              style={{ display: "block" }}
            >
              <defs>
                <linearGradient
                  id={yakutiaFillId}
                  x1="15%"
                  y1="0%"
                  x2="85%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.56} />
                  <stop offset="48%" stopColor="#0284C7" stopOpacity={0.48} />
                  <stop offset="100%" stopColor="#0C4A6E" stopOpacity={0.72} />
                </linearGradient>
                <clipPath id={yakutiaClipId}>
                  <path d={CARTOGRAPHY.yakutiaFullPath} />
                </clipPath>
                <clipPath id={yakutiaMapClipId}>
                  <rect x={0} y={0} width={MAP_VIEW_W} height={MAP_VIEW_H} />
                </clipPath>
              </defs>

              <g clipPath={`url(#${yakutiaMapClipId})`}>
                {/* Polar 10° graticule */}
                {CARTOGRAPHY.graticulePath && (
                  <path
                    d={CARTOGRAPHY.graticulePath}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.11)"
                    strokeWidth={0.75}
                  />
                )}

                {/* Faint eastern Russia continental backdrop */}
                {CARTOGRAPHY.easternRussiaContextPath && (
                  <path
                    d={CARTOGRAPHY.easternRussiaContextPath}
                    fill="rgba(15, 29, 48, 0.56)"
                    stroke="rgba(56, 189, 248, 0.16)"
                    strokeWidth={0.85}
                    strokeDasharray="4 4"
                  />
                )}

                {/* 66.5°N Arctic Circle arc */}
                {CARTOGRAPHY.arcticCirclePath && (
                  <g opacity={0.35 + 0.55 * yakutiaFillAlpha}>
                    <path
                      d={CARTOGRAPHY.arcticCirclePath}
                      fill="none"
                      stroke={TOKENS.colors.russiaCyan}
                      strokeWidth={1.15}
                      strokeDasharray="5 4"
                    />
                    <text
                      x={Math.max(48, CARTOGRAPHY.arcticLabelPt[0])}
                      y={CARTOGRAPHY.arcticLabelPt[1] - 6}
                      fill={TOKENS.colors.russiaIce}
                      fontFamily={FONTS.mono}
                      fontSize={8.5}
                      fontWeight={700}
                      letterSpacing="0.08em"
                      opacity={0.78}
                    >
                      66.5°N ARCTIC CIRCLE
                    </text>
                  </g>
                )}

                {/* Sakha / Yakutia outer icy halo */}
                <path
                  d={CARTOGRAPHY.yakutiaFullPath}
                  fill="none"
                  stroke={TOKENS.colors.russiaCyan}
                  strokeWidth={8}
                  strokeOpacity={0.22 * yakutiaFillAlpha}
                  strokeLinejoin="round"
                />

                {/* Sakha / Yakutia equal-area polygon fill + crystalline permafrost facets */}
                <g opacity={yakutiaFillAlpha}>
                  <path
                    d={CARTOGRAPHY.yakutiaFullPath}
                    fill={`url(#${yakutiaFillId})`}
                  />

                  <g clipPath={`url(#${yakutiaClipId})`} opacity={0.28}>
                    {[-80, -20, 40, 100, 160, 220, 280, 340, 400].map((xOff) => (
                      <line
                        key={xOff}
                        x1={xOff}
                        y1={0}
                        x2={xOff + 150}
                        y2={MAP_VIEW_H}
                        stroke={TOKENS.colors.russiaIce}
                        strokeWidth={0.9}
                      />
                    ))}
                  </g>

                  {/* Lena River hydrologic spine */}
                  {CARTOGRAPHY.lenaRiverPath && (
                    <path
                      d={CARTOGRAPHY.lenaRiverPath}
                      fill="none"
                      stroke={TOKENS.colors.russiaIce}
                      strokeWidth={1.5}
                      strokeOpacity={0.62}
                      strokeLinecap="round"
                    />
                  )}
                </g>

                {/* Crisp animated perimeter stroke */}
                <path
                  d={CARTOGRAPHY.yakutiaMainlandPath}
                  pathLength={1}
                  fill="none"
                  stroke={TOKENS.colors.russiaIce}
                  strokeWidth={1.85}
                  strokeLinejoin="round"
                  strokeDasharray={1}
                  strokeDashoffset={1 - yakutiaDraw}
                />
                <path
                  d={CARTOGRAPHY.yakutiaIslandsPath}
                  fill="none"
                  stroke={TOKENS.colors.russiaIce}
                  strokeWidth={1.4}
                  strokeOpacity={yakutiaFillAlpha}
                  strokeLinejoin="round"
                />

                {/* Yakutsk & Oymyakon cartographic callout pins */}
                <g opacity={yakutiaFillAlpha}>
                  {/* Yakutsk */}
                  <g
                    transform={`translate(${CARTOGRAPHY.yakutskPt[0].toFixed(1)}, ${CARTOGRAPHY.yakutskPt[1].toFixed(1)})`}
                  >
                    <circle
                      r={7}
                      fill={TOKENS.colors.russiaCyan}
                      fillOpacity={0.26}
                    />
                    <circle
                      r={3.5}
                      fill={TOKENS.colors.russiaIce}
                      stroke={TOKENS.colors.bgObsidian}
                      strokeWidth={1.2}
                    />
                    <rect
                      x={-84}
                      y={6}
                      width={92}
                      height={18}
                      rx={4}
                      fill="rgba(5, 9, 17, 0.86)"
                      stroke="rgba(56, 189, 248, 0.5)"
                      strokeWidth={0.85}
                    />
                    <text
                      x={-38}
                      y={18}
                      textAnchor="middle"
                      fill={TOKENS.colors.russiaIce}
                      fontFamily={FONTS.mono}
                      fontSize={8.5}
                      fontWeight={700}
                    >
                      YAKUTSK · -50°C
                    </text>
                  </g>

                  {/* Oymyakon Pole of Cold */}
                  <g
                    transform={`translate(${CARTOGRAPHY.oymyakonPt[0].toFixed(1)}, ${CARTOGRAPHY.oymyakonPt[1].toFixed(1)})`}
                  >
                    <circle
                      r={3.2}
                      fill="#E0F2FE"
                      stroke={TOKENS.colors.russiaCyan}
                      strokeWidth={1.2}
                    />
                    <rect
                      x={7}
                      y={-10}
                      width={96}
                      height={18}
                      rx={4}
                      fill="rgba(5, 9, 17, 0.86)"
                      stroke="rgba(186, 230, 253, 0.45)"
                      strokeWidth={0.85}
                    />
                    <text
                      x={55}
                      y={2}
                      textAnchor="middle"
                      fill="#E0F2FE"
                      fontFamily={FONTS.mono}
                      fontSize={8}
                      fontWeight={700}
                    >
                      OYMYAKON COLD
                    </text>
                  </g>
                </g>

                {/* Deterministic drifting crystalline frost / snow particles */}
                {FROST_PARTICLES.map((p) => {
                  const x =
                    ((p.baseX +
                      localFrame * p.driftX +
                      Math.sin(localFrame * p.swayFreq + p.phase) * p.swayAmp) %
                      MAP_VIEW_W +
                      MAP_VIEW_W) %
                    MAP_VIEW_W;
                  const y =
                    ((p.baseY + localFrame * p.speedY) % MAP_VIEW_H +
                      MAP_VIEW_H) %
                    MAP_VIEW_H;
                  const twinkle =
                    0.65 + 0.35 * Math.sin(localFrame * 0.09 + p.phase);
                  const alpha = p.opacity * twinkle;

                  if (p.isCrystal) {
                    const rot = (localFrame * 0.7 + p.id * 22) % 360;
                    const arm = p.size;
                    return (
                      <g
                        key={p.id}
                        transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`}
                        opacity={alpha}
                      >
                        <line
                          x1={-arm}
                          y1={0}
                          x2={arm}
                          y2={0}
                          stroke="#E0F2FE"
                          strokeWidth={1.05}
                          strokeLinecap="round"
                        />
                        <line
                          x1={0}
                          y1={-arm}
                          x2={0}
                          y2={arm}
                          stroke="#E0F2FE"
                          strokeWidth={1.05}
                          strokeLinecap="round"
                        />
                        <line
                          x1={-arm * 0.68}
                          y1={-arm * 0.68}
                          x2={arm * 0.68}
                          y2={arm * 0.68}
                          stroke={TOKENS.colors.russiaCyan}
                          strokeWidth={0.9}
                          strokeLinecap="round"
                        />
                        <line
                          x1={-arm * 0.68}
                          y1={arm * 0.68}
                          x2={arm * 0.68}
                          y2={-arm * 0.68}
                          stroke={TOKENS.colors.russiaCyan}
                          strokeWidth={0.9}
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  }

                  return (
                    <circle
                      key={p.id}
                      cx={x}
                      cy={y}
                      r={p.size}
                      fill="#E0F2FE"
                      fillOpacity={alpha}
                    />
                  );
                })}
              </g>
            </svg>

            {/* Top-left micro tag */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 12,
                padding: "3px 8px",
                borderRadius: 5,
                background: "rgba(5, 9, 17, 0.82)",
                border: "1px solid rgba(56, 189, 248, 0.34)",
                fontFamily: FONTS.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: TOKENS.colors.russiaIce,
              }}
            >
              EQUAL-AREA · 1 REPUBLIC OF RUSSIA
            </div>

            {/* Bottom-left live area readout */}
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 12,
                right: 12,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  padding: "6px 11px",
                  borderRadius: 8,
                  background: "rgba(5, 9, 17, 0.88)",
                  border: "1px solid rgba(56, 189, 248, 0.42)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 16.5,
                    fontWeight: 700,
                    color: TOKENS.colors.textPrimary,
                    lineHeight: 1.1,
                  }}
                >
                  {yakutiaAreaCounter}{" "}
                  <span
                    style={{
                      fontSize: 11.5,
                      color: TOKENS.colors.russiaCyan,
                    }}
                  >
                    km²
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 8.5,
                    letterSpacing: "0.08em",
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  20.8× AREA OF BANGLADESH
                </div>
              </div>

              <div
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  background: "rgba(8, 30, 52, 0.86)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  fontFamily: FONTS.mono,
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: TOKENS.colors.russiaIce,
                }}
              >
                3 TIME ZONES WIDE
              </div>
            </div>
          </div>

          {/* Zone L3: Tiny 1.0 MILLION Population Monolith */}
          <PopulationColumnBay
            mode="yakutia"
            progress={yakutiaPopProgress}
            badgePop={1}
            uid={rawUid}
          />
        </div>

        {/* Footer Telemetry Strip of Left Panel */}
        <div
          style={{
            height: 54,
            padding: "0 20px",
            borderTop: "1px solid rgba(148, 163, 184, 0.14)",
            background: "rgba(5, 10, 19, 0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            fontFamily: FONTS.mono,
            fontSize: 11,
          }}
        >
          <div>
            <span style={{ color: TOKENS.colors.textMuted }}>TERRITORY: </span>
            <span style={{ color: TOKENS.colors.textPrimary, fontWeight: 700 }}>
              3,083,523 km²
            </span>
          </div>
          <div>
            <span style={{ color: TOKENS.colors.textMuted }}>CLIMATE: </span>
            <span style={{ color: TOKENS.colors.russiaCyan, fontWeight: 700 }}>
              -50°C ARCTIC FROST
            </span>
          </div>
          <div>
            <span style={{ color: TOKENS.colors.textMuted }}>POPULATION: </span>
            <span style={{ color: TOKENS.colors.russiaIce, fontWeight: 700 }}>
              1.0 MILLION
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          CENTER DIVIDER SPINE (x = 938..982, y = 152..636)
         ===================================================================== */}
      <div
        style={{
          position: "absolute",
          top: 152,
          left: 938,
          width: 44,
          height: 484,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: headerEntrance,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 1.5,
            flex: 1,
            background:
              "linear-gradient(180deg, rgba(56, 189, 248, 0.55) 0%, rgba(226, 232, 240, 0.18) 100%)",
          }}
        />
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: TOKENS.colors.bgObsidian,
            border: "1.5px solid rgba(226, 232, 240, 0.3)",
            boxShadow: "0 0 18px rgba(5, 9, 17, 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            color: TOKENS.colors.textPrimary,
            margin: "6px 0",
          }}
        >
          VS
        </div>
        <div
          style={{
            width: 1.5,
            flex: 1,
            background:
              "linear-gradient(180deg, rgba(226, 232, 240, 0.18) 0%, rgba(16, 185, 129, 0.6) 100%)",
          }}
        />
      </div>

      {/* =====================================================================
          ROW 2 RIGHT: BANGLADESH + GREATER DHAKA (x = 982..1856, y = 152..636)
         ===================================================================== */}
      <div
        style={{
          position: "absolute",
          top: 152,
          left: 982,
          width: 874,
          height: 484,
          borderRadius: 16,
          background: TOKENS.colors.bgCardElevated,
          border: `1.5px solid rgba(16, 185, 129, ${(
            0.28 + bdSpeakerBoost * 0.36
          ).toFixed(2)})`,
          boxShadow: `0 18px 44px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(167, 243, 208, 0.12)`,
          boxSizing: "border-box",
          overflow: "hidden",
          opacity: clamp01(rightPanelEntrance),
          transform: `translateY(${(1 - rightPanelEntrance) * 18}px)`,
        }}
      >
        {/* Top Header of Right Panel */}
        <div
          style={{
            height: 74,
            padding: "12px 20px 10px",
            borderBottom: "1px solid rgba(16, 185, 129, 0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            background:
              "linear-gradient(90deg, rgba(0, 106, 78, 0.34) 0%, rgba(10, 17, 30, 0.1) 100%)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: TOKENS.colors.bengalEmerald,
              }}
            >
              SOVEREIGN DELTA NATION · FERTILE MONSOON HEARTLAND
            </div>
            <div
              style={{
                marginTop: 2,
                fontFamily: FONTS.display,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: TOKENS.colors.textPrimary,
              }}
            >
              BANGLADESH + GREATER DHAKA
            </div>
          </div>

          <div
            style={{
              padding: "6px 14px",
              borderRadius: 10,
              background:
                "linear-gradient(135deg, rgba(0, 106, 78, 0.9), rgba(180, 83, 9, 0.72))",
              border: "1px solid rgba(245, 158, 11, 0.7)",
              textAlign: "right",
              transform: `scale(${0.86 + 0.14 * clamp01(bdBadgeSpring)})`,
              opacity: clamp01(bdBadgeSpring),
            }}
          >
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 17.5,
                fontWeight: 700,
                lineHeight: 1.1,
                color: "#FEF3C7",
              }}
            >
              175× MORE PEOPLE
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#6EE7B7",
              }}
            >
              IN 20.8× SMALLER LAND
            </div>
          </div>
        </div>

        {/* Middle 3-Zone Instrument Stage (Thermometer | True-Proportion Map | 175M Column) */}
        <div
          style={{
            height: 356,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxSizing: "border-box",
          }}
        >
          {/* Zone R1: Warm +28°C Monsoon Thermometer */}
          <DualScaleThermometer
            mode="monsoon"
            progress={bdThermo}
            frame={localFrame}
            uid={rawUid}
          />

          {/* Zone R2: True-Proportion Compact Bangladesh + Monsoon Rain/Ripple Rings */}
          <div
            style={{
              width: MAP_VIEW_W,
              height: MAP_VIEW_H,
              borderRadius: 14,
              background:
                "radial-gradient(circle at 42% 50%, rgba(0, 106, 78, 0.42) 0%, rgba(5, 12, 18, 0.95) 78%)",
              border: "1px solid rgba(16, 185, 129, 0.32)",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <svg
              width={MAP_VIEW_W}
              height={MAP_VIEW_H}
              viewBox={`0 0 ${MAP_VIEW_W} ${MAP_VIEW_H}`}
              style={{ display: "block" }}
            >
              <defs>
                <linearGradient
                  id={bdFillId}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#34D399" />
                  <stop offset="55%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <clipPath id={bdMapClipId}>
                  <rect x={0} y={0} width={MAP_VIEW_W} height={MAP_VIEW_H} />
                </clipPath>
                <clipPath id={bdZoomClipId}>
                  <rect x={374} y={14} width={132} height={132} rx={12} />
                </clipPath>
              </defs>

              <g clipPath={`url(#${bdMapClipId})`}>
                {/* Subtle polar/equal-area reference grid */}
                {CARTOGRAPHY.graticulePath && (
                  <path
                    d={CARTOGRAPHY.graticulePath}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.09)"
                    strokeWidth={0.75}
                  />
                )}

                {/* Ghost Yakutia outline at identical scale so 1:20.8 area ratio is unmistakable */}
                <path
                  d={CARTOGRAPHY.yakutiaFullPath}
                  fill="rgba(56, 189, 248, 0.035)"
                  stroke="rgba(56, 189, 248, 0.24)"
                  strokeWidth={1.1}
                  strokeDasharray="5 5"
                  opacity={bdDraw}
                />

                {/* Warm +28°C golden-emerald monsoon ripple rings around True-Scale Bangladesh */}
                {[0, 1, 2, 3].map((ringIdx) => {
                  const cycle = ((localFrame * 0.011 + ringIdx * 0.25) % 1 + 1) % 1;
                  const radius = 24 + cycle * 112;
                  const ringAlpha = (1 - cycle) * 0.62 * bdDraw;
                  const isGold = ringIdx % 2 === 1;
                  return (
                    <circle
                      key={ringIdx}
                      cx={CARTOGRAPHY.bdTrueDhakaPt[0]}
                      cy={CARTOGRAPHY.bdTrueDhakaPt[1]}
                      r={radius}
                      fill="none"
                      stroke={
                        isGold
                          ? TOKENS.colors.imperialAmber
                          : TOKENS.colors.bengalEmerald
                      }
                      strokeWidth={isGold ? 1.45 : 1.75}
                      strokeOpacity={ringAlpha}
                    />
                  );
                })}

                {/* Deterministic angled warm golden-emerald monsoon rain streaks */}
                {MONSOON_STREAKS.map((s) => {
                  const y =
                    ((s.baseY + localFrame * s.speed) % (MAP_VIEW_H + 24)) - 12;
                  const x =
                    (((s.baseX - localFrame * s.speed * 0.24) % MAP_VIEW_W) +
                      MAP_VIEW_W) %
                    MAP_VIEW_W;
                  return (
                    <line
                      key={s.id}
                      x1={x}
                      y1={y}
                      x2={x - s.length * 0.24}
                      y2={y + s.length}
                      stroke={s.isGold ? "#FDE68A" : "#6EE7B7"}
                      strokeWidth={1.05}
                      strokeLinecap="round"
                      strokeOpacity={s.opacity * bdDraw}
                    />
                  );
                })}

                {/* True-proportion compact emerald polygon of Bangladesh (exact 1/20.8 area) */}
                <g opacity={bdDraw}>
                  <path
                    d={CARTOGRAPHY.bdTruePath}
                    fill="none"
                    stroke={TOKENS.colors.bengalEmerald}
                    strokeWidth={8}
                    strokeOpacity={0.42}
                    strokeLinejoin="round"
                  />
                  <path
                    d={CARTOGRAPHY.bdTruePath}
                    fill={`url(#${bdFillId})`}
                    stroke="#ECFDF5"
                    strokeWidth={1.55}
                    strokeLinejoin="round"
                  />

                  {/* Greater Dhaka crimson-gold beacon on the true-scale polygon */}
                  <circle
                    cx={CARTOGRAPHY.bdTrueDhakaPt[0]}
                    cy={CARTOGRAPHY.bdTrueDhakaPt[1]}
                    r={4.2}
                    fill={TOKENS.colors.bengalCrimson}
                    stroke="#FEF3C7"
                    strokeWidth={1.3}
                  />

                  {/* True-scale bracket label */}
                  <g
                    transform={`translate(${CARTOGRAPHY.bdTrueAnchor[0]}, ${
                      CARTOGRAPHY.bdTrueAnchor[1] + 54
                    })`}
                  >
                    <rect
                      x={-84}
                      y={-11}
                      width={168}
                      height={21}
                      rx={5}
                      fill="rgba(5, 14, 14, 0.9)"
                      stroke="rgba(16, 185, 129, 0.55)"
                      strokeWidth={0.95}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill="#ECFDF5"
                      fontFamily={FONTS.mono}
                      fontSize={9}
                      fontWeight={700}
                    >
                      TRUE 1:1 SCALE · 20.8× SMALLER
                    </text>
                  </g>

                  {/* Tangent callout lines connecting True-Scale Bangladesh to Detail Zoom Lens */}
                  <line
                    x1={CARTOGRAPHY.bdTrueAnchor[0] + 24}
                    y1={CARTOGRAPHY.bdTrueAnchor[1] - 24}
                    x2={374}
                    y2={30}
                    stroke="rgba(245, 158, 11, 0.45)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={CARTOGRAPHY.bdTrueAnchor[0] + 24}
                    y1={CARTOGRAPHY.bdTrueAnchor[1] + 22}
                    x2={374}
                    y2={132}
                    stroke="rgba(16, 185, 129, 0.45)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                </g>

                {/* Top-right Delta & Greater Dhaka Optical Detail Lens */}
                <g opacity={bdDraw}>
                  <rect
                    x={374}
                    y={14}
                    width={132}
                    height={132}
                    rx={12}
                    fill="rgba(4, 14, 18, 0.92)"
                    stroke="rgba(245, 158, 11, 0.55)"
                    strokeWidth={1.2}
                  />
                  <g clipPath={`url(#${bdZoomClipId})`}>
                    <g transform="translate(378, 16)">
                      <path
                        d={CARTOGRAPHY.bdZoomPath}
                        fill="none"
                        stroke={TOKENS.colors.bengalEmerald}
                        strokeWidth={5}
                        strokeOpacity={0.34}
                      />
                      <path
                        d={CARTOGRAPHY.bdZoomPath}
                        fill={`url(#${bdFillId})`}
                        stroke="#ECFDF5"
                        strokeWidth={1.2}
                      />
                      {/* Greater Dhaka Metro radiant pulse inside zoom lens */}
                      <circle
                        cx={CARTOGRAPHY.bdZoomDhakaPt[0]}
                        cy={CARTOGRAPHY.bdZoomDhakaPt[1]}
                        r={10 + 4 * Math.sin(localFrame * 0.14)}
                        fill={TOKENS.colors.imperialAmber}
                        fillOpacity={0.28}
                      />
                      <circle
                        cx={CARTOGRAPHY.bdZoomDhakaPt[0]}
                        cy={CARTOGRAPHY.bdZoomDhakaPt[1]}
                        r={4.8}
                        fill={TOKENS.colors.bengalCrimson}
                        stroke="#FEF3C7"
                        strokeWidth={1.4}
                      />
                    </g>
                  </g>
                  <text
                    x={440}
                    y={28}
                    textAnchor="middle"
                    fill="#FDE68A"
                    fontFamily={FONTS.mono}
                    fontSize={8}
                    fontWeight={700}
                    letterSpacing="0.06em"
                  >
                    DHAKA DELTA · 24M
                  </text>
                  <text
                    x={440}
                    y={140}
                    textAnchor="middle"
                    fill="#6EE7B7"
                    fontFamily={FONTS.mono}
                    fontSize={7.5}
                    fontWeight={700}
                  >
                    DETAIL LENS
                  </text>
                </g>
              </g>
            </svg>

            {/* Top-left ghost reference tag */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 12,
                padding: "3px 8px",
                borderRadius: 5,
                background: "rgba(5, 9, 17, 0.84)",
                border: "1px solid rgba(16, 185, 129, 0.38)",
                fontFamily: FONTS.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.07em",
                color: "#6EE7B7",
              }}
            >
              DASHED GHOST = YAKUTIA SCALE
            </div>

            {/* Bottom-left live area readout */}
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 12,
                right: 12,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  padding: "6px 11px",
                  borderRadius: 8,
                  background: "rgba(5, 12, 14, 0.9)",
                  border: "1px solid rgba(16, 185, 129, 0.48)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 16.5,
                    fontWeight: 700,
                    color: TOKENS.colors.textPrimary,
                    lineHeight: 1.1,
                  }}
                >
                  {bdAreaCounter}{" "}
                  <span
                    style={{
                      fontSize: 11.5,
                      color: TOKENS.colors.bengalEmerald,
                    }}
                  >
                    km²
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 8.5,
                    letterSpacing: "0.08em",
                    color: "#6EE7B7",
                  }}
                >
                  20.8× SMALLER THAN YAKUTIA
                </div>
              </div>

              <div
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  background: "rgba(6, 46, 36, 0.88)",
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  fontFamily: FONTS.mono,
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: "#FEF3C7",
                }}
              >
                +28°C MONSOON RINGS
              </div>
            </div>
          </div>

          {/* Zone R3: Towering 175.0 MILLION Population Column */}
          <PopulationColumnBay
            mode="bangladesh"
            progress={bdColumnProgress}
            badgePop={clamp01(bdBadgeSpring)}
            uid={rawUid}
          />
        </div>

        {/* Footer Telemetry Strip of Right Panel */}
        <div
          style={{
            height: 54,
            padding: "0 20px",
            borderTop: "1px solid rgba(148, 163, 184, 0.14)",
            background: "rgba(5, 12, 16, 0.76)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            fontFamily: FONTS.mono,
            fontSize: 11,
          }}
        >
          <div>
            <span style={{ color: TOKENS.colors.textMuted }}>TERRITORY: </span>
            <span style={{ color: TOKENS.colors.textPrimary, fontWeight: 700 }}>
              148,460 km²
            </span>
          </div>
          <div>
            <span style={{ color: TOKENS.colors.textMuted }}>CLIMATE: </span>
            <span
              style={{ color: TOKENS.colors.imperialAmber, fontWeight: 700 }}
            >
              +28°C WARM MONSOON
            </span>
          </div>
          <div>
            <span style={{ color: TOKENS.colors.textMuted }}>POPULATION: </span>
            <span style={{ color: "#6EE7B7", fontWeight: 700 }}>
              175.0 MILLION
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 3 ACT 1 BRIDGE (pre-reveal equation strip inside y = 664..780)
         ===================================================================== */}
      {act1BridgeOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            top: 664,
            left: 64,
            width: 1792,
            height: 116,
            borderRadius: 14,
            background: TOKENS.colors.bgPanelGlass,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
            boxSizing: "border-box",
            opacity: act1BridgeOpacity,
            transform: `translateY(${(1 - act1BridgeEnter) * 12 - act1BridgeExit * 10}px)`,
          }}
        >
          {[
            {
              tag: "LAND AREA ASYMMETRY",
              stat: "20.8× LARGER",
              detail: "Sakha Republic (3,083,523 km²) vs. Bangladesh (148,460 km²)",
              accent: TOKENS.colors.russiaCyan,
            },
            {
              tag: "THERMAL EXTREMES",
              stat: "78°C CLIMATE GAP",
              detail: "Yakutsk -50°C Permafrost Winter vs. +28°C Bengal Monsoon Delta",
              accent: TOKENS.colors.imperialAmber,
            },
            {
              tag: "POPULATION INVERSION",
              stat: "175× MORE PEOPLE",
              detail: "175.0 Million in Bangladesh vs. 1.0 Million Across All Yakutia",
              accent: TOKENS.colors.bengalEmerald,
            },
          ].map((item, idx) => (
            <div
              key={item.tag}
              style={{
                flex: 1,
                paddingLeft: idx === 0 ? 0 : 26,
                borderLeft:
                  idx === 0 ? "none" : "1px solid rgba(148, 163, 184, 0.16)",
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.13em",
                  color: item.accent,
                }}
              >
                {item.tag}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: FONTS.display,
                  fontSize: 24,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                }}
              >
                {item.stat}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontFamily: FONTS.sans,
                  fontSize: 13,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                {item.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================================
          ROW 3 ACT 2: SECOND-HALF REVEAL BANNER (strictly y = 650..795, x = 64..1856)
          Greater Dhaka Metro (24M in one city) vs All of Siberia (36M across 13,100,000 km²)
         ===================================================================== */}
      {localFrame >= revealStartFrame - 2 && (
        <div
          style={{
            position: "absolute",
            top: 650,
            left: 64,
            width: 1792,
            height: 145,
            borderRadius: 16,
            background:
              "linear-gradient(90deg, rgba(6, 38, 31, 0.94) 0%, rgba(10, 17, 30, 0.96) 50%, rgba(8, 35, 58, 0.94) 100%)",
            border: "1.5px solid rgba(245, 158, 11, 0.55)",
            boxShadow:
              "0 20px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(254, 243, 199, 0.2)",
            padding: "12px 24px 14px",
            boxSizing: "border-box",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            opacity: clamp01(revealBannerSpring),
            transform: `translateY(${(1 - revealBannerSpring) * 22}px) scale(${
              0.985 + 0.015 * clamp01(revealBannerSpring)
            })`,
          }}
        >
          {/* Banner Header Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  padding: "3px 9px",
                  borderRadius: 5,
                  background: "rgba(245, 158, 11, 0.18)",
                  border: "1px solid rgba(245, 158, 11, 0.55)",
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "#FEF3C7",
                }}
              >
                URBAN VS. WILDERNESS REVEAL
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18.5,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                  letterSpacing: "-0.01em",
                }}
              >
                Greater Dhaka Metro (24M in One City) vs. All of Siberia (36M
                Across 13,100,000 km²)
              </span>
            </div>

            <div
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                background: "rgba(16, 185, 129, 0.16)",
                border: "1px solid rgba(16, 185, 129, 0.5)",
                fontFamily: FONTS.mono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#6EE7B7",
              }}
            >
              ONE MEGACITY = 67% OF ALL SIBERIA&apos;S PEOPLE
            </div>
          </div>

          {/* Dual Animated Urban vs Wilderness Comparison Bars */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              height: 80,
            }}
          >
            {/* LEFT BAR: GREATER DHAKA METRO (24M in one city) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 9,
                      background: TOKENS.colors.bengalCrimson,
                      boxShadow: "0 0 8px rgba(244, 42, 65, 0.8)",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 15.5,
                      fontWeight: 700,
                      color: "#FEF3C7",
                    }}
                  >
                    GREATER DHAKA METRO
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10.5,
                      color: "#6EE7B7",
                    }}
                  >
                    · IN ONE COMPACT CITY (~2,160 km²)
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 18,
                    fontWeight: 700,
                    color: TOKENS.colors.imperialAmber,
                  }}
                >
                  {dhakaMetroCounter}M{" "}
                  <span style={{ fontSize: 11, color: "#FDE68A" }}>
                    IN ONE CITY
                  </span>
                </div>
              </div>

              {/* 36M-scaled reference track where Dhaka fills 24/36 = 66.7% */}
              <div
                style={{
                  position: "relative",
                  height: 40,
                  borderRadius: 9,
                  background: "rgba(5, 13, 18, 0.88)",
                  border: "1px solid rgba(16, 185, 129, 0.42)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: `${(66.67 * dhakaBarProgress).toFixed(2)}%`,
                    height: "100%",
                    background:
                      "linear-gradient(90deg, #047857 0%, #10B981 54%, #F59E0B 100%)",
                    borderRight: "2px solid #FEF3C7",
                    overflow: "hidden",
                  }}
                >
                  {/* Deterministic illuminated hyper-dense urban blocks */}
                  {DHAKA_URBAN_CELLS.map((cell) => {
                    const glow =
                      0.55 +
                      0.45 * Math.sin(localFrame * 0.14 + cell.twinklePhase);
                    return (
                      <div
                        key={cell.id}
                        style={{
                          position: "absolute",
                          left: `${cell.xPct}%`,
                          top: `${cell.yPct}%`,
                          width: cell.wPx,
                          height: cell.hPx,
                          borderRadius: 1.5,
                          backgroundColor: cell.warm ? "#FEF3C7" : "#A7F3D0",
                          opacity: 0.34 * glow,
                        }}
                      />
                    );
                  })}

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 14,
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#04130E",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    24M PACKED INTO ONE MEGACITY · ~11,100 / km²
                  </div>
                </div>

                <div
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "#6EE7B7",
                    opacity: dhakaBarProgress,
                  }}
                >
                  66.7% OF SIBERIA SCALE
                </div>
              </div>
            </div>

            {/* CENTER VS HUB */}
            <div
              style={{
                width: 54,
                height: 62,
                borderRadius: 10,
                background: "rgba(5, 9, 17, 0.9)",
                border: "1px solid rgba(245, 158, 11, 0.45)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontFamily: FONTS.mono,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: "#FDE68A" }}>
                24M
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: TOKENS.colors.textMuted,
                  margin: "1px 0",
                }}
              >
                VS
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: TOKENS.colors.russiaCyan,
                }}
              >
                36M
              </span>
            </div>

            {/* RIGHT BAR: ALL OF SIBERIA (36M across 13,100,000 km²) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 9,
                      background: TOKENS.colors.russiaCyan,
                      boxShadow: "0 0 8px rgba(56, 189, 248, 0.8)",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 15.5,
                      fontWeight: 700,
                      color: TOKENS.colors.russiaIce,
                    }}
                  >
                    ALL OF SIBERIA
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10.5,
                      color: TOKENS.colors.russiaCyan,
                    }}
                  >
                    · ACROSS {siberiaAreaCounter} km² WILDERNESS
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 18,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaCyan,
                  }}
                >
                  {siberiaPopCounter}M{" "}
                  <span
                    style={{ fontSize: 11, color: TOKENS.colors.russiaIce }}
                  >
                    TOTAL SIBERIA
                  </span>
                </div>
              </div>

              {/* Full 36M continental wilderness bar */}
              <div
                style={{
                  position: "relative",
                  height: 40,
                  borderRadius: 9,
                  background: "rgba(5, 12, 24, 0.9)",
                  border: "1px solid rgba(56, 189, 248, 0.45)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: `${(100 * siberiaBarProgress).toFixed(2)}%`,
                    height: "100%",
                    background:
                      "linear-gradient(90deg, rgba(12, 74, 110, 0.92) 0%, rgba(14, 116, 144, 0.75) 55%, rgba(56, 189, 248, 0.62) 100%)",
                    borderRight: `2px solid ${TOKENS.colors.russiaIce}`,
                    overflow: "hidden",
                  }}
                >
                  {/* Sparse frozen taiga settlement outposts across 13.1M km² */}
                  {SIBERIA_OUTPOSTS.map((pt) => {
                    const pulse =
                      0.45 + 0.55 * Math.sin(localFrame * 0.1 + pt.phase);
                    return (
                      <div
                        key={pt.id}
                        style={{
                          position: "absolute",
                          left: `${pt.xPct}%`,
                          top: `${pt.yPct}%`,
                          width: pt.r * 2,
                          height: pt.r * 2,
                          borderRadius: pt.r * 2,
                          backgroundColor: "#E0F2FE",
                          boxShadow: "0 0 6px rgba(186, 230, 253, 0.8)",
                          opacity: 0.72 * pulse,
                        }}
                      />
                    );
                  })}

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 14px",
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#F8FAFC",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>36M SPREAD ACROSS 13,100,000 km² TAIGA & TUNDRA</span>
                    <span style={{ color: TOKENS.colors.russiaIce }}>
                      2.7 PEOPLE / km²
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default Scene03YakutiaVsBangladesh;
