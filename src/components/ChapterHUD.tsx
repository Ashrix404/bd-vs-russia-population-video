import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONTS } from "../theme/fonts";
import { TOKENS } from "../theme/tokens";
import type { SceneTiming, TimelineManifest } from "../types/video";

export interface ChapterHUDProps {
  manifest: TimelineManifest;
}

function formatTimecode(frame: number, fps: number): string {
  const safeFrame = Math.max(0, Math.floor(frame));
  const safeFps = Math.max(1, Math.round(fps));

  const totalSeconds = Math.floor(safeFrame / safeFps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = safeFrame % safeFps;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}:${String(frames).padStart(2, "0")}`;
}

function resolveActiveSceneIndex(scenes: SceneTiming[], frame: number): number {
  if (scenes.length === 0) {
    return 0;
  }

  if (frame < scenes[0].startFrame) {
    return 0;
  }

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const endFrame = scene.startFrame + Math.max(1, scene.durationInFrames);
    if (frame >= scene.startFrame && frame < endFrame) {
      return i;
    }
  }

  let latestStartedIndex = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    if (frame >= scenes[i].startFrame) {
      latestStartedIndex = i;
    }
  }

  return latestStartedIndex;
}

export const ChapterHUD: React.FC<ChapterHUDProps> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps: configFps } = useVideoConfig();

  if (!manifest || !Array.isArray(manifest.scenes) || manifest.scenes.length === 0) {
    return null;
  }

  const effectiveFps = manifest.fps > 0 ? manifest.fps : configFps;
  const scenes = manifest.scenes;
  const totalChapters = scenes.length;
  const activeIdx = resolveActiveSceneIndex(scenes, frame);
  const activeScene = scenes[activeIdx];

  const localSceneFrame = Math.max(0, frame - activeScene.startFrame);

  const hudEntrance = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const titleReveal = interpolate(localSceneFrame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const subtitleReveal = interpolate(localSceneFrame, [3, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const chapterNumberText = `${String(activeScene.sceneIndex).padStart(
    2,
    "0",
  )} / ${String(totalChapters).padStart(2, "0")}`;

  const timecodeText = formatTimecode(frame, effectiveFps);
  const liveDotOpacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(frame * 0.16));

  return (
    <header
      style={{
        position: "absolute",
        top: 18,
        left: 48,
        right: 48,
        height: 52,
        zIndex: 35,
        pointerEvents: "none",
        background: "rgba(6, 11, 20, 0.80)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${TOKENS.colors.borderSubtle}`,
        borderRadius: 12,
        padding: "6px 16px 6px 14px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow:
          "0 10px 28px rgba(2, 6, 14, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        opacity: hudEntrance,
        transform: `translateY(${interpolate(hudEntrance, [0, 1], [-8, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }).toFixed(2)}px)`,
      }}
    >
      {/* Top row: Chapter metadata on left, Documentary scale & live timecode on right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          height: 28,
          minWidth: 0,
        }}
      >
        {/* Left: Chapter index pill + scene.title + scene.subtitle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 9px",
              height: 22,
              borderRadius: 6,
              background: "rgba(245, 158, 11, 0.14)",
              border: "1px solid rgba(245, 158, 11, 0.38)",
              fontFamily: FONTS.mono,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              fontVariantNumeric: "tabular-nums",
              color: TOKENS.colors.imperialAmber,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {chapterNumberText}
          </span>

          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: TOKENS.colors.textPrimary,
              whiteSpace: "nowrap",
              flexShrink: 0,
              opacity: interpolate(titleReveal, [0, 1], [0.35, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${interpolate(titleReveal, [0, 1], [3, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }).toFixed(2)}px)`,
            }}
          >
            {activeScene.title}
          </span>

          <span
            style={{
              width: 1,
              height: 13,
              backgroundColor: "rgba(203, 213, 225, 0.24)",
              flexShrink: 0,
            }}
          />

          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(203, 213, 225, 0.78)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
              opacity: subtitleReveal,
              transform: `translateY(${interpolate(
                subtitleReveal,
                [0, 1],
                [3, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ).toFixed(2)}px)`,
            }}
          >
            {activeScene.subtitle}
          </span>
        </div>

        {/* Right: Documentary scale comparison badge + MM:SS:FF live timecode */}
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
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "2px 10px",
              height: 22,
              borderRadius: 6,
              background: "rgba(15, 25, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              fontFamily: FONTS.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.05em",
              fontVariantNumeric: "tabular-nums",
              color: TOKENS.colors.textSecondary,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: TOKENS.colors.bengalEmerald,
                boxShadow: "0 0 6px rgba(16, 185, 129, 0.55)",
              }}
            />
            <span>BANGLADESH 148,460 KM² · RUSSIA 17,098,246 KM²</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: TOKENS.colors.russiaCyan,
                boxShadow: "0 0 6px rgba(56, 189, 248, 0.55)",
              }}
            />
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "2px 9px",
              height: 22,
              borderRadius: 6,
              background: "rgba(5, 9, 17, 0.88)",
              border: "1px solid rgba(226, 232, 240, 0.16)",
              fontFamily: FONTS.mono,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "0.07em",
              fontVariantNumeric: "tabular-nums",
              color: TOKENS.colors.textPrimary,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: TOKENS.colors.bengalCrimson,
                opacity: liveDotOpacity,
              }}
            />
            <span>{timecodeText}</span>
          </div>
        </div>
      </div>

      {/* Bottom of bar: Segmented 8-chapter timeline progress bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 5,
          width: "100%",
        }}
      >
        {scenes.map((scene, idx) => {
          const isPast = idx < activeIdx;
          const isActive = idx === activeIdx;

          const lastFrameOffset = Math.max(1, scene.durationInFrames - 1);
          const activeFill = isActive
            ? interpolate(
                frame,
                [scene.startFrame, scene.startFrame + lastFrameOffset],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )
            : isPast
              ? 1
              : 0;

          return (
            <div
              key={scene.sceneId || `chapter-seg-${scene.sceneIndex}`}
              style={{
                position: "relative",
                flex: `${Math.max(1, scene.durationInFrames)} 1 0%`,
                height: 4,
                borderRadius: 999,
                backgroundColor: isActive
                  ? "rgba(203, 213, 225, 0.24)"
                  : "rgba(148, 163, 184, 0.16)",
                overflow: "hidden",
              }}
            >
              {activeFill > 0 ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 999,
                    transformOrigin: "0% 50%",
                    transform: `scaleX(${activeFill.toFixed(4)})`,
                    background: isActive
                      ? `linear-gradient(90deg, ${TOKENS.colors.bengalEmerald} 0%, ${TOKENS.colors.russiaCyan} 65%, ${TOKENS.colors.imperialAmber} 100%)`
                      : "rgba(203, 213, 225, 0.85)",
                    boxShadow: isActive
                      ? "0 0 8px rgba(56, 189, 248, 0.55)"
                      : "none",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </header>
  );
};

export default ChapterHUD;
