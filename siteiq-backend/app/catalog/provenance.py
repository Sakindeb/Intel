"""
Per-analysis provenance records (SiteIntel spec, Section 9).

A CatalogEntry describes a *dataset*. A ProvenanceRecord describes one
*use* of that dataset: which site, which parameters, when, by which code.
Build one every time a service produces a result a report might cite.
"""

from datetime import date, datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel

from .loader import get_entry


class ProvenanceRecord(BaseModel):
    dataset_id: str
    dataset_version: str
    dataset_license: str
    accessed_at: datetime
    source_url: str
    spatial_filter: str          # e.g. "POINT(lon lat)" or a buffer/bbox description
    processing_script: str       # e.g. "landcover_service.fetch_land_cover:v1"
    parameters: dict[str, Any] = {}
    confidence: str
    confidence_rationale: str
    output_version: str = "1.0"


def build_provenance(
    entry_id: str,
    *,
    processing_script: str,
    spatial_filter: str,
    parameters: Optional[dict[str, Any]] = None,
    output_version: str = "1.0",
) -> ProvenanceRecord:
    """Look up a catalog entry and stamp a provenance record for this call.

    Raises KeyError if entry_id isn't in the catalog — a service citing an
    unregistered dataset should fail loudly, not silently skip provenance.
    """
    entry = get_entry(entry_id)
    return ProvenanceRecord(
        dataset_id=entry.id,
        dataset_version=entry.version,
        dataset_license=entry.license,
        accessed_at=datetime.now(timezone.utc),
        source_url=entry.access_url,
        spatial_filter=spatial_filter,
        processing_script=processing_script,
        parameters=parameters or {},
        confidence=entry.confidence,
        confidence_rationale=entry.confidence_rationale,
        output_version=output_version,
    )