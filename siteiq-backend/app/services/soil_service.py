import math

import ee
import requests

from app.services.gee import ISDA_CLAY, ISDA_OC, ISDA_PH, ISDA_SAND, ISDA_TEX
from app.utils.helpers import RISK_COLORS, TEXTURE_META
from app.catalog.provenance import build_provenance
from app.catalog.runtime import record_failure, record_success

SOIL_ENTRY_ID = "soil.isdasoil"


def fetch_soil(lat: float, lon: float) -> dict:
    point = ee.Geometry.Point([lon, lat])

    # Sample each image separately to avoid band name collisions when stacking
    try:
        clay_raw = ISDA_CLAY.reduceRegion(reducer=ee.Reducer.first(), geometry=point, scale=30).getInfo().get("mean_0_20")
        sand_raw = ISDA_SAND.reduceRegion(reducer=ee.Reducer.first(), geometry=point, scale=30).getInfo().get("mean_0_20")
        ph_raw   = ISDA_PH.reduceRegion(  reducer=ee.Reducer.first(), geometry=point, scale=30).getInfo().get("mean_0_20")
        oc_raw   = ISDA_OC.reduceRegion(  reducer=ee.Reducer.first(), geometry=point, scale=30).getInfo().get("mean_0_20")
        tex_raw  = ISDA_TEX.reduceRegion( reducer=ee.Reducer.first(), geometry=point, scale=30).getInfo().get("texture_0_20")
    except ee.EEException as exc:
        record_failure(SOIL_ENTRY_ID, exc)
        raise
    record_success(SOIL_ENTRY_ID)

    # Apply unit back-transforms per GEE catalog
    clay_pct = round(clay_raw / 10, 1)               if clay_raw is not None else None
    sand_pct = round(sand_raw / 10, 1)               if sand_raw is not None else None
    silt_pct = round(max(0, 100 - (clay_pct or 0) - (sand_pct or 0)), 1) if (clay_pct is not None and sand_pct is not None) else None
    ph       = round(ph_raw   / 10, 1)               if ph_raw   is not None else None
    # OC back-transform: exp(raw/10) - 1 gives g/kg; ÷10 converts to %
    oc_pct   = round((math.exp(oc_raw / 10) - 1) / 10, 2) if oc_raw is not None else None
    tex_int  = int(round(tex_raw))                   if tex_raw is not None else None

    # Texture class interpretation
    tex_name, risk_level, risk_note = TEXTURE_META.get(tex_int, ("Unknown", "unknown", "Texture class not recognised."))

    # pH interpretation
    if ph is None:
        ph_note = None
    elif ph < 5.5:
        ph_note = "Strongly acidic — potential corrosion risk for steel reinforcement and concrete."
    elif ph < 6.5:
        ph_note = "Moderately acidic — suitable for most construction with standard detailing."
    elif ph < 7.5:
        ph_note = "Neutral — ideal pH range for construction."
    elif ph < 8.5:
        ph_note = "Mildly alkaline — generally suitable, monitor for efflorescence in masonry."
    else:
        ph_note = "Strongly alkaline — check for sulphate content; may require sulphate-resisting cement."

    return {
        "properties": {
            "clay_pct":  clay_pct,
            "sand_pct":  sand_pct,
            "silt_pct":  silt_pct,
            "ph":        ph,
            "oc_pct":    oc_pct,
        },
        "texture": {
            "class_id":   tex_int,
            "class_name": tex_name,
            "risk_level": risk_level,
            "risk_color": RISK_COLORS.get(risk_level, "#9ca3af"),
            "note":       risk_note,
        },
        "flags": {
            "ph_note":         ph_note,
            "high_clay":       (clay_pct or 0) > 40,
            "high_oc":         (oc_pct  or 0) > 3,
        },
        "provenance": build_provenance(
            SOIL_ENTRY_ID,
            processing_script="soil_service.fetch_soil:v1",
            spatial_filter=f"POINT({lon} {lat})",
            parameters={},
        ),
    }


# ─── Soil map (PNG overlay) ───────────────────────────────────────────────────

# iSDAsoil clay palette: white (low) → brown (high)
CLAY_PALETTE   = ["fffde7","f9a825","e65100","b71c1c","4a148c"]
SAND_PALETTE   = ["e8f5e9","a5d6a7","388e3c","1b5e20","0d2b0f"]
PH_PALETTE     = ["b71c1c","ef9a9a","fff9c4","a5d6a7","1565c0"]
OC_PALETTE     = ["fff8e1","ffe082","ffb300","e65100","1a0a00"]

SOIL_LAYER_META = {
    "clay":  {"image": None, "band": "mean_0_20", "min": 0,  "max": 600, "palette": CLAY_PALETTE, "label": "Clay content (g/kg)"},
    "sand":  {"image": None, "band": "mean_0_20", "min": 0,  "max": 800, "palette": SAND_PALETTE, "label": "Sand content (g/kg)"},
    "ph":    {"image": None, "band": "mean_0_20", "min": 40, "max": 90,  "palette": PH_PALETTE,   "label": "Soil pH (×10)"},
    "oc":    {"image": None, "band": "mean_0_20", "min": 0,  "max": 100, "palette": OC_PALETTE,   "label": "Organic carbon (g/kg)"},
}


def fetch_soil_tile(lat: float, lon: float, radius_m: int, layer: str) -> bytes:
    region = ee.Geometry.Point([lon, lat]).buffer(radius_m).bounds()
    meta = SOIL_LAYER_META[layer]

    images = {
        "clay": ISDA_CLAY,
        "sand": ISDA_SAND,
        "ph":   ISDA_PH,
        "oc":   ISDA_OC,
    }
    img = images[layer]

    try:
        url = img.getThumbURL({
            "region":     region,
            "dimensions": [512, 512],
            "format":     "png",
            "min":        meta["min"],
            "max":        meta["max"],
            "palette":    meta["palette"],
        })
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except (ee.EEException, requests.RequestException) as exc:
        record_failure(SOIL_ENTRY_ID, exc)
        raise
    record_success(SOIL_ENTRY_ID)
    return resp.content