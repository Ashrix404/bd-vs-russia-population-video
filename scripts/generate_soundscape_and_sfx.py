#!/usr/bin/env python3
"""
Procedural Cinema Soundscape, Foley & Broadcast Mix Engineer.

Runs in GitHub Actions AFTER `scripts/generate_audio_and_transcript.py` to:
1. Read `src/generated/timeline-manifest.json` and `public/audio/voiceover_master.wav`.
2. Synthesize a warm, non-fatiguing 48 kHz stereo Cinematic Documentary Underscore
   (`public/audio/bgm_bed.wav`) in D minor / D Dorian:
   - Detuned analog harmonic synth pad (`D2=73.42Hz`, `A2=110Hz`, `F3=174.61Hz`,
     `A3=220Hz`, `C4=261.63Hz`, `E4=329.63Hz`, plus subtle D-Dorian movement)
     with slow LFO stereo drift and a warm 900 Hz low-pass filter so it never
     clashes with human speech intelligibility (`1 kHz - 4 kHz`).
   - Subtle pulsing cartographic felt-marimba / kalimba ostinato at `100 BPM`
     with gentle exponential decay and warm dotted-eighth stereo echo.
   - Smooth `1.5s` cosine fade-in and `2.5s` resonant final chord resolve + fade-out
     at the conclusion of Scene 8.
3. Synthesize Frame-Accurate Cinema Foley & UI Sound Effects synced to `timeline-manifest.json`:
   - Frame 0 (Cold Open): deep cinematic sub-drop (`55 Hz -> 36 Hz` sine glide) +
     warm atmospheric stereo air swell.
   - Every `scene.startMs` (`sceneIndex >= 2`): airy stereo cinema whoosh +
     subtle felt low tom thud calibrated to `-16 dBFS`.
   - Every `turn.startMs` where `highlightStat` is present (or the first turn of each scene):
     delicate glass / cartographic telemetry ping calibrated to `-22 dBFS`.
4. Perform Broadcast Sidechain Ducking & Master Pre-Mix (`public/audio/master_mix.wav`,
   48 kHz 16-bit PCM stereo):
   - Smooth ballistic envelope follower (`attack=30ms`, `release=350ms`) keyed from
     `voiceover_master.wav`.
   - Ducks the BGM bed cleanly from `-15 dBFS` (pauses / transitions) down to `-24 dBFS`
     whenever a character is speaking.
   - Conditions voiceover (centered stereo + subtle studio warmth), sums VO + Ducked BGM +
     Stereo Foley SFX, applies a stereo-linked soft-knee brickwall limiter at `-1.0 dBFS`,
     and writes `public/audio/master_mix.wav` with TPDF dither.
"""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path
from typing import Any

import numpy as np
from scipy import signal
from scipy.io import wavfile

TARGET_SR: int = 48_000
DITHER_SEED: int = 20261118
FOLEY_SEED: int = 420319

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST_PATH: Path = PROJECT_ROOT / "src" / "generated" / "timeline-manifest.json"


# ---------------------------------------------------------------------------
# Utility & DSP Filter Primitives
# ---------------------------------------------------------------------------


def db_to_amp(db: float) -> float:
    """Convert decibels full-scale (dBFS) to linear amplitude ratio."""
    return float(10.0 ** (db / 20.0))


def amp_to_db(amp: float) -> float:
    """Convert linear amplitude to decibels full-scale (dBFS)."""
    return float(20.0 * math.log10(max(float(amp), 1e-12)))


def resolve_public_audio_path(project_root: Path, rel_or_abs: str | None, default_rel: str) -> Path:
    """Resolve manifest relative audio paths (e.g. 'audio/master_mix.wav') into `public/`."""
    chosen = (rel_or_abs or default_rel).strip()
    candidate = Path(chosen)
    if candidate.is_absolute():
        return candidate
    parts = candidate.parts
    if parts and parts[0] == "public":
        return project_root / candidate
    return project_root / "public" / candidate


def peaking_eq_sos(freq_hz: float, q: float, gain_db: float, sr: int = TARGET_SR) -> np.ndarray:
    """
    Design a second-order peaking EQ section (RBJ Audio EQ Cookbook) for `scipy.signal.sosfilt`.
    """
    a_lin = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * freq_hz / float(sr)
    cos_w0 = math.cos(w0)
    alpha = math.sin(w0) / (2.0 * max(q, 1e-4))

    b0 = 1.0 + alpha * a_lin
    b1 = -2.0 * cos_w0
    b2 = 1.0 - alpha * a_lin
    a0 = 1.0 + alpha / a_lin
    a1 = -2.0 * cos_w0
    a2 = 1.0 - alpha / a_lin

    return np.array([[b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0]], dtype=np.float64)


def bandpass_sos(freq_hz: float, q: float, sr: int = TARGET_SR) -> np.ndarray:
    """
    Design a constant 0 dB peak gain second-order bandpass filter (RBJ Audio EQ Cookbook).
    """
    clamped_hz = min(max(freq_hz, 20.0), 0.46 * float(sr))
    w0 = 2.0 * math.pi * clamped_hz / float(sr)
    cos_w0 = math.cos(w0)
    alpha = math.sin(w0) / (2.0 * max(q, 1e-4))

    b0 = alpha
    b1 = 0.0
    b2 = -alpha
    a0 = 1.0 + alpha
    a1 = -2.0 * cos_w0
    a2 = 1.0 - alpha

    return np.array([[b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0]], dtype=np.float64)


def mix_clip_in_place(bus: np.ndarray, clip: np.ndarray, start_sample: int) -> None:
    """Safely overlap-add a stereo clip `(M, 2)` onto a stereo bus `(N, 2)` at `start_sample`."""
    n_bus = bus.shape[0]
    n_clip = clip.shape[0]
    if n_bus == 0 or n_clip == 0:
        return

    src_start = max(0, -start_sample)
    dst_start = max(0, start_sample)
    if src_start >= n_clip or dst_start >= n_bus:
        return

    copy_len = min(n_clip - src_start, n_bus - dst_start)
    if copy_len > 0:
        bus[dst_start : dst_start + copy_len] += clip[src_start : src_start + copy_len]


def normalize_peak(clip: np.ndarray, target_dbfs: float) -> np.ndarray:
    """Scale `clip` so its absolute peak matches `target_dbfs` exactly."""
    peak = float(np.max(np.abs(clip)))
    if peak <= 1e-12:
        return clip
    return clip * (db_to_amp(target_dbfs) / peak)


# ---------------------------------------------------------------------------
# WAV I/O (Resilient Reader + TPDF-Dithered 48 kHz 16-bit Stereo Writer)
# ---------------------------------------------------------------------------


def _decode_pcm_wave_fallback(wav_path: Path) -> tuple[int, np.ndarray]:
    """Fallback pure-stdlib `wave` reader supporting 8/16/24/32-bit PCM WAV files."""
    with wave.open(str(wav_path), "rb") as wf:
        sr = wf.getframerate()
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth == 1:
        samples = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128.0) / 128.0
    elif sampwidth == 2:
        samples = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif sampwidth == 3:
        raw_u8 = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        signed = (
            raw_u8[:, 0].astype(np.int32)
            | (raw_u8[:, 1].astype(np.int32) << 8)
            | (raw_u8[:, 2].astype(np.int32) << 16)
        )
        signed = np.where(signed & 0x800000, signed - 0x1000000, signed)
        samples = signed.astype(np.float64) / 8388608.0
    elif sampwidth == 4:
        samples = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f"Unsupported PCM sample width: {sampwidth} bytes in {wav_path}")

    if n_channels > 1:
        samples = samples.reshape(-1, n_channels)
    return sr, samples


def load_wav_48k_stereo(wav_path: Path, target_sr: int = TARGET_SR) -> np.ndarray:
    """
    Read any mono/stereo PCM or IEEE-float WAV file, convert to float64 in [-1, 1],
    polyphase-resample cleanly to `48000 Hz`, and return shape `(N, 2)`.
    """
    try:
        sr, raw = wavfile.read(str(wav_path))
        if np.issubdtype(raw.dtype, np.floating):
            audio = np.nan_to_num(raw.astype(np.float64), nan=0.0, posinf=0.0, neginf=0.0)
        elif raw.dtype == np.uint8:
            audio = (raw.astype(np.float64) - 128.0) / 128.0
        elif raw.dtype == np.int16:
            audio = raw.astype(np.float64) / 32768.0
        elif raw.dtype == np.int32:
            audio = raw.astype(np.float64) / 2147483648.0
        else:
            audio = raw.astype(np.float64)
    except Exception:
        sr, audio = _decode_pcm_wave_fallback(wav_path)

    if audio.ndim == 2 and audio.shape[1] == 1:
        audio = audio[:, 0]
    elif audio.ndim == 2 and audio.shape[1] > 2:
        audio = audio[:, :2]

    if sr != target_sr and audio.shape[0] > 0:
        g = math.gcd(int(target_sr), int(sr))
        up = int(target_sr) // g
        down = int(sr) // g
        audio = signal.resample_poly(audio, up, down, axis=0).astype(np.float64)

    if audio.ndim == 1:
        audio = np.column_stack((audio, audio))

    return np.ascontiguousarray(audio, dtype=np.float64)


def write_wav_48k_16bit_stereo(
    out_path: Path,
    stereo_audio: np.ndarray,
    sr: int = TARGET_SR,
    seed: int = DITHER_SEED,
) -> None:
    """
    Write stereo float64 audio `(N, 2)` as canonical 48 kHz 16-bit PCM RIFF WAVE
    with deterministic TPDF dither.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    # Triangular probability density function (TPDF) dither at +/- 1 LSB
    tpdf_dither = (rng.random(stereo_audio.shape) - rng.random(stereo_audio.shape)) / 32768.0
    dithered = np.clip(stereo_audio + tpdf_dither, -1.0, 1.0)
    pcm16 = np.clip(np.rint(dithered * 32767.0), -32768, 32767).astype("<i2")

    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())


# ---------------------------------------------------------------------------
# 1. Cinematic Documentary Underscore (`public/audio/bgm_bed.wav`)
# ---------------------------------------------------------------------------


def _synthesize_felt_marimba_note(
    freq_hz: float,
    velocity: float,
    sr: int = TARGET_SR,
) -> np.ndarray:
    """
    Synthesize a warm acoustic felt-marimba / kalimba note (`mono`, `0.62s`)
    with tactile velvet mallet attack, tuned resonator harmonics, and exponential decay.
    """
    n_samples = int(0.62 * sr)
    t = np.arange(n_samples, dtype=np.float64) / float(sr)

    # Smooth 4.5 ms raised-cosine felt-mallet attack (zero transient click)
    attack_sec = 0.0045
    attack_env = 0.5 * (1.0 - np.cos(np.pi * np.minimum(t / attack_sec, 1.0)))

    # Tail window so note decays cleanly to exact zero
    tail_sec = 0.06
    tail_env = np.where(
        t > (0.62 - tail_sec),
        0.5 * (1.0 + np.cos(np.pi * (t - (0.62 - tail_sec)) / tail_sec)),
        1.0,
    )

    # Fundamental warm wooden bar mode + subtle 2nd & marimba 4th resonator modes
    body = np.sin(2.0 * np.pi * freq_hz * t) * np.exp(-t / 0.23)
    warm_oct = (0.17 * velocity) * np.sin(2.0 * np.pi * (2.0 * freq_hz) * t + 0.3) * np.exp(-t / 0.105)

    resonator = np.zeros_like(t)
    if 3.98 * freq_hz < 1200.0:
        resonator = (
            (0.055 * velocity)
            * np.sin(2.0 * np.pi * (3.98 * freq_hz) * t + 0.7)
            * np.exp(-t / 0.036)
        )

    # Soft low-frequency felt-mallet thump
    thump_hz = min(freq_hz * 0.5, 145.0)
    mallet_thump = (0.11 * velocity) * np.sin(2.0 * np.pi * thump_hz * t) * np.exp(-t / 0.014)

    note = float(velocity) * attack_env * tail_env * (body + warm_oct + resonator + mallet_thump)
    return note


def synthesize_bgm_bed(
    total_samples: int,
    scenes: list[dict[str, Any]],
    sr: int = TARGET_SR,
) -> np.ndarray:
    """
    Generate the 48 kHz stereo Cinematic Documentary Underscore in D minor / D Dorian:
    - Evolving detuned warm analog synth pad (`D2=73.42Hz`, `A2=110Hz`, `F3=174.61Hz`,
      `A3=220Hz`, `C4=261.63Hz`, `E4=329.63Hz`, plus subtle `D1` anchor and `B3` Dorian breath)
      low-passed around `900 Hz` so `1 kHz - 4 kHz` speech frequencies remain completely clear.
    - Subtle `100 BPM` cartographic felt-marimba / kalimba ostinato with dotted-eighth echo.
    - Smooth `1.5s` fade-in and `2.5s` resonant final chord resolve + fade-out at Scene 8 end.
    """
    t = np.arange(total_samples, dtype=np.float64) / float(sr)
    total_sec = float(total_samples) / float(sr)

    pad_l = np.zeros(total_samples, dtype=np.float64)
    pad_r = np.zeros(total_samples, dtype=np.float64)

    # Core D minor 9th / D Dorian pad voicing:
    # (freq_hz, weight, breath_rate_hz, breath_depth, pan_center, pan_lfo_width, pan_lfo_hz, seed_idx)
    pad_voices: list[tuple[float, float, float, float, float, float, float, int]] = [
        (36.71, 0.22, 0.041, 0.14, 0.00, 0.00, 0.05, 1),   # D1 deep sub-foundation (mono)
        (73.42, 0.88, 0.053, 0.15, 0.00, 0.00, 0.06, 2),   # D2 warm bass root (mono)
        (110.00, 0.68, 0.061, 0.18, 0.00, 0.08, 0.07, 3),  # A2 fifth anchor
        (174.61, 0.56, 0.074, 0.24, -0.18, 0.34, 0.085, 4),  # F3 warm minor third
        (220.00, 0.50, 0.067, 0.25, 0.16, 0.36, 0.095, 5),   # A3 tenor fifth
        (246.94, 0.22, 0.043, 0.55, -0.24, 0.42, 0.063, 6),  # B3 subtle D-Dorian 6th color
        (261.63, 0.44, 0.079, 0.28, 0.22, 0.45, 0.112, 7),   # C4 minor seventh warmth
        (329.63, 0.38, 0.057, 0.32, -0.20, 0.48, 0.089, 8),  # E4 lush ninth shimmer
    ]

    # 3-oscillator analog unison detune in cents + harmonic rolloff weights
    unison_specs = [
        (0.0, 0.13, 1.1, 0.0),     # Center oscillator
        (-6.8, 0.17, 1.5, -0.35),  # Left-leaning warm chorus oscillator
        (+7.1, 0.19, 1.4, +0.35),  # Right-leaning warm chorus oscillator
    ]
    harmonic_weights = [(1, 1.00), (2, 0.46), (3, 0.22), (4, 0.10)]

    for freq_hz, weight, breath_hz, breath_depth, pan_c, pan_w, pan_hz, s_idx in pad_voices:
        voice_l = np.zeros(total_samples, dtype=np.float64)
        voice_r = np.zeros(total_samples, dtype=np.float64)

        for osc_i, (cents, wow_hz, wow_cents, stereo_bias) in enumerate(unison_specs):
            phase_seed = 0.73 * s_idx + 1.91 * osc_i
            # Slow analog tape/oscillator pitch drift (wow)
            drift_cents = cents + wow_cents * np.sin(2.0 * np.pi * wow_hz * t + phase_seed)
            inst_freq = freq_hz * np.power(2.0, drift_cents / 1200.0)
            phase = np.cumsum((2.0 * np.pi / float(sr)) * inst_freq) + phase_seed

            osc_sig = np.zeros(total_samples, dtype=np.float64)
            for h_num, h_amp in harmonic_weights:
                if freq_hz * h_num < 1750.0:
                    osc_sig += h_amp * np.sin(h_num * phase + 0.37 * h_num)

            # Distribute unison oscillators across stereo field (keep <100 Hz strictly mono)
            if freq_hz < 95.0:
                osc_pan = 0.0
            else:
                osc_pan = np.clip(pan_c + 0.28 * stereo_bias, -0.85, 0.85)
            angle = 0.25 * math.pi * (osc_pan + 1.0)
            voice_l += math.cos(angle) * osc_sig
            voice_r += math.sin(angle) * osc_sig

        # Slow breathing harmonic swell + slow LFO stereo movement
        breath_env = (1.0 - 0.5 * breath_depth) + 0.5 * breath_depth * np.sin(
            2.0 * np.pi * breath_hz * t + 1.17 * s_idx
        )
        if pan_w > 0.01 and freq_hz >= 95.0:
            lfo_pan = np.clip(
                pan_w * np.sin(2.0 * np.pi * pan_hz * t + 0.83 * s_idx),
                -0.75,
                0.75,
            )
            l_mod = np.cos(0.25 * np.pi * (lfo_pan + 1.0)) * math.sqrt(2.0)
            r_mod = np.sin(0.25 * np.pi * (lfo_pan + 1.0)) * math.sqrt(2.0)
        else:
            l_mod = 1.0
            r_mod = 1.0

        pad_l += (weight / 3.0) * breath_env * l_mod * voice_l
        pad_r += (weight / 3.0) * breath_env * r_mod * voice_r

    # Subtle documentary arc lift across scenes (gentle awe swell in second half)
    arc_env = 0.92 + 0.10 * np.sin(np.pi * np.clip(t / max(total_sec, 1.0), 0.0, 1.0))
    pad_stereo = np.column_stack((pad_l * arc_env, pad_r * arc_env))

    # Warm 4th-order analog-voiced low-pass filter at 890 Hz + 30 Hz subsonic cleanup
    sos_pad_hp = signal.butter(2, 30.0, btype="high", fs=sr, output="sos")
    sos_pad_lp = signal.butter(4, 890.0, btype="low", fs=sr, output="sos")
    pad_stereo = signal.sosfilt(sos_pad_hp, pad_stereo, axis=0)
    pad_stereo = signal.sosfilt(sos_pad_lp, pad_stereo, axis=0)

    # Gentle warm analog saturation + post-filter at 910 Hz so upper harmonics never touch 1-4 kHz
    pad_peak = float(np.max(np.abs(pad_stereo)))
    if pad_peak > 1e-9:
        pad_stereo = np.tanh(1.30 * (pad_stereo / pad_peak)) / math.tanh(1.30)
    sos_post_lp = signal.butter(2, 910.0, btype="low", fs=sr, output="sos")
    pad_stereo = signal.sosfilt(sos_post_lp, pad_stereo, axis=0)

    # -----------------------------------------------------------------------
    # Pulsing Cartographic Marimba / Felt-Kalimba Ostinato (100 BPM)
    # -----------------------------------------------------------------------
    bpm = 100.0
    eighth_sec = (60.0 / bpm) * 0.5  # 0.300 s per eighth-note step
    pulse_bus = np.zeros((total_samples, 2), dtype=np.float64)

    # 16-step (2-bar = 4.8s) D Dorian cartographic pattern
    pattern_freqs: list[float] = [
        146.83, 220.00, 261.63, 293.66, 329.63, 220.00, 174.61, 220.00,  # Bar 1 (Dm9)
        146.83, 220.00, 246.94, 293.66, 261.63, 220.00, 196.00, 164.81,  # Bar 2 (D Dorian)
    ]
    pattern_vels: list[float] = [
        0.82, 0.40, 0.48, 0.74, 0.43, 0.50, 0.68, 0.38,
        0.78, 0.41, 0.54, 0.72, 0.44, 0.49, 0.64, 0.37,
    ]

    # Pre-cache synthesized kernels by (freq, vel)
    note_cache: dict[tuple[float, float], np.ndarray] = {}
    for f_hz, vel in zip(pattern_freqs, pattern_vels):
        key = (f_hz, vel)
        if key not in note_cache:
            note_cache[key] = _synthesize_felt_marimba_note(f_hz, vel, sr=sr)

    # Taper ostinato gracefully before the final 2.5s chord resolve
    pulse_stop_sec = max(0.6, total_sec - 2.65)
    step_idx = 0
    while True:
        note_time = 0.60 + step_idx * eighth_sec
        if note_time >= pulse_stop_sec:
            break

        p_idx = step_idx % len(pattern_freqs)
        mono_note = note_cache[(pattern_freqs[p_idx], pattern_vels[p_idx])]

        # Smooth taper over the final 1.2s before resolve chord
        taper = 1.0
        if note_time > pulse_stop_sec - 1.2:
            taper = max(0.0, (pulse_stop_sec - note_time) / 1.2)

        pan = 0.22 * (1.0 if (step_idx % 2 == 0) else -1.0)
        ang = 0.25 * math.pi * (pan + 1.0)
        stereo_note = np.column_stack(
            (mono_note * (taper * math.cos(ang)), mono_note * (taper * math.sin(ang)))
        )
        mix_clip_in_place(pulse_bus, stereo_note, int(round(note_time * sr)))
        step_idx += 1

    # Dotted-eighth (0.45s) stereo ping-pong delay + warm 860 Hz low-pass
    delay_samples = int(round(1.5 * eighth_sec * sr))
    if 0 < delay_samples < total_samples:
        delayed_1 = np.zeros_like(pulse_bus)
        delayed_1[delay_samples:, 0] = pulse_bus[:-delay_samples, 1] * 0.26
        delayed_1[delay_samples:, 1] = pulse_bus[:-delay_samples, 0] * 0.26
        pulse_bus = pulse_bus + delayed_1
        if 2 * delay_samples < total_samples:
            delayed_2 = np.zeros_like(pulse_bus)
            delayed_2[2 * delay_samples :, 0] = pulse_bus[: -2 * delay_samples, 0] * 0.08
            delayed_2[2 * delay_samples :, 1] = pulse_bus[: -2 * delay_samples, 1] * 0.08
            pulse_bus = pulse_bus + delayed_2

    sos_pulse_lp = signal.butter(2, 860.0, btype="low", fs=sr, output="sos")
    pulse_bus = signal.sosfilt(sos_pulse_lp, pulse_bus, axis=0)
    pulse_peak = float(np.max(np.abs(pulse_bus)))
    if pulse_peak > 1e-9:
        pulse_bus = pulse_bus / pulse_peak

    # -----------------------------------------------------------------------
    # Final 2.5s Resonant Chord Resolve + Fade-Out at End of Scene 8
    # -----------------------------------------------------------------------
    resolve_bus = np.zeros((total_samples, 2), dtype=np.float64)
    resolve_len_sec = min(3.3, max(2.5, total_sec * 0.45))
    n_res = min(total_samples, int(round(resolve_len_sec * sr)))
    if n_res > 0:
        t_res = np.arange(n_res, dtype=np.float64) / float(sr)
        bloom_sec = max(0.45, resolve_len_sec - 2.5)
        res_attack = 0.5 * (1.0 - np.cos(np.pi * np.minimum(t_res / bloom_sec, 1.0)))
        res_decay = np.exp(-np.maximum(t_res - bloom_sec, 0.0) / 1.85)
        res_env = res_attack * res_decay

        # Warm resonant D-minor / Dsus9 resolve chord
        resolve_notes = [
            (73.42, 0.90, 0.00),   # D2
            (110.00, 0.72, 0.05),  # A2
            (146.83, 0.65, -0.15), # D3
            (174.61, 0.48, 0.22),  # F3
            (220.00, 0.54, -0.26), # A3
            (293.66, 0.42, 0.28),  # D4
            (329.63, 0.34, -0.30), # E4
        ]
        res_l = np.zeros(n_res, dtype=np.float64)
        res_r = np.zeros(n_res, dtype=np.float64)
        for f_hz, amp, r_pan in resolve_notes:
            sig = (
                np.sin(2.0 * np.pi * f_hz * t_res)
                + 0.32 * np.sin(2.0 * np.pi * (f_hz * 1.0035) * t_res + 0.6)
                + 0.25 * np.sin(2.0 * np.pi * (2.0 * f_hz) * t_res + 1.1)
            )
            ang = 0.25 * math.pi * (r_pan + 1.0)
            res_l += amp * math.cos(ang) * sig
            res_r += amp * math.sin(ang) * sig

        res_stereo = np.column_stack((res_l * res_env, res_r * res_env))
        sos_res_lp = signal.butter(3, 880.0, btype="low", fs=sr, output="sos")
        res_stereo = signal.sosfilt(sos_res_lp, res_stereo, axis=0)
        res_peak = float(np.max(np.abs(res_stereo)))
        if res_peak > 1e-9:
            res_stereo = res_stereo / res_peak
        resolve_bus[total_samples - n_res :] = res_stereo

    # Combine warm analog pad + subtle marimba pulse + final chord resolve
    bgm = 0.76 * pad_stereo + 0.26 * pulse_bus + 0.38 * resolve_bus

    # Extra vocal-intelligibility pocket (-3.5 dB broad cut centered at 2.2 kHz)
    sos_speech_pocket = peaking_eq_sos(freq_hz=2200.0, q=0.65, gain_db=-3.5, sr=sr)
    bgm = signal.sosfilt(sos_speech_pocket, bgm, axis=0)

    # Gentle analog glue saturation for smooth crest factor before fades
    raw_peak = float(np.max(np.abs(bgm)))
    if raw_peak > 1e-9:
        bgm = np.tanh(1.25 * (bgm / raw_peak)) / math.tanh(1.25)

    # Smooth 1.5s fade-in at start and 2.5s resonant fade-out at end of Scene 8
    fade_in_samples = min(int(round(1.5 * sr)), total_samples // 3)
    fade_out_samples = min(int(round(2.5 * sr)), total_samples // 2)

    if fade_in_samples > 1:
        u_in = np.linspace(0.0, 1.0, fade_in_samples, dtype=np.float64)
        fade_in_curve = 0.5 * (1.0 - np.cos(np.pi * u_in))
        bgm[:fade_in_samples] *= fade_in_curve[:, None]

    if fade_out_samples > 1:
        u_out = np.linspace(0.0, 1.0, fade_out_samples, dtype=np.float64)
        fade_out_curve = np.power(np.clip(np.cos(0.5 * np.pi * u_out), 0.0, 1.0), 1.65)
        bgm[-fade_out_samples:] *= fade_out_curve[:, None]

    # Calibrate un-ducked BGM bed cleanly to -15.0 dBFS peak reference
    body_slice = bgm[fade_in_samples : max(fade_in_samples + 1, total_samples - fade_out_samples)]
    ref_peak = float(np.max(np.abs(body_slice))) if body_slice.size > 0 else 0.0
    full_peak = float(np.max(np.abs(bgm)))
    norm_ref = max(ref_peak, full_peak, 1e-9)
    bgm = bgm * (db_to_amp(-15.0) / norm_ref)

    return bgm


# ---------------------------------------------------------------------------
# 2. Frame-Accurate Cinema Foley & UI Sound Effects (`SFX Bus`)
# ---------------------------------------------------------------------------


def _make_cold_open_sfx(rng: np.random.Generator, sr: int = TARGET_SR) -> np.ndarray:
    """
    Cold Open (`frame 0`):
    Deep cinematic sub-drop (`55 Hz -> 36 Hz` sine glide) + warm atmospheric filtered air swell.
    """
    dur_sec = 2.35
    n = int(round(dur_sec * sr))
    t = np.arange(n, dtype=np.float64) / float(sr)

    # 55 Hz -> 36 Hz exponential sine sub-drop
    f_sub = 36.0 + (55.0 - 36.0) * np.exp(-t / 0.62)
    phase_sub = np.cumsum((2.0 * np.pi / float(sr)) * f_sub)
    sub_wave = (
        np.sin(phase_sub)
        + 0.22 * np.sin(2.0 * phase_sub + 0.25) * np.exp(-t / 0.45)
        + 0.07 * np.sin(3.0 * phase_sub) * np.exp(-t / 0.25)
    )
    sub_wave = np.tanh(1.35 * sub_wave)

    attack = 0.5 * (1.0 - np.cos(np.pi * np.minimum(t / 0.018, 1.0)))
    tail = np.where(
        t > (dur_sec - 0.35),
        0.5 * (1.0 + np.cos(np.pi * (t - (dur_sec - 0.35)) / 0.35)),
        1.0,
    )
    sub_mono = sub_wave * attack * np.exp(-t / 0.86) * tail

    # Warm stereo atmospheric filtered air whoosh + harmonic fifth breath
    noise_l = rng.standard_normal(n)
    noise_r = rng.standard_normal(n)
    noise_st = np.column_stack((noise_l, noise_r))

    band_low = signal.sosfilt(bandpass_sos(190.0, q=1.1, sr=sr), noise_st, axis=0)
    band_mid = signal.sosfilt(bandpass_sos(480.0, q=1.4, sr=sr), noise_st, axis=0)
    band_air = signal.sosfilt(bandpass_sos(980.0, q=1.8, sr=sr), noise_st, axis=0)

    env_swell = np.power(np.clip(np.sin(np.pi * np.minimum(t / dur_sec, 1.0)), 0.0, 1.0), 1.4)
    env_crest = np.exp(-0.5 * ((t - 0.52) / 0.28) ** 2)
    whoosh_st = (
        0.45 * band_low * env_swell[:, None]
        + 0.40 * band_mid * env_crest[:, None]
        + 0.15 * band_air * (env_crest**1.5)[:, None]
    )

    # Subtle warm D3 + A3 atmospheric tonal swell
    breath_tone = (
        0.6 * np.sin(2.0 * np.pi * 146.83 * t)
        + 0.4 * np.sin(2.0 * np.pi * 220.00 * t + 0.8)
    ) * env_swell * np.exp(-t / 1.35)
    breath_st = np.column_stack((breath_tone * 0.85, breath_tone * 0.95))

    whoosh_peak = float(np.max(np.abs(whoosh_st)))
    if whoosh_peak > 1e-9:
        whoosh_st = whoosh_st / whoosh_peak

    combined = (
        0.74 * np.column_stack((sub_mono, sub_mono))
        + 0.30 * whoosh_st
        + 0.18 * breath_st
    )
    return normalize_peak(combined, target_dbfs=-12.5)


def _make_scene_transition_sfx(
    rng: np.random.Generator,
    pan_direction: float = 1.0,
    sr: int = TARGET_SR,
) -> tuple[np.ndarray, int]:
    """
    Scene Transition (`scene.startMs`, `sceneIndex >= 2`):
    Airy stereo cinema whoosh sweeping across the cut + subtle low tom thud (`-16 dBFS`).
    Returns `(stereo_clip, cut_offset_samples)` where `cut_offset_samples` aligns with `scene.startMs`.
    """
    lead_in_sec = 0.18
    tail_sec = 0.47
    dur_sec = lead_in_sec + tail_sec
    n = int(round(dur_sec * sr))
    cut_idx = int(round(lead_in_sec * sr))
    t = np.arange(n, dtype=np.float64) / float(sr)

    # Airy stereo cinema whoosh cresting right across t = lead_in_sec
    noise_st = np.column_stack((rng.standard_normal(n), rng.standard_normal(n)))
    b1 = signal.sosfilt(bandpass_sos(280.0, q=1.2, sr=sr), noise_st, axis=0)
    b2 = signal.sosfilt(bandpass_sos(680.0, q=1.5, sr=sr), noise_st, axis=0)
    b3 = signal.sosfilt(bandpass_sos(1650.0, q=2.0, sr=sr), noise_st, axis=0)

    # Asymmetric envelope: smooth 180 ms swell up to cut_idx, natural 470 ms exponential release
    env_up = 0.5 * (1.0 - np.cos(np.pi * np.minimum(t / lead_in_sec, 1.0)))
    env_down = np.exp(-np.maximum(t - lead_in_sec, 0.0) / 0.135)
    end_taper = np.where(
        t > (dur_sec - 0.08),
        0.5 * (1.0 + np.cos(np.pi * (t - (dur_sec - 0.08)) / 0.08)),
        1.0,
    )
    whoosh_env = env_up * env_down * end_taper
    crest_env = np.exp(-0.5 * ((t - lead_in_sec) / 0.065) ** 2)

    whoosh_raw = (
        0.48 * b1 * whoosh_env[:, None]
        + 0.42 * b2 * crest_env[:, None]
        + 0.14 * b3 * (crest_env**1.6)[:, None]
    )
    w_peak = float(np.max(np.abs(whoosh_raw)))
    if w_peak > 1e-9:
        whoosh_raw = whoosh_raw / w_peak

    # Smooth spatial sweep across stereo image
    sweep_pan = pan_direction * np.linspace(-0.48, 0.48, n, dtype=np.float64)
    ang = 0.25 * np.pi * (sweep_pan + 1.0)
    whoosh_st = np.column_stack(
        (whoosh_raw[:, 0] * np.cos(ang) * math.sqrt(2.0), whoosh_raw[:, 1] * np.sin(ang) * math.sqrt(2.0))
    )

    # Subtle felt low tom thud triggered dead-on `scene.startMs` (`cut_idx`)
    n_tom = n - cut_idx
    t_tom = np.arange(n_tom, dtype=np.float64) / float(sr)
    f_tom = 58.0 + 54.0 * np.exp(-t_tom / 0.032)
    phase_tom = np.cumsum((2.0 * np.pi / float(sr)) * f_tom)
    tom_attack = 0.5 * (1.0 - np.cos(np.pi * np.minimum(t_tom / 0.005, 1.0)))
    tom_tail = np.where(
        t_tom > (tail_sec - 0.06),
        0.5 * (1.0 + np.cos(np.pi * (t_tom - (tail_sec - 0.06)) / 0.06)),
        1.0,
    )
    tom_body = (
        np.sin(phase_tom) * np.exp(-t_tom / 0.105)
        + 0.16 * np.sin(1.56 * phase_tom + 0.4) * np.exp(-t_tom / 0.038)
    )
    tom_mono = np.tanh(1.2 * tom_body) * tom_attack * tom_tail

    tom_st = np.zeros((n, 2), dtype=np.float64)
    tom_st[cut_idx:, 0] = tom_mono
    tom_st[cut_idx:, 1] = tom_mono

    composite = 0.52 * whoosh_st + 0.66 * tom_st
    return normalize_peak(composite, target_dbfs=-16.0), cut_idx


def _make_telemetry_ping_sfx(variant: int = 0, sr: int = TARGET_SR) -> np.ndarray:
    """
    Delicate glass / cartographic telemetry ping (`-22 dBFS`) synced to `turn.startMs`
    for highlighted statistics and initial scene turns.
    """
    dur_sec = 0.42
    n = int(round(dur_sec * sr))
    t = np.arange(n, dtype=np.float64) / float(sr)

    # Consonant D-Dorian crystal frequencies (A5, B5, D6)
    crystal_pitches = [880.00, 987.77, 1174.66]
    f0 = crystal_pitches[variant % len(crystal_pitches)]

    attack = 0.5 * (1.0 - np.cos(np.pi * np.minimum(t / 0.0028, 1.0)))
    tail = np.where(
        t > (dur_sec - 0.06),
        0.5 * (1.0 + np.cos(np.pi * (t - (dur_sec - 0.06)) / 0.06)),
        1.0,
    )

    fundamental = np.sin(2.0 * np.pi * f0 * t) * np.exp(-t / 0.135)
    fifth = 0.26 * np.sin(2.0 * np.pi * (1.5 * f0) * t + 0.3) * np.exp(-t / 0.072)
    glass_mode = 0.10 * np.sin(2.0 * np.pi * (2.756 * f0) * t + 0.9) * np.exp(-t / 0.028)
    micro_tick = 0.12 * np.sin(2.0 * np.pi * 2400.0 * t) * np.exp(-t / 0.0035)

    ping_mono = attack * tail * (fundamental + fifth + glass_mode + micro_tick)

    # Subtle 2.1 ms Haas stereo shimmer so ping floats outside centered vocal
    haas_offset = int(round(0.0021 * sr))
    ping_l = ping_mono.copy()
    ping_r = np.zeros_like(ping_mono)
    if haas_offset < n:
        ping_r[haas_offset:] = 0.86 * ping_mono[:-haas_offset]

    if variant % 2 == 1:
        stereo = np.column_stack((ping_r, ping_l))
    else:
        stereo = np.column_stack((ping_l, ping_r))

    return normalize_peak(stereo, target_dbfs=-22.0)


def synthesize_sfx_bus(
    total_samples: int,
    manifest: dict[str, Any],
    sr: int = TARGET_SR,
) -> tuple[np.ndarray, int, int]:
    """
    Synthesize all frame-accurate cinema foley & telemetry SFX onto a 48 kHz stereo bus.
    Returns `(sfx_bus, num_scene_transitions, num_telemetry_pings)`.
    """
    rng = np.random.default_rng(FOLEY_SEED)
    sfx_bus = np.zeros((total_samples, 2), dtype=np.float64)

    # 1. Cold Open at frame 0 (sample 0)
    cold_open = _make_cold_open_sfx(rng=rng, sr=sr)
    mix_clip_in_place(sfx_bus, cold_open, start_sample=0)

    # 2. Scene Transitions at every `scene.startMs` where `sceneIndex >= 2`
    scenes = sorted(manifest.get("scenes", []), key=lambda s: float(s.get("startMs", 0.0)))
    n_transitions = 0
    for scene in scenes:
        scene_idx = int(scene.get("sceneIndex", 0))
        if scene_idx >= 2:
            start_ms = float(scene.get("startMs", 0.0))
            cut_sample = int(round((start_ms / 1000.0) * sr))
            pan_dir = 1.0 if (scene_idx % 2 == 0) else -1.0
            trans_clip, cut_offset = _make_scene_transition_sfx(
                rng=rng,
                pan_direction=pan_dir,
                sr=sr,
            )
            mix_clip_in_place(sfx_bus, trans_clip, start_sample=cut_sample - cut_offset)
            n_transitions += 1

    # 3. Telemetry Pings at every `turn.startMs` where `highlightStat` is present
    #    OR on the first turn of each scene.
    turns = sorted(manifest.get("turns", []), key=lambda tr: float(tr.get("startMs", 0.0)))
    seen_scenes: set[int] = set()
    ping_times_ms: list[float] = []

    if turns:
        for turn in turns:
            scene_idx = int(turn.get("sceneIndex", 0))
            is_first_turn_of_scene = scene_idx not in seen_scenes
            seen_scenes.add(scene_idx)

            highlight = turn.get("highlightStat")
            has_highlight = highlight is not None and str(highlight).strip() != ""

            if has_highlight or is_first_turn_of_scene:
                ping_times_ms.append(float(turn.get("startMs", 0.0)))
    else:
        # Fallback when running against a pre-TTS manifest without populated turns
        for scene in scenes:
            ping_times_ms.append(float(scene.get("startMs", 0.0)) + 600.0)

    ping_cache = [_make_telemetry_ping_sfx(variant=v, sr=sr) for v in range(3)]
    n_pings = 0
    last_ping_ms = -1000.0
    for ping_ms in ping_times_ms:
        if ping_ms - last_ping_ms < 180.0:
            continue
        last_ping_ms = ping_ms
        ping_sample = int(round((ping_ms / 1000.0) * sr))
        mix_clip_in_place(sfx_bus, ping_cache[n_pings % 3], start_sample=ping_sample)
        n_pings += 1

    return sfx_bus, n_transitions, n_pings


# ---------------------------------------------------------------------------
# 3. Broadcast Sidechain Ducking & Master Pre-Mix (`public/audio/master_mix.wav`)
# ---------------------------------------------------------------------------


def condition_voiceover_studio(vo_raw: np.ndarray, sr: int = TARGET_SR) -> tuple[np.ndarray, np.ndarray]:
    """
    Condition raw voiceover into centered broadcast stereo with subtle studio warmth:
    - Phase-coherent mono fold-down + 75 Hz sub-rumble high-pass filter.
    - Subtle studio chest warmth (+1.6 dB @ 185 Hz), mud cleanup (-1.0 dB @ 420 Hz),
      articulation lift (+1.0 dB @ 3.6 kHz), and smooth sibilance control (-1.4 dB @ 6.8 kHz).
    - Gentle transformer warmth + ultra-subtle (-28 dB) studio booth early reflections.
    Returns `(vo_stereo, vo_mono_conditioned)`.
    """
    total_samples = vo_raw.shape[0]
    vo_mono = 0.5 * (vo_raw[:, 0] + vo_raw[:, 1])
    raw_peak = float(np.max(np.abs(vo_mono)))
    if raw_peak <= 1e-6:
        return np.zeros((total_samples, 2), dtype=np.float64), np.zeros(total_samples, dtype=np.float64)

    sos_chain = np.vstack(
        [
            signal.butter(2, 75.0, btype="high", fs=sr, output="sos"),
            peaking_eq_sos(freq_hz=185.0, q=0.90, gain_db=+1.6, sr=sr),
            peaking_eq_sos(freq_hz=420.0, q=1.40, gain_db=-1.0, sr=sr),
            peaking_eq_sos(freq_hz=3600.0, q=0.85, gain_db=+1.0, sr=sr),
            peaking_eq_sos(freq_hz=6800.0, q=1.80, gain_db=-1.4, sr=sr),
        ]
    )
    vo_eq = signal.sosfilt(sos_chain, vo_mono)

    # Calibrate active speech loudness consistently so Kokoro/Gemini voices sit upfront
    block = max(1, sr // 50)  # 20 ms RMS blocks
    n_blocks = vo_eq.shape[0] // block
    if n_blocks > 0:
        frames = vo_eq[: n_blocks * block].reshape(n_blocks, block)
        frame_rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-12)
        active = frame_rms[frame_rms > db_to_amp(-44.0)]
        active_rms = float(np.mean(active)) if active.size > 0 else float(np.sqrt(np.mean(vo_eq * vo_eq)))
    else:
        active_rms = float(np.sqrt(np.mean(vo_eq * vo_eq)))

    eq_peak = float(np.max(np.abs(vo_eq)))
    if active_rms > 1e-6 and eq_peak > 1e-6:
        target_rms_gain = db_to_amp(-16.5) / active_rms
        max_peak_gain = db_to_amp(-2.2) / eq_peak
        gain = min(target_rms_gain, max_peak_gain, 4.0)
        vo_eq = vo_eq * gain

    # Subtle studio tube/transformer saturation
    vo_warm = db_to_amp(-2.0) * (np.tanh(1.12 * (vo_eq / db_to_amp(-2.0))) / math.tanh(1.12))

    # Centered stereo dry signal + subtle (-28 dB) band-limited vocal booth reflections
    sos_room = np.vstack(
        [
            signal.butter(2, 240.0, btype="high", fs=sr, output="sos"),
            signal.butter(2, 3000.0, btype="low", fs=sr, output="sos"),
        ]
    )
    room_src = signal.sosfilt(sos_room, vo_warm) * db_to_amp(-28.0)

    delay_l = int(round(0.0115 * sr))
    delay_r = int(round(0.0173 * sr))
    vo_stereo = np.column_stack((vo_warm, vo_warm))
    if delay_l < total_samples:
        vo_stereo[delay_l:, 0] += room_src[:-delay_l]
    if delay_r < total_samples:
        vo_stereo[delay_r:, 1] += room_src[:-delay_r]

    return vo_stereo, vo_warm


def compute_sidechain_ducking_envelope(
    vo_mono: np.ndarray,
    attack_ms: float = 30.0,
    release_ms: float = 350.0,
    sr: int = TARGET_SR,
) -> np.ndarray:
    """
    Compute a smooth broadcast sidechain speech-activity envelope in `[0.0, 1.0]`
    at 1 ms detector resolution (`attack=30ms`, `release=350ms`) with 18 ms lookahead
    and 90 ms inter-syllable hold so music never pumps mid-sentence.
    """
    n_samples = vo_mono.shape[0]
    if n_samples == 0 or float(np.max(np.abs(vo_mono))) <= 1e-6:
        return np.zeros(n_samples, dtype=np.float64)

    block_samples = max(1, sr // 1000)  # 48 samples = 1.0 ms @ 48 kHz
    env_sr = float(sr) / float(block_samples)
    n_blocks = (n_samples + block_samples - 1) // block_samples

    padded_len = n_blocks * block_samples
    vo_padded = np.zeros(padded_len, dtype=np.float64)
    vo_padded[:n_samples] = vo_mono
    blocks = vo_padded.reshape(n_blocks, block_samples)

    block_rms = np.sqrt(np.mean(blocks * blocks, axis=1) + 1e-12)
    block_peak = np.max(np.abs(blocks), axis=1)
    det_db = 20.0 * np.log10(np.maximum(0.65 * block_rms + 0.35 * block_peak, 1e-7))

    # Smooth cubic Hermite soft-knee speech gate (-44 dBFS -> 0.0, -28 dBFS -> 1.0)
    u = np.clip((det_db - (-44.0)) / ((-28.0) - (-44.0)), 0.0, 1.0)
    gate = u * u * (3.0 - 2.0 * u)

    # 18 ms lookahead + 90 ms brief hold across consonant micro-gaps
    hold_blocks = int(round(0.090 * env_sr))
    lookahead_blocks = int(round(0.018 * env_sr))
    win_padded = np.pad(gate, (hold_blocks, lookahead_blocks), mode="edge")
    gate_held = np.maximum.reduce(
        [win_padded[k : k + n_blocks] for k in range(hold_blocks + lookahead_blocks + 1)]
    )

    # Exact one-pole ballistic envelope follower (attack=30ms, release=350ms)
    coeff_att = math.exp(-1.0 / (max(attack_ms, 0.5) * 0.001 * env_sr))
    coeff_rel = math.exp(-1.0 / (max(release_ms, 1.0) * 0.001 * env_sr))

    env_blocks = np.empty(n_blocks, dtype=np.float64)
    cur = 0.0
    for i in range(n_blocks):
        target = float(gate_held[i])
        if target > cur:
            cur = coeff_att * cur + (1.0 - coeff_att) * target
        else:
            cur = coeff_rel * cur + (1.0 - coeff_rel) * target
        env_blocks[i] = cur

    # Smooth 9 ms Hanning polish + linear upsample back to 48 kHz sample grid
    smooth_win = np.hanning(11)
    smooth_win /= np.sum(smooth_win)
    env_blocks = np.convolve(np.pad(env_blocks, (5, 5), mode="edge"), smooth_win, mode="valid")

    block_centers = (np.arange(n_blocks, dtype=np.float64) + 0.5) * float(block_samples)
    sample_idx = np.arange(n_samples, dtype=np.float64)
    return np.clip(np.interp(sample_idx, block_centers, env_blocks), 0.0, 1.0)


def apply_master_soft_limiter(
    stereo_mix: np.ndarray,
    ceiling_dbfs: float = -1.0,
    knee_dbfs: float = -3.2,
    sr: int = TARGET_SR,
) -> np.ndarray:
    """
    Stereo-linked broadcast soft-knee brickwall limiter guaranteeing peak <= `-1.0 dBFS`
    with zero hard-clipping artifacts and zero stereo image shift.
    """
    ceiling = db_to_amp(ceiling_dbfs)
    threshold = min(db_to_amp(knee_dbfs), ceiling * 0.92)
    span = ceiling - threshold

    linked_abs = np.max(np.abs(stereo_mix), axis=1)
    over = np.maximum(linked_abs - threshold, 0.0)
    compressed_env = np.where(
        linked_abs > threshold,
        threshold + span * np.tanh(over / max(span, 1e-9)),
        linked_abs,
    )
    inst_gain = np.where(linked_abs > 1e-12, compressed_env / np.maximum(linked_abs, 1e-12), 1.0)

    # Smooth gain release at 1 ms block granularity while strictly honoring inst_gain ceiling
    block = max(1, sr // 1000)
    n_samples = stereo_mix.shape[0]
    n_blocks = (n_samples + block - 1) // block
    g_pad = np.ones(n_blocks * block, dtype=np.float64)
    g_pad[:n_samples] = inst_gain
    min_blocks = np.min(g_pad.reshape(n_blocks, block), axis=1)

    rel_coeff = math.exp(-1.0 / 55.0)  # 55 ms smooth limiter release
    smooth_blocks = np.empty(n_blocks, dtype=np.float64)
    g_cur = 1.0
    for i in range(n_blocks):
        g_target = float(min_blocks[i])
        if g_target < g_cur:
            g_cur = g_target
        else:
            g_cur = rel_coeff * g_cur + (1.0 - rel_coeff) * g_target
        smooth_blocks[i] = g_cur

    centers = (np.arange(n_blocks, dtype=np.float64) + 0.5) * float(block)
    smooth_gain = np.interp(np.arange(n_samples, dtype=np.float64), centers, smooth_blocks)
    final_gain = np.minimum(inst_gain, smooth_gain)

    limited = stereo_mix * final_gain[:, None]
    return np.clip(limited, -ceiling, ceiling)


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Synthesize 48 kHz documentary BGM, frame-accurate cinema foley SFX, and ducked master mix."
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to src/generated/timeline-manifest.json",
    )
    parser.add_argument(
        "--voiceover",
        type=Path,
        default=None,
        help="Optional override path for public/audio/voiceover_master.wav",
    )
    parser.add_argument(
        "--bgm-out",
        type=Path,
        default=None,
        help="Optional override path for public/audio/bgm_bed.wav",
    )
    parser.add_argument(
        "--master-out",
        type=Path,
        default=None,
        help="Optional override path for public/audio/master_mix.wav",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.manifest.exists():
        raise FileNotFoundError(f"Timeline manifest not found: {args.manifest}")

    with args.manifest.open("r", encoding="utf-8") as fh:
        manifest: dict[str, Any] = json.load(fh)

    vo_path = args.voiceover or resolve_public_audio_path(
        PROJECT_ROOT, manifest.get("voiceoverSrc"), "audio/voiceover_master.wav"
    )
    bgm_out_path = args.bgm_out or resolve_public_audio_path(
        PROJECT_ROOT, manifest.get("bgmSrc"), "audio/bgm_bed.wav"
    )
    master_out_path = args.master_out or resolve_public_audio_path(
        PROJECT_ROOT, manifest.get("masterAudioSrc"), "audio/master_mix.wav"
    )

    fps = max(int(manifest.get("fps", 30)), 1)
    manifest_ms = float(manifest.get("totalDurationMs", 0.0))
    frames_ms = (float(manifest.get("totalFrames", 0.0)) / float(fps)) * 1000.0
    scenes = manifest.get("scenes", [])
    scenes_end_ms = max((float(s.get("endMs", 0.0)) for s in scenes), default=0.0)
    timeline_ms = max(manifest_ms, frames_ms, scenes_end_ms)
    manifest_samples = int(round((timeline_ms / 1000.0) * TARGET_SR))

    if vo_path.exists():
        vo_loaded = load_wav_48k_stereo(vo_path, target_sr=TARGET_SR)
        print(
            f"[soundscape] Loaded voiceover '{vo_path.relative_to(PROJECT_ROOT) if vo_path.is_relative_to(PROJECT_ROOT) else vo_path}' "
            f"({vo_loaded.shape[0] / TARGET_SR:.2f}s @ {TARGET_SR} Hz)"
        )
    else:
        print(
            f"[soundscape] WARNING: Voiceover file '{vo_path}' not found; synthesizing BGM + SFX with silent VO bed."
        )
        vo_loaded = np.zeros((max(manifest_samples, TARGET_SR * 5), 2), dtype=np.float64)

    total_samples = max(manifest_samples, vo_loaded.shape[0], TARGET_SR * 5)
    if vo_loaded.shape[0] < total_samples:
        vo_raw = np.zeros((total_samples, 2), dtype=np.float64)
        vo_raw[: vo_loaded.shape[0]] = vo_loaded
    else:
        vo_raw = vo_loaded[:total_samples]

    total_sec = total_samples / float(TARGET_SR)
    print(f"[soundscape] Target master timeline: {total_sec:.2f}s ({total_samples} samples @ {TARGET_SR} Hz)")

    # 1. Generate Cinematic Documentary Underscore (`bgm_bed.wav`)
    bgm_bed = synthesize_bgm_bed(total_samples=total_samples, scenes=scenes, sr=TARGET_SR)
    write_wav_48k_16bit_stereo(bgm_out_path, bgm_bed, sr=TARGET_SR, seed=DITHER_SEED)
    bgm_peak_db = amp_to_db(float(np.max(np.abs(bgm_bed))))
    print(f"[soundscape] Wrote BGM bed -> {bgm_out_path} (peak {bgm_peak_db:.2f} dBFS)")

    # 2. Generate Frame-Accurate Cinema Foley & Telemetry SFX Bus
    sfx_bus, n_transitions, n_pings = synthesize_sfx_bus(
        total_samples=total_samples,
        manifest=manifest,
        sr=TARGET_SR,
    )
    print(
        f"[soundscape] Synthesized foley SFX bus: 1 cold-open sub-drop, "
        f"{n_transitions} scene transitions (-16 dBFS), {n_pings} telemetry pings (-22 dBFS)"
    )

    # 3. Condition Voiceover, Compute Sidechain Ducking (-15 dBFS -> -24 dBFS), and Master Mix
    vo_stereo, vo_mono = condition_voiceover_studio(vo_raw, sr=TARGET_SR)
    duck_env = compute_sidechain_ducking_envelope(
        vo_mono=vo_mono,
        attack_ms=30.0,
        release_ms=350.0,
        sr=TARGET_SR,
    )

    # `bgm_bed` is calibrated at -15.0 dBFS during pauses (`duck_env=0`);
    # applying `-9.0 * duck_env` dB ducks it cleanly down to -24.0 dBFS during speech (`duck_env=1`).
    duck_gain_lin = np.power(10.0, (-9.0 * duck_env) / 20.0)
    bgm_ducked = bgm_bed * duck_gain_lin[:, None]

    pre_limit_mix = vo_stereo + bgm_ducked + sfx_bus
    master_mix = apply_master_soft_limiter(pre_limit_mix, ceiling_dbfs=-1.0, knee_dbfs=-3.2, sr=TARGET_SR)
    write_wav_48k_16bit_stereo(master_out_path, master_mix, sr=TARGET_SR, seed=DITHER_SEED + 1)

    master_peak_db = amp_to_db(float(np.max(np.abs(master_mix))))
    master_rms_db = amp_to_db(float(np.sqrt(np.mean(master_mix * master_mix))))
    speech_ratio = float(np.mean(duck_env > 0.5)) * 100.0
    print(
        f"[soundscape] Wrote Master Mix -> {master_out_path} "
        f"(peak {master_peak_db:.2f} dBFS, RMS {master_rms_db:.2f} dBFS, "
        f"BGM ducked active {speech_ratio:.1f}% of timeline)"
    )


if __name__ == "__main__":
    main()
