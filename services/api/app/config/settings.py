from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # B2 region slug (e.g. "us-west-004"). The S3 endpoint is derived from it in
    # repo/b2_client.py as https://s3.<region>.backblazeb2.com — no hardcoded
    # endpoint or region lives anywhere else. Empty by default so `Settings()`
    # never raises at import; startup validation fails fast on a real run.
    b2_region: str = ""
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    # OPTIONAL. Only used to build public object URLs for a public bucket; the
    # app runs fine without it (presigned URLs cover private buckets).
    b2_public_url_base: str = ""

    # --- Speech enhancement (DeepFilterNet) ---
    # Object-key prefixes for the denoise workflow. Settings-configurable so a
    # fork can share a bucket with other workloads.
    source_prefix: str = "source/"
    enhanced_prefix: str = "enhanced/"
    jobs_prefix: str = "jobs/"
    # Bound a single demo batch so a synchronous run stays responsive.
    max_batch_files: int = 20
    # Per-file source size ceiling for decoding into memory (100 MB).
    max_audio_bytes: int = 100 * 1024 * 1024

    api_port: int = 8000
    # Interactive API docs (/docs, /redoc, /openapi.json). On by default for
    # local dev and starter-kit exploration; set false to hide the full API
    # surface in production.
    enable_docs: bool = True
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits
    max_file_size: int = 100 * 1024 * 1024  # 100MB

    # Optional confinement for key-addressed reads/deletes. Empty by default so
    # the by-key routes accept any key shape (they deliberately support nested
    # folders and reserved-word segments). Point a fork at a bucket shared with
    # other data? Set to e.g. "uploads/" to restrict all key ops to app uploads.
    allowed_key_prefix: str = ""

    # Rate limiting (per client IP, per 60s window). In-process per replica —
    # documented in docs/RELIABILITY.md; horizontal scaling needs a shared
    # store (e.g. Redis). Writes/downloads get the tighter cap.
    rate_limit_per_minute: int = 120
    # Covers uploads, deletes, downloads and previews — kept generous enough
    # that a normal browsing/upload session doesn't trip it.
    rate_limit_write_per_minute: int = 60

    # Small durable counters (downloads, etc). Point at a persistent
    # volume in production if you care about surviving restarts.
    download_count_file: str = "data/download_count.json"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins(self) -> list[str]:
        # Drop empties so a trailing comma or API_CORS_ORIGINS="" doesn't yield
        # a stray "" origin.
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()
