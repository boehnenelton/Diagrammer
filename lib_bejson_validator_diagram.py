"""
Library:     lib_bejson_validator_diagram.py
Version:     1.5.1 (OFFICIAL) - Stable Visualization Suite
Description: BEJSON Diagram validator and HTML exporter.
             Provides relational validation for 104db diagram structures 
             and generates high-fidelity interactive SVG viewers with custom CSS support.

USAGE INSTRUCTIONS:
1. Data Model: Ensure your input BEJSON follows the 104db standard with 'Shape' and 'Connector' records.
2. Rendering: Use `bejson_diagram_export_html(json_string, output_path, title, ...)` to generate diagrams.
3. Custom Themes: Pass `internal_css` to override styles. 
   - For High Contrast: Set --bg to #ffffff and override text/rect fills.
   - For Cyberpunk: Use filters and neon colors (e.g., #ff00ff for Pink).
4. Anchors: The viewer supports v42.0 8-point anchors (0:Top-Left to 7:Left-Mid).

ENGINEERING NOTES:
- This library uses the stable Cyberpunk High-Fidelity template.
- SVG components (nodes, paths) are generated dynamically via DOM API for maximum compatibility.
- Ensure 'lib_bejson_validator' is available in the Python path for structural integrity checks.
"""
import json
import os
from pathlib import Path
from datetime import datetime
import lib_bejson_validator as CoreValidator

E_DIAGRAM_RELATIONAL_ERROR = 100
E_DIAGRAM_INVALID_ANCHOR = 101

# --- High-Fidelity Cyberpunk Template ---
HI_FI_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} · BEJSON 104db</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
{{EXTERNAL_CSS}}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --bg: #050b17; --accent: {{ACCENT}}; --text: #e2e8f0; --muted: #64748b; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: var(--bg); }
  .page { display: flex; flex-direction: column; height: 100vh; font-family: 'JetBrains Mono', monospace; color: var(--text); }
  .title-bar { padding: 14px 28px; background: rgba(5,11,23,0.9); border-bottom: 1px solid rgba(167,139,250,0.2); backdrop-filter: blur(8px); }
  .schema-tag { font-size: 10px; letter-spacing: 3px; color: var(--violet); opacity: 0.7; }
  h1 { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 2px; color: #fff; }
  .diagram-wrapper { flex: 1; position: relative; overflow: hidden; }
  #diagram-svg { width: 100%; height: 100%; }
  .conn-path { stroke-dasharray: 5 4; animation: flow 2s linear infinite; }
  @keyframes flow { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
  .meta-bar { padding: 8px 28px; background: #050b17; font-size: 9px; color: var(--muted); display: flex; gap: 20px; }
  {{INTERNAL_CSS}}
</style>
</head>
<body>
<div class="page">
  <header class="title-bar">
    <div class="title-left">
      <span class="schema-tag">BEJSON · 104db · DIAGRAM VIEW</span>
      <h1>{{TITLE}}</h1>
    </div>
  </header>
  <div class="diagram-wrapper">
    <svg id="diagram-svg" viewBox="0 0 1440 720" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(30,80,160,0.25)"/></pattern>
        <filter id="glow-primary" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur"/><feFlood flood-color="{{ACCENT}}" flood-opacity="0.5" result="c"/>
          <feComposite in="c" in2="blur" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="line-glow" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="100%" height="100%" fill="var(--bg)"/><rect width="100%" height="100%" fill="url(#dots)"/>
      <g id="connectors-layer"></g><g id="nodes-layer"></g>
    </svg>
  </div>
  <footer class="meta-bar"><span>Format: BEJSON</span><span>Version: 104db</span><span>Creator: {{CREATOR}}</span><span>Timestamp: {{TIMESTAMP}}</span></footer>
</div>
<script id="bejson-data" type="application/json">{{DIAGRAM_DATA}}</script>
<script>
const THEME = { accent: "{{ACCENT}}" };
function render() {
  const dataEl = document.getElementById("bejson-data");
  if (!dataEl) return;
  const bejson = JSON.parse(dataEl.textContent);
  const fields = bejson.Fields;
  const fi = {}; fields.forEach((f, i) => fi[f.name] = i);
  const shapes = bejson.Values.filter(r => r[fi["Record_Type_Parent"]] === "Shape").map(r => ({
    id: r[fi["id_Shape"]] || r[fi["s_id"]] || r[fi["id"]], 
    label: r[fi["label_Shape"]] || r[fi["s_label"]] || r[fi["label"]],
    x: r[fi["x_Shape"]] || r[fi["s_x"]] || r[fi["x"]] || 0, 
    y: r[fi["y_Shape"]] || r[fi["s_y"]] || r[fi["y"]] || 0,
    w: r[fi["w_Shape"]] || r[fi["w"]] || 150, 
    h: r[fi["h_Shape"]] || r[fi["h"]] || 60, 
    color: r[fi["color_Shape"]] || r[fi["s_color"]] || r[fi["color"]] || THEME.accent
  }));
  const connectors = bejson.Values.filter(r => r[fi["Record_Type_Parent"]] === "Connector").map(r => ({
    from: r[fi["from_Connector"]] || r[fi["c_from"]] || r[fi["from"]], 
    to: r[fi["to_Connector"]] || r[fi["c_to"]] || r[fi["to"]]
  }));
  const shapeMap = Object.fromEntries(shapes.map(s => [s.id, s]));
  const connLayer = document.getElementById("connectors-layer"), nodeLayer = document.getElementById("nodes-layer");
  connectors.forEach(conn => {
    const from = shapeMap[conn.from], to = shapeMap[conn.to];
    if (!from || !to) return;
    const d = `M ${from.x + from.w} ${from.y + from.h/2} C ${from.x + from.w + 50} ${from.y + from.h/2}, ${to.x - 50} ${to.y + to.h/2}, ${to.x} ${to.y + to.h/2}`;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", from.color); p.setAttribute("class", "conn-path"); p.setAttribute("filter", "url(#line-glow)");
    connLayer.appendChild(p);
  });
  shapes.forEach(s => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${s.x},${s.y})`);
    g.innerHTML = `<rect width="${s.w}" height="${s.h}" rx="8" fill="rgba(0,0,0,0.4)" stroke="${s.color}" stroke-width="2" filter="url(#glow-primary)" />
                   <text x="${s.w/2}" y="${s.h/2 + 5}" text-anchor="middle" fill="${s.color}" font-family="Orbitron" font-size="12">${s.label}</text>`;
    nodeLayer.appendChild(g);
  });
}
document.addEventListener("DOMContentLoaded", render);
</script>
</body>
</html>"""

def bejson_validator_diagram_validate_string(json_string):
    """Validates a BEJSON string as a valid Diagrammer structure."""
    CoreValidator.bejson_validator_validate_string(json_string)
    doc = json.loads(json_string)
    if doc["Format_Version"] != "104db":
        raise CoreValidator.BEJSONValidationError("Diagrams must use 104db format", CoreValidator.E_INVALID_VALUES)
    
    rt = doc["Records_Type"]
    if "Shape" not in rt or "Connector" not in rt:
        raise CoreValidator.BEJSONValidationError("Diagrams must contain both 'Shape' and 'Connector' types", CoreValidator.E_INVALID_VALUES)

    fields = doc["Fields"]
    f_map = {}
    for i, f in enumerate(fields):
        key = f["name"] + "_" + f.get("Record_Type_Parent", "common")
        f_map[key] = i

    shapes_ids = set()
    shape_rows = [v for v in doc["Values"] if v[0] == "Shape"]
    conn_rows = [v for v in doc["Values"] if v[0] == "Connector"]

    for row in shape_rows:
        sid = row[f_map.get("id_Shape")] or row[f_map.get("s_id_Shape")] or row[f_map.get("id_common")]
        if sid: shapes_ids.add(sid)

    for row in conn_rows:
        cfrom = row[f_map.get("from_Connector")] or row[f_map.get("c_from_Connector")] or row[f_map.get("from_common")]
        cto = row[f_map.get("to_Connector")] or row[f_map.get("c_to_Connector")] or row[f_map.get("to_common")]
        if cfrom not in shapes_ids: raise CoreValidator.BEJSONValidationError(f"Connector refers to missing from-shape: {cfrom}", E_DIAGRAM_RELATIONAL_ERROR)
        if cto not in shapes_ids: raise CoreValidator.BEJSONValidationError(f"Connector refers to missing to-shape: {cto}", E_DIAGRAM_RELATIONAL_ERROR)
    return True

def bejson_diagram_export_html(json_string, output_path, title="BEJSON Diagram", css_sheets=None, internal_css=""):
    """
    Generates a high-fidelity standalone HTML diagram viewer.
    :param css_sheets: List of paths or URLs to external CSS files.
    :param internal_css: Extra CSS to inject into the <style> block.
    """
    ext_css_html = ""
    if css_sheets:
        for sheet in css_sheets:
            ext_css_html += f'<link rel="stylesheet" href="{sheet}">\\n'
            
    doc = json.loads(json_string)
    creator = doc.get("Format_Creator", "BEJSON Engine")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    final_html = HI_FI_TEMPLATE.replace("{{TITLE}}", title) \
                               .replace("{{DIAGRAM_DATA}}", json_string.strip()) \
                               .replace("{{ACCENT}}", "#DE2626") \
                               .replace("{{CREATOR}}", creator) \
                               .replace("{{TIMESTAMP}}", timestamp) \
                               .replace("{{EXTERNAL_CSS}}", ext_css_html) \
                               .replace("{{INTERNAL_CSS}}", internal_css)
                               
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_html)
    return True

def bejson_validator_diagram_validate_file(file_path):
    text = Path(file_path).read_text(encoding="utf-8")
    return bejson_validator_diagram_validate_string(text)
