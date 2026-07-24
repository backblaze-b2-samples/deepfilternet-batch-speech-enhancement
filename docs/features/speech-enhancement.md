<!-- last_verified: 2026-07-24 -->
# Feature: Speech Enhancement (DeepFilterNet)

## Purpose
Denoise a noisy speech recording with the local DeepFilterNet neural network and produce
a cleaned 48 kHz WAV, on B2 credentials alone (no second API key). `deployment: local`.

## Used By
- API: called by the job orchestrator (`service/enhancement.py`) for each source key
- Job: `POST /jobs` runs enhancement synchronously over a batch

## Core Functions
- `services/api/app/repo/denoiser.py` — `get_model()`, `enhance_audio()`, `probe_audio()`, `select_device()`
- `services/api/app/types/snr.py` — `estimate_snr_db()` (reference-free SNR proxy, pure numpy)

## Canonical Files
- DeepFilterNet adapter (external ML SDK confined to repo/): `services/api/app/repo/denoiser.py`

## Inputs
- raw_bytes: bytes (WAV/MP3/FLAC/OGG source audio)
- filename: string
- params: `EnhancementParams` (`attenuation_limit_db: int | None`, `post_filter: bool`)

## Outputs
- (wav_bytes, metrics) — a 16-bit PCM **48 kHz WAV**, plus metrics: `input_snr_db`,
  `output_snr_db`, `snr_delta_db` (estimates), `duration_seconds`, `sample_rate_out`,
  `input_bytes`, `output_bytes`
- Side effect: the caller (`service/enhancement.py`) writes the WAV to `enhanced/<job_id>/`

## Flow
- `enhance_audio()` decodes source bytes with soundfile (libsndfile ≥1.1 reads WAV/MP3/FLAC/OGG
  without a system ffmpeg), downmixes to mono, resamples to 48 kHz with librosa
- Estimates the input SNR proxy, runs `df.enhance.enhance(model, df_state, audio, atten_lim_db=…)`,
  estimates the output SNR proxy, encodes a 16-bit PCM WAV
- `get_model(post_filter)` is `lru_cache`'d (two variants); the first call downloads the
  pretrained DeepFilterNet3 weights into the DeepFilterNet cache dir
- `post_filter=True` initializes the DFN post-filter; `atten_lim_db=None` = full suppression,
  numeric values cap attenuation (keep more ambience)

## Device
- `select_device()` returns CUDA if available, else CPU. DeepFilterNet's own `init_df()` also
  auto-selects CUDA→CPU. **Apple MPS is deliberately skipped** — DFN's complex-valued DSP ops
  have incomplete MPS coverage — so on a Mac it runs on CPU. Never a hard GPU requirement.

## SNR caveat (reference-free estimate)
No clean reference exists for a field recording, so SNR is an **estimate**: the low-energy
percentile of short-time frame RMS approximates the noise floor, the high percentile the
speech level, `snr ≈ 20·log10(speech/noise)`, and `Δ = out − in`. Labeled "estimate" in the
UI and JSONL log. Treat it as a relative indicator, not a measured value.

## Edge Cases
- Undecodable / empty audio → `ValueError`; the batch records that file as `failed` and continues
- File larger than `MAX_AUDIO_BYTES` → recorded as `failed` (guards API memory)
- Multi-channel input → downmixed to mono (speech)
- Model weights can't download (offline, cold cache) → the guarded smoke test skips; a real run surfaces the error per file

## Verification
- Test files: `services/api/tests/test_denoiser_smoke.py` (guarded end-to-end), `services/api/tests/test_snr.py`
- Required cases: real denoise produces a 48 kHz WAV larger than a compressed input (write amplification); probe reports shape; SNR proxy ranks a clean signal above a noisy one
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest green (smoke test passes or skips if the model can't init), ruff clean

## Related Docs
- [Enhancement Jobs](enhancement-jobs.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)
