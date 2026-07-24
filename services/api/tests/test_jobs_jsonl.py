"""JSONL round-trip + summary tests for the enhancement job service."""

from datetime import UTC, datetime

import pytest

from app.service.jobs import compose_job_jsonl, parse_job_jsonl, summarize_job
from app.types import EnhancementJob, EnhancementParams, FileResult


def _sample_job() -> EnhancementJob:
    return EnhancementJob(
        job_id="20260724-120000-abc123",
        batch_name="podcast-ep-1",
        status="done",
        created_at=datetime(2026, 7, 24, 12, 0, 0, tzinfo=UTC),
        model_version="DeepFilterNet3 (deepfilternet 0.5.x)",
        device="cpu",
        params=EnhancementParams(attenuation_limit_db=20, post_filter=True),
        source_keys=["source/a.wav", "source/b.mp3"],
        log_key="jobs/20260724-120000-abc123.jsonl",
        results=[
            FileResult(
                input_key="source/a.wav",
                output_key="enhanced/20260724-120000-abc123/a.wav",
                input_bytes=1000,
                output_bytes=3000,
                duration_seconds=2.0,
                sample_rate_out=48000,
                input_snr_db=10.0,
                output_snr_db=18.0,
                snr_delta_db=8.0,
                status="done",
            ),
            FileResult(
                input_key="source/b.mp3",
                input_bytes=500,
                status="failed",
                error="Could not decode audio",
            ),
        ],
    )


def test_jsonl_round_trip():
    job = _sample_job()
    text = compose_job_jsonl(job)
    # Header + 2 result lines + trailing newline.
    assert text.count("\n") == 3

    parsed = parse_job_jsonl(text)
    assert parsed.job_id == job.job_id
    assert parsed.batch_name == job.batch_name
    assert parsed.created_at == job.created_at
    assert parsed.params.attenuation_limit_db == 20
    assert parsed.params.post_filter is True
    assert parsed.source_keys == job.source_keys
    assert len(parsed.results) == 2
    assert parsed.results[0].output_key == "enhanced/20260724-120000-abc123/a.wav"
    assert parsed.results[0].snr_delta_db == 8.0
    assert parsed.results[1].status == "failed"


def test_parse_missing_header_raises():
    with pytest.raises(ValueError):
        parse_job_jsonl('{"type":"result","input_key":"x","input_bytes":1,"status":"done"}\n')


def test_summarize_job():
    summary = summarize_job(_sample_job())
    assert summary.file_count == 2
    assert summary.succeeded == 1
    assert summary.failed == 1
    assert summary.source_bytes == 1500  # 1000 + 500
    assert summary.enhanced_bytes == 3000  # only the done file
    assert summary.avg_snr_improvement_db == 8.0
