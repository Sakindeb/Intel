from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.sentinel2_service import Sentinel2Service


router = APIRouter(
    prefix="/sentinel2",
    tags=["Sentinel-2"]
)


class Sentinel2Request(BaseModel):
    lat: float
    lon: float
    start_date: str
    end_date: str
    cloud_percentage: float = 30


@router.post("/run")
def run_sentinel2(request: Sentinel2Request):

    try:

        result = Sentinel2Service.run(
            lat=request.lat,
            lon=request.lon,
            start_date=request.start_date,
            end_date=request.end_date,
            cloud_percentage=request.cloud_percentage,
        )

        return result

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
