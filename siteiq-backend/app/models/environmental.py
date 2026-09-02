"""
Shared response contract for all environmental_constraints checks.
Every constraint service (protected_areas, wetlands, waterways, forest,
biodiversity) returns a ConstraintResult so the API and frontend only
need to handle one shape.
"""

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class RelationshipType(str, Enum):
    INSIDE = "inside"
    OVERLAPPING = "overlapping"
    ADJACENT = "adjacent"
    NEARBY = "nearby"
    NOT_APPLICABLE = "not_applicable"


class CautionLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class ConstraintResult(BaseModel):
    detected: bool
    relationship: RelationshipType = RelationshipType.NOT_APPLICABLE
    distance_m: Optional[float] = None
    overlap_percent: Optional[float] = Field(default=None, ge=0, le=100)
    caution: CautionLevel = CautionLevel.NONE
    reason: str
    action: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class EnvironmentalConstraints(BaseModel):
    protected_areas: ConstraintResult
    wetlands: Optional[ConstraintResult] = None
    waterways: Optional[ConstraintResult] = None
    forest: Optional[ConstraintResult] = None
    biodiversity: Optional[ConstraintResult] = None
    disclaimer: str = (
        "SiteIQ environmental constraints are intended for preliminary "
        "screening and decision support. They do not replace legally "
        "authoritative zoning, environmental impact assessments, or "
        "site-specific regulatory review."
    )