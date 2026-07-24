"""Pydantic model for the scoped Audio Library (before/after pairing)."""

from datetime import datetime

from pydantic import BaseModel


class LibraryItem(BaseModel):
    """A source recording paired with its most recent enhanced output (if any)."""

    name: str
    source_key: str
    source_bytes: int
    source_size_human: str
    uploaded_at: datetime
    enhanced_key: str | None = None
    enhanced_bytes: int | None = None
    enhanced_size_human: str | None = None
    enhanced_at: datetime | None = None
