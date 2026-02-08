const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  nativeTheme,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { Client: SshClient } = require("ssh2");
const initSqlJs = require("sql.js");
const { createDriver } = require("./drivers");

let mainWindow = null;
let currentDriver = null;
let db = null;
let dbPromise = null;
let windowStateSaveTimer = null;

app.setName("Qury Editor");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function dataDir() {
  if (app.isPackaged) return app.getPath("userData");
  return path.join(__dirname, "..", "data");
}

const connectionsFile = () => path.join(dataDir(), "connections.json");
const connectionsDb = () => path.join(dataDir(), "connections.db");
const windowStateFile = () => path.join(dataDir(), "window-state.json");

const SECRET_PREFIX = "safe:";
const SECRET_FIELDS = [
  "password",
  "ssh_password",
  "ssh_private_key",
  "ssh_passphrase",
];
const DEFAULT_WINDOW_SIZE = { width: 1200, height: 900 };
const MIN_WINDOW_SIZE = { width: 800, height: 600 };

function encodeSecret(value) {
  const text = value == null ? "" : String(value);
  if (!text) return "";
  if (text.startsWith(SECRET_PREFIX)) return text;
  if (!safeStorage.isEncryptionAvailable()) return text;
  try {
    const encrypted = safeStorage.encryptString(text);
    return `${SECRET_PREFIX}${encrypted.toString("base64")}`;
  } catch (_) {
    return text;
  }
}

function decodeSecret(value) {
  const text = value == null ? "" : String(value);
  if (!text) return "";
  if (!text.startsWith(SECRET_PREFIX)) return text;
  if (!safeStorage.isEncryptionAvailable()) return "";
  try {
    const payload = text.slice(SECRET_PREFIX.length);
    const decrypted = safeStorage.decryptString(Buffer.from(payload, "base64"));
    return decrypted || "";
  } catch (_) {
    return "";
  }
}

function mapSecrets(entry, mapper) {
  const next = { ...entry };
  SECRET_FIELDS.forEach((field) => {
    next[field] = mapper(next[field] || "");
  });
  return next;
}

function toStoredConnectionEntry(entry) {
  const source = entry || {};
  const ssh = source.ssh || {};
  const normalized = {
    ...source,
    password: source.password || "",
    ssh_password: source.ssh_password || ssh.password || "",
    ssh_private_key: source.ssh_private_key || ssh.privateKey || "",
    ssh_passphrase: source.ssh_passphrase || ssh.passphrase || "",
  };
  return mapSecrets(normalized, encodeSecret);
}

function toPublicConnectionEntry(entry) {
  return mapSecrets(entry || {}, decodeSecret);
}

function readWindowState() {
  try {
    const raw = fs.readFileSync(windowStateFile(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeWindowState(state) {
  try {
    fs.mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to persist window state:", err);
  }
}

function isWindowStateVisible(bounds) {
  if (!bounds) return false;
  const hasNumbers =
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height);
  if (!hasNumbers) return false;

  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const intersectsHorizontally =
      bounds.x < area.x + area.width && bounds.x + bounds.width > area.x;
    const intersectsVertically =
      bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
    return intersectsHorizontally && intersectsVertically;
  });
}

function getInitialWindowBounds() {
  const saved = readWindowState();
  const width = Math.max(
    MIN_WINDOW_SIZE.width,
    Number(saved && saved.width) || DEFAULT_WINDOW_SIZE.width,
  );
  const height = Math.max(
    MIN_WINDOW_SIZE.height,
    Number(saved && saved.height) || DEFAULT_WINDOW_SIZE.height,
  );
  const bounds = { width, height };
  const hasPosition =
    saved && Number.isFinite(saved.x) && Number.isFinite(saved.y);
  if (hasPosition) {
    const positioned = { x: saved.x, y: saved.y, width, height };
    if (isWindowStateVisible(positioned)) {
      bounds.x = saved.x;
      bounds.y = saved.y;
    }
  }
  return {
    ...bounds,
    isMaximized: !!(saved && saved.isMaximized),
  };
}

function persistMainWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  writeWindowState({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: mainWindow.isMaximized(),
  });
}

function scheduleWindowStateSave() {
  if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    persistMainWindowState();
  }, 180);
}

function readSavedConnections() {
  try {
    const raw = fs.readFileSync(connectionsFile(), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeSavedConnections(list) {
  fs.mkdirSync(path.dirname(connectionsFile()), { recursive: true });
  fs.writeFileSync(connectionsFile(), JSON.stringify(list, null, 2), "utf8");
}

async function initDb() {
  if (db) return db;
  if (!dbPromise) {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    dbPromise = initSqlJs({
      locateFile: (file) => {
        if (file === "sql-wasm.wasm") return wasmPath;
        return file;
      },
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
      migrateSecretFieldsIfNeeded(instance);
      return instance;
    });
  }
  db = await dbPromise;
  return db;
}

function ensureConnectionsSchema(dbInstance) {
  let changed = false;
  try {
    const res = dbInstance.exec("PRAGMA table_info(connections)");
    const cols =
      res && res[0] && res[0].values ? res[0].values.map((row) => row[1]) : [];
    if (!cols.includes("read_only")) {
      dbInstance.run(
        "ALTER TABLE connections ADD COLUMN read_only INTEGER DEFAULT 0",
      );
      changed = true;
    }
    if (!cols.includes("ssh_enabled")) {
      dbInstance.run(
        "ALTER TABLE connections ADD COLUMN ssh_enabled INTEGER DEFAULT 0",
      );
      changed = true;
    }
    if (!cols.includes("ssh_host")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_host TEXT");
      changed = true;
    }
    if (!cols.includes("ssh_port")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_port TEXT");
      changed = true;
    }
    if (!cols.includes("ssh_user")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_user TEXT");
      changed = true;
    }
    if (!cols.includes("ssh_password")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_password TEXT");
      changed = true;
    }
    if (!cols.includes("ssh_private_key")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_private_key TEXT");
      changed = true;
    }
    if (!cols.includes("ssh_passphrase")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_passphrase TEXT");
      changed = true;
    }
    if (!cols.includes("ssh_local_port")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN ssh_local_port TEXT");
      changed = true;
    }
  } catch (err) {
    console.error("Failed to ensure connections schema:", err);
  }
  if (changed) {
    persistDb(dbInstance);
  }
}

function migrateConnectionsIfNeeded(dbInstance) {
  const count = getScalar(
    dbInstance,
    "SELECT COUNT(*) AS count FROM connections",
  );
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
    const stored = toStoredConnectionEntry(item);
    const readOnly = item.read_only || item.readOnly ? 1 : 0;
    const sshEnabled =
      item.ssh_enabled || (item.ssh && item.ssh.enabled) || item.sshEnabled
        ? 1
        : 0;
    stmt.run([
      item.name,
      item.type,
      item.host || "",
      item.port || "",
      item.user || "",
      stored.password || "",
      item.database || "",
      readOnly,
      sshEnabled,
      item.ssh_host || (item.ssh && item.ssh.host) || "",
      item.ssh_port || (item.ssh && item.ssh.port) || "",
      item.ssh_user || (item.ssh && item.ssh.user) || "",
      stored.ssh_password || "",
      stored.ssh_private_key || "",
      stored.ssh_passphrase || "",
      item.ssh_local_port || (item.ssh && item.ssh.localPort) || "",
      now,
      now,
    ]);
  }
  stmt.free();
  persistDb(dbInstance);
}

function migrateSecretFieldsIfNeeded(dbInstance) {
  if (!safeStorage.isEncryptionAvailable()) return;
  const res = dbInstance.exec(
    "SELECT name, password, ssh_password, ssh_private_key, ssh_passphrase FROM connections",
  );
  const rows = rowsFromExec(res);
  if (!rows.length) return;

  const now = Date.now();
  let changed = false;
  const stmt = dbInstance.prepare(`
    UPDATE connections
    SET password = ?, ssh_password = ?, ssh_private_key = ?, ssh_passphrase = ?, updated_at = ?
    WHERE name = ?
  `);
  rows.forEach((row) => {
    const password = encodeSecret(row.password || "");
    const sshPassword = encodeSecret(row.ssh_password || "");
    const sshPrivateKey = encodeSecret(row.ssh_private_key || "");
    const sshPassphrase = encodeSecret(row.ssh_passphrase || "");
    const hasChanges =
      password !== (row.password || "") ||
      sshPassword !== (row.ssh_password || "") ||
      sshPrivateKey !== (row.ssh_private_key || "") ||
      sshPassphrase !== (row.ssh_passphrase || "");
    if (!hasChanges) return;
    stmt.run([
      password,
      sshPassword,
      sshPrivateKey,
      sshPassphrase,
      now,
      row.name,
    ]);
    changed = true;
  });
  stmt.free();
  if (changed) {
    persistDb(dbInstance);
  }
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
  const host = ssh.host || "";
  const username = ssh.user || "";
  if (!host || !username) {
    throw new Error("SSH host and user are required.");
  }
  return {
    host,
    port: Number(ssh.port || 22),
    username,
    password: ssh.password || undefined,
    privateKey: ssh.privateKey || undefined,
    passphrase: ssh.passphrase || undefined,
    localPort: ssh.localPort ? Number(ssh.localPort) : 0,
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
      .on("ready", () => {
        const server = net.createServer((socket) => {
          client.forwardOut(
            socket.remoteAddress || "127.0.0.1",
            socket.remotePort || 0,
            targetHost,
            targetPort,
            (err, stream) => {
              if (err) {
                socket.destroy();
                return;
              }
              socket.pipe(stream).pipe(socket);
            },
          );
        });

        server.on("error", fail);
        server.listen(sshConfig.localPort || 0, "127.0.0.1", () => {
          if (settled) return;
          settled = true;
          const address = server.address();
          resolve({
            client,
            server,
            localHost: "127.0.0.1",
            localPort:
              address && address.port ? address.port : sshConfig.localPort || 0,
          });
        });
      })
      .on("error", fail)
      .connect({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        password: sshConfig.password,
        privateKey: sshConfig.privateKey,
        passphrase: sshConfig.passphrase,
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
    "SELECT name, type, host, port, user, password, database, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port FROM connections ORDER BY name",
  );
  return rowsFromExec(res).map((entry) => toPublicConnectionEntry(entry));
}

async function saveConnection(entry) {
  const dbInstance = await initDb();
  const stored = toStoredConnectionEntry(entry);
  const readOnly = !!(entry && (entry.read_only || entry.readOnly));
  const sshEnabled = !!(
    entry &&
    (entry.ssh_enabled || entry.sshEnabled || (entry.ssh && entry.ssh.enabled))
  );
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
    entry.host || "",
    entry.port || "",
    entry.user || "",
    stored.password || "",
    entry.database || "",
    readOnly ? 1 : 0,
    sshEnabled ? 1 : 0,
    entry.ssh_host || (entry.ssh && entry.ssh.host) || "",
    entry.ssh_port || (entry.ssh && entry.ssh.port) || "",
    entry.ssh_user || (entry.ssh && entry.ssh.user) || "",
    stored.ssh_password || "",
    stored.ssh_private_key || "",
    stored.ssh_passphrase || "",
    entry.ssh_local_port || (entry.ssh && entry.ssh.localPort) || "",
    now,
    now,
  ]);
  stmt.free();
  persistDb(dbInstance);
  return listConnections();
}

async function deleteConnection(name) {
  const dbInstance = await initDb();
  const stmt = dbInstance.prepare("DELETE FROM connections WHERE name = ?");
  stmt.run([name]);
  stmt.free();
  persistDb(dbInstance);
  return listConnections();
}

async function disconnect() {
  try {
    if (currentDriver) {
      await currentDriver.disconnect();
    }
  } finally {
    currentDriver = null;
  }
}

function getNativeThemeSnapshot() {
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
    themeSource: nativeTheme.themeSource,
  };
}

function emitNativeThemeUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("system:theme-updated", getNativeThemeSnapshot());
}

function createWindow() {
  const preloadCandidates = [
    process.env.ELECTRON_PRELOAD,
    path.join(__dirname, "../preload/index.js"),
    path.join(__dirname, "preload.js"),
  ].filter(Boolean);
  const resolvedPreload = preloadCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );
  if (!resolvedPreload) {
    console.error(
      "Preload script not found. Tried:",
      preloadCandidates.join(", "),
    );
  }
  const initialBounds = getInitialWindowBounds();
  const windowOptions = {
    title: "Qury Editor",
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvedPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (Number.isFinite(initialBounds.x) && Number.isFinite(initialBounds.y)) {
    windowOptions.x = initialBounds.x;
    windowOptions.y = initialBounds.y;
  }
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.on("move", scheduleWindowStateSave);
  mainWindow.on("resize", scheduleWindowStateSave);
  mainWindow.on("close", () => {
    if (windowStateSaveTimer) {
      clearTimeout(windowStateSaveTimer);
      windowStateSaveTimer = null;
    }
    persistMainWindowState();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (initialBounds.isMaximized) {
    mainWindow.maximize();
  }

  const rendererUrl =
    process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  const rendererIndex = path.join(__dirname, "../renderer/index.html");
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else if (fs.existsSync(rendererIndex)) {
    mainWindow.loadFile(rendererIndex);
  } else {
    dialog.showErrorBox(
      "Build not found",
      'Run "npm run build" before production, or use "npm run dev" for development.',
    );
  }
  emitNativeThemeUpdate();
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
}

nativeTheme.on("updated", () => {
  emitNativeThemeUpdate();
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  createWindow();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

app.on("before-quit", () => {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }
  persistMainWindowState();
  disconnect();
  db = null;
  dbPromise = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("connections:list", async () => {
  return listConnections();
});

ipcMain.handle("connections:save", async (_evt, entry) => {
  return saveConnection(entry);
});

ipcMain.handle("connections:delete", async (_evt, name) => {
  return deleteConnection(name);
});

ipcMain.handle("db:connect", async (_evt, config) => {
  try {
    await disconnect();
    const type = config.type === "postgres" ? "postgresql" : config.type;
    const sshConfig = normalizeSshConfig(config.ssh);
    const driver = createDriver(type, {
      createTunnel: createSshTunnel,
      closeTunnel,
    });
    const res = await driver.connect(config, sshConfig);
    if (!res || !res.ok)
      return res || { ok: false, error: "Failed to connect." };
    currentDriver = driver;
    return { ok: true };
  } catch (err) {
    const message = err && err.message ? err.message : "Failed to connect.";
    return { ok: false, error: message };
  }
});

ipcMain.handle("db:disconnect", async () => {
  await disconnect();
  return { ok: true };
});

ipcMain.handle("db:listTables", async () => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.listTables();
});

ipcMain.handle("db:listRoutines", async () => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.listRoutines();
});

ipcMain.handle("db:listColumns", async (_evt, payload) => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.listColumns(payload);
});

ipcMain.handle("db:listTableInfo", async (_evt, payload) => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.listTableInfo(payload);
});

ipcMain.handle("db:getViewDefinition", async (_evt, payload) => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  if (!currentDriver.getViewDefinition)
    return { ok: false, error: "View definitions not supported." };
  return currentDriver.getViewDefinition(payload);
});

ipcMain.handle("db:getTableDefinition", async (_evt, payload) => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  if (!currentDriver.getTableDefinition)
    return { ok: false, error: "Table definitions not supported." };
  return currentDriver.getTableDefinition(payload);
});

ipcMain.handle("db:listDatabases", async () => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.listDatabases();
});

ipcMain.handle("db:useDatabase", async (_evt, name) => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.useDatabase(name);
});

ipcMain.handle("db:testConnection", async (_evt, config) => {
  try {
    const type = config.type === "postgres" ? "postgresql" : config.type;
    const sshConfig = normalizeSshConfig(config.ssh);
    const driver = createDriver(type, {
      createTunnel: createSshTunnel,
      closeTunnel,
    });
    return await driver.testConnection(config, sshConfig);
  } catch (err) {
    const message =
      err && (err.sqlMessage || err.message)
        ? err.sqlMessage || err.message
        : "Failed to test connection.";
    return { ok: false, error: message };
  }
});

ipcMain.handle("db:runQuery", async (_evt, payload) => {
  if (!currentDriver) return { ok: false, error: "Not connected." };
  return currentDriver.runQuery(payload);
});

ipcMain.handle("db:cancelQuery", async () => {
  if (!currentDriver) return { ok: false, error: "No query running." };
  return currentDriver.cancelQuery();
});

ipcMain.handle("app:setProgressBar", async (_evt, value) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "Window not available." };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    mainWindow.setProgressBar(-1);
    return { ok: true };
  }
  const next = numeric < 0 ? -1 : numeric;
  mainWindow.setProgressBar(next);
  return { ok: true };
});

ipcMain.handle("system:getNativeTheme", async () => {
  return { ok: true, ...getNativeThemeSnapshot() };
});

ipcMain.handle("dialog:error", async (_evt, message) => {
  console.log("[main] dialog:error called with:", message);
  if (mainWindow) {
    dialog.showErrorBox("Error", message || "Unknown error");
  }
});
