from typing import Optional

import ee

from app.services.gee import HAND, SLOPE, UPA
from app.catalog.provenance import build_provenance
from app.catalog.runtime import record_failure, record_success

HYDROLOGY_ENTRY_ID = "hydrology.merit_hydro"

# Ordered low -> high so a "bump" always means "one step more severe"
LEVELS = ["low", "medium", "medium-high", "high"]

# If the buffer minimum HAND is at least this many metres below the point
# value, treat the site as sitting on heterogeneous terrain (e.g. the
# analysis buffer dips toward a nearby channel the point sample misses).
HETEROGENEITY_THRESHOLD_M = 3.0

# How close to a level boundary counts as "borderline" for confidence.
BORDERLINE_MARGIN_M = 1.0


def _bump(level: str) -> str:
    """Move one step toward 'high', capped there."""
    idx = LEVELS.index(level)
    return LEVELS[min(idx + 1, len(LEVELS) - 1)]


def _base_level(hand_m: float, slope_deg: Optional[float]) -> str:
    """Level from HAND alone, with slope only breaking the medium/medium-high tie."""
    if hand_m < 5:
        return "high"
    if hand_m < 10:
        return "medium-high" if (slope_deg is not None and slope_deg < 5) else "medium"
    return "low"


def _confidence(
    hand_point_m: float,
    hand_buffer_mean_m: Optional[float],
    hand_buffer_min_m: Optional[float],
) -> tuple[str, str]:
    """Confidence reflects terrain heterogeneity and proximity to a threshold,
    not just data availability — a value right at a boundary, or a buffer
    whose spread disagrees with the point sample, is less trustworthy than
    a value sitting solidly inside one bracket."""
    reasons = []

    near_boundary = any(
        abs(hand_point_m - t) < BORDERLINE_MARGIN_M for t in (5.0, 10.0)
    )
    if near_boundary:
        reasons.append("point HAND is close to a risk-level threshold")

    spread = None
    if hand_buffer_mean_m is not None and hand_buffer_min_m is not None:
        spread = hand_buffer_mean_m - hand_buffer_min_m
        if spread > HETEROGENEITY_THRESHOLD_M:
            reasons.append(
                f"buffer terrain is uneven (mean {hand_buffer_mean_m:.1f}m vs "
                f"min {hand_buffer_min_m:.1f}m) — point sample may not represent the whole site"
            )

    if not reasons:
        return "high", "Point and buffer HAND agree and are not near a threshold."
    if len(reasons) == 1 and not near_boundary:
        return "medium", reasons[0].capitalize() + "."
    return "low", "; ".join(reasons).capitalize() + "."


def composite_flood_risk(
    hand_point_m: Optional[float],
    hand_buffer_mean_m: Optional[float],
    hand_buffer_min_m: Optional[float],
    slope_deg: Optional[float],
    waterway_dist_m: Optional[int],
) -> dict:
    """
    Flood sensitivity screening from four inputs:
      Primary    — HAND at the exact site point
      Robustness — HAND across the surrounding buffer (mean/min), to catch
                   cases where the site sits on a local high point next to
                   lower-lying, more flood-prone land
      Modifier   — slope (flat land near drainage floods wider)
      Secondary  — OSM waterway proximity (catches small streams below
                   MERIT Hydro's ~90m resolution)

    Slope and waterway are now applied consistently across the whole HAND
    range, and a wide gap between the point value and the buffer minimum
    raises the level by one step and is called out explicitly, rather than
    being computed and then discarded.
    """
    if hand_point_m is None:
        return {
            "level": "unknown",
            "label": "Insufficient data",
            "description": (
                "HAND data unavailable at this location. Consider commissioning "
                "a site-specific hydrological assessment."
            ),
            "color": "#9ca3af",
            "confidence": "unknown",
            "confidence_rationale": "No HAND value returned for this site.",
            "modifiers_applied": [],
        }

    level = _base_level(hand_point_m, slope_deg)
    modifiers_applied = []

    # Waterway modifier — now checked at every HAND bracket, not just >=10m.
    if waterway_dist_m is not None and waterway_dist_m < 200:
        level = _bump(level)
        modifiers_applied.append(
            f"nearby waterway ({waterway_dist_m}m) not resolved by MERIT Hydro at 90m"
        )

    # Buffer heterogeneity modifier — uses the buffer min HAND that was
    # already being computed but previously never affected the result.
    if (
        hand_buffer_min_m is not None
        and (hand_point_m - hand_buffer_min_m) >= HETEROGENEITY_THRESHOLD_M
    ):
        level = _bump(level)
        modifiers_applied.append(
            f"surrounding buffer dips to {hand_buffer_min_m:.1f}m HAND, "
            f"{hand_point_m - hand_buffer_min_m:.1f}m below the site point"
        )

    confidence, confidence_rationale = _confidence(
        hand_point_m, hand_buffer_mean_m, hand_buffer_min_m
    )

    slope_note = f", {slope_deg:.1f}\u00b0 slope" if slope_deg is not None else ""
    modifier_note = " " + "; ".join(modifiers_applied).capitalize() + "." if modifiers_applied else ""

    LABELS = {
        "high": (
            "High flood risk",
            f"Site sits only {hand_point_m:.1f}m above nearest drainage{slope_note}. "
            f"Regularly inundated in moderate rainfall events.{modifier_note} "
            "A hydrological assessment is strongly recommended before any site works.",
            "#ef4444",
        ),
        "medium-high": (
            "Medium-high flood risk",
            f"Site is {hand_point_m:.1f}m above drainage on gently sloping terrain{slope_note}. "
            f"Flat land amplifies inundation extent during heavy rainfall.{modifier_note}",
            "#f97316",
        ),
        "medium": (
            "Moderate flood risk",
            f"Site is {hand_point_m:.1f}m above nearest drainage{slope_note}.{modifier_note} "
            "Risk increases during prolonged or high-intensity rainfall.",
            "#f59e0b",
        ),
        "low": (
            "Low flood risk",
            f"Site sits {hand_point_m:.1f}m above nearest drainage channel{slope_note}. "
            f"Low inundation risk under normal conditions.{modifier_note}",
            "#22c55e",
        ),
    }

    label, description, color = LABELS[level]
    return {
        "level": level,
        "label": label,
        "description": description,
        "color": color,
        "confidence": confidence,
        "confidence_rationale": confidence_rationale,
        "modifiers_applied": modifiers_applied,
    }


def fetch_flood_risk(lat: float, lon: float, radius_m: int, waterway_dist_m: Optional[int]) -> dict:
    point  = ee.Geometry.Point([lon, lat])
    buffer = point.buffer(radius_m)

    try:
        hand_point = HAND.reduceRegion(
            reducer=ee.Reducer.first(), geometry=point, scale=90
        ).getInfo()

        hand_buffer = HAND.reduceRegion(
            reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True),
            geometry=buffer, scale=90, maxPixels=1e8,
        ).getInfo()

        slope_point = SLOPE.reduceRegion(
            reducer=ee.Reducer.first(), geometry=point, scale=30
        ).getInfo()
    except ee.EEException as exc:
        record_failure(HYDROLOGY_ENTRY_ID, exc)
        raise
    record_success(HYDROLOGY_ENTRY_ID)

    hand_m         = hand_point.get("hnd")
    hand_mean_m    = hand_buffer.get("hnd_mean")
    hand_min_m     = hand_buffer.get("hnd_min")
    slope_d        = slope_point.get("slope")

    risk = composite_flood_risk(hand_m, hand_mean_m, hand_min_m, slope_d, waterway_dist_m)

    return {
        "hand": {
            "point_m":       round(hand_m, 1) if hand_m is not None else None,
            "buffer_mean_m": round(hand_mean_m, 1) if hand_mean_m is not None else None,
            "buffer_min_m":  round(hand_min_m, 1) if hand_min_m is not None else None,
        },
        "risk": risk,
        "inputs": {
            "hand_m":          round(hand_m, 1) if hand_m is not None else None,
            "slope_deg":       round(slope_d, 1) if slope_d is not None else None,
            "waterway_dist_m": waterway_dist_m,
        },
        "provenance": build_provenance(
            HYDROLOGY_ENTRY_ID,
            processing_script="flood_service.fetch_flood_risk:v2",
            spatial_filter=f"POINT({lon} {lat}), buffer {radius_m}m",
            parameters={"radius_m": radius_m, "waterway_dist_m": waterway_dist_m},
        ),
    }


def fetch_drainage_geojson(lat: float, lon: float, radius_m: int) -> dict:
    """
    Sample MERIT upstream-area raster on a grid and return channel pixels
    as GeoJSON points. Uses ee.Image.sample() — works with Viewer permissions,
    no thumbnail creation needed.
    Channels defined as UPA > 10 km² (meaningful stream network).
    """
    region   = ee.Geometry.Point([lon, lat]).buffer(radius_m)
    channels = UPA.updateMask(UPA.gt(10))

    # Sample at ~200m spacing — gives a manageable number of points
    # and still shows channel routing clearly at zoom 14-15
    scale = max(200, radius_m // 10)

    points = channels.sample(
        region=region,
        scale=scale,
        geometries=True,
        dropNulls=True,
    )

    try:
        raw = points.getInfo()  # returns a GeoJSON FeatureCollection
    except ee.EEException as exc:
        record_failure(HYDROLOGY_ENTRY_ID, exc)
        raise
    record_success(HYDROLOGY_ENTRY_ID)

    # Slim the payload — only keep coordinates and upa value
    features = [
        {
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {"upa": round(f["properties"].get("upa", 0), 1)},
        }
        for f in raw.get("features", [])
    ]

    return {"type": "FeatureCollection", "features": features}