<!-- last_verified: 2026-07-24 -->
# Feature: Enhancement Jobs

## Purpose
Create, view, re-run, and delete batch denoise runs over source recordings. An
**Enhancement Job** is the primary entity — one batch run over ≥1 recording.
`deployment: local`.

## Used By
- UI: `/jobs` (list), `/jobs/new` (create form), `/jobs/[jobId]` (detail)
- API: `POST /jobs`, `GET /jobs`, `GET /jobs/{job_id}`, `DELETE /jobs/{job_id}`, `POST /jobs/{job_id}/rerun`

## Core Functions
- `services/api/app/service/enhancement.py` — `run_job()` (orchestrates the batch synchronously)
- `services/api/app/service/jobs.py` — `list_jobs()`, `get_job()`, `delete_job()`, `compose_job_jsonl()`, `parse_job_jsonl()`, `summarize_job()`
- `services/api/app/repo/job_store.py` — in-memory live status registry
- `apps/web/src/components/jobs/*` — list, create form, detail, status badge
- `apps/web/src/lib/queries.ts` — `useJobs`, `useJob`, `useCreateJob`, `useRerunJob`, `useDeleteJob`

## Canonical Files
- Orchestration: `services/api/app/service/enhancement.py`
- JSONL (de)serialization + read/delete: `services/api/app/service/jobs.py`

## Inputs
- `CreateJobRequest`: `batch_name: str`, `source_keys: list[str]` (≥1), `params: EnhancementParams`

## Outputs
- `EnhancementJob` (full detail incl. per-file `FileResult[]`) from create/get/rerun
- `JobSummary[]` from list
- Side effects: enhanced WAVs written to `enhanced/<job_id>/`; JSONL log written to `jobs/<job_id>.jsonl`

## JSONL log schema (`jobs/<job_id>.jsonl`) — the durable job record
- Line 1 — header: `{"type":"job","job_id","batch_name","status","created_at","model_version","device","params":{…},"source_keys":[…],"log_key"}`
- Following lines — one per file: `{"type":"result","input_key","output_key","input_bytes","output_bytes","duration_seconds","sample_rate_out","input_snr_db","output_snr_db","snr_delta_db","status","error"}`

## Lifecycle (exposed verbs)
- **create** — `/jobs/new` form; submit runs the batch synchronously (small demo batches)
- **read** — `/jobs` list + detail (per-file results, before/after playback)
- **run** — the create submit, plus per-job **Re-run** (re-processes the same source keys + params as a **new** job — jobs are immutable records)
- **delete** — removes the JSONL log **and** the job's enhanced outputs, scoped to the exact keys the JSONL recorded (never a broad prefix wipe); source recordings are kept
- **edit** — OMITTED with justification (`omitted_ui_verbs`): a job is an immutable record of one processing run; editing a completed batch has no coherent meaning — to change parameters, create a new job or re-run

## Flow
- `run_job()` bounds the batch to `MAX_BATCH_FILES`, validates each source key, then for each: downloads bytes → `denoiser.enhance_audio` → uploads the WAV to `enhanced/<job_id>/` → records a `FileResult`
- Composes the JSONL log and uploads it to `jobs/<job_id>.jsonl`; updates the live status registry
- `list_jobs()` scans the `jobs/` prefix and parses each log (one GET per job — fine at demo scale); `get_job()` parses one log; live status is merged when a job is still processing in-process
- On restart the in-memory status is empty; completed jobs are re-derived from the B2 JSONL logs

## Edge Cases
- Empty `source_keys` → 400 (Pydantic min_length)
- Invalid/traversal source key → 400
- Missing job → 404; invalid job id → 400
- One file fails to decode/enhance → recorded as `failed`; the rest of the batch still completes (job status `done` if any succeeded, else `failed`)

## UX States
- List: loading skeletons / inline error+retry / empty ("No enhancement jobs yet") / populated table with row actions
- Create: source picker loading/empty(→Upload)/error states; submit shows an "Enhancing…" busy state
- Detail: loading / error+retry / results table + before/after players; delete confirm dialog

## Verification
- Test files: `services/api/tests/test_jobs_jsonl.py` (round-trip + summary), `services/api/tests/test_job_delete_scoping.py` (delete is scoped to recorded keys)
- Required cases: JSONL round-trip fidelity, summary aggregation, delete deletes exactly the recorded outputs + log, missing/invalid job ids
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm build && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all tests green, ruff clean, frontend builds

## Related Docs
- [Speech Enhancement](speech-enhancement.md) · [Audio Library](audio-library.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)
