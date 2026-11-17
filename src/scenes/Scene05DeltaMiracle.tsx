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
import { CHARACTERS, type CharacterId, type SceneProps, type TurnTiming } from "../types/video";

type Point2D = readonly [number, number];
type CubicSegment = readonly [Point2D, Point2D, Point2D, Point2D];

interface RiverRouteSpec {
  id: string;
  segments: readonly CubicSegment[];
  strokeWidth: number;
  glowWidth: number;
  baseColor: string;
  siltColor: string;
  dashSpeed: number;
}

interface SiltParticleSeed {
  id: number;
  routeIndex: number;
  phaseOffset: number;
  speed: number;
  radius: number;
  lateralOffset: number;
  warmMix: number;
}

interface SeasonSpec {
  id: "aus" | "aman" | "boro";
  code: string;
  title: string;
  windowLabel: string;
  badge: string;
  description: string;
  color: string;
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

interface PopDataPoint {
  year: number;
  popM: number;
  urbanM: number;
  urbanPct: number;
}

interface MilestoneSpec {
  year: number;
  popM: number;
  label: string;
  urbanPct: number;
  anchorDx: number;
  anchorDy: number;
  align: "left" | "center" | "right";
}

const BANGLADESH_SILHOUETTE_PATH = [
  "M 392 186",
  "L 448 196",
  "L 496 210",
  "L 552 226",
  "L 638 232",
  "L 730 244",
  "L 756 276",
  "L 724 326",
  "L 684 358",
  "L 696 408",
  "L 744 446",
  "L 764 510",
  "L 756 562",
  "L 730 538",
  "L 706 476",
  "L 668 468",
  "L 642 506",
  "L 604 522",
  "L 562 516",
  "L 524 526",
  "L 480 520",
  "L 436 528",
  "L 386 522",
  "L 368 466",
  "L 358 408",
  "L 342 346",
  "L 318 314",
  "L 334 278",
  "L 368 250",
  "L 362 214",
  "Z",
].join(" ");

const RIVER_ROUTES: readonly RiverRouteSpec[] = [
  {
    id: "brahmaputra-jamuna-main",
    segments: [
      [
        [636, 74],
        [708, 80],
        [764, 108],
        [754, 148],
      ],
      [
        [754, 148],
        [742, 184],
        [584, 182],
        [522, 224],
      ],
      [
        [522, 224],
        [496, 264],
        [498, 314],
        [508, 356],
      ],
      [
        [508, 356],
        [534, 374],
        [558, 388],
        [582, 404],
      ],
      [
        [582, 404],
        [594, 448],
        [600, 498],
        [606, 562],
      ],
    ],
    strokeWidth: 6.2,
    glowWidth: 18,
    baseColor: "#10B981",
    siltColor: "#F59E0B",
    dashSpeed: 1.45,
  },
  {
    id: "ganges-padma-main",
    segments: [
      [
        [146, 102],
        [192, 176],
        [246, 240],
        [338, 294],
      ],
      [
        [338, 294],
        [398, 324],
        [456, 342],
        [508, 356],
      ],
      [
        [508, 356],
        [534, 374],
        [558, 388],
        [582, 404],
      ],
      [
        [582, 404],
        [562, 448],
        [548, 498],
        [540, 558],
      ],
    ],
    strokeWidth: 5.8,
    glowWidth: 17,
    baseColor: "#10B981",
    siltColor: "#FBBF24",
    dashSpeed: 1.32,
  },
  {
    id: "meghna-eastern-estuary",
    segments: [
      [
        [844, 206],
        [790, 232],
        [734, 262],
        [682, 304],
      ],
      [
        [682, 304],
        [644, 340],
        [612, 374],
        [582, 404],
      ],
      [
        [582, 404],
        [614, 448],
        [638, 496],
        [658, 556],
      ],
    ],
    strokeWidth: 4.8,
    glowWidth: 14,
    baseColor: "#34D399",
    siltColor: "#F59E0B",
    dashSpeed: 1.24,
  },
  {
    id: "jamuna-madhumati-distributary",
    segments: [
      [
        [636, 74],
        [708, 80],
        [764, 108],
        [754, 148],
      ],
      [
        [754, 148],
        [742, 184],
        [584, 182],
        [522, 224],
      ],
      [
        [522, 224],
        [496, 264],
        [498, 314],
        [508, 356],
      ],
      [
        [508, 356],
        [480, 398],
        [462, 450],
        [448, 548],
      ],
    ],
    strokeWidth: 3.1,
    glowWidth: 10,
    baseColor: "#10B981",
    siltColor: "#FBBF24",
    dashSpeed: 1.18,
  },
  {
    id: "padma-sundarbans-west",
    segments: [
      [
        [146, 102],
        [192, 176],
        [246, 240],
        [338, 294],
      ],
      [
        [338, 294],
        [378, 314],
        [404, 340],
        [416, 376],
      ],
      [
        [416, 376],
        [406, 428],
        [398, 480],
        [392, 540],
      ],
    ],
    strokeWidth: 2.8,
    glowWidth: 9,
    baseColor: "#059669",
    siltColor: "#F59E0B",
    dashSpeed: 1.08,
  },
];

const BRAIDED_SECONDARY_BRANCHES: readonly (readonly CubicSegment[])[] = [
  // Old Brahmaputra loop through Mymensingh toward Meghna
  [
    [
      [522, 224],
      [556, 248],
      [584, 286],
      [598, 336],
    ],
    [
      [598, 336],
      [604, 364],
      [594, 386],
      [582, 404],
    ],
  ],
  // Arial Khan central delta braid
  [
    [
      [542, 378],
      [524, 424],
      [506, 476],
      [496, 548],
    ],
  ],
  // Baleshwar / Bishkhali mid-delta braid
  [
    [
      [476, 398],
      [482, 446],
      [472, 494],
      [470, 546],
    ],
  ],
  // Western Sundarbans tidal braid
  [
    [
      [416, 376],
      [432, 426],
      [424, 482],
      [418, 542],
    ],
  ],
  // Eastern Sandwip / Hatiya channel braid
  [
    [
      [582, 404],
      [602, 446],
      [622, 496],
      [632, 558],
    ],
  ],
];

const SEASONS: readonly SeasonSpec[] = [
  {
    id: "aus",
    code: "AUS",
    title: "Spring Crop",
    windowLabel: "MAR – JUN",
    badge: "CROP 01",
    description: "Early convective rains & Himalayan meltwater awaken warm silt plains.",
    color: TOKENS.colors.imperialAmber,
    startDeg: 63,
    endDeg: 177,
    midDeg: 120,
  },
  {
    id: "aman",
    code: "AMAN",
    title: "Monsoon Crop",
    windowLabel: "JUL – NOV",
    badge: "CROP 02",
    description: "1B tons of annual river silt naturally refertilize flooded rice paddies.",
    color: TOKENS.colors.bengalEmerald,
    startDeg: 183,
    endDeg: 297,
    midDeg: 240,
  },
  {
    id: "boro",
    code: "BORO",
    title: "Dry-Season Irrigated",
    windowLabel: "DEC – APR",
    badge: "55% YIELD",
    description: "Shallow delta aquifers power high-yield winter crops under sunny skies.",
    color: TOKENS.colors.russiaCyan,
    startDeg: 303,
    endDeg: 417,
    midDeg: 360,
  },
];

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] as const;

const POP_SERIES: readonly PopDataPoint[] = [
  { year: 1950, popM: 40, urbanM: 1.7, urbanPct: 4.3 },
  { year: 1960, popM: 50, urbanM: 2.6, urbanPct: 5.1 },
  { year: 1970, popM: 65, urbanM: 5.0, urbanPct: 7.6 },
  { year: 1980, popM: 80, urbanM: 11.9, urbanPct: 14.9 },
  { year: 1990, popM: 107, urbanM: 21.2, urbanPct: 19.8 },
  { year: 2000, popM: 130, urbanM: 30.7, urbanPct: 23.6 },
  { year: 2010, popM: 148, urbanM: 45.1, urbanPct: 30.5 },
  { year: 2020, popM: 166, urbanM: 63.4, urbanPct: 38.2 },
  { year: 2026, popM: 175, urbanM: 71.8, urbanPct: 41.0 },
];

const POP_MILESTONES: readonly MilestoneSpec[] = [
  {
    year: 1950,
    popM: 40,
    label: "40M (1950)",
    urbanPct: 4.3,
    anchorDx: 2,
    anchorDy: -19,
    align: "left",
  },
  {
    year: 1980,
    popM: 80,
    label: "80M (1980)",
    urbanPct: 14.9,
    anchorDx: -28,
    anchorDy: -19,
    align: "center",
  },
  {
    year: 2000,
    popM: 130,
    label: "130M (2000)",
    urbanPct: 23.6,
    anchorDx: -28,
    anchorDy: -19,
    align: "center",
  },
  {
    year: 2026,
    popM: 175,
    label: "175M (Today)",
    urbanPct: 41.0,
    anchorDx: 10,
    anchorDy: -18,
    align: "right",
  },
];

function segmentsToSvgPath(segments: readonly CubicSegment[]): string {
  if (segments.length === 0) {
    return "";
  }
  const parts: string[] = [
    `M ${segments[0][0][0].toFixed(1)} ${segments[0][0][1].toFixed(1)}`,
  ];
  for (let i = 0; i < segments.length; i += 1) {
    const [, p1, p2, p3] = segments[i];
    parts.push(
      `C ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(
        1,
      )}, ${p3[0].toFixed(1)} ${p3[1].toFixed(1)}`,
    );
  }
  return parts.join(" ");
}

function sampleRoutePoint(
  segments: readonly CubicSegment[],
  progress: number,
  lateralPx: number,
): { x: number; y: number } {
  const count = segments.length;
  if (count === 0) {
    return { x: 0, y: 0 };
  }

  const clamped = Math.max(0, Math.min(0.99999, progress));
  const scaled = clamped * count;
  const idx = Math.min(count - 1, Math.floor(scaled));
  const u = scaled - idx;
  const inv = 1 - u;

  const [p0, p1, p2, p3] = segments[idx];

  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * u;
  const b2 = 3 * inv * u * u;
  const b3 = u * u * u;

  const x = b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0];
  const y = b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1];

  const d0 = -3 * inv * inv;
  const d1 = 3 * inv * inv - 6 * inv * u;
  const d2 = 6 * inv * u - 3 * u * u;
  const d3 = 3 * u * u;

  const tx = d0 * p0[0] + d1 * p1[0] + d2 * p2[0] + d3 * p3[0];
  const ty = d0 * p0[1] + d1 * p1[1] + d2 * p2[1] + d3 * p3[1];
  const len = Math.hypot(tx, ty) || 1;

  // Fan wider as silt enters the braided delta & Bay of Bengal
  const deltaSpreadBoost = progress > 0.72 ? 1 + (progress - 0.72) * 3.4 : 1;
  const nx = -ty / len;
  const ny = tx / len;

  return {
    x: x + nx * lateralPx * deltaSpreadBoost,
    y: y + ny * lateralPx * deltaSpreadBoost,
  };
}

function polarClockPoint(cx: number, cy: number, radius: number, clockDeg: number): Point2D {
  const rad = ((clockDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function buildDonutSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const span = endDeg - startDeg;
  const largeArc = span > 180 ? 1 : 0;
  const [ox1, oy1] = polarClockPoint(cx, cy, rOuter, startDeg);
  const [ox2, oy2] = polarClockPoint(cx, cy, rOuter, endDeg);
  const [ix2, iy2] = polarClockPoint(cx, cy, rInner, endDeg);
  const [ix1, iy1] = polarClockPoint(cx, cy, rInner, startDeg);

  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function buildSmoothCurvePath(points: readonly Point2D[]): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  }

  const parts: string[] = [`M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.2;
    const c1x = p1[0] + (p2[0] - p0[0]) * tension;
    const c1y = p1[1] + (p2[1] - p0[1]) * tension;
    const c2x = p2[0] - (p3[0] - p1[0]) * tension;
    const c2y = p2[1] - (p3[1] - p1[1]) * tension;

    parts.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(
        2,
      )}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`,
    );
  }
  return parts.join(" ");
}

function samplePopAtYear(year: number): { popM: number; urbanM: number; urbanPct: number } {
  const clampedYear = Math.max(1950, Math.min(2026, year));
  for (let i = 0; i < POP_SERIES.length - 1; i += 1) {
    const a = POP_SERIES[i];
    const b = POP_SERIES[i + 1];
    if (clampedYear >= a.year && clampedYear <= b.year) {
      const span = Math.max(1, b.year - a.year);
      const t = (clampedYear - a.year) / span;
      return {
        popM: a.popM + (b.popM - a.popM) * t,
        urbanM: a.urbanM + (b.urbanM - a.urbanM) * t,
        urbanPct: a.urbanPct + (b.urbanPct - a.urbanPct) * t,
      };
    }
  }
  const last = POP_SERIES[POP_SERIES.length - 1];
  return { popM: last.popM, urbanM: last.urbanM, urbanPct: last.urbanPct };
}

function toLocalTurnFrame(turnFrame: number, sceneStartFrame: number): number {
  if (sceneStartFrame > 0 && turnFrame >= sceneStartFrame) {
    return turnFrame - sceneStartFrame;
  }
  return turnFrame;
}

export const Scene05DeltaMiracle: React.FC<SceneProps> = ({ scene, turns }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const duration = Math.max(120, scene?.durationInFrames || 450);
  const sceneStartFrame = scene?.startFrame ?? 0;

  const sceneTurns = useMemo<TurnTiming[]>(() => {
    if (!Array.isArray(turns) || turns.length === 0) {
      return [];
    }
    const matching = turns.filter((t) => t.sceneIndex === (scene?.sceneIndex ?? 5));
    const chosen = matching.length > 0 ? matching : turns;
    return chosen
      .slice()
      .sort((a, b) => a.startFrame - b.startFrame);
  }, [turns, scene?.sceneIndex]);

  // Determine beat timings synced to speech turns when available, with smooth proportional fallbacks
  const wheelBeatStart = useMemo(() => {
    if (sceneTurns.length >= 1) {
      const t0Start = toLocalTurnFrame(sceneTurns[0].startFrame, sceneStartFrame);
      const t0End = toLocalTurnFrame(sceneTurns[0].endFrame, sceneStartFrame);
      const midTurn = Math.round(t0Start + (t0End - t0Start) * 0.44);
      return Math.max(36, Math.min(Math.round(duration * 0.3), midTurn));
    }
    return Math.round(duration * 0.16);
  }, [sceneTurns, sceneStartFrame, duration]);

  const chartBeatStart = useMemo(() => {
    if (sceneTurns.length >= 3) {
      const t2Start = toLocalTurnFrame(sceneTurns[2].startFrame, sceneStartFrame);
      return Math.max(
        Math.round(duration * 0.38),
        Math.min(Math.round(duration * 0.66), t2Start - 10),
      );
    }
    return Math.round(duration * 0.44);
  }, [sceneTurns, sceneStartFrame, duration]);

  const activeSpeakerId: CharacterId = useMemo(() => {
    for (let i = 0; i < sceneTurns.length; i += 1) {
      const s = toLocalTurnFrame(sceneTurns[i].startFrame, sceneStartFrame);
      const e = toLocalTurnFrame(sceneTurns[i].endFrame, sceneStartFrame);
      if (frame >= s - 4 && frame <= e + 6) {
        return sceneTurns[i].characterId;
      }
    }
    if (frame < duration * 0.36) {
      return "rafiq";
    }
    if (frame < duration * 0.66) {
      return "noah";
    }
    return "maya";
  }, [sceneTurns, sceneStartFrame, frame, duration]);

  const activeSpeaker = CHARACTERS[activeSpeakerId] ?? CHARACTERS.rafiq;

  // Deterministic silt particle seeds generated once
  const siltParticles = useMemo<SiltParticleSeed[]>(() => {
    const items: SiltParticleSeed[] = [];
    const total = 54;
    for (let i = 0; i < total; i += 1) {
      const u1 = seededUnit(5001 + i * 37);
      const u2 = seededUnit(7103 + i * 53);
      const u3 = seededUnit(9209 + i * 71);
      const u4 = seededUnit(11317 + i * 89);
      const u5 = seededUnit(13523 + i * 101);
      items.push({
        id: i,
        routeIndex: i % RIVER_ROUTES.length,
        phaseOffset: u1,
        speed: 0.0042 + u2 * 0.0028,
        radius: 1.7 + u3 * 2.1,
        lateralOffset: (u4 - 0.5) * 8.5,
        warmMix: u5,
      });
    }
    return items;
  }, []);

  const primaryRiverPaths = useMemo(
    () => RIVER_ROUTES.map((route) => segmentsToSvgPath(route.segments)),
    [],
  );

  const secondaryBraidPaths = useMemo(
    () => BRAIDED_SECONDARY_BRANCHES.map((segs) => segmentsToSvgPath(segs)),
    [],
  );

  // Stage choreography interpolations
  const headerEntrance = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 140, mass: 0.9 },
  });

  const mapCardEntrance = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: { damping: 22, stiffness: 125, mass: 0.95 },
  });

  const agriCardEntrance = spring({
    frame: Math.max(0, frame - 11),
    fps,
    config: { damping: 22, stiffness: 125, mass: 0.95 },
  });

  const demoCardEntrance = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 22, stiffness: 125, mass: 0.95 },
  });

  // Hydrological river draw & alluvial bloom
  const riverDrawProgress = interpolate(
    frame,
    [6, Math.round(duration * 0.24)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    },
  );

  const braidDrawProgress = interpolate(
    frame,
    [Math.round(duration * 0.12), Math.round(duration * 0.31)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const alluvialFertilityGlow = interpolate(
    frame,
    [16, Math.round(duration * 0.34)],
    [0.18, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const siltCounterBillions = interpolate(
    frame,
    [14, Math.round(duration * 0.27)],
    [0, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // 3-Season Agricultural Wheel progression
  const wheelSweepTurns = interpolate(
    frame,
    [wheelBeatStart, duration - 12],
    [0, 1.65],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const needleClockDeg = (65 + wheelSweepTurns * 360) % 360;

  const activeSeasonIndex = useMemo(() => {
    if (frame < wheelBeatStart) {
      return 0;
    }
    const normalized = ((needleClockDeg % 360) + 360) % 360;
    if (normalized >= 60 && normalized < 180) {
      return 0; // AUS
    }
    if (normalized >= 180 && normalized < 300) {
      return 1; // AMAN
    }
    return 2; // BORO
  }, [frame, wheelBeatStart, needleClockDeg]);

  // Demographic Trajectory Chart (1950 -> 2026) sweep
  const chartSweepEnd = Math.max(
    chartBeatStart + 72,
    Math.min(duration - 34, chartBeatStart + Math.round(duration * 0.26)),
  );

  const chartSweepProgress = interpolate(
    frame,
    [chartBeatStart, chartSweepEnd],
    [0.03, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    },
  );

  const currentSweptYear = 1950 + chartSweepProgress * (2026 - 1950);
  const currentDemoSample = samplePopAtYear(currentSweptYear);

  // Chart coordinate geometry inside 660 x 226 SVG
  const plotLeft = 46;
  const plotRight = 622;
  const plotTop = 28;
  const plotBottom = 196;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const yMaxPopM = 190;

  const xForYear = (yr: number): number =>
    plotLeft + ((yr - 1950) / (2026 - 1950)) * plotWidth;
  const yForPopM = (popM: number): number =>
    plotBottom - (popM / yMaxPopM) * plotHeight;

  const chartPaths = useMemo(() => {
    const popPts: Point2D[] = POP_SERIES.map((d) => [
      plotLeft + ((d.year - 1950) / (2026 - 1950)) * plotWidth,
      plotBottom - (d.popM / yMaxPopM) * plotHeight,
    ]);
    const urbanPts: Point2D[] = POP_SERIES.map((d) => [
      plotLeft + ((d.year - 1950) / (2026 - 1950)) * plotWidth,
      plotBottom - (d.urbanM / yMaxPopM) * plotHeight,
    ]);

    const popLine = buildSmoothCurvePath(popPts);
    const popArea = `${popLine} L ${plotRight.toFixed(2)} ${plotBottom.toFixed(
      2,
    )} L ${plotLeft.toFixed(2)} ${plotBottom.toFixed(2)} Z`;

    const urbanLine = buildSmoothCurvePath(urbanPts);
    const urbanArea = `${urbanLine} L ${plotRight.toFixed(2)} ${plotBottom.toFixed(
      2,
    )} L ${plotLeft.toFixed(2)} ${plotBottom.toFixed(2)} Z`;

    return { popLine, popArea, urbanLine, urbanArea };
  }, [plotLeft, plotRight, plotBottom, plotWidth, plotHeight]);

  const playheadX = xForYear(currentSweptYear);
  const playheadY = yForPopM(currentDemoSample.popM);
  const playheadUrbanY = yForPopM(currentDemoSample.urbanM);

  const ambientBreath = 0.5 + 0.5 * Math.sin(frame * 0.055);
  const confluencePulse = 0.5 + 0.5 * Math.sin(frame * 0.12);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Full-canvas atmospheric backdrop (background only; zero UI outside safe zone) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: [
            `radial-gradient(920px 560px at 34% 48%, rgba(16, 185, 129, ${(
              0.11 +
              0.04 * ambientBreath
            ).toFixed(3)}) 0%, rgba(0, 106, 78, 0.04) 52%, rgba(5, 9, 17, 0) 100%)`,
            `radial-gradient(760px 380px at 36% 10%, rgba(56, 189, 248, 0.08) 0%, rgba(5, 9, 17, 0) 70%)`,
            `radial-gradient(700px 520px at 80% 56%, rgba(245, 158, 11, 0.07) 0%, rgba(5, 9, 17, 0) 72%)`,
            `linear-gradient(180deg, #050911 0%, #07101C 52%, #050911 100%)`,
          ].join(", "),
        }}
      />

      {/* Subtle architectural coordinate grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          opacity: 0.34,
          pointerEvents: "none",
        }}
      />

      {/* STRICT SAFE-ZONE STAGE: top 88..808 (height 720), left 64..1856 (width 1792) */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          width: 1792,
          height: 720,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        {/* TOP EDITORIAL HEADER STRIP (height: 72px) */}
        <div
          style={{
            height: 72,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            opacity: interpolate(headerEntrance, [0, 1], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${interpolate(headerEntrance, [0, 1], [12, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }).toFixed(2)}px)`,
          }}
        >
          {/* Left: Eyebrow + Main Scene Headline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.bengalEmerald,
                  boxShadow: "0 0 10px rgba(16, 185, 129, 0.75)",
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: "0.11em",
                  color: TOKENS.colors.bengalEmerald,
                  textTransform: "uppercase",
                }}
              >
                HYDROLOGICAL CARRYING CAPACITY · 23.7°N 90.4°E
              </span>
              <span
                style={{
                  color: "rgba(148, 163, 184, 0.4)",
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                }}
              >
                |
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  color: TOKENS.colors.textSecondary,
                }}
              >
                WHY 148,460 KM² SUSTAINS 175 MILLION PEOPLE
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 14,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontFamily: FONTS.serif,
                  fontSize: 40,
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                  color: TOKENS.colors.textPrimary,
                }}
              >
                The Ganges–Brahmaputra–Meghna{" "}
                <span
                  style={{
                    fontStyle: "italic",
                    color: TOKENS.colors.imperialAmber,
                  }}
                >
                  Mega-Delta Engine
                </span>
              </h1>
            </div>
          </div>

          {/* Right: 3 Compact Quantitative Pillars + Active Speaker Telemetry */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                background: TOKENS.colors.bgPanelGlass,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  color: TOKENS.colors.textMuted,
                }}
              >
                DELTA FOOTPRINT
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 17,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                148,460 km²{" "}
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: TOKENS.colors.bengalEmerald,
                  }}
                >
                  · 68% Arable
                </span>
              </span>
            </div>

            <div
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                background: TOKENS.colors.bgPanelGlass,
                border: "1px solid rgba(245, 158, 11, 0.34)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  color: TOKENS.colors.imperialAmber,
                }}
              >
                HIMALAYAN SILT FLUX
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 17,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {siltCounterBillions.toFixed(1)}B Tons{" "}
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: TOKENS.colors.imperialAmber,
                  }}
                >
                  / Year
                </span>
              </span>
            </div>

            <div
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                background: "rgba(11, 19, 33, 0.9)",
                border: `1px solid ${activeSpeaker.accentColor}66`,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: activeSpeaker.accentColor,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: activeSpeaker.accentColor,
                  }}
                >
                  {activeSpeaker.originTag}
                </span>
              </div>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 17,
                  fontWeight: 700,
                  color: TOKENS.colors.textPrimary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                175M People{" "}
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  · 3× Crops
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* MAIN BODY GRID (height: 634px; 72 + 14 + 634 = 720px strictly inside 88..808) */}
        <div
          style={{
            width: "100%",
            height: 634,
            display: "flex",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          {/* LEFT / CENTER — ANIMATED HYDROLOGICAL CONFLUENCE DIAGRAM (1068 x 634) */}
          <div
            style={{
              position: "relative",
              width: 1068,
              height: 634,
              borderRadius: 20,
              background:
                "linear-gradient(180deg, rgba(9, 17, 30, 0.92) 0%, rgba(6, 13, 24, 0.95) 72%, rgba(5, 18, 29, 0.96) 100%)",
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              boxShadow:
                "0 20px 50px rgba(2, 6, 14, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
              overflow: "hidden",
              flexShrink: 0,
              opacity: interpolate(mapCardEntrance, [0, 1], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${interpolate(mapCardEntrance, [0, 1], [16, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }).toFixed(2)}px)`,
            }}
          >
            <svg
              width={1068}
              height={634}
              viewBox="0 0 1068 634"
              style={{ display: "block" }}
            >
              <defs>
                <radialGradient id="s05-alluvial-plain-fill" cx="52%" cy="56%" r="58%">
                  <stop
                    offset="0%"
                    stopColor="#10B981"
                    stopOpacity={0.36 * alluvialFertilityGlow}
                  />
                  <stop
                    offset="52%"
                    stopColor="#006A4E"
                    stopOpacity={0.34 * alluvialFertilityGlow}
                  />
                  <stop
                    offset="84%"
                    stopColor="#F59E0B"
                    stopOpacity={0.14 * alluvialFertilityGlow}
                  />
                  <stop offset="100%" stopColor="#071518" stopOpacity={0.18} />
                </radialGradient>

                <linearGradient id="s05-himalaya-ridge" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#E0F2FE" stopOpacity={0.42} />
                  <stop offset="38%" stopColor="#38BDF8" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#0A1628" stopOpacity={0.02} />
                </linearGradient>

                <linearGradient id="s05-river-arterial" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#7DD3FC" />
                  <stop offset="28%" stopColor="#10B981" />
                  <stop offset="76%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>

                <radialGradient id="s05-bay-plume" cx="50%" cy="6%" r="78%">
                  <stop
                    offset="0%"
                    stopColor="#F59E0B"
                    stopOpacity={0.44 * braidDrawProgress}
                  />
                  <stop
                    offset="38%"
                    stopColor="#10B981"
                    stopOpacity={0.28 * braidDrawProgress}
                  />
                  <stop
                    offset="74%"
                    stopColor="#0EA5E9"
                    stopOpacity={0.12 * braidDrawProgress}
                  />
                  <stop offset="100%" stopColor="#061524" stopOpacity={0} />
                </radialGradient>

                <linearGradient id="s05-bay-water" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#061A2B" stopOpacity={0.82} />
                  <stop offset="100%" stopColor="#040D18" stopOpacity={0.96} />
                </linearGradient>
              </defs>

              {/* Cartographic Graticule Lines & Coordinate Ticks */}
              {[136, 268, 400, 524].map((gy, idx) => {
                const latLabels = ["28°N", "26°N", "24°N", "22°N"];
                return (
                  <g key={`lat-${gy}`}>
                    <line
                      x1={0}
                      y1={gy}
                      x2={1068}
                      y2={gy}
                      stroke="rgba(148, 163, 184, 0.09)"
                      strokeWidth={1}
                      strokeDasharray="4 6"
                    />
                    <text
                      x={16}
                      y={gy - 6}
                      fill="rgba(148, 163, 184, 0.45)"
                      fontFamily={FONTS.mono}
                      fontSize={10}
                    >
                      {latLabels[idx]}
                    </text>
                  </g>
                );
              })}

              {[220, 480, 740, 960].map((gx, idx) => {
                const lonLabels = ["88°E", "90°E", "92°E", "94°E"];
                return (
                  <g key={`lon-${gx}`}>
                    <line
                      x1={gx}
                      y1={0}
                      x2={gx}
                      y2={634}
                      stroke="rgba(148, 163, 184, 0.08)"
                      strokeWidth={1}
                      strokeDasharray="4 6"
                    />
                    <text
                      x={gx + 6}
                      y={624}
                      fill="rgba(148, 163, 184, 0.42)"
                      fontFamily={FONTS.mono}
                      fontSize={10}
                    >
                      {lonLabels[idx]}
                    </text>
                  </g>
                );
              })}

              {/* Bay of Bengal Ocean Basin at bottom */}
              <path
                d="M 0 526 Q 270 508, 540 522 T 1068 536 L 1068 634 L 0 634 Z"
                fill="url(#s05-bay-water)"
              />
              {/* Bathymetry shelf contours in Bay of Bengal */}
              <path
                d="M 290 548 Q 535 588, 765 552"
                fill="none"
                stroke="rgba(56, 189, 248, 0.14)"
                strokeWidth={1.2}
                strokeDasharray="6 6"
              />
              <path
                d="M 250 578 Q 540 624, 805 582"
                fill="none"
                stroke="rgba(56, 189, 248, 0.1)"
                strokeWidth={1}
                strokeDasharray="4 8"
              />

              {/* Submarine Alluvial Silt Plume fanning into Bay of Bengal */}
              <ellipse
                cx={542}
                cy={548}
                rx={218 * (0.65 + 0.35 * braidDrawProgress)}
                ry={86 * (0.6 + 0.4 * braidDrawProgress)}
                fill="url(#s05-bay-plume)"
              />

              {/* HIMALAYAN ARC — Layered Elevation Contours & Faceted Snow Peaks */}
              <path
                d="M 48 124 Q 498 10, 992 128 L 992 162 Q 498 62, 48 158 Z"
                fill="url(#s05-himalaya-ridge)"
              />
              <path
                d="M 56 122 Q 498 16, 986 126"
                fill="none"
                stroke="rgba(186, 230, 253, 0.55)"
                strokeWidth={2}
              />
              <path
                d="M 88 142 Q 498 44, 954 146"
                fill="none"
                stroke="rgba(56, 189, 248, 0.24)"
                strokeWidth={1.2}
                strokeDasharray="5 5"
              />

              {/* Stylized Faceted Himalayan Peaks along the Arc */}
              {[
                { cx: 162, baseY: 112, h: 28, w: 38 },
                { cx: 238, baseY: 96, h: 34, w: 44 },
                { cx: 326, baseY: 82, h: 42, w: 54 },
                { cx: 424, baseY: 72, h: 46, w: 58 },
                { cx: 528, baseY: 68, h: 44, w: 56 },
                { cx: 632, baseY: 74, h: 38, w: 48 },
                { cx: 734, baseY: 88, h: 34, w: 44 },
                { cx: 836, baseY: 104, h: 28, w: 38 },
              ].map((pk) => (
                <g key={`peak-${pk.cx}`}>
                  {/* Sunlit West Facet */}
                  <polygon
                    points={`${pk.cx - pk.w / 2},${pk.baseY} ${pk.cx},${
                      pk.baseY - pk.h
                    } ${pk.cx + 3},${pk.baseY}`}
                    fill="rgba(224, 242, 254, 0.34)"
                  />
                  {/* Shadowed East Facet */}
                  <polygon
                    points={`${pk.cx},${pk.baseY - pk.h} ${pk.cx + pk.w / 2},${
                      pk.baseY
                    } ${pk.cx + 3},${pk.baseY}`}
                    fill="rgba(56, 189, 248, 0.18)"
                  />
                  {/* Snow Ridge Crest */}
                  <polyline
                    points={`${pk.cx - pk.w * 0.24},${pk.baseY - pk.h * 0.5} ${pk.cx},${
                      pk.baseY - pk.h
                    } ${pk.cx + pk.w * 0.24},${pk.baseY - pk.h * 0.48}`}
                    fill="none"
                    stroke="rgba(248, 250, 252, 0.72)"
                    strokeWidth={1.4}
                  />
                </g>
              ))}

              {/* Shillong / Meghalaya Escarpment Topographic Contour (deflects Brahmaputra & funnels monsoon into Meghna) */}
              <ellipse
                cx={642}
                cy={206}
                rx={76}
                ry={20}
                fill="rgba(148, 163, 184, 0.06)"
                stroke="rgba(148, 163, 184, 0.22)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={642}
                y={209}
                textAnchor="middle"
                fill="rgba(203, 213, 225, 0.56)"
                fontFamily={FONTS.mono}
                fontSize={8.5}
                letterSpacing="0.08em"
              >
                SHILLONG ESCARPMENT
              </text>

              {/* BANGLADESH ALLUVIAL PLAIN SILHOUETTE (148,460 km²) */}
              <g>
                {/* Soft emerald-gold alluvial bloom behind Bangladesh borders */}
                <ellipse
                  cx={534}
                  cy={386}
                  rx={206}
                  ry={168}
                  fill={`rgba(16, 185, 129, ${(0.09 * alluvialFertilityGlow).toFixed(3)})`}
                />

                <path
                  d={BANGLADESH_SILHOUETTE_PATH}
                  fill="url(#s05-alluvial-plain-fill)"
                  stroke="rgba(16, 185, 129, 0.72)"
                  strokeWidth={1.8}
                />

                {/* Inner fertile plain contour ring */}
                <path
                  d={BANGLADESH_SILHOUETTE_PATH}
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.24)"
                  strokeWidth={4}
                  strokeDasharray="3 8"
                  opacity={alluvialFertilityGlow}
                />
              </g>

              {/* SECONDARY BRAIDED DELTA DISTRIBUTARIES */}
              {secondaryBraidPaths.map((dPath, idx) => (
                <g key={`braid-sec-${idx}`} opacity={braidDrawProgress}>
                  <path
                    d={dPath}
                    fill="none"
                    stroke="rgba(16, 185, 129, 0.24)"
                    strokeWidth={6}
                    strokeLinecap="round"
                  />
                  <path
                    d={dPath}
                    fill="none"
                    stroke="#34D399"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - braidDrawProgress}
                  />
                  <path
                    d={dPath}
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.65)"
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    strokeDasharray="6 16"
                    strokeDashoffset={-frame * 1.15}
                  />
                </g>
              ))}

              {/* PRIMARY ARTERIAL RIVERS: Brahmaputra (Jamuna), Ganges (Padma), Meghna */}
              {RIVER_ROUTES.map((route, idx) => {
                const dPath = primaryRiverPaths[idx];
                return (
                  <g key={route.id}>
                    {/* Wide alluvial valley glow */}
                    <path
                      d={dPath}
                      fill="none"
                      stroke={route.baseColor}
                      strokeOpacity={0.18 * riverDrawProgress}
                      strokeWidth={route.glowWidth}
                      strokeLinecap="round"
                    />
                    {/* River trunk body revealed via pathLength */}
                    <path
                      d={dPath}
                      fill="none"
                      stroke="url(#s05-river-arterial)"
                      strokeWidth={route.strokeWidth}
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - riverDrawProgress}
                    />
                    {/* Animated golden-emerald silt current dashes flowing downstream */}
                    <path
                      d={dPath}
                      fill="none"
                      stroke={route.siltColor}
                      strokeOpacity={0.78 * riverDrawProgress}
                      strokeWidth={Math.max(1.5, route.strokeWidth * 0.42)}
                      strokeLinecap="round"
                      strokeDasharray="12 22"
                      strokeDashoffset={-frame * route.dashSpeed}
                    />
                  </g>
                );
              })}

              {/* DETERMINISTIC TRAVELLING GOLDEN-EMERALD SILT MOTES */}
              <g opacity={interpolate(riverDrawProgress, [0.25, 0.9], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}>
                {siltParticles.map((p) => {
                  const route = RIVER_ROUTES[p.routeIndex];
                  const t = (p.phaseOffset + frame * p.speed) % 1;
                  if (t > riverDrawProgress) {
                    return null;
                  }
                  const pos = sampleRoutePoint(route.segments, t, p.lateralOffset);
                  const edgeFade =
                    t < 0.08
                      ? t / 0.08
                      : t > 0.9
                        ? (1 - t) / 0.1
                        : 1;
                  const isGolden = t > 0.32 || p.warmMix > 0.42;
                  const coreColor = isGolden ? "#FBBF24" : "#34D399";
                  const haloColor = isGolden ? "#F59E0B" : "#10B981";

                  return (
                    <g key={`silt-mote-${p.id}`} opacity={0.92 * edgeFade}>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={p.radius * 2.4}
                        fill={haloColor}
                        opacity={0.24}
                      />
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={p.radius}
                        fill={coreColor}
                      />
                    </g>
                  );
                })}
              </g>

              {/* HYDROLOGICAL CONFLUENCE NODES & DHAKA WATERSHED PIN */}
              {/* 1. Goalundo Confluence: Padma + Jamuna */}
              <g opacity={riverDrawProgress}>
                <circle
                  cx={508}
                  cy={356}
                  r={11 + 4 * confluencePulse}
                  fill="rgba(245, 158, 11, 0.18)"
                  stroke="rgba(245, 158, 11, 0.55)"
                  strokeWidth={1.2}
                />
                <circle
                  cx={508}
                  cy={356}
                  r={4.5}
                  fill="#FBBF24"
                  stroke="#050911"
                  strokeWidth={1.5}
                />
              </g>

              {/* 2. Chandpur Confluence: Padma + Meghna */}
              <g opacity={riverDrawProgress}>
                <circle
                  cx={582}
                  cy={404}
                  r={12 + 4.5 * confluencePulse}
                  fill="rgba(16, 185, 129, 0.22)"
                  stroke="rgba(52, 211, 153, 0.65)"
                  strokeWidth={1.3}
                />
                <circle
                  cx={582}
                  cy={404}
                  r={5}
                  fill="#10B981"
                  stroke="#F8FAFC"
                  strokeWidth={1.5}
                />
              </g>

              {/* 3. Dhaka Metro Hub Marker (24M residents right at the delta heart) */}
              <g opacity={braidDrawProgress}>
                <circle
                  cx={554}
                  cy={346}
                  r={3.8}
                  fill={TOKENS.colors.bengalCrimson}
                  stroke="#F8FAFC"
                  strokeWidth={1.3}
                />
                <rect
                  x={563}
                  y={334}
                  width={94}
                  height={20}
                  rx={5}
                  fill="rgba(5, 9, 17, 0.84)"
                  stroke="rgba(244, 42, 65, 0.55)"
                  strokeWidth={1}
                />
                <text
                  x={610}
                  y={348}
                  textAnchor="middle"
                  fill="#F8FAFC"
                  fontFamily={FONTS.mono}
                  fontSize={9.5}
                  fontWeight={700}
                >
                  DHAKA · 24M
                </text>
              </g>

              {/* CARTOGRAPHIC CALLOUT LABELS (Collision-Checked Coordinates) */}
              {/* Top Arc Banner: HIMALAYAN ARC */}
              <g>
                <rect
                  x={354}
                  y={16}
                  width={360}
                  height={30}
                  rx={15}
                  fill="rgba(6, 14, 26, 0.88)"
                  stroke="rgba(186, 230, 253, 0.38)"
                  strokeWidth={1}
                />
                <text
                  x={534}
                  y={35}
                  textAnchor="middle"
                  fill={TOKENS.colors.russiaIce}
                  fontFamily={FONTS.mono}
                  fontSize={11}
                  fontWeight={700}
                  letterSpacing="0.1em"
                >
                  HIMALAYAN ARC · SNOWMELT CATCHMENT
                </text>
              </g>

              {/* River 1 Label: GANGES (PADMA) — West */}
              <g opacity={riverDrawProgress}>
                <line
                  x1={236}
                  y1={270}
                  x2={282}
                  y2={266}
                  stroke="rgba(52, 211, 153, 0.68)"
                  strokeWidth={1.3}
                />
                <circle cx={282} cy={266} r={3} fill="#34D399" />
                <rect
                  x={28}
                  y={246}
                  width={208}
                  height={48}
                  rx={10}
                  fill="rgba(7, 15, 27, 0.9)"
                  stroke="rgba(16, 185, 129, 0.48)"
                  strokeWidth={1}
                />
                <text
                  x={42}
                  y={267}
                  fill={TOKENS.colors.textPrimary}
                  fontFamily={FONTS.display}
                  fontSize={13.5}
                  fontWeight={700}
                  letterSpacing="0.03em"
                >
                  GANGES (PADMA)
                </text>
                <text
                  x={42}
                  y={284}
                  fill={TOKENS.colors.bengalEmerald}
                  fontFamily={FONTS.mono}
                  fontSize={10}
                  fontWeight={500}
                >
                  Western Glacial-Alluvial Trunk
                </text>
              </g>

              {/* River 2 Label: BRAHMAPUTRA (JAMUNA) — North/East + trunk tag */}
              <g opacity={riverDrawProgress}>
                <line
                  x1={792}
                  y1={142}
                  x2={754}
                  y2={148}
                  stroke="rgba(251, 191, 36, 0.72)"
                  strokeWidth={1.3}
                />
                <circle cx={754} cy={148} r={3} fill="#FBBF24" />
                <rect
                  x={792}
                  y={118}
                  width={250}
                  height={48}
                  rx={10}
                  fill="rgba(7, 15, 27, 0.9)"
                  stroke="rgba(245, 158, 11, 0.5)"
                  strokeWidth={1}
                />
                <text
                  x={806}
                  y={139}
                  fill={TOKENS.colors.textPrimary}
                  fontFamily={FONTS.display}
                  fontSize={13.5}
                  fontWeight={700}
                  letterSpacing="0.03em"
                >
                  BRAHMAPUTRA (JAMUNA)
                </text>
                <text
                  x={806}
                  y={156}
                  fill={TOKENS.colors.imperialAmber}
                  fontFamily={FONTS.mono}
                  fontSize={10}
                  fontWeight={500}
                >
                  Tibetan Gorge · Highest Silt Load
                </text>

                {/* Inline trunk tag along Jamuna inside northern Bangladesh */}
                <rect
                  x={402}
                  y={258}
                  width={84}
                  height={20}
                  rx={5}
                  fill="rgba(6, 13, 24, 0.84)"
                  stroke="rgba(245, 158, 11, 0.42)"
                  strokeWidth={1}
                />
                <text
                  x={444}
                  y={272}
                  textAnchor="middle"
                  fill="#FDE68A"
                  fontFamily={FONTS.mono}
                  fontSize={9.5}
                  fontWeight={700}
                >
                  JAMUNA
                </text>
              </g>

              {/* River 3 Label: MEGHNA — East */}
              <g opacity={riverDrawProgress}>
                <line
                  x1={784}
                  y1={310}
                  x2={682}
                  y2={304}
                  stroke="rgba(52, 211, 153, 0.68)"
                  strokeWidth={1.3}
                />
                <circle cx={682} cy={304} r={3} fill="#34D399" />
                <rect
                  x={784}
                  y={286}
                  width={236}
                  height={48}
                  rx={10}
                  fill="rgba(7, 15, 27, 0.9)"
                  stroke="rgba(52, 211, 153, 0.48)"
                  strokeWidth={1}
                />
                <text
                  x={798}
                  y={307}
                  fill={TOKENS.colors.textPrimary}
                  fontFamily={FONTS.display}
                  fontSize={13.5}
                  fontWeight={700}
                  letterSpacing="0.03em"
                >
                  MEGHNA
                </text>
                <text
                  x={798}
                  y={324}
                  fill="#34D399"
                  fontFamily={FONTS.mono}
                  fontSize={10}
                  fontWeight={500}
                >
                  Sylhet Basin · Peak Monsoon Flow
                </text>
              </g>

              {/* Braided Bengal Mega-Delta & Bay of Bengal Labels */}
              <g opacity={braidDrawProgress}>
                <rect
                  x={404}
                  y={538}
                  width={260}
                  height={26}
                  rx={13}
                  fill="rgba(5, 14, 24, 0.88)"
                  stroke="rgba(16, 185, 129, 0.56)"
                  strokeWidth={1}
                />
                <text
                  x={534}
                  y={555}
                  textAnchor="middle"
                  fill="#ECFDF5"
                  fontFamily={FONTS.mono}
                  fontSize={10.5}
                  fontWeight={700}
                  letterSpacing="0.09em"
                >
                  BENGAL MEGA-DELTA · ESTUARY
                </text>
              </g>

              <text
                x={534}
                y={604}
                textAnchor="middle"
                fill="rgba(186, 230, 253, 0.72)"
                fontFamily={FONTS.display}
                fontSize={13}
                fontWeight={700}
                letterSpacing="0.34em"
              >
                BAY OF BENGAL
              </text>

              {/* Top-left Map Telemetry Badge */}
              <g>
                <text
                  x={22}
                  y={32}
                  fill={TOKENS.colors.textSecondary}
                  fontFamily={FONTS.mono}
                  fontSize={10.5}
                  fontWeight={700}
                  letterSpacing="0.08em"
                >
                  HYDROLOGICAL CONFLUENCE MAP
                </text>
                <text
                  x={22}
                  y={48}
                  fill={TOKENS.colors.textMuted}
                  fontFamily={FONTS.mono}
                  fontSize={9.5}
                >
                  3 Rivers → 148,460 km² Alluvial Plain
                </text>
              </g>

              {/* Top-right Compass & Scale Bar */}
              <g transform="translate(952, 22)">
                <circle
                  cx={78}
                  cy={16}
                  r={13}
                  fill="rgba(8, 16, 28, 0.85)"
                  stroke="rgba(226, 232, 240, 0.24)"
                  strokeWidth={1}
                />
                <polygon points="78,5 81,16 78,14 75,16" fill={TOKENS.colors.imperialAmber} />
                <text
                  x={78}
                  y={26}
                  textAnchor="middle"
                  fill={TOKENS.colors.textSecondary}
                  fontFamily={FONTS.mono}
                  fontSize={7.5}
                  fontWeight={700}
                >
                  N
                </text>
                <line
                  x1={0}
                  y1={22}
                  x2={54}
                  y2={22}
                  stroke="rgba(203, 213, 225, 0.65)"
                  strokeWidth={1.5}
                />
                <line x1={0} y1={18} x2={0} y2={26} stroke="rgba(203, 213, 225, 0.65)" />
                <line x1={54} y1={18} x2={54} y2={26} stroke="rgba(203, 213, 225, 0.65)" />
                <text
                  x={27}
                  y={14}
                  textAnchor="middle"
                  fill={TOKENS.colors.textMuted}
                  fontFamily={FONTS.mono}
                  fontSize={8.5}
                >
                  200 KM
                </text>
              </g>
            </svg>

            {/* HERO CALLOUT PLAQUE (Bottom-Left of Map, zero river collision) */}
            <div
              style={{
                position: "absolute",
                left: 20,
                bottom: 18,
                width: 340,
                padding: "12px 16px",
                borderRadius: 14,
                background: "rgba(6, 12, 22, 0.90)",
                border: "1px solid rgba(245, 158, 11, 0.44)",
                boxShadow: "0 14px 32px rgba(2, 6, 14, 0.65)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
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
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.09em",
                    color: TOKENS.colors.imperialAmber,
                  }}
                >
                  ALLUVIAL FERTILITY ENGINE
                </span>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    color: TOKENS.colors.bengalEmerald,
                  }}
                >
                  WORLD&apos;S #1 DELTA
                </span>
              </div>

              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 21,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: TOKENS.colors.textPrimary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {siltCounterBillions.toFixed(1)} BILLION TONS{" "}
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    fontFamily: FONTS.mono,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    color: TOKENS.colors.imperialAmber,
                    marginTop: 2,
                  }}
                >
                  OF NUTRIENT SILT / YEAR
                </span>
              </div>

              <div
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 11.5,
                  lineHeight: 1.35,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                Mineral-rich Himalayan sediment renews delta topsoil every monsoon across
                148,460 km².
              </div>
            </div>

            {/* BOTTOM-RIGHT DELTA DENSITY INSIGHT PLAQUE (zero coast collision) */}
            <div
              style={{
                position: "absolute",
                right: 20,
                bottom: 18,
                width: 266,
                padding: "11px 14px",
                borderRadius: 14,
                background: "rgba(6, 12, 22, 0.88)",
                border: "1px solid rgba(16, 185, 129, 0.42)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: TOKENS.colors.bengalEmerald,
                }}
              >
                SOIL VS. PERMAFROST CONTRAST
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 20,
                    fontWeight: 700,
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  ~68% Cultivable
                </span>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    color: TOKENS.colors.russiaCyan,
                  }}
                >
                  vs 7% Russia
                </span>
              </div>
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 11.5,
                  lineHeight: 1.32,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                Warm +28°C alluvial plains convert compact land into unmatched caloric yield.
              </span>
            </div>
          </div>

          {/* RIGHT PANEL — TWO STACKED DATA MODULES (700 x 634) */}
          <div
            style={{
              width: 700,
              height: 634,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 20,
              flexShrink: 0,
            }}
          >
            {/* MODULE 1: 3-SEASON AGRICULTURAL WHEEL / CYCLE (700 x 307) */}
            <div
              style={{
                width: 700,
                height: 307,
                borderRadius: 18,
                background: TOKENS.colors.bgCardElevated,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                boxShadow:
                  "0 18px 42px rgba(2, 6, 14, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                padding: "15px 20px 14px 20px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                overflow: "hidden",
                opacity: interpolate(agriCardEntrance, [0, 1], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                transform: `translateY(${interpolate(agriCardEntrance, [0, 1], [16, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }).toFixed(2)}px)`,
              }}
            >
              {/* Module 1 Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.09em",
                      color: TOKENS.colors.imperialAmber,
                    }}
                  >
                    MODULE 01 · TRIPLE-CROPPING RICE ENGINE
                  </span>
                  <div
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 19,
                      fontWeight: 700,
                      color: TOKENS.colors.textPrimary,
                    }}
                  >
                    3 Rice Harvests Per Year{" "}
                    <span
                      style={{
                        fontFamily: FONTS.sans,
                        fontSize: 13,
                        fontWeight: 500,
                        color: TOKENS.colors.textSecondary,
                      }}
                    >
                      · Aus · Aman · Boro
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(16, 185, 129, 0.14)",
                    border: "1px solid rgba(16, 185, 129, 0.42)",
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: TOKENS.colors.bengalEmerald,
                    whiteSpace: "nowrap",
                  }}
                >
                  365-DAY FROST-FREE
                </div>
              </div>

              {/* Module 1 Body: Radial Wheel on Left + 3 Season Cards on Right */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 18,
                  height: 226,
                }}
              >
                {/* Radial Agricultural Dial (222 x 222) */}
                <svg
                  width={222}
                  height={222}
                  viewBox="0 0 222 222"
                  style={{ flexShrink: 0, display: "block" }}
                >
                  {/* Outer calendar guide ring */}
                  <circle
                    cx={111}
                    cy={111}
                    r={102}
                    fill="rgba(5, 10, 19, 0.65)"
                    stroke="rgba(148, 163, 184, 0.16)"
                    strokeWidth={1}
                  />

                  {/* 12 Month Ticks */}
                  {MONTH_LABELS.map((mLabel, mIdx) => {
                    const deg = mIdx * 30 + 15;
                    const [mx, my] = polarClockPoint(111, 111, 95, deg);
                    return (
                      <text
                        key={`month-${mIdx}`}
                        x={mx}
                        y={my + 3}
                        textAnchor="middle"
                        fill="rgba(148, 163, 184, 0.58)"
                        fontFamily={FONTS.mono}
                        fontSize={8.5}
                        fontWeight={700}
                      >
                        {mLabel}
                      </text>
                    );
                  })}

                  {/* 3 Seasonal Arc Sectors: AUS, AMAN, BORO */}
                  {SEASONS.map((season, sIdx) => {
                    const reveal = interpolate(
                      frame,
                      [wheelBeatStart + sIdx * 16 - 12, wheelBeatStart + sIdx * 16 + 14],
                      [0.32, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      },
                    );
                    const isHighlighted =
                      frame >= wheelBeatStart && activeSeasonIndex === sIdx;
                    const rOuter = isHighlighted ? 86 : 83;
                    const sectorPath = buildDonutSectorPath(
                      111,
                      111,
                      53,
                      rOuter,
                      season.startDeg,
                      season.endDeg,
                    );

                    return (
                      <path
                        key={`arc-${season.id}`}
                        d={sectorPath}
                        opacity={reveal}
                        fill={season.color}
                        fillOpacity={isHighlighted ? 0.42 : 0.22}
                        stroke={season.color}
                        strokeOpacity={isHighlighted ? 0.96 : 0.58}
                        strokeWidth={isHighlighted ? 2 : 1.2}
                      />
                    );
                  })}

                  {/* Rotating Seasonal Sweep Hand (underneath pills so text never occludes) */}
                  {(() => {
                    const [nx, ny] = polarClockPoint(111, 111, 86, needleClockDeg);
                    const activeColor = SEASONS[activeSeasonIndex].color;
                    return (
                      <g
                        opacity={interpolate(
                          frame,
                          [wheelBeatStart - 10, wheelBeatStart + 10],
                          [0.25, 1],
                          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                        )}
                      >
                        <line
                          x1={111}
                          y1={111}
                          x2={nx}
                          y2={ny}
                          stroke={activeColor}
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                        <circle cx={nx} cy={ny} r={4} fill={activeColor} />
                      </g>
                    );
                  })()}

                  {/* 3 Crisp Horizontal Season Code Badges on top of arcs & sweep hand */}
                  {SEASONS.map((season, sIdx) => {
                    const reveal = interpolate(
                      frame,
                      [wheelBeatStart + sIdx * 16 - 12, wheelBeatStart + sIdx * 16 + 14],
                      [0.45, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      },
                    );
                    const [lx, ly] = polarClockPoint(111, 111, 69, season.midDeg);
                    return (
                      <g key={`pill-${season.id}`} opacity={reveal}>
                        <rect
                          x={lx - 21}
                          y={ly - 8.5}
                          width={42}
                          height={17}
                          rx={5}
                          fill="rgba(5, 9, 17, 0.92)"
                          stroke={season.color}
                          strokeWidth={1}
                        />
                        <text
                          x={lx}
                          y={ly + 3.5}
                          textAnchor="middle"
                          fill="#F8FAFC"
                          fontFamily={FONTS.mono}
                          fontSize={9.5}
                          fontWeight={700}
                        >
                          {season.code}
                        </text>
                      </g>
                    );
                  })}

                  {/* Inner Hub */}
                  <circle
                    cx={111}
                    cy={111}
                    r={45}
                    fill="#060D19"
                    stroke="rgba(226, 232, 240, 0.22)"
                    strokeWidth={1.3}
                  />
                  <text
                    x={111}
                    y={109}
                    textAnchor="middle"
                    fill={TOKENS.colors.textPrimary}
                    fontFamily={FONTS.display}
                    fontSize={27}
                    fontWeight={700}
                  >
                    3×
                  </text>
                  <text
                    x={111}
                    y={125}
                    textAnchor="middle"
                    fill={TOKENS.colors.bengalEmerald}
                    fontFamily={FONTS.mono}
                    fontSize={8.5}
                    fontWeight={700}
                    letterSpacing="0.08em"
                  >
                    HARVESTS/YR
                  </text>
                </svg>

                {/* 3 Structured Season Breakdown Rows */}
                <div
                  style={{
                    flex: 1,
                    height: 220,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  {SEASONS.map((season, sIdx) => {
                    const rowReveal = interpolate(
                      frame,
                      [wheelBeatStart + sIdx * 16 - 8, wheelBeatStart + sIdx * 16 + 16],
                      [0.45, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      },
                    );
                    const isActive =
                      frame >= wheelBeatStart && activeSeasonIndex === sIdx;

                    return (
                      <div
                        key={`row-${season.id}`}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 11,
                          background: isActive
                            ? "rgba(15, 28, 46, 0.95)"
                            : "rgba(8, 15, 27, 0.72)",
                          border: `1px solid ${
                            isActive ? season.color : "rgba(148, 163, 184, 0.16)"
                          }`,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          opacity: rowReveal,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                backgroundColor: season.color,
                                boxShadow: isActive
                                  ? `0 0 8px ${season.color}`
                                  : "none",
                              }}
                            />
                            <span
                              style={{
                                fontFamily: FONTS.mono,
                                fontSize: 12,
                                fontWeight: 700,
                                color: season.color,
                              }}
                            >
                              {season.code}
                            </span>
                            <span
                              style={{
                                fontFamily: FONTS.display,
                                fontSize: 13,
                                fontWeight: 700,
                                color: TOKENS.colors.textPrimary,
                              }}
                            >
                              · {season.title}
                            </span>
                          </div>

                          <span
                            style={{
                              fontFamily: FONTS.mono,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              color: isActive
                                ? TOKENS.colors.textPrimary
                                : TOKENS.colors.textMuted,
                            }}
                          >
                            {season.badge} · {season.windowLabel}
                          </span>
                        </div>

                        <div
                          style={{
                            fontFamily: FONTS.sans,
                            fontSize: 11.5,
                            lineHeight: 1.28,
                            color: TOKENS.colors.textSecondary,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {season.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* MODULE 2: DEMOGRAPHIC TRAJECTORY CHART (1950 – 2026) (700 x 307) */}
            <div
              style={{
                width: 700,
                height: 307,
                borderRadius: 18,
                background: TOKENS.colors.bgCardElevated,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                boxShadow:
                  "0 18px 42px rgba(2, 6, 14, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                padding: "14px 20px 12px 20px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                overflow: "hidden",
                opacity: interpolate(demoCardEntrance, [0, 1], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                transform: `translateY(${interpolate(demoCardEntrance, [0, 1], [16, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }).toFixed(2)}px)`,
              }}
            >
              {/* Module 2 Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.09em",
                      color: TOKENS.colors.bengalEmerald,
                    }}
                  >
                    MODULE 02 · DEMOGRAPHIC TRAJECTORY (1950 – 2026)
                  </span>
                  <div
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 19,
                      fontWeight: 700,
                      color: TOKENS.colors.textPrimary,
                    }}
                  >
                    40M → 175M Population Surge{" "}
                    <span
                      style={{
                        fontFamily: FONTS.sans,
                        fontSize: 13,
                        fontWeight: 500,
                        color: TOKENS.colors.textSecondary,
                      }}
                    >
                      · 4.4× Multiplier
                    </span>
                  </div>
                </div>

                {/* Live Swept Year & Population Readout */}
                <div
                  style={{
                    padding: "4px 11px",
                    borderRadius: 999,
                    background: "rgba(245, 158, 11, 0.14)",
                    border: "1px solid rgba(245, 158, 11, 0.44)",
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    color: TOKENS.colors.imperialAmber,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {Math.round(currentSweptYear)} · {formatNumber(currentDemoSample.popM)}M
                </div>
              </div>

              {/* SVG Demographic Area/Line Chart (660 x 226) */}
              <svg
                width={660}
                height={226}
                viewBox="0 0 660 226"
                style={{ display: "block" }}
              >
                <defs>
                  <linearGradient id="s05-pop-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.44} />
                    <stop offset="68%" stopColor="#006A4E" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#050911" stopOpacity={0.02} />
                  </linearGradient>

                  <linearGradient id="s05-urban-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.03} />
                  </linearGradient>

                  <linearGradient id="s05-pop-stroke-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="68%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#FBBF24" />
                  </linearGradient>

                  <clipPath id="s05-pop-reveal-clip">
                    <rect
                      x={plotLeft - 2}
                      y={0}
                      width={Math.max(4, playheadX - plotLeft + 4)}
                      height={226}
                    />
                  </clipPath>
                </defs>

                {/* Horizontal Gridlines & Y-Axis Ticks */}
                {[0, 50, 100, 150, 180].map((valM) => {
                  const gy = yForPopM(valM);
                  return (
                    <g key={`ygrid-${valM}`}>
                      <line
                        x1={plotLeft}
                        y1={gy}
                        x2={plotRight}
                        y2={gy}
                        stroke={
                          valM === 0
                            ? "rgba(203, 213, 225, 0.28)"
                            : "rgba(148, 163, 184, 0.12)"
                        }
                        strokeWidth={1}
                        strokeDasharray={valM === 0 ? undefined : "4 5"}
                      />
                      <text
                        x={plotLeft - 8}
                        y={gy + 3.5}
                        textAnchor="end"
                        fill={TOKENS.colors.textMuted}
                        fontFamily={FONTS.mono}
                        fontSize={9.5}
                      >
                        {valM}M
                      </text>
                    </g>
                  );
                })}

                {/* X-Axis Year Ticks */}
                {[
                  { yr: 1950, text: "1950" },
                  { yr: 1980, text: "1980" },
                  { yr: 2000, text: "2000" },
                  { yr: 2026, text: "Today (2026)" },
                ].map((tick) => {
                  const gx = xForYear(tick.yr);
                  return (
                    <g key={`xtick-${tick.yr}`}>
                      <line
                        x1={gx}
                        y1={plotBottom}
                        x2={gx}
                        y2={plotBottom + 5}
                        stroke="rgba(203, 213, 225, 0.34)"
                      />
                      <text
                        x={gx}
                        y={plotBottom + 18}
                        textAnchor={
                          tick.yr === 1950
                            ? "start"
                            : tick.yr === 2026
                              ? "end"
                              : "middle"
                        }
                        fill={TOKENS.colors.textSecondary}
                        fontFamily={FONTS.mono}
                        fontSize={10}
                        fontWeight={tick.yr === 2026 ? 700 : 500}
                      >
                        {tick.text}
                      </text>
                    </g>
                  );
                })}

                {/* Clipped Animated Population & Urbanization Curves */}
                <g clipPath="url(#s05-pop-reveal-clip)">
                  {/* Total Population Area & Smooth Curve */}
                  <path d={chartPaths.popArea} fill="url(#s05-pop-area-grad)" />
                  {/* Secondary Urban Population Area & Dashed Curve */}
                  <path d={chartPaths.urbanArea} fill="url(#s05-urban-area-grad)" />
                  <path
                    d={chartPaths.urbanLine}
                    fill="none"
                    stroke={TOKENS.colors.imperialAmber}
                    strokeWidth={1.8}
                    strokeDasharray="5 4"
                  />
                  {/* Primary Total Population Stroke */}
                  <path
                    d={chartPaths.popLine}
                    fill="none"
                    stroke="url(#s05-pop-stroke-grad)"
                    strokeWidth={3.4}
                    strokeLinecap="round"
                  />
                </g>

                {/* Urban Curve Inline Label (appears as curve reaches 2015+) */}
                <g
                  opacity={interpolate(chartSweepProgress, [0.78, 0.96], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                >
                  <text
                    x={plotRight - 6}
                    y={yForPopM(71.8) + 15}
                    textAnchor="end"
                    fill={TOKENS.colors.imperialAmber}
                    fontFamily={FONTS.mono}
                    fontSize={9.5}
                    fontWeight={700}
                  >
                    URBAN POP · 72M (41%)
                  </text>
                </g>

                {/* Active Sweeping Playhead Guide & Dual Dots */}
                <g>
                  <line
                    x1={playheadX}
                    y1={playheadY}
                    x2={playheadX}
                    y2={plotBottom}
                    stroke="rgba(251, 191, 36, 0.36)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={playheadX}
                    cy={playheadUrbanY}
                    r={3.2}
                    fill={TOKENS.colors.imperialAmber}
                  />
                  <circle
                    cx={playheadX}
                    cy={playheadY}
                    r={8}
                    fill="rgba(16, 185, 129, 0.25)"
                  />
                  <circle
                    cx={playheadX}
                    cy={playheadY}
                    r={4.2}
                    fill="#FBBF24"
                    stroke="#050911"
                    strokeWidth={1.4}
                  />
                </g>

                {/* Milestone Pins: 40M (1950) -> 80M (1980) -> 130M (2000) -> 175M (Today) */}
                {POP_MILESTONES.map((ms) => {
                  const mx = xForYear(ms.year);
                  const my = yForPopM(ms.popM);
                  const threshold = (ms.year - 1950) / (2026 - 1950);
                  const popIn =
                    ms.year === 1950
                      ? 1
                      : interpolate(
                          chartSweepProgress,
                          [Math.max(0, threshold - 0.04), Math.min(1, threshold + 0.05)],
                          [0, 1],
                          {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                            easing: Easing.out(Easing.cubic),
                          },
                        );

                  const pillWidth = ms.year === 2026 ? 104 : 88;
                  const basePillX =
                    ms.align === "left"
                      ? mx
                      : ms.align === "right"
                        ? mx - pillWidth
                        : mx - pillWidth / 2;
                  const pillX = basePillX + ms.anchorDx;
                  const pillY = my + ms.anchorDy - 15;
                  const isFinal = ms.year === 2026;

                  return (
                    <g key={`ms-${ms.year}`} opacity={popIn}>
                      <circle
                        cx={mx}
                        cy={my}
                        r={isFinal ? 5.2 : 4}
                        fill={isFinal ? TOKENS.colors.imperialAmber : TOKENS.colors.bengalEmerald}
                        stroke="#F8FAFC"
                        strokeWidth={1.4}
                      />
                      <rect
                        x={pillX}
                        y={pillY}
                        width={pillWidth}
                        height={19}
                        rx={5}
                        fill={isFinal ? "rgba(245, 158, 11, 0.2)" : "rgba(6, 13, 24, 0.9)"}
                        stroke={
                          isFinal
                            ? "rgba(245, 158, 11, 0.72)"
                            : "rgba(16, 185, 129, 0.52)"
                        }
                        strokeWidth={1}
                      />
                      <text
                        x={pillX + pillWidth / 2}
                        y={pillY + 13}
                        textAnchor="middle"
                        fill={isFinal ? "#FEF3C7" : "#F8FAFC"}
                        fontFamily={FONTS.mono}
                        fontSize={9.5}
                        fontWeight={700}
                      >
                        {ms.label}
                      </text>
                    </g>
                  );
                })}

                {/* RISING URBANIZATION CALLOUT PLAQUE (Upper-Left Open Plot Space: x=56..312, y=10..76) */}
                <g
                  opacity={interpolate(
                    frame,
                    [chartBeatStart + 10, chartBeatStart + 36],
                    [0.35, 1],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.out(Easing.cubic),
                    },
                  )}
                >
                  <rect
                    x={56}
                    y={10}
                    width={256}
                    height={64}
                    rx={10}
                    fill="rgba(7, 14, 26, 0.92)"
                    stroke="rgba(245, 158, 11, 0.46)"
                    strokeWidth={1}
                  />
                  <circle cx={70} cy={25} r={3.5} fill={TOKENS.colors.imperialAmber} />
                  <text
                    x={80}
                    y={28.5}
                    fill={TOKENS.colors.imperialAmber}
                    fontFamily={FONTS.mono}
                    fontSize={9.5}
                    fontWeight={700}
                    letterSpacing="0.08em"
                  >
                    RISING URBANIZATION SURGE
                  </text>
                  <text
                    x={68}
                    y={48}
                    fill={TOKENS.colors.textPrimary}
                    fontFamily={FONTS.display}
                    fontSize={15}
                    fontWeight={700}
                  >
                    4% (1950) → 41% Urban Today
                  </text>
                  <text
                    x={68}
                    y={64}
                    fill={TOKENS.colors.textSecondary}
                    fontFamily={FONTS.sans}
                    fontSize={10.5}
                  >
                    {currentDemoSample.urbanM.toFixed(1)}M urbanites · Dhaka Metro 24M
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene05DeltaMiracle;
