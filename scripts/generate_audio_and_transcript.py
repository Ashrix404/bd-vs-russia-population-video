#!/usr/bin/env python3
"""
Synthesizes multi-character neural voiceover audio, runs word-level Whisper
alignment, computes 30fps per-character lip-sync viseme envelopes, and writes:
  - public/audio/lines/<turn_id>.wav
  - public/audio/voiceover_master.wav (48000 Hz, 16-bit PCM mono)
  - src/generated/timeline-manifest.json
  - public/captions/transcript.srt
  - public/captions/transcript.vtt

Designed for zero-local-load execution in GitHub Actions (Python 3.11).
"""

from __future__ import annotations

import base64
import difflib
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

try:
    from scipy.signal import resample_poly as _scipy_resample_poly
except ImportError:
    _scipy_resample_poly = None

# ---------------------------------------------------------------------------
# Project Constants & Voice Profiles
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_JSON_PATH = PROJECT_ROOT / "data" / "script.json"
MANIFEST_JSON_PATH = PROJECT_ROOT / "src" / "generated" / "timeline-manifest.json"
LINES_AUDIO_DIR = PROJECT_ROOT / "public" / "audio" / "lines"
MASTER_VOICEOVER_PATH = PROJECT_ROOT / "public" / "audio" / "voiceover_master.wav"
CAPTIONS_DIR = PROJECT_ROOT / "public" / "captions"
SRT_PATH = CAPTIONS_DIR / "transcript.srt"
VTT_PATH = CAPTIONS_DIR / "transcript.vtt"

KOKORO_CACHE_DIR = Path(
    os.environ.get("KOKORO_CACHE_DIR", str(PROJECT_ROOT / ".cache" / "kokoro"))
)
KOKORO_MODEL_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
    "model-files-v1.0/kokoro-v1.0.onnx"
)
KOKORO_VOICES_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
    "model-files-v1.0/voices-v1.0.bin"
)

FPS = 30
WIDTH = 1920
HEIGHT = 1080
TARGET_SR = 48000
SAMPLES_PER_FRAME = TARGET_SR // FPS  # 1600 samples per 33.333ms frame

# Post-processing & natural room-breath cushions
SILENCE_THRESHOLD_DBFS = -45.0
SILENCE_THRESHOLD_AMP = 10.0 ** (SILENCE_THRESHOLD_DBFS / 20.0)
FADE_MS = 40.0
FADE_SAMPLES = int(round((FADE_MS / 1000.0) * TARGET_SR))  # 1920 samples
PEAK_TARGET_DBFS = -3.0
PEAK_TARGET_AMP = 10.0 ** (PEAK_TARGET_DBFS / 20.0)

INTRO_PAD_MS = 700
INTRA_SCENE_GAP_MS = 240
INTER_SCENE_GAP_MS = 550
OUTRO_HOLD_MS = 1400

CHARACTER_ORDER: tuple[str, ...] = ("noah", "rafiq", "dmitri", "maya")

VOICE_CONFIG: dict[str, dict[str, Any]] = {
    "noah": {
        "speaker_label": "Noah",
        "kokoro_voice": "am_michael",
        "kokoro_lang": "en-us",
        "kokoro_speed": 1.02,
        "gemini_voice": "Charon",
    },
    "rafiq": {
        "speaker_label": "Rafiq",
        "kokoro_voice": "bm_fable",
        "kokoro_lang": "en-gb",
        "kokoro_speed": 1.03,
        "gemini_voice": "Puck",
    },
    "dmitri": {
        "speaker_label": "Dmitri",
        "kokoro_voice": "am_fenrir",
        "kokoro_lang": "en-us",
        "kokoro_speed": 0.98,
        "gemini_voice": "Orus",
    },
    "maya": {
        "speaker_label": "Maya",
        "kokoro_voice": "af_heart",
        "kokoro_lang": "en-us",
        "kokoro_speed": 1.03,
        "gemini_voice": "Aoede",
    },
}

NUMBER_WORDS: dict[str, str] = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "thirteen": "13",
    "fourteen": "14",
    "fifteen": "15",
    "sixteen": "16",
    "seventeen": "17",
    "eighteen": "18",
    "nineteen": "19",
    "twenty": "20",
    "thirty": "30",
    "forty": "40",
    "fifty": "50",
    "sixty": "60",
    "seventy": "70",
    "eighty": "80",
    "ninety": "90",
}

TENS_VALUES: dict[str, int] = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}

ONES_VALUES: dict[str, int] = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
}


# ---------------------------------------------------------------------------
# Data Structures
# ---------------------------------------------------------------------------


@dataclass
class SynthesizedTurn:
    scene_pos: int
    scene_index: int
    turn_id: str
    character_id: str
    raw_turn: dict[str, Any]
    script_words: list[str]
    spoken_phrases: list[str]
    audio_48k: np.ndarray
    audio_rel_path: str
    audio_abs_path: Path
    start_sample: int = 0
    end_sample: int = 0

    @property
    def start_ms(self) -> int:
        return int(round(self.start_sample * 1000.0 / TARGET_SR))

    @property
    def end_ms(self) -> int:
        return int(round(self.end_sample * 1000.0 / TARGET_SR))

    @property
    def start_frame(self) -> int:
        return int(round(self.start_sample / SAMPLES_PER_FRAME))

    @property
    def end_frame(self) -> int:
        return max(self.start_frame + 1, int(round(self.end_sample / SAMPLES_PER_FRAME)))


# ---------------------------------------------------------------------------
# TTS Text Preparation & Token Normalization
# ---------------------------------------------------------------------------


def expand_token_for_tts(token: str, prev_token: str = "") -> str:
    """
    Expands compact cartographic/scientific symbols in a single whitespace token
    into natural spoken English so Kokoro-82M and Gemini TTS pronounce units
    accurately while keeping a 1-to-1 link back to `turn["text"].split()`.
    """
    t = token.strip()
    if not t:
        return ""

    # Pure dash / bullet pause tokens
    if t in {"—", "–", "-", "·", "•", "..."}:
        return ","

    # Extract leading/trailing punctuation around core token
    lead_match = re.match(r'^([("\'\[\{]+)', t)
    trail_match = re.search(r'([)"\'\]\}.,!?;:…]+)$', t)
    lead = lead_match.group(1) if lead_match else ""
    trail = trail_match.group(1) if trail_match else ""
    core_start = len(lead)
    core_end = len(t) - len(trail) if trail else len(t)
    core = t[core_start:core_end] if core_end > core_start else t
    if core == t:
        lead, trail = "", ""

    prev_clean = re.sub(r"[^a-z0-9]", "", prev_token.lower())

    # Replace internal em/en dashes (e.g., "Russia—17.1M" or "20.1-Billion")
    core = core.replace("—", ", ").replace("–", " to ")

    # Normalize Unicode minus before digits (e.g., "−50°C" or "-50°C")
    core = re.sub(r"^[−-](\d)", r"minus \1", core)

    # Temperature units
    core = re.sub(r"(\d+(?:\.\d+)?)\s*°C\b", r"\1 degrees Celsius", core)
    core = re.sub(r"(\d+(?:\.\d+)?)\s*°F\b", r"\1 degrees Fahrenheit", core)
    core = core.replace("°C", "degrees Celsius").replace("°F", "degrees Fahrenheit")

    # Multipliers (e.g., "115.2×", "115x")
    core = re.sub(r"^(\d+(?:,\d{3})*(?:\.\d+)?)\s*[×xX]$", r"\1 times", core)

    # Compact Millions / Billions / Thousands suffixes (e.g., "17.1M", "175M", "20.1B")
    core = re.sub(r"^(\d+(?:,\d{3})*(?:\.\d+)?)M$", r"\1 million", core)
    core = re.sub(r"^(\d+(?:,\d{3})*(?:\.\d+)?)B$", r"\1 billion", core)
    core = re.sub(r"^(\d+(?:,\d{3})*(?:\.\d+)?)K$", r"\1 thousand", core)

    # Percent
    core = re.sub(r"^(\d+(?:,\d{3})*(?:\.\d+)?)%$", r"\1 percent", core)

    # Area units ("km²", "km2")
    if core.lower() in {"km²", "km2"}:
        if prev_clean in {"per", "1", "one", "a", "each", "every", "single"}:
            core = "square kilometer"
        else:
            core = "square kilometers"
    else:
        core = re.sub(r"(\d+(?:,\d{3})*(?:\.\d+)?)km²", r"\1 square kilometers", core)
        core = core.replace("km²", "square kilometers")

    # Versus shorthand
    if core.lower() in {"vs", "vs."}:
        core = "versus"
        if trail == ".":
            trail = ""

    return f"{lead}{core}{trail}".strip()


def build_tts_text_and_phrases(raw_text: str) -> tuple[str, list[str], list[str]]:
    """
    Returns `(tts_text, script_words, spoken_phrases)` where `script_words` is
    exact `raw_text.split()` and `spoken_phrases[i]` is the spoken form of
    `script_words[i]`.
    """
    script_words = raw_text.split()
    spoken_phrases: list[str] = []
    for idx, word in enumerate(script_words):
        prev_word = script_words[idx - 1] if idx > 0 else ""
        spoken_phrases.append(expand_token_for_tts(word, prev_word))

    joined = " ".join(p for p in spoken_phrases if p)
    # Clean spacing before commas introduced by standalone em-dashes
    joined = re.sub(r"\s+,", ",", joined)
    joined = re.sub(r",\s*,+", ",", joined)
    joined = re.sub(r"\s{2,}", " ", joined).strip()
    return joined, script_words, spoken_phrases


def normalize_match_token(token: str) -> str:
    """Normalizes a word for fuzzy/exact alignment against Whisper tokens."""
    cleaned = token.lower().strip()
    cleaned = cleaned.replace("’", "'").replace("‘", "'")
    # Remove possessive/contraction apostrophes cleanly
    cleaned = re.sub(r"[^a-z0-9]", "", cleaned)
    return NUMBER_WORDS.get(cleaned, cleaned)


def tokenize_spoken_phrase(phrase: str) -> list[str]:
    """Splits an expanded spoken phrase into normalized matchable subwords."""
    if not phrase or phrase == ",":
        return []

    # Collapse hyphenated compound numbers like "twenty-eight" -> "28", "sixty-five" -> "65"
    def _replace_compound_num(match: re.Match[str]) -> str:
        tens_w = match.group(1).lower()
        ones_w = match.group(2).lower()
        if tens_w in TENS_VALUES and ones_w in ONES_VALUES:
            return str(TENS_VALUES[tens_w] + ONES_VALUES[ones_w])
        return match.group(0)

    normalized_phrase = re.sub(
        r"\b([A-Za-z]+)-([A-Za-z]+)\b",
        _replace_compound_num,
        phrase,
    )

    parts = re.split(r"[\s/\-]+", normalized_phrase)
    out: list[str] = []
    for p in parts:
        norm = normalize_match_token(p)
        if norm:
            out.append(norm)
    return out


def expand_whisper_word_tokens(
    whisper_raw_words: list[tuple[str, float, float]],
    turn_dur_sec: float,
) -> list[tuple[str, float, float]]:
    """
    Normalizes Whisper word tokens and splits glued unit symbols (e.g., `65%`,
    `-50°C`, `28°C`, `km²`) proportionally across `[start, end]` so every word
    in `script_words` finds a crisp anchor.
    """
    w_items: list[tuple[str, float, float]] = []
    prev_start = 0.0
    for raw_tok, raw_s, raw_e in whisper_raw_words:
        expanded_str = expand_token_for_tts(raw_tok)
        sub_norms = tokenize_spoken_phrase(expanded_str)
        if not sub_norms:
            continue

        s = max(prev_start, min(max(0.0, turn_dur_sec - 0.005), float(raw_s)))
        e = min(turn_dur_sec, max(s + 0.005, float(raw_e)))
        prev_start = s

        if len(sub_norms) == 1:
            w_items.append((sub_norms[0], s, e))
        else:
            weights = [float(max(2, len(tok))) for tok in sub_norms]
            total_w = sum(weights) or float(len(sub_norms))
            cursor = s
            span = e - s
            for idx, (tok, w) in enumerate(zip(sub_norms, weights)):
                nxt = e if idx == len(sub_norms) - 1 else cursor + span * (w / total_w)
                w_items.append((tok, cursor, max(cursor + 0.002, nxt)))
                cursor = nxt

    return w_items


# ---------------------------------------------------------------------------
# Neural TTS Engines (Kokoro-82M ONNX Default + Optional Gemini 2.5 Native TTS)
# ---------------------------------------------------------------------------


def download_file_with_retries(url: str, dest: Path, min_bytes: int = 1_000_000) -> None:
    """Downloads `url` atomically to `dest` if not already cached."""
    if dest.exists() and dest.stat().st_size >= min_bytes:
        return

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest.with_suffix(dest.suffix + ".part")
    last_err: Exception | None = None

    for attempt in range(1, 4):
        try:
            print(f"[Kokoro] Downloading {dest.name} (attempt {attempt}/3)...", flush=True)
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "bd-vs-russia-video-pipeline/1.0"},
            )
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp_path, "wb") as out_f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    out_f.write(chunk)
            if tmp_path.stat().st_size < min_bytes:
                raise RuntimeError(
                    f"Downloaded file {dest.name} is unexpectedly small ({tmp_path.stat().st_size} bytes)"
                )
            os.replace(tmp_path, dest)
            print(
                f"[Kokoro] Cached {dest.name} ({dest.stat().st_size / (1024 * 1024):.1f} MB)",
                flush=True,
            )
            return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            if attempt < 3:
                time.sleep(2.0 * attempt)

    raise RuntimeError(f"Failed to download {url} -> {dest}: {last_err}")


class MultiEngineSynthesizer:
    """
    Synthesizes character turns using `kokoro-onnx` by default, or Google
    Gemini 2.5 Flash Preview TTS when `GEMINI_API_KEY` is non-empty and
    `TTS_ENGINE == "gemini"` (with automatic fallback to `kokoro-onnx`).
    """

    def __init__(self) -> None:
        self._kokoro: Any = None
        self._gemini_client: Any = None
        self._gemini_sdk_checked = False
        self._gemini_disabled = False

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        tts_engine = os.environ.get("TTS_ENGINE", "").strip()
        self.use_gemini = bool(api_key) and tts_engine == "gemini"
        self._api_key = api_key
        self._gemini_model = (
            os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts").strip()
            or "gemini-2.5-flash-preview-tts"
        )
        self._consecutive_gemini_failures = 0

        if self.use_gemini:
            print(
                f"[TTS] Primary engine: Google Gemini Native TTS ({self._gemini_model}) "
                "with automatic kokoro-onnx fallback.",
                flush=True,
            )
        else:
            print(
                "[TTS] Primary engine: kokoro-onnx (Kokoro-82M neural multi-voice TTS).",
                flush=True,
            )

    def _get_kokoro(self) -> Any:
        if self._kokoro is None:
            model_path = KOKORO_CACHE_DIR / "kokoro-v1.0.onnx"
            voices_path = KOKORO_CACHE_DIR / "voices-v1.0.bin"
            download_file_with_retries(KOKORO_MODEL_URL, model_path, min_bytes=50_000_000)
            download_file_with_retries(KOKORO_VOICES_URL, voices_path, min_bytes=5_000_000)

            from kokoro_onnx import Kokoro

            self._kokoro = Kokoro(str(model_path), str(voices_path))
        return self._kokoro

    @staticmethod
    def _split_long_tts_sentences(tts_text: str, max_chars: int = 230) -> list[str]:
        """Splits long turns on sentence boundaries so Kokoro never hits phoneme limits."""
        if len(tts_text) <= max_chars:
            return [tts_text]

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", tts_text) if s.strip()]
        chunks: list[str] = []
        current = ""
        for sent in sentences:
            if not current:
                current = sent
            elif len(current) + 1 + len(sent) <= max_chars:
                current = f"{current} {sent}"
            else:
                chunks.append(current)
                current = sent
        if current:
            chunks.append(current)

        # Secondary clause split if any single sentence is still extraordinarily long
        final_chunks: list[str] = []
        for chunk in chunks:
            if len(chunk) <= 340:
                final_chunks.append(chunk)
            else:
                clauses = [c.strip() for c in re.split(r"(?<=,)\s+", chunk) if c.strip()]
                buf = ""
                for clause in clauses:
                    if not buf:
                        buf = clause
                    elif len(buf) + 1 + len(clause) <= 260:
                        buf = f"{buf} {clause}"
                    else:
                        final_chunks.append(buf)
                        buf = clause
                if buf:
                    final_chunks.append(buf)
        return final_chunks or [tts_text]

    def _synthesize_kokoro(self, tts_text: str, character_id: str) -> tuple[np.ndarray, int]:
        kokoro = self._get_kokoro()
        cfg = VOICE_CONFIG[character_id]
        chunks = self._split_long_tts_sentences(tts_text)
        rendered_parts: list[np.ndarray] = []
        sample_rate = 24000

        for idx, chunk in enumerate(chunks):
            samples, sr = kokoro.create(
                chunk,
                voice=cfg["kokoro_voice"],
                speed=float(cfg["kokoro_speed"]),
                lang=cfg["kokoro_lang"],
            )
            sample_rate = int(sr)
            arr = np.asarray(samples, dtype=np.float32)
            if arr.ndim > 1:
                arr = arr.mean(axis=1).astype(np.float32)
            rendered_parts.append(arr)
            if idx < len(chunks) - 1:
                # Natural 100ms inter-sentence pause inside multi-sentence turns
                rendered_parts.append(np.zeros(int(round(0.10 * sample_rate)), dtype=np.float32))

        combined = (
            np.concatenate(rendered_parts)
            if rendered_parts
            else np.zeros(int(0.25 * sample_rate), dtype=np.float32)
        )
        return combined, sample_rate

    @staticmethod
    def _decode_gemini_audio_bytes(raw_bytes: bytes, mime_type: str) -> tuple[np.ndarray, int]:
        if raw_bytes[:4] == b"RIFF":
            with wave.open(io.BytesIO(raw_bytes), "rb") as wf:
                sr = wf.getframerate()
                n_channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                frames = wf.readframes(wf.getnframes())
            if sampwidth == 2:
                pcm = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
            elif sampwidth == 4:
                pcm = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648.0
            else:
                raise ValueError(f"Unsupported WAV sample width from Gemini: {sampwidth}")
            if n_channels > 1:
                pcm = pcm.reshape(-1, n_channels).mean(axis=1)
            return pcm.astype(np.float32), int(sr)

        rate_match = re.search(r"rate=(\d+)", mime_type or "")
        sr = int(rate_match.group(1)) if rate_match else 24000
        even_len = (len(raw_bytes) // 2) * 2
        if even_len == 0:
            raise ValueError("Gemini returned empty audio payload")
        pcm = np.frombuffer(raw_bytes[:even_len], dtype="<i2").astype(np.float32) / 32768.0
        return pcm, sr

    def _synthesize_gemini(self, tts_text: str, character_id: str) -> tuple[np.ndarray, int]:
        cfg = VOICE_CONFIG[character_id]
        gemini_voice = cfg["gemini_voice"]

        if not self._gemini_sdk_checked:
            self._gemini_sdk_checked = True
            try:
                from google import genai  # type: ignore[import-not-found]

                self._gemini_client = genai.Client(api_key=self._api_key)
            except ImportError:
                self._gemini_client = None

        if self._gemini_client is not None:
            from google.genai import types  # type: ignore[import-not-found]

            response = self._gemini_client.models.generate_content(
                model=self._gemini_model,
                contents=tts_text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=gemini_voice,
                            )
                        )
                    ),
                ),
            )
            candidates = getattr(response, "candidates", None) or []
            for cand in candidates:
                content = getattr(cand, "content", None)
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    inline_data = getattr(part, "inline_data", None)
                    if inline_data and getattr(inline_data, "data", None):
                        data = inline_data.data
                        raw_bytes = base64.b64decode(data) if isinstance(data, str) else bytes(data)
                        mime_type = getattr(inline_data, "mime_type", "") or "audio/L16;rate=24000"
                        return self._decode_gemini_audio_bytes(raw_bytes, mime_type)
            raise RuntimeError("Gemini SDK response contained no inline audio data")

        # Fallback REST call if `google-genai` package is not installed
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._gemini_model}:generateContent?key={self._api_key}"
        )
        payload = {
            "contents": [{"parts": [{"text": tts_text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": gemini_voice}
                    }
                },
            },
        }
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        for cand in body.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    raw_bytes = base64.b64decode(inline["data"])
                    mime_type = inline.get("mimeType") or inline.get("mime_type") or ""
                    return self._decode_gemini_audio_bytes(raw_bytes, mime_type)
        raise RuntimeError("Gemini REST response contained no inlineData audio")

    def synthesize(self, tts_text: str, character_id: str, turn_id: str) -> tuple[np.ndarray, int, str]:
        if self.use_gemini and not self._gemini_disabled:
            try:
                samples, sr = self._synthesize_gemini(tts_text, character_id)
                self._consecutive_gemini_failures = 0
                return samples, sr, "gemini"
            except Exception as exc:  # noqa: BLE001
                self._consecutive_gemini_failures += 1
                print(
                    f"[TTS] Warning: Gemini TTS failed on {turn_id} ({exc}); "
                    "falling back to kokoro-onnx.",
                    flush=True,
                )
                if self._consecutive_gemini_failures >= 3:
                    print(
                        "[TTS] Disabling Gemini TTS for remaining turns after 3 consecutive "
                        "errors/quota limits; continuing seamlessly on kokoro-onnx.",
                        flush=True,
                    )
                    self._gemini_disabled = True

        samples, sr = self._synthesize_kokoro(tts_text, character_id)
        return samples, sr, "kokoro"


# ---------------------------------------------------------------------------
# Studio Audio Post-Processing (48 kHz Resample, Trim, 40ms Fades, -3 dBFS Peak)
# ---------------------------------------------------------------------------


def resample_to_48k(samples: np.ndarray, src_sr: int) -> np.ndarray:
    """Resamples mono float32 audio cleanly to 48000 Hz."""
    arr = np.nan_to_num(np.asarray(samples, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if arr.ndim > 1:
        arr = arr.mean(axis=1).astype(np.float32)
    if arr.size == 0:
        return np.zeros(int(0.25 * TARGET_SR), dtype=np.float32)

    # Remove DC offset
    arr = arr - float(np.mean(arr))

    if src_sr == TARGET_SR:
        return arr.astype(np.float32)

    if _scipy_resample_poly is not None:
        g = math.gcd(TARGET_SR, src_sr)
        up = TARGET_SR // g
        down = src_sr // g
        resampled = _scipy_resample_poly(arr, up, down)
        return np.asarray(resampled, dtype=np.float32)

    target_len = max(1, int(round(len(arr) * (TARGET_SR / float(src_sr)))))
    x_old = np.linspace(0.0, 1.0, num=len(arr), endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
    return np.interp(x_new, x_old, arr).astype(np.float32)


def postprocess_turn_audio(raw_samples: np.ndarray, src_sr: int) -> np.ndarray:
    """
    1. Resamples `src_sr` -> `48000 Hz` float32 mono.
    2. Trims leading/trailing dead air below `-45 dBFS` while preserving natural
       `40ms` breath attack/release margins and smooth half-Hann fades.
    3. Peak-normalizes to `-3.0 dBFS` so all 4 speakers have matched studio presence.
    """
    audio = resample_to_48k(raw_samples, src_sr)

    # Initial peak normalization so the -45 dBFS gate is consistent across engines/voices
    initial_peak = float(np.max(np.abs(audio))) if audio.size > 0 else 0.0
    if initial_peak > 1e-6:
        audio = audio * (PEAK_TARGET_AMP / initial_peak)

    # Smooth 5ms RMS envelope for click-resistant -45 dBFS voice boundary detection
    win = max(1, int(round(0.005 * TARGET_SR)))  # 240 samples @ 48kHz
    sq = audio * audio
    kernel = np.ones(win, dtype=np.float32) / float(win)
    env = np.sqrt(np.convolve(sq, kernel, mode="same"))

    active_indices = np.flatnonzero(env > SILENCE_THRESHOLD_AMP)
    if active_indices.size > 0:
        first_active = int(active_indices[0])
        last_active = int(active_indices[-1])
        trim_start = max(0, first_active - FADE_SAMPLES)
        trim_end = min(len(audio), last_active + FADE_SAMPLES + 1)
        trimmed = audio[trim_start:trim_end].copy()
    else:
        min_samples = int(0.25 * TARGET_SR)
        trimmed = audio[: max(min_samples, len(audio))].copy()

    # Apply natural 40ms raised-cosine (half-Hann) breath attack & release fades
    fade_len = min(FADE_SAMPLES, len(trimmed) // 2)
    if fade_len > 1:
        t = np.linspace(0.0, math.pi, num=fade_len, dtype=np.float32)
        fade_in = 0.5 * (1.0 - np.cos(t))
        fade_out = fade_in[::-1]
        trimmed[:fade_len] *= fade_in
        trimmed[-fade_len:] *= fade_out

    # Final exact peak normalization to -3.0 dBFS
    final_peak = float(np.max(np.abs(trimmed))) if trimmed.size > 0 else 0.0
    if final_peak > 1e-6:
        trimmed = trimmed * (PEAK_TARGET_AMP / final_peak)

    return np.clip(trimmed, -1.0, 1.0).astype(np.float32)


def write_wav_48k_pcm16(path: Path, samples_48k: np.ndarray) -> None:
    """Writes float32 `[-1.0, 1.0]` samples as 48000 Hz 16-bit PCM mono WAV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm16 = np.clip(np.round(samples_48k * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TARGET_SR)
        wf.writeframes(pcm16.tobytes())


# ---------------------------------------------------------------------------
# Word-Level Alignment (faster-whisper + Exact Script Token Cross-Alignment)
# ---------------------------------------------------------------------------


def token_similarity(expected_norm: str, whisper_norm: str) -> float:
    """Computes match confidence in `[0.0, 1.0]` between an expanded script subword and a Whisper word."""
    if not expected_norm or not whisper_norm:
        return 0.0
    if expected_norm == whisper_norm:
        return 1.0
    if len(expected_norm) >= 2 and len(whisper_norm) >= 2:
        if expected_norm in whisper_norm or whisper_norm in expected_norm:
            return 0.86
    ratio = difflib.SequenceMatcher(None, expected_norm, whisper_norm).ratio()
    return ratio if ratio >= 0.68 else 0.0


def align_turn_words(
    turn: SynthesizedTurn,
    whisper_raw_words: list[tuple[str, float, float]],
) -> list[dict[str, Any]]:
    """
    Cross-aligns `turn.script_words` (`turn["text"].split()`) with Whisper's
    word-level timestamps so displayed words ALWAYS preserve 100% exact script
    spelling (`17.1M`, `km²`, `Yakutia`, `Bangladesh`, `Padma`, etc.) and
    frame-accurate spoken timing within `[turn.start_ms, turn.end_ms]`.
    """
    script_words = turn.script_words
    if not script_words:
        return []

    turn_start_ms = turn.start_ms
    turn_end_ms = max(turn_start_ms + len(script_words), turn.end_ms)
    turn_dur_sec = max(0.05, (turn_end_ms - turn_start_ms) / 1000.0)

    # Sanitize & expand Whisper local word timestamps inside [0.0, turn_dur_sec]
    w_items = expand_whisper_word_tokens(whisper_raw_words, turn_dur_sec)

    # Build expanded subword list mapped back to each `script_words` index
    expanded: list[tuple[int, str]] = []
    for s_idx, phrase in enumerate(turn.spoken_phrases):
        subtokens = tokenize_spoken_phrase(phrase)
        for sub in subtokens:
            expanded.append((s_idx, sub))

    # Fallback if a turn consists purely of non-alphanumeric tokens
    if not expanded:
        expanded = [(idx, max(word, "x")) for idx, word in enumerate(script_words)]

    p_count = len(expanded)
    k_count = len(w_items)

    # Monotonic DP alignment between `expanded[0..p_count-1]` and `w_items[0..k_count-1]`
    anchors: list[tuple[int, int]] = []
    if p_count > 0 and k_count > 0:
        dp = np.zeros((p_count + 1, k_count + 1), dtype=np.float64)
        back = np.zeros((p_count + 1, k_count + 1), dtype=np.int8)  # 1: diag, 2: up, 3: left

        for i in range(1, p_count + 1):
            dp[i, 0] = -0.001 * i
            back[i, 0] = 2
        for j in range(1, k_count + 1):
            dp[0, j] = -0.001 * j
            back[0, j] = 3

        for i in range(1, p_count + 1):
            e_norm = expanded[i - 1][1]
            for j in range(1, k_count + 1):
                w_norm = w_items[j - 1][0]
                sim = token_similarity(e_norm, w_norm)
                best_val = dp[i - 1, j] - 0.001
                best_move = 2

                left_val = dp[i, j - 1] - 0.001
                if left_val > best_val:
                    best_val = left_val
                    best_move = 3

                if sim > 0.0:
                    diag_val = dp[i - 1, j - 1] + sim
                    if diag_val >= best_val:
                        best_val = diag_val
                        best_move = 1

                dp[i, j] = best_val
                back[i, j] = best_move

        ci, cj = p_count, k_count
        rev_anchors: list[tuple[int, int]] = []
        while ci > 0 and cj > 0:
            move = int(back[ci, cj])
            if move == 1:
                rev_anchors.append((ci - 1, cj - 1))
                ci -= 1
                cj -= 1
            elif move == 2:
                ci -= 1
            else:
                cj -= 1
        anchors = list(reversed(rev_anchors))

    # Assign local `(start_sec, end_sec)` to every expanded subword
    sub_times: list[tuple[float, float]] = [(0.0, 0.0)] * p_count

    def distribute_span(p_start: int, p_end: int, t_start: float, t_end: float) -> None:
        if p_start > p_end:
            return
        t0 = max(0.0, min(turn_dur_sec, t_start))
        t1 = max(t0 + 0.01, min(turn_dur_sec, t_end))
        weights = [float(max(2, len(expanded[idx][1]))) for idx in range(p_start, p_end + 1)]
        total_w = sum(weights) or float(p_end - p_start + 1)
        cursor = t0
        span = t1 - t0
        for offset, w in enumerate(weights):
            dur = span * (w / total_w)
            nxt = t1 if offset == len(weights) - 1 else cursor + dur
            sub_times[p_start + offset] = (cursor, nxt)
            cursor = nxt

    if not anchors:
        pad = min(0.04, turn_dur_sec * 0.08)
        distribute_span(0, p_count - 1, pad, max(pad + 0.02, turn_dur_sec - pad))
    else:
        for p_idx, k_idx in anchors:
            sub_times[p_idx] = (w_items[k_idx][1], w_items[k_idx][2])

        # Leading unanchored subwords
        first_p, first_k = anchors[0]
        if first_p > 0:
            if first_k > 0:
                lead_s = w_items[0][1]
                lead_e = max(lead_s + 0.02, w_items[first_k - 1][2])
            else:
                lead_s = min(0.03, w_items[first_k][1] * 0.5)
                lead_e = max(lead_s + 0.02, w_items[first_k][1])
            distribute_span(0, first_p - 1, lead_s, lead_e)

        # Interior unanchored subwords between consecutive anchors
        for a_idx in range(len(anchors) - 1):
            p1, k1 = anchors[a_idx]
            p2, k2 = anchors[a_idx + 1]
            if p2 > p1 + 1:
                if k2 > k1 + 1:
                    gap_s = w_items[k1 + 1][1]
                    gap_e = max(gap_s + 0.02, w_items[k2 - 1][2])
                else:
                    gap_s = w_items[k1][2]
                    gap_e = w_items[k2][1]
                    if gap_e <= gap_s + 0.01:
                        mid = 0.5 * (w_items[k1][1] + w_items[k2][2])
                        gap_s = max(0.0, mid - 0.04)
                        gap_e = min(turn_dur_sec, mid + 0.04)
                distribute_span(p1 + 1, p2 - 1, gap_s, gap_e)

        # Trailing unanchored subwords
        last_p, last_k = anchors[-1]
        if last_p < p_count - 1:
            if last_k < k_count - 1:
                trail_s = w_items[last_k + 1][1]
                trail_e = max(trail_s + 0.02, w_items[-1][2])
            else:
                trail_s = w_items[last_k][2]
                trail_e = max(trail_s + 0.02, turn_dur_sec - 0.03)
            distribute_span(last_p + 1, p_count - 1, trail_s, trail_e)

    # Collapse expanded subword times back onto `script_words[0..M-1]`
    word_local_bounds: list[tuple[float, float] | None] = [None] * len(script_words)
    for exp_idx, (s_idx, _) in enumerate(expanded):
        st, et = sub_times[exp_idx]
        cur = word_local_bounds[s_idx]
        if cur is None:
            word_local_bounds[s_idx] = (st, et)
        else:
            word_local_bounds[s_idx] = (min(cur[0], st), max(cur[1], et))

    # Fill any standalone punctuation tokens (e.g. standalone "—") cleanly between neighbors
    m_words = len(script_words)
    idx = 0
    while idx < m_words:
        if word_local_bounds[idx] is not None:
            idx += 1
            continue
        run_end = idx
        while run_end + 1 < m_words and word_local_bounds[run_end + 1] is None:
            run_end += 1
        left_t = word_local_bounds[idx - 1][1] if idx > 0 and word_local_bounds[idx - 1] else 0.02
        right_t = (
            word_local_bounds[run_end + 1][0]
            if run_end + 1 < m_words and word_local_bounds[run_end + 1]
            else turn_dur_sec - 0.02
        )
        if right_t <= left_t + 0.01:
            mid = max(0.01, min(turn_dur_sec - 0.01, left_t))
            left_t = max(0.0, mid - 0.02)
            right_t = min(turn_dur_sec, mid + 0.02)
        span_count = run_end - idx + 1
        step = (right_t - left_t) / float(span_count)
        for k in range(span_count):
            word_local_bounds[idx + k] = (left_t + k * step, left_t + (k + 1) * step)
        idx = run_end + 1

    # Convert to global integer milliseconds and enforce strict monotonic invariants
    aligned_words: list[dict[str, Any]] = []
    cursor_ms = turn_start_ms
    for w_idx, word_str in enumerate(script_words):
        remaining_words = m_words - w_idx - 1
        max_end_for_this = turn_end_ms - remaining_words
        bounds = word_local_bounds[w_idx] or (0.0, turn_dur_sec)
        raw_s_ms = turn_start_ms + int(round(bounds[0] * 1000.0))
        raw_e_ms = turn_start_ms + int(round(bounds[1] * 1000.0))

        s_ms = max(cursor_ms, min(max_end_for_this - 1, raw_s_ms))
        e_ms = max(s_ms + 1, min(max_end_for_this, raw_e_ms))
        cursor_ms = e_ms

        aligned_words.append(
            {
                "word": word_str,
                "startMs": int(s_ms),
                "endMs": int(e_ms),
                "characterId": turn.character_id,
                "sceneIndex": turn.scene_index,
                "turnId": turn.turn_id,
            }
        )

    return aligned_words


# ---------------------------------------------------------------------------
# 30fps Lip-Sync Viseme Envelope Computation
# ---------------------------------------------------------------------------


def compute_viseme_envelopes(
    master_audio: np.ndarray,
    total_frames: int,
    turns: list[SynthesizedTurn],
) -> dict[str, list[float]]:
    """
    Computes 33.33ms window RMS amplitude per global frame, applies soft dynamic
    compression + 2-frame temporal smoothing, normalizes to `[0.0, 1.0]`
    (`< 0.04` -> `0.0`), and assigns values ONLY to the active speaking character.
    """
    visemes: dict[str, list[float]] = {
        cid: [0.0] * total_frames for cid in CHARACTER_ORDER
    }
    if total_frames <= 0:
        return visemes

    raw_rms = np.zeros(total_frames, dtype=np.float32)
    for f in range(total_frames):
        s0 = f * SAMPLES_PER_FRAME
        s1 = min(len(master_audio), (f + 1) * SAMPLES_PER_FRAME)
        if s1 > s0:
            window = master_audio[s0:s1]
            raw_rms[f] = math.sqrt(float(np.mean(window * window)))

    # Soft dynamic compression lifts syllables while taming loud plosives
    compressed = np.power(np.maximum(raw_rms, 0.0), 0.62)

    # 2-frame radius temporal smoothing kernel
    smooth_kernel = np.array([0.10, 0.22, 0.36, 0.22, 0.10], dtype=np.float32)
    smoothed = np.convolve(compressed, smooth_kernel, mode="same")

    active_vals = smoothed[smoothed > 1e-4]
    ref_max = float(np.percentile(active_vals, 99)) if active_vals.size >= 10 else float(np.max(smoothed))
    ref_max = max(ref_max, 1e-4)
    normalized = np.clip(smoothed / ref_max, 0.0, 1.0)

    # Map each speaking frame strictly to its owning character turn
    frame_speaker: list[str | None] = [None] * total_frames
    for t in turns:
        f_start = max(0, min(total_frames, t.start_frame))
        f_end = max(f_start, min(total_frames, t.end_frame))
        for f in range(f_start, f_end):
            frame_speaker[f] = t.character_id

    for f in range(total_frames):
        cid = frame_speaker[f]
        if cid is None:
            continue
        val = float(normalized[f])
        if val < 0.04:
            val = 0.0
        else:
            val = round(val, 3)
        visemes[cid][f] = 0.0 if val == 0.0 else val

    return visemes


# ---------------------------------------------------------------------------
# SRT & WebVTT Caption Formatting (~6-8 Words per Cue with Speaker Prefix)
# ---------------------------------------------------------------------------


def format_caption_time(ms: int, sep: str) -> str:
    clamped = max(0, int(ms))
    hours = clamped // 3_600_000
    rem = clamped % 3_600_000
    minutes = rem // 60_000
    rem %= 60_000
    seconds = rem // 1000
    millis = rem % 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{sep}{millis:03d}"


def build_caption_cues(
    turns: list[SynthesizedTurn],
    words_by_turn: dict[str, list[dict[str, Any]]],
    target_chunk_words: int = 7,
) -> list[tuple[int, int, str]]:
    """Groups aligned words per turn into natural ~6-8 word cues with `[Speaker]` prefixes."""
    cues: list[tuple[int, int, str]] = []

    for turn in turns:
        t_words = words_by_turn.get(turn.turn_id, [])
        if not t_words:
            continue

        speaker_label = VOICE_CONFIG[turn.character_id]["speaker_label"]
        chunks: list[list[dict[str, Any]]] = []
        buf: list[dict[str, Any]] = []

        for idx, w in enumerate(t_words):
            buf.append(w)
            rem = len(t_words) - idx - 1
            tok = w["word"]
            ends_sentence = tok.endswith((".", "!", "?", "—"))
            ends_clause = tok.endswith((",", ";", ":"))

            should_flush = False
            if rem == 0:
                should_flush = True
            elif len(buf) >= 8:
                should_flush = True
            elif len(buf) >= target_chunk_words and rem >= 2:
                should_flush = True
            elif len(buf) >= 4 and ends_sentence and rem >= 2:
                should_flush = True
            elif len(buf) >= 6 and ends_clause and rem >= 2:
                should_flush = True

            # Avoid leaving a 1-word orphan at the end of a turn
            if should_flush and rem == 1 and len(buf) <= 7:
                should_flush = False

            if should_flush:
                chunks.append(buf)
                buf = []

        if buf:
            chunks.append(buf)

        for chunk in chunks:
            start_ms = int(chunk[0]["startMs"])
            end_ms = max(start_ms + 1, int(chunk[-1]["endMs"]))
            text_line = " ".join(item["word"] for item in chunk)
            cues.append((start_ms, end_ms, f"[{speaker_label}] {text_line}"))

    return cues


def write_srt_and_vtt(cues: list[tuple[int, int, str]]) -> None:
    CAPTIONS_DIR.mkdir(parents=True, exist_ok=True)

    srt_blocks: list[str] = []
    vtt_blocks: list[str] = ["WEBVTT", ""]

    for idx, (start_ms, end_ms, text) in enumerate(cues, start=1):
        srt_blocks.append(
            f"{idx}\n"
            f"{format_caption_time(start_ms, ',')} --> {format_caption_time(end_ms, ',')}\n"
            f"{text}\n"
        )
        vtt_blocks.append(
            f"{idx}\n"
            f"{format_caption_time(start_ms, '.')} --> {format_caption_time(end_ms, '.')}\n"
            f"{text}\n"
        )

    SRT_PATH.write_text("\n".join(srt_blocks).strip() + "\n", encoding="utf-8")
    VTT_PATH.write_text("\n".join(vtt_blocks).strip() + "\n", encoding="utf-8")


def serialize_manifest_json(manifest: dict[str, Any]) -> str:
    """
    Serializes `TimelineManifest` as readable 2-space indented UTF-8 JSON while
    keeping each 30fps `visemes` array on a single compact line (~120 KB total).
    """
    placeholder_map: dict[str, str] = {}
    compact_visemes: dict[str, str] = {}
    for cid, arr in manifest["visemes"].items():
        placeholder = f"__VISEME_COMPACT_{cid.upper()}__"
        placeholder_map[f'"{placeholder}"'] = json.dumps(arr, separators=(",", ":"))
        compact_visemes[cid] = placeholder

    shallow_copy = dict(manifest)
    shallow_copy["visemes"] = compact_visemes
    pretty = json.dumps(shallow_copy, indent=2, ensure_ascii=False)
    for quoted_placeholder, array_json in placeholder_map.items():
        pretty = pretty.replace(quoted_placeholder, array_json)

    # Round-trip parse check to guarantee 100% valid JSON output
    json.loads(pretty)
    return pretty + "\n"


# ---------------------------------------------------------------------------
# Main Pipeline Execution
# ---------------------------------------------------------------------------


def main() -> None:
    if not SCRIPT_JSON_PATH.exists():
        raise FileNotFoundError(f"Script file not found: {SCRIPT_JSON_PATH}")

    script_doc: dict[str, Any] = json.loads(SCRIPT_JSON_PATH.read_text(encoding="utf-8"))
    raw_scenes: list[dict[str, Any]] = sorted(
        script_doc.get("scenes", []),
        key=lambda s: int(s["sceneIndex"]),
    )
    if not raw_scenes:
        raise ValueError(f"No scenes found in {SCRIPT_JSON_PATH}")

    LINES_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    MASTER_VOICEOVER_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

    synthesizer = MultiEngineSynthesizer()
    synthesized_turns: list[SynthesizedTurn] = []
    turns_by_scene_pos: list[list[SynthesizedTurn]] = []

    # 1. Synthesize & post-process every dialogue turn
    for scene_pos, scene_spec in enumerate(raw_scenes):
        scene_index = int(scene_spec["sceneIndex"])
        scene_turns_raw = scene_spec.get("turns", [])
        if not scene_turns_raw:
            raise ValueError(f"Scene {scene_index} has no dialogue turns")

        scene_synth_list: list[SynthesizedTurn] = []
        for raw_turn in scene_turns_raw:
            turn_id = str(raw_turn["id"]).strip()
            character_id = str(raw_turn["characterId"]).strip()
            if character_id not in VOICE_CONFIG:
                raise ValueError(f"Unknown characterId '{character_id}' in turn '{turn_id}'")

            raw_text = str(raw_turn["text"]).strip()
            tts_text, script_words, spoken_phrases = build_tts_text_and_phrases(raw_text)

            raw_audio, src_sr, engine_used = synthesizer.synthesize(
                tts_text=tts_text,
                character_id=character_id,
                turn_id=turn_id,
            )
            processed_48k = postprocess_turn_audio(raw_audio, src_sr)

            safe_id = re.sub(r"[^A-Za-z0-9_.-]", "_", turn_id)
            rel_wav = f"audio/lines/{safe_id}.wav"
            abs_wav = LINES_AUDIO_DIR / f"{safe_id}.wav"
            write_wav_48k_pcm16(abs_wav, processed_48k)

            dur_s = len(processed_48k) / float(TARGET_SR)
            print(
                f"[Audio] {turn_id} ({character_id}, {engine_used}): "
                f"{dur_s:.2f}s, {len(script_words)} words -> {rel_wav}",
                flush=True,
            )

            st = SynthesizedTurn(
                scene_pos=scene_pos,
                scene_index=scene_index,
                turn_id=turn_id,
                character_id=character_id,
                raw_turn=raw_turn,
                script_words=script_words,
                spoken_phrases=spoken_phrases,
                audio_48k=processed_48k,
                audio_rel_path=rel_wav,
                audio_abs_path=abs_wav,
            )
            synthesized_turns.append(st)
            scene_synth_list.append(st)

        turns_by_scene_pos.append(scene_synth_list)

    # 2. Assemble master voiceover timeline with exact breathing cushions
    intro_samples = int(round((INTRO_PAD_MS / 1000.0) * TARGET_SR))
    intra_gap_samples = int(round((INTRA_SCENE_GAP_MS / 1000.0) * TARGET_SR))
    inter_gap_samples = int(round((INTER_SCENE_GAP_MS / 1000.0) * TARGET_SR))
    outro_samples = int(round((OUTRO_HOLD_MS / 1000.0) * TARGET_SR))

    timeline_chunks: list[np.ndarray] = [np.zeros(intro_samples, dtype=np.float32)]
    sample_cursor = intro_samples

    for s_pos, scene_turns in enumerate(turns_by_scene_pos):
        for t_pos, st in enumerate(scene_turns):
            st.start_sample = sample_cursor
            timeline_chunks.append(st.audio_48k)
            sample_cursor += len(st.audio_48k)
            st.end_sample = sample_cursor

            is_last_turn_in_scene = t_pos == len(scene_turns) - 1
            is_last_scene = s_pos == len(turns_by_scene_pos) - 1

            if not is_last_turn_in_scene:
                timeline_chunks.append(np.zeros(intra_gap_samples, dtype=np.float32))
                sample_cursor += intra_gap_samples
            elif not is_last_scene:
                timeline_chunks.append(np.zeros(inter_gap_samples, dtype=np.float32))
                sample_cursor += inter_gap_samples
            else:
                timeline_chunks.append(np.zeros(outro_samples, dtype=np.float32))
                sample_cursor += outro_samples

    # Pad final < 1 frame (< 33.3ms) remainder so master audio aligns to exact 30fps frames
    remainder = sample_cursor % SAMPLES_PER_FRAME
    if remainder != 0:
        frame_pad = SAMPLES_PER_FRAME - remainder
        timeline_chunks.append(np.zeros(frame_pad, dtype=np.float32))
        sample_cursor += frame_pad

    master_audio = np.concatenate(timeline_chunks).astype(np.float32)
    total_frames = len(master_audio) // SAMPLES_PER_FRAME
    total_duration_ms = int(round(len(master_audio) * 1000.0 / TARGET_SR))

    write_wav_48k_pcm16(MASTER_VOICEOVER_PATH, master_audio)
    print(
        f"[Master] Wrote {MASTER_VOICEOVER_PATH} "
        f"({total_duration_ms / 1000.0:.2f}s, {total_frames} frames @ {FPS}fps)",
        flush=True,
    )

    # 3. Word-level alignment via faster-whisper (`base.en`, int8 CPU)
    print("[Whisper] Loading faster-whisper 'base.en' (cpu, int8)...", flush=True)
    from faster_whisper import WhisperModel

    whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8")

    all_words: list[dict[str, Any]] = []
    words_by_turn: dict[str, list[dict[str, Any]]] = {}

    for st in synthesized_turns:
        whisper_raw_words: list[tuple[str, float, float]] = []
        try:
            segments, _info = whisper_model.transcribe(
                str(st.audio_abs_path),
                language="en",
                beam_size=5,
                word_timestamps=True,
                vad_filter=False,
                condition_on_previous_text=False,
            )
            for seg in segments:
                seg_words = getattr(seg, "words", None) or []
                for w in seg_words:
                    w_text = (getattr(w, "word", "") or "").strip()
                    if w_text:
                        whisper_raw_words.append((w_text, float(w.start), float(w.end)))
        except Exception as exc:  # noqa: BLE001
            print(
                f"[Whisper] Warning: transcription fallback triggered on {st.turn_id} ({exc})",
                flush=True,
            )

        turn_aligned = align_turn_words(st, whisper_raw_words)
        words_by_turn[st.turn_id] = turn_aligned
        all_words.extend(turn_aligned)

    print(f"[Whisper] Aligned {len(all_words)} exact script words across {len(synthesized_turns)} turns.", flush=True)

    # 4. Compute exact contiguous SceneTiming[] boundaries
    num_scenes = len(raw_scenes)
    scene_start_frames: list[int] = [0]
    for s_pos in range(num_scenes - 1):
        prev_last_turn = turns_by_scene_pos[s_pos][-1]
        next_first_turn = turns_by_scene_pos[s_pos + 1][0]
        mid_sample = (prev_last_turn.end_sample + next_first_turn.start_sample) // 2
        boundary_frame = int(round(mid_sample / SAMPLES_PER_FRAME))
        # Guarantee strictly monotonic positive scene durations
        min_valid = scene_start_frames[-1] + 1
        max_valid = total_frames - (num_scenes - 1 - s_pos)
        boundary_frame = max(min_valid, min(max_valid, boundary_frame))
        scene_start_frames.append(boundary_frame)

    scenes_manifest: list[dict[str, Any]] = []
    for s_pos, scene_spec in enumerate(raw_scenes):
        start_f = scene_start_frames[s_pos]
        end_f = total_frames if s_pos == num_scenes - 1 else scene_start_frames[s_pos + 1]
        dur_f = end_f - start_f

        start_ms = 0 if s_pos == 0 else int(round(start_f * 1000.0 / FPS))
        end_ms = total_duration_ms if s_pos == num_scenes - 1 else int(round(end_f * 1000.0 / FPS))

        active_chars: list[str] = []
        for st in turns_by_scene_pos[s_pos]:
            if st.character_id not in active_chars:
                active_chars.append(st.character_id)

        scenes_manifest.append(
            {
                "sceneIndex": int(scene_spec["sceneIndex"]),
                "sceneId": str(scene_spec["sceneId"]),
                "title": str(scene_spec["title"]),
                "subtitle": str(scene_spec["subtitle"]),
                "startMs": start_ms,
                "endMs": end_ms,
                "startFrame": start_f,
                "durationInFrames": dur_f,
                "activeCharacters": active_chars,
            }
        )

    # 5. Build TurnTiming[] entries preserving all ScriptTurn properties
    turns_manifest: list[dict[str, Any]] = []
    for st in synthesized_turns:
        end_frame_clamped = min(total_frames, st.end_frame)
        start_frame_clamped = min(max(0, st.start_frame), max(0, end_frame_clamped - 1))

        turn_entry: dict[str, Any] = {
            "id": st.turn_id,
            "sceneIndex": st.scene_index,
            "characterId": st.character_id,
            "text": str(st.raw_turn["text"]),
            "emotion": str(st.raw_turn.get("emotion", "neutral")),
            "gesture": str(st.raw_turn.get("gesture", "none")),
        }
        highlight_stat = st.raw_turn.get("highlightStat")
        if isinstance(highlight_stat, str) and highlight_stat.strip():
            turn_entry["highlightStat"] = highlight_stat

        turn_entry.update(
            {
                "startMs": st.start_ms,
                "endMs": st.end_ms,
                "startFrame": start_frame_clamped,
                "endFrame": end_frame_clamped,
                "audioFile": st.audio_rel_path,
            }
        )
        turns_manifest.append(turn_entry)

    # 6. Compute 30fps per-character lip-sync viseme envelopes
    visemes = compute_viseme_envelopes(master_audio, total_frames, synthesized_turns)

    # 7. Verify strict manifest invariants before writing
    assert scenes_manifest[0]["startFrame"] == 0, "Scene 1 must start at frame 0"
    for idx in range(len(scenes_manifest) - 1):
        expected_next = scenes_manifest[idx]["startFrame"] + scenes_manifest[idx]["durationInFrames"]
        assert scenes_manifest[idx + 1]["startFrame"] == expected_next, (
            f"Scene continuity mismatch between index {idx} and {idx + 1}"
        )
    assert sum(s["durationInFrames"] for s in scenes_manifest) == total_frames, (
        "Sum of scene durationInFrames must equal totalFrames"
    )
    for cid in CHARACTER_ORDER:
        assert len(visemes[cid]) == total_frames, f"Viseme length mismatch for {cid}"

    manifest: dict[str, Any] = {
        "fps": FPS,
        "width": WIDTH,
        "height": HEIGHT,
        "totalDurationMs": total_duration_ms,
        "totalFrames": total_frames,
        "masterAudioSrc": "audio/master_mix.wav",
        "voiceoverSrc": "audio/voiceover_master.wav",
        "bgmSrc": "audio/bgm_bed.wav",
        "scenes": scenes_manifest,
        "turns": turns_manifest,
        "words": all_words,
        "visemes": visemes,
    }

    MANIFEST_JSON_PATH.write_text(
        serialize_manifest_json(manifest),
        encoding="utf-8",
    )
    print(f"[Manifest] Wrote {MANIFEST_JSON_PATH}", flush=True)

    # 8. Write SRT & WebVTT captions
    cues = build_caption_cues(synthesized_turns, words_by_turn)
    write_srt_and_vtt(cues)
    print(
        f"[Captions] Wrote {SRT_PATH} and {VTT_PATH} ({len(cues)} cues).",
        flush=True,
    )


if __name__ == "__main__":
    main()
