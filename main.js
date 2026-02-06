const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { Client } = require('pg');

let mainWindow = null;
let current = null; // { type, client }

const connectionsFile = () => path.join(app.getPath('userData'), 'connections.json');

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
  return readSavedConnections();
});

ipcMain.handle('connections:save', async (_evt, entry) => {
  const list = readSavedConnections();
  const filtered = list.filter((c) => c.name !== entry.name);
  filtered.push(entry);
  writeSavedConnections(filtered);
  return filtered;
});

ipcMain.handle('connections:delete', async (_evt, name) => {
  const list = readSavedConnections().filter((c) => c.name !== name);
  writeSavedConnections(list);
  return list;
});

ipcMain.handle('db:connect', async (_evt, config) => {
  try {
    await disconnect();
    const type = config.type;

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
