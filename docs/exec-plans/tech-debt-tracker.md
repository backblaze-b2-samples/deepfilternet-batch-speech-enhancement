<!-- last_verified: 2026-07-20 -->
# Tech Debt Tracker

Known tech debt items. Agents update this when they discover or create tech debt.

## Open

| Description | Impact | Proposed Resolution | Priority |
|---|---|---|---|
| Enhancement jobs run **synchronously** inside `POST /jobs` | A large batch blocks the request for the full denoise duration; a client timeout leaves no live progress | Move batch processing to a task queue (Celery/RQ/arq) with a job-status poll endpoint; keep the JSONL log as the durable record | Medium |
| SNR is a **reference-free estimate** | The reported in/out/Δ SNR is a percentile-based proxy, not a measured SNR (no clean reference exists), so values are relative indicators only | If ground-truth references become available (synthetic mixes), compute true SI-SDR/PESQ; otherwise keep labeling it "estimate" | Low |
| `list_jobs()` reads every JSONL log (one GET per job) | The `/jobs` list and dashboard stats cost O(jobs) B2 GETs; fine at demo scale, grows linearly | Denormalize a per-job summary into a small index object (or S3 object metadata) and read only that for the list | Medium |
| DeepFilterNet model weights download on first run | First enhancement needs network to fetch DeepFilterNet3 into the cache dir; a cold offline start fails that run | Pre-bake weights into the deploy image, or add a warm-up step at boot | Low |
| Enhanced outputs are mono 48 kHz | Multi-channel source is downmixed to mono (fine for speech, lossy for music/stereo) | Add an optional per-channel enhance path if stereo output is required | Low |
| Download counter & `/metrics` not durable across restart/replicas | Counter resets on redeploy (ephemeral FS); both fragment across replicas | Back the counter with a shared store (Redis/DB); label/aggregate metrics per instance. Relocated to `repo/counter.py` and documented in RELIABILITY.md | Medium |
| Upload buffers the whole file in memory | ~3× file size RAM per upload; large files strain the server (event loop no longer blocked, but memory unbounded) | Stream to a temp file, or S3 multipart above a size threshold | Medium |
| `GET /files-by-key/detail` re-downloads the whole object to recompute metadata | Rich metadata for stored files costs a full download + in-memory hash per preview; large objects are slow/expensive and buffer in API memory | Persist `FileMetadataDetail` at upload (S3 user-metadata, mind the ~2KB cap, or a sidecar/object store) and serve it without re-downloading; add a size ceiling above which detail is skipped | Medium |
| Audio/Video metadata fields declared but never extracted | `duration_seconds`/`codec`/`bitrate` always null; real extraction needs a system dependency (ffmpeg/ffprobe or libmediainfo), not a pip-only lib | Add an audio/video extractor in `service/metadata.py`, or drop the fields from `FileMetadataDetail` | Low |
| `get_upload_activity` re-materializes `FileMetadata` for every object just to bucket dates | Wasted O(n) CPU per `/files/stats/activity` (scan is cached; materialization is not) | Aggregate from raw listing dicts like `get_upload_stats` does | Low |
| Frontend has no component/render tests; e2e only checks routing | UI states (loading/error/empty) and the real upload→delete journey are unverified | Add jsdom + @testing-library/react render tests; a fixture-driven upload e2e | Medium |
| Allowed file types hardcoded in `service/upload.py` | Reuse friction — each new app edits source to change accepted types | Make `ALLOWED_TYPES` / `MIME_EXTENSION_MAP` env-configurable | Low |
| No auth layer or placeholder | Every consumer designs auth from scratch; unclear where it plugs in | Add example middleware (API-key or JWT) + docs for the seam | Low |
| No `docker-compose.yaml` | Manual venv + dual-process startup slows first run | Add compose with `web` + `api` services and Dockerfiles | Low |
| `api-client.ts` hand-synced to FastAPI | Endpoint drift between client and server | Note an OpenAPI codegen strategy or link the spec | Low |
| No dedicated connection-status banner | Offline only surfaced reactively per failed query | Add a global connectivity banner (route + global error boundaries already exist) | Low |

## 2026-07-24 — verify

Nitpicks surfaced by the 3-lens verify funnel (goal: batch DeepFilterNet enhancement via `/jobs/new` → hear before/after → download). None block the goal; captured here so they never re-loop.

- Dashboard — the "Bytes Written" chart Y-axis tick labels are non-monotonic (read "0M, 5M, 0M, 5M, 0M" top-to-bottom) while the bars themselves render correctly → the chart's Y-axis tick formatter/domain is wrong; misleading on the landing page (shot: `.local/verify/C/r2-05-dashboard.png`)
- Dashboard — "Write Amplification" (bucket-wide `enhanced_bytes / source_bytes`) grows ~linearly with job count because each job writes a fresh `enhanced/<job_id>/` copy while `source/` stays constant, so it reads e.g. 17.64× though per-run amplification is ~1.0× for WAV inputs → a first-time user could misread it as "outputs are 17× larger than inputs" (shot: `.local/verify/C/r2-05-dashboard.png`)
- Dashboard — "Avg SNR Improvement" tile is a bucket-wide mean across all jobs (by design in `enhancement_stats.py`), not the latest/selected job → can be misread as a single-job metric (shot: `.local/verify/C/r2-05-dashboard.png`)
- `/jobs/new` (run in progress) — mid-run shows a disabled "Enhancing…" button + an aria-live status line but no spinner icon or progress bar, and nothing animates during the ~6s synchronous run → acceptable per rubric for a short op, but a determinate/animated indicator would read better (shot: `.local/verify/B/r2-05-run-inprogress.png`)
- `/upload` (after upload) — the "Continue to enhancement" CTA's accessible name is "Continue to create an enhancement job" (visible label ≠ accessible name, WCAG 2.5.3 label-in-name) → harmless to sighted users but breaks name-based AT/automation expectations (shot: `.local/verify/A/r2-06-upload-complete.png`)
- `/jobs/[jobId]` — the job detail page has before/after players + per-file downloads but no in-content link to the Library; only the sidebar reaches it → minor wayfinding gap (the goal completes on the detail page) (shot: `.local/verify/A/r2-08-job-detail.png`)
- Sidebar nav — order is Dashboard, Jobs, Library, Upload, Files, so Upload sits below the two screens that consume its output → slight mismatch with the first-run Upload→Jobs→Library mental model (shot: `.local/verify/A/01-dashboard.png`)
- `/jobs/[jobId]` — a transient success toast ("Enhanced 3 recording(s)") overlaps the first file's "Download enhanced" button at the instant of capture → cosmetic timing overlap only; the button is reachable and the toast auto-dismisses (shot: `.local/verify/C/r2-02-run1-detail.png`)

## Resolved

| Description | Resolution |
|---|---|
| Rich metadata (checksums/EXIF/PDF) unavailable for already-stored files | `GET /files-by-key/detail` recomputes `FileMetadataDetail` on demand from the object bytes; `FileMetadataPanel` mounted in the Files preview dialog behind a lazy "Detailed metadata" disclosure |
| Blocking boto3 in `async def` handlers froze the single event loop | B2 handlers are sync `def` (Starlette threadpool); upload offloads via `run_in_threadpool` |
| Full-bucket scan on every list/stats/activity request, uncached | Short-TTL cache in `repo/b2_client._list_all_objects`, invalidated on upload/delete |
| No CI — quality gates ran only when a human remembered | `.github/workflows/ci.yml` runs web + API gates on PR and push to `main` |
| SVG stored-XSS; declared MIME trusted; unused `python-magic` dep | Dropped SVG from allow-list; added magic-byte signature check; removed dead `python-magic` |
| No rate limiting → DoS + B2 cost amplification | Per-IP fixed-window limiter (`runtime/ratelimit.py`), read/write budgets |
| Counter persistence lived in the service layer (layering violation) | Moved file I/O to `repo/counter.py` behind `get/increment_download_count` |
| CORS `allow_credentials=True` with no auth + regex escape hatch | Default `allow_credentials=False`; empty origins filtered |
| No security headers on API responses | `X-Content-Type-Options: nosniff` + `Referrer-Policy: no-referrer` on every response |
| Key-addressed ops could target any bucket object | Opt-in `ALLOWED_KEY_PREFIX` confinement (off by default, preserves arbitrary-key routes) |
| Redundant triple-scan + double sort per dashboard mount | TTL cache + single-flight collapse the concurrent empty-prefix scans; dropped the repo-layer sort so `get_files` owns newest-first ordering once |
| Unguarded `int(content-length)`; public `/docs`; uncached `/health` B2 call | Content-Length parse guarded; `ENABLE_DOCS` toggle; connectivity cached ~5s |
| Upload validation sad-paths (413/415) + sanitizer untested | `tests/test_upload_validation.py` covers the rejection matrix, signature, `uploads_total` |
| FastAPI `/docs` & `/redoc` undocumented | Documented in README; `ENABLE_DOCS` toggle added |
| `NEXT_PUBLIC_API_URL` missing from `.env.example` | Added with guidance |
| `get_upload_stats()` / `list_files()` object listing capped at 1000 | Shared `_list_all_objects()` paginator follows `ContinuationToken` |
| `datetime.utcnow()` deprecated in Python 3.12+ | Replaced with `datetime.now(UTC)` |
| S3 client recreated on every API call | Cached module-level singleton via `lru_cache` |
| `record_upload()` never called | Called from `runtime/upload.py` after upload |
| Metrics counters not thread-safe | Guarded by `threading.Lock` |
| `_humanize_bytes` duplicated in Python | Extracted to `app/types/formatting.py` |
| `humanizeBytes` / `formatDate` duplicated in TypeScript | Extracted to `lib/utils.ts` (tested) |
| Custom `FileNotFoundError` shadowed the built-in | Renamed to `FileNotFoundServiceError` |
| Dropzone accepted any file type client-side | `accept` allow-list mirroring backend `ALLOWED_TYPES` (tested for drift) |
| No test harness for feature specs | pytest suite across upload, files, activity, errors, validation, rate limit, pagination |
