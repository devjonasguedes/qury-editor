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
    } else if (current.type === 'postgres') {
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
    current = { type, client, database: config.database || '' };
    return { ok: true };
  }

  if (type === 'postgres') {
    const client = new Client({
      host: config.host,
      port: Number(config.port || 5432),
      user: config.user,
      password: config.password,
      database: config.database || undefined
    });
    await client.connect();
    current = { type, client, database: config.database || '' };
    return { ok: true };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
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

  if (current.type === 'postgres') {
    const res = await current.client.query(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_type, table_name"
    );
    return { ok: true, rows: res.rows };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
});

ipcMain.handle('db:runQuery', async (_evt, sql) => {
  if (!current) return { ok: false, error: 'Não conectado.' };
  if (!sql || !sql.trim()) return { ok: false, error: 'Query vazia.' };

  if (current.type === 'mysql') {
    const [rows] = await current.client.query(sql);
    return { ok: true, rows };
  }

  if (current.type === 'postgres') {
    const res = await current.client.query(sql);
    return { ok: true, rows: res.rows };
  }

  return { ok: false, error: 'Tipo de banco não suportado.' };
});

ipcMain.handle('dialog:error', async (_evt, message) => {
  if (mainWindow) {
    dialog.showErrorBox('Erro', message || 'Erro desconhecido');
  }
});
