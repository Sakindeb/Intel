import ee
from datetime import datetime
import requests

# ── NASA POWER endpoints ──────────────────────────────────────────────────────
# Monthly endpoint: dates must be YYYYMM, NOT YYYYMMDD  ← this was the 422 cause
NASA_POWER_MONTHLY_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
# Climatology endpoint: no dates needed, returns long-term monthly means
NASA_POWER_CLIM_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"

NASA_POWER_VARS = "PRECTOTCORR,T2M_MAX,T2M_MIN,ALLSKY_SFC_SW_DWN"
MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May",
                "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_3L = ["JAN", "FEB", "MAR", "APR", "MAY",
             "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

# 2014–2023: 10 complete years guaranteed published by NASA POWER
NASA_START_YEAR = 2014
NASA_END_YEAR = 2023

_HEADERS = {"User-Agent": "construction-site-intel/0.1 (student project)"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _solar_viability(annual_ghi: float, peak_month: str) -> tuple[str, str]:
    if annual_ghi >= 5.0:
        return "excellent", f"Strong year-round irradiance ({annual_ghi} kWh/m²/day). Off-grid solar highly viable. Peak in {peak_month}."
    if annual_ghi >= 4.0:
        return "good",      f"Good solar resource ({annual_ghi} kWh/m²/day). Grid-tied or off-grid solar viable. Peak in {peak_month}."
    if annual_ghi >= 3.0:
        return "moderate",  f"Moderate solar resource ({annual_ghi} kWh/m²/day). Solar viable with adequate panel area."
    return "poor",          f"Limited solar resource ({annual_ghi} kWh/m²/day). Grid connection recommended."


def _build_summary(rainfall, solar_ghi, period):
    annual_rain = round(sum(rainfall), 1)
    annual_solar = round(sum(solar_ghi) / 12, 2)
    mean_rain = annual_rain / 12
    wet_months = [MONTH_LABELS[i]
                  for i, r in enumerate(rainfall) if r > mean_rain]
    peak_m = MONTH_LABELS[solar_ghi.index(max(solar_ghi))]
    viability, note = _solar_viability(annual_solar, peak_m)

    return {
        "annual_rainfall_mm": annual_rain,
        "annual_solar_ghi":   annual_solar,
        "wet_months":         wet_months,
        "solar_viability":    viability,
        "solar_note":         note,
    }


def _build_response(vars_by_month: dict, period: str) -> dict:
    """
    vars_by_month: keys = NASA var names, values = list[float] length 12 (Jan–Dec)
    """
    rainfall = [round(v, 1) for v in vars_by_month["PRECTOTCORR"]]
    temp_max = [round(v, 1) for v in vars_by_month["T2M_MAX"]]
    temp_min = [round(v, 1) for v in vars_by_month["T2M_MIN"]]
    solar_ghi = [round(v, 2) for v in vars_by_month["ALLSKY_SFC_SW_DWN"]]

    return {
        "period":  period,
        "monthly": [
            {
                "month":       MONTH_LABELS[i],
                "rainfall_mm": rainfall[i],
                "temp_max_c":  temp_max[i],
                "temp_min_c":  temp_min[i],
                "solar_ghi":   solar_ghi[i],
            }
            for i in range(12)
        ],
        "summary": _build_summary(rainfall, solar_ghi, period),
    }


# ── primary: 10-year monthly endpoint ─────────────────────────────────────────

def _fetch_monthly(lat: float, lon: float) -> dict:
    """
    Use temporal/monthly endpoint with YYYYMM date format.
    Returns 10-year monthly averages (2014–2023).
    """
    resp = requests.get(
        NASA_POWER_MONTHLY_URL,
        params={
            "parameters": NASA_POWER_VARS,
            "community":  "RE",
            "longitude":  round(lon, 4),   # >4dp causes 422
            "latitude":   round(lat, 4),
            "start":      f"{NASA_START_YEAR}01",   # YYYYMM ← correct format
            "end":        f"{NASA_END_YEAR}12",     # YYYYMM ← correct format
            "format":     "JSON",
        },
        headers=_HEADERS,
        timeout=25,
    )
    resp.raise_for_status()
    raw = resp.json()["properties"]["parameter"]

    # Accumulate values per calendar month (response keys = YYYYMM strings)
    acc: dict = {v: {m: [] for m in range(1, 13)} for v in raw}
    for var in acc:
        for key, val in raw[var].items():
            # key is 6-char YYYYMM; filter NASA missing-value sentinel (-999)
            if len(str(key)) == 6 and float(val) > -900:
                month = int(str(key)[4:6])
                acc[var][month].append(float(val))

    vars_by_month = {
        v: [
            round(sum(acc[v][m]) / len(acc[v][m]), 4) if acc[v][m] else 0.0
            for m in range(1, 13)
        ]
        for v in acc
    }

    period = f"{NASA_START_YEAR}–{NASA_END_YEAR} (10-year mean)"
    return _build_response(vars_by_month, period)


# ── fallback: climatology endpoint ────────────────────────────────────────────

def _fetch_climatology(lat: float, lon: float) -> dict:
    """
    Fallback when monthly endpoint fails.
    NASA POWER climatology returns long-term monthly averages (JAN/FEB/… keys).
    """
    resp = requests.get(
        NASA_POWER_CLIM_URL,
        params={
            "parameters": NASA_POWER_VARS,
            "community":  "RE",
            "longitude":  round(lon, 4),
            "latitude":   round(lat, 4),
            "format":     "JSON",
        },
        headers=_HEADERS,
        timeout=25,
    )
    resp.raise_for_status()
    raw = resp.json()["properties"]["parameter"]

    # Climatology response uses 3-letter month keys (JAN, FEB, …) + ANN
    vars_by_month = {
        v: [
            float(raw[v].get(m, 0)) for m in MONTHS_3L
        ]
        for v in raw
    }

    return _build_response(vars_by_month, "Climatological mean (multi-year)")


# ── public entry point ────────────────────────────────────────────────────────

def fetch_climate_solar(lat: float, lon: float) -> dict:
    """
    Fetch climate + solar data.
    Primary: 10-year monthly averages from NASA POWER temporal/monthly.
    Fallback: NASA POWER climatology endpoint if monthly fails for any reason.
    """
    try:
        return _fetch_monthly(lat, lon)
    except Exception as monthly_err:
        try:
            result = _fetch_climatology(lat, lon)
            # Annotate so callers know which source was used
            result["fallback"] = True
            result["fallback_reason"] = str(monthly_err)
            return result
        except Exception as clim_err:
            # Both failed — re-raise the climatology error (more informative)
            raise RuntimeError(
                f"Monthly endpoint: {monthly_err} | Climatology fallback: {clim_err}"
            ) from clim_err


class ClimateService:

    @staticmethod
    def get_rainfall(lat: float, lon: float, radius_m: int = 500):
        """
        Calculate rainfall statistics around a selected site.

        Uses CHIRPS daily precipitation.
        """

        point = ee.Geometry.Point([lon, lat])

        region = point.buffer(radius_m)

        # CHIRPS rainfall dataset
        collection = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterBounds(region)
        )

        # Last 5 years
        end_date = ee.Date(datetime.utcnow().strftime("%Y-%m-%d"))
        start_date = end_date.advance(-5, "year")

        rainfall = collection.filterDate(start_date, end_date)

        # Total rainfall over the 5-year period
        total_rainfall = (
            rainfall
            .select("precipitation")
            .sum()
        )

        # Average annual rainfall
        annual_rainfall = total_rainfall.divide(5)

        result = annual_rainfall.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=region,
            scale=5566,
            maxPixels=1e9
        ).getInfo()

        rainfall_value = result.get("precipitation")

        return {
            "annual_rainfall_mm": round(
                float(rainfall_value), 2
            ) if rainfall_value is not None else None,
            "period_years": 5,
            "dataset": "CHIRPS"
        }

    @staticmethod
    def get_rainfall_map(lat: float, lon: float, radius_m: int = 500):
        """
        Create an Earth Engine tile layer for the same 5-year average
        annual CHIRPS rainfall used by get_rainfall().
        """
        point = ee.Geometry.Point([lon, lat])
        region = point.buffer(radius_m)

        end_date = ee.Date(datetime.utcnow().strftime("%Y-%m-%d"))
        start_date = end_date.advance(-5, "year")

        rainfall = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterBounds(region)
            .filterDate(start_date, end_date)
            .select("precipitation")
            .sum()
            .divide(5)
            .clip(region)
        )

        # Visualization is intentionally broad enough for Nairobi and
        # comparable Kenyan environments. The underlying raster remains
        # continuous CHIRPS rainfall values in mm/year.
        vis = {
            "min": 0,
            "max": 2000,
            "palette": [
                "#f7fbff", "#c6dbef", "#6baed6",
                "#2171b5", "#08306b"
            ],
            "opacity": 0.55,
        }

        map_id = rainfall.getMapId(vis)
        return {
            "tile_url": map_id["tile_fetcher"].url_format,
            "radius_m": radius_m,
            "period_years": 5,
            "dataset": "CHIRPS",
            "min_mm": 0,
            "max_mm": 2000,
        }

    @staticmethod
    def get_temperature(
        lat: float,
        lon: float,
        radius_m: int = 500
    ):
        """
        Calculate MODIS daytime Land Surface Temperature
        statistics around a selected site.

        Dataset:
        MODIS/061/MOD11A2

        LST_Day_1km:
        - 8-day composite
        - 1 km spatial resolution
        - Stored in Kelvin
        - Scale factor = 0.02

        Output temperatures are converted to Celsius.
        """

        point = ee.Geometry.Point([lon, lat])
        region = point.buffer(radius_m)

        # Last 5 years
        end_date = ee.Date(
            datetime.utcnow().strftime("%Y-%m-%d")
        )
        start_date = end_date.advance(-5, "year")

        collection = (
            ee.ImageCollection("MODIS/061/MOD11A2")
            .filterBounds(region)
            .filterDate(start_date, end_date)
            .select("LST_Day_1km")
        )

        # Convert MODIS digital values to Celsius:
        #
        # Kelvin = raw_value * 0.02
        # Celsius = Kelvin - 273.15
        temperature = (
            collection
            .mean()
            .multiply(0.02)
            .subtract(273.15)
        )

        # Mean temperature over selected site/radius
        mean_result = temperature.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=region,
            scale=1000,
            maxPixels=1e9
        ).getInfo()

        # Maximum observed daytime LST during the period
        maximum_temperature = (
            collection
            .max()
            .multiply(0.02)
            .subtract(273.15)
        )

        max_result = maximum_temperature.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=region,
            scale=1000,
            maxPixels=1e9
        ).getInfo()

        mean_temp = mean_result.get("LST_Day_1km")
        max_temp = max_result.get("LST_Day_1km")

        return {
            "mean_temperature_c": round(
                float(mean_temp), 2
            ) if mean_temp is not None else None,

            "maximum_temperature_c": round(
                float(max_temp), 2
            ) if max_temp is not None else None,

            "period_years": 5,

            "dataset": "MODIS MOD11A2.061",

            "resolution_m": 1000,

            "temperature_type": "Daytime Land Surface Temperature"
        }

    @staticmethod
    def get_temperature_map(
        lat: float,
        lon: float,
        radius_m: int = 500
    ):
        """
        Create an Earth Engine tile layer for the
        5-year mean daytime MODIS Land Surface Temperature.
        """

        point = ee.Geometry.Point([lon, lat])
        region = point.buffer(radius_m)

        # Last 5 years
        end_date = ee.Date(
            datetime.utcnow().strftime("%Y-%m-%d")
        )
        start_date = end_date.advance(-5, "year")

        temperature = (
            ee.ImageCollection("MODIS/061/MOD11A2")
            .filterBounds(region)
            .filterDate(start_date, end_date)
            .select("LST_Day_1km")
            .mean()
            .multiply(0.02)
            .subtract(273.15)
            .clip(region)
        )

        # Temperature visualization in Celsius
        vis = {
            "min": 15,
            "max": 40,
            "palette": [
                "#313695",
                "#4575b4",
                "#74add1",
                "#abd9e9",
                "#fee090",
                "#fdae61",
                "#f46d43",
                "#d73027",
                "#a50026"
            ],
            "opacity": 0.60,
        }

        map_id = temperature.getMapId(vis)

        return {
            "tile_url": map_id["tile_fetcher"].url_format,
            "radius_m": radius_m,
            "period_years": 5,
            "dataset": "MODIS MOD11A2.061",
            "resolution_m": 1000,
            "min_c": 15,
            "max_c": 40,
            "temperature_type": "Daytime Land Surface Temperature"
        }
