"""In-memory live job-status registry.

Holds the transient status (pending/processing/done/failed) of enhancement jobs
while the process is alive. Confined to the repo layer like `counter.py`.

Durability caveat (same shape as the download counter / rate limiter): this is
in-process, per replica. The DURABLE record of a job is its JSONL log in B2 — on
restart, completed jobs are re-derived from the `jobs/` prefix (see
`service/jobs.py`). Live status is only meaningful within a single running
process, so a horizontally-scaled deploy needs a shared store (Redis/DB).
"""

from threading import Lock

_lock = Lock()
# job_id -> status string
_status: dict[str, str] = {}


def set_status(job_id: str, status: str) -> None:
    with _lock:
        _status[job_id] = status


def get_status(job_id: str) -> str | None:
    with _lock:
        return _status.get(job_id)


def all_statuses() -> dict[str, str]:
    with _lock:
        return dict(_status)


def remove(job_id: str) -> None:
    with _lock:
        _status.pop(job_id, None)


def _reset() -> None:
    """Clear all live statuses. Used by tests to stay hermetic."""
    with _lock:
        _status.clear()
