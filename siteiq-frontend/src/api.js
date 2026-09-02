import axios from "axios";
import { getAuthHeader } from "./lib/supabase";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 25000,
});

export const tileUrl = (path, params) =>
  `${API_BASE}${path}?${new URLSearchParams(params).toString()}`;

// ============================================================================
// TERRAIN
// ============================================================================

export async function getElevation(lat, lon) {
  const { data } = await client.get("/elevation", {
    params: { lat, lon },
  });

  return data;
}

export async function getTerrain(lat, lon, radiusM = 500) {
  const { data } = await client.get("/terrain", {
    params: {
      lat,
      lon,
      radius_m: radiusM,
    },
  });

  return data;
}

export async function getTerrainProfile(lat, lon, lengthM = 500) {
  const { data } = await client.get("/terrain-profile", {
    params: {
      lat,
      lon,
      length_m: lengthM,
    },
  });

  return data;
}

export async function getElevationGrid(lat, lon, radiusM = 500) {
  const { data } = await client.get("/elevation-grid", {
    params: {
      lat,
      lon,
      radius_m: radiusM,
    },
  });

  return data;
}

// ============================================================================
// OSM / DRAINAGE CONTEXT
// ============================================================================

export async function getOsmContext(
  lat,
  lon,
  radiusM = 1000
) {
  const { data } = await client.get("/osm-context", {
    params: {
      lat,
      lon,
      radius_m: radiusM,
    },
  });

  return data;
}

// ============================================================================
// FLOOD RISK
// ============================================================================

export async function getFloodRisk(
  lat,
  lon,
  radiusM = 500,
  waterwayDistM = null
) {
  const params = {
    lat,
    lon,
    radius_m: radiusM,
  };

  if (waterwayDistM != null) {
    params.waterway_dist_m = waterwayDistM;
  }

  const { data } = await client.get("/flood-risk", {
    params,
  });

  return data;
}

// ============================================================================
// RAINFALL / CLIMATE
// ============================================================================

/**
 * Get rainfall statistics for the selected site.
 *
 * Backend:
 * GET /climate/rainfall
 */
export async function getRainfall(
  lat,
  lon,
  radiusM = 500
) {
  const { data } = await client.get("/climate/rainfall", {
    params: {
      lat,
      lon,
      radius_m: radiusM,
    },
  });

  // Backend returns:
  // {
  //   success: true,
  //   data: {...}
  // }
  //
  // Return the actual data object to the frontend.
  return data?.data ?? data;
}

/**
 * Get Earth Engine rainfall map tile information.
 *
 * Backend:
 * GET /climate/rainfall-map
 */
export async function getRainfallMap(
  lat,
  lon,
  radiusM = 500
) {
  const { data } = await client.get("/climate/rainfall-map", {
    params: {
      lat,
      lon,
      radius_m: radiusM,
    },
  });

  return data?.data ?? data;
}

/**
 * Legacy climate endpoint.
 *
 * Kept so existing components do not break while
 * rainfall is being migrated to CHIRPS.
 */
export async function getClimateSolar(lat, lon) {
  const { data } = await client.get("/climate-solar", {
    params: {
      lat,
      lon,
    },
  });

  return data;
}

// ============================================================================
// TEMPERATURE / CLIMATE
// ============================================================================

/**
 * Get daytime land surface temperature statistics for the selected site.
 * Backend: GET /climate/temperature
 */
export async function getTemperature(lat, lon, radiusM = 500) {
  const { data } = await client.get("/climate/temperature", {
    params: { lat, lon, radius_m: radiusM },
  });

  return data?.data ?? data;
}

/**
 * Get Earth Engine temperature map tile information.
 * Backend: GET /climate/temperature-map
 */
export async function getTemperatureMap(lat, lon, radiusM = 500) {
  const { data } = await client.get("/climate/temperature-map", {
    params: { lat, lon, radius_m: radiusM },
  });

  return data?.data ?? data;
}

// ============================================================================
// SOIL
// ============================================================================

export async function getSoil(lat, lon) {
  const { data } = await client.get("/soil", {
    params: {
      lat,
      lon,
    },
  });

  return data;
}

// ============================================================================
// LAND COVER
// ============================================================================

export async function getLandCover(
  lat,
  lon,
  radiusM = 500
) {
  const { data } = await client.get("/land-cover", {
    params: {
      lat,
      lon,
      radius_m: radiusM,
    },
  });

  return data;
}

// ============================================================================
// LAND USE SUITABILITY
// ============================================================================

export async function getLandUseSuitability(
  lat,
  lon,
  params = {}
) {
  const { data } = await client.get(
    "/land-use-suitability",
    {
      params: {
        lat,
        lon,
        ...params,
      },
    }
  );

  return data;
}

// ============================================================================
// SAVED ANALYSES
// IMPORTANT: DO NOT REMOVE THESE
// ExportButton.jsx depends on saveAnalysis.
// ============================================================================

export async function listAnalyses() {
  const headers = await getAuthHeader();

  const { data } = await client.get("/analyses", {
    headers,
  });

  return data;
}

export async function getAnalysis(analysisId) {
  const headers = await getAuthHeader();

  const { data } = await client.get(
    `/analyses/${analysisId}`,
    {
      headers,
    }
  );

  return data;
}

export async function saveAnalysis(payload) {
  const headers = await getAuthHeader();

  const { data } = await client.post(
    "/analyses",
    payload,
    {
      headers,
    }
  );

  return data;
}

export async function deleteAnalysis(analysisId) {
  const headers = await getAuthHeader();

  const { data } = await client.delete(
    `/analyses/${analysisId}`,
    {
      headers,
    }
  );

  return data;
}