#!/usr/bin/env python3
"""
preview_render.py <diagram.vsdx> [page_index] [out.png]

Reads a .vsdx produced by visio_generator.py and draws an approximate visual
preview of the page (coloured boxes + connectors + labels) using matplotlib.

This is a *preview* helper only -- the real deliverable is the .vsdx file that
Visio / draw.io / LibreOffice render natively.  Requires: pip install matplotlib
"""
import sys
import zipfile
import xml.etree.ElementTree as ET

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

V = "{http://schemas.microsoft.com/office/visio/2012/main}"


def num(el, n):
    e = el.find(f"{V}Cell[@N='{n}']")
    return float(e.get("V")) if e is not None else 0.0


def cell_str(el, n):
    e = el.find(f"{V}Cell[@N='{n}']")
    return e.get("V") if e is not None else None


def main():
    vsdx_path = sys.argv[1]
    page_idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    out_png = sys.argv[3] if len(sys.argv) > 3 else "preview.png"

    z = zipfile.ZipFile(vsdx_path)
    # read pages.xml to find the page part for page_idx
    pages = ET.fromstring(z.read("visio/pages/pages.xml"))
    pgs = pages.findall(f"{V}Page")
    page = pgs[page_idx]
    pname = page.get("Name")
    sheet = page.find(f"{V}PageSheet")
    PW = num(sheet, "PageWidth")
    PH = num(sheet, "PageHeight")
    rid = page.find(f"{V}Rel").get(f"{{http://schemas.openxmlformats.org/officeDocument/2006/relationships}}id")
    # map rid -> filename from pages.xml.rels
    rels = ET.fromstring(z.read("visio/pages/_rels/pages.xml.rels"))
    target = None
    for r in rels:
        if r.get("Id") == rid:
            target = "visio/pages/" + r.get("Target")
            break
    page_xml = ET.fromstring(z.read(target))

    fig, ax = plt.subplots(figsize=(PW * 1.1, PH * 1.1))
    ax.add_patch(Polygon([(0, 0), (PW, 0), (PW, PH), (0, PH)],
                         closed=True, facecolor="white", edgecolor="#999", lw=1.6))

    for shp in page_xml.findall(f"{V}Shapes/{V}Shape"):
        pinx = num(shp, "PinX"); piny = num(shp, "PinY")
        lx = num(shp, "LocPinX"); ly = num(shp, "LocPinY")
        ox, oy = pinx - lx, piny - ly
        text_el = shp.find(f"{V}Text")
        text = text_el.text if (text_el is not None and text_el.text) else ""
        geom = shp.find(f"{V}Section[@N='Geometry']")
        pts = []
        if geom is not None:
            for r in geom.findall(f"{V}Row"):
                pts.append((ox + num(r, "X"), oy + num(r, "Y")))
        fill = cell_str(shp, "FillForegnd")
        lc = cell_str(shp, "LineColor") or "#333333"
        name = shp.get("NameU") or ""
        is_label = name.startswith("ConnectorLabel")
        is_arrow = name.startswith("Connector") and fill is not None and fill != "#FFFFFF"
        is_connline = name.startswith("Connector") and not is_arrow and not is_label

        if is_label:
            w = num(shp, "Width"); h = num(shp, "Height")
            ax.add_patch(Polygon([(pinx - w / 2, piny - h / 2),
                                  (pinx + w / 2, piny - h / 2),
                                  (pinx + w / 2, piny + h / 2),
                                  (pinx - w / 2, piny + h / 2)],
                                 closed=True, facecolor="white",
                                 edgecolor="#cccccc", lw=0.8, zorder=5))
            ax.text(pinx, piny, text, ha="center", va="center",
                    fontsize=9, zorder=6)
        elif is_connline:
            if len(pts) >= 2:
                ax.plot([p[0] for p in pts], [p[1] for p in pts],
                        color=lc, lw=2.2, zorder=3)
        elif is_arrow:
            if len(pts) >= 3:
                ax.add_patch(Polygon(pts, closed=True, facecolor=fill,
                                     edgecolor="none", zorder=4))
        else:  # box
            ax.add_patch(Polygon(pts, closed=True, facecolor=fill,
                                 edgecolor=lc, lw=2, zorder=2))
            if text:
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
                ax.text(cx, cy, text, ha="center", va="center", fontsize=11,
                        weight="bold",
                        color="#000000" if _lum(fill) > 160 else "#FFFFFF",
                        zorder=3)

    ax.set_xlim(0, PW); ax.set_ylim(0, PH)
    ax.set_aspect("equal")
    ax.set_title(f"{pname}  ({PW:g} x {PH:g} in)")
    ax.grid(True, ls=":", alpha=0.5)
    plt.tight_layout()
    plt.savefig(out_png, dpi=140, facecolor="#eef1f6")
    print("saved", out_png)


def _lum(hexc):
    if not hexc or not hexc.startswith("#"):
        return 255.0
    s = hexc.lstrip("#")
    if len(s) == 6:
        r, g, b = (int(s[i:i + 2], 16) for i in (0, 2, 4))
        return 0.299 * r + 0.587 * g + 0.114 * b
    return 255.0


if __name__ == "__main__":
    main()
