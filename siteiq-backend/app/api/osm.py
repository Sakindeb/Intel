import requests
from fastapi import APIRouter, HTTPException, Query

from app.services.osm_service import OSM_CACHE_TTL, OSM_RADIUS_M, fetch_osm_context, get_osm_context_cached
from app.utils.cache import cache

router = APIRouter()


@router.get("/osm-context")
def get_osm_context(
    lat:      float = Query(..., ge=-90, le=90),
    lon:      float = Query(..., ge=-180, le=180),
    radius_m: int   = Query(OSM_RADIUS_M, ge=200, le=5000),
):
    try:
        return get_osm_context_cached(lat, lon, radius_m)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Overpass API error: {exc}")
