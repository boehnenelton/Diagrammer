# BEJSON Diagrammer & Core Libraries

**Version 42.0.0 · Standalone HTML5/JS · BEJSON & MFDB Core Engine**

This repository is the primary home for the **BEJSON Diagrammer** (v42) and the authoritative **Core Libraries** for the BEJSON/MFDB ecosystem. It serves both as a powerful visualization tool and as the foundation for all standardized data operations across Switch Core.

## 🛠️ Components

### 1. BEJSON Diagrammer (v42)
A standalone, browser-based, touch-optimized diagramming tool designed for hierarchical node structures using the **BEJSON 104db** schema.
- **Features**: Node hierarchy (parent/child), grid snapping, connector deduplication, and a "Lightroom" mode for direct schema editing.
- **AI Integration**: Built-in Gemini AI panel for generating entire diagrams from natural language prompts.
- **Portability**: 100% standalone HTML—no server or external dependencies required.

### 2. Core Libraries (Python & JS)
The implementation of the BEJSON and MFDB specifications used throughout the ecosystem.
- `lib_bejson_core`: Fundamental operations for 104, 104a, and 104db formats.
- `lib_bejson_validator`: Structural and type-validation engine.
- `lib_mfdb_core`: Orchestration for multifile databases and manifest management.
- `lib_mfdb_validator`: Bidirectional path and integrity verification for MFDBs.

## 📂 Project Structure

- `index.html`: The main Diagrammer UI and logic.
- `lib_bejson_*.py/js`: Core BEJSON implementation files.
- `lib_mfdb_*.py/js`: Core MFDB implementation files.
- `superpowers/`: Architectural plans and design specifications.
- `BEJSON_MFDB_CRASH_COURSE.md`: The definitive guide to the data standards.

## ⚙️ Usage

### Running the Diagrammer
Simply open `index.html` in any modern web browser.

### Using the Libraries (Python)
Add the repository to your `PYTHONPATH`:
```python
import sys
sys.path.append("/path/to/Diagrammer-Html")
import lib_bejson_core as BEJSONCore
```

### Using the Libraries (JS)
Include the desired library in your HTML:
```html
<script src="lib_bejson_core.js"></script>
```

---
*Created and maintained by Elton Boehnen*
*MFDB Specification: v1.3.1*
