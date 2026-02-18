const { Client } = require('pg');
const { buildIndexes, buildConstraints, buildTriggers } = require('./metadata');

const MAX_IPC_ROWS = 5000;
const DEFAULT_SESSION_TIMEZONE = 'UTC';
const DEFAULT_CONNECTION_OPEN_TIMEOUT_MS = 10000;
const DEFAULT_CONNECTION_CLOSE_TIMEOUT_MS = 5000;
const DEFAULT_CONNECTION_VALIDATION_TIMEOUT_MS = 10000;
const isReadOnlyConfig = (cfg) => !!(cfg && (cfg.readOnly || cfg.read_only));
const normalizeSessionTimezone = (value) => String(value || '').trim() || DEFAULT_SESSION_TIMEZONE;
const normalizeTimeoutMs = (value, fallback) => {
  const normalizedFallback = Math.max(0, Number(fallback) || 0);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return normalizedFallback;
  return Math.floor(parsed);
};

function createPostgresDriver({ createTunnel, closeTunnel } = {}) {
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

  const forceCloseConnection = (connection) => {
    const stream = connection && connection.connection && connection.connection.stream;
    if (stream && typeof stream.destroy === 'function') {
      try {
        stream.destroy();
      } catch (_) {
        // best effort
      }
    }
  };

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
      forceCloseConnection(connection);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const validateConnection = async (connection, timeoutMs) => {
    const timeout = normalizeTimeoutMs(timeoutMs, DEFAULT_CONNECTION_VALIDATION_TIMEOUT_MS);
    if (timeout <= 0) {
      await connection.query('SELECT 1');
      return;
    }
    let timer = null;
    try {
      await Promise.race([
        connection.query('SELECT 1'),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Connection validation timeout after ${timeout}ms.`));
          }, timeout);
        })
      ]);
    } catch (err) {
      forceCloseConnection(connection);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const applySessionTimezone = async (connection, value, { strict = false } = {}) => {
    const timezone = normalizeSessionTimezone(value);
    try {
      await connection.query("SELECT set_config('TIMEZONE', $1, false)", [timezone]);
      return timezone;
    } catch (err) {
      if (strict || timezone === DEFAULT_SESSION_TIMEZONE) throw err;
      await connection.query("SELECT set_config('TIMEZONE', $1, false)", [DEFAULT_SESSION_TIMEZONE]);
      return DEFAULT_SESSION_TIMEZONE;
    }
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
      if (tunnel && closeTunnel) {
        try {
          await closeTunnel(tunnel);
        } catch (_) {
          // ignore
        }
      }
      tunnel = null;
    }
  };

  const connect = async (cfg, sshConfig) => {
    let connectHost = cfg.host;
    let connectPort = Number(cfg.port || 5432);
    const timeouts = resolveConnectionTimeouts(cfg);
    let createdTunnel = null;
    let connection = null;
    try {
      if (sshConfig && createTunnel) {
        createdTunnel = await createTunnel(sshConfig, connectHost, connectPort);
        connectHost = createdTunnel.localHost;
        connectPort = createdTunnel.localPort;
      }
      connection = new Client({
        host: connectHost,
        port: connectPort,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database || undefined,
        connectionTimeoutMillis: timeouts.openMs > 0 ? timeouts.openMs : undefined
      });
      await connection.connect();
      await validateConnection(connection, timeouts.validationMs);
      if (isReadOnlyConfig(cfg)) {
        await connection.query('SET default_transaction_read_only = on');
      }
      const sessionTimezone = await applySessionTimezone(connection, cfg.sessionTimezone);
      let dbName = cfg.database || '';
      if (!dbName) {
        const res = await connection.query('SELECT current_database() AS db');
        dbName = res && res.rows && res.rows[0] && res.rows[0].db ? res.rows[0].db : '';
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
      if (createdTunnel && closeTunnel) {
        try {
          await closeTunnel(createdTunnel);
        } catch (_) {
          // ignore
        }
      }
      const message = err && err.message ? err.message : 'Failed to connect.';
      return { ok: false, error: message };
    }
  };

  const testConnection = async (cfg, sshConfig) => {
    const databaseName = cfg.database || cfg.user || 'postgres';
    let connectHost = cfg.host;
    let connectPort = Number(cfg.port || 5432);
    const timeouts = resolveConnectionTimeouts(cfg);
    let testTunnel = null;
    let connection = null;
    try {
      if (sshConfig && createTunnel) {
        testTunnel = await createTunnel(sshConfig, connectHost, connectPort);
        connectHost = testTunnel.localHost;
        connectPort = testTunnel.localPort;
      }
      connection = new Client({
        host: connectHost,
        port: connectPort,
        user: cfg.user,
        password: cfg.password,
        database: databaseName,
        connectionTimeoutMillis: timeouts.openMs > 0 ? timeouts.openMs : undefined
      });
      await connection.connect();
      await validateConnection(connection, timeouts.validationMs);
      await closeConnection(connection, timeouts.closeMs);
      connection = null;
      return { ok: true };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to test connection.';
      return { ok: false, error: message };
    } finally {
      if (connection) {
        try {
          await closeConnection(connection, timeouts.closeMs);
        } catch (_) {}
      }
      if (testTunnel && closeTunnel) {
        try {
          await closeTunnel(testTunnel);
        } catch (_) {
          // ignore
        }
      }
    }
  };

  const listTables = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const res = await client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows: res.rows };
  };

  const listRoutines = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const res = await client.query(
      "SELECT routine_schema, routine_name, routine_type FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog','information_schema') ORDER BY routine_schema, routine_type, routine_name"
    );
    return { ok: true, rows: res.rows };
  };

  const listColumns = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : 'public';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    const res = await client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, table]
    );
    return { ok: true, columns: res.rows || [] };
  };

  const listTableInfo = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : 'public';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    try {
      const indexRes = await client.query(
        'SELECT i.relname AS index_name, ix.indisunique AS is_unique, ix.indisprimary AS is_primary, am.amname AS index_method, array_agg(a.attname ORDER BY x.n) AS columns FROM pg_class t JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_am am ON i.relam = am.oid JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n) ON true JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum JOIN pg_namespace nsp ON nsp.oid = t.relnamespace WHERE nsp.nspname = $1 AND t.relname = $2 GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname ORDER BY i.relname',
        [schema, table]
      );
      const constraintRes = await client.query(
        'SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_schema AS referenced_table_schema, ccu.table_name AS referenced_table_name, ccu.column_name AS referenced_column_name FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.table_schema = $1 AND tc.table_name = $2 ORDER BY tc.constraint_name, kcu.ordinal_position',
        [schema, table]
      );
      const checkRes = await client.query(
        'SELECT cc.constraint_name, cc.check_clause FROM information_schema.check_constraints cc JOIN information_schema.table_constraints tc ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = \'CHECK\'',
        [schema, table]
      );
      let triggerRows = [];
      try {
        const triggerRes = await client.query(
          'SELECT trigger_name, action_timing, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_schema = $1 AND event_object_table = $2 ORDER BY trigger_name, event_manipulation',
          [schema, table]
        );
        triggerRows = triggerRes.rows || [];
      } catch (_) {
        triggerRows = [];
      }
      return {
        ok: true,
        indexes: buildIndexes(indexRes.rows || []),
        constraints: buildConstraints(constraintRes.rows || [], checkRes.rows || []),
        triggers: buildTriggers(triggerRows)
      };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to list table info.';
      return { ok: false, error: message };
    }
  };

  const quoteIdentifier = (name) => `"${String(name || '').replace(/\"/g, '""')}"`;
  const buildQualified = (schema, name) => {
    if (!schema) return quoteIdentifier(name);
    return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
  };

  const getViewDefinition = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : '';
    const view = payload && (payload.view || payload.name || payload.table) ? (payload.view || payload.name || payload.table) : '';
    const targetSchema = schema || 'public';
    if (!view) return { ok: false, error: 'Invalid view.' };
    try {
      const res = await client.query(
        'SELECT definition FROM pg_views WHERE schemaname = $1 AND viewname = $2',
        [targetSchema, view]
      );
      const row = res && res.rows && res.rows[0] ? res.rows[0] : null;
      const definition = row && row.definition ? row.definition : '';
      if (!definition) return { ok: false, error: 'View definition not found.' };
      const qualified = buildQualified(targetSchema, view);
      const sql = `CREATE OR REPLACE VIEW ${qualified} AS\n${definition};`;
      return { ok: true, sql };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to load view definition.';
      return { ok: false, error: message };
    }
  };

  const getTableDefinition = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : 'public';
    const table = payload && (payload.table || payload.name) ? (payload.table || payload.name) : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    const targetSchema = schema || 'public';
    try {
      const colRes = await client.query(
        'SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null, pg_get_expr(ad.adbin, ad.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relname = $2 AND n.nspname = $1 ORDER BY a.attnum',
        [targetSchema, table]
      );
      const cols = colRes && colRes.rows ? colRes.rows : [];
      if (cols.length === 0) return { ok: false, error: 'Table definition not found.' };

      const constraintRes = await client.query(
        'SELECT con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace WHERE nsp.nspname = $1 AND rel.relname = $2 ORDER BY con.contype, con.conname',
        [targetSchema, table]
      );
      const constraints = constraintRes && constraintRes.rows ? constraintRes.rows : [];

      const columnLines = cols.map((col) => {
        const name = quoteIdentifier(col.column_name);
        const type = col.data_type || '';
        const notNull = col.not_null ? ' NOT NULL' : '';
        const def = col.default_value ? ` DEFAULT ${col.default_value}` : '';
        return `  ${name} ${type}${def}${notNull}`.trimEnd();
      });

      const constraintLines = constraints.map((row) => {
        const cname = quoteIdentifier(row.constraint_name);
        const def = row.definition ? ` ${row.definition}` : '';
        return `  CONSTRAINT ${cname}${def}`.trimEnd();
      });

      const lines = columnLines.concat(constraintLines);
      const qualified = buildQualified(targetSchema, table);
      const sql = `CREATE TABLE ${qualified} (\n${lines.join(',\n')}\n);`;
      return { ok: true, sql };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to load table definition.';
      return { ok: false, error: message };
    }
  };

  const listDatabases = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const res = await client.query(
      'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
    );
    const dbs = res.rows.map((r) => r.datname);
    return { ok: true, databases: dbs, current: database || '' };
  };

  const useDatabase = async (name) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    if (!name) return { ok: false, error: 'Invalid database.' };
    const cfg = config || client.connectionParameters || {};
    const timeouts = resolveConnectionTimeouts(cfg);
    const next = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: name,
      connectionTimeoutMillis: timeouts.openMs > 0 ? timeouts.openMs : undefined
    });
    try {
      await next.connect();
      await validateConnection(next, timeouts.validationMs);
      if (cfg.readOnly) {
        await next.query('SET default_transaction_read_only = on');
      }
      const sessionTimezone = await applySessionTimezone(next, cfg.sessionTimezone);
      try {
        await closeConnection(client, timeouts.closeMs);
      } catch (_) {
        // old connection already force-closed when needed
      }
      client = next;
      database = name;
      config = {
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: name,
        readOnly: !!cfg.readOnly,
        sessionTimezone,
        connectionOpenTimeoutMs: timeouts.openMs,
        connectionCloseTimeoutMs: timeouts.closeMs,
        connectionValidationTimeoutMs: timeouts.validationMs
      };
      return { ok: true };
    } catch (err) {
      try {
        await closeConnection(next, timeouts.closeMs);
      } catch (_) {}
      const message = err && err.message ? err.message : 'Failed to select database.';
      return { ok: false, error: message };
    }
  };

  const setSessionTimezone = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const source = payload && typeof payload === 'object' ? payload : { timezone: payload };
    const requested = source.timezone || source.sessionTimezone || source.value;
    try {
      const timezone = await applySessionTimezone(client, requested, { strict: true });
      if (config) config.sessionTimezone = timezone;
      return { ok: true, applied: true, timezone };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to set session timezone.';
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
    currentQuery = { pid: client.processID };
    try {
      if (applyTimeout) {
        const safeTimeoutMs = Math.max(0, Math.floor(Number(timeoutMs)));
        await client.query(`SET statement_timeout = ${safeTimeoutMs}`);
      }
      const res = await client.query(sql);
      const results = Array.isArray(res) ? res : [res];
      const lastSelect =
        results
          .filter((item) => item && String(item.command || '').toUpperCase() === 'SELECT')
          .pop() || null;
      const lastResult = lastSelect || results[results.length - 1] || {};
      const arr = Array.isArray(lastResult.rows) ? lastResult.rows : [];
      const truncated = arr.length > MAX_IPC_ROWS;
      return {
        ok: true,
        rows: truncated ? arr.slice(0, MAX_IPC_ROWS) : arr,
        totalRows: arr.length,
        truncated,
        affectedRows: lastSelect
          ? undefined
          : Number.isFinite(lastResult.rowCount)
            ? lastResult.rowCount
            : undefined
      };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to run query.';
      return {
        ok: false,
        error: message,
        code: err && err.code ? String(err.code) : '',
        sqlState: err && err.code ? String(err.code) : ''
      };
    } finally {
      if (applyTimeout) {
        try {
          await client.query('SET statement_timeout = 0');
        } catch (_) {
          // ignore
        }
      }
      currentQuery = null;
    }
  };

  const cancelQuery = async () => {
    try {
      if (!client || !currentQuery) return { ok: false, error: 'No query running.' };
      const pid = currentQuery.pid;
      if (!pid) return { ok: false, error: 'Unable to identify the query.' };
      const killer = new Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database || undefined
      });
      await killer.connect();
      await killer.query('SELECT pg_cancel_backend($1)', [pid]);
      await killer.end();
      return { ok: true };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to cancel query.';
      return { ok: false, error: message };
    }
  };

  return {
    type: 'postgresql',
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
  createPostgresDriver
};
