const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const initSqlJs = require('sql.js');

let mainWindow = null;
let current = null; // { type, client }
let db = null;
let dbPromise = null;

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
      (name, type, host, port, user, password, database, read_only, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of byName.values()) {
    const readOnly = item.read_only || item.readOnly ? 1 : 0;
    stmt.run([
      item.name,
      item.type,
      item.host || '',
      item.port || '',
      item.user || '',
      item.password || '',
      item.database || '',
      readOnly,
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

async function listConnections() {
  const dbInstance = await initDb();
  const res = dbInstance.exec(
    'SELECT name, type, host, port, user, password, database, read_only FROM connections ORDER BY name'
  );
  return rowsFromExec(res);
}

async function saveConnection(entry) {
  const dbInstance = await initDb();
  const now = Date.now();
  const stmt = dbInstance.prepare(`
    INSERT INTO connections
      (name, type, host, port, user, password, database, read_only, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      type = excluded.type,
      host = excluded.host,
      port = excluded.port,
      user = excluded.user,
      password = excluded.password,
      database = excluded.database,
      read_only = excluded.read_only,
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
  if (!current) return;
  try {
    if (current.type === 'mysql') {
      await current.client.end();
    } else if (current.type === 'postgresql') {
      await current.client.end();
    }
  } finally {
    current = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
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

    if (type === 'mysql') {
    const client = await mysql.createConnection({
      host: config.host,
      port: Number(config.port || 3306),
      user: config.user,
      password: config.password,
      database: config.database || undefined
    });
      let dbName = config.database || '';
      if (!dbName) {
        const [rows] = await client.query('SELECT DATABASE() AS db');
        dbName = rows && rows[0] && rows[0].db ? rows[0].db : '';
      }
    current = { type, client, database: dbName, config: { host: config.host, port: Number(config.port || 3306), user: config.user, password: config.password } };
    return { ok: true };
    }

    if (type === 'postgresql') {
      const client = new Client({
        host: config.host,
        port: Number(config.port || 5432),
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
    current = { type, client, database: dbName, config: { host: config.host, port: Number(config.port || 5432), user: config.user, password: config.password } };
    return { ok: true };
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
    if (type === 'mysql') {
      const client = await mysql.createConnection({
        host: config.host,
        port: Number(config.port || 3306),
        user: config.user,
        password: config.password,
        database: config.database || undefined
      });
      await client.query('SELECT 1');
      await client.end();
      return { ok: true };
    }

    if (type === 'postgres') {
      const database = config.database || config.user || 'postgres';
      const client = new Client({
        host: config.host,
        port: Number(config.port || 5432),
        user: config.user,
        password: config.password,
        database
      });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return { ok: true };
    }

    return { ok: false, error: 'Tipo de banco não suportado.' };
  } catch (err) {
    const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Erro ao testar conexão.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('db:runQuery', async (_evt, sql) => {
  const MAX_IPC_ROWS = 5000;
  try {
    if (!current) return { ok: false, error: 'Não conectado.' };
    if (!sql || !sql.trim()) return { ok: false, error: 'Query vazia.' };

    if (current.type === 'mysql') {
      const [rows] = await current.client.query(sql);
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
      const res = await current.client.query(sql);
      const arr = res.rows || [];
      const truncated = arr.length > MAX_IPC_ROWS;
      return { ok: true, rows: truncated ? arr.slice(0, MAX_IPC_ROWS) : arr, totalRows: arr.length, truncated };
    }

    return { ok: false, error: 'Tipo de banco não suportado.' };
  } catch (err) {
    const message = err && (err.sqlMessage || err.message) ? (err.sqlMessage || err.message) : 'Erro ao executar query.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('dialog:error', async (_evt, message) => {
  console.log('[main] dialog:error called with:', message);
  if (mainWindow) {
    dialog.showErrorBox('Erro', message || 'Erro desconhecido');
  }
});
