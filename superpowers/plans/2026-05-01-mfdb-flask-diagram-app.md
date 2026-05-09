# MFDB Flask Diagram App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Flask-based diagram application under `mfdb/` that persists diagrams only as MFDB 1.3, rejects duplicate field names everywhere, and supports load, save, validate, and legacy import APIs.

**Architecture:** The backend is a Flask app that owns MFDB bootstrap, normalization, persistence, and validation using the Python BEJSON/MFDB libraries already in the repository. The browser client talks to HTTP endpoints with normalized JSON and never reads or writes `104db` directly.

**Tech Stack:** Python 3.13, Flask, pytest, existing `lib_bejson_core.py`, `lib_bejson_validator.py`, `lib_mfdb_core.py`, `lib_mfdb_validator.py`, vanilla HTML/CSS/JS

**VCS Note:** `/storage/emulated/0/dev/Projects/Diagrammer` is not a git repository, so each task ends with a verification checkpoint instead of a git commit.

---

## File Structure

### Existing files to modify

- `lib_bejson_validator.py`

### Files to create

- `mfdb/requirements.txt`
- `mfdb/app.py`
- `mfdb/diagrammer_flask/__init__.py`
- `mfdb/diagrammer_flask/config.py`
- `mfdb/diagrammer_flask/routes/__init__.py`
- `mfdb/diagrammer_flask/routes/api.py`
- `mfdb/diagrammer_flask/routes/web.py`
- `mfdb/diagrammer_flask/services/__init__.py`
- `mfdb/diagrammer_flask/services/schema.py`
- `mfdb/diagrammer_flask/services/bootstrap.py`
- `mfdb/diagrammer_flask/services/store.py`
- `mfdb/diagrammer_flask/services/legacy_import.py`
- `mfdb/diagrammer_flask/templates/index.html`
- `mfdb/diagrammer_flask/static/app.css`
- `mfdb/diagrammer_flask/static/app.js`
- `mfdb/tests/conftest.py`
- `mfdb/tests/test_validator_contract.py`
- `mfdb/tests/test_app.py`
- `mfdb/tests/test_store.py`
- `mfdb/tests/test_api.py`

### Responsibility map

- `lib_bejson_validator.py`: enforce duplicate field name rejection in the Python validation path
- `mfdb/app.py`: Flask entry point
- `mfdb/diagrammer_flask/__init__.py`: app factory and blueprint registration
- `mfdb/diagrammer_flask/config.py`: filesystem paths and runtime settings
- `mfdb/diagrammer_flask/services/schema.py`: canonical normalized schema definitions for `ShapeNode` and `Connector`
- `mfdb/diagrammer_flask/services/bootstrap.py`: database creation and manifest bootstrapping
- `mfdb/diagrammer_flask/services/store.py`: normalized JSON load/save bridge to MFDB
- `mfdb/diagrammer_flask/services/legacy_import.py`: one-way import from older Diagrammer JSON into normalized shape/connector payloads
- `mfdb/diagrammer_flask/routes/api.py`: diagram HTTP API
- `mfdb/diagrammer_flask/routes/web.py`: browser page route
- `mfdb/diagrammer_flask/static/*`: minimal first-milestone browser editor
- `mfdb/tests/*`: validation, bootstrap, store, and API coverage

---

### Task 1: Enforce Duplicate-Field Rejection In The Python Validator

**Files:**
- Modify: `lib_bejson_validator.py`
- Create: `mfdb/tests/test_validator_contract.py`

- [ ] **Step 1: Write the failing validator contract test**

```python
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest
from lib_bejson_validator import BEJSONValidationError, bejson_validator_validate_string


def test_duplicate_field_names_are_rejected():
    payload = {
        "Format": "BEJSON",
        "Format_Version": "104db",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": ["Shape", "Connector"],
        "Fields": [
            {"name": "Record_Type_Parent", "type": "string"},
            {"name": "shape_id", "type": "string", "Record_Type_Parent": "Shape"},
            {"name": "shape_id", "type": "string", "Record_Type_Parent": "Connector"},
        ],
        "Values": [
            ["Shape", "s1", None],
        ],
    }

    with pytest.raises(BEJSONValidationError):
        bejson_validator_validate_string(json.dumps(payload))
```

- [ ] **Step 2: Run the test to verify the current validator is wrong**

Run: `pytest mfdb/tests/test_validator_contract.py -q`

Expected: FAIL because the current Python validator allows duplicate field names.

- [ ] **Step 3: Patch `lib_bejson_validator.py` to track seen field names**

```python
def bejson_validator_check_fields_structure(doc, version):
    fields = doc["Fields"]
    seen_names = set()
    for i, f in enumerate(fields):
        fname = f.get("name")
        ftype = f.get("type")
        if not fname or not ftype:
            raise BEJSONValidationError(f"Field {i} missing name or type", E_INVALID_FIELDS)

        if fname in seen_names:
            raise BEJSONValidationError(f"Duplicate field name: {fname}", E_INVALID_FIELDS)
        seen_names.add(fname)

        if version == "104a" and ftype in ("array", "object"):
            raise BEJSONValidationError(f"104a forbids complex type: {ftype}", E_INVALID_FIELDS)

        if version == "104db":
            if fname != "Record_Type_Parent" and "Record_Type_Parent" not in f:
                raise BEJSONValidationError(
                    f"Field '{fname}' missing Record_Type_Parent in 104db",
                    E_INVALID_RECORD_TYPE_PARENT,
                )
    return len(fields)
```

- [ ] **Step 4: Run the validator contract test again**

Run: `pytest mfdb/tests/test_validator_contract.py -q`

Expected: PASS

- [ ] **Step 5: Verification checkpoint**

Run: `python - <<'PY'\nfrom lib_bejson_validator import bejson_validator_validate_string, BEJSONValidationError\nimport json\npayload={\"Format\":\"BEJSON\",\"Format_Version\":\"104db\",\"Format_Creator\":\"Elton Boehnen\",\"Records_Type\":[\"A\",\"B\"],\"Fields\":[{\"name\":\"Record_Type_Parent\",\"type\":\"string\"},{\"name\":\"id\",\"type\":\"string\",\"Record_Type_Parent\":\"A\"},{\"name\":\"id\",\"type\":\"string\",\"Record_Type_Parent\":\"B\"}],\"Values\":[[\"A\",\"1\",None]]}\ntry:\n    bejson_validator_validate_string(json.dumps(payload))\n    print('UNEXPECTED_PASS')\nexcept BEJSONValidationError as exc:\n    print(exc)\nPY`

Expected: output includes a duplicate-field error, not `UNEXPECTED_PASS`

---

### Task 2: Scaffold The Flask Project And App Factory

**Files:**
- Create: `mfdb/requirements.txt`
- Create: `mfdb/app.py`
- Create: `mfdb/diagrammer_flask/__init__.py`
- Create: `mfdb/diagrammer_flask/config.py`
- Create: `mfdb/diagrammer_flask/routes/__init__.py`
- Create: `mfdb/diagrammer_flask/routes/web.py`
- Create: `mfdb/tests/conftest.py`
- Create: `mfdb/tests/test_app.py`

- [ ] **Step 1: Write the failing Flask smoke test**

```python
from diagrammer_flask import create_app


def test_healthcheck_route():
    app = create_app(
        {
            "TESTING": True,
            "MFDB_ROOT": "mfdb/tests/tmp/runtime",
        }
    )
    client = app.test_client()
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json() == {"ok": True}
```

- [ ] **Step 2: Run the smoke test to confirm the app package does not exist yet**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_app.py -q`

Expected: FAIL with import errors for `diagrammer_flask`

- [ ] **Step 3: Create the minimal Flask app skeleton**

`mfdb/requirements.txt`

```txt
Flask>=3.0,<4.0
pytest>=8.0,<9.0
```

`mfdb/diagrammer_flask/config.py`

```python
from pathlib import Path


class Config:
    BASE_DIR = Path(__file__).resolve().parents[1]
    MFDB_ROOT = BASE_DIR / "runtime"
    MFDB_DB_DIR = MFDB_ROOT / "diagram_db"
    SECRET_KEY = "diagrammer-mfdb-dev"
```

`mfdb/diagrammer_flask/routes/web.py`

```python
from flask import Blueprint, jsonify

web_bp = Blueprint("web", __name__)


@web_bp.get("/healthz")
def healthcheck():
    return jsonify({"ok": True})
```

`mfdb/diagrammer_flask/__init__.py`

```python
from flask import Flask

from .config import Config
from .routes.web import web_bp


def create_app(overrides=None):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)

    app.register_blueprint(web_bp)
    return app
```

`mfdb/app.py`

```python
from diagrammer_flask import create_app

app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
```

`mfdb/tests/conftest.py`

```python
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
MFDB_DIR = ROOT / "mfdb"

for candidate in (str(MFDB_DIR), str(ROOT)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)
```

- [ ] **Step 4: Run the Flask smoke test again**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_app.py -q`

Expected: PASS

- [ ] **Step 5: Verification checkpoint**

Run: `PYTHONPATH=mfdb python - <<'PY'\nfrom diagrammer_flask import create_app\napp = create_app({\"TESTING\": True})\nprint(sorted(rule.rule for rule in app.url_map.iter_rules()))\nPY`

Expected: output includes `/healthz`

---

### Task 3: Create MFDB Bootstrap And Normalized Store Services

**Files:**
- Create: `mfdb/diagrammer_flask/services/__init__.py`
- Create: `mfdb/diagrammer_flask/services/schema.py`
- Create: `mfdb/diagrammer_flask/services/bootstrap.py`
- Create: `mfdb/diagrammer_flask/services/store.py`
- Modify: `mfdb/diagrammer_flask/__init__.py`
- Create: `mfdb/tests/test_store.py`

- [ ] **Step 1: Write the failing store bootstrap tests**

```python
from pathlib import Path

from diagrammer_flask import create_app
from diagrammer_flask.services.store import DiagramStore


def test_store_bootstraps_manifest_and_entities(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "MFDB_ROOT": tmp_path,
            "MFDB_DB_DIR": tmp_path / "diagram_db",
        }
    )

    with app.app_context():
        store = DiagramStore.from_app(app)
        manifest_path = store.ensure_database()

    assert Path(manifest_path).exists()
    assert (tmp_path / "diagram_db" / "data" / "shapenode.bejson").exists()
    assert (tmp_path / "diagram_db" / "data" / "connector.bejson").exists()


def test_store_round_trip_preserves_unique_field_names(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "MFDB_ROOT": tmp_path,
            "MFDB_DB_DIR": tmp_path / "diagram_db",
        }
    )

    payload = {
        "diagram_name": "Round Trip",
        "shapes": [
            {
                "shape_id": "shape-1",
                "shape_x": 100,
                "shape_y": 150,
                "shape_width": 200,
                "shape_height": 120,
                "shape_label": "Root",
                "shape_body": "",
                "shape_fill_color": "#334455",
                "shape_font_color": "#ffffff",
                "parent_shape_id_fk": None,
                "is_collapsed": False,
            }
        ],
        "connectors": [],
    }

    with app.app_context():
        store = DiagramStore.from_app(app)
        store.save(payload)
        loaded = store.load()

    assert loaded["diagram_name"] == "Round Trip"
    assert loaded["shapes"][0]["shape_id"] == "shape-1"
```

- [ ] **Step 2: Run the tests to confirm the services are missing**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_store.py -q`

Expected: FAIL with import errors for `DiagramStore`

- [ ] **Step 3: Create canonical schema and bootstrap services**

`mfdb/diagrammer_flask/services/schema.py`

```python
SHAPE_FIELDS = [
    {"name": "shape_id", "type": "string"},
    {"name": "shape_x", "type": "number"},
    {"name": "shape_y", "type": "number"},
    {"name": "shape_width", "type": "number"},
    {"name": "shape_height", "type": "number"},
    {"name": "shape_label", "type": "string"},
    {"name": "shape_body", "type": "string"},
    {"name": "shape_fill_color", "type": "string"},
    {"name": "shape_font_color", "type": "string"},
    {"name": "parent_shape_id_fk", "type": "string"},
    {"name": "shape_generation", "type": "integer"},
    {"name": "is_collapsed", "type": "boolean"},
]

CONNECTOR_FIELDS = [
    {"name": "connector_id", "type": "string"},
    {"name": "source_shape_id_fk", "type": "string"},
    {"name": "source_anchor_index", "type": "integer"},
    {"name": "target_shape_id_fk", "type": "string"},
    {"name": "target_anchor_index", "type": "integer"},
    {"name": "connector_flow", "type": "string"},
]

MFDB_ENTITIES = [
    {
        "name": "ShapeNode",
        "file_path": "data/shapenode.bejson",
        "description": "Canonical diagram nodes",
        "primary_key": "shape_id",
        "fields": SHAPE_FIELDS,
    },
    {
        "name": "Connector",
        "file_path": "data/connector.bejson",
        "description": "Canonical diagram edges",
        "primary_key": "connector_id",
        "fields": CONNECTOR_FIELDS,
    },
]
```

`mfdb/diagrammer_flask/services/bootstrap.py`

```python
from pathlib import Path

from lib_mfdb_core import mfdb_core_create_database

from .schema import MFDB_ENTITIES


def ensure_database(db_dir, db_name="DiagrammerMFDB", schema_version="1.0.0"):
    db_dir = Path(db_dir)
    manifest_path = db_dir / "104a.mfdb.bejson"
    if manifest_path.exists():
        return str(manifest_path)

    return mfdb_core_create_database(
        root_dir=str(db_dir),
        db_name=db_name,
        entities=MFDB_ENTITIES,
        db_description="Diagrammer Flask MFDB database",
        schema_version=schema_version,
    )
```

`mfdb/diagrammer_flask/services/store.py`

```python
from dataclasses import dataclass

from flask import current_app

from lib_mfdb_core import (
    mfdb_core_get_entity_doc,
    mfdb_core_load_entity,
)
from lib_mfdb_validator import mfdb_validator_validate_database

from .bootstrap import ensure_database


@dataclass
class DiagramStore:
    db_dir: str

    @classmethod
    def from_app(cls, app):
        return cls(str(app.config["MFDB_DB_DIR"]))

    def ensure_database(self):
        return ensure_database(self.db_dir)

    def load(self):
        manifest_path = self.ensure_database()
        shapes = mfdb_core_load_entity(manifest_path, "ShapeNode")
        connectors = mfdb_core_load_entity(manifest_path, "Connector")
        return {
            "diagram_name": current_app.config.get("DIAGRAM_NAME", "Untitled Diagram"),
            "shapes": shapes,
            "connectors": connectors,
        }
```

- [ ] **Step 4: Finish the save path and generation normalization**

Append to `mfdb/diagrammer_flask/services/store.py`:

```python
from lib_bejson_core import bejson_core_atomic_write


def _compute_generations(shapes):
    by_id = {shape["shape_id"]: dict(shape) for shape in shapes}

    def depth(shape_id, guard=None):
        guard = guard or set()
        if shape_id in guard:
            raise ValueError(f"Parent cycle detected at {shape_id}")
        guard.add(shape_id)
        parent_id = by_id[shape_id].get("parent_shape_id_fk")
        if not parent_id:
            return 0
        if parent_id not in by_id:
            raise ValueError(f"Unknown parent_shape_id_fk: {parent_id}")
        return 1 + depth(parent_id, guard)

    for shape_id in by_id:
        by_id[shape_id]["shape_generation"] = depth(shape_id)
    return list(by_id.values())


def _rows_for(fields, records):
    names = [field["name"] for field in fields]
    return [[record.get(name) for name in names] for record in records]


def _write_entity(manifest_path, entity_name, records):
    doc = mfdb_core_get_entity_doc(manifest_path, entity_name)
    doc["Values"] = _rows_for(doc["Fields"], records)
    entity_path = current_app.config["MFDB_DB_DIR"] / "data" / (
        "shapenode.bejson" if entity_name == "ShapeNode" else "connector.bejson"
    )
    bejson_core_atomic_write(str(entity_path), doc)


def save(self, payload):
    manifest_path = self.ensure_database()
    normalized_shapes = _compute_generations(payload["shapes"])
    _write_entity(manifest_path, "ShapeNode", normalized_shapes)
    _write_entity(manifest_path, "Connector", payload["connectors"])
    mfdb_validator_validate_database(manifest_path)
    return self.load()
```

- [ ] **Step 5: Run the store tests**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_store.py -q`

Expected: PASS

- [ ] **Step 6: Verification checkpoint**

Run: `PYTHONPATH=mfdb python - <<'PY'\nfrom pathlib import Path\nfrom diagrammer_flask import create_app\nfrom diagrammer_flask.services.store import DiagramStore\napp = create_app({\"TESTING\": True, \"MFDB_ROOT\": Path('mfdb/tmp'), \"MFDB_DB_DIR\": Path('mfdb/tmp/diagram_db')})\nwith app.app_context():\n    store = DiagramStore.from_app(app)\n    store.save({\"diagram_name\":\"Check\",\"shapes\":[{\"shape_id\":\"shape-1\",\"shape_x\":0,\"shape_y\":0,\"shape_width\":200,\"shape_height\":120,\"shape_label\":\"A\",\"shape_body\":\"\",\"shape_fill_color\":\"#111111\",\"shape_font_color\":\"#ffffff\",\"parent_shape_id_fk\":None,\"is_collapsed\":False}],\"connectors\":[]})\n    print(store.ensure_database())\nPY`

Expected: printed manifest path under `mfdb/tmp/diagram_db/104a.mfdb.bejson`

---

### Task 4: Add Diagram API Endpoints And Legacy Import

**Files:**
- Create: `mfdb/diagrammer_flask/routes/api.py`
- Create: `mfdb/diagrammer_flask/services/legacy_import.py`
- Modify: `mfdb/diagrammer_flask/__init__.py`
- Create: `mfdb/tests/test_api.py`

- [ ] **Step 1: Write the failing API tests**

```python
from diagrammer_flask import create_app


def test_get_diagram_returns_normalized_payload(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "MFDB_ROOT": tmp_path,
            "MFDB_DB_DIR": tmp_path / "diagram_db",
        }
    )
    client = app.test_client()
    response = client.get("/api/diagram")
    assert response.status_code == 200
    body = response.get_json()
    assert "shapes" in body
    assert "connectors" in body


def test_post_diagram_persists_mfdb(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "MFDB_ROOT": tmp_path,
            "MFDB_DB_DIR": tmp_path / "diagram_db",
        }
    )
    client = app.test_client()
    payload = {
        "diagram_name": "API Save",
        "shapes": [
            {
                "shape_id": "shape-1",
                "shape_x": 10,
                "shape_y": 20,
                "shape_width": 200,
                "shape_height": 120,
                "shape_label": "Node",
                "shape_body": "",
                "shape_fill_color": "#223344",
                "shape_font_color": "#ffffff",
                "parent_shape_id_fk": None,
                "is_collapsed": False,
            }
        ],
        "connectors": [],
    }

    response = client.post("/api/diagram", json=payload)
    assert response.status_code == 200
    assert response.get_json()["shapes"][0]["shape_id"] == "shape-1"
```

- [ ] **Step 2: Run the API tests before implementation**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_api.py -q`

Expected: FAIL because `/api/diagram` routes do not exist yet

- [ ] **Step 3: Implement the API blueprint**

`mfdb/diagrammer_flask/routes/api.py`

```python
from flask import Blueprint, current_app, jsonify, request

from lib_mfdb_validator import mfdb_validator_get_report, mfdb_validator_validate_database

from ..services.store import DiagramStore
from ..services.legacy_import import import_legacy_payload

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.get("/diagram")
def get_diagram():
    store = DiagramStore.from_app(current_app)
    return jsonify(store.load())


@api_bp.post("/diagram")
def save_diagram():
    store = DiagramStore.from_app(current_app)
    payload = request.get_json(force=True)
    return jsonify(store.save(payload))


@api_bp.post("/diagram/validate")
def validate_diagram():
    store = DiagramStore.from_app(current_app)
    manifest_path = store.ensure_database()
    mfdb_validator_validate_database(manifest_path)
    return jsonify({"ok": True, "report": mfdb_validator_get_report(manifest_path)})


@api_bp.post("/diagram/import-legacy")
def import_legacy():
    store = DiagramStore.from_app(current_app)
    payload = request.get_json(force=True)
    normalized = import_legacy_payload(payload)
    return jsonify(store.save(normalized))
```

Modify `mfdb/diagrammer_flask/__init__.py`:

```python
from .routes.api import api_bp
from .routes.web import web_bp


def create_app(overrides=None):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)

    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp)
    return app
```

- [ ] **Step 4: Implement the legacy import adapter**

`mfdb/diagrammer_flask/services/legacy_import.py`

```python
def import_legacy_payload(payload):
    fields = payload.get("Fields", [])
    values = payload.get("Values", [])

    index_map = {}
    for idx, field in enumerate(fields):
        key = field["name"]
        owner = field.get("Record_Type_Parent")
        index_map[(key, owner)] = idx

    shapes = []
    connectors = []

    for row in values:
        record_type = row[index_map[("Record_Type_Parent", None)]]
        if record_type == "Shape":
            shapes.append(
                {
                    "shape_id": row[index_map[("id", "Shape")]],
                    "shape_x": row[index_map[("x", "Shape")]],
                    "shape_y": row[index_map[("y", "Shape")]],
                    "shape_width": row[index_map[("w", "Shape")]],
                    "shape_height": row[index_map[("h", "Shape")]],
                    "shape_label": row[index_map[("label", "Shape")]],
                    "shape_body": row[index_map[("text", "Shape")]],
                    "shape_fill_color": row[index_map[("color", "Shape")]],
                    "shape_font_color": row[index_map[("fontColor", "Shape")]],
                    "parent_shape_id_fk": row[index_map[("parentId", "Shape")]],
                    "is_collapsed": row[index_map[("collapsed", "Shape")]],
                }
            )
        elif record_type == "Connector":
            connectors.append(
                {
                    "connector_id": row[index_map[("id", "Connector")]],
                    "source_shape_id_fk": row[index_map[("from", "Connector")]],
                    "source_anchor_index": row[index_map[("fromIdx", "Connector")]],
                    "target_shape_id_fk": row[index_map[("to", "Connector")]],
                    "target_anchor_index": row[index_map[("toIdx", "Connector")]],
                    "connector_flow": row[index_map[("flow", "Connector")]],
                }
            )

    return {
        "diagram_name": payload.get("Diagram_Name", "Imported Diagram"),
        "shapes": shapes,
        "connectors": connectors,
    }
```

- [ ] **Step 5: Run the API tests again**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_api.py -q`

Expected: PASS

- [ ] **Step 6: Verification checkpoint**

Run: `PYTHONPATH=mfdb python - <<'PY'\nfrom pathlib import Path\nfrom diagrammer_flask import create_app\napp = create_app({\"TESTING\": True, \"MFDB_ROOT\": Path('mfdb/tmp_api'), \"MFDB_DB_DIR\": Path('mfdb/tmp_api/diagram_db')})\nclient = app.test_client()\nprint(client.get('/api/diagram').status_code)\nprint(client.post('/api/diagram/validate').status_code)\nPY`

Expected: prints `200` twice

---

### Task 5: Build The First Browser Client For MFDB Diagrams

**Files:**
- Modify: `mfdb/diagrammer_flask/routes/web.py`
- Create: `mfdb/diagrammer_flask/templates/index.html`
- Create: `mfdb/diagrammer_flask/static/app.css`
- Create: `mfdb/diagrammer_flask/static/app.js`
- Modify: `mfdb/tests/test_app.py`

- [ ] **Step 1: Extend the app smoke test to require the diagram page**

```python
def test_index_route_serves_html():
    app = create_app({"TESTING": True, "MFDB_ROOT": "mfdb/tests/tmp/runtime"})
    client = app.test_client()
    response = client.get("/")
    assert response.status_code == 200
    assert b"MFDB Diagrammer" in response.data
```

- [ ] **Step 2: Run the app tests before the page exists**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_app.py -q`

Expected: FAIL because `/` does not render the required page

- [ ] **Step 3: Add the browser page route and template**

Modify `mfdb/diagrammer_flask/routes/web.py`:

```python
from flask import Blueprint, jsonify, render_template

web_bp = Blueprint("web", __name__)


@web_bp.get("/")
def index():
    return render_template("index.html")


@web_bp.get("/healthz")
def healthcheck():
    return jsonify({"ok": True})
```

`mfdb/diagrammer_flask/templates/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MFDB Diagrammer</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='app.css') }}">
  </head>
  <body>
    <main class="layout">
      <header class="topbar">
        <h1>MFDB Diagrammer</h1>
        <div class="actions">
          <button id="loadBtn">Load</button>
          <button id="saveBtn">Save</button>
          <button id="validateBtn">Validate</button>
        </div>
      </header>
      <section class="workspace">
        <aside class="sidebar">
          <label>Diagram Name <input id="diagramName" type="text"></label>
          <button id="addShapeBtn">Add Shape</button>
          <input id="legacyFile" type="file" accept=".json">
          <pre id="statusBox">Ready</pre>
        </aside>
        <section id="canvas" class="canvas"></section>
      </section>
    </main>
    <script src="{{ url_for('static', filename='app.js') }}"></script>
  </body>
</html>
```

`mfdb/diagrammer_flask/static/app.css`

```css
body { margin: 0; font-family: sans-serif; background: #f3f1ea; color: #181818; }
.layout { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: linear-gradient(90deg, #e6dcc8, #f8f5ef); border-bottom: 2px solid #181818; }
.workspace { display: grid; grid-template-columns: 280px 1fr; min-height: 0; }
.sidebar { padding: 16px; border-right: 2px solid #181818; background: #fffdf8; display: grid; gap: 12px; }
.canvas { position: relative; overflow: auto; background: radial-gradient(circle at top, #ffffff, #ece5d6); }
.shape { position: absolute; border: 2px solid #181818; background: #334455; color: #ffffff; padding: 12px; width: 200px; min-height: 100px; }
```

- [ ] **Step 4: Implement the minimal client-side load/save workflow**

`mfdb/diagrammer_flask/static/app.js`

```javascript
const state = {
  diagram_name: "Untitled Diagram",
  shapes: [],
  connectors: [],
};

function nextShapeId() {
  return `shape-${Date.now()}`;
}

function render() {
  document.getElementById("diagramName").value = state.diagram_name;
  const canvas = document.getElementById("canvas");
  canvas.innerHTML = "";
  state.shapes.forEach((shape) => {
    const el = document.createElement("article");
    el.className = "shape";
    el.style.left = `${shape.shape_x}px`;
    el.style.top = `${shape.shape_y}px`;
    el.style.background = shape.shape_fill_color;
    el.innerHTML = `<strong>${shape.shape_label}</strong><div>${shape.shape_body || ""}</div>`;
    canvas.appendChild(el);
  });
}

async function loadDiagram() {
  const response = await fetch("/api/diagram");
  Object.assign(state, await response.json());
  render();
}

async function saveDiagram() {
  state.diagram_name = document.getElementById("diagramName").value || "Untitled Diagram";
  const response = await fetch("/api/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  Object.assign(state, await response.json());
  render();
  document.getElementById("statusBox").textContent = "Saved";
}

async function validateDiagram() {
  const response = await fetch("/api/diagram/validate", { method: "POST" });
  const body = await response.json();
  document.getElementById("statusBox").textContent = body.report;
}

document.getElementById("addShapeBtn").addEventListener("click", () => {
  state.shapes.push({
    shape_id: nextShapeId(),
    shape_x: 80 + state.shapes.length * 24,
    shape_y: 80 + state.shapes.length * 24,
    shape_width: 200,
    shape_height: 120,
    shape_label: `Node ${state.shapes.length + 1}`,
    shape_body: "",
    shape_fill_color: "#334455",
    shape_font_color: "#ffffff",
    parent_shape_id_fk: null,
    is_collapsed: false,
  });
  render();
});

document.getElementById("loadBtn").addEventListener("click", loadDiagram);
document.getElementById("saveBtn").addEventListener("click", saveDiagram);
document.getElementById("validateBtn").addEventListener("click", validateDiagram);

loadDiagram();
```

- [ ] **Step 5: Run the app tests again**

Run: `PYTHONPATH=mfdb pytest mfdb/tests/test_app.py -q`

Expected: PASS

- [ ] **Step 6: Verification checkpoint**

Run: `PYTHONPATH=mfdb python - <<'PY'\nfrom diagrammer_flask import create_app\napp = create_app({\"TESTING\": True})\nclient = app.test_client()\nresponse = client.get('/')\nprint(response.status_code)\nprint(b'MFDB Diagrammer' in response.data)\nPY`

Expected: prints `200` and `True`

---

### Task 6: Tighten Integration Coverage For MFDB Output

**Files:**
- Modify: `mfdb/tests/test_store.py`
- Modify: `mfdb/tests/test_api.py`

- [ ] **Step 1: Add a failing integration assertion that saved output validates and has unique field names**

```python
from pathlib import Path
import json

from lib_mfdb_validator import mfdb_validator_validate_database


def test_saved_database_passes_validation(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "MFDB_ROOT": tmp_path,
            "MFDB_DB_DIR": tmp_path / "diagram_db",
        }
    )

    with app.app_context():
        store = DiagramStore.from_app(app)
        store.save(
            {
                "diagram_name": "Integrated",
                "shapes": [
                    {
                        "shape_id": "shape-1",
                        "shape_x": 0,
                        "shape_y": 0,
                        "shape_width": 200,
                        "shape_height": 120,
                        "shape_label": "A",
                        "shape_body": "",
                        "shape_fill_color": "#111111",
                        "shape_font_color": "#ffffff",
                        "parent_shape_id_fk": None,
                        "is_collapsed": False,
                    }
                ],
                "connectors": [],
            }
        )
        manifest_path = store.ensure_database()

    assert mfdb_validator_validate_database(manifest_path) is True

    shape_doc = json.loads((tmp_path / "diagram_db" / "data" / "shapenode.bejson").read_text())
    names = [field["name"] for field in shape_doc["Fields"]]
    assert len(names) == len(set(names))
```

- [ ] **Step 2: Run the full test suite**

Run: `PYTHONPATH=mfdb pytest mfdb/tests -q`

Expected: FAIL until any missing integration edges are corrected

- [ ] **Step 3: Fix any remaining integration issues**

Expected code adjustments:

```python
def load(self):
    manifest_path = self.ensure_database()
    mfdb_validator_validate_database(manifest_path)
    shapes = mfdb_core_load_entity(manifest_path, "ShapeNode")
    connectors = mfdb_core_load_entity(manifest_path, "Connector")
    return {
        "diagram_name": current_app.config.get("DIAGRAM_NAME", "Untitled Diagram"),
        "shapes": shapes,
        "connectors": connectors,
    }
```

```python
@api_bp.post("/diagram")
def save_diagram():
    store = DiagramStore.from_app(current_app)
    payload = request.get_json(force=True)
    saved = store.save(payload)
    return jsonify(saved), 200
```

- [ ] **Step 4: Run the full test suite again**

Run: `PYTHONPATH=mfdb pytest mfdb/tests -q`

Expected: PASS

- [ ] **Step 5: Final verification checkpoint**

Run: `PYTHONPATH=mfdb python - <<'PY'\nfrom pathlib import Path\nfrom diagrammer_flask import create_app\nfrom diagrammer_flask.services.store import DiagramStore\nfrom lib_mfdb_validator import mfdb_validator_validate_database\napp = create_app({\"TESTING\": True, \"MFDB_ROOT\": Path('mfdb/final_tmp'), \"MFDB_DB_DIR\": Path('mfdb/final_tmp/diagram_db')})\nwith app.app_context():\n    store = DiagramStore.from_app(app)\n    store.save({\"diagram_name\":\"Final\",\"shapes\":[{\"shape_id\":\"shape-1\",\"shape_x\":10,\"shape_y\":10,\"shape_width\":200,\"shape_height\":120,\"shape_label\":\"Final\",\"shape_body\":\"\",\"shape_fill_color\":\"#222222\",\"shape_font_color\":\"#ffffff\",\"parent_shape_id_fk\":None,\"is_collapsed\":False}],\"connectors\":[]})\n    print(mfdb_validator_validate_database(store.ensure_database()))\nPY`

Expected: prints `True`

---

## Self-Review Checklist

- Spec coverage:
  - Flask project under `mfdb/`: covered by Tasks 2 through 5
  - MFDB-only persistence: covered by Tasks 3, 4, and 6
  - no duplicate field names: covered by Task 1 and Task 6
  - load/save/validate APIs: covered by Task 4
  - minimal browser client: covered by Task 5
  - one-way legacy import: covered by Task 4

- Placeholder scan:
  - no `TODO` or `TBD` markers remain
  - every verification step includes a concrete command
  - every implementation step names exact files

- Type consistency:
  - `ShapeNode` primary key is always `shape_id`
  - `Connector` primary key is always `connector_id`
  - hierarchy field is always `parent_shape_id_fk`
  - connector FK names are always `source_shape_id_fk` and `target_shape_id_fk`
