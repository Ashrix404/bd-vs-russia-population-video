const US_INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Formats numbers with US English comma grouping for counters, axes, and badges.
 * Rounds floating-point inputs by default so interpolated frame values never jitter.
 */
export function formatNumber(n: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(n)) {
    return "0";
  }

  if (maximumFractionDigits <= 0) {
    const rounded = Math.round(n) || 0;
    return US_INTEGER_FORMATTER.format(rounded);
  }

  const normalized = Math.abs(n) < 1e-12 ? 0 : n;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(normalized);
}

/**
 * Deterministic [0, 1) pseudo-random generator using a sin-free mulberry32
 * 32-bit integer bitmix. Guarantees frame-identical renders across OS/architectures
 * without ever touching Math.random().
 */
export function seededUnit(seed: number): number {
  if (!Number.isFinite(seed)) {
    return 0;
  }

  const truncated = Math.trunc(seed);
  const intPart = truncated | 0;
  const fracPart = Math.round((seed - truncated) * 4294967296) | 0;

  let t = (intPart + 0x6d2b79f5 + Math.imul(fracPart, 0x9e3779b1)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const TOKENS = {
  colors: {
    bgObsidian: "#050911",
    bgDeepSlate: "#0A111E",
    bgPanelGlass: "rgba(11, 19, 33, 0.82)",
    bgCardElevated: "rgba(15, 25, 42, 0.90)",
    gridLine: "rgba(148, 163, 184, 0.11)",
    borderSubtle: "rgba(226, 232, 240, 0.14)",
    bengalEmerald: "#10B981",
    bengalDeepGreen: "#006A4E",
    bengalCrimson: "#F42A41",
    russiaCyan: "#38BDF8",
    russiaIce: "#BAE6FD",
    russiaDeepBlue: "#0C4A6E",
    imperialAmber: "#F59E0B",
    coralAccent: "#FB7185",
    textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1",
    textMuted: "#64748B",
  },
  layout: {
    width: 1920,
    height: 1080,
    hudTopHeight: 76,
    stageTop: 88,
    stageBottom: 812,
    stageLeft: 64,
    stageRight: 1856,
    stageWidth: 1792,
    stageHeight: 724,
    lowerThirdTop: 820,
    lowerThirdHeight: 260,
    transcriptLeft: 310,
    transcriptRight: 1610,
  },
  formatNumber,
  seededUnit,
} as const;

export type ThemeTokens = typeof TOKENS;
