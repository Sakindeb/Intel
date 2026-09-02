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


def _report_credit() -> str:
    return f"Site Intelligence · sakinsiteintel.vercel.app · {datetime.date.today().isoformat()}"


# ─────────────────────────────────────────────────────────────────────────
# Shared figure builders — each returns a standalone matplotlib Figure.
# Both generate_site_report_pdf and generate_assessment_report_pdf (when
# include_factual_data=True) render from these, so the two reports always
# show identical topo / terrain / risk-soil / climate pages.
# ─────────────────────────────────────────────────────────────────────────

def _build_topo_figure(
    lat: float, lon: float, radius_m: int, title: str, credit: str,
    grid_data: Optional[dict] = None, osm_data: Optional[dict] = None,
):
    if grid_data is None:
        grid_data = fetch_elevation_grid(lat, lon, radius_m)
    if osm_data is None:
        try:
            osm_data = fetch_osm_context(lat, lon, radius_m)
        except Exception:
            osm_data = None

    bounds = grid_data["bounds"]
    rows, cols = grid_data["rows"], grid_data["cols"]
    grid_np = np.array(grid_data["grid"], dtype=float)
    grid_np[grid_np == -9999] = np.nan
    lon_axis = np.linspace(bounds["west"], bounds["east"], cols)
    lat_axis = np.linspace(bounds["north"], bounds["south"], rows)

    fig = plt.figure(figsize=(11.69, 8.27))
    ax = fig.add_axes([0.06, 0.16, 0.70, 0.76])
    ax_sc = fig.add_axes([0.06, 0.06, 0.70, 0.07])
    ax_info = fig.add_axes([0.78, 0.10, 0.20, 0.82])
    ax_sc.axis("off")
    ax_info.axis("off")

    levels = _contour_levels(grid_np.flatten().tolist())
    if levels:
        cs = ax.contour(
            lon_axis, lat_axis, grid_np,
            levels=levels, colors="#7B4F2E", linewidths=0.6,
        )
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
    for spine in ax.spines.values():
        spine.set_linewidth(0.8)

    _draw_scale_bar(ax_sc, bounds, lat)
    _draw_north_arrow(ax, bounds)
    _draw_info_strip(ax_info, lat, lon, radius_m, title, grid_np, osm_data)

    fig.text(0.06, 0.96, f"{title} — Topographic Map", fontsize=11, fontweight="bold", va="bottom")
    fig.text(0.06, 0.02, credit, fontsize=6, color="#888")

    return fig, grid_data, osm_data


def _build_terrain_figure(
    lat: float, lon: float, radius_m: int, title: str, credit: str,
    grid_data: Optional[dict] = None,
):
    if grid_data is None:
        grid_data = fetch_elevation_grid(lat, lon, radius_m)

    bounds = grid_data["bounds"]
    rows, cols = grid_data["rows"], grid_data["cols"]
    grid_np = np.array(grid_data["grid"], dtype=float)
    grid_np[grid_np == -9999] = np.nan
    lon_axis = np.linspace(bounds["west"], bounds["east"], cols)
    lat_axis = np.linspace(bounds["north"], bounds["south"], rows)
    levels = _contour_levels(grid_np.flatten().tolist())

    fig, ax = plt.subplots(1, 1, figsize=(11.69, 8.27))
    valid = grid_np[~np.isnan(grid_np)]
    if valid.size:
        ax.contourf(lon_axis, lat_axis, grid_np, levels=20, cmap="terrain", alpha=0.6)
        cs = ax.contour(lon_axis, lat_axis, grid_np, levels=levels or 10,
                         colors="#7B4F2E", linewidths=0.5)
        ax.clabel(cs, inline=True, fontsize=6, fmt="%dm", colors="#5a3920")
        ax.plot(lon, lat, "r^", markersize=8, zorder=5,
                path_effects=[pe.withStroke(linewidth=2, foreground="white")], label="Site")
        ax.set_title(f"{title} — Terrain Detail", fontsize=12, fontweight="bold", pad=10)
        ax.tick_params(labelsize=7)
        ax.grid(True, linestyle=":", linewidth=0.3, alpha=0.4)
        cb = fig.colorbar(
            ax.contourf(lon_axis, lat_axis, grid_np, levels=20, cmap="terrain", alpha=0.0), ax=ax
        )
        cb.set_label("Elevation (m)", fontsize=8)
        stats_text = (
            f"Elevation range: {valid.min():.0f}–{valid.max():.0f} m  "
            f"|  Relief: {valid.max()-valid.min():.0f} m  "
            f"|  Mean: {valid.mean():.0f} m  "
            f"|  Analysis radius: {radius_m}m"
        )
        fig.text(0.5, 0.02, stats_text, ha="center", fontsize=8, color="#555")
    fig.text(0.98, 0.01, credit, ha="right", fontsize=5, color="#aaa")
    return fig


def _build_risk_soil_figure(
    lat: float, lon: float, radius_m: int, title: str, credit: str,
    flood_data: Optional[dict] = None, soil_data: Optional[dict] = None,
):
    if flood_data is None:
        try:
            flood_data = fetch_flood_risk(lat, lon, radius_m, None)
        except Exception:
            flood_data = None
    if soil_data is None:
        try:
            soil_data = fetch_soil(lat, lon)
        except Exception:
            soil_data = None

    fig, ax = plt.subplots(figsize=(11.69, 8.27))
    ax.axis("off")
    fig.text(0.06, 0.94, f"{title} — Site Risk & Soil Summary", fontsize=12, fontweight="bold")

    y = 0.86

    def txt(text, x=0.06, bold=False, size=9, color="black"):
        nonlocal y
        fig.text(x, y, text, fontsize=size, fontweight="bold" if bold else "normal", color=color)
        y -= 0.04

    txt("FLOOD RISK", bold=True, size=10)
    if flood_data:
        r = flood_data.get("risk", {})
        i = flood_data.get("inputs", {})
        h = flood_data.get("hand", {})
        RCOL = {"high": "#ef4444", "medium-high": "#f97316", "medium": "#f59e0b",
                "low": "#22c55e", "unknown": "#9ca3af"}
        txt(f"Level: {r.get('level', '—').upper()}  —  {r.get('label', '')}",
            color=RCOL.get(r.get('level', 'unknown'), '#333'), bold=True)
        txt(r.get('description', ''), size=8, color="#444")
        txt(
            f"HAND at site: {i.get('hand_m', '—')} m   |   Min HAND in buffer: {h.get('buffer_min_m', '—')} m   "
            f"|   Slope: {i.get('slope_deg', '—')}°   |   Waterway: {i.get('waterway_dist_m', '—')} m",
            size=8, color="#555",
        )
    else:
        txt("Flood risk data unavailable.", size=8, color="#999")

    y -= 0.02
    txt("SOIL PROPERTIES (0–20cm, iSDAsoil 30m)", bold=True, size=10)
    if soil_data:
        p = soil_data.get("properties", {})
        t = soil_data.get("texture", {})
        fl = soil_data.get("flags", {})
        txt(f"Texture: {t.get('class_name', '—')}   Risk level: {t.get('risk_level', '—').upper()}", bold=True)
        txt(t.get('note', ''), size=8, color="#444")
        txt(
            f"Clay: {p.get('clay_pct', '—')}%   Sand: {p.get('sand_pct', '—')}%   Silt: {p.get('silt_pct', '—')}%   "
            f"pH: {p.get('ph', '—')}   Organic carbon: {p.get('oc_pct', '—')}%",
            size=8, color="#555",
        )
        if fl.get('ph_note'):
            txt(f"pH note: {fl['ph_note']}", size=8, color="#666")
        if fl.get('high_clay'):
            txt("⚠ High clay content — expansive soil risk. Geotechnical assessment recommended.", size=8, color="#c0392b")
        if fl.get('high_oc'):
            txt("⚠ High organic carbon — compressibility risk under load.", size=8, color="#f59e0b")
    else:
        txt("Soil data unavailable.", size=8, color="#999")

    fig.text(0.06, 0.04, "All data is indicative. Not a substitute for a licensed site investigation.",
              fontsize=7, color="#999")
    fig.text(0.98, 0.01, credit, ha="right", fontsize=5, color="#aaa")
    return fig


def _build_climate_figure(
    lat: float, lon: float, title: str, credit: str,
    climate_data: Optional[dict] = None,
):
    if climate_data is None:
        try:
            climate_data = fetch_climate_solar(lat, lon)
        except Exception:
            climate_data = None

    fig, (ax_a, ax_b) = plt.subplots(1, 2, figsize=(11.69, 8.27))
    fig.suptitle(f"{title} — Climate & Solar ({NASA_START_YEAR}–{NASA_END_YEAR})", fontsize=12, fontweight="bold")

    if climate_data:
        months_short = [m["month"] for m in climate_data["monthly"]]
        rainfall_vals = [m["rainfall_mm"] for m in climate_data["monthly"]]
        tmax_vals = [m["temp_max_c"] for m in climate_data["monthly"]]
        tmin_vals = [m["temp_min_c"] for m in climate_data["monthly"]]
        solar_vals = [m["solar_ghi"] for m in climate_data["monthly"]]
        s = climate_data["summary"]

        x = range(12)
        ax_a.bar(x, rainfall_vals, color="#4a9eff", alpha=0.7, label="Rainfall (mm)")
        ax_a.set_ylabel("Rainfall (mm)", fontsize=8)
        ax_a.set_xticks(list(x)); ax_a.set_xticklabels(months_short, fontsize=7)
        ax_a_r = ax_a.twinx()
        ax_a_r.plot(list(x), tmax_vals, color="#f97316", linewidth=1.5, label="Temp max °C")
        ax_a_r.plot(list(x), tmin_vals, color="#6b7280", linewidth=1.5, linestyle="--", label="Temp min °C")
        ax_a_r.set_ylabel("Temperature (°C)", fontsize=8)
        ax_a.set_title(f"Rainfall & Temperature\n{s['annual_rainfall_mm']}mm/yr · Wet: {', '.join(s['wet_months'])}", fontsize=9)
        ax_a.grid(True, linestyle=":", linewidth=0.3, alpha=0.4)

        SCOL = {"excellent": "#22c55e", "good": "#84cc16", "moderate": "#f59e0b", "poor": "#ef4444"}
        solar_color = SCOL.get(s["solar_viability"], "#6b7280")
        ax_b.bar(list(x), solar_vals, color=solar_color, alpha=0.75)
        ax_b.axhline(s["annual_solar_ghi"], color="#374151", linestyle="--", linewidth=1,
                      label=f"Mean {s['annual_solar_ghi']} kWh/m²/day")
        ax_b.set_ylabel("GHI (kWh/m²/day)", fontsize=8)
        ax_b.set_xticks(list(x)); ax_b.set_xticklabels(months_short, fontsize=7)
        ax_b.set_title(f"Solar Irradiance — {s['solar_viability'].upper()}\n{s['solar_note'][:80]}", fontsize=9)
        ax_b.grid(True, linestyle=":", linewidth=0.3, alpha=0.4)
        ax_b.legend(fontsize=7)
    else:
        ax_a.text(0.5, 0.5, "Climate data unavailable", ha="center", va="center", transform=ax_a.transAxes, color="#999")
        ax_b.text(0.5, 0.5, "Solar data unavailable", ha="center", va="center", transform=ax_b.transAxes, color="#999")

    fig.tight_layout(rect=[0, 0.04, 1, 0.96])
    fig.text(0.5, 0.01, f"Source: NASA POWER · {credit}", ha="center", fontsize=6, color="#aaa")
    return fig


# ─────────────────────────────────────────────────────────────────────────
# Public report entry points
# ─────────────────────────────────────────────────────────────────────────

def generate_topo_pdf(lat: float, lon: float, radius_m: int, title: str) -> bytes:
    credit = _report_credit()
    fig, _, _ = _build_topo_figure(lat, lon, radius_m, title, credit)
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
    credit = _report_credit()
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

        # ── Page 1(+): text summary — same pagination as before ───────────
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

        # ── Following pages: full topo / terrain / risk-soil / climate ────
        # Mirrors generate_site_report_pdf exactly, reusing whatever data
        # was already fetched upstream (flood_risk, soil, climate_solar)
        # and fetching only what wasn't passed in (the elevation raster
        # and OSM context, which the assessment payload doesn't carry).
        if include_factual_data:
            try:
                fig_topo, grid_data, _ = _build_topo_figure(lat, lon, radius_m, title, credit)
                pdf.savefig(fig_topo, bbox_inches="tight")
                plt.close(fig_topo)
            except Exception:
                grid_data = None

            try:
                fig_terrain = _build_terrain_figure(lat, lon, radius_m, title, credit, grid_data=grid_data)
                pdf.savefig(fig_terrain, bbox_inches="tight")
                plt.close(fig_terrain)
            except Exception:
                pass

            try:
                fig_risk_soil = _build_risk_soil_figure(
                    lat, lon, radius_m, title, credit,
                    flood_data=flood_risk, soil_data=soil,
                )
                pdf.savefig(fig_risk_soil, bbox_inches="tight")
                plt.close(fig_risk_soil)
            except Exception:
                pass

            try:
                fig_climate = _build_climate_figure(lat, lon, title, credit, climate_data=climate_solar)
                pdf.savefig(fig_climate, bbox_inches="tight")
                plt.close(fig_climate)
            except Exception:
                pass

    buf.seek(0)
    return buf.read()


def generate_site_report_pdf(
    lat: float, lon: float, radius_m: int, title: str,
    pre_flood: Optional[dict] = None,
    pre_soil: Optional[dict] = None,
    pre_clim: Optional[dict] = None,
) -> bytes:
    credit = _report_credit()
    buf = io.BytesIO()

    with PdfPages(buf) as pdf:
        fig1, grid_data, _osm_data = _build_topo_figure(lat, lon, radius_m, title, credit)
        pdf.savefig(fig1, bbox_inches="tight")
        plt.close(fig1)

        fig2 = _build_terrain_figure(lat, lon, radius_m, title, credit, grid_data=grid_data)
        pdf.savefig(fig2, bbox_inches="tight")
        plt.close(fig2)

        fig3 = _build_risk_soil_figure(lat, lon, radius_m, title, credit, flood_data=pre_flood, soil_data=pre_soil)
        pdf.savefig(fig3, bbox_inches="tight")
        plt.close(fig3)

        fig4 = _build_climate_figure(lat, lon, title, credit, climate_data=pre_clim)
        pdf.savefig(fig4, bbox_inches="tight")
        plt.close(fig4)

    buf.seek(0)
    return buf.read()