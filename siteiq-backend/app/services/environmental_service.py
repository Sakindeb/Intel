"""
environmental_service.py — orchestrates all environmental_constraints
checks for a given site into a single EnvironmentalConstraints response.

Design:
- Each individual check (protected_areas, riparian, ...) is a pure
  function with no I/O of its own — see protected_areas_service.py and
  riparian_service.py. This function is the only place that decides what
  data each check needs and where it comes from.
- OSM data is NOT fetched here. It's passed in by the caller (the
  /environmental/constraints route), which shares a single cached
  Overpass fetch with the /osm-context route via
  osm_service.get_osm_context_cached. Passing osm_data=None signals that
  the caller's OSM fetch failed — this function then produces a degraded
  ("unavailable") riparian result rather than raising.
- Wetlands, forest, and biodiversity are not yet wired in; their fields
  are left unset on EnvironmentalConstraints until their services exist.
"""

from app.models.environmental import EnvironmentalConstraints
from app.services.protected_areas_service import check_protected_areas
from app.services.riparian_service import check_riparian_zone


def get_environmental_constraints(
    lat: float,
    lon: float,
    radius_m: float,
    osm_data: dict | None,
) -> EnvironmentalConstraints:
    """
    lat, lon, radius_m: site location and analysis radius, as stored on
    the sites table.
    osm_data: result of osm_service.get_osm_context_cached(lat, lon, radius_m),
    or None if that fetch failed. This function does not fetch OSM itself.
    """
    protected_areas_result = check_protected_areas(lat, lon, radius_m)

    if osm_data is None:
        riparian_result = check_riparian_zone(waterway_distance_m=None, osm_failed=True)
    else:
        waterways = osm_data.get("waterways", [])
        nearest = waterways[0] if waterways else None
        riparian_result = check_riparian_zone(
            waterway_distance_m=nearest["distance_m"] if nearest else None,
            waterway_type=nearest["type"] if nearest else None,
        )

    return EnvironmentalConstraints(
        protected_areas=protected_areas_result,
        waterways=riparian_result,
        # wetlands, forest, biodiversity: left as their Optional defaults
        # (None) on the model until those services are built
    )