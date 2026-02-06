const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { Client: SshClient } = require('ssh2');
const initSqlJs = require('sql.js');

let mainWindow = null;
let current = null; // { type, client }
let db = null;
let dbPromise = null;
let currentQuery = null;
let currentTunnel = null;

function dataDir() {
  if (app.isPackaged) return app.getPath('userData');
  return path.join(__dirname, '..', 'data');
}

const connectionsFile = () => path.join(dataDir(), 'connections.json');
const connectionsDb = () => path.join(dataDir(), 'connections.db');

function readSavedConnections() {
  try {
    const raw = fs.readFileSync(connectionsFile(), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeSavedConnections(list) {
  fs.mkdirSync(path.dirname(connectionsFile()), { recursive: true });
  fs.writeFileSync(connectionsFile(), JSON.stringify(list, null, 2), 'utf8');
}

async function initDb() {
  if (db) return db;
  if (!dbPromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    dbPromise = initSqlJs({
      locateFile: (file) => {
        if (file === 'sql-wasm.wasm') return wasmPath;
        return file;
      }
    }).then((SQL) => {
      const filePath = connectionsDb();
      let instance = null;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        instance = new SQL.Database(new Uint8Array(data));
      } else {
        instance = new SQL.Database();
      }
      instance.run(`
        CREATE TABLE IF NOT EXISTS connections (
          name TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          host TEXT,
          port TEXT,
          user TEXT,
          password TEXT,
          database TEXT,
          read_only INTEGER DEFAULT 0,
          ssh_enabled INTEGER DEFAULT 0,
          ssh_host TEXT,
          ssh_port TEXT,
          ssh_user TEXT,
          ssh_password TEXT,
          ssh_private_key TEXT,
          ssh_passphrase TEXT,
          ssh_local_port TEXT,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);
      ensureConnectionsSchema(instance);
      migrateConnectionsIfNeeded(instance);
      return instance;
    });
  }
  db = await dbPromise;
  return db;
}

function ensureConnectionsSchema(dbInstance) {
  let changed = false;
  try {
    const res = dbInstance.exec('PRAGMA table_info(connections)');
    const cols = res && res[0] && res[0].values ? res[0].values.map((row) => row[1]) : [];
    if (!cols.includes('read_only')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN read_only INTEGER DEFAULT 0');
      changed = true;
    }
    if (!cols.includes('ssh_enabled')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_enabled INTEGER DEFAULT 0');
      changed = true;
    }
    if (!cols.includes('ssh_host')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_host TEXT');
      changed = true;
    }
    if (!cols.includes('ssh_port')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_port TEXT');
      changed = true;
    }
    if (!cols.includes('ssh_user')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_user TEXT');
      changed = true;
    }
    if (!cols.includes('ssh_password')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_password TEXT');
      changed = true;
    }
    if (!cols.includes('ssh_private_key')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_private_key TEXT');
      changed = true;
    }
    if (!cols.includes('ssh_passphrase')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_passphrase TEXT');
      changed = true;
    }
    if (!cols.includes('ssh_local_port')) {
      dbInstance.run('ALTER TABLE connections ADD COLUMN ssh_local_port TEXT');
      changed = true;
    }
  } catch (err) {
    console.error('Failed to ensure connections schema:', err);
  }
  if (changed) {
    persistDb(dbInstance);
  }
}

function migrateConnectionsIfNeeded(dbInstance) {
  const count = getScalar(dbInstance, 'SELECT COUNT(*) AS count FROM connections');
  if (count > 0) return;
  const list = readSavedConnections();
  if (!list || list.length === 0) return;
  const now = Date.now();
  const byName = new Map();
  list.forEach((item) => {
    if (!item || !item.name) return;
    byName.set(item.name, item);
  });
  const stmt = dbInstance.prepare(`
    INSERT OR REPLACE INTO connections
      (name, type, host, port, user, password, database, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of byName.values()) {
    const readOnly = item.read_only || item.readOnly ? 1 : 0;
    const sshEnabled = item.ssh_enabled || (item.ssh && item.ssh.enabled) || item.sshEnabled ? 1 : 0;
    stmt.run([
      item.name,
      item.type,
      item.host || '',
      item.port || '',
      item.user || '',
      item.password || '',
      item.database || '',
      readOnly,
      sshEnabled,
      item.ssh_host || (item.ssh && item.ssh.host) || '',
      item.ssh_port || (item.ssh && item.ssh.port) || '',
      item.ssh_user || (item.ssh && item.ssh.user) || '',
      item.ssh_password || (item.ssh && item.ssh.password) || '',
      item.ssh_private_key || (item.ssh && item.ssh.privateKey) || '',
      item.ssh_passphrase || (item.ssh && item.ssh.passphrase) || '',
      item.ssh_local_port || (item.ssh && item.ssh.localPort) || '',
      now,
      now
    ]);
  }
  stmt.free();
  persistDb(dbInstance);
}

function getScalar(dbInstance, sql) {
  const stmt = dbInstance.prepare(sql);
  const row = stmt.getAsObject();
  stmt.free();
  return row && row.count ? row.count : 0;
}

function rowsFromExec(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

function persistDb(dbInstance) {
  const data = dbInstance.export();
  fs.mkdirSync(path.dirname(connectionsDb()), { recursive: true });
  fs.writeFileSync(connectionsDb(), Buffer.from(data));
}

function normalizeSshConfig(ssh) {
  if (!ssh || !ssh.enabled) return null;
  const host = ssh.host || '';
  const username = ssh.user || '';
  if (!host || !username) {
    throw new Error('SSH host e usuário são obrigatórios.');
  }
  return {
    host,
    port: Number(ssh.port || 22),
    username,
    password: ssh.password || undefined,
    privateKey: ssh.privateKey || undefined,
    passphrase: ssh.passphrase || undefined,
    localPort: ssh.localPort ? Number(ssh.localPort) : 0
  };
}

function createSshTunnel(sshConfig, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const client = new SshClient();
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        client.end();
      } catch (_) {}
      reject(err);
    };

    client
      .on('ready', () => {
        const server = net.createServer((socket) => {
          client.forwardOut(
            socket.remoteAddress || '127.0.0.1',
            socket.remotePort || 0,
            targetHost,
            targetPort,
            (err, stream) => {
              if (err) {
                socket.destroy();
                return;
              }
              socket.pipe(stream).pipe(socket);
            }
          );
        });

        server.on('error', fail);
        server.listen(sshConfig.localPort || 0, '127.0.0.1', () => {
          if (settled) return;
          settled = true;
          const address = server.address();
          resolve({
            client,
            server,
            localHost: '127.0.0.1',
            localPort: address && address.port ? address.port : sshConfig.localPort || 0
          });
        });
      })
      .on('error', fail)
      .connect({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        password: sshConfig.password,
        privateKey: sshConfig.privateKey,
        passphrase: sshConfig.passphrase
      });
  });
}

function closeTunnel(tunnel) {
  if (!tunnel) return;
  try {
    tunnel.server.close();
  } catch (_) {}
  try {
    tunnel.client.end();
  } catch (_) {}
}

async function listConnections() {
  const dbInstance = await initDb();
  const res = dbInstance.exec(
    'SELECT name, type, host, port, user, password, database, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port FROM connections ORDER BY name'
  );
  return rowsFromExec(res);
}

async function saveConnection(entry) {
  const dbInstance = await initDb();
  const now = Date.now();
  const stmt = dbInstance.prepare(`
    INSERT INTO connections
      (name, type, host, port, user, password, database, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      type = excluded.type,
      host = excluded.host,
      port = excluded.port,
      user = excluded.user,
      password = excluded.password,
      database = excluded.database,
      read_only = excluded.read_only,
      ssh_enabled = excluded.ssh_enabled,
      ssh_host = excluded.ssh_host,
      ssh_port = excluded.ssh_port,
      ssh_user = excluded.ssh_user,
      ssh_password = excluded.ssh_password,
      ssh_private_key = excluded.ssh_private_key,
      ssh_passphrase = excluded.ssh_passphrase,
      ssh_local_port = excluded.ssh_local_port,
      updated_at = excluded.updated_at
  `);
  stmt.run([
    entry.name,
    entry.type,
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.password || '',
    entry.database || '',
    entry.read_only ? 1 : 0,
    entry.ssh_enabled ? 1 : 0,
    entry.ssh_host || '',
    entry.ssh_port || '',
    entry.ssh_user || '',
    entry.ssh_password || '',
    entry.ssh_private_key || '',
    entry.ssh_passphrase || '',
    entry.ssh_local_port || '',
    now,
    now
  ]);
  stmt.free();
  persistDb(dbInstance);
  return listConnections();
}

async function deleteConnection(name) {
  const dbInstance = await initDb();
  const stmt = dbInstance.prepare('DELETE FROM connections WHERE name = ?');
  stmt.run([name]);
  stmt.free();
  persistDb(dbInstance);
  return listConnections();
}

async function disconnect() {
  try {
    if (current) {
      if (current.type === 'mysql') {
        await current.client.end();
      } else if (current.type === 'postgresql') {
        await current.client.end();
      }
    }
  } finally {
    current = null;
    if (currentTunnel) {
      closeTunnel(currentTunnel);
      currentTunnel = null;
    }
  }
}

function createWindow() {
  const preloadCandidates = [
    process.env.ELECTRON_PRELOAD,
    path.join(__dirname, '../preload/index.js'),
    path.join(__dirname, 'preload.js')
  ].filter(Boolean);
  const resolvedPreload = preloadCandidates.find((candidate) => fs.existsSync(candidate));
  if (!resolvedPreload) {
    console.error(
      'Preload script not found. Tried:',
      preloadCandidates.join(', ')
    );
  }
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: resolvedPreload,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  const rendererIndex = path.join(__dirname, '../renderer/index.html');
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else if (fs.existsSync(rendererIndex)) {
    mainWindow.loadFile(rendererIndex);
  } else {
    dialog.showErrorBox(
      'Build não encontrado',
      'Execute "npm run build" antes de rodar em produção, ou use "npm run dev" no desenvolvimento.'
    );
  }
}

app.whenReady().then(createWindow);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.on('before-quit', () => {
  disconnect();
  db = null;
  dbPromise = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('connections:list', async () => {
  return listConnections();
});

ipcMain.handle('connections:save', async (_evt, entry) => {
  return saveConnection(entry);
});

ipcMain.handle('connections:delete', async (_evt, name) => {
  return deleteConnection(name);
});

ipcMain.handle('db:connect', async (_evt, config) => {
  try {
    await disconnect();
    const type = config.type === 'postgres' ? 'postgresql' : config.type;
    const sshConfig = normalizeSshConfig(config.ssh);

    if (type === 'mysql') {
    let connectHost = config.host;
    let connectPort = Number(config.port || 3306);
    let tunnel = null;
    try {
      if (sshConfig) {
        tunnel = await createSshTunnel(sshConfig, connectHost, connectPort);
        connectHost = tunnel.localHost;
        connectPort = tunnel.localPort;
      }
      const client = await mysql.createConnection({
        host: connectHost,
        port: connectPort,
        user: config.user,
        password: config.password,
        database: config.database || undefined
      });
      let dbName = config.database || '';
      if (!dbName) {
        const [rows] = await client.query('SELECT DATABASE() AS db');
        dbName = rows && rows[0] && rows[0].db ? rows[0].db : '';
      }
      currentTunnel = tunnel;
      current = { type, client, database: dbName, config: { host: connectHost, port: connectPort, user: config.user, password: config.password, database: config.database || undefined } };
      return { ok: true };
    } catch (err) {
      if (tunnel) closeTunnel(tunnel);
      throw err;
    }
    }

    if (type === 'postgresql') {
      let connectHost = config.host;
      let connectPort = Number(config.port || 5432);
      let tunnel = null;
      try {
        if (sshConfig) {
          tunnel = await createSshTunnel(sshConfig, connectHost, connectPort);
          connectHost = tunnel.localHost;
          connectPort = tunnel.localPort;
        }
        const client = new Client({
          host: connectHost,
          port: connectPort,
          user: config.user,
          password: config.password,
          database: config.database || undefined
        });
        await client.connect();
        let dbName = config.database || '';
        if (!dbName) {
          const res = await client.query('SELECT current_database() AS db');
          dbName = res && res.rows && res.rows[0] && res.rows[0].db ? res.rows[0].db : '';
        }
        currentTunnel = tunnel;
        current = { type, client, database: dbName, config: { host: connectHost, port: connectPort, user: config.user, password: config.password, database: config.database || undefined } };
        return { ok: true };
      } catch (err) {
        if (tunnel) closeTunnel(tunnel);
        throw err;
      }
    }

    return { ok: false, error: 'Tipo de banco não suportado.' };
  } catch (err) {
    const message = err && err.message ? err.message : 'Erro ao conectar.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('db:disconnect', async () => {
  await disconnect();
  return { ok: true };
});

ipcMain.handle('db:listTables', async () => {
  if (!current) return { ok: false, error: 'Não conectado.' };

  if (current.type === 'mysql') {
    if (current.database) {
      const [rows] = await current.client.query(
        "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema = ? ORDER BY table_type, table_name",
        [current.database]
      );
      return { ok: true, rows };
    }

    const [rows] = await current.client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows };
  }

  if (current.type === 'postgresql') {
    const res = await current.client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows: res.rows };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
});

ipcMain.handle('db:listColumns', async (_evt, payload) => {
  if (!current) return { ok: false, error: 'Não conectado.' };
  const schema = payload && payload.schema ? payload.schema : current.database || '';
  const table = payload && payload.table ? payload.table : '';
  if (!table) return { ok: false, error: 'Tabela inválida.' };

  if (current.type === 'mysql') {
    const [rows] = await current.client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
      [schema, table]
    );
    return { ok: true, columns: rows };
  }

  if (current.type === 'postgresql' || current.type === 'postgres') {
    const res = await current.client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, table]
    );
    return { ok: true, columns: res.rows || [] };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
});

ipcMain.handle('db:listDatabases', async () => {
  if (!current) return { ok: false, error: 'Não conectado.' };

  if (current.type === 'mysql') {
    const [rows] = await current.client.query('SHOW DATABASES');
    const dbs = rows
      .map((r) => r.Database)
      .filter((name) => !['mysql', 'information_schema', 'performance_schema', 'sys'].includes(name));
    return { ok: true, databases: dbs, current: current.database || '' };
  }

  if (current.type === 'postgresql') {
    const res = await current.client.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
    );
    const dbs = res.rows.map((r) => r.datname);
    return { ok: true, databases: dbs, current: current.database || '' };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
});

ipcMain.handle('db:useDatabase', async (_evt, name) => {
  if (!current) return { ok: false, error: 'Não conectado.' };
  if (!name) return { ok: false, error: 'Database inválido.' };

  if (current.type === 'mysql') {
    await current.client.changeUser({ database: name });
    current.database = name;
    return { ok: true };
  }

  if (current.type === 'postgresql') {
    const cfg = current.config || current.client.connectionParameters || {};
    const client = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: name
    });
    await client.connect();
    await current.client.end();
    current.client = client;
    current.database = name;
    return { ok: true };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
});

ipcMain.handle('db:testConnection', async (_evt, config) => {
  try {
    const type = config.type;
    const sshConfig = normalizeSshConfig(config.ssh);
    if (type === 'mysql') {
      let connectHost = config.host;
      let connectPort = Number(config.port || 3306);
      let tunnel = null;
      try {
        if (sshConfig) {
          tunnel = await createSshTunnel(sshConfig, connectHost, connectPort);
          connectHost = tunnel.localHost;
          connectPort = tunnel.localPort;
        }
        const client = await mysql.createConnection({
          host: connectHost,
          port: connectPort,
          user: config.user,
          password: config.password,
          database: config.database || undefined
        });
        await client.query('SELECT 1');
        await client.end();
      } finally {
        if (tunnel) closeTunnel(tunnel);
      }
      return { ok: true };
    }

    if (type === 'postgres') {
      const database = config.database || config.user || 'postgres';
      let connectHost = config.host;
      let connectPort = Number(config.port || 5432);
      let tunnel = null;
      try {
        if (sshConfig) {
          tunnel = await createSshTunnel(sshConfig, connectHost, connectPort);
          connectHost = tunnel.localHost;
          connectPort = tunnel.localPort;
        }
        const client = new Client({
          host: connectHost,
          port: connectPort,
          user: config.user,
          password: config.password,
          database
        });
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
      } finally {
        if (tunnel) closeTunnel(tunnel);
      }
      return { ok: true };
    }

    return { ok: false, error: 'Tipo de banco não suportado.' };
  } catch (err) {
    const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Erro ao testar conexão.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('db:runQuery', async (_evt, payload) => {
  const MAX_IPC_ROWS = 5000;
  const input = typeof payload === 'string' ? { sql: payload } : (payload || {});
  const sql = input.sql || '';
  const timeoutMs = Number(input.timeoutMs || 0);
  const applyTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  try {
    if (!current) return { ok: false, error: 'Não conectado.' };
    if (!sql || !sql.trim()) return { ok: false, error: 'Query vazia.' };

    if (current.type === 'mysql') {
      const threadId = current.client.threadId || (current.client.connection && current.client.connection.threadId);
      currentQuery = { type: 'mysql', threadId };
      const [rows] = await current.client.query({
        sql,
        timeout: applyTimeout ? timeoutMs : undefined
      });
      currentQuery = null;
      let payload = rows;
      if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
        payload = rows[rows.length - 1];
      } else if (Array.isArray(rows) && rows.length > 0 && rows[0] && rows[0].affectedRows !== undefined) {
        payload = [];
      }
      const arr = payload || [];
      const truncated = arr.length > MAX_IPC_ROWS;
      return { ok: true, rows: truncated ? arr.slice(0, MAX_IPC_ROWS) : arr, totalRows: arr.length, truncated };
    }

    if (current.type === 'postgresql') {
      currentQuery = { type: 'postgresql', pid: current.client.processID };
      try {
        if (applyTimeout) {
          await current.client.query('SET statement_timeout = $1', [timeoutMs]);
        }
        const res = await current.client.query(sql);
        const arr = res.rows || [];
        const truncated = arr.length > MAX_IPC_ROWS;
        return { ok: true, rows: truncated ? arr.slice(0, MAX_IPC_ROWS) : arr, totalRows: arr.length, truncated };
      } finally {
        if (applyTimeout) {
          try {
            await current.client.query('SET statement_timeout = 0');
          } catch (_) {
            // ignore
          }
        }
        currentQuery = null;
      }
    }

    return { ok: false, error: 'Tipo de banco não suportado.' };
  } catch (err) {
    currentQuery = null;
    const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Erro ao executar query.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('db:cancelQuery', async () => {
  try {
    if (!current || !currentQuery) return { ok: false, error: 'Nenhuma query em execução.' };

    if (currentQuery.type === 'mysql') {
      const threadId = currentQuery.threadId;
      if (!threadId) return { ok: false, error: 'Não foi possível identificar a query.' };
      const killer = await mysql.createConnection({
        host: current.config.host,
        port: current.config.port,
        user: current.config.user,
        password: current.config.password,
        database: current.config.database || undefined
      });
      await killer.query(`KILL QUERY ${threadId}`);
      await killer.end();
      return { ok: true };
    }

    if (currentQuery.type === 'postgresql') {
      const pid = currentQuery.pid;
      if (!pid) return { ok: false, error: 'Não foi possível identificar a query.' };
      const killer = new Client({
        host: current.config.host,
        port: current.config.port,
        user: current.config.user,
        password: current.config.password,
        database: current.config.database || undefined
      });
      await killer.connect();
      await killer.query('SELECT pg_cancel_backend($1)', [pid]);
      await killer.end();
      return { ok: true };
    }

    return { ok: false, error: 'Tipo de banco não suportado.' };
  } catch (err) {
    const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Erro ao cancelar query.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('dialog:error', async (_evt, message) => {
  console.log('[main] dialog:error called with:', message);
  if (mainWindow) {
    dialog.showErrorBox('Erro', message || 'Erro desconhecido');
  }
});
