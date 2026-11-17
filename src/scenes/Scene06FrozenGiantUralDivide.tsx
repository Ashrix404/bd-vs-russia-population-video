import React, { useId } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { geoAzimuthalEqualArea, geoInterpolate, geoPath } from "d3-geo";
import type { LineString } from "geojson";
import {
  ALL_COUNTRIES_110M,
  GRATICULE_10,
  MOSCOW_LON_LAT,
  RUSSIA_CENTER_LON_LAT,
  RUSSIA_FEATURE,
  WORLD_LAND_110M,
  YAKUTSK_LON_LAT,
} from "../components/GeoMapEngine";
import { FONTS } from "../theme/fonts";
import { TOKENS } from "../theme/tokens";
import type { SceneProps } from "../types/video";

const STAGE_TOP = 88;
const STAGE_LEFT = 64;
const STAGE_WIDTH = 1792;
const STAGE_HEIGHT = 720; // 88 + 720 = 808 (strictly inside 88..808)

const HEADER_HEIGHT = 92;
const MAP_CARD_HEIGHT = 468;
const BARS_CARD_HEIGHT = 140; // 92 + 10 + 468 + 10 + 140 = 720

const MAP_WIDTH = STAGE_WIDTH;
const MAP_HEIGHT = MAP_CARD_HEIGHT;

const RUSSIA_TOTAL_AREA_M_KM2 = 17.1;
const RUSSIA_AVG_DENSITY = 8.4;
const PERMAFROST_SHARE_PCT = 65;

const WEST_LAND_PCT = 23;
const EAST_LAND_PCT = 77;
const WEST_POP_PCT = 75;
const EAST_POP_PCT = 25;

interface ProjectedCity {
  id: string;
  name: string;
  lonLat: [number, number];
  x: number;
  y: number;
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
  isPrimary?: boolean;
  subLabel?: string;
}

interface ProjectedRailStation {
  id: string;
  name: string;
  lonLat: [number, number];
  x: number;
  y: number;
  progressAtNode: number;
  showLabel: boolean;
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
}

interface CityGlowDot {
  id: string;
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  warmTone: string;
}

interface FrostCrystalAnchor {
  id: string;
  name: string;
  x: number;
  y: number;
  size: number;
  rotationDeg: number;
}

interface Scene06Cartography {
  russiaPath: string;
  surroundingLandPath: string;
  countryBordersPath: string;
  graticulePath: string;
  meridian60Path: string;
  uralRidgePath: string;
  uralPeaks: ReadonlyArray<{ x: number; y: number; scale: number }>;
  uralNorthAnchor: [number, number];
  uralMidAnchor: [number, number];
  uralSouthAnchor: [number, number];
  europeanMaskPath: string;
  permafrostMaskPath: string;
  permafrostIsothermPath: string;
  russiaMinX: number;
  russiaMaxX: number;
  permafrostMinX: number;
  yakutiaFocusAnchor: [number, number];
  siberiaCalloutAnchor: [number, number];
  heartlandPolygonPath: string;
  heartlandSpokesPath: string;
  heartlandCenterAnchor: [number, number];
  europeanCoreCities: ReadonlyArray<ProjectedCity>;
  cityLightCluster: ReadonlyArray<CityGlowDot>;
  railPoints: ReadonlyArray<{ x: number; y: number; cumLength: number }>;
  railTotalLength: number;
  railStations: ReadonlyArray<ProjectedRailStation>;
  arcticOutposts: ReadonlyArray<ProjectedCity>;
  frostCrystals: ReadonlyArray<FrostCrystalAnchor>;
}

const URAL_RIDGE_LON_LAT: ReadonlyArray<[number, number]> = [
  [61.6, 69.6], // Pai-Khoi / Kara Gate
  [60.3, 67.5], // Polar Urals (Vorkuta)
  [59.6, 65.1], // Subpolar Urals (Mt. Narodnaya)
  [59.2, 61.8], // Northern Urals
  [59.6, 58.8], // Middle Urals
  [60.5, 56.8], // Yekaterinburg Pass
  [59.7, 54.3], // Southern Urals (Mt. Yamantau)
  [58.6, 51.4], // Orsk / Southern Ural Steppe
];

const PERMAFROST_ISOTHERM_LON_LAT: ReadonlyArray<[number, number]> = [
  [44.2, 68.3], // Kanin / Pechora Arctic margin
  [49.5, 67.4], // Lower Pechora
  [55.0, 66.6], // Usa / Sub-Arctic basin
  [60.2, 65.3], // Subpolar Urals permafrost line
  [66.5, 63.8], // Northern Ob basin
  [73.5, 62.1], // Surgut north
  [80.2, 59.3], // Vasyugan north
  [86.0, 55.6], // Kuznetsk Alatau east
  [90.2, 51.6], // Altai / Western Sayan border
  [98.0, 49.5], // Tuva southern border
  [106.0, 49.6], // Southern Baikal / Buryatia
  [115.5, 48.8], // Zabaykalsky southern rim
  [126.5, 48.8], // Upper Amur permafrost margin
  [134.2, 50.8], // Bureya / North of Khabarovsk
  [141.5, 52.2], // Lower Amur / Okhotsk coast
  [154.0, 49.8], // Southern Kamchatka arc
  [167.0, 53.5], // Bering Sea margin
];

const EUROPEAN_LIGHT_HUBS: ReadonlyArray<{
  lonLat: [number, number];
  count: number;
  spreadLon: number;
  spreadLat: number;
}> = [
  { lonLat: MOSCOW_LON_LAT, count: 16, spreadLon: 3.4, spreadLat: 2.1 },
  { lonLat: [30.31, 59.94], count: 9, spreadLon: 2.2, spreadLat: 1.4 }, // St. Petersburg
  { lonLat: [38.98, 45.04], count: 8, spreadLon: 2.6, spreadLat: 1.6 }, // Krasnodar / Rostov
  { lonLat: [49.12, 55.79], count: 8, spreadLon: 2.5, spreadLat: 1.6 }, // Kazan
  { lonLat: [44.0, 56.33], count: 6, spreadLon: 2.2, spreadLat: 1.4 }, // Nizhny Novgorod
  { lonLat: [50.15, 53.2], count: 6, spreadLon: 2.4, spreadLat: 1.5 }, // Samara / Tolyatti
  { lonLat: [39.2, 51.67], count: 6, spreadLon: 2.2, spreadLat: 1.5 }, // Voronezh / Lipetsk
  { lonLat: [44.51, 48.71], count: 5, spreadLon: 2.1, spreadLat: 1.4 }, // Volgograd / Saratov
  { lonLat: [56.0, 54.74], count: 5, spreadLon: 2.0, spreadLat: 1.5 }, // Ufa / Perm
  { lonLat: [20.51, 54.71], count: 3, spreadLon: 0.7, spreadLat: 0.5 }, // Kaliningrad
];

const TRANS_SIBERIAN_STATIONS_SPEC: ReadonlyArray<{
  id: string;
  name: string;
  lonLat: [number, number];
  showLabel: boolean;
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
}> = [
  {
    id: "moscow-hub",
    name: "MOSCOW",
    lonLat: MOSCOW_LON_LAT,
    showLabel: false,
    dx: 0,
    dy: 0,
    anchor: "middle",
  },
  {
    id: "kazan-hub",
    name: "KAZAN",
    lonLat: [49.12, 55.79],
    showLabel: false,
    dx: 0,
    dy: 0,
    anchor: "middle",
  },
  {
    id: "yekaterinburg",
    name: "YEKATERINBURG",
    lonLat: [60.6, 56.84],
    showLabel: true,
    dx: 8,
    dy: 16,
    anchor: "start",
  },
  {
    id: "omsk",
    name: "OMSK",
    lonLat: [73.37, 54.99],
    showLabel: false,
    dx: 0,
    dy: 14,
    anchor: "middle",
  },
  {
    id: "novosibirsk",
    name: "NOVOSIBIRSK",
    lonLat: [82.93, 55.01],
    showLabel: true,
    dx: 0,
    dy: 17,
    anchor: "middle",
  },
  {
    id: "krasnoyarsk",
    name: "KRASNOYARSK",
    lonLat: [92.89, 56.01],
    showLabel: false,
    dx: 0,
    dy: -10,
    anchor: "middle",
  },
  {
    id: "irkutsk",
    name: "IRKUTSK",
    lonLat: [104.3, 52.29],
    showLabel: true,
    dx: 0,
    dy: 16,
    anchor: "middle",
  },
  {
    id: "chita",
    name: "CHITA",
    lonLat: [113.5, 52.03],
    showLabel: false,
    dx: 0,
    dy: 14,
    anchor: "middle",
  },
  {
    id: "khabarovsk",
    name: "KHABAROVSK",
    lonLat: [135.08, 48.48],
    showLabel: false,
    dx: 8,
    dy: -6,
    anchor: "start",
  },
  {
    id: "vladivostok",
    name: "VLADIVOSTOK",
    lonLat: [131.89, 43.12],
    showLabel: true,
    dx: 10,
    dy: 4,
    anchor: "start",
  },
];

const FROST_CRYSTAL_COORDS: ReadonlyArray<{
  id: string;
  name: string;
  lonLat: [number, number];
  size: number;
}> = [
  { id: "anadyr", name: "Anadyr", lonLat: [175.5, 65.2], size: 7.5 },
  { id: "pevek", name: "Pevek", lonLat: [170.3, 69.7], size: 6.5 },
  { id: "kamchatka-n", name: "Koryakia", lonLat: [161.5, 59.5], size: 6.8 },
  { id: "magadan", name: "Magadan", lonLat: [150.8, 60.5], size: 6.5 },
  { id: "oymyakon", name: "Oymyakon", lonLat: [142.8, 63.5], size: 8.6 },
  { id: "chersky", name: "Chersky", lonLat: [161.3, 68.7], size: 6.2 },
  { id: "verkhoyansk", name: "Verkhoyansk", lonLat: [133.4, 67.5], size: 7.8 },
  { id: "tiksi", name: "Tiksi", lonLat: [128.9, 71.6], size: 6.6 },
  { id: "yakutsk-c", name: "Lena Basin", lonLat: [124.0, 63.2], size: 7.2 },
  { id: "mirny", name: "Mirny", lonLat: [113.9, 62.5], size: 6.8 },
  { id: "aldansky", name: "Aldan", lonLat: [125.4, 58.6], size: 6.2 },
  { id: "vitim", name: "Vitim", lonLat: [115.0, 56.5], size: 6.0 },
  { id: "khatanga", name: "Khatanga", lonLat: [102.5, 72.0], size: 7.4 },
  { id: "taymyr", name: "Taymyr", lonLat: [98.5, 75.0], size: 7.0 },
  { id: "tura", name: "Evenkia", lonLat: [100.2, 64.3], size: 7.2 },
  { id: "igarka", name: "Igarka", lonLat: [86.6, 67.5], size: 6.4 },
  { id: "yamal", name: "Yamal", lonLat: [70.5, 69.5], size: 7.0 },
  { id: "vorkuta", name: "Vorkuta", lonLat: [64.0, 67.5], size: 6.2 },
];

const buildPolylinePath = (pts: ReadonlyArray<[number, number]>): string => {
  if (pts.length === 0) {
    return "";
  }
  return pts
    .map(
      (pt, idx) => `${idx === 0 ? "M" : "L"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`,
    )
    .join(" ");
};

const SCENE06_GEO: Scene06Cartography = (() => {
  const projection = geoAzimuthalEqualArea()
    .rotate([-RUSSIA_CENTER_LON_LAT[0], -RUSSIA_CENTER_LON_LAT[1]])
    .clipAngle(135)
    .fitExtent(
      [
        [392, 60],
        [1400, 428],
      ],
      RUSSIA_FEATURE,
    );

  const pathGen = geoPath(projection);
  const russiaPath = pathGen(RUSSIA_FEATURE) ?? "";
  const surroundingLandPath = pathGen(WORLD_LAND_110M) ?? "";
  const countryBordersPath = pathGen(ALL_COUNTRIES_110M) ?? "";
  const graticulePath = pathGen(GRATICULE_10) ?? "";

  const meridian60Coords: [number, number][] = [];
  for (let lat = 44; lat <= 78; lat += 2) {
    meridian60Coords.push([60.0, lat]);
  }
  const meridian60Line: LineString = {
    type: "LineString",
    coordinates: meridian60Coords,
  };
  const meridian60Path = pathGen(meridian60Line) ?? "";

  const projectSafe = (
    lonLat: [number, number],
    fallback: [number, number] = [MAP_WIDTH * 0.5, MAP_HEIGHT * 0.5],
  ): [number, number] => {
    const pt = projection(lonLat);
    return pt ? [pt[0], pt[1]] : fallback;
  };

  const [[rusMinX], [rusMaxX]] = pathGen.bounds(RUSSIA_FEATURE);

  // Smooth interpolated Ural ridge points
  const uralProjectedPts: [number, number][] = [];
  for (let seg = 0; seg < URAL_RIDGE_LON_LAT.length - 1; seg += 1) {
    const interp = geoInterpolate(
      URAL_RIDGE_LON_LAT[seg],
      URAL_RIDGE_LON_LAT[seg + 1],
    );
    const steps = 6;
    for (let s = 0; s <= steps; s += 1) {
      if (seg > 0 && s === 0) {
        continue;
      }
      uralProjectedPts.push(projectSafe(interp(s / steps)));
    }
  }
  const uralRidgePath = buildPolylinePath(uralProjectedPts);
  const uralNorthAnchor = uralProjectedPts[1] ?? [760, 175];
  const uralMidAnchor =
    uralProjectedPts[Math.floor(uralProjectedPts.length * 0.52)] ?? [705, 268];
  const uralSouthAnchor =
    uralProjectedPts[uralProjectedPts.length - 1] ?? [668, 348];

  const uralPeaks = URAL_RIDGE_LON_LAT.slice(1, -1).map((coord, idx) => {
    const [px, py] = projectSafe(coord);
    return {
      x: px,
      y: py,
      scale: idx === 1 || idx === 5 ? 1.15 : 0.92,
    };
  });

  // European Russia mask (West of ~60E Ural Divide & Ural River to Caspian)
  const caspianEastPt = projectSafe([52.2, 46.8], [640, 395]);
  const southWestCornerPt = projectSafe([51.5, 39.5], [620, 445]);
  const arcticNorthUralPt = projectSafe([63.0, 76.0], [795, 115]);

  const europeanPolygonRing: [number, number][] = [
    [arcticNorthUralPt[0], -30],
    arcticNorthUralPt,
    ...uralProjectedPts,
    caspianEastPt,
    southWestCornerPt,
    [southWestCornerPt[0], MAP_HEIGHT + 40],
    [-40, MAP_HEIGHT + 40],
    [-40, -30],
  ];
  const europeanMaskPath = `${buildPolylinePath(europeanPolygonRing)} Z`;

  // Permafrost 65% zone isotherm & clip mask
  const permafrostBoundaryPts: [number, number][] = [];
  for (let seg = 0; seg < PERMAFROST_ISOTHERM_LON_LAT.length - 1; seg += 1) {
    const interp = geoInterpolate(
      PERMAFROST_ISOTHERM_LON_LAT[seg],
      PERMAFROST_ISOTHERM_LON_LAT[seg + 1],
    );
    const steps = 5;
    for (let s = 0; s <= steps; s += 1) {
      if (seg > 0 && s === 0) {
        continue;
      }
      permafrostBoundaryPts.push(projectSafe(interp(s / steps)));
    }
  }
  const permafrostIsothermPath = buildPolylinePath(permafrostBoundaryPts);
  const firstPermafrostPt = permafrostBoundaryPts[0] ?? [715, 155];
  const lastPermafrostPt =
    permafrostBoundaryPts[permafrostBoundaryPts.length - 1] ?? [1310, 215];

  const permafrostMinX = permafrostBoundaryPts.reduce(
    (minVal, pt) => Math.min(minVal, pt[0]),
    firstPermafrostPt[0],
  );

  const permafrostPolygonRing: [number, number][] = [
    ...permafrostBoundaryPts,
    [rusMaxX + 90, lastPermafrostPt[1]],
    [rusMaxX + 90, -50],
    [firstPermafrostPt[0] - 8, -50],
  ];
  const permafrostMaskPath = `${buildPolylinePath(permafrostPolygonRing)} Z`;

  const yakutiaFocusAnchor = projectSafe([112.0, 64.8], [1005, 252]);
  const siberiaCalloutAnchor = projectSafe([124.0, 61.5], [1070, 280]);

  // European Core Cities (St. Petersburg — Moscow — Krasnodar — Kazan)
  const stPetersburgPt = projectSafe([30.31, 59.94], [612, 166]);
  const moscowPt = projectSafe(MOSCOW_LON_LAT, [598, 226]);
  const krasnodarPt = projectSafe([38.98, 45.04], [520, 306]);
  const kazanPt = projectSafe([49.12, 55.79], [646, 274]);

  const europeanCoreCities: ProjectedCity[] = [
    {
      id: "spb",
      name: "ST. PETERSBURG",
      lonLat: [30.31, 59.94],
      x: stPetersburgPt[0],
      y: stPetersburgPt[1],
      dx: -12,
      dy: -8,
      anchor: "end",
      subLabel: "5.6M",
    },
    {
      id: "moscow",
      name: "MOSCOW",
      lonLat: MOSCOW_LON_LAT,
      x: moscowPt[0],
      y: moscowPt[1],
      dx: -14,
      dy: 3,
      anchor: "end",
      isPrimary: true,
      subLabel: "21.5M CORE",
    },
    {
      id: "krasnodar",
      name: "KRASNODAR",
      lonLat: [38.98, 45.04],
      x: krasnodarPt[0],
      y: krasnodarPt[1],
      dx: -12,
      dy: 14,
      anchor: "end",
      subLabel: "SOUTH HUB",
    },
    {
      id: "kazan",
      name: "KAZAN",
      lonLat: [49.12, 55.79],
      x: kazanPt[0],
      y: kazanPt[1],
      dx: -8,
      dy: 18,
      anchor: "end",
      subLabel: "VOLGA",
    },
  ];

  const heartlandPolygonPath = `${buildPolylinePath([
    stPetersburgPt,
    kazanPt,
    krasnodarPt,
  ])} Z`;

  const heartlandSpokesPath = [
    buildPolylinePath([moscowPt, stPetersburgPt]),
    buildPolylinePath([moscowPt, kazanPt]),
    buildPolylinePath([moscowPt, krasnodarPt]),
  ].join(" ");

  const heartlandCenterAnchor: [number, number] = [
    (stPetersburgPt[0] + moscowPt[0] + krasnodarPt[0]) / 3,
    (stPetersburgPt[1] + moscowPt[1] + krasnodarPt[1]) / 3,
  ];

  // Deterministic warm amber city-light micro-clusters across European Russia
  const cityLightCluster: CityGlowDot[] = [];
  const warmPalette = ["#FEF3C7", "#FDE68A", "#FBBF24", "#F59E0B"];
  let dotSeed = 601;
  EUROPEAN_LIGHT_HUBS.forEach((hub, hubIdx) => {
    for (let i = 0; i < hub.count; i += 1) {
      const u1 = TOKENS.seededUnit(dotSeed + i * 17 + hubIdx * 101);
      const u2 = TOKENS.seededUnit(dotSeed + i * 31 + hubIdx * 211);
      const u3 = TOKENS.seededUnit(dotSeed + i * 47 + hubIdx * 307);
      const angle = u1 * Math.PI * 2;
      const radial = Math.pow(u2, 0.72);
      const lon = hub.lonLat[0] + Math.cos(angle) * radial * hub.spreadLon;
      const lat = hub.lonLat[1] + Math.sin(angle) * radial * hub.spreadLat;
      const [px, py] = projectSafe([lon, lat]);
      cityLightCluster.push({
        id: `city-glow-${hubIdx}-${i}`,
        x: px,
        y: py,
        radius: 1.4 + (1 - radial) * 2.5 + u3 * 0.9,
        baseAlpha: 0.48 + (1 - radial) * 0.44,
        phase: u3 * Math.PI * 2,
        warmTone: warmPalette[(hubIdx + i) % warmPalette.length] ?? "#FBBF24",
      });
    }
    dotSeed += 97;
  });

  // Trans-Siberian Railway smooth interpolated polyline + cumulative arc length
  const rawRailCoords: [number, number][] = [];
  const stationSampleIndices: number[] = [0];
  for (let seg = 0; seg < TRANS_SIBERIAN_STATIONS_SPEC.length - 1; seg += 1) {
    const startCoord = TRANS_SIBERIAN_STATIONS_SPEC[seg]?.lonLat ?? MOSCOW_LON_LAT;
    const endCoord =
      TRANS_SIBERIAN_STATIONS_SPEC[seg + 1]?.lonLat ?? MOSCOW_LON_LAT;
    const interp = geoInterpolate(startCoord, endCoord);
    const steps = 10;
    for (let s = 0; s <= steps; s += 1) {
      if (seg > 0 && s === 0) {
        continue;
      }
      rawRailCoords.push(projectSafe(interp(s / steps)));
    }
    stationSampleIndices.push(rawRailCoords.length - 1);
  }

  let runningLen = 0;
  const railPoints = rawRailCoords.map((pt, idx) => {
    if (idx > 0) {
      const prev = rawRailCoords[idx - 1] ?? pt;
      runningLen += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    }
    return {
      x: pt[0],
      y: pt[1],
      cumLength: runningLen,
    };
  });
  const railTotalLength = Math.max(1, runningLen);

  const railStations: ProjectedRailStation[] = TRANS_SIBERIAN_STATIONS_SPEC.map(
    (st, idx) => {
      const sampleIdx = stationSampleIndices[idx] ?? 0;
      const sample = railPoints[sampleIdx] ?? {
        x: 0,
        y: 0,
        cumLength: 0,
      };
      return {
        id: st.id,
        name: st.name,
        lonLat: st.lonLat,
        x: sample.x,
        y: sample.y,
        progressAtNode: sample.cumLength / railTotalLength,
        showLabel: st.showLabel,
        dx: st.dx,
        dy: st.dy,
        anchor: st.anchor,
      };
    },
  );

  // Sparse northern permafrost outposts (Yakutsk & Norilsk)
  const yakutskPt = projectSafe(YAKUTSK_LON_LAT, [1065, 272]);
  const norilskPt = projectSafe([88.19, 69.35], [886, 224]);
  const arcticOutposts: ProjectedCity[] = [
    {
      id: "norilsk",
      name: "NORILSK",
      lonLat: [88.19, 69.35],
      x: norilskPt[0],
      y: norilskPt[1],
      dx: 0,
      dy: -10,
      anchor: "middle",
      subLabel: "ARCTIC OUTPOST",
    },
    {
      id: "yakutsk",
      name: "YAKUTSK · -40°C",
      lonLat: YAKUTSK_LON_LAT,
      x: yakutskPt[0],
      y: yakutskPt[1],
      dx: 10,
      dy: -6,
      anchor: "start",
      subLabel: "PERMAFROST CITY",
    },
  ];

  const frostCrystals: FrostCrystalAnchor[] = FROST_CRYSTAL_COORDS.map(
    (fc, idx) => {
      const [fx, fy] = projectSafe(fc.lonLat);
      return {
        id: fc.id,
        name: fc.name,
        x: fx,
        y: fy,
        size: fc.size,
        rotationDeg: Math.round(TOKENS.seededUnit(911 + idx * 37) * 60),
      };
    },
  );

  return {
    russiaPath,
    surroundingLandPath,
    countryBordersPath,
    graticulePath,
    meridian60Path,
    uralRidgePath,
    uralPeaks,
    uralNorthAnchor,
    uralMidAnchor,
    uralSouthAnchor,
    europeanMaskPath,
    permafrostMaskPath,
    permafrostIsothermPath,
    russiaMinX: rusMinX,
    russiaMaxX: rusMaxX,
    permafrostMinX,
    yakutiaFocusAnchor,
    siberiaCalloutAnchor,
    heartlandPolygonPath,
    heartlandSpokesPath,
    heartlandCenterAnchor,
    europeanCoreCities,
    cityLightCluster,
    railPoints,
    railTotalLength,
    railStations,
    arcticOutposts,
    frostCrystals,
  };
})();

const buildPartialRailPath = (
  points: ReadonlyArray<{ x: number; y: number; cumLength: number }>,
  targetLen: number,
): { pathD: string; headX: number; headY: number } => {
  if (points.length === 0 || targetLen <= 0.5) {
    const first = points[0] ?? { x: 0, y: 0 };
    return { pathD: "", headX: first.x, headY: first.y };
  }

  const parts: string[] = [];
  let headX = points[0]?.x ?? 0;
  let headY = points[0]?.y ?? 0;

  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i];
    if (!curr) {
      continue;
    }
    if (i === 0) {
      parts.push(`M${curr.x.toFixed(1)},${curr.y.toFixed(1)}`);
      headX = curr.x;
      headY = curr.y;
      continue;
    }

    const prev = points[i - 1] ?? curr;
    if (curr.cumLength <= targetLen) {
      parts.push(`L${curr.x.toFixed(1)},${curr.y.toFixed(1)}`);
      headX = curr.x;
      headY = curr.y;
    } else {
      const segSpan = Math.max(0.001, curr.cumLength - prev.cumLength);
      const t = Math.max(0, Math.min(1, (targetLen - prev.cumLength) / segSpan));
      headX = prev.x + (curr.x - prev.x) * t;
      headY = prev.y + (curr.y - prev.y) * t;
      parts.push(`L${headX.toFixed(1)},${headY.toFixed(1)}`);
      break;
    }
  }

  return {
    pathD: parts.join(" "),
    headX,
    headY,
  };
};

const samplePointAlongRail = (
  points: ReadonlyArray<{ x: number; y: number; cumLength: number }>,
  targetLen: number,
): { x: number; y: number } => {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  const first = points[0] ?? { x: 0, y: 0, cumLength: 0 };
  if (targetLen <= 0) {
    return { x: first.x, y: first.y };
  }
  for (let i = 1; i < points.length; i += 1) {
    const curr = points[i];
    const prev = points[i - 1];
    if (!curr || !prev) {
      continue;
    }
    if (curr.cumLength >= targetLen) {
      const span = Math.max(0.001, curr.cumLength - prev.cumLength);
      const t = Math.max(0, Math.min(1, (targetLen - prev.cumLength) / span));
      return {
        x: prev.x + (curr.x - prev.x) * t,
        y: prev.y + (curr.y - prev.y) * t,
      };
    }
  }
  const last = points[points.length - 1] ?? first;
  return { x: last.x, y: last.y };
};

export const Scene06FrozenGiantUralDivide: React.FC<SceneProps> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rawUid = useId().replace(/:/g, "");
  const totalFrames = Math.max(150, scene.durationInFrames);

  // Adaptive narrative beat markers across Scene 06
  const permafrostStart = Math.round(totalFrames * 0.08);
  const permafrostEnd = Math.round(totalFrames * 0.36);

  const uralStart = Math.round(totalFrames * 0.28);
  const uralEnd = Math.round(totalFrames * 0.45);

  const heartlandStart = Math.round(totalFrames * 0.37);
  const heartlandEnd = Math.round(totalFrames * 0.56);

  const railStart = Math.round(totalFrames * 0.48);
  const railEnd = Math.round(totalFrames * 0.72);

  const barsStart = Math.round(totalFrames * 0.6);
  const barsEnd = Math.round(totalFrames * 0.84);

  // Scene entrance & header counters
  const sceneEnter = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const headerStatsProgress = interpolate(
    frame,
    [4, Math.round(totalFrames * 0.18)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  // Beat 2: East-to-West Permafrost Sweep (Chukotka -> Yakutia -> Northern Urals)
  const permafrostSweep = interpolate(
    frame,
    [permafrostStart, permafrostEnd],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    },
  );

  const frostWaveFrontX = interpolate(
    permafrostSweep,
    [0, 1],
    [SCENE06_GEO.russiaMaxX + 54, SCENE06_GEO.permafrostMinX - 38],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const frostWaveArcOffset = 32;
  const frostSweepClipD = `M ${(frostWaveFrontX + frostWaveArcOffset).toFixed(1)},0 Q ${(frostWaveFrontX - frostWaveArcOffset).toFixed(1)},${(MAP_HEIGHT * 0.48).toFixed(1)} ${(frostWaveFrontX + frostWaveArcOffset * 0.65).toFixed(1)},${MAP_HEIGHT} L ${MAP_WIDTH + 80},${MAP_HEIGHT} L ${MAP_WIDTH + 80},0 Z`;
  const frostLeadingCurveD = `M ${(frostWaveFrontX + frostWaveArcOffset).toFixed(1)},42 Q ${(frostWaveFrontX - frostWaveArcOffset).toFixed(1)},${(MAP_HEIGHT * 0.48).toFixed(1)} ${(frostWaveFrontX + frostWaveArcOffset * 0.65).toFixed(1)},${MAP_HEIGHT - 34}`;

  const permafrostBannerSpring = spring({
    frame: frame - (permafrostStart + 10),
    fps,
    config: { damping: 18, stiffness: 150, mass: 0.85 },
  });

  // Beat 3: Ural Mountain Divide (~60°E) & European Heartland Core
  const uralDrawProgress = interpolate(frame, [uralStart, uralEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const uralBannerSpring = spring({
    frame: frame - (uralStart + 8),
    fps,
    config: { damping: 18, stiffness: 160, mass: 0.8 },
  });

  const heartlandGlowProgress = interpolate(
    frame,
    [heartlandStart, heartlandEnd],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const westCardSpring = spring({
    frame: frame - (heartlandStart + 6),
    fps,
    config: { damping: 19, stiffness: 145, mass: 0.9 },
  });

  // Beat 4: Asian Russia & Sparse Trans-Siberian Railway Corridor
  const railDrawProgress = interpolate(frame, [railStart, railEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0.9, 0.3, 1),
  });

  const eastCardSpring = spring({
    frame: frame - (railStart + 6),
    fps,
    config: { damping: 19, stiffness: 145, mass: 0.9 },
  });

  const activeRailGeometry = buildPartialRailPath(
    SCENE06_GEO.railPoints,
    railDrawProgress * SCENE06_GEO.railTotalLength,
  );

  // Subtle continuous locomotive pulse after railway completes
  const postRailLoopT =
    frame > railEnd
      ? ((frame - railEnd) / Math.max(60, fps * 4.2)) % 1
      : railDrawProgress;
  const trainPulsePt = samplePointAlongRail(
    SCENE06_GEO.railPoints,
    postRailLoopT * SCENE06_GEO.railTotalLength,
  );

  // Beat 5: Twin Stacked Proportional Bars (23% | 77% Land vs 75% | 25% Pop)
  const territoryBarProgress = interpolate(
    frame,
    [barsStart, barsEnd - 14],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const populationBarProgress = interpolate(
    frame,
    [barsStart + 14, barsEnd],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const shearConnectorAlpha = interpolate(
    frame,
    [barsStart + 22, barsEnd + 6],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Deterministic SVG <defs> IDs
  const russiaClipId = `s06-russia-clip-${rawUid}`;
  const europeanZoneClipId = `s06-europe-zone-${rawUid}`;
  const permafrostZoneClipId = `s06-pf-zone-${rawUid}`;
  const permafrostSweepClipId = `s06-pf-sweep-${rawUid}`;
  const frostHatchPatternId = `s06-frost-hatch-${rawUid}`;
  const barFrostPatternId = `s06-bar-hatch-${rawUid}`;
  const russiaBaseGradId = `s06-ru-base-${rawUid}`;
  const permafrostFillGradId = `s06-pf-fill-${rawUid}`;
  const europeanWarmGradId = `s06-eu-warm-${rawUid}`;
  const uralGlowGradId = `s06-ural-glow-${rawUid}`;

  const displayedPermafrostPct = Math.round(
    PERMAFROST_SHARE_PCT * permafrostSweep,
  );
  const displayedWestLand = Math.round(WEST_LAND_PCT * territoryBarProgress);
  const displayedEastLand = Math.round(EAST_LAND_PCT * territoryBarProgress);
  const displayedWestPop = Math.round(WEST_POP_PCT * populationBarProgress);
  const displayedEastPop = Math.round(EAST_POP_PCT * populationBarProgress);

  // Ambient deterministic breath for glowing beacons
  const ambientPulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 1.6);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.bgObsidian,
        overflow: "hidden",
      }}
    >
      {/* Full-canvas atmospheric dual-climate lighting (Amber West vs Glacial Cyan East) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 28% 42%, rgba(245, 158, 11, 0.09) 0%, transparent 44%), radial-gradient(circle at 72% 36%, rgba(56, 189, 248, 0.12) 0%, rgba(5, 9, 17, 0.98) 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${TOKENS.colors.gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${TOKENS.colors.gridLine} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          opacity: 0.32,
        }}
      />

      {/* STRICT SAFE-ZONE STAGE: top 88..808, left 64..1856 (1792 x 720) */}
      <div
        style={{
          position: "absolute",
          top: STAGE_TOP,
          left: STAGE_LEFT,
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          opacity: sceneEnter,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* ROW 1: TOP EDITORIAL HEADER & DENSITY DIAGNOSTIC READOUT (92px) */}
        <div
          style={{
            height: HEADER_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            boxSizing: "border-box",
          }}
        >
          {/* Left Headline Block */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 3,
              transform: `translateY(${interpolate(sceneEnter, [0, 1], [12, 0]).toFixed(1)}px)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.russiaCyan,
                  boxShadow: "0 0 10px rgba(56, 189, 248, 0.85)",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: TOKENS.colors.russiaIce,
                  textTransform: "uppercase",
                }}
              >
                SCENE 06 · GEOCRYOLOGY &amp; THE URAL DIVIDE · LAMBERT EQUAL-AREA
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 38,
                lineHeight: 1.06,
                color: TOKENS.colors.textPrimary,
                letterSpacing: "-0.01em",
              }}
            >
              Why{" "}
              <span style={{ color: TOKENS.colors.russiaCyan }}>
                17.1M km²
              </span>{" "}
              Averages Only{" "}
              <span style={{ color: TOKENS.colors.imperialAmber }}>
                8.4 People / km²
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 13.5,
                fontWeight: 400,
                color: TOKENS.colors.textSecondary,
              }}
            >
              Frozen Siberian subsoil locks two-thirds of the continent — concentrating
              three-quarters of citizens into the warm European Russia triangle.
            </div>
          </div>

          {/* Right National Density Equation Pill */}
          <div
            style={{
              height: 84,
              padding: "10px 20px",
              borderRadius: 14,
              backgroundColor: TOKENS.colors.bgCardElevated,
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              boxShadow: "0 12px 28px rgba(0, 0, 0, 0.42)",
              display: "flex",
              alignItems: "center",
              gap: 20,
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: TOKENS.colors.textMuted,
                }}
              >
                TOTAL TERRITORY
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 25,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  color: TOKENS.colors.russiaCyan,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {TOKENS.formatNumber(
                  RUSSIA_TOTAL_AREA_M_KM2 * headerStatsProgress,
                  1,
                )}
                M km²
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                115.2× Bangladesh
              </span>
            </div>

            <div
              style={{
                width: 1,
                height: 48,
                backgroundColor: "rgba(148, 163, 184, 0.2)",
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: TOKENS.colors.textMuted,
                }}
              >
                FROZEN SUBSOIL
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 25,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  color: TOKENS.colors.russiaIce,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(PERMAFROST_SHARE_PCT * headerStatsProgress)}%
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                ~11.1M km² Permafrost
              </span>
            </div>

            <div
              style={{
                width: 1,
                height: 48,
                backgroundColor: "rgba(148, 163, 184, 0.2)",
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: TOKENS.colors.textMuted,
                }}
              >
                NATIONAL DENSITY
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 25,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  color: TOKENS.colors.imperialAmber,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {TOKENS.formatNumber(
                  RUSSIA_AVG_DENSITY * headerStatsProgress,
                  1,
                )}{" "}
                / km²
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                vs 1,330 / km² in BD
              </span>
            </div>
          </div>
        </div>

        {/* ROW 2: MAIN EQUAL-AREA CARTOGRAPHIC STAGE (468px) */}
        <div
          style={{
            position: "relative",
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            borderRadius: 16,
            backgroundColor: "rgba(8, 15, 28, 0.88)",
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            boxShadow: "0 18px 42px rgba(0, 0, 0, 0.52)",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {/* Full-Stage Equal-Area SVG Cartography */}
          <svg
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            style={{ display: "block" }}
          >
            <defs>
              <clipPath id={russiaClipId}>
                <path d={SCENE06_GEO.russiaPath} />
              </clipPath>

              <clipPath id={europeanZoneClipId}>
                <path d={SCENE06_GEO.europeanMaskPath} />
              </clipPath>

              <clipPath id={permafrostZoneClipId}>
                <path d={SCENE06_GEO.permafrostMaskPath} />
              </clipPath>

              <clipPath id={permafrostSweepClipId}>
                <path d={frostSweepClipD} />
              </clipPath>

              {/* Base Equal-Area Russia terrain fill */}
              <linearGradient
                id={russiaBaseGradId}
                x1="0%"
                y1="15%"
                x2="100%"
                y2="80%"
              >
                <stop offset="0%" stopColor="#162338" />
                <stop offset="38%" stopColor="#102238" />
                <stop offset="100%" stopColor="#0A1D33" />
              </linearGradient>

              {/* East-to-West Glacial Permafrost fill */}
              <linearGradient
                id={permafrostFillGradId}
                x1="100%"
                y1="10%"
                x2="0%"
                y2="85%"
              >
                <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.46" />
                <stop offset="45%" stopColor="#38BDF8" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#0284C7" stopOpacity="0.24" />
              </linearGradient>

              {/* Crystalline blue-white diagonal cross-hatch frost pattern */}
              <pattern
                id={frostHatchPatternId}
                width={18}
                height={18}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-34)"
              >
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={18}
                  stroke="#E0F2FE"
                  strokeWidth={1.15}
                  strokeOpacity={0.34}
                />
                <line
                  x1={9}
                  y1={0}
                  x2={9}
                  y2={18}
                  stroke="#38BDF8"
                  strokeWidth={0.85}
                  strokeOpacity={0.28}
                />
                <line
                  x1={0}
                  y1={9}
                  x2={18}
                  y2={9}
                  stroke="#BAE6FD"
                  strokeWidth={0.65}
                  strokeOpacity={0.18}
                  strokeDasharray="3 4"
                />
                <polygon
                  points="9,2.5 11,4.5 9,6.5 7,4.5"
                  fill="#E0F2FE"
                  fillOpacity={0.32}
                />
              </pattern>

              {/* Bar East-segment subtle frost hatch */}
              <pattern
                id={barFrostPatternId}
                width={14}
                height={14}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-35)"
              >
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={14}
                  stroke="#BAE6FD"
                  strokeWidth={1}
                  strokeOpacity={0.18}
                />
              </pattern>

              {/* Warm European Russia Heartland radial illumination */}
              <radialGradient
                id={europeanWarmGradId}
                gradientUnits="userSpaceOnUse"
                cx={SCENE06_GEO.heartlandCenterAnchor[0]}
                cy={SCENE06_GEO.heartlandCenterAnchor[1]}
                r={175}
              >
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.48" />
                <stop offset="58%" stopColor="#F59E0B" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#D97706" stopOpacity="0.06" />
              </radialGradient>

              {/* Ural Mountain amber meridian ridge gradient */}
              <linearGradient
                id={uralGlowGradId}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#FB923C" />
              </linearGradient>
            </defs>

            {/* 10° Spherical Equal-Area Graticule */}
            {SCENE06_GEO.graticulePath && (
              <path
                d={SCENE06_GEO.graticulePath}
                fill="none"
                stroke="rgba(148, 163, 184, 0.1)"
                strokeWidth={0.8}
              />
            )}

            {/* Surrounding Eurasian Landmasses for Continental Context */}
            {SCENE06_GEO.surroundingLandPath && (
              <path
                d={SCENE06_GEO.surroundingLandPath}
                fill="rgba(15, 23, 42, 0.56)"
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth={0.65}
              />
            )}
            {SCENE06_GEO.countryBordersPath && (
              <path
                d={SCENE06_GEO.countryBordersPath}
                fill="none"
                stroke="rgba(148, 163, 184, 0.1)"
                strokeWidth={0.5}
              />
            )}

            {/* Russia Outer Rim Atmospheric Glow */}
            <path
              d={SCENE06_GEO.russiaPath}
              fill="none"
              stroke={TOKENS.colors.russiaCyan}
              strokeWidth={6}
              strokeOpacity={0.18}
              strokeLinejoin="round"
            />

            {/* Russia Base Equal-Area Landmass */}
            <path
              d={SCENE06_GEO.russiaPath}
              fill={`url(#${russiaBaseGradId})`}
              stroke="rgba(148, 163, 184, 0.42)"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />

            {/* CLIPPED TO RUSSIA SILHOUETTE: West Heartland + East Permafrost Sweep */}
            <g clipPath={`url(#${russiaClipId})`}>
              {/* West-of-Urals Warm Amber Heartland Illumination (23% Land) */}
              {heartlandGlowProgress > 0.01 && (
                <g
                  clipPath={`url(#${europeanZoneClipId})`}
                  opacity={heartlandGlowProgress}
                >
                  <rect
                    x={0}
                    y={0}
                    width={MAP_WIDTH}
                    height={MAP_HEIGHT}
                    fill="rgba(245, 158, 11, 0.14)"
                  />
                  <rect
                    x={0}
                    y={0}
                    width={MAP_WIDTH}
                    height={MAP_HEIGHT}
                    fill={`url(#${europeanWarmGradId})`}
                  />
                </g>
              )}

              {/* East-to-West Animated Permafrost Frost & Crystalline Hatch (65% Land) */}
              {permafrostSweep > 0.005 && (
                <g clipPath={`url(#${permafrostZoneClipId})`}>
                  <g clipPath={`url(#${permafrostSweepClipId})`}>
                    <rect
                      x={0}
                      y={0}
                      width={MAP_WIDTH}
                      height={MAP_HEIGHT}
                      fill={`url(#${permafrostFillGradId})`}
                    />
                    <rect
                      x={0}
                      y={0}
                      width={MAP_WIDTH}
                      height={MAP_HEIGHT}
                      fill={`url(#${frostHatchPatternId})`}
                    />

                    {/* Sparkling 6-Pointed Siberian Frost Crystals */}
                    {SCENE06_GEO.frostCrystals.map((crystal, idx) => {
                      const revealDelta = crystal.x - frostWaveFrontX;
                      if (revealDelta < -8) {
                        return null;
                      }
                      const crystalEnter = Math.max(
                        0,
                        Math.min(1, (revealDelta + 8) / 42),
                      );
                      const shimmer =
                        0.72 +
                        0.28 *
                          Math.sin((frame / fps) * 2.4 + idx * 1.13);
                      const arm = crystal.size * crystalEnter;
                      return (
                        <g
                          key={crystal.id}
                          transform={`translate(${crystal.x.toFixed(1)}, ${crystal.y.toFixed(1)}) rotate(${crystal.rotationDeg})`}
                          opacity={crystalEnter * shimmer * 0.85}
                        >
                          <line
                            x1={-arm}
                            y1={0}
                            x2={arm}
                            y2={0}
                            stroke="#E0F2FE"
                            strokeWidth={1.15}
                            strokeLinecap="round"
                          />
                          <line
                            x1={-arm * 0.5}
                            y1={-arm * 0.866}
                            x2={arm * 0.5}
                            y2={arm * 0.866}
                            stroke="#E0F2FE"
                            strokeWidth={1.15}
                            strokeLinecap="round"
                          />
                          <line
                            x1={-arm * 0.5}
                            y1={arm * 0.866}
                            x2={arm * 0.5}
                            y2={-arm * 0.866}
                            stroke="#E0F2FE"
                            strokeWidth={1.15}
                            strokeLinecap="round"
                          />
                          <circle r={1.5} fill="#FFFFFF" />
                        </g>
                      );
                    })}
                  </g>

                  {/* Active Glowing Glacial Sweep Wave-Front */}
                  {permafrostSweep > 0.02 && permafrostSweep < 0.99 && (
                    <g>
                      <path
                        d={frostLeadingCurveD}
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth={10}
                        strokeOpacity={0.34}
                        strokeLinecap="round"
                      />
                      <path
                        d={frostLeadingCurveD}
                        fill="none"
                        stroke="#F0F9FF"
                        strokeWidth={2.2}
                        strokeOpacity={0.95}
                        strokeLinecap="round"
                      />
                    </g>
                  )}
                </g>
              )}

              {/* Southern Permafrost Isotherm Boundary Line */}
              {permafrostSweep > 0.08 && (
                <g clipPath={`url(#${permafrostSweepClipId})`}>
                  <path
                    d={SCENE06_GEO.permafrostIsothermPath}
                    fill="none"
                    stroke={TOKENS.colors.russiaCyan}
                    strokeWidth={4}
                    strokeOpacity={0.25}
                  />
                  <path
                    d={SCENE06_GEO.permafrostIsothermPath}
                    fill="none"
                    stroke={TOKENS.colors.russiaIce}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    strokeOpacity={0.9}
                  />
                </g>
              )}

              {/* Night-Time Satellite City-Light Clusters (West of Urals) */}
              {heartlandGlowProgress > 0.02 && (
                <g clipPath={`url(#${europeanZoneClipId})`}>
                  {SCENE06_GEO.cityLightCluster.map((dot) => {
                    const twinkle =
                      0.82 +
                      0.18 * Math.sin((frame / fps) * 2.8 + dot.phase);
                    return (
                      <g
                        key={dot.id}
                        opacity={
                          heartlandGlowProgress * dot.baseAlpha * twinkle
                        }
                      >
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={dot.radius * 2.6}
                          fill={TOKENS.colors.imperialAmber}
                          fillOpacity={0.24}
                        />
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={dot.radius}
                          fill={dot.warmTone}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* European Heartland Core Triangle (St. Petersburg — Moscow — Krasnodar — Kazan) */}
              {heartlandGlowProgress > 0.05 && (
                <g opacity={heartlandGlowProgress}>
                  <path
                    d={SCENE06_GEO.heartlandPolygonPath}
                    fill="rgba(245, 158, 11, 0.18)"
                    stroke="#FBBF24"
                    strokeWidth={1.6}
                    strokeDasharray="4 3"
                  />
                  <path
                    d={SCENE06_GEO.heartlandSpokesPath}
                    fill="none"
                    stroke="#FDE68A"
                    strokeWidth={1.25}
                    strokeOpacity={0.78}
                  />
                </g>
              )}
            </g>

            {/* Re-stroke Crisp Russia Equal-Area Coastline & Borders on Top */}
            <path
              d={SCENE06_GEO.russiaPath}
              fill="none"
              stroke={TOKENS.colors.russiaIce}
              strokeWidth={1.45}
              strokeOpacity={0.86}
              strokeLinejoin="round"
            />

            {/* 60°E Spherical Reference Meridian + Glowing Ural Mountain Ridge */}
            {uralDrawProgress > 0.01 && (
              <g opacity={uralDrawProgress}>
                {SCENE06_GEO.meridian60Path && (
                  <path
                    d={SCENE06_GEO.meridian60Path}
                    fill="none"
                    stroke={TOKENS.colors.imperialAmber}
                    strokeWidth={1}
                    strokeDasharray="3 5"
                    strokeOpacity={0.42}
                  />
                )}

                {/* Broad Amber Mountain Divide Halo */}
                <path
                  d={SCENE06_GEO.uralRidgePath}
                  fill="none"
                  stroke={TOKENS.colors.imperialAmber}
                  strokeWidth={13}
                  strokeOpacity={0.22 + ambientPulse * 0.08}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - uralDrawProgress}
                />

                {/* Crisp Glowing Ural Spine */}
                <path
                  d={SCENE06_GEO.uralRidgePath}
                  fill="none"
                  stroke={`url(#${uralGlowGradId})`}
                  strokeWidth={3.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - uralDrawProgress}
                />

                {/* Topographic Ural Peak Chevrons */}
                {SCENE06_GEO.uralPeaks.map((pk, idx) => {
                  const pkThreshold = (idx + 1) / (SCENE06_GEO.uralPeaks.length + 1);
                  const pkAlpha = Math.max(
                    0,
                    Math.min(1, (uralDrawProgress - pkThreshold + 0.15) * 4),
                  );
                  return (
                    <polygon
                      key={`ural-pk-${idx}`}
                      points="0,-5.5 5,3.5 -5,3.5"
                      transform={`translate(${pk.x.toFixed(1)}, ${pk.y.toFixed(1)}) scale(${pk.scale.toFixed(2)})`}
                      fill="#FEF3C7"
                      stroke={TOKENS.colors.bgObsidian}
                      strokeWidth={0.9}
                      opacity={pkAlpha}
                    />
                  );
                })}
              </g>
            )}

            {/* Trans-Siberian Railway Track & Sparse Siberian Nodes */}
            {railDrawProgress > 0.01 && activeRailGeometry.pathD && (
              <g>
                <path
                  d={activeRailGeometry.pathD}
                  fill="none"
                  stroke={TOKENS.colors.imperialAmber}
                  strokeWidth={5}
                  strokeOpacity={0.2}
                  strokeLinecap="round"
                />
                <path
                  d={activeRailGeometry.pathD}
                  fill="none"
                  stroke="#FCD34D"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                />
                <path
                  d={activeRailGeometry.pathD}
                  fill="none"
                  stroke={TOKENS.colors.bgObsidian}
                  strokeWidth={1.1}
                  strokeDasharray="2 5"
                  strokeOpacity={0.65}
                />

                {/* Traveling Locomotive Telemetry Pulse */}
                <g
                  transform={`translate(${trainPulsePt.x.toFixed(1)}, ${trainPulsePt.y.toFixed(1)})`}
                >
                  <circle
                    r={7}
                    fill={TOKENS.colors.imperialAmber}
                    fillOpacity={0.35}
                  />
                  <circle r={2.8} fill="#FFFBEB" />
                </g>

                {/* Sparse Trans-Siberian Station Nodes & Spaced Callout Labels */}
                {SCENE06_GEO.railStations.map((st) => {
                  if (st.id === "moscow-hub" || st.id === "kazan-hub") {
                    return null;
                  }
                  const nodeLocal = railDrawProgress - st.progressAtNode + 0.04;
                  if (nodeLocal <= 0) {
                    return null;
                  }
                  const nodeAlpha = Math.min(1, nodeLocal * 6);
                  return (
                    <g
                      key={st.id}
                      transform={`translate(${st.x.toFixed(1)}, ${st.y.toFixed(1)})`}
                      opacity={nodeAlpha}
                    >
                      <circle
                        r={5.2}
                        fill="rgba(245, 158, 11, 0.28)"
                      />
                      <circle
                        r={3.1}
                        fill="#FDE68A"
                        stroke={TOKENS.colors.bgObsidian}
                        strokeWidth={1.2}
                      />
                      {st.showLabel && (
                        <text
                          x={st.dx}
                          y={st.dy}
                          textAnchor={st.anchor}
                          fill="#FDE68A"
                          stroke="rgba(5, 9, 17, 0.92)"
                          strokeWidth={3.2}
                          paintOrder="stroke"
                          fontFamily={FONTS.mono}
                          fontSize={9.5}
                          fontWeight={700}
                          letterSpacing="0.06em"
                        >
                          {st.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Sparse Northern Permafrost Outposts (Norilsk & Yakutsk -40°C) */}
            {permafrostSweep > 0.42 &&
              SCENE06_GEO.arcticOutposts.map((outpost) => {
                const outpostAlpha = Math.max(
                  0,
                  Math.min(1, (outpost.x - frostWaveFrontX) / 48),
                );
                if (outpostAlpha <= 0.02) {
                  return null;
                }
                return (
                  <g
                    key={outpost.id}
                    transform={`translate(${outpost.x.toFixed(1)}, ${outpost.y.toFixed(1)})`}
                    opacity={outpostAlpha}
                  >
                    <circle
                      r={5.5}
                      fill="none"
                      stroke={TOKENS.colors.russiaCyan}
                      strokeWidth={1.1}
                      strokeOpacity={0.65}
                    />
                    <circle
                      r={2.8}
                      fill={TOKENS.colors.russiaIce}
                      stroke={TOKENS.colors.bgObsidian}
                      strokeWidth={1.1}
                    />
                    <text
                      x={outpost.dx}
                      y={outpost.dy}
                      textAnchor={outpost.anchor}
                      fill={TOKENS.colors.russiaIce}
                      stroke="rgba(5, 9, 17, 0.94)"
                      strokeWidth={3.2}
                      paintOrder="stroke"
                      fontFamily={FONTS.mono}
                      fontSize={9.5}
                      fontWeight={700}
                      letterSpacing="0.05em"
                    >
                      {outpost.name}
                    </text>
                  </g>
                );
              })}

            {/* European Russia Core Cities (St. Petersburg — Moscow — Krasnodar — Kazan) */}
            {heartlandGlowProgress > 0.1 &&
              SCENE06_GEO.europeanCoreCities.map((city, idx) => {
                const cityReveal = Math.max(
                  0,
                  Math.min(1, (heartlandGlowProgress - idx * 0.12) * 2.4),
                );
                if (cityReveal <= 0.01) {
                  return null;
                }
                const pulseR = city.isPrimary
                  ? 8 + ambientPulse * 6
                  : 5.5 + ambientPulse * 3.5;
                return (
                  <g
                    key={city.id}
                    transform={`translate(${city.x.toFixed(1)}, ${city.y.toFixed(1)})`}
                    opacity={cityReveal}
                  >
                    <circle
                      r={pulseR}
                      fill="none"
                      stroke={TOKENS.colors.imperialAmber}
                      strokeWidth={city.isPrimary ? 1.6 : 1.1}
                      strokeOpacity={city.isPrimary ? 0.65 : 0.45}
                    />
                    <circle
                      r={city.isPrimary ? 4.8 : 3.5}
                      fill={city.isPrimary ? "#FEF3C7" : "#FBBF24"}
                      stroke={TOKENS.colors.bgObsidian}
                      strokeWidth={1.3}
                    />
                    <text
                      x={city.dx}
                      y={city.dy}
                      textAnchor={city.anchor}
                      fill={city.isPrimary ? "#FEF3C7" : "#F8FAFC"}
                      stroke="rgba(5, 9, 17, 0.95)"
                      strokeWidth={3.5}
                      paintOrder="stroke"
                      fontFamily={FONTS.mono}
                      fontSize={city.isPrimary ? 11 : 9.8}
                      fontWeight={700}
                      letterSpacing="0.06em"
                    >
                      {city.name}
                    </text>
                  </g>
                );
              })}

            {/* Subtle Interior Watermark Label in Central Siberian Taiga */}
            {permafrostSweep > 0.65 && (
              <text
                x={SCENE06_GEO.yakutiaFocusAnchor[0]}
                y={SCENE06_GEO.yakutiaFocusAnchor[1] + 8}
                textAnchor="middle"
                fill="#E0F2FE"
                fillOpacity={0.34 * permafrostSweep}
                fontFamily={FONTS.display}
                fontSize={12.5}
                fontWeight={700}
                letterSpacing="0.24em"
              >
                FROZEN SIBERIAN TAIGA
              </text>
            )}

            {/* TOP CALLOUT BAND 1: URAL MOUNTAIN DIVIDE (~60°E) */}
            {uralBannerSpring > 0.01 && (
              <g opacity={uralBannerSpring}>
                <path
                  d={`M 668,54 L ${SCENE06_GEO.uralNorthAnchor[0].toFixed(1)},${SCENE06_GEO.uralNorthAnchor[1].toFixed(1)}`}
                  fill="none"
                  stroke={TOKENS.colors.imperialAmber}
                  strokeWidth={1.3}
                  strokeDasharray="3 3"
                  strokeOpacity={0.85}
                />
                <circle
                  cx={SCENE06_GEO.uralNorthAnchor[0]}
                  cy={SCENE06_GEO.uralNorthAnchor[1]}
                  r={3.5}
                  fill={TOKENS.colors.imperialAmber}
                />
                <g
                  transform={`translate(668, 33) scale(${(0.94 + 0.06 * uralBannerSpring).toFixed(3)}) translate(-140, -21)`}
                >
                  <rect
                    x={0}
                    y={0}
                    width={280}
                    height={42}
                    rx={8}
                    fill="rgba(7, 13, 24, 0.92)"
                    stroke={TOKENS.colors.imperialAmber}
                    strokeWidth={1.2}
                  />
                  <text
                    x={140}
                    y={17}
                    textAnchor="middle"
                    fill="#FDE68A"
                    fontFamily={FONTS.mono}
                    fontSize={11}
                    fontWeight={700}
                    letterSpacing="0.09em"
                  >
                    URAL MOUNTAINS · ~60°E DIVIDE
                  </text>
                  <text
                    x={140}
                    y={33}
                    textAnchor="middle"
                    fill={TOKENS.colors.textSecondary}
                    fontFamily={FONTS.mono}
                    fontSize={9.5}
                    fontWeight={500}
                    letterSpacing="0.05em"
                  >
                    ← EUROPE (23% LAND) | ASIA (77% LAND) →
                  </text>
                </g>
              </g>
            )}

            {/* TOP CALLOUT BAND 2: 65% PERMAFROST ZONE · FROZEN SUBSOIL */}
            {permafrostBannerSpring > 0.01 && (
              <g opacity={permafrostBannerSpring}>
                <path
                  d={`M 1034,54 L ${SCENE06_GEO.yakutiaFocusAnchor[0].toFixed(1)},${(SCENE06_GEO.yakutiaFocusAnchor[1] - 12).toFixed(1)}`}
                  fill="none"
                  stroke={TOKENS.colors.russiaCyan}
                  strokeWidth={1.3}
                  strokeDasharray="3 3"
                  strokeOpacity={0.85}
                />
                <circle
                  cx={SCENE06_GEO.yakutiaFocusAnchor[0]}
                  cy={SCENE06_GEO.yakutiaFocusAnchor[1] - 12}
                  r={3.8}
                  fill={TOKENS.colors.russiaIce}
                />
                <g
                  transform={`translate(1034, 33) scale(${(0.94 + 0.06 * permafrostBannerSpring).toFixed(3)}) translate(-210, -21)`}
                >
                  <rect
                    x={0}
                    y={0}
                    width={420}
                    height={42}
                    rx={8}
                    fill="rgba(7, 15, 29, 0.93)"
                    stroke={TOKENS.colors.russiaCyan}
                    strokeWidth={1.3}
                  />
                  <text
                    x={210}
                    y={18}
                    textAnchor="middle"
                    fill={TOKENS.colors.russiaIce}
                    fontFamily={FONTS.mono}
                    fontSize={12}
                    fontWeight={700}
                    letterSpacing="0.08em"
                  >
                    {displayedPermafrostPct}% PERMAFROST ZONE · FROZEN SUBSOIL
                  </text>
                  <text
                    x={210}
                    y={33}
                    textAnchor="middle"
                    fill="#93C5FD"
                    fontFamily={FONTS.mono}
                    fontSize={9.5}
                    fontWeight={500}
                    letterSpacing="0.06em"
                  >
                    EAST-TO-WEST CRYOSPHERE SWEEP · ~11.1M KM² PERMANENT ICE
                  </text>
                </g>
              </g>
            )}

            {/* Connector Leader Lines from Flank Telemetry Cards to Map Regions */}
            {westCardSpring > 0.1 && (
              <g opacity={westCardSpring * 0.85}>
                <path
                  d={`M 362,226 L ${(SCENE06_GEO.heartlandCenterAnchor[0] - 42).toFixed(1)},${SCENE06_GEO.heartlandCenterAnchor[1].toFixed(1)}`}
                  fill="none"
                  stroke={TOKENS.colors.imperialAmber}
                  strokeWidth={1.3}
                  strokeDasharray="4 4"
                />
                <circle
                  cx={SCENE06_GEO.heartlandCenterAnchor[0] - 42}
                  cy={SCENE06_GEO.heartlandCenterAnchor[1]}
                  r={3.2}
                  fill={TOKENS.colors.imperialAmber}
                />
              </g>
            )}

            {eastCardSpring > 0.1 && (
              <g opacity={eastCardSpring * 0.85}>
                <path
                  d={`M 1430,226 L ${(SCENE06_GEO.siberiaCalloutAnchor[0] + 64).toFixed(1)},${SCENE06_GEO.siberiaCalloutAnchor[1].toFixed(1)}`}
                  fill="none"
                  stroke={TOKENS.colors.russiaCyan}
                  strokeWidth={1.3}
                  strokeDasharray="4 4"
                />
                <circle
                  cx={SCENE06_GEO.siberiaCalloutAnchor[0] + 64}
                  cy={SCENE06_GEO.siberiaCalloutAnchor[1]}
                  r={3.2}
                  fill={TOKENS.colors.russiaCyan}
                />
              </g>
            )}

            {/* Bottom Map Ribbon: Trans-Siberian Corridor Legend */}
            {railDrawProgress > 0.15 && (
              <g opacity={Math.min(1, (railDrawProgress - 0.15) * 2.5)}>
                <rect
                  x={692}
                  y={434}
                  width={408}
                  height={24}
                  rx={6}
                  fill="rgba(5, 9, 17, 0.88)"
                  stroke="rgba(245, 158, 11, 0.42)"
                  strokeWidth={1}
                />
                <line
                  x1={708}
                  y1={446}
                  x2={730}
                  y2={446}
                  stroke="#FCD34D"
                  strokeWidth={2}
                />
                <circle cx={719} cy={446} r={2.8} fill="#FEF3C7" />
                <text
                  x={740}
                  y={450}
                  fill="#FDE68A"
                  fontFamily={FONTS.mono}
                  fontSize={10}
                  fontWeight={700}
                  letterSpacing="0.07em"
                >
                  TRANS-SIBERIAN RAILWAY · 9,289 KM SOUTHERN LIFELINE
                </text>
              </g>
            )}
          </svg>

          {/* LEFT TELEMETRY CARD: EUROPEAN RUSSIA HEARTLAND (West of ~60°E) */}
          <div
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              width: 344,
              borderRadius: 13,
              padding: "14px 16px",
              backgroundColor: "rgba(9, 16, 29, 0.92)",
              border: "1px solid rgba(245, 158, 11, 0.38)",
              boxShadow: "0 14px 32px rgba(0, 0, 0, 0.48)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxSizing: "border-box",
              opacity: westCardSpring,
              transform: `translateX(${interpolate(westCardSpring, [0, 1], [-22, 0]).toFixed(1)}px)`,
            }}
          >
            <div
              style={{
                height: 3,
                width: "100%",
                borderRadius: 2,
                background:
                  "linear-gradient(90deg, #F59E0B 0%, #FDE68A 70%, transparent 100%)",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.imperialAmber,
                  boxShadow: "0 0 10px rgba(245, 158, 11, 0.9)",
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.11em",
                  color: "#FCD34D",
                }}
              >
                WEST OF URALS · EUROPEAN HEARTLAND
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 19.5,
                fontWeight: 700,
                lineHeight: 1.2,
                color: TOKENS.colors.textPrimary,
                letterSpacing: "-0.01em",
              }}
            >
              75%+ OF RUSSIANS LIVE ON{" "}
              <span style={{ color: "#FBBF24" }}>23% OF THE LAND</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: "#FDE68A",
                    letterSpacing: "0.06em",
                  }}
                >
                  POPULATION
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 19,
                    fontWeight: 700,
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  ~110M
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  ~3.96M km² Land
                </div>
              </div>

              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: "#FDE68A",
                    letterSpacing: "0.06em",
                  }}
                >
                  CORE DENSITY
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 19,
                    fontWeight: 700,
                    color: "#FBBF24",
                  }}
                >
                  ~27.5 / km²
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  10× East Siberia
                </div>
              </div>
            </div>

            {/* Core Heartland Cities Grid */}
            <div
              style={{
                padding: "9px 10px",
                borderRadius: 9,
                backgroundColor: "rgba(15, 23, 42, 0.78)",
                border: "1px solid rgba(148, 163, 184, 0.16)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
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
                EUROPEAN CORE TRIANGLE &amp; VOLGA HUB
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "5px 8px",
                }}
              >
                {[
                  "St. Petersburg",
                  "Moscow (21.5M)",
                  "Krasnodar",
                  "Kazan",
                ].map((cityLabel) => (
                  <div
                    key={cityLabel}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: FONTS.mono,
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "#FEF3C7",
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        backgroundColor: "#FBBF24",
                        flexShrink: 0,
                      }}
                    />
                    {cityLabel}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 11.5,
                lineHeight: 1.38,
                color: TOKENS.colors.textSecondary,
              }}
            >
              Atlantic drift warmth, fertile chernozem soil, and dense rail hubs
              anchor Russia&apos;s urban civilization here.
            </div>
          </div>

          {/* RIGHT TELEMETRY CARD: ASIAN RUSSIA & PERMAFROST (East of ~60°E) */}
          <div
            style={{
              position: "absolute",
              top: 18,
              right: 18,
              width: 344,
              borderRadius: 13,
              padding: "14px 16px",
              backgroundColor: "rgba(9, 16, 29, 0.92)",
              border: "1px solid rgba(56, 189, 248, 0.38)",
              boxShadow: "0 14px 32px rgba(0, 0, 0, 0.48)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxSizing: "border-box",
              opacity: eastCardSpring,
              transform: `translateX(${interpolate(eastCardSpring, [0, 1], [22, 0]).toFixed(1)}px)`,
            }}
          >
            <div
              style={{
                height: 3,
                width: "100%",
                borderRadius: 2,
                background:
                  "linear-gradient(90deg, transparent 0%, #38BDF8 35%, #BAE6FD 100%)",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.russiaCyan,
                  boxShadow: "0 0 10px rgba(56, 189, 248, 0.9)",
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.11em",
                  color: TOKENS.colors.russiaIce,
                }}
              >
                EAST OF URALS · SIBERIA &amp; FAR EAST
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 19.5,
                fontWeight: 700,
                lineHeight: 1.2,
                color: TOKENS.colors.textPrimary,
                letterSpacing: "-0.01em",
              }}
            >
              77% OF LAND ·{" "}
              <span style={{ color: TOKENS.colors.russiaCyan }}>
                ONLY ~25% OF POPULATION
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  backgroundColor: "rgba(56, 189, 248, 0.1)",
                  border: "1px solid rgba(56, 189, 248, 0.26)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaIce,
                    letterSpacing: "0.06em",
                  }}
                >
                  POPULATION
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 19,
                    fontWeight: 700,
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  ~36M
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  ~13.1M km² Land
                </div>
              </div>

              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  backgroundColor: "rgba(56, 189, 248, 0.1)",
                  border: "1px solid rgba(56, 189, 248, 0.26)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaIce,
                    letterSpacing: "0.06em",
                  }}
                >
                  TAIGA DENSITY
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 19,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaCyan,
                  }}
                >
                  ~2.7 / km²
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 9.5,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  Yakutia: 0.3 / km²
                </div>
              </div>
            </div>

            {/* Permafrost Cryosphere Lock Box */}
            <div
              style={{
                padding: "9px 10px",
                borderRadius: 9,
                backgroundColor: "rgba(12, 74, 110, 0.36)",
                border: "1px solid rgba(186, 230, 253, 0.26)",
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
                  letterSpacing: "0.07em",
                  color: TOKENS.colors.russiaIce,
                }}
              >
                65% PERMAFROST ZONE · FROZEN SUBSOIL
              </span>
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 11.2,
                  lineHeight: 1.35,
                  color: "#E2E8F0",
                }}
              >
                Ground frozen up to 1,500m deep prevents conventional farming and
                demands concrete stilts for buildings.
              </span>
            </div>

            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 11.5,
                lineHeight: 1.38,
                color: TOKENS.colors.textSecondary,
              }}
            >
              Most Siberian cities cluster along the thin southern{" "}
              <span style={{ color: "#FDE68A", fontWeight: 600 }}>
                Trans-Siberian Railway
              </span>{" "}
              corridor.
            </div>
          </div>
        </div>

        {/* ROW 3: TWIN STACKED PROPORTIONAL BARS (140px) */}
        <div
          style={{
            height: BARS_CARD_HEIGHT,
            borderRadius: 15,
            padding: "11px 20px",
            backgroundColor: TOKENS.colors.bgCardElevated,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.44)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          {/* BAR 1: TERRITORY SHARE (23% West | 77% East) */}
          <div
            style={{
              height: 40,
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            {/* Left Label */}
            <div style={{ width: 236, flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 13.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: TOKENS.colors.textPrimary,
                }}
              >
                TERRITORY SHARE
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textMuted,
                }}
              >
                17.1M km² Total Landmass
              </div>
            </div>

            {/* Stacked Proportional Track */}
            <div
              style={{
                flex: 1,
                height: 34,
                borderRadius: 8,
                backgroundColor: "rgba(5, 9, 17, 0.85)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                overflow: "hidden",
                display: "flex",
                position: "relative",
              }}
            >
              {/* 23% West (European Russia) */}
              <div
                style={{
                  width: `${(WEST_LAND_PCT * territoryBarProgress).toFixed(2)}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #D97706 0%, #F59E0B 65%, #FBBF24 100%)",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 12,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  borderRight:
                    territoryBarProgress > 0.05 ? "2px solid #FFFBEB" : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: TOKENS.colors.bgObsidian,
                    opacity: territoryBarProgress > 0.45 ? 1 : 0,
                  }}
                >
                  {displayedWestLand}% WEST · ~4.0M km²
                </span>
              </div>

              {/* 77% East (Asian Russia / Siberia) */}
              <div
                style={{
                  width: `${(EAST_LAND_PCT * territoryBarProgress).toFixed(2)}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #0C4A6E 0%, #0369A1 55%, #0284C7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  position: "relative",
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                  }}
                >
                  <rect
                    width="100%"
                    height="100%"
                    fill={`url(#${barFrostPatternId})`}
                  />
                </svg>
                <span
                  style={{
                    position: "relative",
                    fontFamily: FONTS.mono,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "#F0F9FF",
                    opacity: territoryBarProgress > 0.35 ? 1 : 0,
                  }}
                >
                  {displayedEastLand}% EAST · ASIAN RUSSIA &amp; SIBERIA (~13.1M
                  km²)
                </span>
                <span
                  style={{
                    position: "relative",
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: TOKENS.colors.russiaIce,
                    opacity: territoryBarProgress > 0.75 ? 0.92 : 0,
                  }}
                >
                  65% PERMAFROST LOCKED
                </span>
              </div>
            </div>

            {/* Right Explicit Ratio Readout */}
            <div
              style={{
                width: 228,
                flexShrink: 0,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: TOKENS.colors.russiaIce,
                }}
              >
                {displayedWestLand}% West | {displayedEastLand}% East
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                3.3× More Land in Asia
              </div>
            </div>
          </div>

          {/* MIDDLE SHEAR CONNECTOR: THE URAL DEMOGRAPHIC INVERSION (23% -> 75%) */}
          <div
            style={{
              height: 28,
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div style={{ width: 236, flexShrink: 0 }} />
            <div
              style={{
                flex: 1,
                height: 28,
                position: "relative",
                opacity: shearConnectorAlpha,
              }}
            >
              <svg
                width="100%"
                height="28"
                viewBox="0 0 1000 28"
                preserveAspectRatio="none"
                style={{ display: "block", overflow: "visible" }}
              >
                <polygon
                  points={`0,0 ${(WEST_LAND_PCT * 10).toFixed(0)},0 ${(WEST_POP_PCT * 10).toFixed(0)},28 0,28`}
                  fill="rgba(245, 158, 11, 0.14)"
                />
                <path
                  d={`M ${(WEST_LAND_PCT * 10).toFixed(0)},0 C ${(WEST_LAND_PCT * 10).toFixed(0)},14 ${(WEST_POP_PCT * 10).toFixed(0)},14 ${(WEST_POP_PCT * 10).toFixed(0)},28`}
                  fill="none"
                  stroke={TOKENS.colors.imperialAmber}
                  strokeWidth={2.2}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: "49%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  padding: "2px 10px",
                  borderRadius: 999,
                  backgroundColor: "rgba(5, 9, 17, 0.92)",
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  fontFamily: FONTS.mono,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#FDE68A",
                  whiteSpace: "nowrap",
                }}
              >
                URAL DIVIDE (~60°E) INVERSION · 23% OF LAND HOLDS 75%+ OF PEOPLE →
              </div>
            </div>
            <div style={{ width: 228, flexShrink: 0 }} />
          </div>

          {/* BAR 2: POPULATION SHARE (75% West | 25% East) */}
          <div
            style={{
              height: 40,
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            {/* Left Label */}
            <div style={{ width: 236, flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 13.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: TOKENS.colors.textPrimary,
                }}
              >
                POPULATION SHARE
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: "#FCD34D",
                }}
              >
                ~146M Citizens · 8.4 / km² Avg
              </div>
            </div>

            {/* Stacked Proportional Track */}
            <div
              style={{
                flex: 1,
                height: 34,
                borderRadius: 8,
                backgroundColor: "rgba(5, 9, 17, 0.85)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                overflow: "hidden",
                display: "flex",
                position: "relative",
              }}
            >
              {/* 75% West (European Core) */}
              <div
                style={{
                  width: `${(WEST_POP_PCT * populationBarProgress).toFixed(2)}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #F59E0B 0%, #FBBF24 72%, #FDE68A 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  borderRight:
                    populationBarProgress > 0.05 ? "2px solid #FFFBEB" : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: TOKENS.colors.bgObsidian,
                    opacity: populationBarProgress > 0.35 ? 1 : 0,
                  }}
                >
                  {displayedWestPop}% WEST · EUROPEAN HEARTLAND (~110M PEOPLE)
                </span>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#1E293B",
                    opacity: populationBarProgress > 0.75 ? 1 : 0,
                  }}
                >
                  ~27.5 PEOPLE / KM²
                </span>
              </div>

              {/* 25% East (Asian Russia / Siberia) */}
              <div
                style={{
                  width: `${(EAST_POP_PCT * populationBarProgress).toFixed(2)}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #0E2A47 0%, #082F49 100%)",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 12,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "#E0F2FE",
                    opacity: populationBarProgress > 0.45 ? 1 : 0,
                  }}
                >
                  {displayedEastPop}% EAST · ~36M (~2.7 / km²)
                </span>
              </div>
            </div>

            {/* Right Explicit Ratio Readout */}
            <div
              style={{
                width: 228,
                flexShrink: 0,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "#FBBF24",
                }}
              >
                {displayedWestPop}% West | {displayedEastPop}% East
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                10× Higher Density West
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene06FrozenGiantUralDivide;
