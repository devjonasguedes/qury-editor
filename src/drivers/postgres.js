const { Client } = require('pg');
const { buildIndexes, buildConstraints } = require('./metadata');

const MAX_IPC_ROWS = 5000;

function createPostgresDriver({ createTunnel, closeTunnel } = {}) {
  let client = null;
  let config = null;
  let database = '';
  let tunnel = null;
  let currentQuery = null;

  const disconnect = async () => {
    try {
      if (client) await client.end();
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
    let connectPort = Number(cfg.port || 5432);
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
        database: cfg.database || undefined
      });
      await connection.connect();
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
        database: cfg.database || undefined
      };
      database = dbName;
      tunnel = createdTunnel;
      return { ok: true };
    } catch (err) {
      if (connection) {
        try {
          await connection.end();
        } catch (_) {}
      }
      if (createdTunnel && closeTunnel) closeTunnel(createdTunnel);
      const message = err && err.message ? err.message : 'Failed to connect.';
      return { ok: false, error: message };
    }
  };

  const testConnection = async (cfg, sshConfig) => {
    const databaseName = cfg.database || cfg.user || 'postgres';
    let connectHost = cfg.host;
    let connectPort = Number(cfg.port || 5432);
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
        database: databaseName
      });
      await connection.connect();
      await connection.query('SELECT 1');
      await connection.end();
      connection = null;
      return { ok: true };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to test connection.';
      return { ok: false, error: message };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (_) {}
      }
      if (testTunnel && closeTunnel) closeTunnel(testTunnel);
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
    const schema = payload && payload.schema ? payload.schema : database || '';
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
    const schema = payload && payload.schema ? payload.schema : database || '';
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
      return {
        ok: true,
        indexes: buildIndexes(indexRes.rows || []),
        constraints: buildConstraints(constraintRes.rows || [], checkRes.rows || [])
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
      const sql = `CREATE TABLE ${qualified} (\\n${lines.join(',\\n')}\\n);`;
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
    const next = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: name
    });
    await next.connect();
    await client.end();
    client = next;
    database = name;
    config = { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: name };
    return { ok: true };
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
        await client.query('SET statement_timeout = $1', [timeoutMs]);
      }
      const res = await client.query(sql);
      const arr = res.rows || [];
      const truncated = arr.length > MAX_IPC_ROWS;
      return {
        ok: true,
        rows: truncated ? arr.slice(0, MAX_IPC_ROWS) : arr,
        totalRows: arr.length,
        truncated,
        affectedRows: Number.isFinite(res.rowCount) ? res.rowCount : undefined
      };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to run query.';
      return { ok: false, error: message };
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
    runQuery,
    cancelQuery
  };
}

module.exports = {
  createPostgresDriver
};
