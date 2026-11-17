import React, { useId } from "react";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  MultiLineString,
} from "geojson";
import {
  geoAzimuthalEqualArea,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoMercator,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import { feature } from "topojson-client";
import countries110m from "world-atlas/countries-110m.json";
import countries50m from "world-atlas/countries-50m.json";
import { FONTS } from "../theme/fonts";
import { TOKENS } from "../theme/tokens";

export const RUSSIA_CENTER_LON_LAT: [number, number] = [98, 62];
export const MOSCOW_LON_LAT: [number, number] = [37.62, 55.75];
export const KALININGRAD_LON_LAT: [number, number] = [20.51, 54.71];
export const YAKUTSK_LON_LAT: [number, number] = [129.73, 62.03];
export const KAMCHATKA_LON_LAT: [number, number] = [158.65, 53.02];
export const CHUKOTKA_EAST_LON_LAT: [number, number] = [-170.2, 66.0];
export const BANGLADESH_CENTROID_LON_LAT: [number, number] = [90.35, 23.68];
export const DHAKA_LON_LAT: [number, number] = [90.41, 23.81];

const FALLBACK_RUSSIA_GEOMETRY: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [28, 55],
      [60, 68],
      [110, 73],
      [170, 66],
      [140, 48],
      [90, 50],
      [42, 44],
      [28, 55],
    ],
  ],
};

const FALLBACK_BANGLADESH_GEOMETRY: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [88.1, 26.5],
      [92.3, 25.1],
      [92.6, 21.2],
      [89.1, 21.7],
      [88.1, 26.5],
    ],
  ],
};

const isRussiaFeature = (
  f: Feature<Geometry, { name?: string }>,
): boolean => {
  const rawId = f.id !== undefined ? String(f.id) : "";
  const paddedId = rawId ? rawId.padStart(3, "0") : "";
  const name = f.properties?.name ?? "";
  return (
    rawId === "643" ||
    paddedId === "643" ||
    name === "Russia" ||
    name === "Russian Federation"
  );
};

const isBangladeshFeature = (
  f: Feature<Geometry, { name?: string }>,
): boolean => {
  const rawId = f.id !== undefined ? String(f.id) : "";
  const paddedId = rawId ? rawId.padStart(3, "0") : "";
  const name = f.properties?.name ?? "";
  return (
    rawId === "050" ||
    rawId === "50" ||
    paddedId === "050" ||
    name === "Bangladesh"
  );
};

/**
 * Module-scope memoized GeoJSON extractions (parsed once at startup, never per-frame).
 */
export const ALL_COUNTRIES_110M: FeatureCollection<Geometry, { name: string }> =
  feature(countries110m, countries110m.objects.countries);

export const ALL_COUNTRIES_50M: FeatureCollection<Geometry, { name: string }> =
  feature(countries50m, countries50m.objects.countries);

export const WORLD_LAND_110M: FeatureCollection<Geometry, GeoJsonProperties> =
  feature(countries110m, countries110m.objects.land);

export const RUSSIA_FEATURE_110M: Feature<Geometry, { name: string }> =
  ALL_COUNTRIES_110M.features.find(isRussiaFeature) ?? {
    type: "Feature",
    id: "643",
    properties: { name: "Russia" },
    geometry: FALLBACK_RUSSIA_GEOMETRY,
  };

export const BANGLADESH_FEATURE_110M: Feature<Geometry, { name: string }> =
  ALL_COUNTRIES_110M.features.find(isBangladeshFeature) ?? {
    type: "Feature",
    id: "050",
    properties: { name: "Bangladesh" },
    geometry: FALLBACK_BANGLADESH_GEOMETRY,
  };

export const RUSSIA_FEATURE: Feature<Geometry, { name: string }> =
  ALL_COUNTRIES_50M.features.find(isRussiaFeature) ?? RUSSIA_FEATURE_110M;

export const BANGLADESH_FEATURE: Feature<Geometry, { name: string }> =
  ALL_COUNTRIES_50M.features.find(isBangladeshFeature) ??
  BANGLADESH_FEATURE_110M;

export const GRATICULE_10: MultiLineString = geoGraticule10();

export interface TimezoneMeridianSpec {
  index: number;
  utcLabel: string;
  zoneName: string;
  lon: number;
  line: LineString;
}

const RUSSIA_TIMEZONE_DEFS: ReadonlyArray<{
  utcLabel: string;
  zoneName: string;
  lon: number;
}> = [
  { utcLabel: "UTC+2", zoneName: "Kaliningrad", lon: 20.5 },
  { utcLabel: "UTC+3", zoneName: "Moscow", lon: 37.6 },
  { utcLabel: "UTC+4", zoneName: "Samara", lon: 50.1 },
  { utcLabel: "UTC+5", zoneName: "Yekaterinburg", lon: 60.6 },
  { utcLabel: "UTC+6", zoneName: "Omsk", lon: 73.4 },
  { utcLabel: "UTC+7", zoneName: "Krasnoyarsk", lon: 92.9 },
  { utcLabel: "UTC+8", zoneName: "Irkutsk", lon: 104.3 },
  { utcLabel: "UTC+9", zoneName: "Yakutsk", lon: 129.7 },
  { utcLabel: "UTC+10", zoneName: "Vladivostok", lon: 135.9 },
  { utcLabel: "UTC+11", zoneName: "Magadan", lon: 150.8 },
  { utcLabel: "UTC+12", zoneName: "Kamchatka", lon: 162.0 },
];

const buildMeridianLineString = (
  lon: number,
  minLat = 45,
  maxLat = 77,
  steps = 20,
): LineString => {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const lat = minLat + ((maxLat - minLat) * i) / steps;
    coords.push([lon, lat]);
  }
  return {
    type: "LineString",
    coordinates: coords,
  };
};

export const RUSSIA_TIMEZONE_MERIDIANS: ReadonlyArray<TimezoneMeridianSpec> =
  RUSSIA_TIMEZONE_DEFS.map((def, index) => ({
    index,
    utcLabel: def.utcLabel,
    zoneName: def.zoneName,
    lon: def.lon,
    line: buildMeridianLineString(def.lon),
  }));

const TRANS_RUSSIA_SPAN_ARC: LineString = (() => {
  const waypoints: [number, number][] = [
    KALININGRAD_LON_LAT,
    MOSCOW_LON_LAT,
    [73.4, 55.0],
    [104.3, 56.5],
    YAKUTSK_LON_LAT,
    KAMCHATKA_LON_LAT,
  ];
  const coordinates: [number, number][] = [];
  for (let seg = 0; seg < waypoints.length - 1; seg += 1) {
    const interp = geoInterpolate(waypoints[seg], waypoints[seg + 1]);
    const steps = 12;
    for (let s = 0; s <= steps; s += 1) {
      if (seg > 0 && s === 0) {
        continue;
      }
      coordinates.push(interp(s / steps));
    }
  }
  return {
    type: "LineString",
    coordinates,
  };
})();

const SIBERIA_TO_DHAKA_ARC_POINTS: ReadonlyArray<[number, number]> = (() => {
  const interp = geoInterpolate([88.0, 60.0], DHAKA_LON_LAT);
  const pts: [number, number][] = [];
  const total = 36;
  for (let i = 0; i <= total; i += 1) {
    pts.push(interp(i / total));
  }
  return pts;
})();

/**
 * Self-verifying spherical containment check on RUSSIA_FEATURE_110M so
 * TopoJSON winding polarity is handled deterministically across environments.
 */
const RUSSIA_CONTAINS_MODE: "direct" | "inverted" | "analytic" = (() => {
  const siberiaCheck = geoContains(RUSSIA_FEATURE_110M, [95, 63]);
  const equatorialOceanCheck = geoContains(RUSSIA_FEATURE_110M, [80, 0]);
  if (siberiaCheck && !equatorialOceanCheck) {
    return "direct";
  }
  if (!siberiaCheck && equatorialOceanCheck) {
    return "inverted";
  }
  return "analytic";
})();

const isLonLatInsideRussia = (lon: number, lat: number): boolean => {
  if (RUSSIA_CONTAINS_MODE === "direct") {
    return geoContains(RUSSIA_FEATURE_110M, [lon, lat]);
  }
  if (RUSSIA_CONTAINS_MODE === "inverted") {
    return !geoContains(RUSSIA_FEATURE_110M, [lon, lat]);
  }
  const normalizedLon = lon < -150 ? lon + 360 : lon;
  return (
    normalizedLon >= 29 &&
    normalizedLon <= 186 &&
    lat >= 51.5 &&
    lat <= 70.5
  );
};

export interface RussiaTileAnchor {
  index: number;
  x: number;
  y: number;
  lon: number;
  lat: number;
  waveDistance: number;
}

export interface EqualAreaComparisonGeometry {
  width: number;
  height: number;
  padding: number;
  scale: number;
  translate: [number, number];
  russiaPath: string;
  surroundingLandPath: string;
  graticulePath: string;
  mercatorGhostPath: string;
  bangladeshTruePositionPath: string;
  bangladeshCenteredPath: string;
  bangladeshBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  russiaBounds: [[number, number], [number, number]];
  russiaPixelArea: number;
  bangladeshPixelArea: number;
  measuredAreaRatio: number;
  moscowPoint: [number, number];
  kaliningradPoint: [number, number];
  yakutskPoint: [number, number];
  kamchatkaPoint: [number, number];
  chukotkaPoint: [number, number];
  interiorTileAnchors: ReadonlyArray<RussiaTileAnchor>;
}

const normalizedPathByScaleCache = new Map<string, string>();
const equalAreaGeometryCache = new Map<string, EqualAreaComparisonGeometry>();

/**
 * Returns the normalized (0, 0)-centered SVG `<path d="..." />` string of Bangladesh
 * using Lambert Azimuthal Equal-Area centered on its centroid [90.35, 23.68] at the
 * exact `scale` passed in. Because Lambert Azimuthal Equal-Area has constant unit-sphere
 * Jacobian everywhere, matching Russia's `.scale()` guarantees an exact 1 : 115.2
 * screen pixel area ratio.
 */
export function getBangladeshCenteredEqualAreaPath(scale: number): string {
  const key = scale.toFixed(4);
  const cached = normalizedPathByScaleCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const bdProjection = geoAzimuthalEqualArea()
    .rotate([
      -BANGLADESH_CENTROID_LON_LAT[0],
      -BANGLADESH_CENTROID_LON_LAT[1],
    ])
    .scale(scale)
    .translate([0, 0]);

  const pathStr = geoPath(bdProjection)(BANGLADESH_FEATURE) ?? "";
  normalizedPathByScaleCache.set(key, pathStr);
  return pathStr;
}

/**
 * Convenience helper returning the normalized centered SVG path of Bangladesh
 * matched to Russia fitted inside `(width, height, padding)`.
 */
export function getBangladeshPathForRussiaBox(
  width: number,
  height: number,
  padding = 28,
): string {
  return computeEqualAreaComparisonGeometry(width, height, padding)
    .bangladeshCenteredPath;
}

const buildInteriorRussiaTileAnchors = (
  invertFn: ((point: [number, number]) => [number, number] | null) | undefined,
  russiaBounds: [[number, number], [number, number]],
  moscowPoint: [number, number],
  russiaPixelArea: number,
  bdWidth: number,
  bdHeight: number,
  targetCount = 115,
): ReadonlyArray<RussiaTileAnchor> => {
  const [[minX, minY], [maxX, maxY]] = russiaBounds;
  const baseCellArea = Math.max(120, russiaPixelArea / targetCount);
  const aspect = Math.max(0.55, Math.min(1.15, bdWidth / Math.max(1, bdHeight)));
  const baseStepX = Math.sqrt(baseCellArea * aspect);
  const baseStepY = Math.sqrt(baseCellArea / aspect);

  const passes: ReadonlyArray<{ spacingScale: number; marginPx: number }> = [
    { spacingScale: 0.92, marginPx: bdWidth * 0.24 },
    { spacingScale: 0.84, marginPx: bdWidth * 0.2 },
    { spacingScale: 0.76, marginPx: bdWidth * 0.15 },
    { spacingScale: 0.68, marginPx: bdWidth * 0.1 },
    { spacingScale: 0.58, marginPx: bdWidth * 0.04 },
    { spacingScale: 0.48, marginPx: 0 },
  ];

  let collected: Array<{
    x: number;
    y: number;
    lon: number;
    lat: number;
    waveDistance: number;
  }> = [];

  for (const pass of passes) {
    const stepX = Math.max(10, baseStepX * pass.spacingScale);
    const stepY = Math.max(10, baseStepY * pass.spacingScale);
    const margin = pass.marginPx;
    const minDistFromMoscow = stepX * 0.82;
    const candidates: Array<{
      x: number;
      y: number;
      lon: number;
      lat: number;
      waveDistance: number;
    }> = [];

    let rowIndex = 0;
    for (let y = minY + stepY * 0.5; y <= maxY - stepY * 0.35; y += stepY) {
      const rowOffset = rowIndex % 2 === 1 ? stepX * 0.5 : 0;
      for (
        let x = minX + stepX * 0.5 + rowOffset;
        x <= maxX - stepX * 0.35;
        x += stepX
      ) {
        const dxMoscow = x - moscowPoint[0];
        const dyMoscow = y - moscowPoint[1];
        const distMoscow = Math.hypot(dxMoscow, dyMoscow);
        if (distMoscow < minDistFromMoscow) {
          continue;
        }

        if (!invertFn) {
          continue;
        }
        const centerLonLat = invertFn([x, y]);
        if (!centerLonLat) {
          continue;
        }
        if (!isLonLatInsideRussia(centerLonLat[0], centerLonLat[1])) {
          continue;
        }

        if (margin > 0) {
          const leftPt = invertFn([x - margin, y]);
          const rightPt = invertFn([x + margin, y]);
          const topPt = invertFn([x, y - margin]);
          const bottomPt = invertFn([x, y + margin]);
          if (
            !leftPt ||
            !rightPt ||
            !topPt ||
            !bottomPt ||
            !isLonLatInsideRussia(leftPt[0], leftPt[1]) ||
            !isLonLatInsideRussia(rightPt[0], rightPt[1]) ||
            !isLonLatInsideRussia(topPt[0], topPt[1]) ||
            !isLonLatInsideRussia(bottomPt[0], bottomPt[1])
          ) {
            continue;
          }
        }

        const waveDistance =
          distMoscow * 0.55 + Math.max(0, x - moscowPoint[0]) * 0.65;

        candidates.push({
          x,
          y,
          lon: centerLonLat[0],
          lat: centerLonLat[1],
          waveDistance,
        });
      }
      rowIndex += 1;
    }

    collected = candidates;
    if (candidates.length >= targetCount - 1) {
      break;
    }
  }

  collected.sort((a, b) => a.waveDistance - b.waveDistance);

  const needed = targetCount - 1;
  const selected: RussiaTileAnchor[] = [
    {
      index: 0,
      x: moscowPoint[0],
      y: moscowPoint[1],
      lon: MOSCOW_LON_LAT[0],
      lat: MOSCOW_LON_LAT[1],
      waveDistance: 0,
    },
  ];

  if (collected.length >= needed) {
    for (let i = 0; i < needed; i += 1) {
      const pickIdx = Math.min(
        collected.length - 1,
        Math.floor(((i + 0.5) * collected.length) / needed),
      );
      const item = collected[pickIdx];
      selected.push({
        index: i + 1,
        x: item.x,
        y: item.y,
        lon: item.lon,
        lat: item.lat,
        waveDistance: item.waveDistance,
      });
    }
  } else {
    for (let i = 0; i < needed; i += 1) {
      const col = i % 15;
      const row = Math.floor(i / 15);
      const fx = minX + (maxX - minX) * (0.14 + (col / 15) * 0.74);
      const fy = minY + (maxY - minY) * (0.28 + (row / 8) * 0.46);
      selected.push({
        index: i + 1,
        x: fx,
        y: fy,
        lon: 45 + col * 8,
        lat: 56 + (row % 3) * 3,
        waveDistance: Math.hypot(fx - moscowPoint[0], fy - moscowPoint[1]),
      });
    }
  }

  return selected;
};

/**
 * Computes and memoizes the Lambert Azimuthal Equal-Area projection of Russia
 * (`rotate([-98, -62])`) alongside Bangladesh projected at the identical scale
 * (`rotate([-90.35, -23.68])`), plus a Mercator comparison silhouette and 115
 * interior Russia tile anchors.
 */
export function computeEqualAreaComparisonGeometry(
  width: number,
  height: number,
  padding = 28,
): EqualAreaComparisonGeometry {
  const cacheKey = `${Math.round(width)}x${Math.round(height)}x${Math.round(padding)}`;
  const existing = equalAreaGeometryCache.get(cacheKey);
  if (existing !== undefined) {
    return existing;
  }

  const russiaProjection = geoAzimuthalEqualArea()
    .rotate([-RUSSIA_CENTER_LON_LAT[0], -RUSSIA_CENTER_LON_LAT[1]])
    .clipAngle(135)
    .fitExtent(
      [
        [padding, padding],
        [width - padding, height - padding],
      ],
      RUSSIA_FEATURE,
    );

  const scale = russiaProjection.scale();
  const rawTranslate = russiaProjection.translate();
  const translate: [number, number] = [rawTranslate[0], rawTranslate[1]];

  const russiaPathGen = geoPath(russiaProjection);
  const russiaPath = russiaPathGen(RUSSIA_FEATURE) ?? "";
  const surroundingLandPath = russiaPathGen(WORLD_LAND_110M) ?? "";
  const graticulePath = russiaPathGen(GRATICULE_10) ?? "";
  const bangladeshTruePositionPath = russiaPathGen(BANGLADESH_FEATURE) ?? "";

  const bdCenteredProjection = geoAzimuthalEqualArea()
    .rotate([
      -BANGLADESH_CENTROID_LON_LAT[0],
      -BANGLADESH_CENTROID_LON_LAT[1],
    ])
    .scale(scale)
    .translate([0, 0]);
  const bdCenteredPathGen = geoPath(bdCenteredProjection);
  const bangladeshCenteredPath = getBangladeshCenteredEqualAreaPath(scale);
  const [[bdMinX, bdMinY], [bdMaxX, bdMaxY]] =
    bdCenteredPathGen.bounds(BANGLADESH_FEATURE);

  const russiaBounds = russiaPathGen.bounds(RUSSIA_FEATURE);
  const russiaPixelArea = Math.max(1, russiaPathGen.area(RUSSIA_FEATURE));
  const bangladeshPixelArea = Math.max(
    1,
    bdCenteredPathGen.area(BANGLADESH_FEATURE),
  );

  // Mercator reference outline rotated to 98E to avoid antimeridian splitting
  const mercatorProjection = geoMercator()
    .rotate([-RUSSIA_CENTER_LON_LAT[0], 0])
    .fitExtent(
      [
        [padding * 0.5, padding * 0.2],
        [width - padding * 0.5, height - padding * 0.2],
      ],
      RUSSIA_FEATURE_110M,
    );
  const mercatorGhostPath =
    geoPath(mercatorProjection)(RUSSIA_FEATURE_110M) ?? "";

  const projectSafe = (
    lonLat: [number, number],
    fallback: [number, number],
  ): [number, number] => {
    const pt = russiaProjection(lonLat);
    return pt ? [pt[0], pt[1]] : fallback;
  };

  const moscowPoint = projectSafe(MOSCOW_LON_LAT, [
    width * 0.21,
    height * 0.45,
  ]);
  const kaliningradPoint = projectSafe(KALININGRAD_LON_LAT, [
    width * 0.11,
    height * 0.39,
  ]);
  const yakutskPoint = projectSafe(YAKUTSK_LON_LAT, [
    width * 0.69,
    height * 0.48,
  ]);
  const kamchatkaPoint = projectSafe(KAMCHATKA_LON_LAT, [
    width * 0.87,
    height * 0.57,
  ]);
  const chukotkaPoint = projectSafe(CHUKOTKA_EAST_LON_LAT, [
    width * 0.91,
    height * 0.36,
  ]);

  const bdWidth = Math.max(8, bdMaxX - bdMinX);
  const bdHeight = Math.max(8, bdMaxY - bdMinY);

  const rawInvert = russiaProjection.invert;
  const boundInvert = rawInvert
    ? (pt: [number, number]): [number, number] | null =>
        rawInvert.call(russiaProjection, pt)
    : undefined;

  const interiorTileAnchors = buildInteriorRussiaTileAnchors(
    boundInvert,
    russiaBounds,
    moscowPoint,
    russiaPixelArea,
    bdWidth,
    bdHeight,
    115,
  );

  const computed: EqualAreaComparisonGeometry = {
    width,
    height,
    padding,
    scale,
    translate,
    russiaPath,
    surroundingLandPath,
    graticulePath,
    mercatorGhostPath,
    bangladeshTruePositionPath,
    bangladeshCenteredPath,
    bangladeshBounds: {
      minX: bdMinX,
      minY: bdMinY,
      maxX: bdMaxX,
      maxY: bdMaxY,
      width: bdWidth,
      height: bdHeight,
    },
    russiaBounds,
    russiaPixelArea,
    bangladeshPixelArea,
    measuredAreaRatio: russiaPixelArea / bangladeshPixelArea,
    moscowPoint,
    kaliningradPoint,
    yakutskPoint,
    kamchatkaPoint,
    chukotkaPoint,
    interiorTileAnchors,
  };

  equalAreaGeometryCache.set(cacheKey, computed);
  return computed;
}

export interface OrthographicGlobeProps {
  /** Target longitude facing the viewer in degrees East (e.g. 88 for Siberia, 90.4 for Bangladesh). */
  rotateLon: number;
  /** Target latitude facing the viewer in degrees North (e.g. 60 for Siberia, 24 for Bangladesh). */
  rotateLat: number;
  /** Orthographic globe radius in pixels. */
  scale: number;
  width: number;
  height: number;
  /** Optional subtle camera roll in degrees. */
  rollDeg?: number;
  /** 0..1 sweep progress of the 11 Russian timezone meridian arcs across Russia. */
  timezoneSweepProgress?: number;
  /** Deterministic continuous phase (in radians or frames * speed) for Bangladesh's beacon pulse. */
  beaconPulsePhase?: number;
  /** 0..1 intensity of Bangladesh highlight beacon. */
  bangladeshFocus?: number;
  /** 0..1 progress of great-circle telemetry arc linking Siberia to Dhaka. */
  connectionArcProgress?: number;
  /** Show projected cartographic labels on front hemisphere. */
  showLabels?: boolean;
}

export const OrthographicGlobe: React.FC<OrthographicGlobeProps> = ({
  rotateLon,
  rotateLat,
  scale,
  width,
  height,
  rollDeg = 0,
  timezoneSweepProgress = 0,
  beaconPulsePhase = 0,
  bangladeshFocus = 1,
  connectionArcProgress = 0,
  showLabels = true,
}) => {
  const rawUid = useId().replace(/:/g, "");
  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.max(24, scale);

  const projection = geoOrthographic()
    .scale(radius)
    .translate([cx, cy])
    .rotate([-rotateLon, -rotateLat, rollDeg])
    .clipAngle(90);

  const pathGen = geoPath(projection);

  const worldLandD = pathGen(WORLD_LAND_110M) ?? "";
  const countryBordersD = pathGen(ALL_COUNTRIES_110M) ?? "";
  const graticuleD = pathGen(GRATICULE_10) ?? "";
  const russiaD = pathGen(RUSSIA_FEATURE) ?? "";
  const bangladeshD = pathGen(BANGLADESH_FEATURE) ?? "";
  const russiaSpanArcD =
    timezoneSweepProgress > 0.02 ? (pathGen(TRANS_RUSSIA_SPAN_ARC) ?? "") : "";

  const focusLonLat: [number, number] = [rotateLon, rotateLat];

  const getFrontPin = (
    coords: [number, number],
  ): { x: number; y: number; visibility: number } | null => {
    const angularDist = geoDistance(coords, focusLonLat);
    if (angularDist >= 1.44) {
      return null;
    }
    const projected = projection(coords);
    if (!projected) {
      return null;
    }
    const edgeFade = Math.min(1, Math.max(0, (1.44 - angularDist) / 0.25));
    return {
      x: projected[0],
      y: projected[1],
      visibility: edgeFade,
    };
  };

  const dhakaPin = getFrontPin(DHAKA_LON_LAT);
  const moscowPin = getFrontPin(MOSCOW_LON_LAT);
  const siberiaPin = getFrontPin([94.0, 62.5]);

  const pulseWaveA = (beaconPulsePhase % 1 + 1) % 1;
  const pulseWaveB = ((beaconPulsePhase + 0.5) % 1 + 1) % 1;

  const connectionArcD = (() => {
    const clamped = Math.max(0, Math.min(1, connectionArcProgress));
    if (clamped <= 0.01) {
      return "";
    }
    const endIdx = Math.max(
      1,
      Math.round(clamped * (SIBERIA_TO_DHAKA_ARC_POINTS.length - 1)),
    );
    const partialLine: LineString = {
      type: "LineString",
      coordinates: SIBERIA_TO_DHAKA_ARC_POINTS.slice(0, endIdx + 1),
    };
    return pathGen(partialLine) ?? "";
  })();

  const oceanGradId = `globe-ocean-${rawUid}`;
  const atmosphereGradId = `globe-atmos-${rawUid}`;
  const terminatorGradId = `globe-shade-${rawUid}`;
  const russiaFillGradId = `globe-ru-fill-${rawUid}`;
  const sphereClipId = `globe-clip-${rawUid}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <radialGradient id={atmosphereGradId} cx="50%" cy="50%" r="50%">
          <stop offset="76%" stopColor="#38BDF8" stopOpacity="0" />
          <stop offset="89%" stopColor="#38BDF8" stopOpacity="0.18" />
          <stop offset="96%" stopColor="#10B981" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#050911" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={oceanGradId} cx="36%" cy="30%" r="68%">
          <stop offset="0%" stopColor="#132946" />
          <stop offset="45%" stopColor="#0A182D" />
          <stop offset="82%" stopColor="#060E1C" />
          <stop offset="100%" stopColor="#030710" />
        </radialGradient>

        <radialGradient id={terminatorGradId} cx="32%" cy="26%" r="74%">
          <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.14" />
          <stop offset="52%" stopColor="#0F172A" stopOpacity="0" />
          <stop offset="88%" stopColor="#02040A" stopOpacity="0.54" />
          <stop offset="100%" stopColor="#010308" stopOpacity="0.78" />
        </radialGradient>

        <linearGradient id={russiaFillGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.62" />
          <stop offset="55%" stopColor="#0284C7" stopOpacity="0.52" />
          <stop offset="100%" stopColor="#0C4A6E" stopOpacity="0.68" />
        </linearGradient>

        <clipPath id={sphereClipId}>
          <circle cx={cx} cy={cy} r={radius} />
        </clipPath>
      </defs>

      {/* Outer atmospheric limb halo */}
      <circle
        cx={cx}
        cy={cy}
        r={radius * 1.15}
        fill={`url(#${atmosphereGradId})`}
      />

      {/* Orbital calibration ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + 12}
        fill="none"
        stroke="rgba(148, 163, 184, 0.16)"
        strokeWidth={1}
        strokeDasharray="3 7"
      />

      {/* Deep ocean sphere */}
      <circle cx={cx} cy={cy} r={radius} fill={`url(#${oceanGradId})`} />

      <g clipPath={`url(#${sphereClipId})`}>
        {/* 10-degree spherical graticule */}
        {graticuleD && (
          <path
            d={graticuleD}
            fill="none"
            stroke="rgba(148, 163, 184, 0.14)"
            strokeWidth={0.85}
          />
        )}

        {/* World landmasses */}
        {worldLandD && (
          <path
            d={worldLandD}
            fill="#132033"
            stroke="rgba(148, 163, 184, 0.24)"
            strokeWidth={0.65}
          />
        )}

        {/* Subtle country borders */}
        {countryBordersD && (
          <path
            d={countryBordersD}
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth={0.5}
          />
        )}

        {/* Highlighted Russia + cyan perimeter halo */}
        {russiaD && (
          <g>
            <path
              d={russiaD}
              fill="none"
              stroke={TOKENS.colors.russiaCyan}
              strokeWidth={5.5}
              strokeOpacity={0.28}
              strokeLinejoin="round"
            />
            <path
              d={russiaD}
              fill={`url(#${russiaFillGradId})`}
              stroke={TOKENS.colors.russiaIce}
              strokeWidth={1.35}
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* 11 Timezone meridian arcs sweeping West-to-East across Russia */}
        {timezoneSweepProgress > 0.005 &&
          RUSSIA_TIMEZONE_MERIDIANS.map((tz) => {
            const threshold = tz.index / RUSSIA_TIMEZONE_MERIDIANS.length;
            const localAlpha = Math.max(
              0,
              Math.min(1, (timezoneSweepProgress - threshold) * 5.5),
            );
            if (localAlpha <= 0.01) {
              return null;
            }
            const arcD = pathGen(tz.line) ?? "";
            if (!arcD) {
              return null;
            }
            const labelAnchor = getFrontPin([tz.lon, 66.5]);
            return (
              <g key={tz.utcLabel} opacity={localAlpha}>
                <path
                  d={arcD}
                  fill="none"
                  stroke={TOKENS.colors.russiaCyan}
                  strokeWidth={3.2}
                  strokeOpacity={0.22}
                />
                <path
                  d={arcD}
                  fill="none"
                  stroke={
                    tz.index === 1 || tz.index === 10
                      ? TOKENS.colors.imperialAmber
                      : TOKENS.colors.russiaIce
                  }
                  strokeWidth={1.3}
                  strokeDasharray="4 3"
                  strokeOpacity={0.85}
                />
                {labelAnchor && (tz.index % 2 === 0 || tz.index === 1) && (
                  <g
                    transform={`translate(${labelAnchor.x}, ${labelAnchor.y})`}
                    opacity={labelAnchor.visibility * 0.92}
                  >
                    <rect
                      x={-24}
                      y={-9}
                      width={48}
                      height={17}
                      rx={4}
                      fill="rgba(5, 9, 17, 0.84)"
                      stroke="rgba(56, 189, 248, 0.45)"
                      strokeWidth={0.8}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill={TOKENS.colors.russiaIce}
                      fontFamily={FONTS.mono}
                      fontSize={9.5}
                      fontWeight={700}
                    >
                      {tz.utcLabel}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Trans-continental great-circle spine across Russia */}
        {russiaSpanArcD && (
          <path
            d={russiaSpanArcD}
            fill="none"
            stroke={TOKENS.colors.imperialAmber}
            strokeWidth={1.8}
            strokeOpacity={Math.min(0.82, timezoneSweepProgress)}
            strokeDasharray="6 4"
          />
        )}

        {/* Great-circle comparison arc from Siberia to Dhaka */}
        {connectionArcD && (
          <g>
            <path
              d={connectionArcD}
              fill="none"
              stroke={TOKENS.colors.bengalEmerald}
              strokeWidth={4}
              strokeOpacity={0.22}
            />
            <path
              d={connectionArcD}
              fill="none"
              stroke="#6EE7B7"
              strokeWidth={1.7}
              strokeDasharray="5 4"
              strokeOpacity={0.9}
            />
          </g>
        )}

        {/* Blazing Bangladesh polygon + emerald/crimson beacon pulse */}
        {bangladeshD && (
          <g opacity={Math.max(0.35, bangladeshFocus)}>
            <path
              d={bangladeshD}
              fill="none"
              stroke={TOKENS.colors.bengalEmerald}
              strokeWidth={7}
              strokeOpacity={0.5}
              strokeLinejoin="round"
            />
            <path
              d={bangladeshD}
              fill={TOKENS.colors.bengalEmerald}
              stroke="#ECFDF5"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
          </g>
        )}

        {dhakaPin && (
          <g
            transform={`translate(${dhakaPin.x}, ${dhakaPin.y})`}
            opacity={dhakaPin.visibility}
          >
            <circle
              r={8 + pulseWaveA * 34}
              fill="none"
              stroke={TOKENS.colors.bengalEmerald}
              strokeWidth={1.8}
              strokeOpacity={(1 - pulseWaveA) * 0.85 * bangladeshFocus}
            />
            <circle
              r={8 + pulseWaveB * 34}
              fill="none"
              stroke={TOKENS.colors.bengalCrimson}
              strokeWidth={1.5}
              strokeOpacity={(1 - pulseWaveB) * 0.75 * bangladeshFocus}
            />
            <circle
              r={5.5}
              fill={TOKENS.colors.bengalCrimson}
              stroke="#FEF2F2"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* 3D spherical lighting & terminator shadow */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={`url(#${terminatorGradId})`}
          pointerEvents="none"
        />
      </g>

      {/* Crisp inner & outer atmospheric rim strokes */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(186, 230, 253, 0.38)"
        strokeWidth={1.5}
      />

      {/* Front-hemisphere cartographic callout pins */}
      {showLabels && moscowPin && (
        <g
          transform={`translate(${moscowPin.x}, ${moscowPin.y})`}
          opacity={moscowPin.visibility}
        >
          <circle
            r={3.8}
            fill={TOKENS.colors.russiaIce}
            stroke={TOKENS.colors.bgObsidian}
            strokeWidth={1.2}
          />
          <g transform="translate(9, -8)">
            <rect
              x={0}
              y={-11}
              width={72}
              height={19}
              rx={4}
              fill="rgba(5, 9, 17, 0.84)"
              stroke="rgba(56, 189, 248, 0.45)"
              strokeWidth={0.9}
            />
            <text
              x={36}
              y={2}
              textAnchor="middle"
              fill={TOKENS.colors.textPrimary}
              fontFamily={FONTS.mono}
              fontSize={10}
              fontWeight={700}
            >
              MOSCOW
            </text>
          </g>
        </g>
      )}

      {showLabels && siberiaPin && (
        <g
          transform={`translate(${siberiaPin.x}, ${siberiaPin.y})`}
          opacity={siberiaPin.visibility * 0.92}
        >
          <text
            x={0}
            y={0}
            textAnchor="middle"
            fill={TOKENS.colors.russiaIce}
            fontFamily={FONTS.display}
            fontSize={13}
            fontWeight={700}
            letterSpacing="0.18em"
          >
            RUSSIA · 11 TIME ZONES
          </text>
        </g>
      )}

      {showLabels && dhakaPin && (
        <g
          transform={`translate(${dhakaPin.x}, ${dhakaPin.y})`}
          opacity={dhakaPin.visibility}
        >
          <g transform="translate(14, 4)">
            <rect
              x={0}
              y={-13}
              width={136}
              height={24}
              rx={5}
              fill="rgba(5, 9, 17, 0.9)"
              stroke={TOKENS.colors.bengalEmerald}
              strokeWidth={1.1}
            />
            <circle cx={11} cy={-1} r={3.5} fill={TOKENS.colors.bengalCrimson} />
            <text
              x={21}
              y={3}
              fill="#ECFDF5"
              fontFamily={FONTS.mono}
              fontSize={10.5}
              fontWeight={700}
            >
              BANGLADESH · 175M
            </text>
          </g>
        </g>
      )}
    </svg>
  );
};

export interface EqualAreaRussiaComparisonProps {
  width: number;
  height: number;
  padding?: number;
  showSurroundingLand?: boolean;
  showGraticule?: boolean;
  /** Optional 0..1 opacity for dashed Mercator distortion ghost behind Equal-Area Russia. */
  mercatorGhostOpacity?: number;
  /** Continuous progress 0..115.2 controlling staggered Bangladesh tiles inside Russia. */
  tileSwarmProgress?: number;
  /** Whether to show tile #0 anchored directly over Moscow when tileSwarmProgress >= 1. */
  showMoscowAnchorTile?: boolean;
  /** Optional render-prop in exact SVG coordinate space. */
  children?: (geo: EqualAreaComparisonGeometry) => React.ReactNode;
}

export const EqualAreaRussiaComparison: React.FC<
  EqualAreaRussiaComparisonProps
> = ({
  width,
  height,
  padding = 28,
  showSurroundingLand = true,
  showGraticule = true,
  mercatorGhostOpacity = 0,
  tileSwarmProgress = 0,
  showMoscowAnchorTile = true,
  children,
}) => {
  const rawUid = useId().replace(/:/g, "");
  const geo = computeEqualAreaComparisonGeometry(width, height, padding);

  const russiaGradId = `ea-russia-grad-${rawUid}`;
  const russiaClipId = `ea-russia-clip-${rawUid}`;
  const bdUnitId = `ea-bd-unit-${rawUid}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={russiaGradId} x1="0%" y1="0%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#0E3A5D" stopOpacity="0.82" />
          <stop offset="52%" stopColor="#0A2944" stopOpacity="0.86" />
          <stop offset="100%" stopColor="#081E34" stopOpacity="0.9" />
        </linearGradient>

        <clipPath id={russiaClipId}>
          <path d={geo.russiaPath} />
        </clipPath>

        {/* Normalized true-scale Bangladesh silhouette centered at (0, 0) */}
        <path id={bdUnitId} d={geo.bangladeshCenteredPath} />
      </defs>

      {/* Equal-area 10° graticule */}
      {showGraticule && geo.graticulePath && (
        <path
          d={geo.graticulePath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.1)"
          strokeWidth={0.8}
        />
      )}

      {/* Surrounding Eurasian continental context */}
      {showSurroundingLand && geo.surroundingLandPath && (
        <path
          d={geo.surroundingLandPath}
          fill="rgba(15, 23, 42, 0.55)"
          stroke="rgba(148, 163, 184, 0.14)"
          strokeWidth={0.7}
        />
      )}

      {/* Optional Mercator distortion comparison ghost */}
      {mercatorGhostOpacity > 0.01 && geo.mercatorGhostPath && (
        <path
          d={geo.mercatorGhostPath}
          fill="rgba(251, 113, 133, 0.05)"
          stroke={TOKENS.colors.coralAccent}
          strokeWidth={1.2}
          strokeDasharray="6 5"
          opacity={mercatorGhostOpacity}
        />
      )}

      {/* Russia outer cyan halo */}
      <path
        d={geo.russiaPath}
        fill="none"
        stroke={TOKENS.colors.russiaCyan}
        strokeWidth={6}
        strokeOpacity={0.22}
        strokeLinejoin="round"
      />

      {/* Russia equal-area fill */}
      <path
        d={geo.russiaPath}
        fill={`url(#${russiaGradId})`}
        stroke={TOKENS.colors.russiaCyan}
        strokeWidth={1.65}
        strokeLinejoin="round"
      />

      {/* Staggered 115 true-scale Bangladesh silhouettes inside Russia */}
      {tileSwarmProgress > 0 && (
        <g clipPath={`url(#${russiaClipId})`}>
          {geo.interiorTileAnchors.map((anchor) => {
            if (anchor.index === 0 && !showMoscowAnchorTile) {
              return null;
            }
            const local = tileSwarmProgress - anchor.index;
            if (local <= 0) {
              return null;
            }
            const entrance = Math.min(1, local / 2.4);
            const easedScale = 0.42 + 0.58 * (1 - (1 - entrance) * (1 - entrance));
            const isMoscow = anchor.index === 0;
            const shadePick = anchor.index % 3;
            const fill = isMoscow
              ? TOKENS.colors.bengalEmerald
              : shadePick === 0
                ? "#10B981"
                : shadePick === 1
                  ? "#059669"
                  : "#34D399";

            return (
              <use
                key={anchor.index}
                href={`#${bdUnitId}`}
                transform={`translate(${anchor.x.toFixed(1)}, ${anchor.y.toFixed(1)}) scale(${easedScale.toFixed(3)})`}
                fill={fill}
                fillOpacity={isMoscow ? 0.95 : 0.78 * entrance}
                stroke={isMoscow ? "#FEF2F2" : "#A7F3D0"}
                strokeWidth={isMoscow ? 1.35 : 0.75}
                strokeOpacity={0.92 * entrance}
              />
            );
          })}
        </g>
      )}

      {/* Re-stroke Russia coastline cleanly over interior tile mosaic */}
      {tileSwarmProgress > 1 && (
        <path
          d={geo.russiaPath}
          fill="none"
          stroke={TOKENS.colors.russiaIce}
          strokeWidth={1.35}
          strokeOpacity={0.85}
          strokeLinejoin="round"
        />
      )}

      {children ? children(geo) : null}
    </svg>
  );
};
