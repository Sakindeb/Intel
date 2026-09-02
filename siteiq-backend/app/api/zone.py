from fastapi import APIRouter
from pydantic import BaseModel

from app.services.kb_service import assess_zone

router = APIRouter(prefix="/zone", tags=["zone"])


class ZoneAssessmentRequest(BaseModel):
    lat: float
    lon: float
    domain: str


@router.post("/assess")
def assess(req: ZoneAssessmentRequest):
    return assess_zone(req.lat, req.lon, req.domain)