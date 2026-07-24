"""Orchestrate a batch enhancement job.

For each source key: download bytes -> DeepFilterNet enhance -> upload the cleaned
48 kHz WAV under `enhanced/<job_id>/` -> collect a FileResult. Then compose the
batch JSONL log and upload it to `jobs/<job_id>.jsonl`, and record live status.

Processing is SYNCHRONOUS within the create call. That's deliberate for a small
demo batch (simpler + robust — the client gets the finished job back in one
response). A production system would enqueue the batch on a task queue; tracked
in docs/exec-plans/tech-debt-tracker.md.
"""

import logging
from datetime import UTC, datetime
from uuid import uuid4

from app.config import settings
from app.repo import get_object_bytes, job_store, upload_file
from app.repo.denoiser import enhance_audio, model_version, select_device
from app.service.jobs import compose_job_jsonl, job_log_key
from app.types import CreateJobRequest, EnhancementJob, EnhancementParams, FileResult

logger = logging.getLogger(__name__)


def _new_job_id() -> str:
    """Human-sortable, filesystem-safe job id (validate_job_id-compatible)."""
    return f"{datetime.now(UTC):%Y%m%d-%H%M%S}-{uuid4().hex[:6]}"


def _basename(key: str) -> str:
    return key.rsplit("/", 1)[-1]


def _output_key(job_id: str, source_key: str) -> str:
    """Job-scoped output key so delete never touches another job's outputs."""
    stem = _basename(source_key).rsplit(".", 1)[0] or "recording"
    return f"{settings.enhanced_prefix}{job_id}/{stem}.wav"


def _enhance_one(job_id: str, key: str, params: EnhancementParams) -> FileResult:
    """Process a single source recording, never raising — failures are captured."""
    raw = b""
    try:
        raw = get_object_bytes(key)
        if len(raw) > settings.max_audio_bytes:
            return FileResult(
                input_key=key,
                input_bytes=len(raw),
                status="failed",
                error="File exceeds the maximum audio size",
            )
        wav_bytes, metrics = enhance_audio(raw, _basename(key), params)
        out_key = _output_key(job_id, key)
        upload_file(wav_bytes, out_key, "audio/wav")
        return FileResult(input_key=key, output_key=out_key, status="done", **metrics)
    except Exception as e:  # one bad file must not sink the whole batch
        logger.warning("Enhancement failed for %s: %s", key, e)
        return FileResult(
            input_key=key,
            input_bytes=len(raw),
            status="failed",
            error=str(e),
        )


def run_job(req: CreateJobRequest) -> EnhancementJob:
    """Create and synchronously run a batch enhancement job."""
    keys = req.source_keys[: settings.max_batch_files]
    for key in keys:
        validate_job_source_key(key)

    job_id = _new_job_id()
    log_key = job_log_key(job_id)

    job = EnhancementJob(
        job_id=job_id,
        batch_name=req.batch_name,
        status="processing",
        created_at=datetime.now(UTC),
        model_version=model_version(),
        device=select_device(),
        params=req.params,
        source_keys=keys,
        log_key=log_key,
    )
    job_store.set_status(job_id, "processing")
    logger.info("Job %s started: %d file(s)", job_id, len(keys))

    results = [_enhance_one(job_id, key, req.params) for key in keys]
    job.results = results
    job.status = "done" if any(r.status == "done" for r in results) else "failed"

    # Durable record: the batch JSONL log.
    upload_file(
        compose_job_jsonl(job).encode("utf-8"), log_key, "application/x-ndjson"
    )
    job_store.set_status(job_id, job.status)
    logger.info(
        "Job %s finished: status=%s done=%d failed=%d",
        job_id,
        job.status,
        sum(1 for r in results if r.status == "done"),
        sum(1 for r in results if r.status == "failed"),
    )
    return job


def validate_job_source_key(key: str) -> None:
    """Reject empty/traversal keys before reading them from B2."""
    from app.service.files import FileKeyError, validate_key

    try:
        validate_key(key)
    except FileKeyError as e:
        raise ValueError(f"Invalid source key: {key}") from e


__all__ = ["run_job"]
