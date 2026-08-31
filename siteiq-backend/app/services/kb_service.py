"""
Thin wrapper around piedcrow-land-kb. Combines SiteIQ's existing service
outputs into the shape kb.lookup.assess() expects.
"""
from kb.lookup import assess as kb_assess
from kb.holdridge import classify as holdridge_classify
from app.services import soil_service, landcover_service, gee
from .climate_service import get_holdridge_inputs
# TODO: import your real indicator functions, e.g.:
# from .soil_service import get_soil_organic_carbon
# from .landcover_service import get_bare_ground_fraction
# from .gee import get_ndvi_trend_5yr


def assess_zone(lat: float, lon: float, domain: str) -> dict:
    monthly_temps, annual_precip = get_holdridge_inputs(lat, lon)

    # TODO: replace these None placeholders with real calls into your
    # existing soil_service / landcover_service / gee.py functions
    indicator_values = {
        "bare_ground_fraction": None,
        "ndvi_trend_5yr": None,
        "soil_organic_carbon": None,
    }

    result = kb_assess(
        lat=lat, lon=lon,
        indicator_values=indicator_values,
        monthly_mean_temps_c=monthly_temps,
        annual_precip_mm=annual_precip,
        domain=domain,
    )
    holdridge = holdridge_classify(monthly_temps, annual_precip)

    return {
        "zone_id": result.zone_id,
        "holdridge_label": holdridge.label,
        "statuses": result.statuses,
        "score": result.score,
        "recommended_interventions": result.recommended_interventions,
    }