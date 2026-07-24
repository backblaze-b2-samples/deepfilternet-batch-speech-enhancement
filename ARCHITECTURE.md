<!-- last_verified: 2026-07-24 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Denoising dashboard (recordings enhanced, enhanced bytes written, write-amplification ratio, avg SNR improvement)
  - Enhancement Jobs (create / view / re-run / delete) with per-file results + before/after playback
  - Audio Library (source vs enhanced, scoped to the sample prefixes)
  - Upload (audio ingest) + full-bucket File Explorer (retained starter surface)
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for jobs, library, denoising stats, upload, listing, deletion
  - B2 S3 integration via boto3 (`repo/b2_client.py`, `repo/b2_object.py`)
  - DeepFilterNet denoising via `repo/denoiser.py` (the only ML/audio module)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing; Prometheus-format metrics
- **packages/shared/** — TypeScript type definitions mirroring the Pydantic models

## Backend Layering

Strict layered architecture:

```
types/     Pydantic models + pure helpers (snr proxy, formatting) — no logic across layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access: boto3 B2 client + DeepFilterNet adapter — no business logic
  |
service/   Business logic — orchestrates repo calls, returns typed models
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types → config → repo → service → runtime`
2. No backward imports
3. **`boto3` only in `repo/`** (enforced by `tests/test_structure.py`)
4. **DeepFilterNet / torch / soundfile / librosa only in `repo/denoiser.py`** — the
   external-ML-SDK-in-repo rule, mirroring boto3 (enforced by
   `test_structure.py::test_ml_sdk_only_in_repo`). `numpy` is allowed in the
   `types` SNR helper so the proxy math is unit-testable without torch.
5. All boundary data uses Pydantic models (no raw dicts across layers)
6. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Models: files, stats, jobs, enhancement_stats, library, snr (proxy)
    config/                Settings loaded from environment (B2 + prefixes + limits)
    repo/                  b2_client, b2_object, counter, denoiser (DeepFilterNet), job_store
    service/               files, upload, metadata, enhancement, jobs, enhancement_stats, library
    runtime/               Route handlers: files, upload, enhancement, health, metrics, ratelimit
  tests/                   pytest (structural + unit + a guarded denoiser smoke test)
```

## B2 layout (single bucket, prefix-scoped)

No application database — B2 is the sole data store.

| Prefix | Contents | Written by |
|--------|----------|------------|
| `source/` | Ingested original recordings | Upload (`service/upload.py`) |
| `enhanced/<job_id>/` | Cleaned 48 kHz WAV outputs (job-scoped so delete is safe) | `service/enhancement.py` |
| `jobs/<job_id>.jsonl` | Per-batch JSONL processing log (the durable job record) | `service/enhancement.py` |

Prefixes are settings-configurable (`SOURCE_PREFIX`, `ENHANCED_PREFIX`, `JOBS_PREFIX`).

## B2 operations (all S3-compatible — no b2-native)

| Operation | boto3 call | Used by |
|-----------|-----------|---------|
| List | `list_objects_v2` (paginated, cached) | stats, library, job source-picker, job listing, bucket explorer |
| Write | `put_object` | enhanced WAV, batch JSONL, source ingest |
| Read | `get_object` | decode source audio for the denoiser; parse JSONL logs |
| Head | `head_object` | object metadata |
| Delete | `delete_object` | scoped job-output + JSONL delete; bucket-explorer delete |
| Presign | `generate_presigned_url` (GET) | browser streams/downloads audio directly from B2 |

The single S3 client is built in `repo/b2_client.py` (lru-cached), sets
`user_agent_extra="b2ai-deepfilternet-batch-speech-enhancement"`, and derives its
endpoint from `B2_REGION` (`https://s3.<region>.backblazeb2.com`) — no hardcoded
region anywhere.

## DeepFilterNet adapter (`repo/denoiser.py`)

- `get_model(post_filter)` — `lru_cache` over `init_df(...)`; caches both post-filter
  variants. First call downloads the pretrained DeepFilterNet3 weights.
- `enhance_audio(raw, filename, params)` — decode (soundfile) → downmix mono →
  resample to 48 kHz (librosa) → `enhance(...)` → encode 16-bit PCM WAV; returns
  `(wav_bytes, metrics)` including the reference-free SNR proxies.
- `probe_audio(raw)` — duration/sr/channels for the Library.
- Device: `select_device()` returns CUDA if available else CPU (DeepFilterNet's own
  init also auto-selects CUDA→CPU). Apple MPS is deliberately skipped.

## Processing model

Job creation is **synchronous within the POST /jobs request** — a small demo batch is
processed inline (sync `def` handlers run in Starlette's threadpool). The live status
registry (`repo/job_store.py`) is in-process; the durable record is the B2 JSONL, so
completed jobs are re-derived from B2 on restart. A production system would enqueue the
batch on a task queue — see `docs/exec-plans/tech-debt-tracker.md`.

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently` (web `:3000`, API `:8000`)
- **Railway** — two services from the same repo; see `infra/railway/README.md`.
  DeepFilterNet runs a PyTorch model, so provision adequate CPU/memory (or a GPU).

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md).

- **Frontend → API** — CORS-restricted; `CORSMiddleware` registered LAST (outermost) so it wraps every response including 500s. Per-IP rate limiter sits inner to CORS.
- **API → B2** — application keys, signature v4.
- **Client → B2** — presigned URLs for audio streaming/download (10-min expiry).

## Data Flows

- **Ingest**: Browser → `POST /upload` → validate → `put_object` to `source/`
- **Enhance**: Browser → `POST /jobs` → for each key: `get_object` → DeepFilterNet → `put_object` to `enhanced/<job_id>/` → compose + `put_object` JSONL to `jobs/` → return job
- **Read job**: `GET /jobs/{id}` parses the JSONL; `GET /jobs` scans `jobs/` and summarizes
- **Playback**: Browser requests a presigned URL per key and streams from B2
- **Delete job**: `DELETE /jobs/{id}` deletes exactly the JSONL-recorded outputs + the log

## Observability

- Structured JSON logging with `request_id`; request timing middleware (also the uncaught-exception → typed 500 catch-all)
- `/metrics` (Prometheus format) and `/health` (B2 connectivity)

## Canonical Files

- DeepFilterNet adapter: `services/api/app/repo/denoiser.py`
- Job orchestration: `services/api/app/service/enhancement.py`
- JSONL (de)serialization + job read/delete: `services/api/app/service/jobs.py`
- B2 data access: `services/api/app/repo/b2_client.py`
- Enhancement routes: `services/api/app/runtime/enhancement.py`
- Structural tests: `services/api/tests/test_structure.py`
- Frontend API client / hooks: `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/queries.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Speech Enhancement](docs/features/speech-enhancement.md)
- [Enhancement Jobs](docs/features/enhancement-jobs.md)
- [Audio Library](docs/features/audio-library.md)
- [Dashboard](docs/features/dashboard.md)
- [File Upload](docs/features/file-upload.md)
- [File Browser](docs/features/file-browser.md)
- [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) · [docs/RELIABILITY.md](docs/RELIABILITY.md) · [AGENTS.md](AGENTS.md)
