import React, { useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONTS } from "../theme/fonts";
import { TOKENS } from "../theme/tokens";
import {
  CHARACTERS,
  type TimelineManifest,
  type TurnTiming,
  type WordTiming,
} from "../types/video";

export interface SyncedTranscriptBarProps {
  manifest: TimelineManifest;
}

const TURN_CUSHION_MS = 350;
const MIN_WORDS_PER_PAGE = 7;
const DEFAULT_WORDS_PER_PAGE = 8;
const MAX_WORDS_PER_PAGE = 9;
const MAX_CHARS_PER_PAGE = 66;
const CLAUSE_BREAK_PATTERN = /[.,!?;:—–-]["')\]}]*$/;

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "").trim();
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : cleaned;

  if (normalized.length !== 6) {
    return `rgba(248, 250, 252, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(248, 250, 252, ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toLinearChannel(channel8Bit: number): number {
  const srgb = channel8Bit / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Selects crisp dark (#04080F) or bright (#F8FAFC) foreground text for the
 * active word pill based on WCAG relative luminance of the speaker accent color.
 */
function getReadablePillTextColor(hex: string): string {
  const cleaned = hex.replace("#", "").trim();
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : cleaned;

  if (normalized.length !== 6) {
    return "#04080F";
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return "#04080F";
  }

  const luminance =
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b);

  return luminance > 0.22 ? "#04080F" : TOKENS.colors.textPrimary;
}

function measureSliceChars(words: WordTiming[], start: number, count: number): number {
  let chars = 0;
  const end = Math.min(words.length, start + count);
  for (let i = start; i < end; i += 1) {
    chars += words[i].word.length;
    if (i > start) {
      chars += 1;
    }
  }
  return chars;
}

/**
 * Groups a turn's words into balanced, readable pages targeting 7 to 9 words per page
 * while respecting natural punctuation boundaries and capping character length so
 * captions never overflow 2 lines.
 */
function paginateTurnWords(words: WordTiming[]): WordTiming[][] {
  const pages: WordTiming[][] = [];
  const total = words.length;

  if (total === 0) {
    return pages;
  }

  let idx = 0;
  while (idx < total) {
    const remaining = total - idx;

    if (remaining <= MAX_WORDS_PER_PAGE) {
      if (
        remaining > MIN_WORDS_PER_PAGE &&
        measureSliceChars(words, idx, remaining) > MAX_CHARS_PER_PAGE + 10
      ) {
        pages.push(words.slice(idx, idx + MIN_WORDS_PER_PAGE));
        idx += MIN_WORDS_PER_PAGE;
        continue;
      }
      pages.push(words.slice(idx, total));
      break;
    }

    let chunkSize = DEFAULT_WORDS_PER_PAGE;

    if (remaining <= 14) {
      chunkSize = MIN_WORDS_PER_PAGE;
    } else if (remaining === 15 || remaining === 16) {
      chunkSize = 8;
    } else if (remaining === 17 || remaining === 18) {
      chunkSize =
        measureSliceChars(words, idx, 9) <= MAX_CHARS_PER_PAGE + 6 ? 9 : 8;
    } else if (remaining >= 19 && remaining <= 21) {
      chunkSize = MIN_WORDS_PER_PAGE;
    } else if (remaining === 27) {
      chunkSize =
        measureSliceChars(words, idx, 9) <= MAX_CHARS_PER_PAGE + 6 ? 9 : 8;
    } else {
      const candidateOrder = [8, 7, 9];
      let punctuatedChoice: number | null = null;

      for (const candidate of candidateOrder) {
        const lastWord = words[idx + candidate - 1]?.word ?? "";
        const fitsChars = measureSliceChars(words, idx, candidate) <= MAX_CHARS_PER_PAGE;
        const leftover = remaining - candidate;
        const avoidsAwkwardTail = leftover >= MIN_WORDS_PER_PAGE;

        if (CLAUSE_BREAK_PATTERN.test(lastWord) && fitsChars && avoidsAwkwardTail) {
          punctuatedChoice = candidate;
          break;
        }
      }

      if (punctuatedChoice !== null) {
        chunkSize = punctuatedChoice;
      } else if (measureSliceChars(words, idx, 8) <= MAX_CHARS_PER_PAGE) {
        chunkSize = 8;
      } else {
        chunkSize = MIN_WORDS_PER_PAGE;
      }
    }

    pages.push(words.slice(idx, idx + chunkSize));
    idx += chunkSize;
  }

  return pages;
}

interface ActiveTurnMatch {
  turn: TurnTiming;
  distanceMs: number;
}

function findActiveOrNearestTurn(
  turns: TurnTiming[],
  currentMs: number,
): ActiveTurnMatch | null {
  let bestTurn: TurnTiming | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    let distance = 0;

    if (currentMs < turn.startMs) {
      distance = turn.startMs - currentMs;
    } else if (currentMs > turn.endMs) {
      distance = currentMs - turn.endMs;
    } else {
      return { turn, distanceMs: 0 };
    }

    if (distance <= TURN_CUSHION_MS && distance < bestDistance) {
      bestDistance = distance;
      bestTurn = turn;
    }
  }

  if (!bestTurn) {
    return null;
  }

  return { turn: bestTurn, distanceMs: bestDistance };
}

function selectActivePageIndex(pages: WordTiming[][], currentMs: number): number {
  if (pages.length <= 1) {
    return 0;
  }

  for (let i = pages.length - 1; i >= 1; i -= 1) {
    const prevPage = pages[i - 1];
    const currPage = pages[i];
    const prevEndMs = prevPage[prevPage.length - 1].endMs;
    const currStartMs = currPage[0].startMs;
    const switchMs =
      currStartMs > prevEndMs
        ? prevEndMs + Math.min(85, (currStartMs - prevEndMs) * 0.55)
        : currStartMs;

    if (currentMs >= switchMs) {
      return i;
    }
  }

  return 0;
}

export const SyncedTranscriptBar: React.FC<SyncedTranscriptBarProps> = ({
  manifest,
}) => {
  const frame = useCurrentFrame();
  const { fps: configFps } = useVideoConfig();

  const pagesByTurnId = useMemo(() => {
    const map = new Map<string, WordTiming[][]>();
    if (!manifest || !Array.isArray(manifest.words) || manifest.words.length === 0) {
      return map;
    }

    const turns = Array.isArray(manifest.turns) ? manifest.turns : [];
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      const turnWords = manifest.words
        .filter((w) => w.turnId === turn.id && w.word.trim().length > 0)
        .map((w) => ({ ...w, word: w.word.trim() }))
        .sort((a, b) => a.startMs - b.startMs);

      if (turnWords.length > 0) {
        map.set(turn.id, paginateTurnWords(turnWords));
      }
    }

    return map;
  }, [manifest]);

  if (
    !manifest ||
    !Array.isArray(manifest.words) ||
    manifest.words.length === 0 ||
    !Array.isArray(manifest.turns) ||
    manifest.turns.length === 0
  ) {
    return null;
  }

  const effectiveFps = manifest.fps > 0 ? manifest.fps : configFps;
  const currentMs = (frame / effectiveFps) * 1000;

  const match = findActiveOrNearestTurn(manifest.turns, currentMs);
  if (!match) {
    return null;
  }

  const { turn: activeTurn, distanceMs } = match;
  const pages = pagesByTurnId.get(activeTurn.id);
  if (!pages || pages.length === 0) {
    return null;
  }

  const activePageIndex = selectActivePageIndex(pages, currentMs);
  const currentPageWords = pages[activePageIndex];
  const speakerMeta = CHARACTERS[activeTurn.characterId] ?? CHARACTERS.noah;
  const activePillTextColor = getReadablePillTextColor(speakerMeta.accentColor);

  const plaqueOpacity = interpolate(
    distanceMs,
    [0, TURN_CUSHION_MS],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const plaqueLiftPx = interpolate(
    distanceMs,
    [0, TURN_CUSHION_MS],
    [0, 8],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.quad),
    },
  );

  const pageStartMs = currentPageWords[0]?.startMs ?? activeTurn.startMs;
  const pageSettleProgress = interpolate(
    currentMs - pageStartMs,
    [-90, 90],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );
  const pageOffsetY = interpolate(pageSettleProgress, [0, 1], [3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isSpeakingNow =
    currentMs >= activeTurn.startMs && currentMs <= activeTurn.endMs;
  const badgePulse = isSpeakingNow
    ? 0.72 + 0.28 * Math.sin(frame * 0.24)
    : 0.45;

  const highlightStat = activeTurn.highlightStat?.trim();
  const statReveal = interpolate(
    currentMs - activeTurn.startMs,
    [-120, 160],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 308,
        right: 308,
        bottom: 30,
        maxHeight: 185,
        zIndex: 30,
        pointerEvents: "none",
        opacity: plaqueOpacity,
        transform: `translateY(${plaqueLiftPx.toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          position: "relative",
          maxHeight: 185,
          background: "rgba(6, 11, 20, 0.86)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 18,
          padding: "14px 24px 16px 24px",
          overflow: "hidden",
          boxShadow:
            "0 20px 46px rgba(2, 6, 15, 0.64), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Subtle top accent bar keyed to the active speaker */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, ${speakerMeta.accentColor} 0%, ${hexToRgba(
              speakerMeta.accentColor,
              0.72,
            )} 42%, ${hexToRgba(speakerMeta.accentColor, 0.08)} 100%)`,
          }}
        />

        {/* Top header row: Speaker badge dot + Name + OriginTag + optional highlightStat pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            minHeight: 26,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                backgroundColor: speakerMeta.accentColor,
                boxShadow: `0 0 ${Math.round(8 + 6 * badgePulse)}px ${hexToRgba(
                  speakerMeta.accentColor,
                  0.78 * badgePulse,
                )}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: TOKENS.colors.textPrimary,
                whiteSpace: "nowrap",
              }}
            >
              {speakerMeta.name}
            </span>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: "rgba(203, 213, 225, 0.36)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11.5,
                fontWeight: 500,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: speakerMeta.accentColor,
                whiteSpace: "nowrap",
              }}
            >
              {speakerMeta.originTag}
            </span>
          </div>

          {highlightStat ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 11px",
                borderRadius: 999,
                background: hexToRgba(speakerMeta.accentColor, 0.14),
                border: `1px solid ${hexToRgba(speakerMeta.accentColor, 0.42)}`,
                fontFamily: FONTS.mono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: TOKENS.colors.textPrimary,
                whiteSpace: "nowrap",
                flexShrink: 0,
                opacity: interpolate(statReveal, [0, 1], [0.35, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                transform: `scale(${interpolate(statReveal, [0, 1], [0.96, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }).toFixed(3)})`,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: speakerMeta.accentColor,
                }}
              />
              {highlightStat}
            </div>
          ) : null}
        </div>

        {/* Paginated 7-9 word stream (strictly max 2 lines, zero horizontal shift) */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 4,
            rowGap: 5,
            minHeight: 40,
            padding: "2px 0",
            transform: `translateY(${pageOffsetY.toFixed(2)}px)`,
          }}
        >
          {currentPageWords.map((wordObj, wordIndex) => {
            const safeEndMs = Math.max(wordObj.startMs + 1, wordObj.endMs);
            const isActive =
              currentMs >= wordObj.startMs && currentMs < safeEndMs;
            const isSpoken = currentMs >= safeEndMs;

            const wordDurationMs = Math.max(40, safeEndMs - wordObj.startMs);
            const activeRamp = isActive
              ? interpolate(
                  currentMs - wordObj.startMs,
                  [0, Math.min(70, wordDurationMs * 0.45)],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.out(Easing.cubic),
                  },
                )
              : 0;

            const liftY = isActive ? -2 * activeRamp : 0;

            let textColor: string = TOKENS.colors.textSecondary;
            let textOpacity = 0.52;

            if (isActive) {
              textColor = activePillTextColor;
              textOpacity = 1;
            } else if (isSpoken) {
              textColor = TOKENS.colors.textPrimary;
              textOpacity = 0.96;
            }

            return (
              <span
                key={`${activeTurn.id}-p${activePageIndex}-w${wordIndex}-${wordObj.startMs}`}
                style={{
                  display: "inline-grid",
                  alignItems: "center",
                  justifyItems: "center",
                  padding: "2px 8px",
                  borderRadius: 8,
                  fontFamily: FONTS.sans,
                  fontSize: 25,
                  lineHeight: 1.38,
                  letterSpacing: "-0.01em",
                  backgroundColor: isActive
                    ? speakerMeta.accentColor
                    : "transparent",
                  boxShadow: isActive
                    ? `0 4px 14px ${hexToRgba(speakerMeta.accentColor, 0.36)}`
                    : "none",
                  transform: `translateY(${liftY.toFixed(2)}px)`,
                }}
              >
                {/* Invisible bold width-lock prevents horizontal jitter when active word switches to 700 */}
                <span
                  aria-hidden="true"
                  style={{
                    gridArea: "1 / 1",
                    visibility: "hidden",
                    fontWeight: 700,
                    pointerEvents: "none",
                    userSelect: "none",
                    whiteSpace: "pre",
                  }}
                >
                  {wordObj.word}
                </span>
                <span
                  style={{
                    gridArea: "1 / 1",
                    fontWeight: isActive ? 700 : 500,
                    color: textColor,
                    opacity: textOpacity,
                    whiteSpace: "pre",
                  }}
                >
                  {wordObj.word}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SyncedTranscriptBar;
