<!-- last_verified: 2026-07-24 -->
# Feature: Dashboard

## Purpose
At-a-glance denoising metrics, with **write amplification** as the hero metric.
`deployment: local`.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /jobs/stats`, `GET /jobs/stats/activity`, `GET /jobs`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 4 stat cards (recordings enhanced, enhanced bytes written, write-amplification ×, avg SNR improvement)
- `apps/web/src/components/dashboard/upload-chart.tsx` — bytes-written bar chart (source vs enhanced MB/day)
- `apps/web/src/components/dashboard/recent-uploads-table.tsx` — recent jobs table
- `services/api/app/service/enhancement_stats.py` — `get_enhancement_stats()`, `get_bytes_activity()`
- `apps/web/src/lib/queries.ts` — `useEnhancementStats`, `useBytesActivity`, `useJobs`

## Canonical Files
- Stats logic: `services/api/app/service/enhancement_stats.py`
- Stat cards: `apps/web/src/components/dashboard/stats-cards.tsx`

## Inputs
- None (loads automatically). Computed from B2 listings of `source/`, `enhanced/`, `jobs/`.

## Outputs
- `GET /jobs/stats` → `EnhancementStats` (total_jobs, recordings_enhanced, source_bytes(+human),
  enhanced_bytes(+human), **write_amplification_ratio = enhanced_bytes / source_bytes**,
  avg_snr_improvement_db, jobs_today)
- `GET /jobs/stats/activity?days=7` → `DailyBytesWritten[]` (source_bytes, enhanced_bytes per day)
- `GET /jobs` (for the recent-jobs table) → `JobSummary[]`

## Flow
- Header actions: **Upload recordings** (→ `/upload`, secondary) and **New enhancement**
  (→ `/jobs/new`, primary) give a fresh user an entry point to the first step (upload)
  alongside job creation
- Page loads → parallel calls for stats, bytes-activity, and recent jobs
- Stat cards show the four denoising metrics; the ratio is the write-amplification hero number
- The bar chart plots source vs enhanced MB written per day (last 7 days)
- The recent-jobs table lists the latest batches with files, avg ΔSNR, and status

## Edge Cases
- API unavailable → inline error states with retry (never a false zero)
- No jobs yet → empty chart + empty recent-jobs table; ratio shows "—"
- Large object counts → listings paginate via `ContinuationToken` (repo layer, cached)

## UX States
- Loading: skeletons for cards, chart, table
- Empty: "No bytes written yet" / "No enhancement jobs yet"
- Loaded: populated cards, chart, table

## Verification
- Test files: covered indirectly by `services/api/tests/test_jobs_jsonl.py` (summary math) and the enhancement-stats service
- Required cases: ratio computed from source vs enhanced bytes; jobs_today counts today's logs
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm build && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: build green, tests pass

## Related Docs
- [Enhancement Jobs](enhancement-jobs.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md) · [App Workflows](../app-workflows.md)
