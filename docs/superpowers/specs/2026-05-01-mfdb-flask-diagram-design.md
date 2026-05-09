# MFDB Flask Diagram Design

Date: 2026-05-01

## Goal

Replace Diagrammer's legacy BEJSON `104db` persistence path with a Flask-based application that uses MFDB 1.3 as the only canonical storage format. No duplicate field names are allowed anywhere in the system.

## Scope

This design covers:

- a new Flask app under `mfdb/`
- MFDB-native persistence for diagrams
- a browser client that edits diagram state through HTTP APIs
- validation, import, and testing strategy

This design does not cover:

- preserving `104db` as a runtime format
- adding speculative typed node entities such as `ProcessNode` or `DecisionNode`
- full feature parity migration of every UI detail from the standalone `index.html` in the first milestone

## Existing Context

The current repository contains:

- `index.html`, a standalone browser diagram editor that stores diagrams as BEJSON `104db`
- Python BEJSON/MFDB libraries that provide the most complete storage and validation engine
- JavaScript BEJSON/MFDB libraries with uneven parity, including stricter duplicate-field validation than the Python validator

Important current findings:

- `index.html` currently exports duplicate field names across `Shape` and `Connector`
- `lib_bejson_validator.js` correctly rejects duplicate field names
- `lib_bejson_validator.py` does not currently enforce duplicate field name rejection
- `lib_mfdb_core.py` is the most complete MFDB runtime in the repo
- `lib_mfdb_core.js` is not a full runtime replacement and is browser/archive-oriented

## Architecture

The new canonical app will live under `mfdb/` as a Flask project. It will replace the current `104db` persistence model entirely and treat MFDB 1.3 as the only storage format.

System boundaries:

- Flask backend owns MFDB load, create, update, validation, and export logic
- browser client renders and edits diagrams but sends and receives normalized JSON over HTTP
- MFDB storage is the only persisted format on disk
- Python libraries remain the primary persistence and validation engine

Phase 1 uses a conversion-safe canonical model rather than inferred typed entities. The backend will store one dense node entity and one dense edge entity. A later phase may split nodes into more specialized entity files once the editor carries explicit node-type metadata.

## Canonical MFDB Data Model

### Manifest

The database root contains `104a.mfdb.bejson` with:

- `MFDB_Version: "1.3"`
- `DB_Name`
- `Schema_Version`
- standard manifest fields including `entity_name`, `file_path`, `description`, `record_count`, and `primary_key`

Registered entities in phase 1:

- `ShapeNode` with primary key `shape_id`
- `Connector` with primary key `connector_id`

### ShapeNode Entity

Dense BEJSON `104` entity with unique field names only:

- `shape_id` string
- `shape_x` number
- `shape_y` number
- `shape_width` number
- `shape_height` number
- `shape_label` string
- `shape_body` string
- `shape_fill_color` string
- `shape_font_color` string
- `parent_shape_id_fk` string
- `shape_generation` integer
- `is_collapsed` boolean

### Connector Entity

Dense BEJSON `104` entity with unique field names only:

- `connector_id` string
- `source_shape_id_fk` string
- `source_anchor_index` integer
- `target_shape_id_fk` string
- `target_anchor_index` integer
- `connector_flow` string

## Data Flow

The backend exposes MFDB as the source of truth and gives the browser a normalized JSON contract.

Planned endpoints:

- `GET /api/diagram`
- `POST /api/diagram`
- `POST /api/diagram/validate`
- `POST /api/diagram/import-legacy`

Behavior:

- `GET /api/diagram` loads manifest plus `ShapeNode` and `Connector`, then returns normalized JSON for the canvas
- `POST /api/diagram` accepts normalized client JSON, rewrites MFDB files atomically, then validates the result
- `POST /api/diagram/validate` runs MFDB validation and returns findings
- `POST /api/diagram/import-legacy` optionally accepts old Diagrammer data and converts it directly into MFDB without persisting `104db`

The browser never writes raw MFDB files directly and never persists `104db`.

## Validation Rules

Validation is backend-enforced on every write.

Hard failures:

- malformed BEJSON or MFDB structure
- missing required manifest fields
- duplicate field names
- broken `Parent_Hierarchy`
- missing entity files
- malformed row width or type mismatches

Warnings:

- `record_count` drift
- optional FK-discovery warnings where the validator treats issues as advisory

The save path must be atomic. If normalization or validation fails, no partial database state should remain on disk.

## Legacy Handling

Legacy Diagrammer input is supported only as a one-way import path. The system may parse older browser exports, but any accepted legacy input must be normalized directly into the MFDB phase-1 schema. `104db` is never emitted, stored, or treated as canonical.

## Testing Strategy

Testing will focus on:

- normalization from client JSON into `ShapeNode` and `Connector` records
- MFDB database creation and rewrite behavior
- database validation with `mfdb_validator_validate_database`
- regression checks proving no duplicate field names are emitted
- API coverage for `GET /api/diagram`, `POST /api/diagram`, and legacy import

## Risks And Constraints

- the current standalone editor and the new Flask app will temporarily diverge in persistence format
- Python and JS validator behavior is inconsistent today, so backend validation must be the authority until parity is improved
- typed node entities should not be introduced before the source editor carries stable semantic typing data

## Initial Implementation Direction

The first implementation milestone should:

1. create the `mfdb/` Flask workspace
2. define the canonical normalized JSON contract for the browser
3. create MFDB bootstrap and persistence helpers using the Python libraries
4. expose minimal diagram load/save/validate APIs
5. add tests that guarantee unique field names and valid MFDB output

## Acceptance Criteria

- the new app persists diagrams only as MFDB 1.3
- no duplicate field names are emitted anywhere
- saved databases pass `mfdb_validator_validate_database`
- the API can round-trip shape and connector data without using `104db`
- legacy import, if enabled, converts directly into MFDB and leaves no `104db` artifacts on disk
