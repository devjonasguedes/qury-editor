const mysql = require('mysql2/promise');
const { buildIndexes, buildConstraints } = require('./metadata');

const MAX_IPC_ROWS = 5000;

function createMySqlDriver({ createTunnel, closeTunnel } = {}) {
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
    let connectPort = Number(cfg.port || 3306);
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
        database: cfg.database || undefined
      });
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
      return { ok: false, error: err && err.message ? err.message : 'Failed to connect.' };
    }
  };

  const testConnection = async (cfg, sshConfig) => {
    let connectHost = cfg.host;
    let connectPort = Number(cfg.port || 3306);
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
        database: cfg.database || undefined
      });
      await connection.query('SELECT 1');
      await connection.end();
      connection = null;
      return { ok: true };
    } catch (err) {
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to test connection.';
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
    if (database) {
      const [rows] = await client.query(
        "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema = ? ORDER BY table_type, table_name",
        [database]
      );
      return { ok: true, rows };
    }
    const [rows] = await client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows };
  };

  const listRoutines = async () => {
    if (!client) return { ok: false, error: 'Not connected.' };
    if (database) {
      const [rows] = await client.query(
        "SELECT routine_schema, routine_name, routine_type FROM information_schema.routines WHERE routine_schema = ? ORDER BY routine_type, routine_name",
        [database]
      );
      return { ok: true, rows };
    }
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
    const [rows] = await client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
      [schema, table]
    );
    return { ok: true, columns: rows };
  };

  const listTableInfo = async (payload) => {
    if (!client) return { ok: false, error: 'Not connected.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Invalid table.' };
    try {
      const [indexRows] = await client.query(
        'SELECT index_name, non_unique, seq_in_index, column_name, index_type FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? ORDER BY index_name, seq_in_index',
        [schema, table]
      );
      const [constraintRows] = await client.query(
        'SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, kcu.referenced_table_schema, kcu.referenced_table_name, kcu.referenced_column_name FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_schema = kcu.constraint_schema AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name AND tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = ? AND tc.table_name = ? ORDER BY tc.constraint_name, kcu.ordinal_position',
        [schema, table]
      );
      let checkRows = [];
      try {
        const [rows] = await client.query(
          'SELECT cc.constraint_name, cc.check_clause FROM information_schema.check_constraints cc JOIN information_schema.table_constraints tc ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name WHERE tc.table_schema = ? AND tc.table_name = ? AND tc.constraint_type = \'CHECK\'',
          [schema, table]
        );
        checkRows = rows;
      } catch (_) {
        checkRows = [];
      }
      return { ok: true, indexes: buildIndexes(indexRows), constraints: buildConstraints(constraintRows, checkRows) };
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to list table info.';
      return { ok: false, error: message };
    }
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
    await client.changeUser({ database: name });
    database = name;
    if (config) config.database = name;
    return { ok: true };
  };

  const runQuery = async (payload) => {
    const input = typeof payload === 'string' ? { sql: payload } : (payload || {});
    const sql = input.sql || '';
    const timeoutMs = Number(input.timeoutMs || 0);
    const applyTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    if (!client) return { ok: false, error: 'Not connected.' };
    if (!sql || !sql.trim()) return { ok: false, error: 'Empty query.' };
    try {
      const threadId = client.threadId || (client.connection && client.connection.threadId);
      currentQuery = { threadId };
      const [rows] = await client.query({
        sql,
        timeout: applyTimeout ? timeoutMs : undefined
      });
      currentQuery = null;
      let payloadRows = rows;
      let affectedRows = null;
      let changedRows = null;
      if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
        payloadRows = rows[rows.length - 1];
      } else if (Array.isArray(rows) && rows.length > 0) {
        const packet = rows.slice().reverse().find((item) => item && item.affectedRows !== undefined);
        const changed = rows.slice().reverse().find((item) => item && item.changedRows !== undefined);
        if (packet || changed) {
          if (packet) affectedRows = packet.affectedRows;
          if (changed) changedRows = changed.changedRows;
          payloadRows = [];
        }
      } else if (rows && rows.affectedRows !== undefined) {
        affectedRows = rows.affectedRows;
        if (rows && rows.changedRows !== undefined) changedRows = rows.changedRows;
      }
      const arr = payloadRows || [];
      const truncated = arr.length > MAX_IPC_ROWS;
      return {
        ok: true,
        rows: truncated ? arr.slice(0, MAX_IPC_ROWS) : arr,
        totalRows: arr.length,
        truncated,
        affectedRows: Number.isFinite(affectedRows) ? affectedRows : undefined,
        changedRows: Number.isFinite(changedRows) ? changedRows : undefined
      };
    } catch (err) {
      currentQuery = null;
      const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Failed to run query.';
      return { ok: false, error: message };
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
    runQuery,
    cancelQuery
  };
}

module.exports = {
  createMySqlDriver
};
