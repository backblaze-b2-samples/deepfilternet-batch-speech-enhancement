"""Unit tests for the reference-free SNR proxy (app/types/snr.py)."""

import numpy as np

from app.types.snr import estimate_snr_db


def test_empty_returns_none():
    assert estimate_snr_db(np.array([], dtype=np.float32), 48000) is None


def test_too_short_returns_none():
    # Fewer than two frames of data.
    assert estimate_snr_db(np.zeros(10, dtype=np.float32), 48000) is None


def test_pure_silence_returns_none():
    # All-zero frames are dropped, leaving nothing to estimate from.
    assert estimate_snr_db(np.zeros(48000, dtype=np.float32), 48000) is None


def _speech_like(sr: int, floor: float, seed: int) -> np.ndarray:
    """Alternating loud speech bursts and quiet gaps, over a noise floor.

    The proxy separates the quiet-frame level (noise floor) from the loud-frame
    level (speech), so a lower floor => higher estimated SNR. This mirrors real
    speech (pauses between words) rather than a constant tone.
    """
    rng = np.random.RandomState(seed)
    t = np.linspace(0, 3.0, int(sr * 3.0), endpoint=False)
    tone = 0.6 * np.sin(2 * np.pi * 200 * t)
    # Speech mask: on for 0.3s, off for 0.3s.
    mask = (np.floor(t / 0.3).astype(int) % 2 == 0).astype(np.float32)
    signal = tone * mask + floor * rng.randn(len(t))
    return signal.astype(np.float32)


def test_clean_signal_scores_higher_than_noisy():
    sr = 48000
    clean = _speech_like(sr, floor=0.001, seed=0)  # very quiet gaps
    noisy = _speech_like(sr, floor=0.08, seed=0)  # noisy gaps

    clean_snr = estimate_snr_db(clean, sr)
    noisy_snr = estimate_snr_db(noisy, sr)

    assert clean_snr is not None
    assert noisy_snr is not None
    # A cleaner signal (lower noise floor) must estimate a higher SNR.
    assert clean_snr > noisy_snr


def test_result_is_clamped_and_rounded():
    sr = 48000
    snr = estimate_snr_db(_speech_like(sr, floor=0.02, seed=1), sr)
    assert snr is not None
    assert -20.0 <= snr <= 80.0
    # One decimal place.
    assert round(snr, 1) == snr
