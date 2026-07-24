"""End-to-end denoiser smoke test.

Runs a real DeepFilterNet denoise on a short synthesized noisy WAV and asserts
the write-amplification claim (48 kHz 16-bit WAV output larger than a compressed
input). Skipped automatically if the ML stack or pretrained model can't init
(e.g. no torch/df installed, or no network to fetch the weights on a cold cache)
so the suite stays green in constrained environments.
"""

import io

import pytest

np = pytest.importorskip("numpy")
sf = pytest.importorskip("soundfile")
pytest.importorskip("torch")
pytest.importorskip("df")


@pytest.fixture(scope="module")
def denoiser():
    from app.repo import denoiser as denoiser_module

    try:
        # Force model init up front so a download/init failure -> skip, not error.
        denoiser_module.get_model(False)
    except Exception as e:
        pytest.skip(f"DeepFilterNet model unavailable: {e}")
    return denoiser_module


def _noisy_wav_16k() -> bytes:
    sr = 16000
    t = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
    speech = 0.3 * np.sin(2 * np.pi * 220 * t)
    noise = 0.08 * np.random.RandomState(0).randn(len(t))
    buf = io.BytesIO()
    sf.write(buf, (speech + noise).astype(np.float32), sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def test_enhance_produces_48k_wav_and_amplifies(denoiser):
    from app.types import EnhancementParams

    raw = _noisy_wav_16k()
    wav_bytes, metrics = denoiser.enhance_audio(
        raw, "clip.wav", EnhancementParams(attenuation_limit_db=None, post_filter=False)
    )

    # Output is a valid 48 kHz WAV.
    data, sr = sf.read(io.BytesIO(wav_bytes))
    assert sr == 48000
    assert metrics["sample_rate_out"] == 48000
    assert len(data) > 0

    # Write-amplification: 16 kHz -> 48 kHz 16-bit means a larger output.
    assert metrics["output_bytes"] > metrics["input_bytes"]
    assert metrics["input_bytes"] == len(raw)

    # SNR proxies are populated (estimates, may be any sign).
    assert metrics["input_snr_db"] is not None
    assert metrics["output_snr_db"] is not None


def test_probe_audio_reports_shape(denoiser):
    info = denoiser.probe_audio(_noisy_wav_16k())
    assert info.sample_rate == 16000
    assert info.channels == 1
    assert info.duration_seconds > 1.0
