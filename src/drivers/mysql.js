const mysql = require('mysql2/promise');
const { buildIndexes, buildConstraints, buildTriggers } = require('./metadata');

const MAX_IPC_ROWS = 5000;
const DEFAULT_SESSION_TIMEZONE = 'UTC';
const DEFAULT_CONNECTION_OPEN_TIMEOUT_MS = 10000;
const DEFAULT_CONNECTION_CLOSE_TIMEOUT_MS = 5000;
const DEFAULT_CONNECTION_VALIDATION_TIMEOUT_MS = 10000;
const isReadOnlyConfig = (cfg) => !!(cfg && (cfg.readOnly || cfg.read_only));
const OFFSET_TIMEZONE_RE = /^[+-](0\d|1[0-4]):([0-5]\d)$/;
const normalizeSessionTimezone = (value) => {
  const timezone = String(value || '').trim() || DEFAULT_SESSION_TIMEZONE;
  return timezone.toUpperCase() === 'UTC' ? '+00:00' : timezone;
};
const normalizeTimeoutMs = (value, fallback) => {
  const normalizedFallback = Math.max(0, Number(fallback) || 0);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return normalizedFallback;
  return Math.floor(parsed);
};

function toIanaOffsetTimezone(value) {
  const timezone = String(value || '').trim();
  if (!timezone) return '';
  const offsetStyles = ['shortOffset', 'longOffset'];
  for (const style of offsetStyles) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: style
      }).formatToParts(new Date());
      const token = String((parts.find((part) => part.type === 'timeZoneName') || {}).value || '')
        .replace('−', '-')
        .trim();
      if (!token) continue;
      if (token === 'GMT' || token === 'UTC') return '+00:00';
      const match = token.match(/(?:GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
      if (!match) continue;
      const rawHours = Number(match[1]);
      if (!Number.isFinite(rawHours)) continue;
      const sign = rawHours < 0 ? '-' : '+';
      const hours = String(Math.abs(rawHours)).padStart(2, '0');
      const minutes = String(match[2] || '00').padStart(2, '0');
      return `${sign}${hours}:${minutes}`;
    } catch (_) {
      // ignore and try next style
    }
  }
  return '';
}

function resolveMysqlTimezoneCandidates(value) {
  const normalized = normalizeSessionTimezone(value);
  if (normalized.toUpperCase() === 'SYSTEM') return [normalized];
  if (OFFSET_TIMEZONE_RE.test(normalized)) return [normalized];
  const candidates = [normalized];
  const convertedOffset = toIanaOffsetTimezone(normalized);
  if (convertedOffset && !candidates.includes(convertedOffset)) {
    candidates.push(convertedOffset);
  }
  return candidates;
}

function normalizeIdentifier(value) {
  return String(value || '').trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '');
}

function splitTopLevelCsv(value) {
  const result = [];
  let current = '';
  let depth = 0;
  for (const ch of String(value || '')) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      result.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) result.push(current);
  return result;
}

function parseColumnList(value) {
  return splitTopLevelCsv(value)
    .map((part) => String(part || '').trim())
    .map((part) => {
      if (!part) return '';
      const quoted = part.match(/^`([^`]+)`/);
      if (quoted) return quoted[1];
      const doubleQuoted = part.match(/^"([^"]+)"/);
      if (doubleQuoted) return doubleQuoted[1];
      const token = part.split(/[ (]/)[0];
      return normalizeIdentifier(token);
    })
    .filter(Boolean);
}

function parseQualifiedReference(value, fallbackSchema) {
  const raw = String(value || '').trim();
  if (!raw) return { schema: fallbackSchema || '', table: '' };
  const normalized = raw.replace(/`/g, '').replace(/"/g, '');
  const parts = normalized.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      schema: parts[parts.length - 2],
      table: parts[parts.length - 1]
    };
  }
  return {
    schema: fallbackSchema || '',
    table: parts[0] || normalized
  };
}

function consumeIdentifierToken(value) {
  const text = String(value || '').trimStart();
  if (!text) return { identifier: '', rest: '' };
  const first = text[0];
  if (first === '`' || first === '"') {
    const end = text.indexOf(first, 1);
    if (end > 0) {
      return {
        identifier: text.slice(1, end),
        rest: text.slice(end + 1).trimStart()
      };
    }
  }
  const match = text.match(/^([^\s(]+)([\s\S]*)$/);
  if (!match) return { identifier: '', rest: '' };
  return {
    identifier: normalizeIdentifier(match[1]),
    rest: String(match[2] || '').trimStart()
  };
}

function parseLegacyCreateConstraints(createTableSql, schema) {
  const constraints = [];
  let unnamedUnique = 0;
  let unnamedForeign = 0;
  let unnamedCheck = 0;
  const lines = String(createTableSql || '').split('\n');

  lines.forEach((rawLine) => {
    let line = String(rawLine || '').trim();
    if (!line) return;
    if (line.endsWith(',')) line = line.slice(0, -1).trim();

    let constraintName = '';
    let body = line;
    if (/^CONSTRAINT\b/i.test(body)) {
      body = body.replace(/^CONSTRAINT\s+/i, '');
      const consumed = consumeIdentifierToken(body);
      constraintName = consumed.identifier;
      body = consumed.rest;
    }

    let match = body.match(/^PRIMARY KEY\s*\((.+?)\)/i);
    if (match) {
      constraints.push({
        name: constraintName || 'PRIMARY',
        type: 'PRIMARY KEY',
        columns: parseColumnList(match[1]),
        ref: null,
        definition: null
      });
      return;
    }

    if (/^UNIQUE(?:\s+KEY|\s+INDEX)?\b/i.test(body)) {
      let rest = body.replace(/^UNIQUE(?:\s+KEY|\s+INDEX)?\s*/i, '');
      let uniqueName = constraintName;
      if (!rest.startsWith('(')) {
        const consumed = consumeIdentifierToken(rest);
        uniqueName = uniqueName || consumed.identifier;
        rest = consumed.rest;
      }
      match = rest.match(/^\((.+?)\)/);
      if (!match) return;
      unnamedUnique += 1;
      constraints.push({
        name: uniqueName || `UNIQUE_${unnamedUnique}`,
        type: 'UNIQUE',
        columns: parseColumnList(match[1]),
        ref: null,
        definition: null
      });
      return;
    }

    match = body.match(/^FOREIGN KEY\s*\((.+?)\)\s+REFERENCES\s+([^\s(]+)(?:\s*\((.+?)\))?/i);
    if (match) {
      const ref = parseQualifiedReference(match[2], schema);
      unnamedForeign += 1;
      constraints.push({
        name: constraintName || `FOREIGN_${unnamedForeign}`,
        type: 'FOREIGN KEY',
        columns: parseColumnList(match[1]),
        ref: {
          schema: ref.schema || '',
          table: ref.table || '',
          columns: parseColumnList(match[3] || '')
        },
        definition: null
      });
      return;
    }

    match = body.match(/^CHECK\s*\(([\s\S]+)\)$/i);
    if (match) {
      unnamedCheck += 1;
      constraints.push({
        name: constraintName || `CHECK_${unnamedCheck}`,
        type: 'CHECK',
        columns: [],
        ref: null,
        definition: String(match[1] || '').trim()
      });
    }
  });

  return constraints;
}

function extractLegacyColumnType(definition) {
  const text = String(definition || '').trim();
  if (!text) return '';
  const stops = [' NOT NULL', ' NULL', ' DEFAULT ', ' AUTO_INCREMENT', ' COMMENT ', ' COLLATE ', ' CHARACTER SET ', ' PRIMARY KEY', ' UNIQUE KEY', ' REFERENCES ', ' CHECK '];
  const upper = text.toUpperCase();
  let end = text.length;
  stops.forEach((stop) => {
    const idx = upper.indexOf(stop);
    if (idx >= 0 && idx < end) end = idx;
  });
  return text.slice(0, end).trim();
}

function parseLegacyCreateColumns(createTableSql) {
  const columns = [];
  const lines = String(createTableSql || '').split('\n');
  lines.forEach((rawLine) => {
    let line = String(rawLine || '').trim();
    if (!line) return;
    if (line.endsWith(',')) line = line.slice(0, -1).trim();
    if (!line.startsWith('`') && !line.startsWith('"')) return;
    const m = line.match(/^[`"]([^`"]+)[`"]\s+(.+)$/);
    if (!m) return;
    const column_name = m[1];
    const data_type = extractLegacyColumnType(m[2]);
    if (!column_name) return;
    columns.push({ column_name, data_type: data_type || '' });
  });
  return columns;
}

function splitStatements(sql) {
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
}

function normalizeLegacyIndexRows(rows) {
  return (rows || [])
    .map((row) => ({
      index_name: row.index_name || row.Key_name || row.key_name || '',
      non_unique: row.non_unique !== undefined ? row.non_unique : row.Non_unique,
      seq_in_index: row.seq_in_index !== undefined ? row.seq_in_index : row.Seq_in_index,
      column_name: row.column_name || row.Column_name || row.expression || row.Expression || '',
      index_type: row.index_type || row.Index_type || ''
    }))
    .filter((row) => row.index_name && row.column_name)
    .sort((a, b) => {
      const byName = String(a.index_name).localeCompare(String(b.index_name));
      if (byName !== 0) return byName;
      return Number(a.seq_in_index || 0) - Number(b.seq_in_index || 0);
    });
}

function dedupeValues(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function mergeIndexes(primary, secondary) {
  const map = new Map();
  const apply = (item) => {
    if (!item || !item.name) return;
    const key = String(item.name);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name: item.name,
        unique: !!item.unique,
        primary: !!item.primary,
        method: item.method || '',
        columns: dedupeValues(item.columns)
      });
      return;
    }
    existing.unique = existing.unique || !!item.unique;
    existing.primary = existing.primary || !!item.primary;
    if (!existing.method && item.method) existing.method = item.method;
    const nextCols = dedupeValues([...(existing.columns || []), ...(item.columns || [])]);
    if (nextCols.length) existing.columns = nextCols;
  };
  (primary || []).forEach(apply);
  (secondary || []).forEach(apply);
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function mergeConstraints(primary, secondary) {
  const map = new Map();
  const buildKey = (item) => {
    const type = String(item.type || '').toUpperCase();
    if (item.name) return `${type}|${item.name}`;
    const cols = dedupeValues(item.columns).join(',');
    const ref = item.ref && item.ref.table ? `${item.ref.schema || ''}.${item.ref.table}` : '';
    return `${type}|${cols}|${ref}`;
  };
  const apply = (item) => {
    if (!item) return;
    const key = buildKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name: item.name || '',
        type: item.type || '',
        columns: dedupeValues(item.columns),
        ref: item.ref
          ? {
            schema: item.ref.schema || '',
            table: item.ref.table || '',
            columns: dedupeValues(item.ref.columns)
          }
          : null,
        definition: item.definition || null
      });
      return;
    }
    if (!existing.name && item.name) existing.name = item.name;
    if (!existing.type && item.type) existing.type = item.type;
    existing.columns = dedupeValues([...(existing.columns || []), ...(item.columns || [])]);
    if (!existing.ref && item.ref) {
      existing.ref = {
        schema: item.ref.schema || '',
        table: item.ref.table || '',
        columns: dedupeValues(item.ref.columns)
      };
    } else if (existing.ref && item.ref) {
      if (!existing.ref.schema && item.ref.schema) existing.ref.schema = item.ref.schema;
      if (!existing.ref.table && item.ref.table) existing.ref.table = item.ref.table;
      existing.ref.columns = dedupeValues([...(existing.ref.columns || []), ...(item.ref.columns || [])]);
    }
    if (!existing.definition && item.definition) existing.definition = item.definition;
  };
  (primary || []).forEach(apply);
  (secondary || []).forEach(apply);
  return Array.from(map.values()).sort((a, b) => String(a.name || a.type).localeCompare(String(b.name || b.type)));
}

function createMySqlDriver({ createTunnel, closeTunnel } = {}) {
  let client = null;
  let config = null;
  let database = '';
  let tunnel = null;
  let currentQuery = null;

  const resolveConnectionTimeouts = (cfg) => ({
    openMs: normalizeTimeoutMs(cfg && cfg.connectionOpenTimeoutMs, DEFAULT_CONNECTION_OPEN_TIMEOUT_MS),
    closeMs: normalizeTimeoutMs(cfg && cfg.connectionCloseTimeoutMs, DEFAULT_CONNECTION_CLOSE_TIMEOUT_MS),
    validationMs: normalizeTimeoutMs(cfg && cfg.connectionValidationTimeoutMs, DEFAULT_CONNECTION_VALIDATION_TIMEOUT_MS)
  });

  const closeConnection = async (connection, timeoutMs) => {
    if (!connection) return;
    const timeout = normalizeTimeoutMs(timeoutMs, DEFAULT_CONNECTION_CLOSE_TIMEOUT_MS);
    const closePromise = connection.end();
    if (timeout <= 0) {
      await closePromise;
      return;
    }
    let timer = null;
    try {
      await Promise.race([
        closePromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Connection close timeout after ${timeout}ms.`));
          }, timeout);
        })
      ]);
    } catch (err) {
      if (connection && typeof connection.destroy === 'function') {
        try {
          connection.destroy();
        } catch (_) {
          // best effort
        }
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const validateConnection = async (connection, timeoutMs) => {
    const timeout = normalizeTimeoutMs(timeoutMs, DEFAULT_CONNECTION_VALIDATION_TIMEOUT_MS);
    await connection.query({
      sql: 'SELECT 1',
      timeout: timeout > 0 ? timeout : undefined
    });
  };

  const applySessionTimezone = async (connection, value, { strict = false } = {}) => {
    const timezone = normalizeSessionTimezone(value);
    const candidates = resolveMysqlTimezoneCandidates(timezone);
    let lastError = null;
    for (const candidate of candidates) {
      try {
        await connection.query('SET time_zone = ?', [candidate]);
        return candidate;
      } catch (err) {
        lastError = err;
      }
    }
    const fallback = normalizeSessionTimezone(DEFAULT_SESSION_TIMEZONE);
    if (!strict && !candidates.includes(fallback)) {
      await connection.query('SET time_zone = ?', [fallback]);
      return fallback;
    }
    throw lastError || new Error('Failed to set session timezone.');
  };

  const disconnect = async () => {
    const closeTimeoutMs = resolveConnectionTimeouts(config).closeMs;
    try {
      if (client) {
        try {
          await closeConnection(client, closeTimeoutMs);
        } catch (_) {
          // already force-closed when needed
        }
      }
    } finally {
      client = null;
      config = null;
      database = '';
      currentQuery = null;
      if (tunnel && closeTunnel) closeTunnel(tunnel);
      tunnel = null;
    }
  };

  const connect = async (cfg, sshConfig) => {
    let connectHost = cfg.host;
    let connectPort = Number(cfg.port || 3306);
    const timeouts = resolveConnectionTimeouts(cfg);
    let createdTunnel = null;
    let connection = null;
    try {
      if (sshConfig && createTunnel) {
        createdTunnel = await createTunnel(sshConfig, connectHost, connectPort);
        connectHost = createdTunnel.localHost;
        connectPort = createdTunnel.localPort;
      }
      connection = await mysql.createConnection({
        host: connectHost,
        port: connectPort,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database || undefined,
        connectTimeout: timeouts.openMs > 0 ? timeouts.openMs : undefined
      });
      await validateConnection(connection, timeouts.validationMs);
      if (isReadOnlyConfig(cfg)) {
        await connection.query('SET SESSION TRANSACTION READ ONLY');
      }
      const sessionTimezone = normalizeSessionTimezone(cfg.sessionTimezone);
      await applySessionTimezone(connection, sessionTimezone);
      let dbName = cfg.database || '';
      if (!dbName) {
        const [rows] = await connection.query('SELECT DATABASE() AS db');
        dbName = rows && rows[0] && rows[0].db ? rows[0].db : '';
      }
      client = connection;
      config = {
        host: connectHost,
        port: connectPort,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database || undefined,
        readOnly: isReadOnlyConfig(cfg),
        sessionTimezone,
        connectionOpenTimeoutMs: timeouts.openMs,
        connectionCloseTimeoutMs: timeouts.closeMs,
        connectionValidationTimeoutMs: timeouts.validationMs
      };
      database = dbName;
      tunnel = createdTunnel;
      return { ok: true };
    } catch (err) {
      if (connection) {
        try {
          await closeConnection(connection, timeouts.closeMs);
        } catch (_) {}
      }
      if (createdTunnel && closeTunnel) closeTunnel(createdTunnel);
      return { ok: false, error: err && err.message ? err.message : 'Failed to connect.' };
    }
  };

  const testConnection = async (cfg, sshConfig) => {
    let connectHost = cfg.host;
    let connectPort = Number(cfg.port || 3306);
    const timeouts = resolveConnectionTimeouts(cfg);
    let testTunnel = null;
    let connection = null;
    try {
      if (sshConfig && createTunnel) {
        testTunnel = await createTunnel(sshConfig, connectHost, connectPort);
        connectHost = testTunnel.localHost;
        connectPort = testTunnel.localPort;
      }
      connection = await mysql.createConnection({
        host: connectHost,
        port: connectPort,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database || undefined,
        connectTimeout: timeouts.openMs > 0 ? timeouts.openMs : undefined
      });
      await validateConnection(connection, timeouts.validationMs);
      await closeConnection(connection, timeouts.closeMs);
      connection = null;
      return { ok: true };
    } catch (err) {
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to test connection.';
      return { ok: false, error: message };
    } finally {
      if (connection) {
        try {
          await closeConnection(connection, timeouts.closeMs);
        } catch (_) {}
      }
      if (testTunnel && closeTunnel) closeTunnel(testTunnel);
    }
  };

  const listTables = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const [rows] = await client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows };
  };

  const listRoutines = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const [rows] = await client.query(
      "SELECT routine_schema, routine_name, routine_type FROM information_schema.routines WHERE routine_schema NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY routine_schema, routine_type, routine_name"
    );
    return { ok: true, rows };
  };

  const listColumns = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    try {
      const [rows] = await client.query(
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
        [schema, table]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return { ok: true, columns: rows };
      }
    } catch (_) {
      // fallback below
    }

    try {
      const qualified = buildQualified(schema, table);
      const [rows] = await client.query(`SHOW COLUMNS FROM ${qualified}`);
      const columns = (rows || []).map((row) => ({
        column_name: row.Field || row.field || '',
        data_type: row.Type || row.type || ''
      }));
      if (columns.length > 0) return { ok: true, columns };
    } catch (_) {
      // fallback below
    }

    try {
      const qualified = buildQualified(schema, table);
      const [rows] = await client.query(`SHOW CREATE TABLE ${qualified}`);
      const row = rows && rows[0] ? rows[0] : null;
      const key = row ? Object.keys(row).find((k) => String(k).toLowerCase() === 'create table') : '';
      const createSql = key ? row[key] : '';
      const columns = parseLegacyCreateColumns(createSql);
      return { ok: true, columns };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to list columns.';
      return { ok: false, error: message };
    }
  };

  const listTableInfo = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    const safeQuery = async (sql, params = []) => {
      try {
        const [rows] = await client.query(sql, params);
        return rows || [];
      } catch (_) {
        return [];
      }
    };

    const infoIndexRows = await safeQuery(
      'SELECT index_name, non_unique, seq_in_index, column_name, index_type FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? ORDER BY index_name, seq_in_index',
      [schema, table]
    );
    const infoConstraintRows = await safeQuery(
      'SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, kcu.referenced_table_schema, kcu.referenced_table_name, kcu.referenced_column_name FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_schema = kcu.constraint_schema AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name AND tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = ? AND tc.table_name = ? ORDER BY tc.constraint_name, kcu.ordinal_position',
      [schema, table]
    );
    const infoCheckRows = await safeQuery(
      'SELECT cc.constraint_name, cc.check_clause FROM information_schema.check_constraints cc JOIN information_schema.table_constraints tc ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name WHERE tc.table_schema = ? AND tc.table_name = ? AND tc.constraint_type = \'CHECK\'',
      [schema, table]
    );
    const infoTriggerRows = await safeQuery(
      'SELECT trigger_name, action_timing, event_manipulation, action_statement FROM information_schema.triggers WHERE trigger_schema = ? AND event_object_table = ? ORDER BY trigger_name, event_manipulation',
      [schema, table]
    );

    const qualified = buildQualified(schema, table);
    const legacyIndexRaw = await safeQuery(`SHOW INDEX FROM ${qualified}`);
    const legacyIndexRows = normalizeLegacyIndexRows(legacyIndexRaw);

    let legacyConstraints = [];
    const createRows = await safeQuery(`SHOW CREATE TABLE ${qualified}`);
    if (createRows.length > 0) {
      const row = createRows[0] || {};
      const createKey = Object.keys(row).find((key) => String(key).toLowerCase() === 'create table');
      const createSql = createKey ? row[createKey] : '';
      if (createSql) {
        legacyConstraints = parseLegacyCreateConstraints(createSql, schema);
      }
    }

    let legacyTriggerRows = [];
    if (infoTriggerRows.length === 0) {
      if (schema) {
        legacyTriggerRows = await safeQuery(
          `SHOW TRIGGERS FROM ${quoteIdentifier(schema)} LIKE ?`,
          [table]
        );
      } else {
        legacyTriggerRows = await safeQuery('SHOW TRIGGERS LIKE ?', [table]);
      }
    }

    const schemaIndexes = buildIndexes(infoIndexRows);
    const schemaConstraints = buildConstraints(infoConstraintRows, infoCheckRows);
    const legacyIndexes = buildIndexes(legacyIndexRows);
    const triggers = buildTriggers([...(infoTriggerRows || []), ...(legacyTriggerRows || [])]);

    return {
      ok: true,
      indexes: mergeIndexes(schemaIndexes, legacyIndexes),
      constraints: mergeConstraints(schemaConstraints, legacyConstraints),
      triggers
    };
  };

  const quoteIdentifier = (name) => `\`${String(name || '').replace(/`/g, '``')}\``;
  const buildQualified = (schema, name) => {
    if (!schema) return quoteIdentifier(name);
    return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
  };

  const getViewDefinition = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const view = payload && (payload.view || payload.name || payload.table) ? (payload.view || payload.name || payload.table) : '';
    if (!schema) return { ok: false, error: 'Invalid schema.' };
    if (!view) return { ok: false, error: 'Invalid view.' };
    const qualified = buildQualified(schema, view);
    try {
      const [rows] = await client.query(`SHOW CREATE VIEW ${qualified}`);
      const row = rows && rows[0] ? rows[0] : null;
      if (row) {
        const key = Object.keys(row).find((k) => k.toLowerCase() === 'create view');
        const sql = key ? row[key] : null;
        if (sql) return { ok: true, sql };
      }
    } catch (_) {
      // fallback to information_schema
    }
    try {
      const [rows] = await client.query(
        'SELECT view_definition FROM information_schema.views WHERE table_schema = ? AND table_name = ?',
        [schema, view]
      );
      const row = rows && rows[0] ? rows[0] : null;
      const definition = row && (row.view_definition || row.VIEW_DEFINITION) ? (row.view_definition || row.VIEW_DEFINITION) : '';
      if (!definition) return { ok: false, error: 'View definition not found.' };
      const sql = `CREATE OR REPLACE VIEW ${qualified} AS\n${definition};`;
      return { ok: true, sql };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to load view definition.';
      return { ok: false, error: message };
    }
  };

  const getTableDefinition = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const table = payload && (payload.table || payload.name) ? (payload.table || payload.name) : '';
    if (!schema) return { ok: false, error: 'Invalid schema.' };
    if (!table) return { ok: false, error: 'Invalid table.' };
    const qualified = buildQualified(schema, table);
    try {
      const [rows] = await client.query(`SHOW CREATE TABLE ${qualified}`);
      const row = rows && rows[0] ? rows[0] : null;
      if (row) {
        const key = Object.keys(row).find((k) => k.toLowerCase() === 'create table');
        const sql = key ? row[key] : null;
        if (sql) return { ok: true, sql };
      }
      return { ok: false, error: 'Table definition not found.' };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to load table definition.';
      return { ok: false, error: message };
    }
  };

  const listDatabases = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const [rows] = await client.query('SHOW DATABASES');
    const dbs = rows
      .map((r) => r.Database)
      .filter((name) => !['mysql', 'information_schema', 'performance_schema', 'sys'].includes(name));
    return { ok: true, databases: dbs, current: database || '' };
  };

  const useDatabase = async (name) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    if (!name) return { ok: false, error: 'Invalid database.' };
    const timeouts = resolveConnectionTimeouts(config);
    try {
      await client.changeUser({ database: name });
      await validateConnection(client, timeouts.validationMs);
      if (config && config.readOnly) {
        await client.query('SET SESSION TRANSACTION READ ONLY');
      }
      await applySessionTimezone(client, config ? config.sessionTimezone : undefined);
      database = name;
      if (config) {
        config.database = name;
      }
      return { ok: true };
    } catch (err) {
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to select database.';
      return { ok: false, error: message };
    }
  };

  const setSessionTimezone = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const source = payload && typeof payload === 'object' ? payload : { timezone: payload };
    const requested = source.timezone || source.sessionTimezone || source.value;
    const sessionTimezone = normalizeSessionTimezone(requested);
    try {
      const appliedTimezone = await applySessionTimezone(client, sessionTimezone, { strict: true });
      if (config) config.sessionTimezone = sessionTimezone;
      return { ok: true, applied: true, timezone: sessionTimezone, appliedTimezone };
    } catch (err) {
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to set session timezone.';
      return { ok: false, error: message };
    }
  };

  const runQuery = async (payload) => {
    const input = typeof payload === 'string' ? { sql: payload } : (payload || {});
    const sql = input.sql || '';
    const timeoutMs = Number(input.timeoutMs || 0);
    const applyTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    if (!client) return { ok: false, error: 'Not connected.' };
    if (!sql || !sql.trim()) return { ok: false, error: 'Empty query.' };
    try {
      const statements = splitStatements(sql);
      if (statements.length === 0) return { ok: false, error: 'Empty query.' };
      const threadId = client.threadId || (client.connection && client.connection.threadId);
      currentQuery = { threadId };
      let payloadRows = [];
      let totalRows = 0;
      let lastSelectRows = null;
      let lastSelectTotalRows = 0;
      let affectedRows = undefined;
      let changedRows = undefined;
      for (const statement of statements) {
        const [result] = await client.query({
          sql: statement,
          timeout: applyTimeout ? timeoutMs : undefined
        });
        if (Array.isArray(result)) {
          payloadRows = result;
          totalRows = result.length;
          lastSelectRows = result;
          lastSelectTotalRows = result.length;
          affectedRows = undefined;
          changedRows = undefined;
        } else if (result && typeof result === 'object') {
          payloadRows = [];
          totalRows = 0;
          affectedRows = Number.isFinite(result.affectedRows) ? result.affectedRows : undefined;
          changedRows = Number.isFinite(result.changedRows) ? result.changedRows : undefined;
        } else {
          payloadRows = [];
          totalRows = 0;
          affectedRows = undefined;
          changedRows = undefined;
        }
      }
      currentQuery = null;
      const hasSelect = Array.isArray(lastSelectRows);
      const outputRows = hasSelect ? lastSelectRows : payloadRows;
      const outputTotalRows = hasSelect ? lastSelectTotalRows : totalRows;
      const truncated = outputRows.length > MAX_IPC_ROWS;
      return {
        ok: true,
        rows: truncated ? outputRows.slice(0, MAX_IPC_ROWS) : outputRows,
        totalRows: outputTotalRows,
        truncated,
        affectedRows: hasSelect ? undefined : Number.isFinite(affectedRows) ? affectedRows : undefined,
        changedRows: hasSelect ? undefined : Number.isFinite(changedRows) ? changedRows : undefined
      };
    } catch (err) {
      currentQuery = null;
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to run query.';
      return {
        ok: false,
        error: message,
        code: err && err.code ? String(err.code) : '',
        sqlState: err && err.sqlState ? String(err.sqlState) : '',
        errno: err && Number.isFinite(Number(err.errno)) ? Number(err.errno) : undefined
      };
    }
  };

  const cancelQuery = async () => {
    try {
      if (!client || !currentQuery) return { ok: false, error: 'No query running.' };
      const threadId = currentQuery.threadId;
      if (!threadId) return { ok: false, error: 'Unable to identify the query.' };
      const killer = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database || undefined
      });
      await killer.query(`KILL QUERY ${threadId}`);
      await killer.end();
      return { ok: true };
    } catch (err) {
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to cancel query.';
      return { ok: false, error: message };
    }
  };

  return {
    type: 'mysql',
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
  createMySqlDriver
};
