from typing import Optional

import ee
import requests

from app.catalog.provenance import build_provenance
from app.catalog.runtime import record_failure, record_success

LANDCOVER_ENTRY_ID = "landcover.esa_worldcover"

from app.services.gee import ESA_LC

ESA_CLASS_META = {
    10:  {"label": "Tree cover",              "color": "#006400"},
    20:  {"label": "Shrubland",               "color": "#ffbb22"},
    30:  {"label": "Grassland",               "color": "#ffff4c"},
    40:  {"label": "Cropland",                "color": "#f096ff"},
    50:  {"label": "Built-up",                "color": "#fa0000"},
    60:  {"label": "Bare / sparse vegetation","color": "#b4b4b4"},
    70:  {"label": "Snow and ice",            "color": "#f0f0f0"},
    80:  {"label": "Permanent water",         "color": "#0064c8"},
    90:  {"label": "Herbaceous wetland",      "color": "#0096a0"},
    95:  {"label": "Mangroves",               "color": "#00cf75"},
    100: {"label": "Moss and lichen",         "color": "#fae6a0"},
}

# ESA WorldCover palette (order must match class values 10,20,...100)
ESA_PALETTE = ["006400","ffbb22","ffff4c","f096ff","fa0000","b4b4b4","f0f0f0","0064c8","0096a0","00cf75","fae6a0"]


# Land use suitability rules engine
def assess_land_use(slope_deg, hand_m, clay_pct, annual_rainfall, dominant_class):
    """
    Rule-based suitability assessment for four use categories.
    Returns ranked list with score 0-10 and key supporting/limiting factors.
    """
    scores = {"residential": 5, "commercial": 5, "agriculture": 5, "conservation": 3}
    factors = []

    # ── Slope ──
    if slope_deg is not None:
        if slope_deg < 5:
            scores["residential"] = 3; scores["commercial"] = 3; scores["agriculture"] = 2
        elif slope_deg < 15:
            scores["residential"] = 1; scores["agriculture"] = 1; scores["conservation"] = 1
            factors.append("Gentle slope — minor earthworks needed")
        elif slope_deg < 30:
            scores["residential"] -= 2; scores["commercial"] -= 3
            scores["conservation"] = 2
            factors.append("Moderate slope — significant grading cost")
        else:
            scores["residential"] -= 4; scores["commercial"] -= 4
            scores["conservation"] = 3
            factors.append("Steep terrain — development not recommended")

    # ── Flood risk (HAND) ──
    if hand_m is not None:
        if hand_m < 5:
            scores["residential"] -= 4; scores["commercial"] -= 4
            scores["conservation"] = 3
            factors.append("Very low HAND — high flood exposure, built uses discouraged")
        elif hand_m < 10:
            scores["residential"] -= 1; scores["commercial"] -= 1
            factors.append("Moderate flood exposure — drainage design required")
        elif hand_m > 20:
            scores["residential"] = 1; scores["commercial"] = 1

    # ── Soil ──
    if clay_pct is not None:
        if clay_pct > 50:
            scores["residential"] -= 2; scores["commercial"] -= 2
            scores["agriculture"] = 2
            factors.append("High clay — expansive soils, specialist foundations required")
        elif clay_pct < 15:
            scores["agriculture"] -= 1
            factors.append("Sandy soil — low water retention, irrigation may be needed")

    # ── Rainfall ──
    if annual_rainfall is not None:
        if annual_rainfall > 900:
            scores["agriculture"] = 2
            factors.append(f"Good rainfall ({annual_rainfall:.0f}mm/yr) — supports rain-fed agriculture")
        elif annual_rainfall < 400:
            scores["agriculture"] -= 2
            factors.append(f"Low rainfall ({annual_rainfall:.0f}mm/yr) — irrigation required for crops")

    # ── Current land cover ──
    if dominant_class == 10:  # Trees
        scores["conservation"] = 4; scores["residential"] -= 2
        factors.append("Active forest cover — significant ecological value")
    elif dominant_class == 50:  # Built-up
        scores["commercial"] = 3; scores["residential"] = 2
        factors.append("Existing built-up area — redevelopment context")
    elif dominant_class == 40:  # Cropland
        scores["agriculture"] = 2
    elif dominant_class in (80, 90):  # Water / wetland
        scores["residential"] -= 4; scores["commercial"] -= 4
        scores["conservation"] = 4
        factors.append("Water body or wetland — development restricted by environmental law")

    USE_LABELS = {
        "residential":  "Residential Development",
        "commercial":   "Commercial / Light Industrial",
        "agriculture":  "Agriculture / Horticulture",
        "conservation": "Conservation / Green Space",
    }

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return {
        "ranked": [
            {
                "use":      USE_LABELS[k],
                "key":      k,
                "score":    min(10, max(0, v)),
                "suitable": v >= 5,
            }
            for k, v in ranked
        ],
        "factors": factors,
        "disclaimer": "Rule-based assessment only. Consult local planning regulations before any development."
    }


def fetch_land_cover(lat: float, lon: float, radius_m: int) -> dict:
    point  = ee.Geometry.Point([lon, lat])
    buffer = point.buffer(radius_m)

    try:
        hist = ESA_LC.reduceRegion(
            reducer=ee.Reducer.frequencyHistogram(),
            geometry=buffer,
            scale=10,
            maxPixels=1e9,
        ).getInfo().get("Map", {})
    except (ee.EEException, requests.RequestException) as exc:
        record_failure(LANDCOVER_ENTRY_ID, exc)
        raise
    record_success(LANDCOVER_ENTRY_ID)

    total_px = sum(hist.values()) or 1
    classes  = []
    for class_val, count in sorted(hist.items(), key=lambda x: -x[1]):
        cv   = int(float(class_val))
        meta = ESA_CLASS_META.get(cv, {"label": f"Class {cv}", "color": "#888888"})
        classes.append({
            "class_id": cv,
            "label":    meta["label"],
            "color":    meta["color"],
            "percent":  round(count / total_px * 100, 1),
            "pixels":   int(count),
        })

    dominant = classes[0] if classes else None
    return {
        "classes":        classes,
        "dominant_class": dominant["class_id"] if dominant else None,
        "dominant_label": dominant["label"]     if dominant else None,
        "radius_m":       radius_m,
        "source":         "ESA WorldCover v200 · 10m",
        "provenance": build_provenance(
            LANDCOVER_ENTRY_ID,
            processing_script="landcover_service.fetch_land_cover:v1",
            spatial_filter=f"POINT({lon} {lat}), buffer {radius_m}m",
            parameters={"radius_m": radius_m},
        ),
    }


def fetch_land_cover_tile(lat: float, lon: float, radius_m: int) -> bytes:
    region = ee.Geometry.Point([lon, lat]).buffer(radius_m).bounds()
    try:
        url = ESA_LC.getThumbURL({
            "region":     region,
            "dimensions": [512, 512],
            "format":     "png",
            "min":        10,
            "max":        100,
            "palette":    ESA_PALETTE,
        })
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except (ee.EEException, requests.RequestException) as exc:
        record_failure(LANDCOVER_ENTRY_ID, exc)
        raise
    record_success(LANDCOVER_ENTRY_ID)
    return resp.content
