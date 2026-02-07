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
      const message = err && err.message ? err.message : 'Erro ao conectar.';
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
      const message = err && err.message ? err.message : 'Erro ao testar conexao.';
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
    if (!client) return { ok: false, error: 'Nao conectado.' };
    const res = await client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows: res.rows };
  };

  const listRoutines = async () => {
    if (!client) return { ok: false, error: 'Nao conectado.' };
    const res = await client.query(
      "SELECT routine_schema, routine_name, routine_type FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog','information_schema') ORDER BY routine_schema, routine_type, routine_name"
    );
    return { ok: true, rows: res.rows };
  };

  const listColumns = async (payload) => {
    if (!client) return { ok: false, error: 'Nao conectado.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Tabela invalida.' };
    const res = await client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, table]
    );
    return { ok: true, columns: res.rows || [] };
  };

  const listTableInfo = async (payload) => {
    if (!client) return { ok: false, error: 'Nao conectado.' };
    const schema = payload && payload.schema ? payload.schema : database || '';
    const table = payload && payload.table ? payload.table : '';
    if (!table) return { ok: false, error: 'Tabela invalida.' };
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
      const message = err && err.message ? err.message : 'Erro ao listar informacoes.';
      return { ok: false, error: message };
    }
  };

  const listDatabases = async () => {
    if (!client) return { ok: false, error: 'Nao conectado.' };
    const res = await client.query(
      'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
    );
    const dbs = res.rows.map((r) => r.datname);
    return { ok: true, databases: dbs, current: database || '' };
  };

  const useDatabase = async (name) => {
    if (!client) return { ok: false, error: 'Nao conectado.' };
    if (!name) return { ok: false, error: 'Database invalido.' };
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
    if (!client) return { ok: false, error: 'Nao conectado.' };
    if (!sql || !sql.trim()) return { ok: false, error: 'Query vazia.' };
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
      const message = err && err.message ? err.message : 'Erro ao executar query.';
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
      if (!client || !currentQuery) return { ok: false, error: 'Nenhuma query em execucao.' };
      const pid = currentQuery.pid;
      if (!pid) return { ok: false, error: 'Nao foi possivel identificar a query.' };
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
      const message = err && err.message ? err.message : 'Erro ao cancelar query.';
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
    listDatabases,
    useDatabase,
    runQuery,
    cancelQuery
  };
}

module.exports = {
  createPostgresDriver
};
