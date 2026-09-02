"""
Protected areas constraint check, backed by WDPA via Google Earth Engine.
"""

import ee
from app.services.gee import WDPA_POLYGONS
from app.models.environmental import ConstraintResult, RelationshipType, CautionLevel

ADJACENT_THRESHOLD_M = 1000
NEARBY_THRESHOLD_M = 5000


def _classify_relationship(overlap_percent: float, distance_m: float) -> RelationshipType:
    if overlap_percent >= 95:
        return RelationshipType.INSIDE
    if overlap_percent > 0:
        return RelationshipType.OVERLAPPING
    if distance_m <= ADJACENT_THRESHOLD_M:
        return RelationshipType.ADJACENT
    if distance_m <= NEARBY_THRESHOLD_M:
        return RelationshipType.NEARBY
    return RelationshipType.NOT_APPLICABLE


def _classify_caution(relationship: RelationshipType) -> CautionLevel:
    return {
        RelationshipType.INSIDE: CautionLevel.CRITICAL,
        RelationshipType.OVERLAPPING: CautionLevel.HIGH,
        RelationshipType.ADJACENT: CautionLevel.MODERATE,
        RelationshipType.NEARBY: CautionLevel.LOW,
        RelationshipType.NOT_APPLICABLE: CautionLevel.NONE,
    }[relationship]


def _reason_and_action(detected: bool, relationship: RelationshipType, name: str | None, designation: str | None) -> tuple[str, str]:
    if not detected:
        return (
            "No mapped protected area detected within the search radius.",
            "No specific action required for this constraint.",
        )
    label = f"{name} ({designation})" if name and designation else "a mapped protected area"
    reasons = {
        RelationshipType.INSIDE: f"Site falls within {label}.",
        RelationshipType.OVERLAPPING: f"Site overlaps part of {label}.",
        RelationshipType.ADJACENT: f"Site is adjacent to {label}.",
        RelationshipType.NEARBY: f"Site is near {label}.",
    }
    actions = {
        RelationshipType.INSIDE: "Development within this boundary is likely restricted or prohibited. Consult the managing authority and relevant conservation regulations before proceeding.",
        RelationshipType.OVERLAPPING: "Avoid activity within the overlapping portion. Commission a boundary survey and consult the managing authority.",
        RelationshipType.ADJACENT: "Assess potential edge effects (noise, runoff, access roads) and consult local conservation guidance.",
        RelationshipType.NEARBY: "No immediate restriction, but consider cumulative landscape-level conservation impacts.",
    }
    return reasons[relationship], actions[relationship]


def check_protected_areas(lat: float, lon: float, radius_m: float) -> ConstraintResult:
    """
    Checks a circular site (lat/lon + radius_m) against WDPA protected areas.

    The site is treated as a circle: point.buffer(radius_m). overlap_percent
    is the share of that circle's area that intersects the nearest protected
    area; distance_m is measured from the site center point when there's no
    overlap.
    """
    point = ee.Geometry.Point([lon, lat])
    site_geom = point.buffer(radius_m)

    # search radius = whichever is larger: the "nearby" threshold, or the
    # site's own radius (so a huge site still finds areas just past its edge)
    search_radius = max(NEARBY_THRESHOLD_M, radius_m)
    nearby = WDPA_POLYGONS.filterBounds(point.buffer(search_radius))

    distance_m = None
    name = None
    designation = None
    overlap_percent = 0.0

    count = nearby.size().getInfo()
    if count > 0:
        with_distance = nearby.map(
            lambda f: f.set("distance_to_point", f.geometry().distance(point))
        )
        nearest_feature = ee.Feature(with_distance.sort("distance_to_point").first())
        info = nearest_feature.getInfo()
        distance_m = info["properties"].get("distance_to_point")
        name = info["properties"].get("NAME")
        designation = info["properties"].get("DESIG_ENG")

        intersection = nearest_feature.geometry().intersection(site_geom, ee.ErrorMargin(1))
        intersection_area = intersection.area(ee.ErrorMargin(1)).getInfo()
        site_area = site_geom.area(ee.ErrorMargin(1)).getInfo()
        overlap_percent = round((intersection_area / site_area) * 100, 2) if site_area else 0.0

    detected = count > 0
    relationship = _classify_relationship(overlap_percent, distance_m if distance_m is not None else float("inf"))
    caution = _classify_caution(relationship)
    reason, action = _reason_and_action(detected, relationship, name, designation)

    return ConstraintResult(
        detected=detected,
        relationship=relationship,
        distance_m=round(distance_m, 1) if distance_m is not None else None,
        overlap_percent=overlap_percent if overlap_percent > 0 else None,
        caution=caution,
        reason=reason,
        action=action,
        metadata={"name": name, "designation": designation, "source": "WDPA"},
    )