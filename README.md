# Visio Generator — JSON → .vsdx

> **Universal input.** You do not need to match a fixed schema. The generator
> *analyses* whatever JSON you give it, finds the document title, the array of
> node/component objects, and the array of links between them, then lays the
> diagram out automatically. Anything already in the full `pages` schema is
> rendered exactly as given.

Create a Microsoft Visio **`.vsdx`** drawing from a JSON description of pages,
coloured boxes (rectangle / ellipse) and labelled connector arrows.

* Standard-library only: needs **no third‑party `vsdx` package** and **no external
  template file** at run time.
* Multi-page, per-page size, per-shape fill / line / text colours and font sizes.
* Connectors are drawn as stroked lines **between the edges of the boxes** with an
  arrow head pointing at the target shape, plus an optional white label above the
  line.

### It understands many shapes of JSON
The reader looks for the *structure*, not fixed names, so these all work:

```jsonc
// 1) nodes + connections (or edges/links/...)
{ "diagram": {"title": "..."}, "nodes": [{"id":"a","label":"A"}],
  "connections": [{"from":"a","to":"b","label":"1"}] }

// 2) components + flows + boundaries
{ "name": "...", "components": [{"component_id":"ui","name":"UI","kind":"app"}],
  "flows": [{"source":"ui","target":"api","description":"go"}] }

// 3) full schema (already laid out, coords honoured)
{ "document": {...}, "pages": [{"name":"P","shapes":[...],"connectors":[...]}] }
```

It detects each node's *label*, an optional *type* (used to pick a colour), and
optional *x / y / width / height*. When coordinates are absent it lays the
diagram out left-to-right; when present it honours them.

## Files

| File | Purpose |
|------|---------|
| `visio_generator.py` | The generator (single self-contained module). |
| `network_diagram.json` | Example input: a small network topology. |
| `input.json` | Example input: the built-in sample architecture diagram. |
| `output.vsdx` | `output.vsdx` generated from `network_diagram.json`. |

> **How it works.** A `.vsdx` file is a ZIP archive that follows the Open
> Packaging Convention.  Most of it is XML that Visio writes once and that is
> effectively static (the document stylesheet, font tables, a "Dynamic
> connector" master page, window state …).  Only the page content changes from
> one diagram to the next.  To guarantee files that open cleanly, the module
> embeds a small, known-good OPC *boilerplate* (derived from a real, empty Visio
> drawing) and regenerates only the page parts from your JSON.  The static
> boilerplate is stored as a base64 constant near the bottom of the file.

## Usage

### 1. Command line

```bash
python3 visio_generator.py network_diagram.json          # -> output.vsdx
python3 visio_generator.py input.json my_diagram.vsdx    # custom output name
python3 visio_generator.py                               # generate the built-in sample
```

### 1b. Simple schema (no coordinates needed)

You can also feed a much simpler diagram with just `nodes` and `connections`;
the generator **auto-detect this and lays the diagram out for you**:

```jsonc
{
  "diagram": { "title": "AI Agent System" },
  "nodes": [
    {"id": "user",     "label": "User",            "type": "person"},
    {"id": "frontend", "label": "Web Application",  "type": "application"},
    {"id": "agent",    "label": "AI Agent",         "type": "process"},
    {"id": "llm",      "label": "LLM",              "type": "ai"},
    {"id": "database", "label": "PostgreSQL",       "type": "database"}
  ],
  "connections": [
    {"from": "user",     "to": "frontend", "label": "Uses"},
    {"from": "frontend", "to": "agent",    "label": "API Request"},
    {"from": "agent",    "to": "llm",      "label": "Prompt"},
    {"from": "agent",    "to": "database", "label": "Read / Write"}
  ]
}
```

Run it the same way:
```bash
python visio_generator.py sample_ai_agent_diagram.json ai_agent.vsdx
```
Known `type` values get sensible colours (person/application/process/ai/
database/gateway/cloud/queue/security, …).  Layout flows left→right following
the connections.  You can still override anything by using the full schema.

### 2. From Python

```python
from visio_generator import create_visio_from_json

# from a file
create_visio_from_json("network_diagram.json", "network.vsdx")

# from a JSON string / dict
import json
create_visio_from_json(json.dumps({...}), "simple.vsdx")
```

## JSON schema

```jsonc
{
  "document": {
    "title": "Network Diagram",      // optional
    "description": "..."             // optional
  },
  "pages": [
    {
      "name":   "Page-1",            // page name
      "width":  11,                  // page width  in inches
      "height": 8.5,                 // page height in inches

      "shapes": [
        {
          "id": "1",                 // unique id used by connectors
          "type": "rectangle",       // "rectangle" | "ellipse"
          "text": "Web Server",
          "x": 2.0,                  // centre x (inches)
          "y": 6.0,                  // centre y (inches, from bottom of page)
          "width":  2.0,             // inches
          "height": 1.0,             // inches
          "fill_color":  "#4472C4",  // #RRGGBB
          "line_color":  "#2F5597",
          "text_color":  "#FFFFFF",
          "font_size":   12          // points
        }
      ],

      "connectors": [
        {
          "from_shape_id": "5",      // source shape id
          "to_shape_id":   "4",      // target shape id (arrow head here)
          "label": "HTTPS",          // optional label drawn above the line
          "line_color": "#000000",
          "line_weight": 1.5         // points
        }
      ]
    }
  ]
}
```

### Notes on coordinates

* `x` / `y` are the **centre** of a shape.
* `y` is measured from the **bottom** of the page (Visio's convention).
* The JSON parser validates that every connector references two shapes that exist.

## Output preview

Opening `output.vsdx` in Visio shows:

* **Web Server**, **Application Server**, **Database** along the top,
* a **Load Balancer** and **Firewall** lower down,
* arrow connectors labelled **HTTPS / HTTP / SQL** linking the nodes.

The same `visio_generator.py` code is used to regenerate it:

```bash
python3 visio_generator.py network_diagram.json output.vsdx
```

## Validation / note

The generated packages are validated for structural correctness (ZIP integrity,
well-formed XML, every OPC relationship / content-type target present, unique
shape IDs) and are re-opened with the `python-vsdx` parser as a sanity check.
They are intended to open in Microsoft Visio 2013+, as well as compatible
importers such as draw.io and LibreOffice Draw.  Because connectors here are
plain stroked line shapes (not "sticky" dynamic connectors), moving a box does
not automatically re-route its connectors — regenerate from JSON instead.
