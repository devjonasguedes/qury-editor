const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { buildIndexes, buildConstraints, buildTriggers } = require('./metadata');

const MAX_IPC_ROWS = 5000;
const isReadOnlyConfig = (cfg) => !!(cfg && (cfg.readOnly || cfg.read_only));

const normalizeIdentifier = (value) =>
  String(value || '')
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/^"|"$/g, '')
    .replace(/^\[|\]$/g, '');

const quoteIdentifier = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

const normalizeSqliteMode = (cfg) => {
  const raw = String(cfg && (cfg.sqliteMode || cfg.sqlite_mode) || '').trim().toLowerCase();
  if (raw === 'existing') return 'existing';
  return 'create';
};

const resolveFilePath = (cfg) => {
  const raw = cfg && (cfg.filePath || cfg.file_path || cfg.path || cfg.file || cfg.database);
  const text = String(raw || '').trim();
  return text;
};

const splitStatements = (sql) => {
  const source = String(sql || '');
  const statements = [];
  let segmentStart = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  const pushStatement = (start, end) => {
    const raw = source.slice(start, end);
    const trimmed = raw.trim();
    if (!trimmed) return;
    statements.push(trimmed);
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    if (!inDouble && !inBacktick && ch === "'") {
      if (inSingle && next === "'") {
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && !inBacktick && ch === '"') {
      if (inDouble && next === '"') {
        i += 1;
        continue;
      }
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && ch === ';') {
      pushStatement(segmentStart, i);
      segmentStart = i + 1;
    }
  }

  pushStatement(segmentStart, source.length);
  return statements;
};

function createSqliteDriver() {
  let client = null;
  let config = null;
  let activeSchema = 'main';

  const closeConnection = () => {
    if (!client) return;
    try {
      client.close();
    } catch (_) {
      // best effort
    }
    client = null;
  };

  const openConnection = (cfg) => {
    const filePath = resolveFilePath(cfg);
    if (!filePath) throw new Error('SQLite file path is required.');
    const sqliteMode = normalizeSqliteMode(cfg);
    const readOnly = isReadOnlyConfig(cfg);
    const fileMustExist = sqliteMode === 'existing' || readOnly;

    if (sqliteMode === 'existing' && !fs.existsSync(filePath)) {
      throw new Error('SQLite file not found.');
    }

    if (sqliteMode === 'create') {
      const folder = path.dirname(filePath);
      if (folder && folder !== '.' && !fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
    }

    return new Database(filePath, { readonly: readOnly, fileMustExist });
  };

  const connect = async (cfg) => {
    try {
      closeConnection();
      client = openConnection(cfg);
      config = { ...(cfg || {}), filePath: resolveFilePath(cfg) };
      activeSchema = String(cfg && cfg.database ? cfg.database : 'main');
      return { ok: true };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to connect.';
      return { ok: false, error: message };
    }
  };

  const disconnect = async () => {
    closeConnection();
    config = null;
    return { ok: true };
  };

  const testConnection = async (cfg) => {
    let connection = null;
    try {
      connection = openConnection(cfg);
      connection.prepare('SELECT 1').get();
      return { ok: true };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to test connection.';
      return { ok: false, error: message };
    } finally {
      if (connection) {
        try {
          connection.close();
        } catch (_) {}
      }
    }
  };

  const listDatabases = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const rows = client.prepare('PRAGMA database_list').all();
    const databases = (rows || []).map((row) => row.name).filter(Boolean);
    const current = activeSchema && databases.includes(activeSchema) ? activeSchema : databases[0] || 'main';
    if (!activeSchema) activeSchema = current;
    return { ok: true, databases, current };
  };

  const useDatabase = async (name) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const target = String(name || '').trim();
    if (!target) return { ok: false, error: 'Invalid database.' };
    const rows = client.prepare('PRAGMA database_list').all();
    const names = (rows || []).map((row) => row.name).filter(Boolean);
    if (!names.includes(target)) return { ok: false, error: 'Database not found.' };
    activeSchema = target;
    if (config) config.database = target;
    return { ok: true };
  };

  const listTables = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const dbRows = client.prepare('PRAGMA database_list').all();
    const schemas = (dbRows || []).map((row) => row.name).filter(Boolean);
    const rows = [];
    schemas.forEach((schema) => {
      const qualified = `${quoteIdentifier(schema)}.sqlite_master`;
      const stmt = client.prepare(
        `SELECT name, type FROM ${qualified} WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      const list = stmt.all();
      list.forEach((row) => {
        rows.push({
          table_schema: schema,
          table_name: row.name,
          table_type: row.type === 'view' ? 'VIEW' : 'BASE TABLE'
        });
      });
    });
    return { ok: true, rows };
  };

  const listRoutines = async () => ({ ok: true, rows: [] });

  const listColumns = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : activeSchema || 'main';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    const normalizedTable = normalizeIdentifier(table);
    const stmt = client.prepare(
      `PRAGMA ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(normalizedTable)})`
    );
    const rows = stmt.all();
    const columns = (rows || []).map((row) => ({
      column_name: row.name,
      data_type: row.type || ''
    }));
    return { ok: true, columns };
  };

  const listTableInfo = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : activeSchema || 'main';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    const normalizedTable = normalizeIdentifier(table);

    const indexList = client
      .prepare(`PRAGMA ${quoteIdentifier(schema)}.index_list(${quoteIdentifier(normalizedTable)})`)
      .all();

    const indexRows = [];
    const constraintRows = [];
    const indexColumnsByName = new Map();

    (indexList || []).forEach((row) => {
      const indexName = row.name;
      if (!indexName) return;
      const info = client
        .prepare(`PRAGMA ${quoteIdentifier(schema)}.index_info(${quoteIdentifier(indexName)})`)
        .all();
      const columns = (info || []).map((item) => item.name).filter(Boolean);
      indexColumnsByName.set(indexName, columns);
      indexRows.push({
        index_name: indexName,
        is_unique: Number(row.unique) === 1,
        is_primary: String(row.origin || '').toLowerCase() === 'pk',
        index_method: 'btree',
        columns
      });
      if (Number(row.unique) === 1 && String(row.origin || '').toLowerCase() === 'u') {
        columns.forEach((col) => {
          constraintRows.push({
            constraint_name: indexName,
            constraint_type: 'UNIQUE',
            column_name: col
          });
        });
      }
    });

    const tableInfo = client
      .prepare(`PRAGMA ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(normalizedTable)})`)
      .all();
    const pkColumns = (tableInfo || [])
      .filter((row) => Number(row.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((row) => row.name)
      .filter(Boolean);
    pkColumns.forEach((col) => {
      constraintRows.push({
        constraint_name: 'PRIMARY',
        constraint_type: 'PRIMARY KEY',
        column_name: col
      });
    });

    const fkList = client
      .prepare(`PRAGMA ${quoteIdentifier(schema)}.foreign_key_list(${quoteIdentifier(normalizedTable)})`)
      .all();
    (fkList || []).forEach((row) => {
      const key = `fk_${normalizedTable}_${row.id}`;
      constraintRows.push({
        constraint_name: key,
        constraint_type: 'FOREIGN KEY',
        column_name: row.from || '',
        referenced_table_schema: schema,
        referenced_table_name: row.table || '',
        referenced_column_name: row.to || ''
      });
    });

    const triggerRows = client
      .prepare(
        `SELECT name, sql FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type = 'trigger' AND tbl_name = ?`
      )
      .all(normalizedTable)
      .map((row) => {
        const sql = String(row.sql || '');
        const timingMatch = sql.match(/\b(BEFORE|AFTER|INSTEAD\s+OF)\b/i);
        const eventMatch = sql.match(/\b(INSERT|UPDATE|DELETE)\b/i);
        return {
          trigger_name: row.name,
          action_timing: timingMatch ? timingMatch[1].replace(/\s+/g, ' ') : '',
          event_manipulation: eventMatch ? eventMatch[1] : '',
          action_statement: sql
        };
      });

    return {
      ok: true,
      indexes: buildIndexes(indexRows),
      constraints: buildConstraints(constraintRows, []),
      triggers: buildTriggers(triggerRows)
    };
  };

  const getViewDefinition = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : activeSchema || 'main';
    const view = payload && (payload.view || payload.name || payload.table) ? (payload.view || payload.name || payload.table) : '';
    if (!view) return { ok: false, error: 'Invalid view.' };
    const stmt = client.prepare(
      `SELECT sql FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type = 'view' AND name = ?`
    );
    const row = stmt.get(normalizeIdentifier(view));
    const sql = row && row.sql ? row.sql : '';
    if (!sql) return { ok: false, error: 'View definition not found.' };
    return { ok: true, sql };
  };

  const getTableDefinition = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : activeSchema || 'main';
    const table = payload && (payload.table || payload.name) ? (payload.table || payload.name) : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    const stmt = client.prepare(
      `SELECT sql FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type = 'table' AND name = ?`
    );
    const row = stmt.get(normalizeIdentifier(table));
    const sql = row && row.sql ? row.sql : '';
    if (!sql) return { ok: false, error: 'Table definition not found.' };
    return { ok: true, sql };
  };

  const setSessionTimezone = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const source = payload && typeof payload === 'object' ? payload : { timezone: payload };
    const timezone = String(source.timezone || source.sessionTimezone || source.value || '').trim();
    return { ok: true, applied: false, timezone: timezone || 'UTC' };
  };

  const runQuery = async (payload) => {
    const input = typeof payload === 'string' ? { sql: payload } : (payload || {});
    const sql = input.sql || '';
    const timeoutMs = Number(input.timeoutMs || 0);
    if (!client) return { ok: false, error: 'Not connected.' };
    if (!sql || !sql.trim()) return { ok: false, error: 'Empty query.' };

    try {
      if (Number.isFinite(timeoutMs)) {
        const safeTimeout = Math.max(0, Math.floor(timeoutMs));
        try {
          client.pragma(`busy_timeout = ${safeTimeout}`);
        } catch (_) {
          // ignore busy_timeout errors
        }
      }
      const statements = splitStatements(sql);
      if (statements.length === 0) return { ok: false, error: 'Empty query.' };

      let rows = [];
      let totalRows = 0;
      let lastSelectRows = null;
      let lastSelectTotalRows = 0;
      let affectedRows = undefined;

      statements.forEach((statement) => {
        const stmt = client.prepare(statement);
        if (stmt.reader) {
          const result = stmt.all();
          rows = result || [];
          totalRows = rows.length;
          lastSelectRows = rows;
          lastSelectTotalRows = totalRows;
          affectedRows = undefined;
        } else {
          const info = stmt.run();
          rows = [];
          totalRows = 0;
          if (info && Number.isFinite(info.changes)) {
            affectedRows = info.changes;
          }
        }
      });

      const hasSelect = Array.isArray(lastSelectRows);
      const outputRows = hasSelect ? lastSelectRows : rows;
      const outputTotalRows = hasSelect ? lastSelectTotalRows : totalRows;
      const truncated = outputRows.length > MAX_IPC_ROWS;
      return {
        ok: true,
        rows: truncated ? outputRows.slice(0, MAX_IPC_ROWS) : outputRows,
        totalRows: outputTotalRows,
        truncated,
        affectedRows: hasSelect ? undefined : Number.isFinite(affectedRows) ? affectedRows : undefined,
        changedRows: hasSelect ? undefined : Number.isFinite(affectedRows) ? affectedRows : undefined
      };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to run query.';
      return { ok: false, error: message };
    }
  };

  const cancelQuery = async () => ({ ok: false, error: 'Query cancel not supported.' });

  return {
    type: 'sqlite',
    connect,
    disconnect,
    testConnection,
    listTables,
    listRoutines,
    listColumns,
    listTableInfo,
    getViewDefinition,
    getTableDefinition,
    listDatabases,
    useDatabase,
    setSessionTimezone,
    runQuery,
    cancelQuery
  };
}

module.exports = {
  createSqliteDriver
};
