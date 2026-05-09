/**
 * Library:     lib_bejson_core.js
 * Jurisdiction: ["JAVASCRIPT", "CORE_COMMAND"]
 * Status:      OFFICIAL — Core-Command/Lib (v1.1)
 * Author:      Elton Boehnen
 * Version:     1.1 (OFFICIAL)
 * Date:        2026-04-23
 * Description: BEJSON (Boehnen Elton JSON) core library — document creation, mutation, validation,
atomic file I/O with fsync, and query/sort utilities.
MFDB relational functions are in lib_mfdb_core.js (decoupled).
Author:      Elton Boehnen
Version:     3.1.0 (OFFICIAL)
Date:        2026-04-16
Requires:    lib_bejson_validator.js (same directory)
* Changelog v3.1.0:
[FIX] Atomic writes: same-partition temp files (sibling to target),
explicit fs.fsyncSync() before rename.
Cross-filesystem fallback: copyFileSync + unlinkSync.
[FIX] MFDB decoupled: relational engine moved to lib_mfdb_core.js.
Unidirectional dependency: MFDB → core (not vice versa).
* Error code ranges:
1–15   → lib_bejson_validator  (BEJSONValidationError)
20–27  → lib_bejson_core       (BEJSONCoreError)
 */
'use strict';

const {
  BEJSONValidationError,
  bejson_validator_get_report,
  bejson_validator_validate_file,
  bejson_validator_validate_string,
} = (typeof require !== 'undefined')
  ? require('./lib_bejson_validator.js')
  : window.BEJSON_VALIDATOR; // browser fallback if bundled globally

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

const E_CORE_INVALID_VERSION       = 20;
const E_CORE_INVALID_OPERATION     = 21;
const E_CORE_INDEX_OUT_OF_BOUNDS   = 22;
const E_CORE_FIELD_NOT_FOUND       = 23;
const E_CORE_TYPE_CONVERSION_FAILED = 24;
const E_CORE_BACKUP_FAILED         = 25;
const E_CORE_WRITE_FAILED          = 26;
const E_CORE_QUERY_FAILED          = 27;

class BEJSONCoreError extends Error {
  
  constructor(message, code) {
    super(message);
    this.name = 'BEJSONCoreError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// ATOMIC FILE OPERATIONS (Node.js only)
// ---------------------------------------------------------------------------


function __bejson_core_atomic_backup(filePath, backupSuffix = '.backup') {
  const fs   = require('fs');
  const path = require('path');
  if (!fs.existsSync(filePath)) return '';

  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const ts   = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
               `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const backupPath = `${filePath}${backupSuffix}.${ts}`;

  try {
    fs.copyFileSync(filePath, backupPath);
  } catch (err) {
    throw new BEJSONCoreError(`Backup failed: ${err.message}`, E_CORE_BACKUP_FAILED);
  }
  return backupPath;
}


function __bejson_core_restore_backup(filePath, backupPath) {
  const fs = require('fs');
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, filePath);
    return true;
  }
  return false;
}


function bejson_core_atomic_write(filePath, content, createBackup = true) {
  const fs   = require('fs');
  const path = require('path');

  let backupPath = '';
  if (createBackup) {
    backupPath = __bejson_core_atomic_backup(filePath);
  }

  const jsonText = JSON.stringify(content, null, 2);

  // Ensure output parent directory exists
  const targetDir = path.dirname(filePath);
  fs.mkdirSync(targetDir, { recursive: true });

  // CRITICAL FIX: create temp as a SIBLING to the target file
  const tempPath = path.join(targetDir, `.bejson_${process.pid}_${Date.now()}.tmp`);

  let fd;
  try {
    // Open for writing, create if not exists, truncate if exists.
    fd = fs.openSync(tempPath, 'w', 0o644);
    fs.writeSync(fd, jsonText);

    // CRITICAL FIX: explicit disk sync before commit
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    // Validate temp file before moving
    bejson_validator_validate_file(tempPath);

    // Atomic move (same-partition guaranteed by sibling temp)
    try {
      fs.renameSync(tempPath, filePath);
      // fsync the directory entry to ensure rename is durable
      try {
        const dirFd = fs.openSync(targetDir, 'r');
        fs.fsyncSync(dirFd);
        fs.closeSync(dirFd);
      } catch (err) {
        // Ignore errors if directory fsync is not supported by OS/FS
      }
    } catch (err) {
      if (err.code === 'EXDEV') {
        // Cross-filesystem: fall back to copy + unlink
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
      } else {
        throw err;
      }
    }
  } catch (err) {
    if (fd !== null && fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    if (backupPath) {
      __bejson_core_restore_backup(filePath, backupPath);
    }
    throw new BEJSONCoreError(`Write failed: ${err.message}`, E_CORE_WRITE_FAILED);
  }

  // Clean up backup on success
  if (backupPath && fs.existsSync(backupPath)) {
    try { fs.unlinkSync(backupPath); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// DOCUMENT CREATION
// ---------------------------------------------------------------------------


function bejson_core_create_104(recordsType, fields, values) {
  return {
    Format:         'BEJSON',
    Format_Version: '104',
    Format_Creator: 'Elton Boehnen',
    Records_Type:   [recordsType],
    Fields:         fields,
    Values:         values,
  };
}


function bejson_core_create_104a(recordsType, fields, values, customHeaders = {}) {
  const doc = {
    Format:         'BEJSON',
    Format_Version: '104a',
    Format_Creator: 'Elton Boehnen',
    ...customHeaders,
    Records_Type:   [recordsType],
    Fields:         fields,
    Values:         values,
  };
  return doc;
}


function bejson_core_create_104db(recordsTypes, fields, values) {
  return {
    Format:         'BEJSON',
    Format_Version: '104db',
    Format_Creator: 'Elton Boehnen',
    Records_Type:   recordsTypes,
    Fields:         fields,
    Values:         values,
  };
}

// ---------------------------------------------------------------------------
// DOCUMENT LOADING
// ---------------------------------------------------------------------------


function bejson_core_load_file(filePath) {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    throw new BEJSONCoreError(`File not found: ${filePath}`, E_CORE_FIELD_NOT_FOUND);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  return bejson_core_load_string(text);
}


function bejson_core_load_string(jsonString) {
  try {
    const doc = JSON.parse(jsonString);
    bejson_validator_validate_string(jsonString);
    return doc;
  } catch (err) {
    if (err instanceof BEJSONValidationError) throw err;
    throw new BEJSONCoreError(`Parse failed: ${err.message}`, E_CORE_INVALID_VERSION);
  }
}

// ---------------------------------------------------------------------------
// FIELD & RECORD ACCESSORS
// ---------------------------------------------------------------------------


function bejson_core_get_version(doc) {
  return doc.Format_Version || '';
}


function bejson_core_get_records_types(doc) {
  return doc.Records_Type || [];
}


function bejson_core_get_fields(doc) {
  return doc.Fields || [];
}


function bejson_core_get_field_index(doc, fieldName) {
  const fields = bejson_core_get_fields(doc);
  const idx    = fields.findIndex(f => f.name === fieldName);
  if (idx === -1) {
    throw new BEJSONCoreError(`Field not found: ${fieldName}`, E_CORE_FIELD_NOT_FOUND);
  }
  return idx;
}


function bejson_core_get_field_def(doc, fieldName) {
  const fields = bejson_core_get_fields(doc);
  const def    = fields.find(f => f.name === fieldName);
  if (!def) {
    throw new BEJSONCoreError(`Field not found: ${fieldName}`, E_CORE_FIELD_NOT_FOUND);
  }
  return def;
}


function bejson_core_get_field_count(doc) {
  return (doc.Fields || []).length;
}


function bejson_core_get_record_count(doc) {
  return (doc.Values || []).length;
}


function bejson_core_get_value_at(doc, recordIndex, fieldIndex) {
  const values = doc.Values || [];
  if (recordIndex < 0 || recordIndex >= values.length) {
    throw new BEJSONCoreError(`Record index out of bounds: ${recordIndex}`, E_CORE_INDEX_OUT_OF_BOUNDS);
  }
  const row = values[recordIndex];
  if (fieldIndex < 0 || fieldIndex >= row.length) {
    throw new BEJSONCoreError(`Field index out of bounds: ${fieldIndex}`, E_CORE_INDEX_OUT_OF_BOUNDS);
  }
  return row[fieldIndex];
}


function bejson_core_get_record(doc, recordIndex) {
  const values = doc.Values || [];
  if (recordIndex < 0 || recordIndex >= values.length) {
    throw new BEJSONCoreError(`Record index out of bounds: ${recordIndex}`, E_CORE_INDEX_OUT_OF_BOUNDS);
  }
  return values[recordIndex];
}


function bejson_core_get_field_values(doc, fieldName) {
  const idx    = bejson_core_get_field_index(doc, fieldName);
  const values = doc.Values || [];
  return values.map(row => row[idx]);
}

// ---------------------------------------------------------------------------
// INDEXING & QUERYING
// ---------------------------------------------------------------------------


function bejson_core_query_records(doc, fieldName, searchValue) {
  const idx    = bejson_core_get_field_index(doc, fieldName);
  const values = doc.Values || [];
  return values.filter(row => row[idx] === searchValue);
}


function bejson_core_query_records_advanced(doc, conditions) {
  const fields = bejson_core_get_fields(doc);
  const filter = Object.entries(conditions).map(([name, val]) => {
    return { idx: fields.findIndex(f => f.name === name), val };
  }).filter(c => c.idx !== -1);

  const values = doc.Values || [];
  return values.filter(row => {
    return filter.every(c => row[c.idx] === c.val);
  });
}

// ---------------------------------------------------------------------------
// 104db OPERATIONS
// ---------------------------------------------------------------------------


function bejson_core_get_records_by_type(doc, recordType) {
  if (bejson_core_get_version(doc) !== '104db') {
    throw new BEJSONCoreError('Operation requires 104db document', E_CORE_INVALID_OPERATION);
  }
  // In 104db, the first field MUST be Record_Type_Parent (index 0)
  const values = doc.Values || [];
  return values.filter(row => row[0] === recordType);
}


function bejson_core_has_record_type(doc, recordType) {
  const types = bejson_core_get_records_types(doc);
  return types.includes(recordType);
}


function bejson_core_get_field_applicability(doc, fieldName) {
  const def = bejson_core_get_field_def(doc, fieldName);
  const rtp = def.Record_Type_Parent;
  
  const version = bejson_core_get_version(doc);
  if (version === '104db') {
    if (!rtp) {
      if (def.applies_to) {
        throw new BEJSONCoreError(`Field '${fieldName}' uses legacy 'applies_to'. 104db requires 'Record_Type_Parent'.`, E_CORE_INVALID_OPERATION);
      }
      throw new BEJSONCoreError(`Field '${fieldName}' missing Record_Type_Parent in 104db`, E_CORE_INVALID_OPERATION);
    }
  }
  
  return rtp || 'common';
}

// ---------------------------------------------------------------------------
// DATA MODIFICATION (Immutable style — returns new doc)
// ---------------------------------------------------------------------------


function __clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}


function _coerce_value(value, fieldType) {
  if (fieldType === 'string') return String(value);
  if (fieldType === 'integer' || fieldType === 'number') {
    const num = fieldType === 'integer' ? parseInt(value, 10) : parseFloat(value);
    if (isNaN(num)) {
      throw new BEJSONCoreError(`Cannot convert '${value}' to ${fieldType}`, E_CORE_TYPE_CONVERSION_FAILED);
    }
    return num;
  }
  if (fieldType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    throw new BEJSONCoreError(`Cannot convert '${value}' to boolean`, E_CORE_TYPE_CONVERSION_FAILED);
  }
  return value;
}


function bejson_core_set_value_at(doc, recordIndex, fieldIndex, newValue) {
  const fields = bejson_core_get_fields(doc);
  if (fieldIndex < 0 || fieldIndex >= fields.length) {
    throw new BEJSONCoreError(`Field index out of bounds: ${fieldIndex}`, E_CORE_INDEX_OUT_OF_BOUNDS);
  }
  
  const coerced = _coerce_value(newValue, fields[fieldIndex].type);
  
  const newDoc = __clone(doc);
  const values = newDoc.Values || [];
  if (recordIndex < 0 || recordIndex >= values.length) {
    throw new BEJSONCoreError(`Record index out of bounds: ${recordIndex}`, E_CORE_INDEX_OUT_OF_BOUNDS);
  }
  
  newDoc.Values[recordIndex][fieldIndex] = coerced;
  return newDoc;
}


function bejson_core_add_record(doc, values) {
  const fields = bejson_core_get_fields(doc);
  if (values.length !== fields.length) {
    throw new BEJSONCoreError(`Value count mismatch: expected ${fields.length}, got ${values.length}`, E_CORE_INVALID_OPERATION);
  }
  
  const coerced = values.map((v, i) => _coerce_value(v, fields[i].type));
  
  const newDoc = __clone(doc);
  newDoc.Values.push(coerced);
  return newDoc;
}


function bejson_core_remove_record(doc, recordIndex) {
  const newDoc = __clone(doc);
  if (recordIndex < 0 || recordIndex >= newDoc.Values.length) {
    throw new BEJSONCoreError(`Record index out of bounds: ${recordIndex}`, E_CORE_INDEX_OUT_OF_BOUNDS);
  }
  newDoc.Values.splice(recordIndex, 1);
  return newDoc;
}


function bejson_core_update_field(doc, recordIndex, fieldName, newValue) {
  const idx = bejson_core_get_field_index(doc, fieldName);
  return bejson_core_set_value_at(doc, recordIndex, idx, newValue);
}

// ---------------------------------------------------------------------------
// TABLE OPERATIONS
// ---------------------------------------------------------------------------


function bejson_core_add_column(doc, fieldName, fieldType, defaultValue = null, recordTypeParent = '') {
  const newDoc = __clone(doc);
  const fields = bejson_core_get_fields(newDoc);
  if (fields.some(f => f.name === fieldName)) {
    throw new BEJSONCoreError(`Field already exists: ${fieldName}`, E_CORE_INVALID_OPERATION);
  }
  const newField = { name: fieldName, type: fieldType };
  if (recordTypeParent) newField.Record_Type_Parent = recordTypeParent;
  newDoc.Fields.push(newField);
  for (const row of newDoc.Values) {
    row.push(defaultValue);
  }
  return newDoc;
}


function bejson_core_remove_column(doc, fieldName) {
  const idx    = bejson_core_get_field_index(doc, fieldName);
  const newDoc = __clone(doc);
  newDoc.Fields.splice(idx, 1);
  for (const row of newDoc.Values) {
    row.splice(idx, 1);
  }
  return newDoc;
}


function bejson_core_rename_column(doc, oldName, newName) {
  const idx    = bejson_core_get_field_index(doc, oldName);
  const newDoc = __clone(doc);
  const fields = bejson_core_get_fields(newDoc);
  if (fields.some(f => f.name === newName)) {
    throw new BEJSONCoreError(`New field name already exists: ${newName}`, E_CORE_INVALID_OPERATION);
  }
  fields[idx].name = newName;
  return newDoc;
}


function bejson_core_get_column(doc, fieldName) {
  return bejson_core_get_field_values(doc, fieldName);
}


function bejson_core_set_column(doc, fieldName, values) {
  const idx    = bejson_core_get_field_index(doc, fieldName);
  const newDoc = __clone(doc);
  if (values.length !== newDoc.Values.length) {
    throw new BEJSONCoreError(`Column length mismatch: expected ${newDoc.Values.length}, got ${values.length}`, E_CORE_INVALID_OPERATION);
  }
  for (let i = 0; i < values.length; i++) {
    newDoc.Values[i][idx] = values[i];
  }
  return newDoc;
}


function bejson_core_filter_rows(doc, predicate) {
  const newDoc = __clone(doc);
  newDoc.Values = newDoc.Values.filter(predicate);
  return newDoc;
}


function bejson_core_sort_by_field(doc, fieldName, ascending = true) {
  const idx    = bejson_core_get_field_index(doc, fieldName);
  const newDoc = __clone(doc);
  newDoc.Values.sort((a, b) => {
    const valA = a[idx];
    const valB = b[idx];
    if (valA === valB) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;
    let cmp = (valA < valB) ? -1 : 1;
    return ascending ? cmp : -cmp;
  });
  return newDoc;
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------


function bejson_core_pretty_print(doc) {
  return JSON.stringify(doc, null, 2);
}


function bejson_core_compact_print(doc) {
  return JSON.stringify(doc);
}


function bejson_core_is_valid(doc) {
  try {
    bejson_validator_validate_string(JSON.stringify(doc));
    return true;
  } catch (_) {
    return false;
  }
}


function bejson_core_get_stats(doc) {
  return {
    version:       bejson_core_get_version(doc),
    field_count:   bejson_core_get_field_count(doc),
    record_count:  bejson_core_get_record_count(doc),
    records_types: bejson_core_get_records_types(doc),
  };
}

// ---------------------------------------------------------------------------
// EXPORTS (CommonJS + browser global)
// ---------------------------------------------------------------------------

const exports_ = {
  // Error codes
  E_CORE_INVALID_VERSION,
  E_CORE_INVALID_OPERATION,
  E_CORE_INDEX_OUT_OF_BOUNDS,
  E_CORE_FIELD_NOT_FOUND,
  E_CORE_TYPE_CONVERSION_FAILED,
  E_CORE_BACKUP_FAILED,
  E_CORE_WRITE_FAILED,
  E_CORE_QUERY_FAILED,
  // Classes
  BEJSONCoreError,
  // Atomic file ops (Node.js)
  bejson_core_atomic_write,
  // Document creation
  bejson_core_create_104,
  bejson_core_create_104a,
  bejson_core_create_104db,
  // Loading & parsing
  bejson_core_load_file,
  bejson_core_load_string,
  bejson_core_get_version,
  bejson_core_get_records_types,
  bejson_core_get_fields,
  bejson_core_get_field_index,
  bejson_core_get_field_def,
  bejson_core_get_field_count,
  bejson_core_get_record_count,
  // Indexing & querying
  bejson_core_get_value_at,
  bejson_core_get_record,
  bejson_core_get_field_values,
  bejson_core_query_records,
  bejson_core_query_records_advanced,
  // 104db ops
  bejson_core_get_records_by_type,
  bejson_core_has_record_type,
  bejson_core_get_field_applicability,
  // Data modification
  bejson_core_set_value_at,
  bejson_core_add_record,
  bejson_core_remove_record,
  bejson_core_update_field,
  // Table ops
  bejson_core_add_column,
  bejson_core_remove_column,
  bejson_core_rename_column,
  bejson_core_get_column,
  bejson_core_set_column,
  bejson_core_filter_rows,
  bejson_core_sort_by_field,
  // Utilities
  bejson_core_pretty_print,
  bejson_core_compact_print,
  bejson_core_is_valid,
  bejson_core_get_stats,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exports_;
}
if (typeof window !== 'undefined') {
  window.BEJSON_CORE = exports_;
}


function bejson_core_acquire_lock(filePath, timeout = 10) {
  const fs = require('fs');
  const lockPath = filePath + '.lock';
  const startTime = Date.now();
  while ((Date.now() - startTime) / 1000 < timeout) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(require('path').join(lockPath, 'pid'), String(process.pid));
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Sleep synchronously (blocking)
      const Atomics = global.Atomics;
      const SharedArrayBuffer = global.SharedArrayBuffer;
      if (Atomics && SharedArrayBuffer) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      } else {
        // Fallback for older node
        const end = Date.now() + 100;
        while (Date.now() < end) ;
      }
    }
  }
  return false;
}


function bejson_core_release_lock(filePath) {
  const fs = require('fs');
  const path = require('path');
  const lockPath = filePath + '.lock';
  if (fs.existsSync(lockPath)) {
    try {
      const pidFile = path.join(lockPath, 'pid');
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      fs.rmdirSync(lockPath);
    } catch (e) {}
  }
}

// Add to exports
Object.assign(exports_, { bejson_core_acquire_lock, bejson_core_release_lock });
