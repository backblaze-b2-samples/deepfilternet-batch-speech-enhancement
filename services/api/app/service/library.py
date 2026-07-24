"""Audio Library — pair each source recording with its enhanced output.

Scoped to the sample's own prefixes (`source/` + `enhanced/`), this is the
scoped complement to the generic full-bucket File Explorer at `/files`.

Enhanced outputs live at `enhanced/<job_id>/<stem>.wav`. A source recording is
paired with the MOST RECENT enhanced output that shares its base stem, so a
re-run's newer output supersedes an older one in the before/after view.
"""

from app.config import settings
from app.repo import list_files
from app.types import LibraryItem


def _stem(key: str) -> str:
    base = key.rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[0]


def get_library() -> list[LibraryItem]:
    sources = list_files(prefix=settings.source_prefix)
    enhanced = list_files(prefix=settings.enhanced_prefix)

    # Newest enhanced output per stem.
    best: dict[str, object] = {}
    for f in sorted(enhanced, key=lambda x: x.uploaded_at):
        best[_stem(f.key)] = f  # later (newer) overwrites

    items: list[LibraryItem] = []
    for src in sources:
        match = best.get(_stem(src.key))
        items.append(
            LibraryItem(
                name=src.filename,
                source_key=src.key,
                source_bytes=src.size_bytes,
                source_size_human=src.size_human,
                uploaded_at=src.uploaded_at,
                enhanced_key=match.key if match else None,
                enhanced_bytes=match.size_bytes if match else None,
                enhanced_size_human=match.size_human if match else None,
                enhanced_at=match.uploaded_at if match else None,
            )
        )
    items.sort(key=lambda i: i.uploaded_at, reverse=True)
    return items
