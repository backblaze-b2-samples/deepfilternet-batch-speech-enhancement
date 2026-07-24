<!-- last_verified: 2026-07-24 -->
# App Workflows

User journeys inside the application.

## Ingest → Enhance → Download (the main journey)

1. **Upload** — user navigates to `/upload` and drops noisy speech recordings
   (WAV/MP3/FLAC/OGG). Files are validated and stored to B2 under the `source/` prefix.
   Once at least one file uploads successfully, a **Continue to enhancement** CTA links
   straight to `/jobs/new` so the happy path auto-chains.
2. **Create a job** — user navigates to `/jobs/new`, names the batch, picks one or more
   source recordings (multi-select), and chooses denoising options (attenuation limit
   selector; post-filter switch). Submitting runs DeepFilterNet over every selected file.
3. **Results** — the app redirects to the job detail page (`/jobs/[jobId]`), showing a
   per-file results table (duration, in/out SNR estimate + Δ, sizes, status) and
   before/after `<audio>` players streaming from B2.
4. **Download / hand off** — user downloads the enhanced 48 kHz WAV or the JSONL log.
   Downstream jobs (transcription/TTS/distribution) read the cleaned audio directly from
   B2 over the S3 API.
- See: [Speech Enhancement](features/speech-enhancement.md), [Enhancement Jobs](features/enhancement-jobs.md)

## Manage Enhancement Jobs

- User navigates to `/jobs` and sees every batch (files, source→enhanced bytes, avg ΔSNR, status)
- **View** opens the detail page; **Re-run** re-processes the same source keys + params as a
  new job (useful after a partial failure); **Delete** removes the JSONL log and that job's
  enhanced outputs (scoped to the job's own keys — never a broad prefix wipe)
- Empty state prompts creating the first job
- See: [Enhancement Jobs](features/enhancement-jobs.md)

## Audio Library (before/after)

- User navigates to `/library`
- Each source recording is paired with its most recent enhanced output; both play inline
- Scoped to the `source/` and `enhanced/` prefixes (the full bucket lives at `/files`)
- See: [Audio Library](features/audio-library.md)

## View Dashboard

- User navigates to `/` (home)
- Stat cards: recordings enhanced, enhanced bytes written, **write-amplification ratio**,
  avg SNR improvement
- Bytes-written chart: source vs enhanced MB over the last 7 days
- Recent jobs table
- See: [Dashboard](features/dashboard.md)

## Browse the whole bucket

- User navigates to `/files` (the retained starter File Explorer)
- Tree view of every object in the bucket, with preview, download, delete
- See: [File Browser](features/file-browser.md)
