import { TileLayer, Circle } from "react-leaflet";

export default function TemperatureOverlay({ pin, temperatureMap, extent }) {
  if (!pin || !temperatureMap?.tile_url) return null;

  return (
    <>
      <TileLayer
        key={`${pin.lat}-${pin.lon}-${extent ?? 500}-${temperatureMap.tile_url}`}
        url={temperatureMap.tile_url}
        opacity={0.60}
        attribution="MODIS MOD11A2.061 · NASA/USGS"
      />
      <Circle
        center={[pin.lat, pin.lon]}
        radius={temperatureMap.radius_m ?? extent ?? 500}
        pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.04, weight: 1.5, dashArray: "6 4" }}
      />
    </>
  );
}
