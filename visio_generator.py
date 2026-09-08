#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Visio (.vsdx) generator from JSON
==================================

Creates a Microsoft Visio ``.vsdx`` file from a JSON description of pages,
shapes (rectangle / ellipse), and connectors (with optional arrow heads and
labels).  The generator is self contained:

* it does **not** need an installed ``vsdx`` python package, and
* it does **not** need an external template ``.vsdx`` file at run time.

A .vsdx document is a ZIP archive following the Open Packaging Convention
(OPC).  Most of the package is pure XML that Visio itself produces and that is
largely static (the document stylesheet, font/face tables, master pages,
windows …).  Only the *page content* varies for each diagram.  To guarantee
that the produced file opens cleanly in Visio (and in draw.io / LibreOffice),
this module embeds a compact, known-good OPC "boilerplate" (taken from a real,
empty Visio drawing) and regenerates only the page parts from your JSON.

JSON schema
-----------
{
  "document": {"title": str, "description": str},
  "pages": [
    {"name": str, "width": float, "height": float,      # inches
     "shapes": [
        {"id": str, "type": "rectangle"|"ellipse",
         "text": str,
         "x": float, "y": float, "width": float, "height": float,   # inches (x,y = centre)
         "fill_color": "#RRGGBB", "line_color": "#RRGGBB",
         "text_color": "#RRGGBB", "font_size": int}
     ],
     "connectors": [
        {"from_shape_id": str, "to_shape_id": str,
         "label": str, "line_color": "#RRGGBB", "line_weight": float}  # points
     ]}
  ]
}
"""

import base64
import json
import os
import re
import sys
import zipfile
from collections import defaultdict, deque
from io import BytesIO
from typing import Dict, List, Optional, Tuple

from xml.etree import ElementTree as ET


# ---------------------------------------------------------------------------
# Visio XML namespaces
# ---------------------------------------------------------------------------
V_NS = "http://schemas.microsoft.com/office/visio/2012/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
CORE_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC_NS = "http://purl.org/dc/elements/1.1/"
DCTERMS_NS = "http://purl.org/dc/terms/"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
APP_NS = ("http://schemas.openxmlformats.org/officeDocument/2006/"
          "extended-properties")
VT_NS = ("http://schemas.openxmlformats.org/officeDocument/2006/"
         "docPropsVTypes")


ET.register_namespace("", V_NS)
ET.register_namespace("r", R_NS)
ET.register_namespace("cp", CORE_NS)
ET.register_namespace("dc", DC_NS)
ET.register_namespace("dcterms", DCTERMS_NS)
ET.register_namespace("xsi", XSI_NS)
ET.register_namespace("vt", VT_NS)


def _num(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fmt(value: float) -> str:
    """Format a float without annoying trailing zeros."""
    if value == int(value):
        return str(int(value))
    return repr(round(value, 6))


def _clean_rgb(hex_color) -> str:
    """Normalise any hex colour to #RRGGBB."""
    if not hex_color:
        return "#000000"
    s = str(hex_color).strip().lstrip("#")
    if len(s) == 3:  # short form #rgb
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return "#000000"
    return "#" + s.lower()


# ---------------------------------------------------------------------------
# Small geometry helpers (page coordinates are in inches, origin = bottom-left)
# ---------------------------------------------------------------------------
def _unit(dx: float, dy: float) -> Tuple[float, float]:
    length = (dx * dx + dy * dy) ** 0.5
    if length < 1e-9:
        return 0.0, 0.0
    return dx / length, dy / length


def _rect_edge_point(cx, cy, hw, hh, dx, dy, ux, uy) -> Tuple[float, float]:
    """Point where the ray from a rectangle centre toward (ux,uy) crosses its
    border.  ``dx, dy`` is the direction *outwards* used for t computation."""
    t = float("inf")
    if abs(ux) > 1e-9:
        t = min(t, hw / abs(ux))
    if abs(uy) > 1e-9:
        t = min(t, hh / abs(uy))
    if t == float("inf"):
        t = 0.0
    return cx + ux * t, cy + uy * t


def _ellipse_edge_point(cx, cy, hw, hh, ux, uy) -> Tuple[float, float]:
    """Point on an axis aligned ellipse border in direction (ux,uy)."""
    denom = (ux * ux) / (hw * hw) + (uy * uy) / (hh * hh)
    if denom <= 1e-12:
        return cx, cy
    t = 1.0 / (denom ** 0.5)
    return cx + ux * t, cy + uy * t


# ---------------------------------------------------------------------------
# Shape / connector XML builders
# ---------------------------------------------------------------------------
class BoxSpec:
    """A resolved logical shape (already has a unique numeric id)."""

    def __init__(self, data: dict, internal_id: int, page_w: float, page_h: float):
        self.data = data
        self.internal_id = internal_id
        self.user_id = str(data.get("id", str(internal_id)))
        self.text = data.get("text", "")
        self.cx = _num(data.get("x"), 1.0)
        self.cy = _num(data.get("y"), 1.0)
        self.w = _num(data.get("width"), 2.0)
        self.h = _num(data.get("height"), 1.0)
        self.kind = str(data.get("type", "rectangle")).lower()
        self.fill = _clean_rgb(data.get("fill_color", "#4472C4"))
        self.line = _clean_rgb(data.get("line_color", "#2F5597"))
        self.text_color = _clean_rgb(data.get("text_color", "#000000"))
        self.font_size = int(_num(data.get("font_size"), 10))
        self.page_w = page_w
        self.page_h = page_h


class ConnectorSpec:
    """A resolved connector between two BoxSpecs."""

    def __init__(self, data: dict, internal_id: int, from_box: BoxSpec,
                 to_box: BoxSpec, page_w: float, page_h: float):
        self.internal_id = internal_id
        self.data = data
        self.label = data.get("label", "")
        self.line_color = _clean_rgb(data.get("line_color", "#000000"))
        # line weight is expressed in points by the JSON
        self.line_weight = _num(data.get("line_weight"), 1.0)
        self.page_w = page_w
        self.page_h = page_h

        # Compute the visible line from the *edge* of the source box to the
        # *edge* of the destination box, so arrow heads touch the boxes.
        sx, sy, sw, sh = from_box.cx, from_box.cy, from_box.w, from_box.h
        tx, ty, tw, th = to_box.cx, to_box.cy, to_box.w, to_box.h
        dx, dy = tx - sx, ty - sy
        ux, uy = _unit(dx, dy)

        hw1, hh1 = sw / 2.0, sh / 2.0
        hw2, hh2 = tw / 2.0, th / 2.0

        if from_box.kind == "ellipse":
            bx, by = _ellipse_edge_point(sx, sy, hw1, hh1, ux, uy)
        else:
            bx, by = _rect_edge_point(sx, sy, hw1, hh1, dx, dy, ux, uy)

        # entry point on destination, approaching from source
        if to_box.kind == "ellipse":
            ex, ey = _ellipse_edge_point(tx, ty, hw2, hh2, ux, uy)
        else:
            # re-use rect crossing but direction of travel (ux,uy)
            ex, ey = _rect_edge_point(tx, ty, hw2, hh2, dx, dy, ux, uy)
            # _rect_edge_point returns the border going OUTWARD from target
            # centre along +u; we need the border facing the source (-u).
            nb_x, nb_y = _rect_edge_point(tx, ty, hw2, hh2, -dx, -dy,
                                          -ux, -uy)
            ex, ey = nb_x, nb_y

        self.bx, self.by = bx, by
        self.ex, self.ey = ex, ey
        self.ux, self.uy = ux, uy


# ---------------------------------------------------------------------------
# Low level element helpers
# ---------------------------------------------------------------------------
def _E(tag, **attrs) -> ET.Element:
    el = ET.Element(f"{{{V_NS}}}{tag}")
    for k, v in attrs.items():
        el.set(k, v)
    return el


def _cell(name: str, value: str, formula: Optional[str] = None) -> ET.Element:
    c = _E("Cell", N=name, V=value)
    if formula:
        c.set("F", formula)
    return c


def _geometry_cell(name: str, value: str) -> ET.Element:
    return _E("Cell", N=name, V=value)


# ---------------------------------------------------------------------------
class VisioShape:
    """Represents a single 2-D box (rectangle or ellipse)."""

    def __init__(self, box: BoxSpec):
        self.box = box

    def to_xml_element(self) -> ET.Element:
        b = self.box
        shape = _E("Shape", ID=str(b.internal_id), Type="Shape",
                   NameU=f"Shape.{b.internal_id}", Name=f"Shape.{b.internal_id}")

        # --- position / size -------------------------------------------------
        shape.append(_cell("PinX", _fmt(b.cx)))
        shape.append(_cell("PinY", _fmt(b.cy)))
        shape.append(_cell("Width", _fmt(b.w)))
        shape.append(_cell("Height", _fmt(b.h)))
        shape.append(_cell("LocPinX", _fmt(b.w / 2.0), "Width*0.5"))
        shape.append(_cell("LocPinY", _fmt(b.h / 2.0), "Height*0.5"))
        shape.append(_cell("Angle", "0"))
        shape.append(_cell("FlipX", "0"))
        shape.append(_cell("FlipY", "0"))
        shape.append(_cell("VerticalAlign", "1"))  # centre text vertically

        # --- explicit format overrides (fill / line) ------------------------
        shape.append(_cell("FillForegnd", b.fill))
        shape.append(_cell("FillBkgnd", b.fill))
        shape.append(_cell("FillPattern", "1"))
        shape.append(_cell("LineColor", b.line))
        shape.append(_cell("LineWeight", _fmt(0.0104166667)))  # 0.75 pt
        shape.append(_cell("LinePattern", "1"))
        shape.append(_cell("BeginArrow", "0"))
        shape.append(_cell("EndArrow", "0"))

        # --- text format -----------------------------------------------------
        char_sec = _E("Section", N="Character")
        char_row = ET.SubElement(char_sec, f"{{{V_NS}}}Row")
        char_row.set("IX", "0")
        char_row.append(_cell("Size", str(b.font_size)))
        char_row.append(_cell("Color", b.text_color))
        char_row.append(_cell("Font", "1"))  # Calibri face defined in document
        char_row.append(_cell("Style", "0"))
        shape.append(char_sec)

        # paragraph: centre horizontally
        par_sec = _E("Section", N="Paragraph")
        par_row = ET.SubElement(par_sec, f"{{{V_NS}}}Row")
        par_row.set("IX", "0")
        par_row.append(_cell("HorizontalAlign", "1"))
        shape.append(par_sec)

        # --- geometry ---------------------------------------------------------
        shape.append(self._geometry())

        # --- text -------------------------------------------------------------
        if b.text:
            _make_text(shape, b.text)
        return shape

    def _geometry(self) -> ET.Element:
        b = self.box
        w, h = b.w, b.h
        sec = _E("Section", N="Geometry", IX="0")
        sec.append(_geometry_cell("NoFill", "0"))
        sec.append(_geometry_cell("NoLine", "0"))
        if b.kind == "ellipse":
            row = ET.SubElement(sec, f"{{{V_NS}}}Row")
            row.set("T", "Ellipse")
            row.set("IX", "1")
            row.append(_cell("X", _fmt(w / 2.0)))
            row.append(_cell("Y", _fmt(h / 2.0)))
            row.append(_cell("A", _fmt(w)))          # major-axis point
            row.append(_cell("B", _fmt(h / 2.0)))
            row.append(_cell("C", _fmt(w / 2.0)))
            row.append(_cell("D", _fmt(h)))          # minor-axis point
        else:
            pts = [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h), (0.0, 0.0)]
            for i, (px, py) in enumerate(pts, start=1):
                row = ET.SubElement(sec, f"{{{V_NS}}}Row")
                row.set("T", "MoveTo" if i == 1 else "LineTo")
                row.set("IX", str(i))
                row.append(_cell("X", _fmt(px)))
                row.append(_cell("Y", _fmt(py)))
        return sec


def _make_text(parent: ET.Element, text: str) -> ET.Element:
    txt = ET.SubElement(parent, f"{{{V_NS}}}Text")
    txt.text = text
    return txt


# ---------------------------------------------------------------------------
def _line_weight_inches(points: float) -> float:
    return points / 72.0


class VisioConnector:
    """Plain 2-D rendering of a connector: a stroked line polyline + optional
    arrow-head triangle + optional label.  Uses absolute page coordinates by
    pinning the shape so that local origin == page origin.  This is fully
    deterministic (no master / glue machinery) and renders in any VSDX reader.
    """

    def __init__(self, spec: ConnectorSpec):
        self.spec = spec

    # -- a shape pinned at local (0,0)==page(0,0) --------------------------
    def _raw_shape(self, sid: int) -> ET.Element:
        shape = _E("Shape", ID=str(sid), Type="Shape",
                   NameU=f"Connector.{sid}", Name=f"Connector.{sid}")
        s = self.spec
        # width/height just need to enclose the drawing area
        shape.append(_cell("PinX", "0"))
        shape.append(_cell("PinY", "0"))
        shape.append(_cell("Width", _fmt(max(s.page_w, 1.0))))
        shape.append(_cell("Height", _fmt(max(s.page_h, 1.0))))
        shape.append(_cell("LocPinX", "0"))
        shape.append(_cell("LocPinY", "0"))
        shape.append(_cell("Angle", "0"))
        return shape

    def _line_shape(self, sid: int) -> ET.Element:
        s = self.spec
        shape = self._raw_shape(sid)
        shape.append(_cell("LineColor", s.line_color))
        shape.append(_cell("LineWeight",
                           _fmt(_line_weight_inches(s.line_weight))))
        shape.append(_cell("LinePattern", "1"))
        shape.append(_cell("BeginArrow", "0"))
        shape.append(_cell("EndArrow", "0"))

        sec = _E("Section", N="Geometry", IX="0")
        sec.append(_geometry_cell("NoFill", "1"))
        sec.append(_geometry_cell("NoLine", "0"))
        row1 = ET.SubElement(sec, f"{{{V_NS}}}Row")
        row1.set("T", "MoveTo"); row1.set("IX", "1")
        row1.append(_cell("X", _fmt(s.bx))); row1.append(_cell("Y", _fmt(s.by)))
        row2 = ET.SubElement(sec, f"{{{V_NS}}}Row")
        row2.set("T", "LineTo"); row2.set("IX", "2")
        row2.append(_cell("X", _fmt(s.ex))); row2.append(_cell("Y", _fmt(s.ey)))
        shape.append(sec)
        return shape

    def _arrow_shape(self, sid: int) -> ET.Element:
        """A filled triangle arrow head whose apex points into the target."""
        s = self.spec
        size = max(0.12, _line_weight_inches(s.line_weight) * 8.0 + 0.08)
        base_pt = (s.ex - s.ux * size, s.ey - s.uy * size)
        # perpendicular for the base width
        px, py = -s.uy, s.ux
        half = size * 0.5
        v1 = (base_pt[0] + px * half, base_pt[1] + py * half)
        v2 = (base_pt[0] - px * half, base_pt[1] - py * half)
        tip = (s.ex, s.ey)

        shape = self._raw_shape(sid)
        shape.append(_cell("FillForegnd", s.line_color))
        shape.append(_cell("FillBkgnd", s.line_color))
        shape.append(_cell("FillPattern", "1"))
        shape.append(_cell("LineColor", s.line_color))
        shape.append(_cell("LineWeight", _fmt(_line_weight_inches(s.line_weight))))
        shape.append(_cell("LinePattern", "0"))  # no outline

        sec = _E("Section", N="Geometry", IX="0")
        sec.append(_geometry_cell("NoFill", "0"))
        sec.append(_geometry_cell("NoLine", "1"))
        for i, (pxx, pyy) in enumerate([tip, v1, v2, tip], start=1):
            row = ET.SubElement(sec, f"{{{V_NS}}}Row")
            row.set("T", "MoveTo" if i == 1 else "LineTo")
            row.set("IX", str(i))
            row.append(_cell("X", _fmt(pxx)))
            row.append(_cell("Y", _fmt(pyy)))
        shape.append(sec)
        return shape

    def _label_shape(self, sid: int, text: str, font_size: int) -> ET.Element:
        s = self.spec
        # estimate label width from characters
        char_w = font_size * 0.5 / 72.0
        w = max(0.6, len(text) * char_w + 0.12)
        h = max(0.2, font_size * 1.4 / 72.0)
        cx = (s.bx + s.ex) / 2.0
        cy = (s.by + s.ey) / 2.0 + h  # sit just above the line
        # clamp within page
        cx = max(0.05, min(cx, max(s.page_w - w / 2.0, 0.05)))
        cy = max(0.05 + h / 2.0, min(cy, max(s.page_h - h / 2.0, 0.05 + h / 2.0)))

        shape = _E("Shape", ID=str(sid), Type="Shape",
                   NameU=f"ConnectorLabel.{sid}",
                   Name=f"ConnectorLabel.{sid}")
        shape.append(_cell("PinX", _fmt(cx)))
        shape.append(_cell("PinY", _fmt(cy)))
        shape.append(_cell("Width", _fmt(w)))
        shape.append(_cell("Height", _fmt(h)))
        shape.append(_cell("LocPinX", _fmt(w / 2.0), "Width*0.5"))
        shape.append(_cell("LocPinY", _fmt(h / 2.0), "Height*0.5"))
        shape.append(_cell("Angle", "0"))
        shape.append(_cell("VerticalAlign", "1"))
        # white pill background so the label is readable over the line
        shape.append(_cell("FillForegnd", "#FFFFFF"))
        shape.append(_cell("FillBkgnd", "#FFFFFF"))
        shape.append(_cell("FillPattern", "1"))
        shape.append(_cell("LineColor", "#FFFFFF"))
        shape.append(_cell("LinePattern", "1"))
        shape.append(_cell("BeginArrow", "0"))
        shape.append(_cell("EndArrow", "0"))

        char_sec = _E("Section", N="Character")
        char_row = ET.SubElement(char_sec, f"{{{V_NS}}}Row")
        char_row.set("IX", "0")
        char_row.append(_cell("Size", str(font_size)))
        char_row.append(_cell("Color", "#333333"))
        char_row.append(_cell("Font", "1"))
        char_row.append(_cell("Style", "0"))
        shape.append(char_sec)

        par_sec = _E("Section", N="Paragraph")
        par_row = ET.SubElement(par_sec, f"{{{V_NS}}}Row")
        par_row.set("IX", "0")
        par_row.append(_cell("HorizontalAlign", "1"))
        shape.append(par_sec)

        # rectangle geometry (white pill)
        sec = _E("Section", N="Geometry", IX="0")
        sec.append(_geometry_cell("NoFill", "0"))
        sec.append(_geometry_cell("NoLine", "0"))
        pts = [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h), (0.0, 0.0)]
        for i, (px, py) in enumerate(pts, start=1):
            row = ET.SubElement(sec, f"{{{V_NS}}}Row")
            row.set("T", "MoveTo" if i == 1 else "LineTo")
            row.set("IX", str(i))
            row.append(_cell("X", _fmt(px)))
            row.append(_cell("Y", _fmt(py)))
        shape.append(sec)
        _make_text(shape, text)
        return shape


# ---------------------------------------------------------------------------
class VisioDocument:
    """Main builder: JSON description -> .vsdx package."""

    def __init__(self, boilerplate_b64: Optional[str] = None):
        self.title = ""
        self.description = ""
        self.pages = []  # list of raw page dicts
        self._skeleton = self._load_skeleton(boilerplate_b64)

    # -- embedded OPC boilerplate ------------------------------------------
    @staticmethod
    def _load_skeleton(boilerplate_b64):
        if boilerplate_b64 is None:
            boilerplate_b64 = _BOILERPLATE_B64
        raw = base64.b64decode(boilerplate_b64)
        z = zipfile.ZipFile(BytesIO(raw))
        return {name: z.read(name) for name in z.namelist()}

    def load_from_json(self, json_data: dict) -> None:
        doc_info = json_data.get("document", {}) or {}
        self.title = doc_info.get("title", "Untitled")
        self.description = doc_info.get("description", "")
        self.pages = json_data.get("pages", [])

    # ----------------------------------------------------------------------
    # content-types
    # ----------------------------------------------------------------------
    def _content_types(self) -> str:
        types = ET.Element(f"{{{CT_NS}}}Types")
        for ext, ctype in (("rels",
                            "application/vnd.openxmlformats-package.relationships+xml"),
                           ("xml", "application/xml")):
            d = ET.SubElement(types, f"{{{CT_NS}}}Default")
            d.set("Extension", ext); d.set("ContentType", ctype)

        def override(part, ctype):
            o = ET.SubElement(types, f"{{{CT_NS}}}Override")
            o.set("PartName", part); o.set("ContentType", ctype)

        override("/visio/document.xml", "application/vnd.ms-visio.drawing.main+xml")
        override("/visio/windows.xml", "application/vnd.ms-visio.windows+xml")
        override("/visio/pages/pages.xml", "application/vnd.ms-visio.pages+xml")
        override("/visio/masters/masters.xml", "application/vnd.ms-visio.masters+xml")
        override("/visio/masters/master1.xml", "application/vnd.ms-visio.master+xml")
        for i in range(1, len(self.pages) + 1):
            override(f"/visio/pages/page{i}.xml",
                     "application/vnd.ms-visio.page+xml")
        override("/docProps/core.xml",
                 "application/vnd.openxmlformats-package.core-properties+xml")
        override("/docProps/app.xml",
                 "application/vnd.openxmlformats-officedocument.extended-properties+xml")
        return ET.tostring(types, encoding="unicode", xml_declaration=True)

    def _root_rels(self) -> str:
        rels = ET.Element(f"{{{REL_NS}}}Relationships")
        for rid, rtype, target in (
                ("rId1",
                 "http://schemas.microsoft.com/visio/2010/relationships/document",
                 "visio/document.xml"),
                ("rId3",
                 "http://schemas.openxmlformats.org/package/2006/relationships/"
                 "metadata/core-properties", "docProps/core.xml"),
                ("rId4",
                 "http://schemas.openxmlformats.org/officeDocument/2006/"
                 "relationships/extended-properties", "docProps/app.xml")):
            r = ET.SubElement(rels, f"{{{REL_NS}}}Relationship")
            r.set("Id", rid); r.set("Type", rtype); r.set("Target", target)
        return ET.tostring(rels, encoding="unicode", xml_declaration=True)

    def _core_props(self) -> str:
        root = ET.Element(f"{{{CORE_NS}}}coreProperties")
        root.set(f"{{{XSI_NS}}}schemaLocation",
                 "http://schemas.openxmlformats.org/package/2006/metadata/"
                 "core-properties "
                 "http://schemas.openxmlformats.org/officeDocument/2006/"
                 "relationships/metadata/core-properties")
        ET.SubElement(root, f"{{{DC_NS}}}title").text = self.title
        ET.SubElement(root, f"{{{DC_NS}}}subject").text = self.description
        ET.SubElement(root, f"{{{DC_NS}}}creator").text = "Visio JSON Generator"
        ET.SubElement(root, f"{{{DC_NS}}}description").text = self.description
        ET.SubElement(root, f"{{{DC_NS}}}language").text = "en-GB"
        return ET.tostring(root, encoding="unicode", xml_declaration=True)

    def _app_props(self) -> str:
        """Extended properties: reflect the actual page list (and the single
        embedded 'Dynamic connector' master shipped in the boilerplate)."""
        root = ET.Element(f"{{{APP_NS}}}Properties")
        ET.SubElement(root, f"{{{APP_NS}}}Template")
        ET.SubElement(root, f"{{{APP_NS}}}Application").text = "Microsoft Visio"
        page_names = [p.get("name", f"Page-{i + 1}")
                      for i, p in enumerate(self.pages)]
        titles = page_names + ["Dynamic connector"]

        hp = ET.SubElement(root, f"{{{APP_NS}}}HeadingPairs")
        vec = ET.SubElement(hp, f"{{{VT_NS}}}vector")
        vec.set("size", "4"); vec.set("baseType", "variant")
        v1 = ET.SubElement(vec, f"{{{VT_NS}}}variant")
        ET.SubElement(v1, f"{{{VT_NS}}}lpstr").text = "Pages"
        v1b = ET.SubElement(vec, f"{{{VT_NS}}}variant")
        ET.SubElement(v1b, f"{{{VT_NS}}}i4").text = str(len(self.pages))
        v2 = ET.SubElement(vec, f"{{{VT_NS}}}variant")
        ET.SubElement(v2, f"{{{VT_NS}}}lpstr").text = "Masters"
        v2b = ET.SubElement(vec, f"{{{VT_NS}}}variant")
        ET.SubElement(v2b, f"{{{VT_NS}}}i4").text = "1"

        top = ET.SubElement(root, f"{{{APP_NS}}}TitlesOfParts")
        tvec = ET.SubElement(top, f"{{{VT_NS}}}vector")
        tvec.set("size", str(len(titles))); tvec.set("baseType", "lpstr")
        for t in titles:
            ET.SubElement(tvec, f"{{{VT_NS}}}lpstr").text = t
        ET.SubElement(root, f"{{{APP_NS}}}AppVersion").text = "16.0000"
        return ET.tostring(root, encoding="unicode", xml_declaration=True)

    # -- pages.xml ---------------------------------------------------------
    def _pages_xml(self) -> str:
        pages = _E("Pages")
        for i, page in enumerate(self.pages):
            p = ET.SubElement(pages, f"{{{V_NS}}}Page")
            p.set("ID", str(i))
            name = page.get("name", f"Page-{i + 1}")
            p.set("NameU", name); p.set("Name", name)
            sheet = ET.SubElement(p, f"{{{V_NS}}}PageSheet")
            sheet.set("ID", str(i))
            sheet.set("LineStyle", "0")
            sheet.set("FillStyle", "0")
            sheet.set("TextStyle", "0")
            sheet.append(_cell("PageWidth", _fmt(_num(page.get("width"), 11.0))))
            sheet.append(_cell("PageHeight", _fmt(_num(page.get("height"), 8.5))))
            # PageScale / DrawingScale: 0.03937007874015748 inches == 1 mm
            # (i.e. 1:1) -- this is exactly what a real Visio page carries.
            for cname in ("PageScale", "DrawingScale"):
                c = _cell(cname, "0.03937007874015748")
                c.set("U", "MM")
                sheet.append(c)
            rel = ET.SubElement(p, f"{{{V_NS}}}Rel")
            rel.set(f"{{{R_NS}}}id", f"rId{i + 1}")
        return ET.tostring(pages, encoding="unicode", xml_declaration=True)

    def _pages_rels(self) -> str:
        rels = ET.Element(f"{{{REL_NS}}}Relationships")
        for i in range(len(self.pages)):
            r = ET.SubElement(rels, f"{{{REL_NS}}}Relationship")
            r.set("Id", f"rId{i + 1}")
            r.set("Type", "http://schemas.microsoft.com/visio/2010/"
                          "relationships/page")
            r.set("Target", f"page{i + 1}.xml")
        return ET.tostring(rels, encoding="unicode", xml_declaration=True)

    # -- page content -------------------------------------------------------
    def _page_xml(self, page: dict) -> str:
        page_w = _num(page.get("width"), 11.0)
        page_h = _num(page.get("height"), 8.5)
        shapes_data = page.get("shapes", []) or []
        connectors_data = page.get("connectors", []) or []

        boxes: Dict[str, BoxSpec] = {}
        next_id = 1
        for sd in shapes_data:
            box = BoxSpec(sd, next_id, page_w, page_h)
            boxes[box.user_id] = box
            next_id += 1

        conns: List[ConnectorSpec] = []
        for cd in connectors_data:
            from_box = boxes.get(str(cd.get("from_shape_id", "")))
            to_box = boxes.get(str(cd.get("to_shape_id", "")))
            if not from_box or not to_box:
                raise ValueError(
                    f"Connector references unknown shapes: "
                    f"{cd.get('from_shape_id')} -> {cd.get('to_shape_id')}")
            conns.append(ConnectorSpec(cd, next_id, from_box, to_box,
                                       page_w, page_h))

        contents = _E("PageContents")
        shapes = ET.SubElement(contents, f"{{{V_NS}}}Shapes")

        for box in boxes.values():
            shapes.append(VisioShape(box).to_xml_element())

        # each connector is drawn with up to three extra shapes (line, arrow
        # head, label).  Keep one global counter so every shape id is unique.
        uid = len(boxes) + 1
        for spec in conns:
            line = VisioConnector(spec)
            shapes.append(line._line_shape(uid)); uid += 1
            shapes.append(line._arrow_shape(uid)); uid += 1
            if spec.label:
                label_font = spec.data.get("font_size", 9) or 9
                shapes.append(line._label_shape(uid, spec.label,
                                                int(_num(label_font, 9))))
                uid += 1

        ET.SubElement(contents, f"{{{V_NS}}}Connects")
        return ET.tostring(contents, encoding="unicode", xml_declaration=True)

    # ----------------------------------------------------------------------
    def save(self, output_path: str) -> None:
        entries = dict(self._skeleton)  # static OPC parts
        # regenerate the parts that depend on our pages / document props
        entries["[Content_Types].xml"] = self._content_types().encode("utf-8")
        entries["_rels/.rels"] = self._root_rels().encode("utf-8")
        entries["docProps/core.xml"] = self._core_props().encode("utf-8")
        entries["docProps/app.xml"] = self._app_props().encode("utf-8")
        entries["visio/pages/pages.xml"] = self._pages_xml().encode("utf-8")
        entries["visio/pages/_rels/pages.xml.rels"] = \
            self._pages_rels().encode("utf-8")
        # drop stale per-page relationship files (pageN.xml.rels); keep
        # pages.xml.rels which is written above
        for k in [k for k in entries
                  if re.match(r"visio/pages/_rels/page\d+\.xml\.rels$", k)]:
            del entries[k]
        for i, page in enumerate(self.pages, start=1):
            entries[f"visio/pages/page{i}.xml"] = \
                self._page_xml(page).encode("utf-8")

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as z:
            for name, data in entries.items():
                z.writestr(name, data)
        print(f"Visio file saved: {output_path}")


# ---------------------------------------------------------------------------
# Alternate / simple schema support
# ---------------------------------------------------------------------------
# A lot of people describe a diagram with just labelled nodes and connections
# (no coordinates / colours).  We auto-detect that shape and lay it out on a
# fresh page for them.
_TYPE_COLORS = {
    "person": "#4472C4", "user": "#4472C4", "client": "#4472C4",
    "human": "#4472C4",
    "application": "#70AD47", "app": "#70AD47", "web": "#70AD47",
    "frontend": "#70AD47",
    "process": "#ED7D31", "agent": "#ED7D31", "service": "#ED7D31",
    "worker": "#ED7D31", "function": "#ED7D31",
    "ai": "#7030A0", "llm": "#7030A0", "model": "#7030A0", "ml": "#7030A0",
    "database": "#FFC000", "db": "#FFC000", "storage": "#FFC000",
    "sql": "#FFC000", "postgres": "#FFC000",
    "gateway": "#2E75B6", "api": "#2E75B6", "proxy": "#2E75B6",
    "cloud": "#5B9BD5", "infra": "#5B9BD5", "server": "#5B9BD5",
    "queue": "#A5A5A5", "message": "#A5A5A5", "bus": "#A5A5A5",
    "security": "#C00000", "firewall": "#C00000", "auth": "#C00000",
}


def _luminance(hex_color: str) -> float:
    s = _clean_rgb(hex_color).lstrip("#")
    r, g, b = (int(s[i:i + 2], 16) for i in (0, 2, 4))
    return 0.299 * r + 0.587 * g + 0.114 * b


def _darker(hex_color: str, factor: float = 0.78) -> str:
    s = _clean_rgb(hex_color).lstrip("#")
    r, g, b = (max(0, int(int(s[i:i + 2], 16) * factor))
               for i in (0, 2, 4))
    return f"#{r:02x}{g:02x}{b:02x}"


def _auto_layout_simple(data: dict) -> dict:
    """Turn a {diagram, nodes[], connections[]} document into the standard
    {document, pages[]} shape, choosing positions automatically."""
    nodes = data.get("nodes", []) or []
    conns = data.get("connections", []) or []
    if not nodes:
        raise ValueError("No 'nodes' found in the diagram JSON.")

    by_id = {str(n.get("id")): n for n in nodes}

    # ---- directed graph + longest-path layering (a->b means a feeds b) ----
    indeg = {nid: 0 for nid in by_id}
    out = {nid: [] for nid in by_id}
    edge_list = []
    for c in conns:
        a, b = str(c.get("from", "")), str(c.get("to", ""))
        if a in by_id and b in by_id:
            out[a].append(b)
            indeg[b] += 1
            edge_list.append((a, b, c.get("label", "")))

    # topological order (Kahn), with a cycle-safe fallback
    d = dict(indeg)
    tq = deque(nid for nid in by_id if d[nid] == 0)
    order = []
    while tq:
        n = tq.popleft()
        order.append(n)
        for m in out[n]:
            d[m] -= 1
            if d[m] == 0:
                tq.append(m)
    for nid in by_id:
        if nid not in order:
            order.append(nid)

    layer = {nid: 0 for nid in by_id}
    for nid in order:
        for m in out[nid]:
            layer[m] = max(layer[m], layer[nid] + 1)

    # ---- place nodes in vertical columns, one column per distinct layer ----
    distinct = sorted(set(layer.values()))
    col_of_layer = {lv: i for i, lv in enumerate(distinct)}
    cols = [[] for _ in distinct]
    for nid in by_id:
        cols[col_of_layer[layer[nid]]].append(nid)

    ncols = len(distinct)
    max_per_col = max((len(c) for c in cols), default=1)
    margin = 1.0
    node_w, node_h = 2.6, 1.15
    hgap, vgap = 1.6, 1.2
    page_w = margin * 2 + ncols * node_w + (ncols - 1) * hgap
    # a little breathing room above/below each column of nodes
    page_h = margin * 2 + max_per_col * (node_h + vgap) - vgap
    page_h = max(page_h, 3.0)
    step = (page_h - margin * 2) / max(max_per_col, 1)
    if max_per_col == 1:
        step = 0.0

    shapes = []
    node_seq = []  # order list of ids that exist, for stable vertical order
    for nid in by_id:
        node_seq.append(nid)
    seq_idx = {nid: i for i, nid in enumerate(node_seq)}

    for ci, col in enumerate(cols):
        # sort within column by original node order for a stable layout
        col = sorted(col, key=lambda nid: seq_idx[nid])
        x = margin + ci * (node_w + hgap) + node_w / 2.0
        ys = []
        if len(col) == 1:
            ys.append(page_h / 2.0)
        else:
            top = margin + node_h / 2.0
            bottom = page_h - margin - node_h / 2.0
            ys = [top + (bottom - top) * (i / (len(col) - 1))
                  for i in range(len(col))]
        for nid, y in zip(col, ys):
            nd = by_id[nid]
            ntype = str(nd.get("type", "")).lower().strip()
            fill = _TYPE_COLORS.get(ntype, "#5B9BD5")
            text_color = "#000000" if _luminance(fill) > 160 else "#FFFFFF"
            shapes.append({
                "id": str(nd.get("id")),
                "type": "rectangle",
                "text": nd.get("label", str(nd.get("id"))),
                "x": round(x, 3),
                "y": round(y, 3),
                "width": node_w,
                "height": node_h,
                "fill_color": fill,
                "line_color": _darker(fill),
                "text_color": text_color,
                "font_size": 12,
            })

    connectors = []
    for a, b, label in edge_list:
        connectors.append({
            "from_shape_id": a,
            "to_shape_id": b,
            "label": label,
            "line_color": "#595959",
            "line_weight": 1.25,
        })

    doc = data.get("diagram", {}) or {}
    return {
        "document": {
            "title": doc.get("title", "Diagram"),
            "description": doc.get("description", ""),
        },
        "pages": [{
            "name": doc.get("page_name", "Page-1"),
            "width": round(page_w, 3),
            "height": round(page_h, 3),
            "shapes": shapes,
            "connectors": connectors,
        }],
    }


# ---------------------------------------------------------------------------
# Universal schema analysis
# ---------------------------------------------------------------------------
# Rather than requiring one fixed schema, we *inspect* whatever JSON arrives
# and discover, structurally:
#   * a document title/description
#   * an array of "node"-like objects (something with an id/name/label/...)
#   * an array of "edge"-like objects (something linking two node ids)
# and render a .vsdx from that.  The full {document, pages} schema is still
# honoured directly (it has shapes/connectors already laid out).
_GRAPH_HINT = {  # node array key names carry the most weight when choosing
    "nodes", "node", "shapes", "components", "elements", "vertices",
    "vertex", "boxes", "objects", "items", "blocks", "componentsList",
    "nodesList", "shapesList",
}
_EDGE_HINT = {  # edge array key names
    "connections", "edges", "links", "relationships", "flows", "relations",
    "connectors", "arrows", "lines", "wires",
}
# identity keys are checked in this order -- specific "<thing>_id/Id" tokens
# come before the generic "name" so that e.g. an element carrying both
# {"component_id": "ui", "name": "UI"} uses "ui" as its id.
_ID_KEYS = [
    "id", "_id",
    "node_id", "nodeId", "component_id", "componentId", "element_id",
    "elementId", "shape_id", "shapeId", "object_id", "objectId",
    "vertex_id", "vertexId", "item_id", "itemId", "entity_id", "entityId",
    "block_id", "blockId", "box_id", "boxId", "actor_id", "actorId",
    "source_id", "sourceId", "target_id", "targetId",
    "key", "uuid", "uid", "code", "name",
]
_LABEL_KEYS = ["label", "text", "title", "name", "caption", "text_content",
               "display_name", "displayText", "label_text", "heading"]
_TYPE_KEYS = ["type", "kind", "category", "role", "node_type", "class",
              "subtype", "shape"]
_ENDPOINT_PAIRS = [
    ("from", "to"),
    ("source", "target"),
    ("src", "dst"),
    ("fromId", "toId"),
    ("from_id", "to_id"),
    ("sourceId", "targetId"),
    ("source_id", "target_id"),
    ("fromNode", "toNode"),
    ("from_node", "to_node"),
    ("tail", "head"),
    ("start", "end"),
    ("startId", "endId"),
    ("a", "b"),
    ("u", "v"),
    ("one", "two"),
]
_NEST_CONTAINERS = ["properties", "attrs", "attributes", "data", "content",
                    "item", "value", "meta"]
_PALETTE = ["#5B9BD5", "#70AD47", "#ED7D31", "#7030A0", "#FFC000",
            "#00B0F0", "#C00000", "#A5A5A5", "#2E75B6", "#548235",
            "#BF8F00", "#C55A11"]


def _is_scalar(v):
    return isinstance(v, (str, int, float)) and not isinstance(v, bool)


def _containers(elem):
    """Yield sub-dicts that may carry the real fields of an element."""
    out = []
    for v in elem.values():
        if isinstance(v, dict):
            out.append(v)
    return out


def _deep_get(elem, keys):
    """Return first value found for any of keys, searching the element and one
    nesting level of well-known container keys."""
    for k in keys:
        if k in elem and _is_scalar(elem[k]) or (k in elem and elem[k] is not None
                                                 and not isinstance(elem[k], (dict, list))):
            return elem[k]
    for c in _containers(elem):
        for k in keys:
            if k in c:
                v = c[k]
                if _is_scalar(v) or v is None:
                    return v
    return None


def _collect_arrays(root):
    """Yield every non-empty list whose items are dicts."""
    found = []

    def walk(o):
        if isinstance(o, list):
            if o and all(isinstance(x, dict) for x in o):
                found.append(o)
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
    walk(root)
    return found


def _has_identity_keys(elem):
    for k in _ID_KEYS:
        if k in elem:
            return True
    for c in _containers(elem):
        for k in _ID_KEYS:
            if k in c:
                return True
    return False


def _has_label_keys(elem):
    for k in _LABEL_KEYS:
        if k in elem:
            return True
    for c in _containers(elem):
        for k in _LABEL_KEYS:
            if k in c:
                return True
    return False


def _node_score(arr):
    """How 'node-like' is this array of dicts?"""
    total = 0.0
    n = 0
    for e in arr:
        if not isinstance(e, dict):
            continue
        n += 1
        if _has_identity_keys(e):
            total += 2.0
        if _has_label_keys(e):
            total += 1.5
    return total / max(n, 1), n


def _pick_node_array(data, arrays):
    best, best_score, best_n = None, -1, -1
    # try key-name hints first (strongest)
    def containers_named(d, names):
        found = []
        for k, v in d.items():
            if k in names and isinstance(v, list) and v:
                found.append(v)
        return found
    hinted = containers_named(data, _GRAPH_HINT) + containers_named(
        data, {"nodes", "node"})
    for arr in hinted:
        score, n = _node_score(arr)
        if score > 0 and (score > best_score or (score == best_score and n > best_n)):
            best, best_score, best_n = arr, score, n
    if best is not None:
        return best
    # fall back to best structural score, de-prioritising arrays whose members
    # mostly *reference* other ids (those are edge arrays, not node arrays)
    for arr in arrays:
        score, n = _node_score(arr)
        if score > 0 and (score > best_score or (score == best_score and n > best_n)):
            best, best_score, best_n = arr, score, n
    return best


def _resolve_endpoints(elem, universe):
    """Return up to 2 endpoint values (as strings) that appear in universe."""
    found = []
    # explicit named pairs get priority
    for fk, tk in _ENDPOINT_PAIRS:
        if fk in elem and tk in elem:
            fv, tv = str(elem[fk]), str(elem[tk])
            if fv in universe:
                found.append(fv)
            if tv in universe:
                found.append(tv)
            if len(found) >= 2:
                return found[:2]
    # generic: collect keys whose scalar value is in universe
    cand = []
    for k, v in elem.items():
        if _is_scalar(v) and str(v) in universe:
            cand.append(str(v))
    # nested containers
    for c in _containers(elem):
        for k, v in c.items():
            if _is_scalar(v) and str(v) in universe and str(v) not in cand:
                cand.append(str(v))
    if len(cand) >= 2:
        return cand[:2]
    return found[:2]


def _pick_edge_array(data, arrays, node_arr, universe):
    if node_arr is None or not universe:
        return None
    hinted = []
    def named(d, names):
        out = []
        for k, v in d.items():
            if k in names and isinstance(v, list) and v:
                out.append(v)
        return out
    hinted = named(data, _EDGE_HINT)
    best, best_score = None, -1
    for arr in hinted + arrays:
        if arr is node_arr:
            continue
        if not arr or not all(isinstance(x, dict) for x in arr):
            continue
        hits = sum(1 for e in arr if len(_resolve_endpoints(e, universe)) >= 2)
        score = hits / len(arr)
        if score > 0 and score > best_score:
            best, best_score = arr, score
    return best


def _edge_label(elem):
    """Fallback label for an edge: the first short scalar string that is not one
    of the two endpoint references (e.g. a 'description' / 'protocol' field)."""
    vals = []
    for k, v in elem.items():
        if isinstance(v, bool) or not isinstance(v, (str, int, float)):
            continue
        if k.lower() in ("from", "to", "source", "target", "src", "dst",
                         "fromid", "toid", "sourceid", "targetid"):
            continue
        s = str(v).strip()
        if s and len(s) <= 60:
            vals.append((k, s))
    for c in _containers(elem):
        for k, v in c.items():
            if isinstance(v, bool) or not isinstance(v, (str, int, float)):
                continue
            s = str(v).strip()
            if s and len(s) <= 60:
                vals.append((k, s))
    # prefer string-looking values over pure numbers for a readable label
    def pick(entry):
        k, s = entry
        try:
            float(s)
            return 1  # numeric, less useful as a label
        except ValueError:
            return 0
    if vals:
        vals.sort(key=pick)
        return vals[0][1]
    return None


def _meta(root):
    title = _deep_get(root, ["title", "name", "heading", "caption",
                             "diagram_name", "label"])
    desc = _deep_get(root, ["description", "desc", "subtitle", "notes"])
    page = _deep_get(root, ["page", "page_name", "canvas"]) 
    return {
        "title": str(title) if title is not None else "Diagram",
        "description": str(desc) if desc is not None else "",
        "page_name": str(page) if page is not None else "Page-1",
    }


def _get_xy(elem):
    """Extract numeric x/y/width/height if present (either directly or nested)."""
    out = {}
    for key in ("x", "y", "width", "height", "w", "h"):
        if key in elem and isinstance(elem[key], (int, float)) and \
                not isinstance(elem[key], bool):
            out[key] = float(elem[key])
    for c in _containers(elem):
        for key in ("x", "y", "width", "height"):
            if key in c and isinstance(c[key], (int, float)):
                out[key] = float(c[key])
    return out


def _unwrap_element(elem):
    """If an element is a thin wrapper like {'data': {...real...}}, treat the
    nested dict as the element (merged over the wrapper's scalar fields)."""
    if not isinstance(elem, dict):
        return elem
    for c in _containers(elem):
        if isinstance(c, dict) and _has_identity_keys(c):
            merged = {k: v for k, v in elem.items()
                      if not isinstance(v, dict)}
            merged.update(c)
            return merged
    return elem


def _analyse_any(data):
    """Structural analysis of arbitrary JSON -> standard {document, pages}."""
    # tolerate top-level wrapper / single-element list
    while isinstance(data, list) and len(data) == 1:
        data = data[0]
    if isinstance(data, list):
        # maybe it's a list of node objects directly
        data = {"_items": data}
    if not isinstance(data, dict):
        raise ValueError(
            f"JSON root must be an object/array; got {type(data).__name__}.")

    arrays = _collect_arrays(data)
    arrays = [a for a in arrays if a]  # non-empty
    if not arrays:
        raise ValueError("No arrays of objects found in the JSON, so there is "
                         "nothing to draw.")

    node_arr = _pick_node_array(data, arrays)
    if node_arr is None:
        raise ValueError("Could not find a list of node/component objects in "
                         "the JSON (nothing has an id/name/label).")

    # node universe
    universe = set()
    node_objs = []
    for e in node_arr:
        if not isinstance(e, dict):
            continue
        e = _unwrap_element(e)
        _id = _deep_get(e, _ID_KEYS)
        if _id is None:
            continue
        _id = str(_id)
        label = _deep_get(e, _LABEL_KEYS)
        ntype = _deep_get(e, _TYPE_KEYS)
        geom = _get_xy(e)
        universe.add(_id)
        node_objs.append({
            "id": _id,
            "label": str(label) if label is not None else _id,
            "type": str(ntype) if ntype is not None else "",
            "geom": geom,
        })

    edge_arr = _pick_edge_array(data, arrays, node_arr, universe)
    edges = []
    if edge_arr is not None:
        for e in edge_arr:
            if not isinstance(e, dict):
                continue
            eps = _resolve_endpoints(e, universe)
            if len(eps) < 2:
                continue
            lab = _deep_get(e, _LABEL_KEYS)
            if lab is None:
                lab = _edge_label(e)
            edges.append({"from": eps[0], "to": eps[1],
                          "label": str(lab) if lab is not None else ""})

    if not node_objs:
        raise ValueError("No node objects with an id could be extracted.")
    if not edges:
        print("Note: no inter-node links (edges) detected; drawing nodes only.")

    # If every node has explicit geometry, honour it; otherwise auto-layout.
    has_geom = all("x" in n["geom"] and "y" in n["geom"] for n in node_objs)
    meta = _meta(data)
    if has_geom:
        return _build_pages_manual(node_objs, edges, meta)
    # feed the generic auto-layout (reuses colour-by-type logic)
    return _auto_layout_simple({
        "diagram": meta,
        "nodes": [{"id": n["id"], "label": n["label"], "type": n["type"]}
                  for n in node_objs],
        "connections": [{"from": e["from"], "to": e["to"],
                         "label": e["label"]} for e in edges],
    })


def _build_pages_manual(node_objs, edges, meta):
    """Use provided node geometry to build pages, sizing the page to fit."""
    margin = 0.6
    shapes = []
    for idx, n in enumerate(node_objs):
        g = n["geom"]
        w = g.get("width", g.get("w", 2.6))
        h = g.get("height", g.get("h", 1.15))
        fill = _color_for_type(n["type"], idx)
        text_color = "#000000" if _luminance(fill) > 160 else "#FFFFFF"
        shapes.append({
            "id": n["id"], "type": "rectangle", "text": n["label"],
            "x": float(g["x"]), "y": float(g["y"]),
            "width": float(w), "height": float(h),
            "fill_color": fill, "line_color": _darker(fill),
            "text_color": text_color, "font_size": 12,
        })
    # find bounding box for page size
    minx = min(s["x"] - s["width"] / 2 for s in shapes)
    maxx = max(s["x"] + s["width"] / 2 for s in shapes)
    miny = min(s["y"] - s["height"] / 2 for s in shapes)
    maxy = max(s["y"] + s["height"] / 2 for s in shapes)
    page_w = max((maxx - minx) + 2 * margin, 3.0)
    page_h = max((maxy - miny) + 2 * margin, 3.0)
    if minx < 0 or miny < 0 or abs(maxx - minx) > page_w * 1.5:
        # shift coordinates into positive page space if they go negative
        ox, oy = max(-minx + margin, 0), max(-miny + margin, 0)
        for s in shapes:
            s["x"] += ox
            s["y"] += oy
    connectors = [{
        "from_shape_id": e["from"], "to_shape_id": e["to"], "label": e["label"],
        "line_color": "#595959", "line_weight": 1.25,
    } for e in edges]
    return {
        "document": meta,
        "pages": [{
            "name": meta["page_name"], "width": round(page_w, 3),
            "height": round(page_h, 3), "shapes": shapes,
            "connectors": connectors,
        }],
    }


def _color_for_type(ntype, idx):
    t = str(ntype).lower().strip()
    if t in _TYPE_COLORS:
        return _TYPE_COLORS[t]
    return _PALETTE[idx % len(_PALETTE)]


def _normalise_json(data):
    """Turn *any* JSON diagram description into our standard {document,pages}
    shape.  The full schema is passed through; everything else is analysed
    structurally."""
    # handle a JSON string that arrived pre-decoded
    if isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict):
        if "pages" in data[0] or "nodes" in data[0] or "components" in data[0]:
            data = data[0]
    if isinstance(data, dict) and "pages" in data:
        return data
    return _analyse_any(data)


# ---------------------------------------------------------------------------
# entry points
# ---------------------------------------------------------------------------
def validate_json(json_data: dict) -> None:
    """Validate the JSON structure before generation."""
    if "pages" not in json_data:
        raise ValueError("JSON must contain a 'pages' key")
    for i, page in enumerate(json_data["pages"]):
        shape_ids = {str(s.get("id")) for s in page.get("shapes", [])}
        for conn in page.get("connectors", []):
            frm = str(conn.get("from_shape_id", ""))
            to = str(conn.get("to_shape_id", ""))
            if frm not in shape_ids:
                raise ValueError(f"Connector references unknown "
                                 f"from_shape_id: {frm} (page {i})")
            if to not in shape_ids:
                raise ValueError(f"Connector references unknown "
                                 f"to_shape_id: {to} (page {i})")
    print("JSON validation passed")


def _looks_like_file_path(text: str) -> bool:
    """Heuristic: is this string more likely a file name than inline JSON?"""
    stripped = text.strip()
    if not stripped:
        return False
    if stripped[:1] in ("{", "["):
        return False  # definitely inline JSON
    return True


def create_visio_from_json(json_input, output_file="output.vsdx"):
    """Create a .vsdx file from a JSON file path or JSON string.

    json_input may be a path to a .json file or an inline JSON string.
    File reading is BOM/encoding tolerant so that Windows editors (Notepad's
    "UTF-8 with BOM", or accidentally UTF-16 saved files) don't break parsing.
    """
    if isinstance(json_input, str) and os.path.isfile(json_input):
        with open(json_input, "r", encoding="utf-8-sig") as f:
            text = f.read()
        if not text.strip():
            raise ValueError(
                f"The JSON file is empty: {json_input!r}\n"
                f"Open it and make sure it contains a '{{...}}' document.")
        try:
            json_data = json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Could not parse the JSON file {json_input!r}.\n"
                f"Reason: {e}\n"
                f"If you saved it from Notepad, re-save with "
                f"Encoding: UTF-8 (not 'Unicode'/UTF-16).") from None
        print(f"Loaded JSON from file: {json_input}")
    else:
        # We get here when json_input is NOT a file that exists.
        # If it *looks* like a file path, the real problem is usually that the
        # file is missing (wrong name / folder / cwd) -- say so clearly rather
        # than reporting a cryptic "expecting value" JSON error.
        if isinstance(json_input, str) and _looks_like_file_path(json_input):
            raise FileNotFoundError(
                f"Could not find the JSON file: {json_input!r}\n"
                f"Make sure the file exists and you give the right path.\n"
                f"Check the current folder and the exact spelling/case.\n\n"
                f"Examples:\n"
                f"  python visio_generator.py network_diagram.json\n"
                f"  python visio_generator.py C:/Users/you/Documents/fig.json")
        # treat as an inline JSON string
        if isinstance(json_input, str) and not json_input.strip():
            raise ValueError("json_input is empty.")
        try:
            json_data = json.loads(json_input)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Could not parse the JSON string you passed.\nReason: {e}") \
                from None
        print("Loaded JSON from string")

    # Show what we actually read, so schema problems are obvious.
    if isinstance(json_data, dict):
        print(f"Parsed object with top-level keys: "
              f"{', '.join(repr(k) for k in json_data)}")
    else:
        print(f"Parsed JSON as {type(json_data).__name__} "
              f"(expected a dict/object).")

    # The universal normaliser accepts the full {pages} schema directly, and
    # structurally analyses any other JSON into node/edge form for auto-layout.
    json_data = _normalise_json(json_data)
    print("Normalised JSON -> standard schema for rendering.")

    validate_json(json_data)

    doc = VisioDocument()
    doc.load_from_json(json_data)
    doc.save(output_file)
    return output_file


# ---------------------------------------------------------------------------
# embedded OPC boilerplate (base64 of the static non-page Visio parts)
# ---------------------------------------------------------------------------
_BOILERPLATE_B64 = (
    "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"
    "AQAARR4AAAAA"
)


# ---------------------------------------------------------------------------
# Command line usage
#   python visio_generator.py input.json            -> output.vsdx
#   python visio_generator.py input.json out.vsdx
#   python visio_generator.py                       -> run the built-in sample
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) > 1:
        json_path = sys.argv[1]
        output = sys.argv[2] if len(sys.argv) > 2 else "output.vsdx"
        create_visio_from_json(json_path, output)
    else:
        # no arguments: generate the built-in sample architecture diagram
        sample = {
            "document": {
                "title": "Sample Architecture Diagram",
                "description": "Created programmatically from JSON",
            },
            "pages": [
                {
                    "name": "Architecture",
                    "width": 11,
                    "height": 8.5,
                    "shapes": [
                        {"id": "1", "type": "rectangle", "text": "Client",
                         "x": 2.0, "y": 7.0, "width": 2.0, "height": 1.0,
                         "fill_color": "#5B9BD5", "line_color": "#2E75B6",
                         "text_color": "#FFFFFF", "font_size": 14},
                        {"id": "2", "type": "rectangle",
                         "text": "API Gateway",
                         "x": 5.5, "y": 7.0, "width": 2.0, "height": 1.0,
                         "fill_color": "#70AD47", "line_color": "#548235",
                         "text_color": "#FFFFFF", "font_size": 14},
                        {"id": "3", "type": "rectangle",
                         "text": "Microservice A",
                         "x": 3.0, "y": 4.5, "width": 2.0, "height": 1.0,
                         "fill_color": "#FFC000", "line_color": "#BF9000",
                         "text_color": "#000000", "font_size": 12},
                        {"id": "4", "type": "rectangle",
                         "text": "Microservice B",
                         "x": 7.0, "y": 4.5, "width": 2.0, "height": 1.0,
                         "fill_color": "#ED7D31", "line_color": "#C55A11",
                         "text_color": "#FFFFFF", "font_size": 12},
                        {"id": "5", "type": "rectangle", "text": "Database",
                         "x": 5.0, "y": 2.0, "width": 2.5, "height": 1.0,
                         "fill_color": "#4472C4", "line_color": "#2F5597",
                         "text_color": "#FFFFFF", "font_size": 14},
                    ],
                    "connectors": [
                        {"from_shape_id": "1", "to_shape_id": "2",
                         "label": "REST", "line_color": "#333333",
                         "line_weight": 1.5},
                        {"from_shape_id": "2", "to_shape_id": "3",
                         "label": "gRPC", "line_color": "#70AD47",
                         "line_weight": 1.0},
                        {"from_shape_id": "2", "to_shape_id": "4",
                         "label": "gRPC", "line_color": "#70AD47",
                         "line_weight": 1.0},
                        {"from_shape_id": "3", "to_shape_id": "5",
                         "label": "SQL", "line_color": "#4472C4",
                         "line_weight": 1.0},
                        {"from_shape_id": "4", "to_shape_id": "5",
                         "label": "SQL", "line_color": "#4472C4",
                         "line_weight": 1.0},
                    ],
                }
            ],
        }
        with open("input.json", "w") as f:
            json.dump(sample, f, indent=2)
        print("Sample input.json created")
        create_visio_from_json("input.json", "output.vsdx")
