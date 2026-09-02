"""
Riparian reserve constraint check.

Kenya's riparian reserve (EMCA Wetlands, Riverbanks, Lakeshores and
Seashores Management Regulations, 2009) ranges 6-30m from the river's
high-water mark depending on the specific river's characteristics, with
the applicable minimum contested between 6m and 10m in practice, and
final determination legally requiring a NEMA/WRA survey. This constraint
gives a conservative, non-authoritative estimate based on distance alone.

Uses the same OSM-derived nearest-waterway distance already surfaced to
users elsewhere, rather than an independent measurement.
"""

from app.models.environmental import ConstraintResult, RelationshipType, CautionLevel

CRITICAL_THRESHOLD_M = 10   # legal minimum reserve under current practice
HIGH_THRESHOLD_M = 30       # upper bound of the EMCA riparian band
MODERATE_THRESHOLD_M = 60   # upper bound of Survey of Kenya's wider reservation strip


def _classify(distance_m: float) -> tuple[RelationshipType, CautionLevel]:
    if distance_m < CRITICAL_THRESHOLD_M:
        return RelationshipType.INSIDE, CautionLevel.CRITICAL
    if distance_m < HIGH_THRESHOLD_M:
        return RelationshipType.OVERLAPPING, CautionLevel.HIGH
    if distance_m < MODERATE_THRESHOLD_M:
        return RelationshipType.ADJACENT, CautionLevel.MODERATE
    if distance_m < 200:
        return RelationshipType.NEARBY, CautionLevel.LOW
    return RelationshipType.NOT_APPLICABLE, CautionLevel.NONE


def _reason_and_action(waterway_type: str | None, distance_m: float | None, caution: CautionLevel) -> tuple[str, str]:
    if distance_m is None:
        return (
            "No waterway detected within the search radius.",
            "No specific action required for this constraint.",
        )

    label = waterway_type or "a waterway"
    reason = f"Nearest {label} is approximately {distance_m:.0f}m from the site."

    actions = {
        CautionLevel.CRITICAL: "This distance falls within Kenya's minimum riparian reserve. Development or clearing here is likely prohibited under EMCA. Consult NEMA and WRA before any activity.",
        CautionLevel.HIGH: "This distance may fall within the applicable riparian reserve (6-30m band, river-dependent). A formal NEMA/WRA riparian survey is recommended before proceeding.",
        CautionLevel.MODERATE: "This distance is likely outside the core riparian reserve but within the wider reservation strip recognized for government land surveys. Verify with a local survey if the activity is water-sensitive.",
        CautionLevel.LOW: "No immediate riparian restriction expected, but consider water-quality and erosion impacts on nearby waterways.",
        CautionLevel.NONE: "No specific action required for this constraint.",
    }
    return reason, actions[caution]


def check_riparian_zone(waterway_distance_m: float | None, waterway_type: str | None = None) -> ConstraintResult:
    """
    waterway_distance_m: nearest waterway distance in meters, as already
    computed by the OSM service (osm.summary.nearest_waterway_m).
    waterway_type: optional OSM waterway tag (river/stream/canal etc.)
    """
    if waterway_distance_m is None:
        return ConstraintResult(
            detected=False,
            relationship=RelationshipType.NOT_APPLICABLE,
            distance_m=None,
            caution=CautionLevel.NONE,
            reason="No waterway detected within the search radius.",
            action="No specific action required for this constraint.",
            metadata={"source": "OSM", "note": "Distance-based estimate; not a substitute for a NEMA/WRA riparian survey."},
        )

    relationship, caution = _classify(waterway_distance_m)
    reason, action = _reason_and_action(waterway_type, waterway_distance_m, caution)

    return ConstraintResult(
        detected=waterway_distance_m < 200,
        relationship=relationship,
        distance_m=round(waterway_distance_m, 1),
        caution=caution,
        reason=reason,
        action=action,
        metadata={
            "waterway_type": waterway_type,
            "source": "OSM",
            "note": "Distance-based estimate against Kenya's EMCA riparian reserve bands (6-30m); actual reserve width is river-specific and legally requires NEMA/WRA survey confirmation.",
        },
    )