import datetime
import time
from typing import Any, Dict

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response

from app.services.pdf_service import generate_assessment_report_pdf, generate_site_report_pdf, generate_topo_pdf
from app.utils.cache import cache

router = APIRouter()


@router.get("/topo-pdf", response_class=Response)
def get_topo_pdf(
    lat:      float = Query(..., ge=-90,   le=90),
    lon:      float = Query(..., ge=-180,  le=180),
    radius_m: int   = Query(500, ge=100,   le=5000),
    title:    str   = Query("Site Topographic Map"),
):
    try:
        pdf_bytes = generate_topo_pdf(lat, lon, radius_m, title)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"PDF generation error: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="site_topo_{round(lat,4)}_{round(lon,4)}.pdf"'},
    )


@router.get("/site-report-pdf", response_class=Response)
def get_site_report_pdf(
    lat:      float = Query(..., ge=-90,  le=90),
    lon:      float = Query(..., ge=-180, le=180),
    radius_m: int   = Query(500, ge=100,  le=5000),
    title:    str   = Query("Site Intelligence Report"),
):
    try:
        pdf_bytes = generate_site_report_pdf(lat, lon, radius_m, title)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Report generation error: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="site_report_{round(lat,4)}_{round(lon,4)}.pdf"'},
    )


@router.post("/site-report-pdf", response_class=Response)
def post_site_report_pdf(payload: Dict[str, Any] = Body(...)):
    """
    POST version — accepts pre-fetched flood_risk, soil, climate_solar as JSON body.
    Skips re-fetching those from GEE/NASA POWER, so generation is much faster.
    """
    lat       = payload.get("lat")
    lon       = payload.get("lon")
    radius_m  = payload.get("radius_m", 500)
    title     = payload.get("title", "Site Intelligence Report")
    pre_flood = payload.get("flood_risk")
    pre_soil  = payload.get("soil")
    pre_clim  = payload.get("climate_solar")

    if lat is None or lon is None:
        raise HTTPException(status_code=422, detail="lat and lon are required")

    try:
        pdf_bytes = generate_site_report_pdf(
            lat, lon, radius_m, title,
            pre_flood=pre_flood, pre_soil=pre_soil, pre_clim=pre_clim,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Report error: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="site_report_{round(lat,4)}_{round(lon,4)}.pdf"'},
    )


@router.post("/assessment-report-pdf", response_class=Response)
def post_assessment_report_pdf(payload: Dict[str, Any] = Body(...)):
    lat = payload.get("lat")
    lon = payload.get("lon")
    radius_m = payload.get("radius_m", 500)
    title = payload.get("title", "Assessment Report")
    recommendation = payload.get("recommendation")
    indicators = payload.get("indicators")
    purpose = payload.get("purpose")
    include_factual_data = bool(payload.get("include_factual_data", False))

    if lat is None or lon is None:
        raise HTTPException(status_code=422, detail="lat and lon are required")

    try:
        pdf_bytes = generate_assessment_report_pdf(
            lat,
            lon,
            radius_m,
            title,
            recommendation=recommendation,
            indicators=indicators,
            purpose=purpose,
            include_factual_data=include_factual_data,
            elevation=payload.get("elevation"),
            terrain=payload.get("terrain"),
            flood_risk=payload.get("flood_risk"),
            soil=payload.get("soil"),
            climate_solar=payload.get("climate_solar"),
            land_cover=payload.get("land_cover"),
            osm=payload.get("osm"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Assessment report error: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="assessment_report_{round(lat,4)}_{round(lon,4)}.pdf"'},
    )


# ─── Feedback ─────────────────────────────────────────────────────────────────
# No dedicated api/feedback.py in the target structure, so these live here
# alongside the other export/output-style endpoints.

@router.post("/feedback")
def post_feedback(
    comment: str = Body(..., embed=True, min_length=1, max_length=1000),
    kind:    str = Body("thought", embed=True),   # thought | bug | idea
):
    """
    Anonymous feedback store. No names, no emails, no IPs logged.
    Just your words, floating in a diskcache somewhere in Render.
    """
    key     = f"fb:{int(time.time() * 1000)}"
    payload = {
        "comment":   comment.strip(),
        "kind":      kind,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }
    cache.set(key, payload, expire=60 * 60 * 24 * 365)   # keep for a year

    all_keys  = list(cache.iterkeys())
    fb_keys   = [k for k in all_keys if str(k).startswith("fb:")]

    return {
        "received": True,
        "total_thoughts": len(fb_keys),
        "message": "Got it. Stored anonymously. I genuinely don't know who you are.",
    }


@router.get("/feedback/all")
def get_all_feedback():
    """For the developer's eyes only — but it's all anonymous anyway."""
    all_keys = list(cache.iterkeys())
    fb_keys  = sorted([k for k in all_keys if str(k).startswith("fb:")])
    items    = [cache.get(k) for k in fb_keys if cache.get(k)]
    return {"count": len(items), "feedback": items}
