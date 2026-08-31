from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import climate, flood, health, landcover, osm, report, soil, terrain, auth, sites, analyses, zone
from app.dependencies import CORS_ALLOW_ORIGIN_REGEX

app = FastAPI(title="Site Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(terrain.router)
app.include_router(osm.router)
app.include_router(flood.router)
app.include_router(soil.router)
app.include_router(climate.router)
app.include_router(report.router)
app.include_router(landcover.router)
app.include_router(auth.router)
app.include_router(sites.router)
app.include_router(analyses.router)
app.include_router(zone.router)
