"""Enhancement Jobs + Library + denoising stats routes.

Handlers are sync `def` (not async) for the same reason as runtime/files.py: the
whole call chain is blocking (boto3 + torch), and Starlette runs sync handlers in
its threadpool, so a long batch denoise doesn't stall the event loop.

Route ordering matters: the static `/jobs/stats*` paths are declared BEFORE the
dynamic `/jobs/{job_id}` route so "stats" is never captured as a job id.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.service.enhancement import run_job
from app.service.enhancement_stats import get_bytes_activity, get_enhancement_stats
from app.service.jobs import (
    JobKeyError,
    JobNotFoundError,
    delete_job,
    get_job,
    list_jobs,
)
from app.service.library import get_library
from app.types import (
    CreateJobRequest,
    DailyBytesWritten,
    EnhancementJob,
    EnhancementStats,
    JobSummary,
    LibraryItem,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: like the file routes, these are intentionally UNAUTHENTICATED and
# bucket-wide (single-tenant demo — see docs/SECURITY.md). A multi-tenant clone
# must add auth AND scope job/source/enhanced prefixes per user.


@router.post("/jobs", response_model=EnhancementJob)
def create_job_endpoint(req: CreateJobRequest):
    """Create and synchronously run a batch enhancement job."""
    try:
        return run_job(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    except RuntimeError:
        raise HTTPException(
            status_code=502, detail="Storage error while running the job"
        ) from None


@router.get("/jobs", response_model=list[JobSummary])
def list_jobs_endpoint():
    return list_jobs()


@router.get("/jobs/stats", response_model=EnhancementStats)
def job_stats_endpoint():
    return get_enhancement_stats()


@router.get("/jobs/stats/activity", response_model=list[DailyBytesWritten])
def job_activity_endpoint(days: int = 7):
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 90")
    return get_bytes_activity(days=days)


@router.get("/library", response_model=list[LibraryItem])
def library_endpoint():
    return get_library()


@router.get("/jobs/{job_id}", response_model=EnhancementJob)
def get_job_endpoint(job_id: str):
    try:
        return get_job(job_id)
    except JobKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.delete("/jobs/{job_id}")
def delete_job_endpoint(job_id: str):
    try:
        delete_job(job_id)
    except JobKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    logger.info("Job deleted: %s", job_id)
    return {"deleted": True, "job_id": job_id}


@router.post("/jobs/{job_id}/rerun", response_model=EnhancementJob)
def rerun_job_endpoint(job_id: str):
    """Re-process the same source keys + params as an existing job, as a NEW job.

    A job is an immutable record of one run, so re-run creates a fresh job (new
    id + log) from the referenced job's inputs rather than mutating it. Useful
    after a partial failure.
    """
    try:
        existing = get_job(job_id)
    except JobKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None

    req = CreateJobRequest(
        batch_name=f"{existing.batch_name} (re-run)",
        source_keys=existing.source_keys,
        params=existing.params,
    )
    try:
        return run_job(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    except RuntimeError:
        raise HTTPException(
            status_code=502, detail="Storage error while running the job"
        ) from None
