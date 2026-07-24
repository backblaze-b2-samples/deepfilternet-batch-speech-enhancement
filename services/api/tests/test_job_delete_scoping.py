"""delete_job must delete ONLY the job's own recorded outputs + its JSONL log.

This is the safety-critical invariant: a job delete must never wipe a broad
prefix or another job's outputs. We mock the repo so no real B2 call happens and
assert the exact set of deleted keys.
"""

import json

import pytest

from app.service import jobs as jobs_service
from app.service.jobs import JobKeyError, JobNotFoundError, delete_job

JOB_ID = "20260724-120000-abc123"
LOG_KEY = f"jobs/{JOB_ID}.jsonl"


def _jsonl() -> bytes:
    header = {
        "type": "job",
        "job_id": JOB_ID,
        "batch_name": "b",
        "status": "done",
        "created_at": "2026-07-24T12:00:00+00:00",
        "model_version": "m",
        "device": "cpu",
        "params": {"attenuation_limit_db": None, "post_filter": False},
        "source_keys": ["source/a.wav", "source/b.wav"],
        "log_key": LOG_KEY,
    }
    lines = [json.dumps(header)]
    for name in ("a", "b"):
        lines.append(
            json.dumps(
                {
                    "type": "result",
                    "input_key": f"source/{name}.wav",
                    "output_key": f"enhanced/{JOB_ID}/{name}.wav",
                    "input_bytes": 10,
                    "output_bytes": 30,
                    "status": "done",
                }
            )
        )
    return ("\n".join(lines) + "\n").encode("utf-8")


def test_delete_job_is_scoped_to_recorded_keys(monkeypatch):
    deleted: list[str] = []

    monkeypatch.setattr(jobs_service, "get_object_bytes", lambda key: _jsonl())
    monkeypatch.setattr(jobs_service, "delete_file", lambda key: deleted.append(key))

    delete_job(JOB_ID)

    # Exactly the two recorded outputs plus the log — nothing broader.
    assert deleted == [
        f"enhanced/{JOB_ID}/a.wav",
        f"enhanced/{JOB_ID}/b.wav",
        LOG_KEY,
    ]


def test_delete_missing_job_raises(monkeypatch):
    def _missing(key):
        raise RuntimeError("not found")

    monkeypatch.setattr(jobs_service, "get_object_bytes", _missing)
    with pytest.raises(JobNotFoundError):
        delete_job(JOB_ID)


def test_delete_invalid_job_id_rejected():
    with pytest.raises(JobKeyError):
        delete_job("../evil")
