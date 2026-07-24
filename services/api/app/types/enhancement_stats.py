"""Pydantic models for the denoising dashboard metrics."""

from pydantic import BaseModel


class EnhancementStats(BaseModel):
    total_jobs: int
    recordings_enhanced: int
    source_bytes: int
    source_bytes_human: str
    enhanced_bytes: int
    enhanced_bytes_human: str
    # The headline B2 story: enhanced_bytes / source_bytes. Uncompressed 48 kHz
    # WAV outputs (+ JSONL logs) mean total stored bytes grow with every batch.
    write_amplification_ratio: float
    avg_snr_improvement_db: float | None
    jobs_today: int


class DailyBytesWritten(BaseModel):
    date: str
    source_bytes: int
    enhanced_bytes: int
