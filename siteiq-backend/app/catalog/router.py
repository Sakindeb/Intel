"""Read-only catalog endpoints."""

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException

from .loader import get_catalog
from .runtime import RuntimeStatus, all_statuses, get_status
from .schema import CatalogEntry

router = APIRouter(prefix="/catalog", tags=["catalog"])


class CatalogEntryOut(CatalogEntry):
    """A static catalog entry plus its current runtime health."""

    runtime: RuntimeStatus


@router.get("", response_model=list[CatalogEntryOut])
def list_entries(
    research_question: Optional[str] = None,
    indicator: Optional[str] = None,
    confidence: Optional[Literal["high", "medium", "low"]] = None,
):
    """List entries. Filters: which research question or indicator a dataset
    supports, or its confidence rating."""
    statuses = all_statuses()
    out = []
    for entry in get_catalog().values():
        if research_question and research_question not in entry.research_question:
            continue
        if indicator and indicator not in entry.siteintel_indicator:
            continue
        if confidence and entry.confidence != confidence:
            continue
        out.append(
            CatalogEntryOut(
                **entry.model_dump(), runtime=statuses.get(entry.id, RuntimeStatus())
            )
        )
    return out


@router.get("/{entry_id}", response_model=CatalogEntryOut)
def get_entry(entry_id: str):
    entry = get_catalog().get(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No catalog entry '{entry_id}'")
    return CatalogEntryOut(**entry.model_dump(), runtime=get_status(entry_id))