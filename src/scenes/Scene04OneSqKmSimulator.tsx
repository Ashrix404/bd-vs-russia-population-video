import React from "react";
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
import { CHARACTERS, type CharacterId, type SceneProps } from "../types/video";

const PLOT_SIZE = 520;
const GRID_DIVISIONS = 10;
const CELL_PX = PLOT_SIZE / GRID_DIVISIONS; // Exact 52px = 100m
const RUSSIA_DENSITY = 8.4;
const RUSSIA_WHOLE_BEACONS = 8;
const RUSSIA_FRACTIONAL_SHARE = 0.4;
const BANGLADESH_DENSITY = 1330;
const DENSITY_MULTIPLIER = BANGLADESH_DENSITY / RUSSIA_DENSITY; // 158.333...
const GOLDEN_ANGLE = 2.399963229728653;

type BeaconTier = "emerald" | "gold" | "crimson";

interface RussiaBeacon {
  readonly id: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly phase: number;
}

interface DeltaBeacon {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly tier: BeaconTier;
  readonly waveScore: number;
  readonly twinkleBucket: number;
  readonly coreCmd: string;
  readonly haloCmd: string;
  readonly crestCmd: string;
}

/**
 * Deterministic low-discrepancy Halton sequence in (0, 1).
 */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Same-winding SVG circle subpath so overlapping circles inside a single <path>
 * with fillRule="nonzero" never cancel each other out.
 */
function buildCircleSubpath(x: number, y: number, r: number): string {
  const x0 = (x - r).toFixed(1);
  const y0 = y.toFixed(1);
  const diameter = (r * 2).toFixed(1);
  const radius = r.toFixed(1);
  return `M${x0},${y0}a${radius},${radius} 0 1,0 ${diameter},0a${radius},${radius} 0 1,0 -${diameter},0`;
}

/**
 * Parametric centerline and half-width of the diagonal Bengal Delta river channel
 * cutting from NW to SE across the 520x520 quadrat.
 */
function riverCenterX(y: number): number {
  return (
    86 +
    0.675 * y +
    36 * Math.sin((y / PLOT_SIZE) * Math.PI * 1.75 + 0.32)
  );
}

function riverHalfWidth(y: number): number {
  return 18.5 + 4.0 * Math.sin((y / PLOT_SIZE) * Math.PI * 1.2 + 0.45);
}

/**
 * Precomputed SVG geometry for the diagonal river channel, silt levees, and current lines.
 */
const RIVER_GEOMETRY = (() => {
  const steps = 40;
  const leftWater: string[] = [];
  const rightWater: string[] = [];
  const leftLevee: string[] = [];
  const rightLevee: string[] = [];
  const streamCenter: string[] = [];
  const streamWest: string[] = [];
  const streamEast: string[] = [];

  for (let s = 0; s <= steps; s++) {
    const y = (s / steps) * PLOT_SIZE;
    const cx = riverCenterX(y);
    const hw = riverHalfWidth(y);
    const leveeHw = hw + 13;

    leftWater.push(`${(cx - hw).toFixed(1)},${y.toFixed(1)}`);
    rightWater.push(`${(cx + hw).toFixed(1)},${y.toFixed(1)}`);
    leftLevee.push(`${(cx - leveeHw).toFixed(1)},${y.toFixed(1)}`);
    rightLevee.push(`${(cx + leveeHw).toFixed(1)},${y.toFixed(1)}`);

    const cmd = s === 0 ? "M" : "L";
    streamCenter.push(`${cmd}${cx.toFixed(1)},${y.toFixed(1)}`);
    streamWest.push(`${cmd}${(cx - hw * 0.46).toFixed(1)},${y.toFixed(1)}`);
    streamEast.push(`${cmd}${(cx + hw * 0.44).toFixed(1)},${y.toFixed(1)}`);
  }

  const waterPolygon = `M${leftWater.join("L")}L${rightWater.reverse().join("L")}Z`;
  const leveePolygon = `M${leftLevee.join("L")}L${rightLevee.reverse().join("L")}Z`;

  return {
    leveePolygon,
    waterPolygon,
    streamCenter: streamCenter.join(""),
    streamWest: streamWest.join(""),
    streamEast: streamEast.join(""),
  };
})();

/**
 * Exactly 8 glowing cyan human beacons for Russia (~345m nearest-neighbor spacing
 * on the 520px = 1,000m square) plus a 9th +0.4 fractional statistical share locus.
 */
const RUSSIA_BEACONS: readonly RussiaBeacon[] = [
  { id: 1, label: "01", x: 96, y: 102, phase: 0.0 },
  { id: 2, label: "02", x: 276, y: 94, phase: 0.9 },
  { id: 3, label: "03", x: 438, y: 122, phase: 1.8 },
  { id: 4, label: "04", x: 114, y: 278, phase: 2.6 },
  { id: 5, label: "05", x: 286, y: 266, phase: 3.4 },
  { id: 6, label: "06", x: 448, y: 300, phase: 4.3 },
  { id: 7, label: "07", x: 112, y: 440, phase: 5.1 },
  { id: 8, label: "08", x: 288, y: 438, phase: 5.9 },
];

const RUSSIA_FRACTIONAL_LOCUS = {
  x: 442,
  y: 444,
  share: RUSSIA_FRACTIONAL_SHARE,
} as const;

/**
 * Precomputed subtle arctic topographic contour rings for Russia's 1 km² plot.
 */
const RUSSIA_CONTOUR_PATHS: readonly string[] = (() => {
  const centers = [
    { cx: 368, cy: 158, baseRadii: [34, 62, 92, 126], seedOffset: 101 },
    { cx: 162, cy: 364, baseRadii: [30, 56, 86, 118], seedOffset: 307 },
  ];
  const paths: string[] = [];

  for (const ridge of centers) {
    ridge.baseRadii.forEach((r0, ringIdx) => {
      const p1 = seededUnit(ridge.seedOffset + ringIdx * 17) * Math.PI * 2;
      const p2 = seededUnit(ridge.seedOffset + ringIdx * 31 + 5) * Math.PI * 2;
      const pts: string[] = [];
      const segments = 44;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const r =
          r0 +
          r0 * 0.13 * Math.cos(2 * theta + p1) +
          r0 * 0.07 * Math.sin(3 * theta + p2);
        const px = ridge.cx + r * 1.14 * Math.cos(theta);
        const py = ridge.cy + r * 0.86 * Math.sin(theta);
        pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
      }
      pts.push("Z");
      paths.push(pts.join(""));
    });
  }

  return paths;
})();

/**
 * Single-pass SVG path for minimalist boreal taiga pine silhouettes in uninhabited areas.
 */
const RUSSIA_TAIGA_PINES_PATH: string = (() => {
  const segments: string[] = [];
  let placed = 0;
  let attempt = 1;

  while (placed < 26 && attempt < 400) {
    const px = 28 + halton(attempt, 2) * (PLOT_SIZE - 56);
    const py = 32 + halton(attempt, 3) * (PLOT_SIZE - 64);
    attempt++;

    const nearBeacon = RUSSIA_BEACONS.some(
      (b) => Math.hypot(px - b.x, py - b.y) < 42,
    );
    const nearFractional =
      Math.hypot(px - RUSSIA_FRACTIONAL_LOCUS.x, py - RUSSIA_FRACTIONAL_LOCUS.y) <
      38;
    const onCaliperLine = py > 74 && py < 118 && px > 88 && px < 286;

    if (nearBeacon || nearFractional || onCaliperLine) {
      continue;
    }

    const scale = 0.82 + seededUnit(attempt * 73) * 0.38;
    const h = 11 * scale;
    const w = 4.4 * scale;
    const x = px.toFixed(1);
    const topY = (py - h * 0.65).toFixed(1);
    const midTopY = (py - h * 0.12).toFixed(1);
    const midBaseY = (py - h * 0.24).toFixed(1);
    const botY = (py + h * 0.35).toFixed(1);
    const trunkY = (py + h * 0.56).toFixed(1);
    const lx1 = (px - w * 0.72).toFixed(1);
    const rx1 = (px + w * 0.72).toFixed(1);
    const lx2 = (px - w).toFixed(1);
    const rx2 = (px + w).toFixed(1);

    // Minimalist architectural two-tier conifer + stem
    segments.push(
      `M${x},${topY}L${rx1},${midTopY}L${(px + w * 0.28).toFixed(1)},${midBaseY}L${rx2},${botY}L${lx2},${botY}L${(px - w * 0.28).toFixed(1)},${midBaseY}L${lx1},${midTopY}ZM${x},${botY}L${x},${trunkY}`,
    );
    placed++;
  }

  return segments.join("");
})();

/**
 * Module-scope deterministic precomputation of all 1,330 Bangladesh beacons
 * combining Golden-Angle ghat/bazaar hubs, riverside levee settlements, and
 * Halton (2, 3) floodplain homesteads — zero Math.random()!
 */
const BANGLADESH_BEACONS: readonly DeltaBeacon[] = (() => {
  interface RawPoint {
    x: number;
    y: number;
    tier: BeaconTier;
    seed: number;
  }

  const rawPoints: RawPoint[] = [];
  const margin = 12.5;
  const minX = margin;
  const maxX = PLOT_SIZE - margin;
  const minY = margin;
  const maxY = PLOT_SIZE - margin;

  const isDryAndSpaced = (x: number, y: number, minDist: number): boolean => {
    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false;
    }
    const dRiver = Math.abs(x - riverCenterX(y));
    if (dRiver < riverHalfWidth(y) + 5.2) {
      return false;
    }
    const minDistSq = minDist * minDist;
    for (let i = 0; i < rawPoints.length; i++) {
      const dx = rawPoints[i].x - x;
      const dy = rawPoints[i].y - y;
      if (dx * dx + dy * dy < minDistSq) {
        return false;
      }
    }
    return true;
  };

  // 1. Three riverside ghat/bazaar market hubs via Golden-Angle spiral (~148 crimson & gold beacons)
  const ghatHubs = [
    { cx: 248, cy: 132, count: 52, seedBase: 1000 },
    { cx: 214, cy: 278, count: 50, seedBase: 2000 },
    { cx: 368, cy: 382, count: 46, seedBase: 3000 },
  ];

  for (const hub of ghatHubs) {
    let added = 0;
    let k = 1;
    while (added < hub.count && k < 420) {
      const angle = k * GOLDEN_ANGLE + seededUnit(hub.seedBase + k) * 0.35;
      const radius =
        4.5 +
        4.1 * Math.sqrt(k) +
        (seededUnit(hub.seedBase + k * 7) - 0.5) * 3.2;
      const x = hub.cx + Math.cos(angle) * radius * 1.08;
      const y = hub.cy + Math.sin(angle) * radius * 0.94;
      if (isDryAndSpaced(x, y, 3.4)) {
        const tier: BeaconTier =
          added < Math.round(hub.count * 0.68) ? "crimson" : "gold";
        rawPoints.push({ x, y, tier, seed: hub.seedBase + k });
        added++;
      }
      k++;
    }
  }

  // 2. Linear alluvial riverbank levee settlements (~362 gold & emerald beacons)
  let leveeAdded = 0;
  let leveeStep = 1;
  while (leveeAdded < 362 && leveeStep < 2600) {
    const y = minY + halton(leveeStep, 2) * (maxY - minY);
    const bankSign = leveeStep % 2 === 0 ? 1 : -1;
    const bankSpread = Math.pow(halton(leveeStep, 3), 1.28) * 66;
    const jitter = (seededUnit(5000 + leveeStep * 13) - 0.5) * 6.0;
    const offset = riverHalfWidth(y) + 7.5 + bankSpread + jitter;
    const x = riverCenterX(y) + bankSign * offset;

    if (isDryAndSpaced(x, y, 3.7)) {
      const tier: BeaconTier =
        bankSpread < 28 || seededUnit(6200 + leveeStep) < 0.42
          ? "gold"
          : "emerald";
      rawPoints.push({ x, y, tier, seed: 5000 + leveeStep });
      leveeAdded++;
    }
    leveeStep++;
  }

  // 3. Fertile delta floodplain homesteads via Halton (2, 3) quasi-random (~820 beacons -> exact 1,330 total)
  let plainStep = 1;
  while (rawPoints.length < BANGLADESH_DENSITY && plainStep < 12000) {
    const baseX = minX + halton(plainStep + 64, 2) * (maxX - minX);
    const baseY = minY + halton(plainStep + 64, 3) * (maxY - minY);
    const jx = (seededUnit(9000 + plainStep * 19) - 0.5) * 7.5;
    const jy = (seededUnit(14000 + plainStep * 23) - 0.5) * 7.5;
    const x = baseX + jx;
    const y = baseY + jy;
    const minDist = plainStep < 5000 ? 3.8 : 2.6;

    if (isDryAndSpaced(x, y, minDist)) {
      const dRiver = Math.abs(x - riverCenterX(y)) - riverHalfWidth(y);
      const roll = seededUnit(19000 + plainStep * 29);
      let tier: BeaconTier = "emerald";
      if (dRiver < 34 && roll < 0.34) {
        tier = "gold";
      } else if (roll < 0.045) {
        tier = "crimson";
      } else if (roll < 0.15) {
        tier = "gold";
      }
      rawPoints.push({ x, y, tier, seed: 9000 + plainStep });
    }
    plainStep++;
  }

  // Deterministic safety net guaranteeing exact 1,330 count
  let fallbackStep = 1;
  while (rawPoints.length < BANGLADESH_DENSITY && fallbackStep < 10000) {
    const x = minX + halton(fallbackStep + 8192, 2) * (maxX - minX);
    const y = minY + halton(fallbackStep + 8192, 3) * (maxY - minY);
    if (Math.abs(x - riverCenterX(y)) >= riverHalfWidth(y) + 5.0) {
      rawPoints.push({ x, y, tier: "emerald", seed: 30000 + fallbackStep });
    }
    fallbackStep++;
  }

  // Sort along the river flow + outward levee propagation for a smooth natural settlement wave
  const scored = rawPoints.slice(0, BANGLADESH_DENSITY).map((pt) => {
    const alongRiver = (pt.x * 0.58 + pt.y * 0.81) / 720;
    const outwardFromRiver = Math.min(
      1,
      Math.max(0, (Math.abs(pt.x - riverCenterX(pt.y)) - riverHalfWidth(pt.y)) / 255),
    );
    const waveScore =
      alongRiver * 0.54 +
      outwardFromRiver * 0.42 +
      seededUnit(pt.seed + 777) * 0.04;
    return { ...pt, waveScore };
  });

  scored.sort((a, b) => a.waveScore - b.waveScore);

  return scored.map((pt, index): DeltaBeacon => {
    const coreRadius =
      pt.tier === "crimson" ? 2.05 : pt.tier === "gold" ? 1.9 : 1.75;
    const haloRadius =
      pt.tier === "crimson" ? 5.3 : pt.tier === "gold" ? 4.7 : 4.1;

    return {
      index,
      x: pt.x,
      y: pt.y,
      tier: pt.tier,
      waveScore: pt.waveScore,
      twinkleBucket: (index * 7 + Math.round(seededUnit(pt.seed) * 11)) % 12,
      coreCmd: buildCircleSubpath(pt.x, pt.y, coreRadius),
      haloCmd: buildCircleSubpath(pt.x, pt.y, haloRadius),
      crestCmd: buildCircleSubpath(pt.x, pt.y, 6.4),
    };
  });
})();

/**
 * Helper to build a clockwise SVG arc path on the 220-degree center ratio gauge.
 */
function describeGaugeArc(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  const clampedEnd = Math.max(startDeg + 0.25, endDeg);
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (clampedEnd * Math.PI) / 180;
  const x0 = cx + radius * Math.cos(startRad);
  const y0 = cy + radius * Math.sin(startRad);
  const x1 = cx + radius * Math.cos(endRad);
  const y1 = cy + radius * Math.sin(endRad);
  const largeArc = clampedEnd - startDeg > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${radius},${radius} 0 ${largeArc} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

const SurveyGridLines: React.FC<{
  minorStroke: string;
  majorStroke: string;
}> = ({ minorStroke, majorStroke }) => {
  const minorSegments: string[] = [];
  const majorSegments: string[] = [];

  for (let i = 1; i < GRID_DIVISIONS; i++) {
    const pos = i * CELL_PX;
    const target = i === 5 ? majorSegments : minorSegments;
    target.push(`M${pos},0V${PLOT_SIZE}M0,${pos}H${PLOT_SIZE}`);
  }

  return (
    <g>
      <path
        d={minorSegments.join("")}
        stroke={minorStroke}
        strokeWidth={1}
        fill="none"
      />
      <path
        d={majorSegments.join("")}
        stroke={majorStroke}
        strokeWidth={1.25}
        strokeDasharray="5 4"
        fill="none"
      />
      {/* Subtle 500m center survey fiducial cross */}
      <path
        d={`M${PLOT_SIZE / 2 - 9},${PLOT_SIZE / 2}H${PLOT_SIZE / 2 + 9}M${PLOT_SIZE / 2},${PLOT_SIZE / 2 - 9}V${PLOT_SIZE / 2 + 9}`}
        stroke={majorStroke}
        strokeWidth={1.4}
        fill="none"
      />
    </g>
  );
};

const SurveyCornerReticles: React.FC<{
  accentColor: string;
  progress: number;
}> = ({ accentColor, progress }) => {
  const arm = 14;
  const inset = -5;
  const max = PLOT_SIZE + 5;

  return (
    <svg
      width={PLOT_SIZE + 20}
      height={PLOT_SIZE + 20}
      viewBox={`${-10} ${-10} ${PLOT_SIZE + 20} ${PLOT_SIZE + 20}`}
      style={{
        position: "absolute",
        left: -10,
        top: -10,
        pointerEvents: "none",
        opacity: progress,
      }}
    >
      <path
        d={[
          `M${inset},${inset + arm}V${inset}H${inset + arm}`,
          `M${max - arm},${inset}H${max}V${inset + arm}`,
          `M${inset},${max - arm}V${max}H${inset + arm}`,
          `M${max - arm},${max}H${max}V${max - arm}`,
        ].join("")}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
      />
      {/* 100m perimeter micro-ticks along top & bottom edges */}
      <path
        d={Array.from({ length: GRID_DIVISIONS + 1 }, (_, idx) => {
          const p = idx * CELL_PX;
          const tickLen = idx % 5 === 0 ? 5 : 3;
          return `M${p},0V${-tickLen}M${p},${PLOT_SIZE}V${PLOT_SIZE + tickLen}`;
        }).join("")}
        fill="none"
        stroke={accentColor}
        strokeOpacity={0.55}
        strokeWidth={1}
      />
    </svg>
  );
};

const OuterScaleRail: React.FC<{
  side: "left" | "right";
  accentColor: string;
  opacity: number;
}> = ({ side, accentColor, opacity }) => {
  const isLeft = side === "left";
  const railX = isLeft ? 40 : 12;

  return (
    <div
      style={{
        position: "absolute",
        left: isLeft ? 132 : 1608,
        top: 128,
        width: 52,
        height: PLOT_SIZE,
        opacity,
      }}
    >
      <svg width={52} height={PLOT_SIZE} viewBox={`0 0 52 ${PLOT_SIZE}`}>
        <line
          x1={railX}
          y1={0}
          x2={railX}
          y2={PLOT_SIZE}
          stroke={TOKENS.colors.borderSubtle}
          strokeWidth={1}
        />
        {Array.from({ length: GRID_DIVISIONS + 1 }, (_, i) => {
          const y = i * CELL_PX;
          const isMajor = i === 0 || i === 5 || i === 10;
          const tickW = isMajor ? 9 : 5;
          const x2 = isLeft ? railX + tickW : railX - tickW;
          return (
            <line
              key={i}
              x1={railX}
              y1={y}
              x2={x2}
              y2={y}
              stroke={isMajor ? accentColor : TOKENS.colors.textMuted}
              strokeOpacity={isMajor ? 0.85 : 0.45}
              strokeWidth={isMajor ? 1.5 : 1}
            />
          );
        })}
        {/* Highlighted 100m single-cell caliper on first cell */}
        <line
          x1={railX}
          y1={0}
          x2={railX}
          y2={CELL_PX}
          stroke={accentColor}
          strokeWidth={2.2}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 2,
          left: isLeft ? 0 : 18,
          width: 34,
          textAlign: isLeft ? "right" : "left",
          fontFamily: FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: accentColor,
          letterSpacing: "0.02em",
        }}
      >
        0m
      </div>

      <div
        style={{
          position: "absolute",
          top: CELL_PX - 7,
          left: isLeft ? 0 : 18,
          width: 34,
          textAlign: isLeft ? "right" : "left",
          fontFamily: FONTS.mono,
          fontSize: 9,
          fontWeight: 500,
          color: TOKENS.colors.textSecondary,
        }}
      >
        100m
      </div>

      <div
        style={{
          position: "absolute",
          top: PLOT_SIZE / 2 - 7,
          left: isLeft ? -4 : 18,
          width: 38,
          textAlign: isLeft ? "right" : "left",
          fontFamily: FONTS.mono,
          fontSize: 10,
          fontWeight: 500,
          color: TOKENS.colors.textMuted,
        }}
      >
        500m
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: isLeft ? -6 : 16,
          width: 40,
          textAlign: isLeft ? "right" : "left",
          fontFamily: FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: accentColor,
        }}
      >
        1.0km
      </div>
    </div>
  );
};

const PlotScaleFooter: React.FC<{
  left: number;
  accentColor: string;
  areaPerPersonText: string;
  spacingText: string;
  opacity: number;
}> = ({ left, accentColor, areaPerPersonText, spacingText, opacity }) => {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 660,
        width: PLOT_SIZE,
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        background: TOKENS.colors.bgPanelGlass,
        border: `1px solid ${TOKENS.colors.borderSubtle}`,
        borderRadius: 8,
        boxSizing: "border-box",
        opacity,
      }}
    >
      {/* 100m + 500m scale bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: CELL_PX,
                height: 5,
                background: accentColor,
                borderRadius: "2px 0 0 2px",
              }}
            />
            <div
              style={{
                width: CELL_PX,
                height: 5,
                background: "rgba(148, 163, 184, 0.28)",
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                borderLeft: "none",
                borderRadius: "0 2px 2px 0",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: CELL_PX * 2,
              fontFamily: FONTS.mono,
              fontSize: 9,
              color: TOKENS.colors.textMuted,
            }}
          >
            <span>0</span>
            <span style={{ color: accentColor }}>100m</span>
            <span>200m</span>
          </div>
        </div>
      </div>

      {/* Telemetry metrics */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: FONTS.mono,
          fontSize: 11,
          color: TOKENS.colors.textSecondary,
        }}
      >
        <span>{areaPerPersonText}</span>
        <span style={{ color: TOKENS.colors.textMuted }}>·</span>
        <span style={{ color: accentColor, fontWeight: 700 }}>{spacingText}</span>
      </div>
    </div>
  );
};

const RussiaQuadratPlot: React.FC<{
  frame: number;
  fps: number;
  entranceProgress: number;
}> = ({ frame, fps, entranceProgress }) => {
  const b1 = RUSSIA_BEACONS[0];
  const b2 = RUSSIA_BEACONS[1];
  const caliperReveal = interpolate(frame, [52, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const fractionalReveal = interpolate(frame, [62, 88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const fracCircumference = 2 * Math.PI * 10.5;

  return (
    <div
      style={{
        position: "absolute",
        left: 192,
        top: 128,
        width: PLOT_SIZE,
        height: PLOT_SIZE,
        opacity: entranceProgress,
        transform: `translateY(${(1 - entranceProgress) * 14}px)`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: PLOT_SIZE,
          height: PLOT_SIZE,
          borderRadius: 6,
          overflow: "hidden",
          border: `1.5px solid rgba(56, 189, 248, 0.36)`,
          boxShadow:
            "0 20px 48px rgba(3, 8, 18, 0.65), inset 0 0 64px rgba(12, 74, 110, 0.28)",
          background:
            "radial-gradient(circle at 68% 28%, #0F233A 0%, #091525 52%, #060E1A 100%)",
        }}
      >
        <svg
          width={PLOT_SIZE}
          height={PLOT_SIZE}
          viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`}
        >
          <defs>
            <radialGradient id="ruPersonalZone" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.11} />
              <stop offset="72%" stopColor="#38BDF8" stopOpacity={0.03} />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Subtle arctic topographic contour rings */}
          {RUSSIA_CONTOUR_PATHS.map((d, idx) => (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke="#7DD3FC"
              strokeOpacity={idx % 4 === 0 ? 0.16 : 0.09}
              strokeWidth={idx % 4 === 0 ? 1.15 : 0.85}
              strokeDasharray={idx % 2 === 1 ? "6 4" : undefined}
            />
          ))}

          {/* Contour elevation micro-labels */}
          <text
            x={368}
            y={161}
            textAnchor="middle"
            fill="rgba(186, 230, 253, 0.32)"
            fontFamily={FONTS.mono}
            fontSize={9}
          >
            240m ELEV
          </text>
          <text
            x={162}
            y={367}
            textAnchor="middle"
            fill="rgba(186, 230, 253, 0.28)"
            fontFamily={FONTS.mono}
            fontSize={9}
          >
            195m ELEV
          </text>

          {/* 100m x 100m architectural survey grid */}
          <SurveyGridLines
            minorStroke="rgba(148, 163, 184, 0.11)"
            majorStroke="rgba(56, 189, 248, 0.24)"
          />

          {/* Minimalist boreal taiga pine silhouettes (single combined path) */}
          <path
            d={RUSSIA_TAIGA_PINES_PATH}
            fill="rgba(125, 211, 252, 0.11)"
            stroke="rgba(186, 230, 253, 0.20)"
            strokeWidth={0.75}
          />

          {/* Wide quiet personal-space radii (~345m spacing => ~172.5m = ~90px radius) */}
          {RUSSIA_BEACONS.map((beacon, idx) => {
            const appear = spring({
              frame: frame - (20 + idx * 5),
              fps,
              config: { damping: 16, stiffness: 120, mass: 0.8 },
            });
            const clampedAppear = Math.max(0, Math.min(1, appear));
            const breath =
              0.5 + 0.5 * Math.sin(frame * 0.055 + beacon.phase);
            const pulseCycle = ((frame + idx * 14) % 108) / 108;
            const pulseRadius = 8 + pulseCycle * 68;
            const pulseOpacity = (1 - pulseCycle) * 0.28 * clampedAppear;

            return (
              <g key={beacon.id} opacity={clampedAppear}>
                <circle
                  cx={beacon.x}
                  cy={beacon.y}
                  r={88 * clampedAppear}
                  fill="url(#ruPersonalZone)"
                  stroke="#38BDF8"
                  strokeOpacity={0.16 + breath * 0.08}
                  strokeWidth={1}
                  strokeDasharray="4 5"
                />
                <circle
                  cx={beacon.x}
                  cy={beacon.y}
                  r={pulseRadius}
                  fill="none"
                  stroke="#7DD3FC"
                  strokeOpacity={pulseOpacity}
                  strokeWidth={1.15}
                />
              </g>
            );
          })}

          {/* ~345m inter-neighbor surveyor caliper between Beacon 01 and Beacon 02 */}
          {caliperReveal > 0 && (
            <g opacity={caliperReveal}>
              <line
                x1={b1.x + 10}
                y1={b1.y}
                x2={b1.x + (b2.x - b1.x - 10) * caliperReveal}
                y2={b1.y + (b2.y - b1.y) * caliperReveal}
                stroke="#BAE6FD"
                strokeOpacity={0.68}
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
              <rect
                x={(b1.x + b2.x) / 2 - 44}
                y={(b1.y + b2.y) / 2 - 22}
                width={88}
                height={18}
                rx={4}
                fill="rgba(5, 12, 24, 0.88)"
                stroke="rgba(56, 189, 248, 0.45)"
                strokeWidth={1}
              />
              <text
                x={(b1.x + b2.x) / 2}
                y={(b1.y + b2.y) / 2 - 10}
                textAnchor="middle"
                fill="#BAE6FD"
                fontFamily={FONTS.mono}
                fontWeight={700}
                fontSize={9.5}
              >
                ~345m APART
              </text>
            </g>
          )}

          {/* 8 crisp glowing cyan human beacons */}
          {RUSSIA_BEACONS.map((beacon, idx) => {
            const pop = spring({
              frame: frame - (20 + idx * 5),
              fps,
              config: { damping: 13, stiffness: 150, mass: 0.7 },
            });
            const scale = Math.max(0, pop);
            const haloBreath =
              1 + 0.14 * Math.sin(frame * 0.07 + beacon.phase);

            return (
              <g
                key={`dot-${beacon.id}`}
                transform={`translate(${beacon.x}, ${beacon.y}) scale(${scale})`}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={11 * haloBreath}
                  fill="#38BDF8"
                  fillOpacity={0.24}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={5.4}
                  fill="#38BDF8"
                  stroke="#BAE6FD"
                  strokeWidth={1.2}
                />
                <circle cx={0} cy={0} r={2.1} fill="#F8FAFC" />
                <text
                  x={9}
                  y={-7}
                  fill="rgba(224, 242, 254, 0.72)"
                  fontFamily={FONTS.mono}
                  fontSize={9}
                  fontWeight={700}
                >
                  {beacon.label}
                </text>
              </g>
            );
          })}

          {/* +0.4 fractional statistical person indicator (keeps whole human dots at exact 8) */}
          {fractionalReveal > 0 && (
            <g
              transform={`translate(${RUSSIA_FRACTIONAL_LOCUS.x}, ${RUSSIA_FRACTIONAL_LOCUS.y})`}
              opacity={fractionalReveal}
            >
              <circle
                cx={0}
                cy={0}
                r={10.5}
                fill="rgba(12, 74, 110, 0.38)"
                stroke="rgba(56, 189, 248, 0.30)"
                strokeWidth={1.2}
                strokeDasharray="2.5 2.5"
              />
              <circle
                cx={0}
                cy={0}
                r={10.5}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={3.2}
                strokeLinecap="round"
                strokeDasharray={`${(fracCircumference * RUSSIA_FRACTIONAL_SHARE * fractionalReveal).toFixed(2)} ${fracCircumference.toFixed(2)}`}
                transform="rotate(-90)"
              />
              <circle cx={0} cy={0} r={2.2} fill="#BAE6FD" fillOpacity={0.85} />
              <rect
                x={-36}
                y={15}
                width={72}
                height={18}
                rx={4}
                fill="rgba(5, 12, 24, 0.90)"
                stroke="rgba(56, 189, 248, 0.48)"
                strokeWidth={1}
              />
              <text
                x={0}
                y={27}
                textAnchor="middle"
                fill="#7DD3FC"
                fontFamily={FONTS.mono}
                fontSize={9.5}
                fontWeight={700}
              >
                +0.4 SHARE
              </text>
            </g>
          )}
        </svg>

        {/* Top-left internal survey badge */}
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 10,
            padding: "4px 8px",
            borderRadius: 4,
            background: "rgba(5, 11, 21, 0.78)",
            border: "1px solid rgba(56, 189, 248, 0.28)",
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: "#BAE6FD",
            letterSpacing: "0.06em",
          }}
        >
          100 HECTARES · TAIGA &amp; STEPPE
        </div>
      </div>

      <SurveyCornerReticles
        accentColor={TOKENS.colors.russiaCyan}
        progress={entranceProgress}
      />
    </div>
  );
};

const BangladeshQuadratPlot: React.FC<{
  frame: number;
  visibleCount: number;
  isStreaming: boolean;
  completionPulse: number;
  entranceProgress: number;
}> = ({
  frame,
  visibleCount,
  isStreaming,
  completionPulse,
  entranceProgress,
}) => {
  // Single-pass batched SVG path assembly for up to 1,330 micro-beacons (< 0.1ms JS, 8 DOM paths total)
  const emeraldHalos: string[] = [];
  const goldHalos: string[] = [];
  const crimsonHalos: string[] = [];
  const emeraldCores: string[] = [];
  const goldCores: string[] = [];
  const crimsonCores: string[] = [];
  const waveCrestFlares: string[] = [];
  const shimmerCores: string[] = [];

  const crestThreshold = Math.max(0, visibleCount - 42);
  const activeBucketA = Math.floor(frame / 5) % 12;
  const activeBucketB = (activeBucketA + 6) % 12;
  const shimmerWave = 0.45 + 0.35 * Math.sin(frame * 0.14);

  for (let i = 0; i < visibleCount; i++) {
    const b = BANGLADESH_BEACONS[i];
    if (b.tier === "emerald") {
      emeraldHalos.push(b.haloCmd);
      emeraldCores.push(b.coreCmd);
    } else if (b.tier === "gold") {
      goldHalos.push(b.haloCmd);
      goldCores.push(b.coreCmd);
    } else {
      crimsonHalos.push(b.haloCmd);
      crimsonCores.push(b.coreCmd);
    }

    if (isStreaming && i >= crestThreshold) {
      waveCrestFlares.push(b.crestCmd);
    } else if (
      b.twinkleBucket === activeBucketA ||
      b.twinkleBucket === activeBucketB
    ) {
      shimmerCores.push(b.coreCmd);
    }
  }

  const borderGlow = 0.38 + completionPulse * 0.36;

  return (
    <div
      style={{
        position: "absolute",
        left: 1080,
        top: 128,
        width: PLOT_SIZE,
        height: PLOT_SIZE,
        opacity: entranceProgress,
        transform: `translateY(${(1 - entranceProgress) * 14}px)`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: PLOT_SIZE,
          height: PLOT_SIZE,
          borderRadius: 6,
          overflow: "hidden",
          border: `1.5px solid rgba(16, 185, 129, ${borderGlow.toFixed(3)})`,
          boxShadow: `0 20px 48px rgba(3, 8, 18, 0.65), 0 0 ${(22 + completionPulse * 24).toFixed(0)}px rgba(16, 185, 129, ${(0.14 + completionPulse * 0.22).toFixed(3)}), inset 0 0 68px rgba(0, 106, 78, 0.30)`,
          background:
            "radial-gradient(circle at 46% 52%, #082B21 0%, #051E17 58%, #03130F 100%)",
        }}
      >
        <svg
          width={PLOT_SIZE}
          height={PLOT_SIZE}
          viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`}
        >
          <defs>
            <linearGradient
              id="bdRiverWater"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#083B44" />
              <stop offset="50%" stopColor="#0D5257" />
              <stop offset="100%" stopColor="#06343B" />
            </linearGradient>
            <linearGradient
              id="bdRiverLevee"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.14} />
              <stop offset="50%" stopColor="#F59E0B" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.15} />
            </linearGradient>
          </defs>

          {/* Alluvial agricultural parcel sub-grid (50m = 26px subtle field subdivisions) */}
          <path
            d={Array.from({ length: GRID_DIVISIONS * 2 - 1 }, (_, idx) => {
              const p = (idx + 1) * (CELL_PX / 2);
              return idx % 2 === 0 ? `M${p},0V${PLOT_SIZE}M0,${p}H${PLOT_SIZE}` : "";
            }).join("")}
            stroke="rgba(16, 185, 129, 0.05)"
            strokeWidth={0.75}
            fill="none"
          />

          {/* 100m x 100m architectural survey grid */}
          <SurveyGridLines
            minorStroke="rgba(148, 163, 184, 0.11)"
            majorStroke="rgba(16, 185, 129, 0.25)"
          />

          {/* Fertile alluvial levee silt banks along diagonal distributary channel */}
          <path d={RIVER_GEOMETRY.leveePolygon} fill="url(#bdRiverLevee)" />

          {/* Diagonal river channel body */}
          <path
            d={RIVER_GEOMETRY.waterPolygon}
            fill="url(#bdRiverWater)"
            stroke="rgba(56, 189, 248, 0.32)"
            strokeWidth={1.1}
          />

          {/* Shimmering river current streamlines synced deterministically to frame */}
          <path
            d={RIVER_GEOMETRY.streamCenter}
            fill="none"
            stroke="rgba(186, 230, 253, 0.34)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray="44 58"
            strokeDashoffset={-frame * 1.45}
          />
          <path
            d={RIVER_GEOMETRY.streamWest}
            fill="none"
            stroke="rgba(52, 211, 153, 0.26)"
            strokeWidth={1.1}
            strokeLinecap="round"
            strokeDasharray="28 52"
            strokeDashoffset={-frame * 1.1 - 19}
          />
          <path
            d={RIVER_GEOMETRY.streamEast}
            fill="none"
            stroke="rgba(186, 230, 253, 0.24)"
            strokeWidth={1.1}
            strokeLinecap="round"
            strokeDasharray="34 62"
            strokeDashoffset={-frame * 1.25 - 37}
          />

          {/* Batched soft glow halos for all visible beacons */}
          {emeraldHalos.length > 0 && (
            <path
              d={emeraldHalos.join("")}
              fill="#10B981"
              fillOpacity={0.17}
              fillRule="nonzero"
            />
          )}
          {goldHalos.length > 0 && (
            <path
              d={goldHalos.join("")}
              fill="#F59E0B"
              fillOpacity={0.22}
              fillRule="nonzero"
            />
          )}
          {crimsonHalos.length > 0 && (
            <path
              d={crimsonHalos.join("")}
              fill="#F42A41"
              fillOpacity={0.25}
              fillRule="nonzero"
            />
          )}

          {/* Active wave-front arrival flare */}
          {waveCrestFlares.length > 0 && (
            <path
              d={waveCrestFlares.join("")}
              fill="#A7F3D0"
              fillOpacity={0.34}
              fillRule="nonzero"
            />
          )}

          {/* Batched crisp cores for all 1,330 beacons */}
          {emeraldCores.length > 0 && (
            <path
              d={emeraldCores.join("")}
              fill="#34D399"
              fillRule="nonzero"
            />
          )}
          {goldCores.length > 0 && (
            <path d={goldCores.join("")} fill="#FBBF24" fillRule="nonzero" />
          )}
          {crimsonCores.length > 0 && (
            <path
              d={crimsonCores.join("")}
              fill="#FB7185"
              fillRule="nonzero"
            />
          )}

          {/* Living delta respiratory shimmer pass */}
          {shimmerCores.length > 0 && (
            <path
              d={shimmerCores.join("")}
              fill="#ECFDF5"
              fillOpacity={shimmerWave}
              fillRule="nonzero"
            />
          )}
        </svg>

        {/* Top-left internal survey badge */}
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 10,
            padding: "4px 8px",
            borderRadius: 4,
            background: "rgba(3, 16, 12, 0.82)",
            border: "1px solid rgba(16, 185, 129, 0.34)",
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: "#A7F3D0",
            letterSpacing: "0.06em",
          }}
        >
          100 HECTARES · ALLUVIAL DELTA
        </div>

        {/* River channel label pill */}
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 10,
            padding: "3px 8px",
            borderRadius: 4,
            background: "rgba(4, 22, 26, 0.84)",
            border: "1px solid rgba(56, 189, 248, 0.30)",
            fontFamily: FONTS.mono,
            fontSize: 9.5,
            color: "#BAE6FD",
            letterSpacing: "0.05em",
          }}
        >
          DISTRIBUTARY CHANNEL
        </div>
      </div>

      <SurveyCornerReticles
        accentColor={TOKENS.colors.bengalEmerald}
        progress={entranceProgress}
      />
    </div>
  );
};

const CenterMultiplierCallout: React.FC<{
  frame: number;
  fps: number;
  visibleCount: number;
  completionFrame: number;
  entranceProgress: number;
}> = ({ frame, fps, visibleCount, completionFrame, entranceProgress }) => {
  const ratioProgress = Math.min(1, visibleCount / BANGLADESH_DENSITY);
  const liveMultiplier =
    visibleCount <= 0
      ? 0
      : Math.min(158, Math.round((visibleCount / RUSSIA_DENSITY) * 1));

  const lockPop =
    frame >= completionFrame
      ? spring({
          frame: frame - completionFrame,
          fps,
          config: { damping: 12, stiffness: 160, mass: 0.7 },
        })
      : 0;
  const badgeScale =
    1 + interpolate(lockPop, [0, 0.5, 1], [0, 0.045, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const gaugeCx = 92;
  const gaugeCy = 86;
  const gaugeRadius = 62;
  const startDeg = -200;
  const totalSweepDeg = 220;
  const endDeg = startDeg + totalSweepDeg * ratioProgress;
  const needleRad = (endDeg * Math.PI) / 180;
  const needleX = gaugeCx + gaugeRadius * Math.cos(needleRad);
  const needleY = gaugeCy + gaugeRadius * Math.sin(needleRad);

  // Russia 1x reference angle (1 / 158.33 of arc)
  const russiaRefDeg = startDeg + totalSweepDeg * (1 / DENSITY_MULTIPLIER);
  const russiaRefRad = (russiaRefDeg * Math.PI) / 180;
  const ruRefX = gaugeCx + gaugeRadius * Math.cos(russiaRefRad);
  const ruRefY = gaugeCy + gaugeRadius * Math.sin(russiaRefRad);

  const trackArc = describeGaugeArc(
    gaugeCx,
    gaugeCy,
    gaugeRadius,
    startDeg,
    startDeg + totalSweepDeg,
  );
  const activeArc =
    ratioProgress > 0.004
      ? describeGaugeArc(gaugeCx, gaugeCy, gaugeRadius, startDeg, endDeg)
      : "";

  return (
    <div
      style={{
        position: "absolute",
        left: 752,
        top: 128,
        width: 288,
        height: PLOT_SIZE,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        opacity: entranceProgress,
        transform: `translateY(${(1 - entranceProgress) * 16}px)`,
      }}
    >
      {/* Subtle vertical surveyor spine linking the center instrument stack */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 19,
          bottom: 19,
          width: 1,
          background:
            "linear-gradient(180deg, rgba(56, 189, 248, 0.28) 0%, rgba(245, 158, 11, 0.34) 50%, rgba(16, 185, 129, 0.28) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Top Equal-Area Caliper Bridge */}
      <div
        style={{
          position: "relative",
          height: 38,
          boxSizing: "border-box",
          borderRadius: 8,
          background: TOKENS.colors.bgPanelGlass,
          border: `1px solid ${TOKENS.colors.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          fontFamily: FONTS.mono,
          fontSize: 10.5,
          letterSpacing: "0.06em",
        }}
      >
        <span style={{ color: TOKENS.colors.russiaCyan, fontWeight: 700 }}>
          ← 1 KM²
        </span>
        <span style={{ color: TOKENS.colors.textSecondary }}>EQUAL SCALE</span>
        <span style={{ color: TOKENS.colors.bengalEmerald, fontWeight: 700 }}>
          1 KM² →
        </span>
      </div>

      {/* Hero 158x DENSER Kinetic Multiplier Card + Animated Ratio Gauge */}
      <div
        style={{
          position: "relative",
          boxSizing: "border-box",
          padding: "16px 18px 14px",
          borderRadius: 12,
          background: TOKENS.colors.bgCardElevated,
          border: `1.5px solid ${
            ratioProgress >= 0.995
              ? "rgba(245, 158, 11, 0.55)"
              : TOKENS.colors.borderSubtle
          }`,
          boxShadow:
            ratioProgress >= 0.995
              ? "0 18px 40px rgba(0, 0, 0, 0.55), 0 0 28px rgba(245, 158, 11, 0.16)"
              : "0 18px 40px rgba(0, 0, 0, 0.50)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `scale(${badgeScale.toFixed(4)})`,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: TOKENS.colors.textMuted,
            marginBottom: 4,
          }}
        >
          POPULATION RATIO
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 2,
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 58,
            lineHeight: 1,
            color: TOKENS.colors.textPrimary,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
          }}
        >
          <span>{formatNumber(liveMultiplier)}</span>
          <span
            style={{
              fontSize: 40,
              color: TOKENS.colors.imperialAmber,
            }}
          >
            ×
          </span>
        </div>

        <div
          style={{
            marginTop: 6,
            padding: "4px 14px",
            borderRadius: 999,
            background: "rgba(16, 185, 129, 0.16)",
            border: "1px solid rgba(16, 185, 129, 0.42)",
            fontFamily: FONTS.display,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.22em",
            color: "#34D399",
          }}
        >
          DENSER
        </div>

        {/* Animated 220° Radial Ratio Gauge */}
        <svg
          width={184}
          height={112}
          viewBox="0 0 184 112"
          style={{ marginTop: 6, overflow: "visible" }}
        >
          <defs>
            <linearGradient
              id="ratioGaugeSweep"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="65%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#F42A41" />
            </linearGradient>
          </defs>

          {/* Gauge Graduation Ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
            const deg = startDeg + totalSweepDeg * t;
            const rad = (deg * Math.PI) / 180;
            const xIn = gaugeCx + (gaugeRadius - 8) * Math.cos(rad);
            const yIn = gaugeCy + (gaugeRadius - 8) * Math.sin(rad);
            const xOut = gaugeCx + (gaugeRadius + 6) * Math.cos(rad);
            const yOut = gaugeCy + (gaugeRadius + 6) * Math.sin(rad);
            return (
              <line
                key={idx}
                x1={xIn}
                y1={yIn}
                x2={xOut}
                y2={yOut}
                stroke="rgba(148, 163, 184, 0.35)"
                strokeWidth={1.2}
              />
            );
          })}

          <path
            d={trackArc}
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth={9}
            strokeLinecap="round"
          />

          {activeArc && (
            <path
              d={activeArc}
              fill="none"
              stroke="url(#ratioGaugeSweep)"
              strokeWidth={9}
              strokeLinecap="round"
            />
          )}

          {/* Russia 1x baseline pin */}
          <circle
            cx={ruRefX}
            cy={ruRefY}
            r={4.2}
            fill={TOKENS.colors.russiaCyan}
            stroke="#050911"
            strokeWidth={1.4}
          />

          {/* Animated Bangladesh sweep needle & hub */}
          <line
            x1={gaugeCx}
            y1={gaugeCy}
            x2={gaugeCx + (gaugeRadius - 14) * Math.cos(needleRad)}
            y2={gaugeCy + (gaugeRadius - 14) * Math.sin(needleRad)}
            stroke="#F8FAFC"
            strokeOpacity={0.85}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={gaugeCx} cy={gaugeCy} r={4.5} fill="#F8FAFC" />

          {ratioProgress > 0.008 && (
            <circle
              cx={needleX}
              cy={needleY}
              r={5.5}
              fill="#FBBF24"
              stroke="#FFFFFF"
              strokeWidth={1.6}
            />
          )}

          <text
            x={18}
            y={108}
            fill={TOKENS.colors.russiaCyan}
            fontFamily={FONTS.mono}
            fontSize={9.5}
            fontWeight={700}
          >
            1× RU
          </text>
          <text
            x={92}
            y={13}
            textAnchor="middle"
            fill={TOKENS.colors.textMuted}
            fontFamily={FONTS.mono}
            fontSize={9}
          >
            79×
          </text>
          <text
            x={168}
            y={108}
            textAnchor="end"
            fill={TOKENS.colors.imperialAmber}
            fontFamily={FONTS.mono}
            fontSize={9.5}
            fontWeight={700}
          >
            158× BD
          </text>
        </svg>

        {/* Direct 1 : 158.3 Linear Bar Proportion */}
        <div style={{ width: "100%", marginTop: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: FONTS.mono,
              fontSize: 9.5,
              color: TOKENS.colors.textSecondary,
              marginBottom: 5,
            }}
          >
            <span>LINEAR RATIO</span>
            <span style={{ color: TOKENS.colors.imperialAmber }}>
              1 : 158.3
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 22,
                  fontFamily: FONTS.mono,
                  fontSize: 9.5,
                  color: TOKENS.colors.russiaCyan,
                  fontWeight: 700,
                }}
              >
                RU
              </span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(148, 163, 184, 0.12)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: "100%",
                    background: TOKENS.colors.russiaCyan,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 22,
                  fontFamily: FONTS.mono,
                  fontSize: 9.5,
                  color: TOKENS.colors.bengalEmerald,
                  fontWeight: 700,
                }}
              >
                BD
              </span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(148, 163, 184, 0.12)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(ratioProgress * 100).toFixed(2)}%`,
                    height: "100%",
                    borderRadius: 3,
                    background:
                      "linear-gradient(90deg, #10B981 0%, #F59E0B 72%, #F42A41 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Human-Space Telemetry Card */}
      <div
        style={{
          position: "relative",
          boxSizing: "border-box",
          padding: "11px 14px",
          borderRadius: 10,
          background: TOKENS.colors.bgPanelGlass,
          border: `1px solid ${TOKENS.colors.borderSubtle}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: TOKENS.colors.textMuted,
          }}
        >
          LAND SHARE PER RESIDENT
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontFamily: FONTS.mono,
            fontSize: 11.5,
          }}
        >
          <span style={{ color: TOKENS.colors.russiaCyan, fontWeight: 700 }}>
            119,048 m²
          </span>
          <span style={{ color: TOKENS.colors.textMuted, fontSize: 10 }}>
            vs
          </span>
          <span style={{ color: TOKENS.colors.bengalEmerald, fontWeight: 700 }}>
            752 m²
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: FONTS.sans,
            fontSize: 10.5,
            color: TOKENS.colors.textSecondary,
          }}
        >
          <span>~17 soccer fields</span>
          <span>~1 house lot</span>
        </div>
      </div>
    </div>
  );
};

export const Scene04OneSqKmSimulator: React.FC<SceneProps> = ({
  scene,
  turns,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.max(120, scene.durationInFrames);
  const globalFrame = scene.startFrame + frame;

  // Identify active dialogue speaker if turn timings are populated
  const sceneTurns = turns.filter((t) => t.sceneIndex === scene.sceneIndex);
  const activeTurn = sceneTurns.find(
    (t) => globalFrame >= t.startFrame && globalFrame <= t.endFrame,
  );
  const activeSpeakerId: CharacterId | null = activeTurn
    ? activeTurn.characterId
    : null;
  const activeSpeakerMeta = activeSpeakerId
    ? CHARACTERS[activeSpeakerId]
    : null;

  // Choreography timing keyframes scaled adaptively to scene.durationInFrames
  const headerEntrance = interpolate(frame, [0, Math.round(0.65 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const leftPlotEntrance = interpolate(
    frame,
    [Math.round(0.15 * fps), Math.round(0.95 * fps)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const centerEntrance = interpolate(
    frame,
    [Math.round(0.3 * fps), Math.round(1.1 * fps)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const rightPlotEntrance = interpolate(
    frame,
    [Math.round(0.25 * fps), Math.round(1.05 * fps)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  // Russia 0.0 -> 8.4 counter synced with 8 beacons + 0.4 share illumination
  const russiaCounterValue = interpolate(
    frame,
    [Math.round(0.65 * fps), Math.round(2.75 * fps)],
    [0, RUSSIA_DENSITY],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Bangladesh 0 -> 1,330 streaming wave synced with live tabular counter
  const streamStartFrame = Math.min(
    Math.round(totalFrames * 0.15),
    Math.round(2.2 * fps),
  );
  const streamEndFrame = Math.max(
    streamStartFrame + Math.round(4.0 * fps),
    Math.round(totalFrames * 0.65),
  );

  const rawBangladeshCount = interpolate(
    frame,
    [streamStartFrame, streamEndFrame],
    [0, BANGLADESH_DENSITY],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.24, 0.92, 0.32, 1),
    },
  );

  const visibleBangladeshCount = Math.min(
    BANGLADESH_DENSITY,
    Math.max(0, Math.round(rawBangladeshCount)),
  );
  const isStreaming =
    frame >= streamStartFrame && visibleBangladeshCount < BANGLADESH_DENSITY;

  const completionPulse = interpolate(
    frame,
    [streamEndFrame - 4, streamEndFrame + 10, streamEndFrame + 38],
    [0, 1, 0.25],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

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
          background: [
            "radial-gradient(circle at 26% 44%, rgba(56, 189, 248, 0.08) 0%, rgba(5, 9, 17, 0) 46%)",
            "radial-gradient(circle at 74% 44%, rgba(16, 185, 129, 0.10) 0%, rgba(5, 9, 17, 0) 48%)",
            `linear-gradient(180deg, ${TOKENS.colors.bgObsidian} 0%, ${TOKENS.colors.bgDeepSlate} 50%, ${TOKENS.colors.bgObsidian} 100%)`,
          ].join(", "),
        }}
      />

      {/* Strict Safe-Zone Stage Container: top 88..808 (720px), left 64..1856 (1792px) */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          width: 1792,
          height: 720,
          overflow: "hidden",
        }}
      >
        {/* Top Architectural Survey Headline Row (y: 0..56 inside safe zone => global 88..144) */}
        <div
          style={{
            position: "absolute",
            left: 132,
            top: 0,
            width: 1528,
            height: 56,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            opacity: headerEntrance,
            transform: `translateY(${(1 - headerEntrance) * 10}px)`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.18em",
                color: TOKENS.colors.imperialAmber,
                marginBottom: 4,
              }}
            >
              EQUAL-AREA QUADRAT SURVEY · 1.00 KM × 1.00 KM (100m GRID)
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 14,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.serif,
                  fontSize: 36,
                  lineHeight: 1,
                  color: TOKENS.colors.textPrimary,
                  letterSpacing: "-0.01em",
                }}
              >
                Inside One Square Kilometer
              </span>
              <span
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 14,
                  fontWeight: 500,
                  color: TOKENS.colors.textSecondary,
                }}
              >
                Every glowing beacon represents a single resident on identical 1 km² land plots
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              background: TOKENS.colors.bgPanelGlass,
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              fontFamily: FONTS.mono,
              fontSize: 10.5,
              color: TOKENS.colors.textSecondary,
              letterSpacing: "0.08em",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: activeSpeakerMeta
                  ? activeSpeakerMeta.accentColor
                  : TOKENS.colors.bengalEmerald,
                boxShadow: `0 0 8px ${
                  activeSpeakerMeta
                    ? activeSpeakerMeta.accentColor
                    : TOKENS.colors.bengalEmerald
                }`,
              }}
            />
            <span>
              {activeSpeakerMeta
                ? `ANALYST · ${activeSpeakerMeta.name.toUpperCase()}`
                : "SCALE · 1 CELL = 100m × 100m (1 HA)"}
            </span>
          </div>
        </div>

        {/* Left Plot Header — RUSSIA (8.4 PEOPLE / KM²) */}
        <div
          style={{
            position: "absolute",
            left: 192,
            top: 68,
            width: PLOT_SIZE,
            height: 50,
            padding: "0 14px",
            borderRadius: 8,
            background: TOKENS.colors.bgPanelGlass,
            border: "1px solid rgba(56, 189, 248, 0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            opacity: leftPlotEntrance,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: TOKENS.colors.russiaCyan,
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: TOKENS.colors.textPrimary,
                }}
              >
                RUSSIA
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textMuted,
                }}
              >
                NATIONAL LAND AVG
              </span>
            </div>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10,
                color: "#7DD3FC",
              }}
            >
              {RUSSIA_WHOLE_BEACONS} RESIDENTS + 0.4 FRACTIONAL SHARE
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 28,
                fontWeight: 700,
                color: TOKENS.colors.russiaCyan,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {russiaCounterValue.toFixed(1)}
            </span>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10.5,
                fontWeight: 700,
                color: TOKENS.colors.textSecondary,
                letterSpacing: "0.05em",
              }}
            >
              PEOPLE / KM²
            </span>
          </div>
        </div>

        {/* Right Plot Header — BANGLADESH (1,330 PEOPLE / KM² LAND DENSITY) */}
        <div
          style={{
            position: "absolute",
            left: 1080,
            top: 68,
            width: PLOT_SIZE,
            height: 50,
            padding: "0 14px",
            borderRadius: 8,
            background: TOKENS.colors.bgPanelGlass,
            border: "1px solid rgba(16, 185, 129, 0.34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
            opacity: rightPlotEntrance,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: TOKENS.colors.bengalEmerald,
                }}
              />
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: TOKENS.colors.textPrimary,
                }}
              >
                BANGLADESH
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  color: TOKENS.colors.textMuted,
                }}
              >
                LAND DENSITY
              </span>
            </div>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10,
                color: "#6EE7B7",
              }}
            >
              RIVER-DELTA SETTLEMENT WAVE
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 28,
                fontWeight: 700,
                color: "#34D399",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatNumber(visibleBangladeshCount)}
            </span>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10.5,
                fontWeight: 700,
                color: TOKENS.colors.textSecondary,
                letterSpacing: "0.05em",
              }}
            >
              PEOPLE / KM²
            </span>
          </div>
        </div>

        {/* Outer 1,000m Architectural Dimension Rails */}
        <OuterScaleRail
          side="left"
          accentColor={TOKENS.colors.russiaCyan}
          opacity={leftPlotEntrance}
        />
        <OuterScaleRail
          side="right"
          accentColor={TOKENS.colors.bengalEmerald}
          opacity={rightPlotEntrance}
        />

        {/* LEFT SQUARE: Russia 520px x 520px (1 km x 1 km) */}
        <RussiaQuadratPlot
          frame={frame}
          fps={fps}
          entranceProgress={leftPlotEntrance}
        />

        {/* CENTER DIVIDER CALLOUT: 158x DENSER Kinetic Multiplier + Ratio Gauge */}
        <CenterMultiplierCallout
          frame={frame}
          fps={fps}
          visibleCount={visibleBangladeshCount}
          completionFrame={streamEndFrame}
          entranceProgress={centerEntrance}
        />

        {/* RIGHT SQUARE: Bangladesh 520px x 520px (1 km x 1 km, 1,330 micro-beacons) */}
        <BangladeshQuadratPlot
          frame={frame}
          visibleCount={visibleBangladeshCount}
          isStreaming={isStreaming}
          completionPulse={completionPulse}
          entranceProgress={rightPlotEntrance}
        />

        {/* Bottom Technical Scale & Legend Strip (y: 660..712 => global 748..800 <= 808) */}
        <PlotScaleFooter
          left={192}
          accentColor={TOKENS.colors.russiaCyan}
          areaPerPersonText="~11.9 ha / person"
          spacingText="~345m SPACING"
          opacity={leftPlotEntrance}
        />

        {/* Center Beacon Key Legend */}
        <div
          style={{
            position: "absolute",
            left: 752,
            top: 660,
            width: 288,
            height: 52,
            borderRadius: 8,
            background: TOKENS.colors.bgPanelGlass,
            border: `1px solid ${TOKENS.colors.borderSubtle}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: "0 10px",
            boxSizing: "border-box",
            fontFamily: FONTS.mono,
            fontSize: 9.5,
            color: TOKENS.colors.textSecondary,
            opacity: centerEntrance,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#34D399",
              }}
            />
            PLAINS
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#FBBF24",
              }}
            />
            LEVEE
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#FB7185",
              }}
            />
            BAZAAR
          </span>
        </div>

        <PlotScaleFooter
          left={1080}
          accentColor={TOKENS.colors.bengalEmerald}
          areaPerPersonText="~752 m² / person"
          spacingText="~27m SPACING"
          opacity={rightPlotEntrance}
        />
      </div>
    </AbsoluteFill>
  );
};

export default Scene04OneSqKmSimulator;
