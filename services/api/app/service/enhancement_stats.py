"""Denoising dashboard aggregations, computed from B2 listings + job logs.

The hero metric is write amplification (enhanced_bytes / source_bytes): a batch of
compressed source recordings produces an equal-or-larger set of uncompressed
48 kHz WAV outputs plus JSONL logs, so total stored bytes grow with every run.
"""

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from app.config import settings
from app.repo import list_files
from app.service.jobs import list_jobs
from app.types import DailyBytesWritten, EnhancementStats
from app.types.formatting import humanize_bytes


def _sum_bytes(prefix: str) -> tuple[int, int]:
    """Return (total_bytes, object_count) under a prefix."""
    files = list_files(prefix=prefix)
    return sum(f.size_bytes for f in files), len(files)


def get_enhancement_stats() -> EnhancementStats:
    source_bytes, _ = _sum_bytes(settings.source_prefix)
    enhanced_bytes, enhanced_count = _sum_bytes(settings.enhanced_prefix)

    summaries = list_jobs()
    today = datetime.now(UTC).date()
    jobs_today = sum(1 for s in summaries if s.created_at.date() == today)

    deltas = [
        s.avg_snr_improvement_db
        for s in summaries
        if s.avg_snr_improvement_db is not None
    ]
    avg_snr = round(sum(deltas) / len(deltas), 1) if deltas else None

    ratio = round(enhanced_bytes / source_bytes, 2) if source_bytes else 0.0

    return EnhancementStats(
        total_jobs=len(summaries),
        recordings_enhanced=enhanced_count,
        source_bytes=source_bytes,
        source_bytes_human=humanize_bytes(source_bytes),
        enhanced_bytes=enhanced_bytes,
        enhanced_bytes_human=humanize_bytes(enhanced_bytes),
        write_amplification_ratio=ratio,
        avg_snr_improvement_db=avg_snr,
        jobs_today=jobs_today,
    )


def get_bytes_activity(days: int = 7) -> list[DailyBytesWritten]:
    """Daily source vs enhanced bytes written over the last N days."""
    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days - 1)

    source_by_day: dict[str, int] = defaultdict(int)
    enhanced_by_day: dict[str, int] = defaultdict(int)

    for f in list_files(prefix=settings.source_prefix):
        d = f.uploaded_at.date()
        if d >= cutoff:
            source_by_day[d.isoformat()] += f.size_bytes
    for f in list_files(prefix=settings.enhanced_prefix):
        d = f.uploaded_at.date()
        if d >= cutoff:
            enhanced_by_day[d.isoformat()] += f.size_bytes

    out: list[DailyBytesWritten] = []
    for i in range(days):
        day = (cutoff + timedelta(days=i)).isoformat()
        out.append(
            DailyBytesWritten(
                date=day,
                source_bytes=source_by_day.get(day, 0),
                enhanced_bytes=enhanced_by_day.get(day, 0),
            )
        )
    return out
