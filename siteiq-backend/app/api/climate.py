from fastapi import APIRouter, HTTPException, Query

from app.services.climate_service import fetch_climate_solar
from app.services.climate_service import ClimateService
from app.utils.cache import cache

router = APIRouter(
    prefix="/climate",
    tags=["Climate"]
)


@router.get("/climate-solar")
def get_climate_solar(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    # 3dp — NASA POWER is ~10km grid
    key = f"climate:{round(lat, 3)}:{round(lon, 3)}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        data = fetch_climate_solar(lat, lon)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Climate data error: {exc}")

    payload = {"lat": lat, "lon": lon, **data}
    # 90 days — climatology barely changes
    cache.set(key, payload, expire=60 * 60 * 24 * 90)
    return payload


@router.get("/rainfall")
def rainfall(
    lat: float,
    lon: float,
    radius_m: int = 500
):

    try:

        result = ClimateService.get_rainfall(
            lat=lat,
            lon=lon,
            radius_m=radius_m
        )

        return {
            "success": True,
            "data": result
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.get("/rainfall-map")
def rainfall_map(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(500, ge=100, le=10000),
):
    """Return an Earth Engine tile URL for the 5-year CHIRPS rainfall raster."""
    try:
        return {
            "success": True,
            "data": ClimateService.get_rainfall_map(
                lat=lat, lon=lon, radius_m=radius_m
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/temperature")
def temperature(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(500, ge=100, le=10000),
):
    """
    Return MODIS daytime Land Surface Temperature
    statistics for the selected site.
    """

    try:
        result = ClimateService.get_temperature(
            lat=lat,
            lon=lon,
            radius_m=radius_m
        )

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.get("/temperature-map")
def temperature_map(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(500, ge=100, le=10000),
):
    """
    Return an Earth Engine tile URL for the
    5-year mean MODIS daytime LST raster.
    """

    try:
        return {
            "success": True,
            "data": ClimateService.get_temperature_map(
                lat=lat,
                lon=lon,
                radius_m=radius_m
            ),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
