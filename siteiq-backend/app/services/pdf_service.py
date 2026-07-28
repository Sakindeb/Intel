import datetime
import io
import math
from typing import Any, Optional

import matplotlib
matplotlib.use("Agg", force=True)
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.backends.backend_pdf import PdfPages

from app.services.climate_service import NASA_END_YEAR, NASA_START_YEAR, fetch_climate_solar
from app.services.flood_service import fetch_flood_risk
from app.services.osm_service import fetch_osm_context
from app.services.soil_service import fetch_soil
from app.services.terrain_service import fetch_elevation_grid
from app.utils.plotting import (
    _contour_levels,
    _draw_info_strip,
    _draw_north_arrow,
    _draw_osm_on_ax,
    _draw_scale_bar,
)


def generate_topo_pdf(lat: float, lon: float, radius_m: int, title: str) -> bytes:
    # ── Fetch data (all cached after first pin click) ──────────────────────
    grid_data = fetch_elevation_grid(lat, lon, radius_m)
    try:
        osm_data = fetch_osm_context(lat, lon, radius_m)   # match OSM to analysis radius
    except Exception:
        osm_data = None

    bounds = grid_data["bounds"]
    rows, cols = grid_data["rows"], grid_data["cols"]
    grid_np = np.array(grid_data["grid"], dtype=float)
    grid_np[grid_np == -9999] = np.nan

    # lon/lat axes matching the GEE sampleRectangle output (row 0 = north)
    lon_axis = np.linspace(bounds["west"],  bounds["east"],  cols)
    lat_axis = np.linspace(bounds["north"], bounds["south"], rows)

    # ── Figure setup — A4 landscape ────────────────────────────────────────
    fig = plt.figure(figsize=(11.69, 8.27))

    # Main map — leaves room below for scale strip and above for title
    ax      = fig.add_axes([0.06, 0.16, 0.70, 0.76])   # map frame
    ax_sc   = fig.add_axes([0.06, 0.06, 0.70, 0.07])   # scale strip below map
    ax_info = fig.add_axes([0.78, 0.10, 0.20, 0.82])   # info strip right
    ax_sc.axis("off")
    ax_info.axis("off")

    # ── Contours ───────────────────────────────────────────────────────────
    levels = _contour_levels(grid_np.flatten().tolist())
    if levels:
        cs = ax.contour(
            lon_axis, lat_axis, grid_np,
            levels=levels,
            colors="#7B4F2E",
            linewidths=0.6,
        )
        ax.clabel(cs, inline=True, fontsize=5, fmt="%dm",
                  colors="#5a3920",
                  inline_spacing=2)

    # ── OSM roads ──────────────────────────────────────────────────────────
    if osm_data:
        ROAD_COLORS = {
            "major road":     "#c0622a",
            "secondary road": "#c0832a",
            "local road":     "#a09070",
            "track / path":   "#c8c0b0",
        }
        VEG_COLORS = {
            "forest":    ("#2d6a1f", 0.18),
            "farmland":  ("#c8b44a", 0.15),
            "grassland": ("#9ecf6a", 0.15),
            "scrub":     ("#7ab36a", 0.12),
            "wetland":   ("#4a9fc7", 0.12),
        }
        # Vegetation polygons (bottom-most layer)
        for veg in osm_data.get("vegetation", []):
            geom = veg.get("geometry", [])
            if len(geom) >= 3:
                xs = [p["lon"] for p in geom]
                ys = [p["lat"] for p in geom]
                col, alpha = VEG_COLORS.get(veg["type"], ("#aaa", 0.10))
                ax.fill(xs, ys, color=col, alpha=alpha, zorder=1)
                ax.plot(xs + [xs[0]], ys + [ys[0]], color=col, linewidth=0.3, alpha=0.4, zorder=1)

        # Buildings
        for bld in osm_data.get("buildings", []):
            geom = bld.get("geometry", [])
            if len(geom) >= 3:
                xs = [p["lon"] for p in geom]
                ys = [p["lat"] for p in geom]
                ax.fill(xs, ys, color="#c8c0b8", alpha=0.7, zorder=2)
                ax.plot(xs + [xs[0]], ys + [ys[0]], color="#888", linewidth=0.4, zorder=2)

        for road in osm_data.get("roads", []):
            geom = road.get("geometry", [])
            if len(geom) >= 2:
                xs = [p["lon"] for p in geom]
                ys = [p["lat"] for p in geom]
                ax.plot(xs, ys, color=ROAD_COLORS.get(road["type"], "#a09070"),
                        linewidth=0.8, solid_capstyle="round", zorder=3)

        for ww in osm_data.get("waterways", []):
            geom = ww.get("geometry", [])
            if len(geom) >= 2:
                xs = [p["lon"] for p in geom]
                ys = [p["lat"] for p in geom]
                ax.plot(xs, ys, color="#3a8fc7", linewidth=0.9,
                        linestyle="--", solid_capstyle="round", zorder=3)

        for am in osm_data.get("amenities", []):
            COLORS = {"education": "#7b52ab", "health": "#c0392b",
                      "emergency": "#e74c3c", "commerce": "#2ecc71"}
            ax.plot(am["lon"], am["lat"], "o",
                    color=COLORS.get(am["group"], "#555"),
                    markersize=3, zorder=4)

    # ── Site pin ───────────────────────────────────────────────────────────
    ax.plot(lon, lat, "r^", markersize=7, zorder=5, label="Site")
    ax.plot(lon, lat, "r^", markersize=7, zorder=5,
            path_effects=[pe.withStroke(linewidth=2, foreground="white")])

    # ── Axis formatting — no lat/lon labels, keep numeric ticks ──────────
    ax.set_xlim(bounds["west"],  bounds["east"])
    ax.set_ylim(bounds["south"], bounds["north"])
    ax.tick_params(labelsize=6)
    ax.grid(True, linestyle=":", linewidth=0.3, alpha=0.5, color="#999")
    for spine in ax.spines.values():
        spine.set_linewidth(0.8)

    # ── Scale bar — drawn in the dedicated strip below the map ────────────
    km_per_deg = 111.32 * math.cos(math.radians(lat))
    map_width_km = (bounds["east"] - bounds["west"]) * km_per_deg
    bar_km  = max(0.1, round(map_width_km / 4, 1))
    bar_frac = bar_km / map_width_km   # fraction of strip width

    # Black + white alternating rectangles in normalised axes coords
    ax_sc.add_patch(plt.Rectangle((0.0, 0.3), bar_frac / 2, 0.4,
                                   facecolor="black", transform=ax_sc.transAxes))
    ax_sc.add_patch(plt.Rectangle((bar_frac / 2, 0.3), bar_frac / 2, 0.4,
                                   facecolor="white", edgecolor="black", linewidth=0.5,
                                   transform=ax_sc.transAxes))
    ax_sc.text(0.0,         0.1, "0",          fontsize=6, ha="center", transform=ax_sc.transAxes)
    ax_sc.text(bar_frac,    0.1, f"{bar_km:.1f} km", fontsize=6, ha="center", transform=ax_sc.transAxes)
    ax_sc.text(bar_frac / 2, 1.0, "Scale", fontsize=5.5, ha="center", va="bottom",
               transform=ax_sc.transAxes, color="#555")

    # ── North arrow ────────────────────────────────────────────────────────
    na_x = bounds["east"]  - 0.06 * (bounds["east"] - bounds["west"])
    na_y = bounds["north"] - 0.06 * (bounds["north"] - bounds["south"])
    arr_len = 0.025 * (bounds["north"] - bounds["south"])
    ax.annotate("", xy=(na_x, na_y), xytext=(na_x, na_y - arr_len),
                arrowprops=dict(arrowstyle="-|>", color="black", lw=1.2))
    ax.text(na_x, na_y + arr_len * 0.3, "N", ha="center", va="bottom",
            fontsize=7, fontweight="bold")

    # ── Info strip ─────────────────────────────────────────────────────────
    info_y = 0.97
    def info_line(text, y, size=7, bold=False, color="black"):
        ax_info.text(0.02, y, text, transform=ax_info.transAxes,
                     fontsize=size, fontweight="bold" if bold else "normal",
                     color=color, va="top", wrap=True)

    info_line(title, info_y, size=9, bold=True)
    info_y -= 0.06
    info_line(f"Lat: {lat:.5f}  Lon: {lon:.5f}", info_y, size=6.5)
    info_y -= 0.04
    info_line(f"Analysis radius: {radius_m}m", info_y, size=6.5)
    info_y -= 0.04
    info_line(f"Elevation range:", info_y, size=6.5, bold=True)
    valid = grid_np[~np.isnan(grid_np)]
    if valid.size:
        info_y -= 0.035
        info_line(f"  Min: {valid.min():.0f}m", info_y, size=6.5)
        info_y -= 0.03
        info_line(f"  Max: {valid.max():.0f}m", info_y, size=6.5)
        info_y -= 0.03
        info_line(f"  Range: {valid.max()-valid.min():.0f}m", info_y, size=6.5)

    # Legend
    info_y -= 0.07
    info_line("Legend", info_y, size=7, bold=True)
    legend_items = [
        ("#7B4F2E", "─",  "Contours"),
        ("#c0622a", "─",  "Major road"),
        ("#c0832a", "─",  "Secondary road"),
        ("#a09070", "─",  "Local road"),
        ("#3a8fc7", "--", "Waterway"),
        ("#c8c0b8", "■",  "Building"),
        ("#2d6a1f", "■",  "Forest"),
        ("#c8b44a", "■",  "Farmland"),
        ("#9ecf6a", "■",  "Grassland"),
        ("#ff0000", "▲",  "Site pin"),
        ("#7b52ab", "●",  "Education"),
        ("#c0392b", "●",  "Health facility"),
    ]
    for color, sym, label in legend_items:
        info_y -= 0.04
        ax_info.text(0.04, info_y, sym, transform=ax_info.transAxes,
                     fontsize=8, color=color, va="top")
        ax_info.text(0.18, info_y, label, transform=ax_info.transAxes,
                     fontsize=6, va="top")

    # Data sources footer
    info_y -= 0.07
    info_line("Data sources:", info_y, size=6, bold=True)
    info_y -= 0.035
    info_line("Elevation: SRTM 30m (NASA/USGS)", info_y, size=5.5, color="#555")
    info_y -= 0.03
    info_line("Context: OpenStreetMap contributors", info_y, size=5.5, color="#555")
    info_y -= 0.03
    info_line("Indicative use only. Not a licensed survey.", info_y, size=5.5, color="#888")

    # ── Figure title + footer ──────────────────────────────────────────────
    fig.text(0.06, 0.96, title, fontsize=11, fontweight="bold", va="bottom")
    fig.text(0.06, 0.03,
             f"Generated by Site Intelligence · {datetime.date.today().isoformat()} · "
             f"sakinsiteintel.vercel.app",
             fontsize=6, color="#888")

    # ── Export to PDF bytes ────────────────────────────────────────────────
    buf = io.BytesIO()
    fig.savefig(buf, format="pdf", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def build_assessment_report_sections(
    recommendation: Optional[dict] = None,
    indicators: Optional[dict] = None,
    purpose: Optional[str] = None,
    include_factual_data: bool = False,
    elevation: Optional[dict] = None,
    terrain: Optional[dict] = None,
    flood_risk: Optional[dict] = None,
    soil: Optional[dict] = None,
    climate_solar: Optional[dict] = None,
    land_cover: Optional[dict] = None,
    osm: Optional[dict] = None,
) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []

    if recommendation:
        score = recommendation.get("score", "—")
        summary = recommendation.get("summary", "—")
        strengths = recommendation.get("strengths") or []
        considerations = recommendation.get("considerations") or []
        actions = recommendation.get("recommendations") or []
        domain_specific = recommendation.get("domain_specific") or {}

        lines = [
            f"Purpose: {recommendation.get('purpose_label') or purpose or '—'}",
            f"Score: {score}/100",
            f"Summary: {summary}",
        ]
        if strengths:
            lines.append("Strengths:")
            lines.extend([f"- {item}" for item in strengths])
        if considerations:
            lines.append("Considerations:")
            lines.extend([f"- {item}" for item in considerations])
        if actions:
            lines.append("Recommendations:")
            lines.extend([f"- {item}" for item in actions])
        if domain_specific.get("recommended_crops"):
            lines.append("Recommended crops: " + ", ".join(domain_specific["recommended_crops"]))
        if domain_specific.get("foundation_type_hint"):
            lines.append("Foundation hint: " + domain_specific["foundation_type_hint"])
        sections.append({"title": "Assessment Summary", "lines": lines})

    if indicators:
        lines = []
        if indicators.get("terrain"):
            lines.append(f"Terrain: {indicators['terrain']}")
        if indicators.get("flood"):
            lines.append(f"Flood: {indicators['flood']}")
        if indicators.get("soil"):
            lines.append(f"Soil: {indicators['soil']}")
        if indicators.get("climate"):
            lines.append(f"Climate: {indicators['climate']}")
        if indicators.get("solar"):
            lines.append(f"Solar: {indicators['solar']}")
        if indicators.get("land_cover"):
            lines.append(f"Land cover: {indicators['land_cover']}")
        if indicators.get("site_context"):
            lines.append(f"Site context: {indicators['site_context']}")
        if lines:
            sections.append({"title": "Indicator Summary", "lines": lines})

    if include_factual_data:
        lines = []
        if elevation:
            lines.append(f"Elevation: {elevation.get('elevation_m', '—')}m")
        if terrain and terrain.get("point"):
            p = terrain["point"]
            lines.append(f"Slope: {p.get('slope_deg', '—')}°")
            lines.append(f"Aspect: {p.get('aspect_deg', '—')}°")
        if flood_risk and flood_risk.get("risk"):
            r = flood_risk["risk"]
            lines.append(f"Flood risk: {r.get('level', '—').upper()} — {r.get('label', '—')}")
        if soil and soil.get("texture"):
            t = soil["texture"]
            lines.append(f"Soil texture: {t.get('class_name', '—')}")
        if climate_solar and climate_solar.get("summary"):
            s = climate_solar["summary"]
            lines.append(f"Annual rainfall: {s.get('annual_rainfall_mm', '—')}mm")
            lines.append(f"Solar viability: {s.get('solar_viability', '—')}")
        if land_cover:
            lines.append(f"Dominant land cover: {land_cover.get('dominant_label', '—')}")
        if osm and osm.get("summary"):
            summary = osm["summary"]
            lines.append(f"Nearest road: {summary.get('nearest_road_m', '—')}m")
            lines.append(f"Nearest waterway: {summary.get('nearest_waterway_m', '—')}m")
        if lines:
            sections.append({"title": "Factual Data", "lines": lines})

    return sections


def generate_assessment_report_pdf(
    lat: float,
    lon: float,
    radius_m: int,
    title: str,
    recommendation: Optional[dict] = None,
    indicators: Optional[dict] = None,
    purpose: Optional[str] = None,
    include_factual_data: bool = False,
    elevation: Optional[dict] = None,
    terrain: Optional[dict] = None,
    flood_risk: Optional[dict] = None,
    soil: Optional[dict] = None,
    climate_solar: Optional[dict] = None,
    land_cover: Optional[dict] = None,
    osm: Optional[dict] = None,
) -> bytes:
    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        sections = build_assessment_report_sections(
            recommendation=recommendation,
            indicators=indicators,
            purpose=purpose,
            include_factual_data=include_factual_data,
            elevation=elevation,
            terrain=terrain,
            flood_risk=flood_risk,
            soil=soil,
            climate_solar=climate_solar,
            land_cover=land_cover,
            osm=osm,
        )

        fig = plt.figure(figsize=(11.69, 8.27))
        ax = fig.add_axes([0.05, 0.08, 0.9, 0.84])
        ax.axis("off")

        fig.text(0.05, 0.95, title, fontsize=14, fontweight="bold")
        fig.text(0.05, 0.91, f"Site: {lat:.5f}, {lon:.5f}  ·  Radius: {radius_m}m", fontsize=9, color="#4b5563")

        y = 0.86
        for section in sections:
            fig.text(0.05, y, section["title"], fontsize=11, fontweight="bold")
            y -= 0.05
            for line in section["lines"]:
                if y < 0.08:
                    pdf.savefig(fig, bbox_inches="tight")
                    plt.close(fig)
                    fig = plt.figure(figsize=(11.69, 8.27))
                    ax = fig.add_axes([0.05, 0.08, 0.9, 0.84])
                    ax.axis("off")
                    fig.text(0.05, 0.95, title, fontsize=14, fontweight="bold")
                    y = 0.86
                fig.text(0.07, y, line, fontsize=8, color="#111827")
                y -= 0.03
            y -= 0.02

        fig.text(0.05, 0.04, "Generated by Site Intelligence · Indicative data only", fontsize=7, color="#6b7280")
        pdf.savefig(fig, bbox_inches="tight")
        plt.close(fig)

    buf.seek(0)
    return buf.read()


def generate_site_report_pdf(
    lat: float, lon: float, radius_m: int, title: str,
    pre_flood: Optional[dict] = None,
    pre_soil:  Optional[dict] = None,
    pre_clim:  Optional[dict] = None,
) -> bytes:
    buf = io.BytesIO()
    credit = f"Site Intelligence · sakinsiteintel.vercel.app · {datetime.date.today().isoformat()}"

    with PdfPages(buf) as pdf:
        # ── Page 1: Topo map ──────────────────────────────────────────────
        # generate_topo_pdf returns a standalone PDF — re-render the figure
        # instead of embedding bytes, we call the internal figure builder
        grid_data = fetch_elevation_grid(lat, lon, radius_m)
        try:
            osm_data = fetch_osm_context(lat, lon, radius_m)
        except Exception:
            osm_data = None

        bounds = grid_data["bounds"]
        rows, cols = grid_data["rows"], grid_data["cols"]
        grid_np = np.array(grid_data["grid"], dtype=float)
        grid_np[grid_np == -9999] = np.nan
        lon_axis = np.linspace(bounds["west"],  bounds["east"],  cols)
        lat_axis = np.linspace(bounds["north"], bounds["south"], rows)

        fig1 = plt.figure(figsize=(11.69, 8.27))
        ax   = fig1.add_axes([0.06, 0.16, 0.70, 0.76])
        ax_sc   = fig1.add_axes([0.06, 0.06, 0.70, 0.07])
        ax_info = fig1.add_axes([0.78, 0.10, 0.20, 0.82])
        ax_sc.axis("off"); ax_info.axis("off")

        levels = _contour_levels(grid_np.flatten().tolist())
        if levels:
            cs = ax.contour(lon_axis, lat_axis, grid_np, levels=levels,
                            colors="#7B4F2E", linewidths=0.6)
            ax.clabel(cs, inline=True, fontsize=5, fmt="%dm",
                      colors="#5a3920", inline_spacing=2)

        if osm_data:
            _draw_osm_on_ax(ax, osm_data)

        ax.plot(lon, lat, "r^", markersize=7, zorder=5,
                path_effects=[pe.withStroke(linewidth=2, foreground="white")])
        ax.set_xlim(bounds["west"], bounds["east"])
        ax.set_ylim(bounds["south"], bounds["north"])
        ax.tick_params(labelsize=6)
        ax.grid(True, linestyle=":", linewidth=0.3, alpha=0.5, color="#999")

        _draw_scale_bar(ax_sc, bounds, lat)
        _draw_north_arrow(ax, bounds)
        _draw_info_strip(ax_info, lat, lon, radius_m, title, grid_np, osm_data)
        fig1.text(0.06, 0.96, f"{title} — Topographic Map", fontsize=11, fontweight="bold", va="bottom")
        fig1.text(0.06, 0.02, credit, fontsize=6, color="#888")
        pdf.savefig(fig1, bbox_inches="tight"); plt.close(fig1)

        # ── Page 2: Terrain profile ────────────────────────────────────────
        fig2, axes2 = plt.subplots(1, 1, figsize=(11.69, 8.27))
        valid = grid_np[~np.isnan(grid_np)]
        if valid.size:
            axes2.contourf(lon_axis, lat_axis, grid_np, levels=20, cmap="terrain", alpha=0.6)
            cs2 = axes2.contour(lon_axis, lat_axis, grid_np, levels=levels or 10,
                                colors="#7B4F2E", linewidths=0.5)
            axes2.clabel(cs2, inline=True, fontsize=6, fmt="%dm", colors="#5a3920")
            axes2.plot(lon, lat, "r^", markersize=8, zorder=5,
                       path_effects=[pe.withStroke(linewidth=2, foreground="white")], label="Site")
            axes2.set_title(f"{title} — Terrain Detail", fontsize=12, fontweight="bold", pad=10)
            axes2.tick_params(labelsize=7)
            axes2.grid(True, linestyle=":", linewidth=0.3, alpha=0.4)
            cb = fig2.colorbar(axes2.contourf(lon_axis, lat_axis, grid_np, levels=20, cmap="terrain", alpha=0.0), ax=axes2)
            cb.set_label("Elevation (m)", fontsize=8)
            stats_text = (
                f"Elevation range: {valid.min():.0f}–{valid.max():.0f} m  "
                f"|  Relief: {valid.max()-valid.min():.0f} m  "
                f"|  Mean: {valid.mean():.0f} m  "
                f"|  Analysis radius: {radius_m}m"
            )
            fig2.text(0.5, 0.02, stats_text, ha="center", fontsize=8, color="#555")
        fig2.text(0.98, 0.01, credit, ha="right", fontsize=5, color="#aaa")
        pdf.savefig(fig2, bbox_inches="tight"); plt.close(fig2)

        # ── Page 3: Flood risk + soil text summary ─────────────────────────
        fig3, ax3 = plt.subplots(figsize=(11.69, 8.27))
        ax3.axis("off")
        fig3.text(0.06, 0.94, f"{title} — Site Risk & Soil Summary", fontsize=12, fontweight="bold")

        try:
            flood_data = pre_flood or fetch_flood_risk(lat, lon, radius_m, None)
        except Exception:
            flood_data = None
        try:
            soil_data = pre_soil or fetch_soil(lat, lon)
        except Exception:
            soil_data = None

        y = 0.86
        def txt(text, x=0.06, bold=False, size=9, color="black"):
            nonlocal y
            fig3.text(x, y, text, fontsize=size, fontweight="bold" if bold else "normal", color=color)
            y -= 0.04

        txt("FLOOD RISK", bold=True, size=10)
        if flood_data:
            r = flood_data.get("risk", {})
            i = flood_data.get("inputs", {})
            h = flood_data.get("hand", {})
            RCOL = {"high":"#ef4444","medium-high":"#f97316","medium":"#f59e0b","low":"#22c55e","unknown":"#9ca3af"}
            txt(f"Level: {r.get('level','—').upper()}  —  {r.get('label','')}", color=RCOL.get(r.get('level','unknown'),'#333'), bold=True)
            txt(r.get('description',''), size=8, color="#444")
            txt(f"HAND at site: {i.get('hand_m','—')} m   |   Min HAND in buffer: {h.get('buffer_min_m','—')} m   |   Slope: {i.get('slope_deg','—')}°   |   Waterway: {i.get('waterway_dist_m','—')} m", size=8, color="#555")
        else:
            txt("Flood risk data unavailable.", size=8, color="#999")

        y -= 0.02
        txt("SOIL PROPERTIES (0–20cm, iSDAsoil 30m)", bold=True, size=10)
        if soil_data:
            p = soil_data.get("properties", {})
            t = soil_data.get("texture", {})
            fl= soil_data.get("flags", {})
            txt(f"Texture: {t.get('class_name','—')}   Risk level: {t.get('risk_level','—').upper()}", bold=True)
            txt(t.get('note',''), size=8, color="#444")
            txt(f"Clay: {p.get('clay_pct','—')}%   Sand: {p.get('sand_pct','—')}%   Silt: {p.get('silt_pct','—')}%   pH: {p.get('ph','—')}   Organic carbon: {p.get('oc_pct','—')}%", size=8, color="#555")
            if fl.get('ph_note'):
                txt(f"pH note: {fl['ph_note']}", size=8, color="#666")
            if fl.get('high_clay'):
                txt("⚠ High clay content — expansive soil risk. Geotechnical assessment recommended.", size=8, color="#c0392b")
            if fl.get('high_oc'):
                txt("⚠ High organic carbon — compressibility risk under load.", size=8, color="#f59e0b")
        else:
            txt("Soil data unavailable.", size=8, color="#999")

        fig3.text(0.06, 0.04, "All data is indicative. Not a substitute for a licensed site investigation.", fontsize=7, color="#999")
        fig3.text(0.98, 0.01, credit, ha="right", fontsize=5, color="#aaa")
        pdf.savefig(fig3, bbox_inches="tight"); plt.close(fig3)

        # ── Page 4: Climate + solar charts ────────────────────────────────
        try:
            climate_data = pre_clim or fetch_climate_solar(lat, lon)
        except Exception:
            climate_data = None

        fig4, (ax4a, ax4b) = plt.subplots(1, 2, figsize=(11.69, 8.27))
        fig4.suptitle(f"{title} — Climate & Solar ({NASA_START_YEAR}–{NASA_END_YEAR})", fontsize=12, fontweight="bold")

        if climate_data:
            months_short = [m["month"] for m in climate_data["monthly"]]
            rainfall_vals = [m["rainfall_mm"] for m in climate_data["monthly"]]
            tmax_vals     = [m["temp_max_c"] for m in climate_data["monthly"]]
            tmin_vals     = [m["temp_min_c"] for m in climate_data["monthly"]]
            solar_vals    = [m["solar_ghi"] for m in climate_data["monthly"]]
            s             = climate_data["summary"]

            # Rainfall + temperature
            x = range(12)
            bars = ax4a.bar(x, rainfall_vals, color="#4a9eff", alpha=0.7, label="Rainfall (mm)")
            ax4a.set_ylabel("Rainfall (mm)", fontsize=8)
            ax4a.set_xticks(list(x)); ax4a.set_xticklabels(months_short, fontsize=7)
            ax4a_r = ax4a.twinx()
            ax4a_r.plot(list(x), tmax_vals, color="#f97316", linewidth=1.5, label="Temp max °C")
            ax4a_r.plot(list(x), tmin_vals, color="#6b7280", linewidth=1.5, linestyle="--", label="Temp min °C")
            ax4a_r.set_ylabel("Temperature (°C)", fontsize=8)
            ax4a.set_title(f"Rainfall & Temperature\n{s['annual_rainfall_mm']}mm/yr · Wet: {', '.join(s['wet_months'])}", fontsize=9)
            ax4a.grid(True, linestyle=":", linewidth=0.3, alpha=0.4)

            # Solar
            SCOL = {"excellent":"#22c55e","good":"#84cc16","moderate":"#f59e0b","poor":"#ef4444"}
            solar_color = SCOL.get(s["solar_viability"], "#6b7280")
            ax4b.bar(list(x), solar_vals, color=solar_color, alpha=0.75)
            ax4b.axhline(s["annual_solar_ghi"], color="#374151", linestyle="--", linewidth=1, label=f"Mean {s['annual_solar_ghi']} kWh/m²/day")
            ax4b.set_ylabel("GHI (kWh/m²/day)", fontsize=8)
            ax4b.set_xticks(list(x)); ax4b.set_xticklabels(months_short, fontsize=7)
            ax4b.set_title(f"Solar Irradiance — {s['solar_viability'].upper()}\n{s['solar_note'][:80]}", fontsize=9)
            ax4b.grid(True, linestyle=":", linewidth=0.3, alpha=0.4)
            ax4b.legend(fontsize=7)
        else:
            ax4a.text(0.5, 0.5, "Climate data unavailable", ha="center", va="center", transform=ax4a.transAxes, color="#999")
            ax4b.text(0.5, 0.5, "Solar data unavailable",   ha="center", va="center", transform=ax4b.transAxes, color="#999")

        fig4.tight_layout(rect=[0, 0.04, 1, 0.96])
        fig4.text(0.5, 0.01, f"Source: NASA POWER · {credit}", ha="center", fontsize=6, color="#aaa")
        pdf.savefig(fig4, bbox_inches="tight"); plt.close(fig4)

    buf.seek(0)
    return buf.read()
