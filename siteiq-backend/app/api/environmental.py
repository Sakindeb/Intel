import requests
from fastapi import APIRouter, HTTPException, Query

from app.services.osm_service import OSM_RADIUS_M, get_osm_context_cached
from app.services.environmental_service import get_environmental_constraints

router = APIRouter(prefix="/environmental", tags=["environmental"])


@router.get("/constraints")
def get_constraints(
    lat:      float = Query(..., ge=-90, le=90),
    lon:      float = Query(..., ge=-180, le=180),
    radius_m: float = Query(500, ge=1),
):
    try:
        osm_data = get_osm_context_cached(lat, lon, int(radius_m))
    except requests.RequestException:
        osm_data = None  # degrade gracefully — environmental_service handles this

    return get_environmental_constraints(lat, lon, radius_m, osm_data=osm_data)