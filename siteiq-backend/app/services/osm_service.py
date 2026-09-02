from typing import Dict, List, Optional

import requests

from app.utils.geometry import haversine_m
from app.utils.cache import cache
from app.utils.helpers import (
    AMENITY_GROUPS,
    BUILDING_TYPES,
    VEGETATION_MAP,
    classify_power,
    classify_road,
    classify_waterway,
    grid_connected,
    nearest_road_distance,
    nearest_waterway_distance,
)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_HEADERS = {"User-Agent": "construction-site-intel/0.1 (student project)"}
OSM_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days — roads/amenities change slowly

# Context buffer fixed at 1 km — covers vehicle access range and walkable amenities
# without over-fetching in dense areas
OSM_RADIUS_M = 1000


def overpass_query(lat: float, lon: float, radius_m: int, filters: List[str]) -> dict:
    """
    Run a single Overpass QL query for multiple filter strings inside one radius.
    Uses 'out geom' so every element carries its full coordinate geometry —
    nodes get top-level lat/lon, ways get a geometry[] array of {lat,lon} objects.
    """
    union_parts = "\n  ".join(
        f'{f}(around:{radius_m},{lat},{lon});' for f in filters
    )
    query = f"""
[out:json][timeout:25];
(
  {union_parts}
);
out geom;
"""
    resp = requests.post(
        OVERPASS_URL, data={"data": query}, headers=OSM_HEADERS, timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def _point(el: dict) -> Optional[Dict]:
    """Best single lat/lon for a node or the centroid of a way's geometry."""
    if el["type"] == "node":
        return {"lat": el["lat"], "lon": el["lon"]}
    geom = el.get("geometry", [])
    if not geom:
        return None
    lats = [g["lat"] for g in geom]
    lons = [g["lon"] for g in geom]
    return {"lat": sum(lats) / len(lats), "lon": sum(lons) / len(lons)}


def _line(el: dict) -> List[Dict]:
    """Full coordinate array for a way (empty list for nodes)."""
    if el["type"] != "way":
        return []
    return [{"lat": g["lat"], "lon": g["lon"]} for g in el.get("geometry", [])]


def parse_roads(elements: List[dict], lat: float, lon: float) -> List[dict]:
    seen, roads = set(), []
    for el in elements:
        tags = el.get("tags", {})
        hwy = tags.get("highway")
        if not hwy or el["id"] in seen:
            continue
        pt = _point(el)
        if not pt:
            continue
        seen.add(el["id"])
        roads.append({
            "name": tags.get("name") or tags.get("ref") or "Unnamed road",
            "type": classify_road(hwy),
            "highway_tag": hwy,
            "distance_m": round(haversine_m(lat, lon, pt["lat"], pt["lon"])),
            "centroid": pt,
            "geometry": _line(el),   # [] for nodes; polyline coords for ways
        })
    roads.sort(key=lambda r: r["distance_m"])
    return roads[:5]


def parse_waterways(elements: List[dict], lat: float, lon: float) -> List[dict]:
    seen, waterways = set(), []
    for el in elements:
        tags = el.get("tags", {})
        ww = tags.get("waterway")
        if not ww or el["id"] in seen:
            continue
        pt = _point(el)
        if not pt:
            continue
        seen.add(el["id"])
        waterways.append({
            "name": tags.get("name") or "Unnamed waterway",
            "type": classify_waterway(ww),
            "distance_m": round(haversine_m(lat, lon, pt["lat"], pt["lon"])),
            "centroid": pt,
            "geometry": _line(el),
        })
    waterways.sort(key=lambda w: w["distance_m"])
    return waterways[:5]


def parse_amenities(elements: List[dict], lat: float, lon: float) -> List[dict]:
    seen, amenities = set(), []
    for el in elements:
        tags = el.get("tags", {})
        amenity = tags.get("amenity")
        if not amenity or amenity not in AMENITY_GROUPS or el["id"] in seen:
            continue
        pt = _point(el)
        if not pt:
            continue
        seen.add(el["id"])
        amenities.append({
            "name": tags.get("name") or f"Unnamed {amenity}",
            "amenity": amenity,
            "group": AMENITY_GROUPS[amenity],
            "distance_m": round(haversine_m(lat, lon, pt["lat"], pt["lon"])),
            "lat": pt["lat"],
            "lon": pt["lon"],
        })
    amenities.sort(key=lambda a: a["distance_m"])
    return amenities[:10]


def parse_power(elements: List[dict], lat: float, lon: float) -> List[dict]:
    seen, power = set(), []
    for el in elements:
        tags = el.get("tags", {})
        pw = tags.get("power")
        if not pw or el["id"] in seen:
            continue
        pt = _point(el)
        if not pt:
            continue
        seen.add(el["id"])
        power.append({
            "type": classify_power(pw),
            "name": tags.get("name") or tags.get("ref") or None,
            "voltage": tags.get("voltage") or None,
            "distance_m": round(haversine_m(lat, lon, pt["lat"], pt["lon"])),
            "lat": pt["lat"],
            "lon": pt["lon"],
        })
    power.sort(key=lambda p: p["distance_m"])
    return power[:5]


def parse_buildings(elements: List[dict], lat: float, lon: float) -> List[dict]:
    seen, buildings = set(), []
    for el in elements:
        tags = el.get("tags", {})
        btype = tags.get("building")
        if not btype or el["id"] in seen:
            continue
        pt = _point(el)
        if not pt:
            continue
        seen.add(el["id"])
        buildings.append({
            "name":       tags.get("name") or None,
            "type":       BUILDING_TYPES.get(btype, "building"),
            "raw_type":   btype,
            "distance_m": round(haversine_m(lat, lon, pt["lat"], pt["lon"])),
            "centroid":   pt,
            "geometry":   _line(el),
        })
    buildings.sort(key=lambda b: b["distance_m"])
    return buildings[:30]


def parse_vegetation(elements: List[dict], lat: float, lon: float) -> List[dict]:
    seen, veg = set(), []
    for el in elements:
        tags = el.get("tags", {})
        raw  = tags.get("landuse") or tags.get("natural") or tags.get("leisure")
        vtype = VEGETATION_MAP.get(raw)
        if not vtype or el["id"] in seen:
            continue
        pt = _point(el)
        if not pt:
            continue
        seen.add(el["id"])
        veg.append({
            "name":       tags.get("name") or None,
            "type":       vtype,
            "raw_tag":    raw,
            "distance_m": round(haversine_m(lat, lon, pt["lat"], pt["lon"])),
            "centroid":   pt,
            "geometry":   _line(el),
        })
    veg.sort(key=lambda v: v["distance_m"])
    return veg[:20]


def fetch_osm_context(lat: float, lon: float, radius_m: int = OSM_RADIUS_M) -> dict:
    """Single Overpass round-trip: roads, waterways, amenities, power, buildings, vegetation."""
    raw = overpass_query(
        lat, lon, radius_m,
        filters=[
            'way["highway"]',
            'way["waterway"]',
            'node["amenity"]',
            'way["amenity"]',
            'node["power"]',
            'way["power"]',
            'way["building"]',
            'way["landuse"~"forest|farmland|meadow|orchard|grass|vineyard"]',
            'way["natural"~"wood|scrub|heath|grassland|wetland"]',
        ],
    )

    elements = raw.get("elements", [])

    roads      = parse_roads(elements, lat, lon)
    waterways  = parse_waterways(elements, lat, lon)
    amenities  = parse_amenities(elements, lat, lon)
    power      = parse_power(elements, lat, lon)
    buildings  = parse_buildings(elements, lat, lon)
    vegetation = parse_vegetation(elements, lat, lon)

    return {
        "search_radius_m": radius_m,
        "summary": {
            "nearest_road_m":     nearest_road_distance(roads),
            "nearest_waterway_m": nearest_waterway_distance(waterways),
            "grid_connected":     grid_connected(power),
            "amenity_count":      len(amenities),
            "building_count":     len(buildings),
            "vegetation_count":   len(vegetation),
        },
        "roads":      roads,
        "waterways":  waterways,
        "amenities":  amenities,
        "power":      power,
        "buildings":  buildings,
        "vegetation": vegetation,
    }

def get_osm_context_cached(lat: float, lon: float, radius_m: int = OSM_RADIUS_M) -> dict:
    """
    Cache-aware wrapper around fetch_osm_context. Shared by the /osm-context
    route and the environmental_constraints orchestrator so both draw from
    the same cache entry instead of independently hitting Overpass for the
    same site. Raises requests.RequestException on a genuine fetch failure —
    callers decide how to handle that.
    """
    key = f"osm:{round(lat, 4)}:{round(lon, 4)}:{radius_m}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    data = fetch_osm_context(lat, lon, radius_m)

    payload = {"lat": lat, "lon": lon, **data}
    cache.set(key, payload, expire=OSM_CACHE_TTL)
    return payload