import json

import ee

from app.config import key_dict

credentials = ee.ServiceAccountCredentials(
    email=key_dict["client_email"],
    key_data=json.dumps(key_dict),
)
ee.Initialize(credentials=credentials, project=key_dict["project_id"])

# ── Shared Earth Engine image collections ───────────────────────────────────
DEM = ee.Image("USGS/SRTMGL1_003")        # 30m global elevation
SLOPE = ee.Terrain.slope(DEM)               # degrees, 0-90
# compass degrees the slope faces, 0-360
ASPECT = ee.Terrain.aspect(DEM)
# 90m — HAND, upstream area, river mask
MERIT = ee.Image("MERIT/Hydro/v1_0_1")
# height above nearest drainage (metres)
HAND = MERIT.select("hnd")
UPA = MERIT.select("upa")                # upstream contributing area (km²)

# iSDAsoil — 30m Africa-specific soil properties
# Bands: mean_0_20 (0-20cm), mean_20_50 (20-50cm)
# Back-transforms per GEE catalog:
#   clay/sand: g/kg ÷ 10 = %
#   ph:        x ÷ 10 = pH
#   carbon_organic: exp(x/10) - 1 = g/kg → ÷10 = %
ISDA_CLAY = ee.Image("ISDASOIL/Africa/v1/clay_content").select("mean_0_20")
ISDA_SAND = ee.Image("ISDASOIL/Africa/v1/sand_content").select("mean_0_20")
ISDA_PH = ee.Image("ISDASOIL/Africa/v1/ph").select("mean_0_20")
ISDA_OC = ee.Image("ISDASOIL/Africa/v1/carbon_organic").select("mean_0_20")
ISDA_TEX = ee.Image("ISDASOIL/Africa/v1/texture_class").select("texture_0_20")

# ESA WorldCover 10m — land cover classification
ESA_LC = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")


def fetch_elevation(lat: float, lon: float):
    point = ee.Geometry.Point([lon, lat])
    result = DEM.reduceRegion(
        reducer=ee.Reducer.first(),
        geometry=point,
        scale=30,
    ).getInfo()
    return result.get("elevation")

# ── Sentinel-2 ─────────────────────────────────────────────────────────────


SENTINEL2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")


def fetch_sentinel2(
    lat: float,
    lon: float,
    start_date: str,
    end_date: str,
    cloud_percentage: float = 30,
):

    point = ee.Geometry.Point([lon, lat])

    collection = (
        SENTINEL2
        .filterBounds(point)
        .filterDate(start_date, end_date)
        .filter(
            ee.Filter.lt(
                "CLOUDY_PIXEL_PERCENTAGE",
                cloud_percentage
            )
        )
    )

    count = collection.size().getInfo()

    if count == 0:
        return {
            "available": False,
            "image_count": 0,
            "images": [],
        }

    images = collection.sort("system:time_start")

    image_list = images.toList(count)

    results = []

    for i in range(count):
        image = ee.Image(image_list.get(i))

        results.append({
            "id": image.id().getInfo(),
            "date": ee.Date(
                image.get("system:time_start")
            ).format("YYYY-MM-dd").getInfo(),
            "cloud_percentage": image.get(
                "CLOUDY_PIXEL_PERCENTAGE"
            ).getInfo(),
        })

    return {
        "available": True,
        "image_count": count,
        "images": results,
    }
