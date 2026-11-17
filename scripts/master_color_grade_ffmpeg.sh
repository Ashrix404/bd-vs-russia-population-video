#!/usr/bin/env bash
# =============================================================================
# Cinema Post-Render Color Grading & Broadcast EBU R128 (-14 LUFS) Mastering
# =============================================================================
# Executes on GitHub Actions after `npx remotion render` produces raw_remotion.mp4.
#
# Inputs:
#   1. out/raw_remotion.mp4            (or $1)
#   2. public/captions/transcript.srt  (or $2)
#
# Outputs:
#   1. out/bd-vs-russia-population-1080p-mastered.mp4
#   2. out/contact-sheet-8scenes.jpg
#   3. out/poster-thumbnail.png
# =============================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

RAW_INPUT="${1:-out/raw_remotion.mp4}"
SRT_INPUT="${2:-public/captions/transcript.srt}"
OUT_DIR="${OUT_DIR:-out}"
MASTERED_MP4="${3:-${OUT_DIR}/bd-vs-russia-population-1080p-mastered.mp4}"
CONTACT_SHEET_JPG="${OUT_DIR}/contact-sheet-8scenes.jpg"
POSTER_PNG="${OUT_DIR}/poster-thumbnail.png"
MANIFEST_JSON="${MANIFEST_JSON:-src/generated/timeline-manifest.json}"

mkdir -p "$(dirname "$MASTERED_MP4")" "$OUT_DIR"

if [[ ! -s "$RAW_INPUT" ]]; then
  echo "[ERROR] Raw Remotion render not found or empty: $RAW_INPUT" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "[ERROR] ffmpeg and ffprobe are required on PATH." >&2
  exit 1
fi

echo "=================================================================="
echo " Cinema Color-Grade & EBU R128 (-14 LUFS) Mastering Pipeline"
echo "=================================================================="
echo "  Raw Input      : $RAW_INPUT"
echo "  Subtitles SRT  : $SRT_INPUT"
echo "  Manifest JSON  : $MANIFEST_JSON"
echo "  Master Output  : $MASTERED_MP4"
echo "  Contact Sheet  : $CONTACT_SHEET_JPG"
echo "  Poster Still   : $POSTER_PNG"
echo "=================================================================="

# -----------------------------------------------------------------------------
# 1. Define DaVinci/Cinema Video Grade & EBU R128 Loudness Filters
# -----------------------------------------------------------------------------
VIDEO_GRADE_FILTER="curves=m='0/0 0.18/0.15 0.50/0.51 0.80/0.84 1/1',colorbalance=rs=-0.02:gs=0.005:bs=0.025:rh=0.02:gh=0.01:bh=-0.015,eq=saturation=1.06:contrast=1.03,unsharp=5:5:0.30:5:5:0.0,format=yuv420p"
BASE_AUDIO_FILTER="loudnorm=I=-14:TP=-1.5:LRA=11"
AUDIO_MASTER_FILTER="$BASE_AUDIO_FILTER"

HAS_AUDIO="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "$RAW_INPUT" || true)"

if [[ -n "$HAS_AUDIO" ]]; then
  echo "[1/4] Measuring integrated loudness (Pass 1 EBU R128 analysis)..."
  LOUDNORM_LOG="$(ffmpeg -hide_banner -nostats -i "$RAW_INPUT" -vn -sn -af "${BASE_AUDIO_FILTER}:print_format=json" -f null - 2>&1 || true)"

  LINEAR_LOUDNORM="$(
    LOUDNORM_RAW="$LOUDNORM_LOG" python3 - <<'PY'
import json
import math
import os
import re

log = os.environ.get("LOUDNORM_RAW", "")
matches = re.findall(r"\{\s*\"input_i\"[\s\S]*?\}", log)
if not matches:
    raise SystemExit(0)

try:
    data = json.loads(matches[-1])
    inp_i = float(data["input_i"])
    inp_tp = float(data["input_tp"])
    inp_lra = float(data["input_lra"])
    inp_thresh = float(data["input_thresh"])
    offset = float(data["target_offset"])
except Exception:
    raise SystemExit(0)

vals = (inp_i, inp_tp, inp_lra, inp_thresh, offset)
if not all(math.isfinite(v) for v in vals):
    raise SystemExit(0)

if not (-99.0 <= inp_i <= 0.0 and 0.0 <= inp_lra <= 99.0 and -99.0 <= inp_thresh <= 0.0):
    raise SystemExit(0)

print(
    f"loudnorm=I=-14:TP=-1.5:LRA=11:"
    f"measured_I={inp_i:.3f}:measured_TP={inp_tp:.3f}:"
    f"measured_LRA={inp_lra:.3f}:measured_thresh={inp_thresh:.3f}:"
    f"offset={offset:.3f}:linear=true"
)
PY
  )"

  if [[ -n "$LINEAR_LOUDNORM" ]]; then
    AUDIO_MASTER_FILTER="$LINEAR_LOUDNORM"
    echo "      -> Using 2-pass linear EBU R128 filter: $AUDIO_MASTER_FILTER"
  else
    AUDIO_MASTER_FILTER="$BASE_AUDIO_FILTER"
    echo "      -> Using single-pass EBU R128 filter: $AUDIO_MASTER_FILTER"
  fi
else
  echo "[1/4] Notice: No audio stream detected in $RAW_INPUT; synthesizing silent 48 kHz bed."
fi

HAS_VALID_SRT="false"
if [[ -s "$SRT_INPUT" ]] && grep -q -- "-->" "$SRT_INPUT"; then
  HAS_VALID_SRT="true"
fi

# -----------------------------------------------------------------------------
# 2. Encode Mastered 1080p MP4 (Color Grade + -14 LUFS AAC + Soft mov_text SRT)
# -----------------------------------------------------------------------------
echo "[2/4] Encoding cinema-graded BT.709 master MP4..."

FFMPEG_CMD=(ffmpeg -hide_banner -y -i "$RAW_INPUT")

if [[ -z "$HAS_AUDIO" ]]; then
  FFMPEG_CMD+=(-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=48000")
fi

if [[ "$HAS_VALID_SRT" == "true" ]]; then
  FFMPEG_CMD+=(-sub_charenc UTF-8 -i "$SRT_INPUT")
fi

FFMPEG_CMD+=(-map 0:v:0)

if [[ -n "$HAS_AUDIO" ]]; then
  FFMPEG_CMD+=(-map 0:a:0 -af "$AUDIO_MASTER_FILTER")
else
  FFMPEG_CMD+=(-map 1:a:0 -shortest)
fi

if [[ "$HAS_VALID_SRT" == "true" ]]; then
  if [[ -n "$HAS_AUDIO" ]]; then
    FFMPEG_CMD+=(-map 1:s:0)
  else
    FFMPEG_CMD+=(-map 2:s:0)
  fi
fi

FFMPEG_CMD+=(
  -vf "$VIDEO_GRADE_FILTER"
  -c:v libx264
  -profile:v high
  -level 4.2
  -crf 16
  -preset slow
  -pix_fmt yuv420p
  -colorspace bt709
  -color_primaries bt709
  -color_trc bt709
  -c:a aac
  -b:a 256k
  -ar 48000
  -ac 2
  -metadata:s:a:0 language=eng
  -metadata:s:a:0 "title=English Master Stereo (-14 LUFS)"
)

if [[ "$HAS_VALID_SRT" == "true" ]]; then
  FFMPEG_CMD+=(
    -c:s mov_text
    -disposition:s:0 0
    -metadata:s:s:0 language=eng
    -metadata:s:s:0 "title=English Transcript"
  )
fi

FFMPEG_CMD+=(
  -movflags +faststart
  "$MASTERED_MP4"
)

"${FFMPEG_CMD[@]}"

# -----------------------------------------------------------------------------
# 3. Compute Exact 8-Scene Midpoint Frames & Hero Poster Frame
# -----------------------------------------------------------------------------
VSYNC_ARGS=(-vsync vfr)
if ffmpeg -hide_banner -h 2>&1 | grep -q -- "fps_mode"; then
  VSYNC_ARGS=(-fps_mode passthrough)
fi

PROBED_FRAMES="$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$MASTERED_MP4" | head -n 1 | tr -dc '0-9' || true)"
PROBED_DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MASTERED_MP4" | head -n 1 || true)"

read -r SELECT_MIDPOINTS_EXPR POSTER_FRAME < <(
  python3 - "$MANIFEST_JSON" "${PROBED_FRAMES:-0}" "${PROBED_DURATION:-120}" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
probed_frames = int(sys.argv[2] or 0)
probed_duration = float(sys.argv[3] or 120.0)

fps = 30
scenes = []
manifest_total_frames = 0

if manifest_path.is_file():
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        fps = int(manifest.get("fps") or 30)
        manifest_total_frames = int(manifest.get("totalFrames") or 0)
        raw_scenes = manifest.get("scenes") or []
        scenes = sorted(raw_scenes, key=lambda s: int(s.get("sceneIndex", 0)))
    except Exception:
        scenes = []

total_frames = probed_frames if probed_frames > 0 else (
    manifest_total_frames if manifest_total_frames > 0 else max(8, int(round(probed_duration * fps)))
)
max_frame = max(0, total_frames - 1)

midpoints = []
if len(scenes) >= 8:
    for s in scenes[:8]:
        start_f = int(s.get("startFrame", 0))
        dur_f = max(1, int(s.get("durationInFrames", 1)))
        mid_f = start_f + (dur_f // 2)
        midpoints.append(max(0, min(max_frame, mid_f)))
else:
    for idx in range(8):
        mid_f = int(round(((idx + 0.5) / 8.0) * total_frames))
        midpoints.append(max(0, min(max_frame, mid_f)))

# Ensure strictly increasing frame indices when video has >= 8 frames
if total_frames >= 8:
    for i in range(1, len(midpoints)):
        if midpoints[i] <= midpoints[i - 1]:
            midpoints[i] = min(max_frame, midpoints[i - 1] + 1)
    for i in range(len(midpoints) - 2, -1, -1):
        if midpoints[i] >= midpoints[i + 1]:
            midpoints[i] = max(0, midpoints[i + 1] - 1)

# High-impact poster frame at 78% of Scene 1 (3D Globe + Land vs Population shock lockup)
if len(scenes) >= 1:
    s1_start = int(scenes[0].get("startFrame", 0))
    s1_dur = max(1, int(scenes[0].get("durationInFrames", 450)))
    poster_frame = max(0, min(max_frame, s1_start + int(round(s1_dur * 0.78))))
else:
    poster_frame = max(0, min(max_frame, int(round(total_frames * 0.095))))

select_expr = "+".join(f"eq(n,{f})" for f in midpoints)
print(f"{select_expr} {poster_frame}")
PY
)

# -----------------------------------------------------------------------------
# 4. Generate 4x2 8-Scene QA Contact Sheet & 1080p Hero Poster Thumbnail
# -----------------------------------------------------------------------------
echo "[3/4] Rendering 4x2 8-scene midpoint QA contact sheet -> $CONTACT_SHEET_JPG"
ffmpeg -hide_banner -y \
  -i "$MASTERED_MP4" \
  -vf "select='${SELECT_MIDPOINTS_EXPR}',scale=960:540:flags=lanczos:out_range=full,setsar=1:1,tile=4x2:margin=12:padding=8:color=0x050911,format=yuvj420p" \
  -frames:v 1 \
  -update 1 \
  "${VSYNC_ARGS[@]}" \
  -strict unofficial \
  -q:v 2 \
  "$CONTACT_SHEET_JPG"

echo "[4/4] Extracting 1080p hero poster thumbnail (frame ${POSTER_FRAME}) -> $POSTER_PNG"
ffmpeg -hide_banner -y \
  -i "$MASTERED_MP4" \
  -vf "select='eq(n,${POSTER_FRAME})',format=rgb24" \
  -frames:v 1 \
  -update 1 \
  "${VSYNC_ARGS[@]}" \
  "$POSTER_PNG"

# -----------------------------------------------------------------------------
# 5. Final Integrity Verification
# -----------------------------------------------------------------------------
for artifact in "$MASTERED_MP4" "$CONTACT_SHEET_JPG" "$POSTER_PNG"; do
  if [[ ! -s "$artifact" ]]; then
    echo "[ERROR] Expected mastered artifact missing or empty: $artifact" >&2
    exit 1
  fi
done

echo "=================================================================="
echo " Mastering Complete — Verified Output Artifacts:"
ls -lh "$MASTERED_MP4" "$CONTACT_SHEET_JPG" "$POSTER_PNG"
echo "=================================================================="
