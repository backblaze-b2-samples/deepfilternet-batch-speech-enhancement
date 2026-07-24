<!-- last_verified: 2026-07-24 -->
# Feature: Audio Library

## Purpose
Browse source recordings paired with their enhanced outputs, with inline before/after
playback — the scoped, sample-specific asset explorer. `deployment: local`.

## Used By
- UI: `/library` page
- API: `GET /library` (pairing) + `GET /files-by-key/preview?key=…` (presigned streaming URLs)

## Core Functions
- `services/api/app/service/library.py` — `get_library()` (pairs `source/` with newest `enhanced/` per stem)
- `apps/web/src/components/library/library-list.tsx` — before/after cards with players + download
- `apps/web/src/components/audio/audio-player.tsx` — streams an object via a presigned URL
- `apps/web/src/lib/queries.ts` — `useLibrary`, `usePreviewUrl`

## Canonical Files
- Pairing logic: `services/api/app/service/library.py`

## Inputs
- None (loads automatically). Scoped to `SOURCE_PREFIX` + `ENHANCED_PREFIX`.

## Outputs
- `LibraryItem[]`: `name`, `source_key`, `source_bytes`, `source_size_human`, `uploaded_at`,
  `enhanced_key`, `enhanced_bytes`, `enhanced_size_human`, `enhanced_at`

## Flow
- `get_library()` lists both prefixes; for each source recording it attaches the most recent
  enhanced output that shares its base stem (so a re-run's newer output supersedes an older one)
- The UI renders a before/after card per recording; each `<audio>` fetches a presigned URL
  (via `/files-by-key/preview`) and streams the bytes straight from B2
- Download buttons open a presigned download URL

## Edge Cases
- Source with no enhanced output yet → "Source only" badge, enhanced player shows "Not available yet"
- Non-audio object accidentally under `source/` → still listed (the picker in `/jobs/new` filters to audio)
- Presigned URL fetch fails → the player shows "Playback link unavailable"

## UX States
- Loading skeletons / inline error+retry / empty ("No recordings yet" → Upload) / populated before/after cards

## Verification
- Manual: upload a recording, run a job, open `/library`, confirm both players play and downloads work
- Full verify command: `pnpm lint && pnpm build && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: build green; library lists source recordings and pairs enhanced outputs

## Related Docs
- [Enhancement Jobs](enhancement-jobs.md) · [File Browser](file-browser.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)
