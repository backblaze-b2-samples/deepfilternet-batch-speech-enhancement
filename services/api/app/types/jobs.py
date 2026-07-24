"""Pydantic models for the batch speech-enhancement domain.

An `EnhancementJob` is one batch run of DeepFilterNet over >=1 source recording.
The durable record of a job is its JSONL log in B2 (`jobs/<job_id>.jsonl`); these
models are the typed view the API returns and the JSONL is (de)serialized to/from.
"""

from datetime import datetime

from pydantic import BaseModel, Field

# Finite attenuation-limit options surfaced in the create form. `None` maps to
# DeepFilterNet's full suppression (no attenuation cap); numeric values (dB) keep
# progressively more of the original ambience.
ATTENUATION_OPTIONS: tuple[int | None, ...] = (None, 40, 30, 20, 12)


class EnhancementParams(BaseModel):
    """Denoising knobs. Both map straight onto DeepFilterNet."""

    # None = full suppression. Otherwise one of ATTENUATION_OPTIONS (dB).
    attenuation_limit_db: int | None = None
    # DeepFilterNet post-filter: sharper speech, slight artifact risk.
    post_filter: bool = False


class AudioInfo(BaseModel):
    """Lightweight probe of a source recording (surfaced by the Library)."""

    duration_seconds: float
    sample_rate: int
    channels: int


class FileResult(BaseModel):
    """Per-file outcome inside a batch."""

    input_key: str
    output_key: str | None = None
    input_bytes: int
    output_bytes: int = 0
    duration_seconds: float | None = None
    sample_rate_out: int | None = None
    # Reference-free SNR proxies (dB). `snr_delta_db` = output - input.
    input_snr_db: float | None = None
    output_snr_db: float | None = None
    snr_delta_db: float | None = None
    status: str  # "done" | "failed"
    error: str | None = None


class EnhancementJob(BaseModel):
    """Full job detail — header + every file result."""

    job_id: str
    batch_name: str
    status: str  # "pending" | "processing" | "done" | "failed"
    created_at: datetime
    model_version: str
    device: str
    params: EnhancementParams
    source_keys: list[str]
    results: list[FileResult] = Field(default_factory=list)
    log_key: str | None = None


class JobSummary(BaseModel):
    """List-view row — aggregates a job without its per-file detail."""

    job_id: str
    batch_name: str
    status: str
    created_at: datetime
    model_version: str
    file_count: int
    succeeded: int
    failed: int
    source_bytes: int
    enhanced_bytes: int
    avg_snr_improvement_db: float | None = None
    log_key: str | None = None


class CreateJobRequest(BaseModel):
    """POST /jobs body."""

    batch_name: str = Field(min_length=1, max_length=120)
    source_keys: list[str] = Field(min_length=1)
    params: EnhancementParams = Field(default_factory=EnhancementParams)
