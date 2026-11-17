import React, { useId } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TOKENS, seededUnit } from "../theme/tokens";
import {
  CHARACTERS,
  CharacterId,
  EmotionType,
  GestureType,
} from "../types/video";

export interface CharacterRigProps {
  characterId: CharacterId;
  mouthOpen: number;
  isSpeaking: boolean;
  emotion: EmotionType;
  gesture: GestureType;
  facing: "left" | "right";
  size?: number;
  /**
   * Optional 0..1 turn-envelope override supplied by CharacterStage so
   * foreground gesture arms spring smoothly in at turn start and settle cleanly
   * before turn end. Falls back to a deterministic Remotion spring when omitted.
   */
  gestureProgress?: number;
}

interface CharacterPalette {
  phase: number;
  blinkSeed: number;
  blinkOffset: number;
  skinBase: string;
  skinLight: string;
  skinShadow: string;
  skinDeep: string;
  earInner: string;
  cheekTint: string;
  cheekOpacity: number;
  lipUpper: string;
  lipLower: string;
  irisOuter: string;
  irisInner: string;
  browColor: string;
  hairDark: string;
  hairMid: string;
  hairHighlight: string;
  sleeveMain: string;
  sleeveLight: string;
  sleeveShadow: string;
  cuffColor: string;
  cuffAccent: string;
}

const PALETTES: Record<CharacterId, CharacterPalette> = {
  noah: {
    phase: 0.0,
    blinkSeed: 101,
    blinkOffset: 24,
    skinBase: "#D59A71",
    skinLight: "#E4AF89",
    skinShadow: "#B87A52",
    skinDeep: "#965E3B",
    earInner: "#BA7852",
    cheekTint: "#C96A5B",
    cheekOpacity: 0.16,
    lipUpper: "#A8644B",
    lipLower: "#BD765C",
    irisOuter: "#5C3012",
    irisInner: "#B4651D",
    browColor: "#2C1911",
    hairDark: "#24140E",
    hairMid: "#3B2217",
    hairHighlight: "#693E2A",
    sleeveMain: "#16243A",
    sleeveLight: "#213554",
    sleeveShadow: "#0E1726",
    cuffColor: "#F8FAFC",
    cuffAccent: "#F59E0B",
  },
  rafiq: {
    phase: 1.65,
    blinkSeed: 211,
    blinkOffset: 69,
    skinBase: "#B67850",
    skinLight: "#CA8B62",
    skinShadow: "#965B37",
    skinDeep: "#774425",
    earInner: "#995A38",
    cheekTint: "#A85244",
    cheekOpacity: 0.14,
    lipUpper: "#844B39",
    lipLower: "#9A5B47",
    irisOuter: "#24140C",
    irisInner: "#4D2D1B",
    browColor: "#171A24",
    hairDark: "#11141C",
    hairMid: "#1F2533",
    hairHighlight: "#374151",
    sleeveMain: "#1B222E",
    sleeveLight: "#283244",
    sleeveShadow: "#11161F",
    cuffColor: "#006A4E",
    cuffAccent: "#10B981",
  },
  dmitri: {
    phase: 3.2,
    blinkSeed: 307,
    blinkOffset: 17,
    skinBase: "#EEC8B3",
    skinLight: "#F7DDD0",
    skinShadow: "#D5A68E",
    skinDeep: "#B5846C",
    earInner: "#D49B86",
    cheekTint: "#DF8E88",
    cheekOpacity: 0.24,
    lipUpper: "#BE7F74",
    lipLower: "#CF9186",
    irisOuter: "#0369A1",
    irisInner: "#38BDF8",
    browColor: "#94A3B8",
    hairDark: "#94A3B8",
    hairMid: "#CBD5E1",
    hairHighlight: "#F1F5F9",
    sleeveMain: "#263445",
    sleeveLight: "#36485E",
    sleeveShadow: "#18222E",
    cuffColor: "#1E3A5F",
    cuffAccent: "#38BDF8",
  },
  maya: {
    phase: 4.75,
    blinkSeed: 419,
    blinkOffset: 95,
    skinBase: "#ECC3A5",
    skinLight: "#F7D8C1",
    skinShadow: "#D3A282",
    skinDeep: "#B48263",
    earInner: "#D1977B",
    cheekTint: "#F48B8E",
    cheekOpacity: 0.26,
    lipUpper: "#C96A6E",
    lipLower: "#DF7F84",
    irisOuter: "#1A1210",
    irisInner: "#3D2923",
    browColor: "#111520",
    hairDark: "#0B0E17",
    hairMid: "#171E2E",
    hairHighlight: "#2E3B55",
    sleeveMain: "#E2E8F0",
    sleeveLight: "#F8FAFC",
    sleeveShadow: "#CBD5E1",
    cuffColor: "#1E293B",
    cuffAccent: "#FB7185",
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Stateless, frame-deterministic blink curve with natural 110..144 frame spacing
 * and a 6-frame smooth lid close/open profile.
 */
function computeBlinkAmount(
  frame: number,
  blinkOffset: number,
  blinkSeed: number
): number {
  const shifted = Math.max(0, frame + blinkOffset);
  const basePeriod = 127;
  const cycleIndex = Math.floor(shifted / basePeriod);

  for (let k = Math.max(0, cycleIndex - 1); k <= cycleIndex + 1; k++) {
    const jitter = Math.floor(seededUnit(k * 131 + blinkSeed) * 18); // 0..17 -> spacing strictly 110..144 frames
    const blinkStart = k * basePeriod + 20 + jitter;
    const local = shifted - blinkStart;
    if (local >= 0 && local <= 6) {
      return interpolate(local, [0, 2.4, 3.2, 6], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }

  return 0;
}

interface EmotionRigPose {
  nearBrowLift: number;
  nearBrowInnerTilt: number;
  nearBrowArch: number;
  farBrowLift: number;
  farBrowInnerTilt: number;
  farBrowArch: number;
  upperLidOpen: number;
  lowerLidSmile: number;
  smileCornerLift: number;
  pupilLiftY: number;
  headTiltBias: number;
}

function getEmotionPose(emotion: EmotionType): EmotionRigPose {
  switch (emotion) {
    case "shocked":
      return {
        nearBrowLift: -5.4,
        nearBrowInnerTilt: -1.2,
        nearBrowArch: -4.2,
        farBrowLift: -5.2,
        farBrowInnerTilt: -1.2,
        farBrowArch: -4.0,
        upperLidOpen: 1.5,
        lowerLidSmile: -0.4,
        smileCornerLift: -0.4,
        pupilLiftY: -0.5,
        headTiltBias: -1.1,
      };
    case "analytical":
      return {
        nearBrowLift: 1.1,
        nearBrowInnerTilt: 2.4,
        nearBrowArch: -1.0,
        farBrowLift: -2.1,
        farBrowInnerTilt: -0.8,
        farBrowArch: -2.6,
        upperLidOpen: -0.4,
        lowerLidSmile: 1.1,
        smileCornerLift: 0.5,
        pupilLiftY: -0.2,
        headTiltBias: 1.0,
      };
    case "curious":
      return {
        nearBrowLift: -1.8,
        nearBrowInnerTilt: -3.4,
        nearBrowArch: -2.8,
        farBrowLift: -2.0,
        farBrowInnerTilt: -3.1,
        farBrowArch: -2.7,
        upperLidOpen: 0.7,
        lowerLidSmile: 0.3,
        smileCornerLift: 1.1,
        pupilLiftY: -0.6,
        headTiltBias: 1.6,
      };
    case "proud":
      return {
        nearBrowLift: -2.0,
        nearBrowInnerTilt: -0.6,
        nearBrowArch: -2.4,
        farBrowLift: -1.9,
        farBrowInnerTilt: -0.5,
        farBrowArch: -2.3,
        upperLidOpen: 0.2,
        lowerLidSmile: 1.5,
        smileCornerLift: 2.3,
        pupilLiftY: -0.3,
        headTiltBias: -0.8,
      };
    case "warm":
      return {
        nearBrowLift: -1.4,
        nearBrowInnerTilt: -1.1,
        nearBrowArch: -2.0,
        farBrowLift: -1.4,
        farBrowInnerTilt: -1.0,
        farBrowArch: -1.9,
        upperLidOpen: 0.1,
        lowerLidSmile: 1.7,
        smileCornerLift: 2.5,
        pupilLiftY: 0.0,
        headTiltBias: 0.6,
      };
    case "amused":
      return {
        nearBrowLift: -2.4,
        nearBrowInnerTilt: -0.9,
        nearBrowArch: -2.9,
        farBrowLift: -2.2,
        farBrowInnerTilt: -0.7,
        farBrowArch: -2.7,
        upperLidOpen: -0.2,
        lowerLidSmile: 2.3,
        smileCornerLift: 3.0,
        pupilLiftY: -0.1,
        headTiltBias: 1.1,
      };
    case "neutral":
    default:
      return {
        nearBrowLift: 0,
        nearBrowInnerTilt: 0,
        nearBrowArch: -1.6,
        farBrowLift: 0,
        farBrowInnerTilt: 0,
        farBrowArch: -1.5,
        upperLidOpen: 0,
        lowerLidSmile: 0.4,
        smileCornerLift: 1.3,
        pupilLiftY: 0,
        headTiltBias: 0,
      };
  }
}

interface EyeProps {
  clipId: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  gazeX: number;
  gazeY: number;
  blinkAmount: number;
  upperLidOpen: number;
  lowerLidSmile: number;
  palette: CharacterPalette;
  wingedLash?: boolean;
}

const RigEye: React.FC<EyeProps> = ({
  clipId,
  cx,
  cy,
  rx,
  ry,
  gazeX,
  gazeY,
  blinkAmount,
  upperLidOpen,
  lowerLidSmile,
  palette,
  wingedLash = false,
}) => {
  const openTopOffset = -(ry + upperLidOpen);
  const closedLineY = cy + ry * 0.36;
  const currentTopY = interpolate(
    blinkAmount,
    [0, 1],
    [cy + openTopOffset, closedLineY + 0.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const currentBottomY = interpolate(
    blinkAmount,
    [0, 1],
    [cy + ry - lowerLidSmile * 0.65, closedLineY],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const leftX = cx - rx;
  const rightX = cx + rx;
  const cornerY = cy + 0.5;

  const aperturePath = [
    `M ${leftX} ${cornerY}`,
    `Q ${cx} ${currentTopY - (1 - blinkAmount) * 2.2} ${rightX} ${cornerY - 0.3}`,
    `Q ${cx} ${currentBottomY + (1 - blinkAmount) * 1.9} ${leftX} ${cornerY}`,
    "Z",
  ].join(" ");

  const lashPath = [
    `M ${leftX - (wingedLash ? 1.8 : 0.7)} ${cornerY - (wingedLash ? 0.9 : 0.1)}`,
    `Q ${cx} ${currentTopY - (1 - blinkAmount) * 2.4} ${rightX + 0.6} ${cornerY - 0.3}`,
  ].join(" ");

  const irisCx = cx + gazeX;
  const irisCy = cy + gazeY;
  const irisR = rx * 0.54;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={aperturePath} />
        </clipPath>
      </defs>

      {/* Subtle orbital socket shadow */}
      <ellipse
        cx={cx}
        cy={cy + 0.4}
        rx={rx + 1.4}
        ry={ry + 1.6}
        fill={palette.skinShadow}
        opacity={0.42}
      />

      {blinkAmount < 0.92 && (
        <g clipPath={`url(#${clipId})`}>
          {/* Warm editorial sclera */}
          <rect
            x={cx - rx - 3}
            y={cy - ry - 4}
            width={(rx + 3) * 2}
            height={(ry + 4) * 2}
            fill="#F8FAFC"
          />

          {/* Cast shadow from upper lid across top of sclera */}
          <path
            d={`M ${leftX - 2} ${currentTopY - 3} L ${rightX + 2} ${currentTopY - 3} L ${rightX + 2} ${currentTopY + 2.8} Q ${cx} ${currentTopY + 1.5} ${leftX - 2} ${currentTopY + 2.8} Z`}
            fill="#CBD5E1"
            opacity={0.75}
          />

          {/* Outer + inner layered iris */}
          <circle cx={irisCx} cy={irisCy} r={irisR} fill={palette.irisOuter} />
          <circle
            cx={irisCx + 0.25}
            cy={irisCy + 0.35}
            r={irisR * 0.76}
            fill={palette.irisInner}
          />

          {/* Pupil */}
          <circle
            cx={irisCx + 0.2}
            cy={irisCy + 0.1}
            r={irisR * 0.44}
            fill="#090D16"
          />

          {/* Dual studio catchlights */}
          <circle
            cx={irisCx + irisR * 0.36}
            cy={irisCy - irisR * 0.36}
            r={Math.max(1.05, irisR * 0.24)}
            fill="#FFFFFF"
          />
          <circle
            cx={irisCx - irisR * 0.32}
            cy={irisCy + irisR * 0.34}
            r={Math.max(0.6, irisR * 0.12)}
            fill="#FFFFFF"
            opacity={0.75}
          />
        </g>
      )}

      {/* Upper eyelid skin crease */}
      <path
        d={`M ${leftX + 0.5} ${currentTopY - 2.3} Q ${cx} ${currentTopY - 4.2 * (1 - blinkAmount * 0.6)} ${rightX - 0.6} ${currentTopY - 2.1}`}
        fill="none"
        stroke={palette.skinDeep}
        strokeWidth={0.9}
        strokeLinecap="round"
        opacity={0.55}
      />

      {/* Lower lid warm smile line */}
      <path
        d={`M ${leftX + 1.2} ${currentBottomY + 0.8} Q ${cx} ${currentBottomY + 1.7 - lowerLidSmile * 0.45} ${rightX - 1.0} ${currentBottomY + 0.6}`}
        fill="none"
        stroke={palette.skinShadow}
        strokeWidth={0.95}
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* Upper lash line */}
      <path
        d={lashPath}
        fill="none"
        stroke="#0F172A"
        strokeWidth={wingedLash ? 2.15 : 1.75}
        strokeLinecap="round"
      />
    </g>
  );
};

interface MouthRendererProps {
  clipId: string;
  mouthOpen: number;
  isSpeaking: boolean;
  smileCornerLift: number;
  palette: CharacterPalette;
  emotion: EmotionType;
}

/**
 * 6-Viseme Mouth Renderer:
 *   0.00        -> Viseme 0: Closed serene / warm smile line
 *   0.05..0.22  -> Viseme 1 & 2: Narrow labial / dental consonant slot
 *   0.22..0.45  -> Viseme 3: Medium conversational 'eh/ah' with upper teeth
 *   0.45..0.70  -> Viseme 4: Rounded 'oh' vowel
 *   0.70..1.00  -> Viseme 5: Wide emphatic 'AAH' with tongue & teeth silhouette
 */
const SixVisemeMouth: React.FC<MouthRendererProps> = ({
  clipId,
  mouthOpen,
  isSpeaking,
  smileCornerLift,
  palette,
  emotion,
}) => {
  const effectiveOpen = isSpeaking ? clamp01(mouthOpen) : 0;
  const cx = 116.5;
  const cy = 125.5;

  // 6 viseme anchor stops matching exact specification boundaries:
  // [0.0 (closed), 0.12 (narrow consonant), 0.22 (slot->eh edge), 0.35 (eh/ah), 0.58 (rounded 'oh'), 0.92 (wide 'AAH')]
  const visemeStops = [0.0, 0.05, 0.14, 0.22, 0.35, 0.58, 0.72, 1.0];

  const halfWidth = interpolate(
    effectiveOpen,
    visemeStops,
    [10.2, 10.0, 10.4, 10.9, 11.8, 7.3, 11.4, 13.4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const openHeight = interpolate(
    effectiveOpen,
    visemeStops,
    [0.0, 1.5, 2.7, 3.8, 6.8, 10.6, 12.2, 15.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const cornerSpreadLift = interpolate(
    effectiveOpen,
    [0.0, 0.25, 0.58, 0.85, 1.0],
    [smileCornerLift, smileCornerLift * 0.55, -0.5, 0.4, 0.8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const roundnessFactor = interpolate(
    effectiveOpen,
    [0.0, 0.35, 0.58, 0.75, 1.0],
    [0.52, 0.58, 0.92, 0.72, 0.68],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const upperTeethHeight = interpolate(
    effectiveOpen,
    [0.0, 0.06, 0.22, 0.36, 0.58, 0.75, 1.0],
    [0.0, 0.7, 2.1, 3.1, 1.7, 3.3, 3.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const tongueVisibility = interpolate(
    effectiveOpen,
    [0.0, 0.52, 0.7, 1.0],
    [0.0, 0.15, 0.82, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const lowerTeethVisibility = interpolate(
    effectiveOpen,
    [0.0, 0.66, 0.82, 1.0],
    [0.0, 0.0, 0.75, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Closed serene/warm smile line when silent or < 0.045
  if (effectiveOpen < 0.045) {
    const shockedPart = emotion === "shocked" ? 1.3 : 0;
    const leftX = cx - halfWidth;
    const rightX = cx + halfWidth * 0.92;
    const cornerY = cy - cornerSpreadLift;

    return (
      <g>
        {/* Subtle upper lip Cupid's bow tint */}
        <path
          d={`M ${leftX + 1.2} ${cornerY + 0.2} Q ${cx} ${cy - 1.4} ${rightX - 1.0} ${cornerY + 0.2} Q ${cx} ${cy + 0.8} ${leftX + 1.2} ${cornerY + 0.2} Z`}
          fill={palette.lipUpper}
          opacity={0.48}
        />

        {shockedPart > 0 ? (
          <ellipse
            cx={cx + 0.5}
            cy={cy}
            rx={4.2}
            ry={2.1}
            fill="#2B0E17"
            stroke={palette.lipUpper}
            strokeWidth={1.1}
          />
        ) : (
          <path
            d={`M ${leftX} ${cornerY} Q ${cx + 0.6} ${cy + 1.5} ${rightX} ${cornerY - 0.2}`}
            fill="none"
            stroke="#3B1D1A"
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        )}

        {/* Warm lower lip pillow shadow */}
        <path
          d={`M ${cx - 5.2} ${cy + 3.2} Q ${cx + 0.6} ${cy + 4.5} ${cx + 5.6} ${cy + 3.0}`}
          fill="none"
          stroke={palette.skinShadow}
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.72}
        />
      </g>
    );
  }

  const leftX = cx - halfWidth;
  const rightX = cx + halfWidth * 0.94;
  const topY = cy - openHeight * 0.34;
  const bottomY = cy + openHeight * 0.66;
  const cornerY = cy - cornerSpreadLift * 0.6 + openHeight * 0.06;
  const ctrlDx = halfWidth * roundnessFactor;

  const cavityPath = [
    `M ${leftX} ${cornerY}`,
    `C ${cx - ctrlDx} ${topY}, ${cx + ctrlDx} ${topY}, ${rightX} ${cornerY}`,
    `C ${cx + ctrlDx} ${bottomY}, ${cx - ctrlDx} ${bottomY}, ${leftX} ${cornerY}`,
    "Z",
  ].join(" ");

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={cavityPath} />
        </clipPath>
      </defs>

      {/* Outer lip vermilion halo */}
      <path
        d={cavityPath}
        fill="none"
        stroke={palette.lipLower}
        strokeWidth={2.5}
        strokeLinejoin="round"
        opacity={0.78}
      />

      {/* Clipped oral cavity + teeth + tongue */}
      <g clipPath={`url(#${clipId})`}>
        {/* Deep oral cavity */}
        <rect
          x={cx - 18}
          y={cy - 12}
          width={36}
          height={34}
          fill="#260B14"
        />

        {/* Warm tongue silhouette (prominent on wide emphatic 'AAH' 0.70..1.0) */}
        {tongueVisibility > 0.05 && (
          <ellipse
            cx={cx + 0.5}
            cy={bottomY - openHeight * 0.14}
            rx={halfWidth * 0.68}
            ry={openHeight * 0.38}
            fill="#E05A66"
            opacity={tongueVisibility}
          />
        )}
        {tongueVisibility > 0.45 && (
          <path
            d={`M ${cx - halfWidth * 0.35} ${bottomY - openHeight * 0.24} Q ${cx + 0.5} ${bottomY - openHeight * 0.36} ${cx + halfWidth * 0.38} ${bottomY - openHeight * 0.22}`}
            fill="none"
            stroke="#F48B94"
            strokeWidth={1.1}
            strokeLinecap="round"
            opacity={tongueVisibility * 0.75}
          />
        )}

        {/* Upper teeth band (visible in consonant slot, 'eh/ah', and 'AAH') */}
        {upperTeethHeight > 0.2 && (
          <path
            d={`M ${leftX - 1} ${topY - 2} L ${rightX + 1} ${topY - 2} L ${rightX + 0.4} ${topY + upperTeethHeight} Q ${cx} ${topY + upperTeethHeight + 0.7} ${leftX - 0.4} ${topY + upperTeethHeight} Z`}
            fill="#F8FAFC"
          />
        )}

        {/* Lower teeth silhouette glint on wide emphatic 'AAH' */}
        {lowerTeethVisibility > 0.05 && (
          <path
            d={`M ${cx - halfWidth * 0.64} ${bottomY + 1.6} Q ${cx} ${bottomY - 2.0} ${cx + halfWidth * 0.62} ${bottomY + 1.6} Z`}
            fill="#E2E8F0"
            opacity={lowerTeethVisibility * 0.88}
          />
        )}
      </g>

      {/* Crisp inner lip contour */}
      <path
        d={cavityPath}
        fill="none"
        stroke={palette.lipUpper}
        strokeWidth={1.35}
        strokeLinejoin="round"
      />

      {/* Lower chin-lip crease */}
      <path
        d={`M ${cx - 4.8} ${bottomY + 2.4} Q ${cx + 0.5} ${bottomY + 3.5} ${cx + 5.2} ${bottomY + 2.2}`}
        fill="none"
        stroke={palette.skinShadow}
        strokeWidth={1.05}
        strokeLinecap="round"
        opacity={0.62}
      />
    </g>
  );
};

interface GestureArmProps {
  gesture: GestureType;
  liftProgress: number;
  waveDeg: number;
  palette: CharacterPalette;
}

const GestureArm: React.FC<GestureArmProps> = ({
  gesture,
  liftProgress,
  waveDeg,
  palette,
}) => {
  if (gesture === "none" || liftProgress <= 0.01) {
    return null;
  }

  const translateY = interpolate(liftProgress, [0, 1], [62, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(liftProgress, [0, 1], [-8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(liftProgress, [0, 0.18, 1], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pivotX = gesture === "chin_think" ? 136 : 158;
  const pivotY = 214;
  const armRot =
    interpolate(liftProgress, [0, 1], [16, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) + waveDeg;

  return (
    <g
      opacity={opacity}
      transform={`translate(${translateX}, ${translateY}) rotate(${armRot} ${pivotX} ${pivotY})`}
    >
      {gesture === "point_up" && (
        <g>
          {/* Tailored forearm sleeve */}
          <path
            d="M 142 232 L 154 182 L 176 187 L 170 232 Z"
            fill={palette.sleeveMain}
            stroke={palette.sleeveShadow}
            strokeWidth={1.1}
          />
          <path d="M 154 182 L 163 184 L 155 232 L 142 232 Z" fill={palette.sleeveLight} opacity={0.55} />
          {/* Cuff band */}
          <path
            d="M 153.5 181 L 176.5 186 L 175.2 191.5 L 152.2 186.5 Z"
            fill={palette.cuffColor}
          />
          <line
            x1={153.5}
            y1={181.5}
            x2={176.5}
            y2={186.5}
            stroke={palette.cuffAccent}
            strokeWidth={1.6}
          />

          {/* Sculpted palm + raised index finger */}
          <path
            d="M 156 182 C 153 175, 154 166, 159 163 L 160 144 C 160.2 140.5, 165.4 140.5, 165.6 144.2 L 165.6 162 C 173 163, 178 169, 176 179 L 173 185 Z"
            fill={palette.skinBase}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
          />
          {/* Index finger highlight plane */}
          <path
            d="M 161.2 143.5 L 164.2 143.5 L 164.2 162 L 161.2 162 Z"
            fill={palette.skinLight}
            opacity={0.7}
          />
          {/* Curled middle/ring/pinky knuckles */}
          <path
            d="M 165.5 165 C 171.5 165, 172.5 170, 166.5 170.5 M 166.2 170.5 C 172.5 170.8, 173 175.5, 167 176 M 166.5 176 C 171.5 176.2, 171.8 180.5, 166.5 180.8"
            fill="none"
            stroke={palette.skinDeep}
            strokeWidth={1.05}
            strokeLinecap="round"
          />
          {/* Thumb tucked across palm */}
          <path
            d="M 155.5 174 C 154.5 168.5, 161.5 166.5, 166.5 170.2 C 167.2 172.8, 162.5 176, 157.5 176 Z"
            fill={palette.skinLight}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
          />
        </g>
      )}

      {gesture === "open_palms" && (
        <g>
          {/* Forearm angled slightly outward */}
          <path
            d="M 138 232 L 154 188 L 176 195 L 166 232 Z"
            fill={palette.sleeveMain}
            stroke={palette.sleeveShadow}
            strokeWidth={1.1}
          />
          <path
            d="M 153.5 187 L 176.5 194 L 174.8 199.2 L 151.8 192.2 Z"
            fill={palette.cuffColor}
          />
          <line
            x1={153.5}
            y1={187.5}
            x2={176.5}
            y2={194.5}
            stroke={palette.cuffAccent}
            strokeWidth={1.6}
          />

          {/* Open 3/4 expressive palm */}
          <path
            d="M 155 188 C 150 181, 148 173, 151 169 C 153 167, 156 170, 157 174 L 160 158 C 160.8 155, 164.8 155.5, 164.6 159 L 163.8 171 L 168.5 156.5 C 169.6 153.8, 173.5 154.8, 172.8 158.2 L 169.8 172 L 175.8 159.5 C 177.2 157.2, 180.5 158.6, 179.4 161.8 L 174.5 174.5 L 180.2 165.5 C 181.6 163.8, 184.2 165.4, 182.8 168.2 L 175.5 183.5 C 173.5 188, 169 191, 164 191 Z"
            fill={palette.skinBase}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
            strokeLinejoin="round"
          />
          {/* Upturned palm light plane + lifeline */}
          <path
            d="M 159 176 Q 166 175 172 181"
            fill="none"
            stroke={palette.skinShadow}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <ellipse
            cx={164}
            cy={181}
            rx={5.5}
            ry={4.2}
            fill={palette.skinLight}
            opacity={0.55}
          />
        </g>
      )}

      {gesture === "chin_think" && (
        <g>
          {/* Forearm angled inward toward chin */}
          <path
            d="M 136 232 L 124 176 L 145 172 L 162 232 Z"
            fill={palette.sleeveMain}
            stroke={palette.sleeveShadow}
            strokeWidth={1.1}
          />
          <path
            d="M 123.5 175 L 145.5 171 L 146.5 176.2 L 124.5 180.2 Z"
            fill={palette.cuffColor}
          />
          <line
            x1={123.8}
            y1={175.4}
            x2={145.5}
            y2={171.4}
            stroke={palette.cuffAccent}
            strokeWidth={1.6}
          />

          {/* Thoughtful hand resting near chin/jaw */}
          <path
            d="M 125 175 C 120 169, 118 161, 121 155 L 116.5 144.5 C 115.4 141.8, 119.5 140.2, 121.2 143.2 L 126.8 154.5 C 133.5 153.5, 140.5 158, 141.5 166.5 L 142 172 Z"
            fill={palette.skinBase}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
            strokeLinejoin="round"
          />
          {/* Thumb tucked under jaw */}
          <path
            d="M 122 162 C 116.5 160, 114.5 155.5, 118 153.5 C 121 152, 125.5 155, 127 159.5"
            fill={palette.skinLight}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
            strokeLinecap="round"
          />
          {/* Softly folded fingers */}
          <path
            d="M 129 158.5 Q 136 158.5 136.5 163 M 130 163.5 Q 137 163.5 137 168"
            fill="none"
            stroke={palette.skinDeep}
            strokeWidth={1.0}
            strokeLinecap="round"
          />
        </g>
      )}

      {gesture === "count_fingers" && (
        <g>
          {/* Forearm raised cleanly for enumerating points */}
          <path
            d="M 140 232 L 152 184 L 174 189 L 168 232 Z"
            fill={palette.sleeveMain}
            stroke={palette.sleeveShadow}
            strokeWidth={1.1}
          />
          <path
            d="M 151.5 183 L 174.5 188 L 173.2 193.2 L 150.2 188.2 Z"
            fill={palette.cuffColor}
          />
          <line
            x1={151.8}
            y1={183.4}
            x2={174.5}
            y2={188.4}
            stroke={palette.cuffAccent}
            strokeWidth={1.6}
          />

          {/* 3-finger enumeration fan (index, middle, ring extended; thumb + pinky folded) */}
          <path
            d="M 154 184 C 151 177, 152 169, 156 165 L 154.5 147.5 C 154.2 144, 158.8 143.6, 159.4 147.2 L 161.2 163 L 164.8 145 C 165.5 141.5, 170.2 142.2, 169.6 145.8 L 167.2 163.5 L 173.2 148.5 C 174.4 145.4, 178.8 146.8, 177.6 150.2 L 171.8 166.5 C 176.2 169, 177.5 175.5, 174.5 182.5 L 172 187.5 Z"
            fill={palette.skinBase}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
            strokeLinejoin="round"
          />
          {/* Folded thumb & pinky lock */}
          <path
            d="M 155 175 C 156 169.5, 164 168.5, 170.5 173.5 C 171.5 176.8, 166 179.5, 159 178.5 Z"
            fill={palette.skinLight}
            stroke={palette.skinDeep}
            strokeWidth={0.95}
          />
        </g>
      )}
    </g>
  );
};

export const CharacterRig: React.FC<CharacterRigProps> = ({
  characterId,
  mouthOpen,
  isSpeaking,
  emotion,
  gesture,
  facing,
  size = 196,
  gestureProgress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, "");

  const palette = PALETTES[characterId];
  const meta = CHARACTERS[characterId];
  const clampedMouth = isSpeaking ? clamp01(mouthOpen) : 0;
  const emotionPose = getEmotionPose(emotion);

  // 1. Deterministic breathing torso rise (exact specification formula)
  const breathY = Math.sin(frame * 0.07 + palette.phase) * 2.2;

  // 2. Deterministic head rotation (exact specification formula) + subtle emotion tilt & nod
  const baseHeadRotation = isSpeaking
    ? Math.sin(frame * 0.19) * 3.2 + clampedMouth * 2.5
    : Math.sin(frame * 0.05 + palette.phase) * 1.4;
  const headRotationDeg = baseHeadRotation + emotionPose.headTiltBias * 0.45;
  const headNodY = isSpeaking
    ? -clampedMouth * 1.35
    : Math.sin(frame * 0.085 + palette.phase * 0.8) * 1.15;

  // 3. Jaw vertical drop synchronized with speech aperture
  const jawDrop = interpolate(
    clampedMouth,
    [0, 0.22, 0.45, 0.7, 1.0],
    [0, 1.0, 2.2, 3.6, 5.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 4. Deterministic natural eye-blink every ~110-144 frames (6-frame smooth lid close/open)
  const blinkAmount = computeBlinkAmount(
    frame,
    palette.blinkOffset,
    palette.blinkSeed
  );

  // 5. Subtle pupil shift toward center stage (+X in canonical right-facing space)
  const gazeX =
    1.65 +
    Math.sin(frame * 0.043 + palette.phase) * 0.7 +
    (isSpeaking ? 0.35 : 0);
  const gazeY =
    emotionPose.pupilLiftY + Math.cos(frame * 0.037 + palette.phase) * 0.38;

  // 6. Speech-coupled micro brow lift
  const speechBrowLift = isSpeaking ? -clampedMouth * 1.65 : 0;

  // 7. Foreground gesture arm spring
  const fallbackSpring =
    isSpeaking && gesture !== "none"
      ? spring({
          frame,
          fps,
          config: { damping: 14, stiffness: 138, mass: 0.78 },
        })
      : 0;
  const effectiveGestureLift =
    gestureProgress !== undefined ? clamp01(gestureProgress) : fallbackSpring;
  const wristWaveDeg = isSpeaking
    ? Math.sin(frame * 0.17 + palette.phase) * 2.8 + clampedMouth * 3.1
    : 0;

  // SVG scoped IDs
  const viewportClipId = `${uid}-vp`;
  const nearEyeClipId = `${uid}-eye-n`;
  const farEyeClipId = `${uid}-eye-f`;
  const mouthClipId = `${uid}-mouth`;
  const haloGradId = `${uid}-halo`;
  const tortoiseGradId = `${uid}-tortoise`;
  const steelGradId = `${uid}-steel`;
  const lensSheenId = `${uid}-lens`;

  // Dynamic head silhouette incorporating jawDrop
  const chinY = (characterId === "maya" ? 142.5 : 144.5) + jawDrop;
  const jawCornerY = 129.5 + jawDrop * 0.42;
  const farJawY = 125.5 + jawDrop * 0.55;

  const headPath = [
    "M 79 88",
    "C 77 67, 92 56, 113 56",
    "C 132 56, 143 67, 142.5 85",
    "C 142.5 96, 143.5 106, 141.5 116",
    `C 140 122, 134 ${farJawY + 7}, 123 ${chinY - 1.2}`,
    `Q 116.5 ${chinY + 1.8} 108.5 ${chinY - 1.5}`,
    `C 96 ${chinY - 6}, 86 ${jawCornerY + 3}, 83.5 ${jawCornerY}`,
    "C 80.5 121, 79 104, 79 88",
    "Z",
  ].join(" ");

  // Eyebrow curves
  const nearBrowY = 82.8 + emotionPose.nearBrowLift + speechBrowLift;
  const farBrowY = 82.8 + emotionPose.farBrowLift + speechBrowLift;

  const nearBrowPath = [
    `M 88.5 ${nearBrowY + 1.4}`,
    `Q 99.5 ${nearBrowY + emotionPose.nearBrowArch} 110.2 ${nearBrowY + emotionPose.nearBrowInnerTilt}`,
  ].join(" ");

  const farBrowPath = [
    `M 121.8 ${farBrowY + emotionPose.farBrowInnerTilt}`,
    `Q 131.5 ${farBrowY + emotionPose.farBrowArch} 140.2 ${farBrowY + 1.5}`,
  ].join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <clipPath id={viewportClipId}>
          <rect x="0" y="0" width="220" height="220" rx="14" />
        </clipPath>

        <radialGradient id={haloGradId} cx="50%" cy="46%" r="48%">
          <stop
            offset="0%"
            stopColor={meta.accentColor}
            stopOpacity={isSpeaking ? 0.28 : 0.09}
          />
          <stop
            offset="65%"
            stopColor={meta.accentColor}
            stopOpacity={isSpeaking ? 0.08 : 0.02}
          />
          <stop offset="100%" stopColor={meta.accentColor} stopOpacity={0} />
        </radialGradient>

        {/* Tortoiseshell gradient for Dr. Rafiq's signature round glasses */}
        <linearGradient id={tortoiseGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B1706" />
          <stop offset="28%" stopColor="#A14A12" />
          <stop offset="54%" stopColor="#451A03" />
          <stop offset="79%" stopColor="#C26A1B" />
          <stop offset="100%" stopColor="#2E1104" />
        </linearGradient>

        {/* Brushed steel gradient for Prof. Dmitri's rectangular glasses */}
        <linearGradient id={steelGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="48%" stopColor="#64748B" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>

        {/* Subtle studio glass lens sheen */}
        <linearGradient id={lensSheenId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.18} />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity={0.03} />
          <stop offset="100%" stopColor={meta.accentColor} stopOpacity={0.09} />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${viewportClipId})`}>
        {/* Ambient character backlight halo */}
        <circle cx={110} cy={104} r={92} fill={`url(#${haloGradId})`} />

        {/* Horizontal orientation wrapper: canonical art faces right (+X); mirrors cleanly for facing="left" */}
        <g
          transform={
            facing === "left" ? "translate(220, 0) scale(-1, 1)" : undefined
          }
        >
          {/* ========================================================= */}
          {/* LAYER 1: ARTICULATED TORSO & NECK (Breathing rise)        */}
          {/* ========================================================= */}
          <g transform={`translate(0, ${breathY})`}>
            {/* Back hair silhouette behind neck for Maya's sleek bob */}
            {characterId === "maya" && (
              <path
                d="M 68 88 C 64 114, 66 138, 74 148 L 146 146 C 151 134, 151 108, 145 84 Z"
                fill={palette.hairDark}
              />
            )}

            {/* Anatomical neck column + dynamic chin cast shadow */}
            <path
              d="M 90 128 L 118 128 L 122 162 L 87 162 Z"
              fill={palette.skinBase}
            />
            <path
              d="M 90 128 L 118 128 L 117 148 C 106 151, 95 147, 90 140 Z"
              fill={palette.skinDeep}
              opacity={0.72}
            />
            <path
              d="M 90 128 L 99 128 L 96 160 L 87 160 Z"
              fill={palette.skinShadow}
              opacity={0.65}
            />

            {/* NOAH: Structured navy documentary blazer + amber crew-neck + broadcast lapel mic */}
            {characterId === "noah" && (
              <g>
                {/* Main blazer silhouette */}
                <path
                  d="M 32 232 C 35 190, 52 166, 84 156 L 124 156 C 155 165, 172 189, 176 232 Z"
                  fill="#152338"
                />
                {/* Key-lit front/right shoulder facet */}
                <path
                  d="M 122 156 C 152 164, 169 186, 174 232 L 138 232 L 118 164 Z"
                  fill="#1E314E"
                />
                {/* Warm imperial-amber crew-neck sweater */}
                <path
                  d="M 84 156 Q 106 168 124 156 L 116 218 L 96 218 Z"
                  fill="#D97706"
                />
                {/* Ribbed amber sweater collar */}
                <path
                  d="M 85 154 Q 105 166 123 154 L 121 161 Q 105 172 87 161 Z"
                  fill="#F59E0B"
                />
                {/* Tailored notched blazer lapels */}
                <path
                  d="M 85 154 L 71 169 L 80 175 L 74 184 L 105 224 L 93 162 Z"
                  fill="#0E1828"
                  stroke="#2B446B"
                  strokeWidth={0.95}
                />
                <path
                  d="M 123 154 L 137 168 L 128 175 L 134 184 L 105 224 L 116 162 Z"
                  fill="#1A2C47"
                  stroke="#324F7B"
                  strokeWidth={0.95}
                />
                {/* Pocket welt accent */}
                <path
                  d="M 136 202 L 156 200 L 156 204 L 136 206 Z"
                  fill="#0C1422"
                />
                <line
                  x1={137}
                  y1={201.5}
                  x2={155}
                  y2={199.8}
                  stroke="#F59E0B"
                  strokeWidth={1.1}
                  opacity={0.75}
                />

                {/* Miniature broadcast lapel mic clipped to camera-facing lapel */}
                <g transform="translate(124, 179)">
                  {/* Cord curving neatly into blazer */}
                  <path
                    d="M 1.5 6 C 2 14, -4 18, -9 25"
                    fill="none"
                    stroke="#090D16"
                    strokeWidth={1.35}
                    strokeLinecap="round"
                  />
                  {/* Alligator lapel clip */}
                  <rect
                    x={-3.5}
                    y={1.2}
                    width={8.2}
                    height={3.2}
                    rx={1}
                    fill="#475569"
                    stroke="#94A3B8"
                    strokeWidth={0.6}
                  />
                  {/* Acoustic mic capsule + mesh windscreen */}
                  <rect
                    x={-1.2}
                    y={-5.8}
                    width={5.2}
                    height={7.5}
                    rx={2.5}
                    fill="#0F172A"
                    stroke="#94A3B8"
                    strokeWidth={0.75}
                  />
                  <line
                    x1={-0.4}
                    y1={-3.2}
                    x2={3.2}
                    y2={-3.2}
                    stroke="#CBD5E1"
                    strokeWidth={0.65}
                  />
                  <line
                    x1={-0.4}
                    y1={-1.4}
                    x2={3.2}
                    y2={-1.4}
                    stroke="#CBD5E1"
                    strokeWidth={0.65}
                  />
                  {/* Live tally micro-LED when speaking */}
                  <circle
                    cx={1.4}
                    cy={2.8}
                    r={1.1}
                    fill={isSpeaking ? "#F59E0B" : "#64748B"}
                  />
                </g>
              </g>
            )}

            {/* DR. RAFIQ: Deep Bengal-emerald embroidered bandhgala/panjabi under charcoal studio jacket */}
            {characterId === "rafiq" && (
              <g>
                {/* Charcoal studio jacket */}
                <path
                  d="M 32 232 C 35 190, 53 166, 84 156 L 124 156 C 155 165, 172 189, 176 232 Z"
                  fill="#1A202C"
                />
                <path
                  d="M 123 156 C 154 165, 171 188, 175 232 L 140 232 L 120 164 Z"
                  fill="#252E3E"
                />
                {/* Deep Bengal-emerald bandhgala/panjabi inner tunic */}
                <path
                  d="M 79 156 L 130 156 L 124 232 L 85 232 Z"
                  fill="#006A4E"
                />
                <path
                  d="M 107 156 L 130 156 L 124 232 L 107 232 Z"
                  fill="#047857"
                  opacity={0.75}
                />
                {/* Structured standing mandarin / bandhgala collar with central V-notch */}
                <path
                  d="M 85 147 L 104.5 152 L 107.5 159 L 110.5 152 L 123.5 147 L 126 159 Q 107 166 83 159 Z"
                  fill="#005A42"
                  stroke="#10B981"
                  strokeWidth={1.05}
                />
                {/* Intricate gold-emerald & Bengal-crimson geometric embroidery along placket */}
                <rect
                  x={103.5}
                  y={160}
                  width={8}
                  height={72}
                  fill="#034735"
                  stroke="#10B981"
                  strokeWidth={0.8}
                />
                {[168, 181, 194, 207, 220].map((py, idx) => (
                  <g key={py}>
                    <polygon
                      points={`107.5,${py - 4} 110.8,${py} 107.5,${py + 4} 104.2,${py}`}
                      fill="none"
                      stroke={idx % 2 === 0 ? "#34D399" : "#F59E0B"}
                      strokeWidth={0.9}
                    />
                    <circle
                      cx={107.5}
                      cy={py}
                      r={1.15}
                      fill={idx === 1 ? "#F42A41" : "#FBBF24"}
                    />
                  </g>
                ))}
                {/* Collar edge nakshi stitch accents */}
                <path
                  d="M 87 153 L 102 157 M 112 157 L 123 153"
                  stroke="#FBBF24"
                  strokeWidth={0.95}
                  strokeDasharray="2 2"
                  strokeLinecap="round"
                />
                {/* Tailored charcoal outer jacket lapels */}
                <path
                  d="M 82 155 L 69 175 L 82 232 L 90 232 L 85 162 Z"
                  fill="#121721"
                  stroke="#2E3A4E"
                  strokeWidth={0.95}
                />
                <path
                  d="M 127 155 L 140 175 L 127 232 L 119 232 L 124 162 Z"
                  fill="#202837"
                  stroke="#37455C"
                  strokeWidth={0.95}
                />
              </g>
            )}

            {/* PROF. DMITRI: Arctic-slate ribbed turtleneck under heavy winter wool lapel coat */}
            {characterId === "dmitri" && (
              <g>
                {/* Heavy winter wool overcoat */}
                <path
                  d="M 28 232 C 32 188, 50 163, 82 154 L 126 154 C 158 163, 176 188, 180 232 Z"
                  fill="#253243"
                />
                {/* Frost-lit right shoulder plane */}
                <path
                  d="M 124 154 C 156 163, 174 188, 178 232 L 138 232 L 120 164 Z"
                  fill="#33445A"
                />
                {/* Arctic-slate ribbed turtleneck torso & high folded collar */}
                <path
                  d="M 82 152 L 126 152 L 118 232 L 92 232 Z"
                  fill="#1B3658"
                />
                <path
                  d="M 85 140 C 96 144, 114 144, 123 140 L 126 159 C 113 164, 95 164, 82 159 Z"
                  fill="#23456E"
                  stroke="#38BDF8"
                  strokeOpacity={0.38}
                  strokeWidth={0.95}
                />
                {/* Vertical knit rib lines across turtleneck */}
                {[90, 96, 102, 108, 114, 120].map((rx) => (
                  <line
                    key={rx}
                    x1={rx}
                    y1={142}
                    x2={rx}
                    y2={212}
                    stroke="#132946"
                    strokeWidth={1.15}
                  />
                ))}
                {/* Broad architectural wool storm lapels with top-stitching */}
                <path
                  d="M 83 149 L 61 169 L 73 179 L 65 190 L 101 232 L 90 160 Z"
                  fill="#1A2431"
                  stroke="#475B73"
                  strokeWidth={1.1}
                />
                <path
                  d="M 125 149 L 147 169 L 135 179 L 143 190 L 108 232 L 119 160 Z"
                  fill="#2E3E52"
                  stroke="#566E8A"
                  strokeWidth={1.1}
                />
                {/* Coat lapel buttonhole & wool seam */}
                <line
                  x1={129}
                  y1={172}
                  x2={136}
                  y2={175}
                  stroke="#94A3B8"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                />
              </g>
            )}

            {/* MAYA: Modern ivory-and-slate spatial-lab tech jacket */}
            {characterId === "maya" && (
              <g>
                {/* Ivory technical shell body */}
                <path
                  d="M 34 232 C 37 191, 54 166, 84 156 L 124 156 C 154 166, 171 191, 174 232 Z"
                  fill="#E2E8F0"
                />
                {/* Key-lit crisp ivory front panel */}
                <path
                  d="M 114 156 C 150 165, 169 190, 173 232 L 110 232 Z"
                  fill="#F8FAFC"
                />
                {/* Ergonomic dark-slate technical shoulder yokes */}
                <path
                  d="M 46 184 C 56 168, 70 159, 85 156 L 91 174 L 54 194 Z"
                  fill="#1E293B"
                />
                <path
                  d="M 123 156 C 138 159, 152 168, 162 184 L 154 194 L 118 174 Z"
                  fill="#0F172A"
                />
                {/* Central slate inner zip placket */}
                <path
                  d="M 94 154 L 116 154 L 112 232 L 99 232 Z"
                  fill="#0F172A"
                />
                {/* Asymmetric high technical stand-collar */}
                <path
                  d="M 81 144 L 97 153 L 94 172 L 77 162 Z"
                  fill="#F1F5F9"
                  stroke="#CBD5E1"
                  strokeWidth={0.95}
                />
                <path
                  d="M 127 144 L 113 153 L 116 172 L 131 162 Z"
                  fill="#FFFFFF"
                  stroke="#CBD5E1"
                  strokeWidth={0.95}
                />
                {/* Coral precision seam piping & zipper pull */}
                <path
                  d="M 55 194 L 91 174 L 99 232 M 153 194 L 118 174 L 112 232"
                  fill="none"
                  stroke="#FB7185"
                  strokeWidth={1.55}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1={105.5}
                  y1={156}
                  x2={105.5}
                  y2={232}
                  stroke="#475569"
                  strokeWidth={1.2}
                />
                <rect
                  x={103.5}
                  y={166}
                  width={4}
                  height={7.5}
                  rx={1.8}
                  fill="#FB7185"
                />
                {/* Spatial Lab geometric chest badge */}
                <g transform="translate(73, 194)">
                  <rect
                    x={-8}
                    y={-5}
                    width={16}
                    height={10}
                    rx={2.5}
                    fill="#0F172A"
                    stroke="#FB7185"
                    strokeWidth={0.9}
                  />
                  <circle cx={-3} cy={0} r={1.8} fill="#FB7185" />
                  <line
                    x1={1}
                    y1={-1.5}
                    x2={5.5}
                    y2={-1.5}
                    stroke="#F8FAFC"
                    strokeWidth={1}
                  />
                  <line
                    x1={1}
                    y1={1.8}
                    x2={4.2}
                    y2={1.8}
                    stroke="#94A3B8"
                    strokeWidth={1}
                  />
                </g>
              </g>
            )}
          </g>

          {/* ========================================================= */}
          {/* LAYER 2: ARTICULATED HEAD GROUP                           */}
          {/* ========================================================= */}
          <g
            transform={`translate(0, ${breathY + headNodY}) rotate(${headRotationDeg} 105 142)`}
          >
            {/* Back-of-crown hair base behind skull */}
            {characterId === "noah" && (
              <path
                d="M 70 98 C 66 72, 82 47, 114 48 C 138 49, 148 64, 145 84 Z"
                fill={palette.hairDark}
              />
            )}
            {characterId === "rafiq" && (
              <path
                d="M 69 99 C 65 71, 80 46, 113 46 C 139 46, 149 62, 145 84 Z"
                fill={palette.hairDark}
              />
            )}
            {characterId === "dmitri" && (
              <path
                d="M 69 98 C 65 70, 81 45, 113 45 C 139 45, 149 62, 146 84 Z"
                fill={palette.hairDark}
              />
            )}
            {characterId === "maya" && (
              <path
                d="M 66 112 C 62 76, 78 46, 113 46 C 141 46, 151 68, 148 118 L 138 128 L 138 82 Z"
                fill={palette.hairDark}
              />
            )}

            {/* Near-side ear (3/4 perspective) */}
            <g>
              <path
                d="M 81 92 C 72 89, 68 97, 70 107 C 71.5 115, 78 117.5, 82.5 113.5 Z"
                fill={palette.skinBase}
                stroke={palette.skinShadow}
                strokeWidth={0.9}
              />
              <path
                d="M 79 96 C 74.5 95, 73 100.5, 74.5 106.5 C 75.5 109.5, 78.5 110, 80 108"
                fill="none"
                stroke={palette.earInner}
                strokeWidth={1.35}
                strokeLinecap="round"
              />
            </g>

            {/* Sculpted multi-plane head silhouette */}
            <path d={headPath} fill={palette.skinBase} />

            {/* Key-lit forehead & cheekbone planes (Arcane/Vox planar shading) */}
            <path
              d="M 96 63 C 114 60, 134 64, 139 81 L 134 87 C 121 83, 106 83, 94 86 Z"
              fill={palette.skinLight}
              opacity={0.62}
            />
            <path
              d={`M 79 88 C 80 73, 86 64, 95 60 L 92 89 L 94 ${jawCornerY - 3} L 107 ${chinY - 2} C 94 ${chinY - 5}, 85 ${jawCornerY + 2}, 83.5 ${jawCornerY} C 80.5 121, 79 104, 79 88 Z`}
              fill={palette.skinShadow}
              opacity={0.58}
            />

            {/* Cheekbone key-light facets & warm blush */}
            <ellipse
              cx={98}
              cy={106}
              rx={8.5}
              ry={4.2}
              fill={palette.skinLight}
              opacity={0.48}
            />
            <ellipse
              cx={134}
              cy={105}
              rx={6.2}
              ry={3.8}
              fill={palette.skinLight}
              opacity={0.45}
            />
            <ellipse
              cx={96}
              cy={109}
              rx={7.8}
              ry={4.2}
              fill={palette.cheekTint}
              opacity={palette.cheekOpacity}
            />
            <ellipse
              cx={134}
              cy={108}
              rx={5.8}
              ry={3.6}
              fill={palette.cheekTint}
              opacity={palette.cheekOpacity * 0.85}
            />

            {/* PROF. DMITRI: Neat sculpted silver-ash full beard & mustache (renders cleanly around mouth zone) */}
            {characterId === "dmitri" && (
              <g>
                {/* Full jaw beard with clean central mouth opening */}
                <path
                  d={[
                    "M 81 96",
                    "L 85.5 96",
                    "C 86.5 109, 90 117, 99 119",
                    "L 133 119",
                    "C 138 117, 140.5 112, 141.5 108",
                    `C 142 118, 137 ${farJawY + 10}, 124 ${chinY + 2.5}`,
                    `Q 117 ${chinY + 5.2} 107.5 ${chinY + 2.2}`,
                    `C 94 ${chinY - 2.5}, 84 ${jawCornerY + 5}, 81.5 ${jawCornerY + 1}`,
                    "C 79.5 119, 80 106, 81 96",
                    "Z",
                    // Inner cutout around mouth so all 6 visemes stay 100% legible
                    "M 100.5 119.8",
                    `C 100.5 ${139.5 + jawDrop * 1.2}, 132.5 ${139.5 + jawDrop * 1.2}, 132.5 119.8`,
                    "Z",
                  ].join(" ")}
                  fill="#B8C5D6"
                  fillRule="evenodd"
                  stroke="#8FA0B5"
                  strokeWidth={0.85}
                />
                {/* Chin beard dimensional shadow plane */}
                <path
                  d={`M 96 ${chinY - 4} Q 117 ${chinY + 4.5} 134 ${chinY - 5} Q 117 ${chinY + 1.2} 96 ${chinY - 4} Z`}
                  fill="#8E9FB4"
                  opacity={0.75}
                />
                {/* Neat sculpted silver-ash mustache above upper lip */}
                <path
                  d="M 101.5 121.2 C 103.5 114.8, 111.5 114.2, 116.5 116.4 C 121.5 114.2, 129 114.8, 131 121.2 C 125.5 120.2, 120.5 119.4, 116.5 118.6 C 112.5 119.4, 107 120.2, 101.5 121.2 Z"
                  fill="#E2E8F0"
                  stroke="#94A3B8"
                  strokeWidth={0.75}
                />
              </g>
            )}

            {/* DR. RAFIQ: Subtle distinguished mustache/jaw contour */}
            {characterId === "rafiq" && (
              <path
                d="M 104 120.5 Q 116.5 117.2 128.5 120.5 Q 116.5 119.4 104 120.5 Z"
                fill="#1E2430"
                opacity={0.48}
              />
            )}

            {/* Eyes (near eye + foreshortened 3/4 far eye) */}
            <RigEye
              clipId={nearEyeClipId}
              cx={99.5}
              cy={94}
              rx={9.2}
              ry={5.6}
              gazeX={gazeX}
              gazeY={gazeY}
              blinkAmount={blinkAmount}
              upperLidOpen={emotionPose.upperLidOpen}
              lowerLidSmile={emotionPose.lowerLidSmile}
              palette={palette}
              wingedLash={characterId === "maya"}
            />
            <RigEye
              clipId={farEyeClipId}
              cx={131}
              cy={94}
              rx={7.8}
              ry={5.3}
              gazeX={gazeX * 0.9}
              gazeY={gazeY}
              blinkAmount={blinkAmount}
              upperLidOpen={emotionPose.upperLidOpen}
              lowerLidSmile={emotionPose.lowerLidSmile}
              palette={palette}
              wingedLash={characterId === "maya"}
            />

            {/* Sculpted 3/4 editorial nose (renders cleanly between near & far eye) */}
            <g>
              {/* Nose dorsum key-light bridge */}
              <path
                d="M 115.2 86.5 L 124.4 106.5 L 120.4 108.5 L 113.8 88.5 Z"
                fill={palette.skinLight}
                opacity={0.76}
              />
              {/* Underside shadow plane */}
              <path
                d="M 112.8 109.2 L 124.4 106.8 L 119.2 112.8 L 113.2 111.5 Z"
                fill={palette.skinShadow}
                opacity={0.85}
              />
              {/* Crisp 3/4 bridge & tip contour */}
              <path
                d="M 116 86.5 L 124.6 106.8 C 125.1 108.2, 123.6 109.8, 119.5 111.8"
                fill="none"
                stroke={palette.skinDeep}
                strokeWidth={1.25}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={115.8}
                cy={110.8}
                r={1.05}
                fill={palette.skinDeep}
                opacity={0.75}
              />
            </g>

            {/* Emotion-driven eyebrows */}
            <path
              d={nearBrowPath}
              fill="none"
              stroke={palette.browColor}
              strokeWidth={characterId === "maya" ? 2.4 : 3.1}
              strokeLinecap="round"
            />
            <path
              d={farBrowPath}
              fill="none"
              stroke={palette.browColor}
              strokeWidth={characterId === "maya" ? 2.2 : 2.8}
              strokeLinecap="round"
            />

            {/* 6-Viseme Mouth Renderer */}
            <SixVisemeMouth
              clipId={mouthClipId}
              mouthOpen={clampedMouth}
              isSpeaking={isSpeaking}
              smileCornerLift={emotionPose.smileCornerLift}
              palette={palette}
              emotion={emotion}
            />

            {/* ========================================================= */}
            {/* EYEWEAR LAYER (Over eyes & nose bridge, under front bangs)*/}
            {/* ========================================================= */}

            {/* DR. RAFIQ: Signature round tortoiseshell glasses */}
            {characterId === "rafiq" && (
              <g>
                {/* Temple arm to ear */}
                <line
                  x1={78}
                  y1={95}
                  x2={87.5}
                  y2={92.5}
                  stroke={`url(#${tortoiseGradId})`}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
                {/* Lens glass subtle sheen */}
                <circle
                  cx={99.5}
                  cy={94}
                  r={11.8}
                  fill={`url(#${lensSheenId})`}
                />
                <ellipse
                  cx={131}
                  cy={94}
                  rx={10.2}
                  ry={11.5}
                  fill={`url(#${lensSheenId})`}
                />
                {/* Diagonal studio specular reflection slashes */}
                <line
                  x1={93.5}
                  y1={87.5}
                  x2={98.5}
                  y2={84.8}
                  stroke="#FFFFFF"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  opacity={0.52}
                />
                <line
                  x1={126}
                  y1={87.5}
                  x2={130.5}
                  y2={85}
                  stroke="#FFFFFF"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  opacity={0.48}
                />
                {/* Round tortoiseshell rims */}
                <circle
                  cx={99.5}
                  cy={94}
                  r={11.8}
                  fill="none"
                  stroke={`url(#${tortoiseGradId})`}
                  strokeWidth={2.65}
                />
                <ellipse
                  cx={131}
                  cy={94}
                  rx={10.2}
                  ry={11.5}
                  fill="none"
                  stroke={`url(#${tortoiseGradId})`}
                  strokeWidth={2.5}
                />
                {/* Golden keyhole nose bridge & hinge rivets */}
                <path
                  d="M 111.2 92.2 Q 116.2 89.2 120.8 92.2"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                />
                <circle cx={87.5} cy={92.2} r={1.2} fill="#FBBF24" />
                <circle cx={141.2} cy={92.2} r={1.1} fill="#FBBF24" />
              </g>
            )}

            {/* PROF. DMITRI: Steel-rimmed rectangular glasses */}
            {characterId === "dmitri" && (
              <g>
                {/* Brushed titanium temple arm */}
                <line
                  x1={78}
                  y1={94}
                  x2={87.5}
                  y2={91}
                  stroke={`url(#${steelGradId})`}
                  strokeWidth={2.0}
                  strokeLinecap="round"
                />
                {/* Lens sheen */}
                <rect
                  x={87.5}
                  y={85.5}
                  width={24}
                  height={16.5}
                  rx={3}
                  fill={`url(#${lensSheenId})`}
                />
                <rect
                  x={120.5}
                  y={85.5}
                  width={21}
                  height={16.5}
                  rx={2.8}
                  fill={`url(#${lensSheenId})`}
                />
                {/* Crisp arctic reflection streaks */}
                <line
                  x1={91}
                  y1={88.5}
                  x2={97}
                  y2={87}
                  stroke="#E0F2FE"
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  opacity={0.58}
                />
                <line
                  x1={124}
                  y1={88.5}
                  x2={129}
                  y2={87}
                  stroke="#E0F2FE"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  opacity={0.54}
                />
                {/* Rectangular steel frames + architectural brow bars */}
                <rect
                  x={87.5}
                  y={85.5}
                  width={24}
                  height={16.5}
                  rx={3}
                  fill="none"
                  stroke={`url(#${steelGradId})`}
                  strokeWidth={1.95}
                />
                <rect
                  x={120.5}
                  y={85.5}
                  width={21}
                  height={16.5}
                  rx={2.8}
                  fill="none"
                  stroke={`url(#${steelGradId})`}
                  strokeWidth={1.85}
                />
                <line
                  x1={87.5}
                  y1={86}
                  x2={111.5}
                  y2={86}
                  stroke="#E2E8F0"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
                <line
                  x1={120.5}
                  y1={86}
                  x2={141.5}
                  y2={86}
                  stroke="#E2E8F0"
                  strokeWidth={2.3}
                  strokeLinecap="round"
                />
                {/* Double steel bridge */}
                <line
                  x1={111.5}
                  y1={90}
                  x2={120.5}
                  y2={90}
                  stroke="#CBD5E1"
                  strokeWidth={1.7}
                />
                <line
                  x1={111.5}
                  y1={93}
                  x2={120.5}
                  y2={93}
                  stroke="#64748B"
                  strokeWidth={1.1}
                />
              </g>
            )}

            {/* ========================================================= */}
            {/* FRONT HAIR & HEADSET LAYER                                */}
            {/* ========================================================= */}

            {/* NOAH: Swept dark-chestnut hair with dynamic side-part wave */}
            {characterId === "noah" && (
              <g>
                {/* Tapered temple & sideburn */}
                <path
                  d="M 76 92 C 75 78, 80 65, 89 58 L 92 67 C 86 74, 85 88, 84.5 102 L 81 101 Z"
                  fill={palette.hairMid}
                />
                {/* Swept chestnut wave across crown */}
                <path
                  d="M 86 62 C 92 46, 118 43, 139 53 C 149 58, 150 69, 143 75 C 133 67, 114 64, 96 69 C 91 70.5, 88 67, 86 62 Z"
                  fill={palette.hairMid}
                />
                {/* Sculpted highlight locks */}
                <path
                  d="M 93 57 C 108 49, 129 50, 143 60 C 134 58, 116 57, 98 63 Z"
                  fill={palette.hairHighlight}
                />
                <path
                  d="M 88 64 C 102 59, 121 60, 136 67"
                  fill="none"
                  stroke="#854D32"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  opacity={0.75}
                />
              </g>
            )}

            {/* DR. RAFIQ: Stylish black hair with subtle silver temple streaks */}
            {characterId === "rafiq" && (
              <g>
                {/* Main sculpted dark waves */}
                <path
                  d="M 75 93 C 73 75, 81 55, 96 49 C 115 42, 138 47, 146 62 C 149 68, 146 76, 141 78 C 134 67, 116 62, 95 66 C 87 68, 85 84, 84.5 102 L 80.5 101 Z"
                  fill={palette.hairMid}
                />
                {/* Upper wave contour */}
                <path
                  d="M 90 56 C 108 47, 129 49, 142 59 C 131 56, 112 55, 95 61 Z"
                  fill={palette.hairHighlight}
                />
                {/* Signature silver temple streaks */}
                <path
                  d="M 79.5 82 C 81.5 76, 85 72, 89 70 L 87.5 76 C 84.5 79, 83.5 88, 83.8 98 L 80.8 97.5 Z"
                  fill="#CBD5E1"
                  opacity={0.86}
                />
                <path
                  d="M 82.8 86 L 83.5 100"
                  stroke="#F1F5F9"
                  strokeWidth={1.15}
                  strokeLinecap="round"
                  opacity={0.8}
                />
              </g>
            )}

            {/* PROF. DMITRI: Sculpted silver-ash hair */}
            {characterId === "dmitri" && (
              <g>
                {/* Silver sideburn seamlessly joining full beard */}
                <path
                  d="M 75 93 C 74 75, 82 56, 97 49 C 116 42, 139 47, 146 62 C 149 68, 146 75, 141 77 C 134 66, 116 61, 95 65 C 87 67, 85.5 82, 85.5 98 L 80.5 98 Z"
                  fill={palette.hairMid}
                />
                {/* Frost-silver crest highlight */}
                <path
                  d="M 90 56 C 107 46, 130 48, 143 59 C 131 55, 111 54, 95 61 Z"
                  fill={palette.hairHighlight}
                />
                <path
                  d="M 83 72 C 92 62, 114 58, 136 64"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth={1.35}
                  strokeLinecap="round"
                />
              </g>
            )}

            {/* MAYA: Sleek jet-black bob haircut + coral studio ear-monitor / headset mic */}
            {characterId === "maya" && (
              <g>
                {/* Precision sleek front bob bangs + tucked temple lock */}
                <path
                  d="M 72 92 C 71 71, 82 51, 104 47 C 127 44, 145 55, 148 77 C 149 91, 148 111, 143 125 L 139 122 C 142 108, 142 89, 139 76 C 127 69, 109 66, 89 74 C 83 76.5, 79 84, 77 92 Z"
                  fill={palette.hairDark}
                />
                {/* Glossy Arcane-style geometric shine ribbon */}
                <path
                  d="M 84 63 C 101 55, 125 56, 142 65 L 139 70 C 123 62, 102 61, 86 68 Z"
                  fill={palette.hairHighlight}
                  opacity={0.88}
                />
                <path
                  d="M 88 61 C 105 54, 125 55, 140 62"
                  fill="none"
                  stroke="#FB7185"
                  strokeWidth={1.0}
                  strokeLinecap="round"
                  opacity={0.38}
                />

                {/* Coral studio ear-monitor + sleek headset mic */}
                <g>
                  {/* Molded coral IEM shell seated in ear */}
                  <ellipse
                    cx={77}
                    cy={104.5}
                    rx={5.2}
                    ry={6.4}
                    transform="rotate(-12 77 104.5)"
                    fill="#FB7185"
                    stroke="#FFE4E6"
                    strokeWidth={1.1}
                  />
                  <circle cx={77.2} cy={104.5} r={2.1} fill="#881337" />
                  {/* Curved matte-carbon + coral boom mic arm */}
                  <path
                    d="M 78.5 109.5 C 82 119, 91 124.5, 100.5 125.8"
                    fill="none"
                    stroke="#0F172A"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                  <path
                    d="M 78.5 109.5 C 82 119, 91 124.5, 100.5 125.8"
                    fill="none"
                    stroke="#FB7185"
                    strokeWidth={0.95}
                    strokeLinecap="round"
                  />
                  {/* Miniature headset mic capsule */}
                  <rect
                    x={98.8}
                    y={123.6}
                    width={5.8}
                    height={3.8}
                    rx={1.9}
                    fill="#1E293B"
                    stroke={isSpeaking ? "#FDA4AF" : "#FB7185"}
                    strokeWidth={0.95}
                  />
                  {isSpeaking && (
                    <circle
                      cx={103.2}
                      cy={125.5}
                      r={1.1}
                      fill={TOKENS.colors.coralAccent}
                    />
                  )}
                </g>
              </g>
            )}
          </g>

          {/* ========================================================= */}
          {/* LAYER 3: FOREGROUND ARTICULATED GESTURE HAND / ARM        */}
          {/* ========================================================= */}
          <GestureArm
            gesture={gesture}
            liftProgress={effectiveGestureLift}
            waveDeg={wristWaveDeg}
            palette={palette}
          />
        </g>
      </g>
    </svg>
  );
};

export default CharacterRig;
