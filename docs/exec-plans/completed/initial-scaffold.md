# Build plan — `deepfilternet-batch-speech-enhancement`

Scaffolded from `vibe-coding-starter-kit`. Source of truth for the starter tree:
`.claude/scratch/vcsk-bde6cd6b-4040-448f-8344-c27ce9223066/`. This plan is the
contract for `sample-builder` and `sample-reviewer`.

---

## 1. Purpose

A batch **speech denoising / enhancement** sample for podcast studios, broadcast
archives, and speech-dataset curators. Noisy speech recordings (WAV/MP3, 8–48 kHz)
are ingested to B2; **DeepFilterNet** (a local deep-filtering neural network) denoises
each file, and the cleaned **48 kHz WAV** outputs are written back to B2 under an
`enhanced/` prefix alongside the originals. A per-batch **JSONL processing log**
(input key, output key, model version, timestamp, input/output SNR estimate) is
written to B2 for audit and dataset versioning. Downstream transcription / TTS /
distribution jobs read the cleaned audio directly from B2 over the S3 API.

The sample's headline B2 story is **write amplification**: a compressed-MP3 archive
produces an equal-or-larger set of *uncompressed* WAV outputs plus logs — so total
stored bytes grow with every batch. The dashboard makes that ratio the hero metric.

Runs on local OSS with **B2 credentials only — no second API key**.

---

## 2. Architecture delta from `vibe-coding-starter-kit`

The starter kit is the ceiling. Strip what this app doesn't need; keep the reusable
B2 surface; add the denoising domain.

### KEEP (as-is — starter contract, do not strip/rename/replace)
- **UI kit / design system** — `apps/web/src/components/ui/**`, tokens in
  `apps/web/src/app/globals.css`, the `/design` page + its `components/design/**`.
- **Bucket explorer (NON-NEGOTIABLE keep)** — `/files` route,
  `apps/web/src/app/files/**`, `apps/web/src/components/files/**`, and the
  `runtime/files.py` + `service/files.py` chain that lists/previews/downloads/deletes
  **any** object in the bucket. Full-bucket browse stays. (Tension note: this app is
  scoped to audio prefixes, but the bucket explorer is never removable — it stays as
  the generic B2 surface, complementing the scoped Library added below.)
- **Upload** — `/upload` route, `apps/web/src/app/upload/**`,
  `apps/web/src/components/upload/**`, `runtime/upload.py`, `service/upload.py`. This
  is how source recordings are ingested. Keep; adapt copy/accepted-types to audio.
- **Backend skeleton & invariants** — layered `types→config→repo→service→runtime`,
  structural tests, JSON logging, `/health`, `/metrics`, rate limiting, CORS/error
  middleware in `main.py`, the presigned-URL + list-cache machinery in
  `repo/b2_client.py`, `repo/b2_object.py`, `repo/counter.py`.
- **Sidebar shell** (`components/layout/app-sidebar.tsx`) and nav pattern — keep
  Dashboard / Upload / Files / Settings + Design; ADD entries (below).
- **Settings** page + `components/settings/settings-form.tsx` — keep; it is the
  in-repo exemplar for form UX (selectors + default hints).

### TRIM (remove from starter)
- **Dashboard demo internals** — `components/dashboard/{stats-cards,upload-chart,recent-uploads-table}.tsx`
  are illustrative; **rewrite** their content for denoising metrics (same files/paths,
  new meaning — keep them flowing through `queries.ts`, no bare `useEffect+fetch`).
- **Image/PDF-centric metadata** — `service/metadata.py` extracts image dims / EXIF /
  PDF info. Leave the module in place (the generic file-detail endpoint still uses it
  and it must not crash on audio — it degrades to checksum/size), but do **not**
  feature it. Audio probing (duration/sr/channels) is added in the denoiser adapter
  and surfaced by the Library, not by this module. Rewrite `docs/features/metadata-extraction.md`
  accordingly (see §5).
- No wholesale directory deletions — the starter is lean; the delta is mostly *add*.

### ADD (new for this sample)
Backend (respecting layering; external ML SDK confined to `repo/`, mirroring boto3):
- `services/api/app/types/jobs.py` — `EnhancementParams`, `FileResult`,
  `EnhancementJob`, `JobSummary` (Pydantic v2). `types/enhancement_stats.py` —
  `EnhancementStats`, `DailyBytesWritten`.
- `services/api/app/repo/denoiser.py` — **the DeepFilterNet adapter. The ONLY place
  `df` / `torch` / `soundfile` / `librosa` are imported** (external-SDK-in-repo rule).
  `get_model()` = `functools.lru_cache` over `init_df()` with **device autodetect
  (CUDA → CPU; MPS deliberately skipped — DFN's complex-valued DSP ops have
  incomplete MPS coverage; note in code + docs)**. `enhance_audio(raw_bytes, filename,
  params) -> (wav_bytes, metrics)` decodes → resamples to 48 kHz → `enhance()` →
  encodes 16-bit PCM WAV; `metrics` = input/output SNR proxy, duration, in/out bytes.
  `probe_audio(raw_bytes) -> AudioInfo` (duration/sr/channels) for the Library.
- `services/api/app/repo/job_store.py` — in-memory **live** job status registry
  (pending/processing/done/failed), confined to `repo/` like `counter.py`. The
  **durable** record is the B2 JSONL log; on restart, completed jobs are re-derived
  from B2. Document the single-replica caveat (same pattern as counter/ratelimit).
- `services/api/app/service/enhancement.py` — orchestrates a job: for each source key
  `get_object_bytes` → `denoiser.enhance_audio` → `upload_file` enhanced WAV to
  `enhanced/…` → collect `FileResult`; then compose + `upload_file` the batch JSONL to
  `jobs/<job_id>.jsonl`; update `job_store`. Bounded batch (`max_batch_files`).
  **Synchronous within the create call** for a small demo batch (simpler + robust);
  note "production would use a task queue" in `tech-debt-tracker.md`.
- `services/api/app/service/jobs.py` — `list_jobs` (list `jobs/` prefix, parse JSONL
  headers, merge live status), `get_job` (parse full JSONL), `delete_job` (delete the
  JSONL **and** the enhanced outputs it references — scoped to that job's keys only).
- `services/api/app/service/enhancement_stats.py` — compute `EnhancementStats`
  (jobs, recordings enhanced, source bytes, enhanced bytes, **write-amplification
  ratio = enhanced_bytes / source_bytes**, avg SNR improvement, jobs today) +
  daily bytes-written activity, from B2 listings of the source/enhanced/jobs prefixes.
- `services/api/app/service/library.py` — pair source recordings with their enhanced
  outputs (before/after), with presigned streaming URLs; scoped to the sample prefixes.
- `services/api/app/runtime/enhancement.py` — router:
  `POST /jobs` (create+run), `GET /jobs` (list), `GET /jobs/{job_id}` (detail),
  `DELETE /jobs/{job_id}` (delete job+outputs), `POST /jobs/{job_id}/rerun` (run verb),
  `GET /jobs/stats`, `GET /jobs/stats/activity`, `GET /library`. Register in `main.py`.
  Sync `def` handlers (blocking boto3 + torch → Starlette threadpool), same as
  `runtime/files.py`.
- Tests: extend `tests/` — structural tests still pass (df/torch confined to repo/,
  files < 300 lines); add unit tests for SNR-proxy math, JSONL round-trip, job
  delete-scoping, and a denoiser smoke test guarded to skip if the model can't init.

Frontend (all data via `lib/queries.ts` hooks; no bare `useEffect+fetch`):
- `lib/api-client.ts` + `lib/queries.ts` — add job CRUD+run, library, and
  enhancement-stats calls/hooks with cache invalidation after mutations.
- **`/` Dashboard (adapt)** — denoising metrics: stat cards (recordings enhanced,
  enhanced bytes written, **write-amplification ×**, avg SNR improvement), a
  bytes-written-over-time chart (source vs enhanced), recent-jobs table.
- **`/jobs` (NEW)** — Enhancement Jobs list + "New enhancement" button; per-row
  actions: View, **Re-run**, **Delete**. Empty/error states via existing primitives.
- **`/jobs/new` (NEW)** — the CREATE form (see §4 Form UX).
- **Job detail** (`/jobs/[jobId]`) — per-file results table (input/output keys,
  sizes, in/out SNR estimate + Δ, duration, status), **before/after `<audio>`
  players** (presigned URLs), download-enhanced buttons, link to the JSONL log.
- **`/library` (NEW — the mandatory sample-specific asset explorer)** — an "Audio
  Library" scoped to the sample's `source/` + `enhanced/` prefixes: browse recordings,
  before/after inline playback, download. This is the scoped complement to the kept
  full-bucket explorer at `/files`.
- **Sidebar** — add "Jobs" (waveform icon) and "Library" (library icon); keep
  Dashboard/Upload/Files/Settings + Design.

---

## 3. B2 surface (all S3-compatible — Standard #1 satisfied; NO b2-native)

| Operation | boto3 call | Used by |
|-----------|-----------|---------|
| List | `list_objects_v2` (paginated, cached) | dashboard stats, Library, job source-picker, bucket explorer, job listing |
| Write | `put_object` | enhanced WAV → `enhanced/…`, batch JSONL → `jobs/…`, source ingest via upload |
| Read | `get_object` | decode source audio for the denoiser; audio playback via presign |
| Head | `head_object` | object metadata |
| Delete | `delete_object` | delete a job's enhanced outputs + its JSONL (scoped); bucket-explorer delete |
| Presign | `generate_presigned_url` (GET) | browser streams/downloads audio directly from B2 |

Prefix convention (settings-configurable): `source/` (ingested originals),
`enhanced/` (cleaned WAV outputs), `jobs/` (per-batch JSONL logs). No b2-native API
anywhere; UA + env-var standards below.

**B2 standards (parent CLAUDE.md — audited by /b2-doctor):**
1. **S3 API default** — yes (boto3 S3 client only).
2. **Custom user agent on every S3 client** — `repo/b2_client.py` sets
   `user_agent_extra`; change it from the starter's `b2ai-oss-start` to
   **`deepfilternet-batch-speech-enhancement`** (per-sample UA). Single S3 client
   (lru_cache) so this covers every call.
3. **Standardized `B2_*` env vars (MANDATORY RENAME — starter deviates):**
   - `B2_KEY_ID` → **`B2_APPLICATION_KEY_ID`**
   - `B2_APPLICATION_KEY` (already standard)
   - `B2_BUCKET_NAME` (already standard)
   - `B2_ENDPOINT` → **`B2_REGION`** (derive `endpoint_url=f"https://s3.{region}.backblazeb2.com"` in `b2_client.py`)
   - `b2_public_url` → **`B2_PUBLIC_URL_BASE`** — **OPTIONAL**, never in the required set.

   Touch every reference: `config/settings.py` (field names + `model_config` env
   mapping), `repo/b2_client.py` (client construction + `_public_url`), `main.py`
   `REQUIRED_B2_SETTINGS` (**`B2_REGION` required; `B2_PUBLIC_URL_BASE` NOT required**)
   and `PLACEHOLDER_VALUES`, `scripts/doctor.mjs`, `.env.example`, `README.md`,
   `docs/SECURITY.md`. Startup validation must still fail-fast with a readable message.

---

## 4. Key features (seed README + `docs/features/*.md`)

All features are **`deployment: local`**. There is **no external API provider** and
**no Genblaze routing** (the brief lists no "Suggested stack"/Genblaze). The only
credentials are `B2_*`.

1. **Batch speech enhancement (DeepFilterNet)** — `deployment: local`; provider/model:
   **DeepFilterNet (`deepfilternet` PyPI, the `df` package), model DeepFilterNet3**,
   runs on-device; **cost per full demo run ≈ $0** (local compute, no API); env var:
   **none** (B2 only). CPU default, autodetect CUDA → CPU (MPS skipped, see §2).
2. **Enhanced outputs + processing log on B2** — cleaned 48 kHz WAV to `enhanced/`,
   per-batch JSONL audit log to `jobs/`. Demonstrates write amplification. `local`.
3. **Enhancement Jobs** — create / view / re-run / delete batch denoise jobs. `local`.
4. **Audio Library** — before/after playback of source vs enhanced, scoped to the
   sample prefixes (the added sample-specific asset explorer). `local`.
5. **Denoising dashboard** — recordings enhanced, enhanced bytes written,
   write-amplification ratio, avg SNR improvement. `local`.
6. **B2 bucket explorer + upload** — kept starter surface (full-bucket browse +
   audio ingest). `local`.

**Primary-entity lifecycle — entity: `Enhancement Job`** (one batch run over ≥1 source
recording, DEFAULT = expose every verb in the UI):
- **create** — ✅ `/jobs/new` form; submitting runs the batch.
- **read** — ✅ `/jobs` list + job detail (per-file results, before/after playback).
- **run** — ✅ the create form's "Run enhancement" submit **and** a per-job **Re-run**
  action (re-processes the same source keys; useful after a partial failure).
- **delete** — ✅ per-job delete; removes the JSONL log **and** that job's enhanced
  outputs (scoped to the job's own keys — never a broad prefix wipe).
- **edit** — ❌ **OMITTED with justification**: an enhancement job is an *immutable
  record* of a processing run (source keys + model version + timestamp + outputs).
  Editing a completed batch has no coherent meaning; to change parameters the user
  creates a new job or re-runs. → record in `omitted_ui_verbs`.

**Form UX conventions (create form `/jobs/new`; exemplar: `settings-form.tsx`):**
- (a) **Finite-set fields use a selector, never free text:**
  - `attenuation_limit_db` → **`Select`/`RadioGroup`**: `None (full suppression)` /
    `40 dB` / `30 dB` / `20 dB` / `12 dB` (maps to DFN `atten_lim`).
  - `post_filter` → **`Switch`** (on/off).
- (b) **CREATE-form safe defaults as placeholder / `FormDescription` guidance only
  (no autofill button):**
  - `attenuation_limit_db` default **`None (full suppression)`** — "removes the most
    noise; lower values keep more of the original ambience."
  - `post_filter` default **off** — "sharper speech, slight risk of artifacts."
  - `batch_name` — free text (open-ended, no finite set → text input is correct);
    placeholder **`e.g. podcast-ep-2026-07`**.
  - `source_keys` — multi-select list/checkbox picker over recordings already in B2
    (dynamic B2 contents, not a small finite enum → a selection UI, not free text;
    FormDescription: "pick one or more recordings ingested via Upload").
- No edit form (edit omitted).

---

## 5. Doc transforms

- **Rewrite** `docs/features/dashboard.md` → denoising metrics (write amplification).
- **Rewrite** `docs/features/metadata-extraction.md` → audio metadata (duration,
  sample rate, channels) as surfaced by the Library/denoiser; note image/PDF
  extraction is retained only for the generic bucket-explorer detail view.
- **Keep + light-adapt** `docs/features/file-upload.md` (audio ingest wording) and
  `docs/features/file-browser.md` (bucket explorer unchanged).
- **NEW** `docs/features/speech-enhancement.md` (the DeepFilterNet denoise feature,
  device autodetect, SNR-proxy caveat, 48 kHz output).
- **NEW** `docs/features/enhancement-jobs.md` (job lifecycle: create/read/run/delete,
  edit-omitted rationale, JSONL log schema).
- **NEW** `docs/features/audio-library.md` (scoped before/after explorer).
- Update `README.md` (purpose, features, Standard #3 env setup, "get sample noisy
  speech" pointer — no bundled binaries), `ARCHITECTURE.md` (new modules + prefixes),
  `docs/app-workflows.md` (ingest → enhance → download journey),
  `docs/exec-plans/tech-debt-tracker.md` (sync processing → future task queue; SNR is
  a reference-free estimate). Move THIS plan to
  `docs/exec-plans/completed/initial-scaffold.md` on PASS (Phase 5).

---

## 6. Rename table

| Kind | From | To |
|------|------|----|
| kebab slug | `vibe-coding-starter-kit` | `deepfilternet-batch-speech-enhancement` |
| npm workspace pkg | `@vibe-coding-starter-kit/web` | `@deepfilternet-batch-speech-enhancement/web` |
| root package name | `vibe-coding-starter-kit` | `deepfilternet-batch-speech-enhancement` |
| APP_NAME (Title) | `OSS Starter Kit` | `DeepFilterNet Speech Enhancement` |
| APP_DESCRIPTION | `File management dashboard powered by Backblaze B2` | `Batch speech denoising & enhancement powered by DeepFilterNet, stored on Backblaze B2` |
| FastAPI title | `OSS Starter Kit API` | `DeepFilterNet Speech Enhancement API` |
| S3 `user_agent_extra` | `b2ai-oss-start` | `deepfilternet-batch-speech-enhancement` |
| UTM `utm_content` | `b2ai-oss-start` | `b2ai-deepfilternet` (README/sidebar/README links) |
| CI workflow name / image tags / railway slug | `vibe-coding-starter-kit` | `deepfilternet-batch-speech-enhancement` |
| Env vars | `B2_KEY_ID` / `B2_ENDPOINT` / `b2_public_url` | `B2_APPLICATION_KEY_ID` / `B2_REGION` / `B2_PUBLIC_URL_BASE` |

Also grep for any residual `vibe-coding-starter-kit`, `oss-starter-kit`, "Starter Kit",
"OSS Starter" strings (incl. `apps/web/src/components/layout/header.tsx` branding and
`pnpm --filter @vibe-coding-starter-kit/web …` scripts in root `package.json`).

---

## 7. Build/verify risks (DeepFilterNet — READ before installing)

These are false-green traps (boots + tests pass, marquee ML fails on a clean clone):
- **PIN the ML stack.** `deepfilternet` (import `df`) pulls `torch`/`torchaudio`.
  Choose a working pin window and record it in `requirements.txt`
  (e.g. `deepfilternet>=0.5.6,<0.6`, a compatible `torch`/`torchaudio`, `numpy<2`).
  Unbounded ML deps are a known clean-install failure — verify the exact pins by
  actually installing into a fresh venv.
- **Audio decode without fragile system ffmpeg.** Decode WAV/MP3/FLAC via
  `soundfile>=0.12.1` (bundled libsndfile ≥1.1 reads MP3) and resample to 48 kHz with
  `librosa`/`soxr`; encode 16-bit PCM WAV with `soundfile`. Avoid relying on
  torchaudio's ffmpeg backend (Homebrew ffmpeg is slim; version-fragile). Declare
  every decode dep explicitly (undeclared transitive deps are a clean-install trap).
- **Device.** Default CPU; autodetect CUDA → CPU. **Skip MPS** (DFN complex-DSP ops
  incomplete on MPS) — document the CUDA→CPU fallback.
- **SNR is reference-free.** No clean reference exists, so report an **estimate**:
  input noise-floor from the low-energy percentile of frame RMS, speech level from the
  high percentile, `snr ≈ 20·log10(speech_rms/noise_rms)`; `Δ = out − in`. Label
  "estimate" in the JSONL log and UI so the field is honest.
- **END-TO-END verify during build** (not just import): in a fresh venv, run one real
  denoise on a short synthesized noisy WAV and assert (i) it imports
  `from df.enhance import init_df, enhance`, (ii) it produces a 48 kHz WAV, (iii) the
  output WAV is larger than a compressed input (write-amplification claim holds).
- Keep every file < 300 lines (split like `b2_client.py`/`b2_object.py` if needed);
  keep `df`/`torch`/`soundfile`/`librosa` imports **only** in `repo/denoiser.py` so
  structural tests + the layering invariant stay green.

---

## 8. Out of scope for this step
No git remote push, no binary assets (screenshots/logos/audio), no touching sibling
samples in `../`. Those belong to later pipeline steps.
