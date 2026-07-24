"""DeepFilterNet adapter — the ONLY module that imports the ML/audio stack.

Confining `df` / `torch` / `soundfile` / `librosa` / `numpy` to this repo module
mirrors the boto3-in-repo rule (AGENTS.md §3) and keeps the structural + layering
tests green. Everything above the repo layer works with plain bytes and typed
models.

Device: DeepFilterNet's `init_df()` auto-selects CUDA when available and falls
back to CPU otherwise. Apple MPS is deliberately skipped — DFN's complex-valued
DSP ops have incomplete MPS coverage — so this sample is CUDA -> CPU (never a
hard GPU requirement). `select_device()` reports the choice for the UI/log.
"""

from __future__ import annotations

import functools
import io
import logging

import librosa
import numpy as np
import soundfile as sf
import torch
from df.enhance import enhance, init_df

from app.types.jobs import AudioInfo, EnhancementParams
from app.types.snr import estimate_snr_db

logger = logging.getLogger(__name__)

MODEL_NAME = "DeepFilterNet3"
# DeepFilterNet3 operates at 48 kHz; outputs are always written at this rate.
TARGET_SR = 48000


def select_device() -> str:
    """First available of CUDA -> CPU. MPS intentionally excluded (see module doc)."""
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def model_version() -> str:
    return f"{MODEL_NAME} (deepfilternet 0.5.x)"


@functools.lru_cache(maxsize=2)
def get_model(post_filter: bool):
    """Load (and cache) the DeepFilterNet model.

    Cached per `post_filter` value (only two possible), so both variants init
    once. First call downloads the pretrained DeepFilterNet3 weights into the
    DeepFilterNet cache dir; subsequent calls reuse them. Returns (model,
    df_state).
    """
    logger.info(
        "Loading %s (post_filter=%s) on device=%s",
        MODEL_NAME,
        post_filter,
        select_device(),
    )
    model, df_state, _ = init_df(post_filter=post_filter)
    return model, df_state


def _decode_mono(raw_bytes: bytes) -> tuple[np.ndarray, int, int]:
    """Decode audio bytes to a float32 mono array. Returns (samples, sr, channels).

    soundfile (libsndfile >= 1.1) reads WAV/FLAC/OGG and MP3 without a system
    ffmpeg. Multi-channel input is downmixed to mono (speech).
    """
    data, sr = sf.read(io.BytesIO(raw_bytes), dtype="float32", always_2d=True)
    channels = data.shape[1]
    mono = data.mean(axis=1) if channels > 1 else data[:, 0]
    return np.ascontiguousarray(mono, dtype=np.float32), int(sr), int(channels)


def probe_audio(raw_bytes: bytes) -> AudioInfo:
    """Cheap metadata probe (duration/sr/channels) for the Library."""
    with sf.SoundFile(io.BytesIO(raw_bytes)) as f:
        frames = len(f)
        sr = f.samplerate
        channels = f.channels
    duration = frames / sr if sr else 0.0
    return AudioInfo(
        duration_seconds=round(duration, 3),
        sample_rate=sr,
        channels=channels,
    )


def _encode_wav(samples: np.ndarray, sr: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def enhance_audio(
    raw_bytes: bytes, filename: str, params: EnhancementParams
) -> tuple[bytes, dict]:
    """Denoise one recording end-to-end.

    decode -> downmix mono -> resample to 48 kHz -> DeepFilterNet enhance ->
    encode 16-bit PCM WAV. Returns (wav_bytes, metrics) where metrics carries the
    reference-free input/output SNR proxies, duration, and in/out byte counts.
    Raises ValueError on undecodable input.
    """
    try:
        mono, sr, _channels = _decode_mono(raw_bytes)
    except Exception as e:  # soundfile can raise several error types
        raise ValueError(f"Could not decode audio '{filename}': {e}") from e

    if mono.size == 0:
        raise ValueError(f"Empty audio '{filename}'")

    # Resample to the model's 48 kHz working rate.
    resampled = (
        librosa.resample(mono, orig_sr=sr, target_sr=TARGET_SR)
        if sr != TARGET_SR
        else mono
    )
    resampled = np.ascontiguousarray(resampled, dtype=np.float32)

    input_snr = estimate_snr_db(resampled, TARGET_SR)

    model, df_state = get_model(bool(params.post_filter))
    audio_t = torch.from_numpy(resampled).unsqueeze(0)  # (1, T)
    # atten_lim_db=None => full suppression; numeric => keep more ambience.
    with torch.no_grad():
        enhanced_t = enhance(
            model, df_state, audio_t, atten_lim_db=params.attenuation_limit_db
        )
    enhanced_np = enhanced_t.squeeze(0).detach().cpu().numpy().astype(np.float32)

    output_snr = estimate_snr_db(enhanced_np, TARGET_SR)
    wav_bytes = _encode_wav(enhanced_np, TARGET_SR)

    delta = None
    if input_snr is not None and output_snr is not None:
        delta = round(output_snr - input_snr, 1)

    metrics = {
        "duration_seconds": round(len(enhanced_np) / TARGET_SR, 3),
        "sample_rate_out": TARGET_SR,
        "input_bytes": len(raw_bytes),
        "output_bytes": len(wav_bytes),
        "input_snr_db": input_snr,
        "output_snr_db": output_snr,
        "snr_delta_db": delta,
    }
    return wav_bytes, metrics
