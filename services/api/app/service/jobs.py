"""Job read/list/delete + JSONL (de)serialization.

The durable record of a batch is its JSONL log in B2 at `jobs/<job_id>.jsonl`:
- line 1: a `{"type":"job", ...}` header (job metadata + params + source keys)
- one `{"type":"result", ...}` line per file processed

`compose_job_jsonl` / `parse_job_jsonl` are pure functions (no B2) so they can be
unit-tested for round-trip fidelity. list/get/delete use the repo layer.
"""

import json
import logging
import re

from app.config import settings
from app.repo import delete_file, get_object_bytes, job_store, list_files
from app.types import (
    EnhancementJob,
    EnhancementParams,
    FileResult,
    JobSummary,
)

logger = logging.getLogger(__name__)

_JOB_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")


class JobNotFoundError(Exception):
    def __init__(self, detail: str = "Job not found"):
        self.detail = detail
        super().__init__(detail)


class JobKeyError(Exception):
    def __init__(self, detail: str = "Invalid job id"):
        self.detail = detail
        super().__init__(detail)


def validate_job_id(job_id: str) -> None:
    if not job_id or not _JOB_ID_RE.match(job_id):
        raise JobKeyError()


def job_log_key(job_id: str) -> str:
    return f"{settings.jobs_prefix}{job_id}.jsonl"


# --- JSONL (de)serialization (pure) ---


def compose_job_jsonl(job: EnhancementJob) -> str:
    header = {
        "type": "job",
        "job_id": job.job_id,
        "batch_name": job.batch_name,
        "status": job.status,
        "created_at": job.created_at.isoformat(),
        "model_version": job.model_version,
        "device": job.device,
        "params": job.params.model_dump(),
        "source_keys": job.source_keys,
        "log_key": job.log_key,
    }
    lines = [json.dumps(header)]
    for r in job.results:
        record = r.model_dump()
        record["type"] = "result"
        lines.append(json.dumps(record))
    return "\n".join(lines) + "\n"


def parse_job_jsonl(text: str) -> EnhancementJob:
    records = [json.loads(line) for line in text.splitlines() if line.strip()]
    header = next((r for r in records if r.get("type") == "job"), None)
    if header is None:
        raise ValueError("JSONL log missing job header")
    results = [
        FileResult(**{k: v for k, v in r.items() if k != "type"})
        for r in records
        if r.get("type") == "result"
    ]
    return EnhancementJob(
        job_id=header["job_id"],
        batch_name=header["batch_name"],
        status=header.get("status", "done"),
        created_at=header["created_at"],
        model_version=header.get("model_version", "unknown"),
        device=header.get("device", "cpu"),
        params=EnhancementParams(**header.get("params", {})),
        source_keys=header.get("source_keys", []),
        results=results,
        log_key=header.get("log_key"),
    )


def summarize_job(job: EnhancementJob) -> JobSummary:
    done = [r for r in job.results if r.status == "done"]
    failed = [r for r in job.results if r.status == "failed"]
    source_bytes = sum(r.input_bytes for r in job.results)
    enhanced_bytes = sum(r.output_bytes for r in done)
    deltas = [r.snr_delta_db for r in done if r.snr_delta_db is not None]
    avg = round(sum(deltas) / len(deltas), 1) if deltas else None
    return JobSummary(
        job_id=job.job_id,
        batch_name=job.batch_name,
        status=job.status,
        created_at=job.created_at,
        model_version=job.model_version,
        file_count=len(job.results),
        succeeded=len(done),
        failed=len(failed),
        source_bytes=source_bytes,
        enhanced_bytes=enhanced_bytes,
        avg_snr_improvement_db=avg,
        log_key=job.log_key,
    )


# --- B2-backed operations ---


def _load_job(job_id: str) -> EnhancementJob:
    validate_job_id(job_id)
    try:
        raw = get_object_bytes(job_log_key(job_id))
    except RuntimeError as e:
        raise JobNotFoundError() from e
    job = parse_job_jsonl(raw.decode("utf-8"))
    # Merge live status if the job is still processing in THIS process.
    live = job_store.get_status(job_id)
    if live is not None:
        job.status = live
    return job


def get_job(job_id: str) -> EnhancementJob:
    return _load_job(job_id)


def list_jobs() -> list[JobSummary]:
    """List every job by scanning the `jobs/` prefix and parsing each JSONL.

    Reads each log object (one GET per job). Fine at demo scale; a denormalized
    index would avoid the per-job read — see the tech-debt tracker.
    """
    summaries: list[JobSummary] = []
    for meta in list_files(prefix=settings.jobs_prefix):
        if not meta.key.endswith(".jsonl"):
            continue
        try:
            raw = get_object_bytes(meta.key)
            job = parse_job_jsonl(raw.decode("utf-8"))
        except (RuntimeError, ValueError) as e:
            logger.warning("Skipping unreadable job log %s: %s", meta.key, e)
            continue
        live = job_store.get_status(job.job_id)
        if live is not None:
            job.status = live
        summaries.append(summarize_job(job))
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


def delete_job(job_id: str) -> None:
    """Delete a job's JSONL log AND the enhanced outputs it recorded.

    Scoped strictly to the output keys this job wrote (from its JSONL) — never a
    broad prefix wipe, so a shared bucket / other jobs are never touched.
    """
    job = _load_job(job_id)
    for r in job.results:
        if r.output_key:
            try:
                delete_file(r.output_key)
            except RuntimeError as e:
                logger.warning("Failed to delete output %s: %s", r.output_key, e)
    delete_file(job_log_key(job_id))
    job_store.remove(job_id)
