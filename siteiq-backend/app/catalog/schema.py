"""
Data catalog schema for SiteIntel.

Defines the structure of a catalog entry, matching Section 4 of the
SiteIntel Research Specification (dataset, variable, producer, access,
license, version, spatial/temporal extent, provenance, lineage, confidence).

This module has NO runtime/mutable state (no `status`, no `last_checked`)
by design — those belong in a separate runtime store, not in the
git-committed catalog entries. See catalog/runtime.py for that.
"""

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CatalogEntry(BaseModel):
    # --- Identity ---
    id: str = Field(..., description="Internal slug, e.g. 'landcover.esa_worldcover'")
    dataset: str = Field(..., description="Dataset/product name")
    variable: str = Field(..., description="Specific band, layer, or variable used")
    producer: str = Field(..., description="Organization or data provider")

    # --- Access & governance ---
    access_url: str
    license: str
    version: str
    acquisition_date: Optional[date] = Field(
        None, description="When this entry's metadata was last obtained/verified"
    )

    # --- Spatial ---
    spatial_extent: str = Field(..., description="e.g. 'global', 'kenya', 'nairobi_kiambu'")
    spatial_resolution: str = Field(..., description="Native resolution, e.g. '10m', '90m'")
    crs: str = "EPSG:4326"

    # --- Temporal ---
    temporal_coverage: Optional[str] = Field(None, description="e.g. '2015-present'")
    temporal_resolution: Literal["daily", "monthly", "annual", "static", "live"]

    # --- Content ---
    units: Optional[str] = None
    bands_variables: list[str] = Field(default_factory=list)
    nodata: Optional[str] = None

    # --- Quality ---
    accuracy: Optional[str] = None
    limitations: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"]
    confidence_rationale: str

    # --- Lineage & usage ---
    provenance: str = Field(..., description="Origin/citation text for this dataset")
    lineage: str = Field(..., description="Processing path: source -> indicator")
    siteintel_indicator: list[str] = Field(
        default_factory=list, description="Indicators/services that consume this dataset"
    )
    research_question: list[str] = Field(
        default_factory=list, description="Section 1 research question(s) this supports"
    )


class CatalogEntryList(BaseModel):
    entries: list[CatalogEntry]