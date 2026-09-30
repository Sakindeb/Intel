"""
Loads and validates catalog entries from catalog/entries/*.yaml.

Fail-fast by design: a malformed entry raises CatalogError naming the file,
so a bad catalog is caught at startup (and in CI), not at request time.
"""

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import ValidationError

from .schema import CatalogEntry

ENTRIES_DIR = Path(__file__).parent / "entries"


class CatalogError(Exception):
    """Raised when the catalog cannot be loaded or an entry is invalid."""


def load_catalog(entries_dir: Path = ENTRIES_DIR) -> dict[str, CatalogEntry]:
    files = sorted(Path(entries_dir).glob("*.yaml"))
    if not files:
        raise CatalogError(f"No catalog entries found in {entries_dir}")

    entries: dict[str, CatalogEntry] = {}
    for f in files:
        try:
            raw = yaml.safe_load(f.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise CatalogError(f"{f.name}: file must contain a YAML mapping")
            entry = CatalogEntry(**raw)
        except (yaml.YAMLError, ValidationError) as exc:
            raise CatalogError(f"{f.name}: {exc}") from exc

        if entry.id in entries:
            raise CatalogError(f"{f.name}: duplicate catalog id '{entry.id}'")
        entries[entry.id] = entry
    return entries


@lru_cache(maxsize=1)
def get_catalog() -> dict[str, CatalogEntry]:
    """Cached catalog. Call once at startup so errors surface immediately."""
    return load_catalog()


def get_entry(entry_id: str) -> CatalogEntry:
    """Return one entry or raise KeyError."""
    return get_catalog()[entry_id]