"""Reference-free SNR estimate (a proxy — labeled "estimate" everywhere).

A real SNR needs a clean reference signal, which doesn't exist for a field
recording. So we report an ESTIMATE derived from the distribution of short-time
frame energy: the low-energy percentile approximates the noise floor, the
high-energy percentile approximates the speech level, and

    snr_db ~= 20 * log10(speech_rms / noise_rms)

This lives in the `types` layer (like `formatting.py`) as a pure numpy helper so
it can be unit-tested without importing torch / DeepFilterNet. It is deliberately
NOT re-exported from `app.types.__init__` to keep the base types import numpy-free.
"""

from __future__ import annotations

import math

import numpy as np

# Percentiles used to separate the noise floor from the speech level.
_NOISE_PCT = 10.0
_SPEECH_PCT = 90.0
_FRAME_MS = 20.0
_EPS = 1e-9


def estimate_snr_db(
    samples: np.ndarray | list[float],
    sr: int,
    frame_ms: float = _FRAME_MS,
) -> float | None:
    """Estimate signal-to-noise ratio in dB from raw mono samples.

    Returns None when there isn't enough non-silent signal to estimate from
    (empty input, or fewer than two non-zero frames). The result is rounded to
    one decimal and clamped to a sane range so a near-silent file can't report
    an absurd value.
    """
    x = np.asarray(samples, dtype=np.float64).ravel()
    if x.size == 0:
        return None

    frame = max(1, int(sr * frame_ms / 1000.0))
    n_frames = x.size // frame
    if n_frames < 2:
        # Too short to bucket into frames — fall back to a single-window RMS,
        # which can't separate noise from speech, so return None (honest).
        return None

    frames = x[: n_frames * frame].reshape(n_frames, frame)
    rms = np.sqrt(np.mean(np.square(frames), axis=1))
    rms = rms[rms > _EPS]  # drop exact-silence frames
    if rms.size < 2:
        return None

    noise = float(np.percentile(rms, _NOISE_PCT))
    speech = float(np.percentile(rms, _SPEECH_PCT))
    if noise <= _EPS or speech <= _EPS:
        return None

    snr = 20.0 * math.log10(speech / noise)
    # Clamp to a defensible display range for a proxy estimate.
    snr = max(-20.0, min(80.0, snr))
    return round(snr, 1)
