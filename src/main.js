const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  nativeTheme,
  screen,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { Client: SshClient } = require("ssh2");
const initSqlJs = require("sql.js");
const { createDriver } = require("./drivers");

let mainWindow = null;
let currentDriver = null;
let currentConnectionState = { readOnly: false, policyMode: "dev" };
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
const policySettingsFile = () => path.join(dataDir(), "policy-settings.json");

const SECRET_PREFIX = "safe:";
const SECRET_FIELDS = [
  "password",
  "ssh_password",
  "ssh_private_key",
  "ssh_passphrase",
];
const DEFAULT_WINDOW_SIZE = { width: 1200, height: 900 };
const MIN_WINDOW_SIZE = { width: 800, height: 600 };
const READ_ONLY_BLOCKED_KEYWORDS = new Set([
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "replace",
  "create",
  "alter",
  "drop",
  "truncate",
  "rename",
  "comment",
  "grant",
  "revoke",
  "call",
  "do",
  "copy",
  "refresh",
  "reindex",
  "cluster",
  "vacuum",
  "analyze",
]);
const POLICY_MODE_DEV = "dev";
const POLICY_MODE_STAGING = "staging";
const POLICY_MODE_PROD = "prod";
const POLICY_APPROVAL_TOKEN = "PROCEED";
const DEFAULT_POLICY_RULES = Object.freeze({
  [POLICY_MODE_DEV]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: true,
    requireApproval: false,
  }),
  [POLICY_MODE_STAGING]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: false,
    requireApproval: true,
  }),
  [POLICY_MODE_PROD]: Object.freeze({
    allowWrite: false,
    allowDdlAdmin: false,
    requireApproval: false,
  }),
});
const WRITE_BLOCKED_KEYWORDS = new Set([
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "replace",
  "copy",
]);
const DDL_ADMIN_BLOCKED_KEYWORDS = new Set([
  "create",
  "alter",
  "drop",
  "truncate",
  "rename",
  "comment",
  "grant",
  "revoke",
  "call",
  "do",
  "refresh",
  "reindex",
  "cluster",
  "vacuum",
  "analyze",
]);
let policyRules = null;
const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_SNIPPETS_LIMIT = 100;

function generateId(prefix) {
  const safePrefix = String(prefix || "id");
  return `${safePrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function shouldRememberSecrets(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.rememberSecrets !== undefined) return !!entry.rememberSecrets;
  if (entry.remember_secrets !== undefined)
    return Number(entry.remember_secrets) === 1;
  if (entry.save_secrets !== undefined) return Number(entry.save_secrets) === 1;
  const ssh = entry.ssh || {};
  return !!(
    entry.password ||
    entry.ssh_password ||
    entry.ssh_private_key ||
    entry.ssh_passphrase ||
    ssh.password ||
    ssh.privateKey ||
    ssh.passphrase
  );
}

function toStoredConnectionEntry(entry) {
  const source = entry || {};
  const ssh = source.ssh || {};
  const rememberSecrets = shouldRememberSecrets(source);
  const policyMode = getEntryPolicyMode(source);
  const normalized = {
    ...source,
    remember_secrets: rememberSecrets ? 1 : 0,
    policy_mode: policyMode,
    policyMode,
    password: source.password || "",
    ssh_password: source.ssh_password || ssh.password || "",
    ssh_private_key: source.ssh_private_key || ssh.privateKey || "",
    ssh_passphrase: source.ssh_passphrase || ssh.passphrase || "",
  };
  if (!rememberSecrets) {
    return mapSecrets(normalized, () => "");
  }
  return mapSecrets(normalized, encodeSecret);
}

function toPublicConnectionEntry(entry) {
  const source = entry || {};
  const rememberSecrets = shouldRememberSecrets(source);
  const policyMode = getEntryPolicyMode(source);
  const normalized = {
    ...source,
    remember_secrets: rememberSecrets ? 1 : 0,
    rememberSecrets,
    policy_mode: policyMode,
    policyMode,
  };
  if (!rememberSecrets) {
    return mapSecrets(normalized, () => "");
  }
  return mapSecrets(normalized, decodeSecret);
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
          id TEXT,
          name TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          file_path TEXT,
          host TEXT,
          port TEXT,
          user TEXT,
          password TEXT,
          remember_secrets INTEGER DEFAULT 0,
          policy_mode TEXT DEFAULT 'dev',
          database TEXT,
          last_connected_at INTEGER DEFAULT 0,
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
      instance.run(`
        CREATE TABLE IF NOT EXISTS snippets (
          id TEXT PRIMARY KEY,
          connection_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sql TEXT NOT NULL,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);
      instance.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS snippets_connection_name
          ON snippets (connection_id, name)
      `);
      instance.run(`
        CREATE INDEX IF NOT EXISTS snippets_connection_updated
          ON snippets (connection_id, updated_at)
      `);
      instance.run(`
        CREATE TABLE IF NOT EXISTS query_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          connection_id TEXT NOT NULL,
          sql TEXT NOT NULL,
          ts INTEGER
        )
      `);
      instance.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS query_history_connection_sql
          ON query_history (connection_id, sql)
      `);
      instance.run(`
        CREATE INDEX IF NOT EXISTS query_history_connection_ts
          ON query_history (connection_id, ts)
      `);
      ensureConnectionsSchema(instance);
      migrateConnectionsIfNeeded(instance);
      migrateConnectionIdsIfNeeded(instance);
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
    if (!cols.includes("id")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN id TEXT");
      changed = true;
    }
    if (!cols.includes("read_only")) {
      dbInstance.run(
        "ALTER TABLE connections ADD COLUMN read_only INTEGER DEFAULT 0",
      );
      changed = true;
    }
    if (!cols.includes("file_path")) {
      dbInstance.run("ALTER TABLE connections ADD COLUMN file_path TEXT");
      changed = true;
    }
    if (!cols.includes("policy_mode")) {
      dbInstance.run(
        "ALTER TABLE connections ADD COLUMN policy_mode TEXT DEFAULT 'dev'",
      );
      changed = true;
    }
    const invalidPolicyCount = dbInstance.exec(`
      SELECT COUNT(*) AS count
      FROM connections
      WHERE policy_mode IS NULL
        OR TRIM(policy_mode) = ''
        OR LOWER(policy_mode) NOT IN ('dev', 'staging', 'prod')
    `);
    const invalidRows =
      invalidPolicyCount &&
      invalidPolicyCount[0] &&
      invalidPolicyCount[0].values &&
      invalidPolicyCount[0].values[0]
        ? Number(invalidPolicyCount[0].values[0][0]) || 0
        : 0;
    if (invalidRows > 0) {
      dbInstance.run(`
        UPDATE connections
        SET policy_mode = 'dev'
        WHERE policy_mode IS NULL
          OR TRIM(policy_mode) = ''
          OR LOWER(policy_mode) NOT IN ('dev', 'staging', 'prod')
      `);
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
    if (!cols.includes("remember_secrets")) {
      dbInstance.run(
        "ALTER TABLE connections ADD COLUMN remember_secrets INTEGER DEFAULT 0",
      );
      dbInstance.run(`
        UPDATE connections
        SET remember_secrets = CASE
          WHEN COALESCE(password, '') <> ''
            OR COALESCE(ssh_password, '') <> ''
            OR COALESCE(ssh_private_key, '') <> ''
            OR COALESCE(ssh_passphrase, '') <> ''
          THEN 1
          ELSE 0
        END
      `);
      changed = true;
    }
    if (!cols.includes("last_connected_at")) {
      dbInstance.run(
        "ALTER TABLE connections ADD COLUMN last_connected_at INTEGER DEFAULT 0",
      );
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
      (id, name, type, file_path, host, port, user, password, remember_secrets, policy_mode, database, last_connected_at, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of byName.values()) {
    const stored = toStoredConnectionEntry(item);
    const policyMode = getEntryPolicyMode(item);
    const readOnly = item.read_only || item.readOnly ? 1 : 0;
    const sshEnabled =
      item.ssh_enabled || (item.ssh && item.ssh.enabled) || item.sshEnabled
        ? 1
        : 0;
    stmt.run([
      generateId("conn"),
      item.name,
      item.type,
      item.file_path || item.filePath || item.path || "",
      item.host || "",
      item.port || "",
      item.user || "",
      stored.password || "",
      stored.remember_secrets || 0,
      policyMode,
      item.database || "",
      item.last_connected_at || item.lastConnectedAt || item.lastUsed || 0,
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
    "SELECT name, password, remember_secrets, ssh_password, ssh_private_key, ssh_passphrase FROM connections",
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
    const rememberSecrets = shouldRememberSecrets(row);
    if (!rememberSecrets) {
      const hasAnySecret = !!(
        row.password ||
        row.ssh_password ||
        row.ssh_private_key ||
        row.ssh_passphrase
      );
      if (!hasAnySecret) return;
      stmt.run(["", "", "", "", now, row.name]);
      changed = true;
      return;
    }
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

function getConnectionIdByName(dbInstance, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  const stmt = dbInstance.prepare("SELECT id FROM connections WHERE name = ?");
  stmt.bind([trimmed]);
  let id = "";
  if (stmt.step()) {
    const row = stmt.getAsObject();
    id = row && row.id ? String(row.id) : "";
  }
  stmt.free();
  return id;
}

function migrateConnectionIdsIfNeeded(dbInstance) {
  const res = dbInstance.exec("SELECT name, id FROM connections");
  const rows = rowsFromExec(res);
  if (!rows.length) return;
  const now = Date.now();
  let changed = false;
  const stmt = dbInstance.prepare(
    "UPDATE connections SET id = ?, updated_at = ? WHERE name = ?",
  );
  rows.forEach((row) => {
    const currentId = row && row.id ? String(row.id) : "";
    const name = row && row.name ? String(row.name) : "";
    if (!name || currentId) return;
    stmt.run([generateId("conn"), now, name]);
    changed = true;
  });
  stmt.free();
  if (changed) persistDb(dbInstance);
}

function normalizeConnectionType(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (text === "postgres") return "postgresql";
  if (text === "maria" || text === "maria-db") return "mariadb";
  if (text === "sqlite3") return "sqlite";
  if (
    text === "postgresql" ||
    text === "mysql" ||
    text === "mariadb" ||
    text === "sqlite"
  )
    return text;
  return text || "mysql";
}

function normalizePolicyMode(value) {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  if (mode === POLICY_MODE_STAGING || mode === POLICY_MODE_PROD) return mode;
  return POLICY_MODE_DEV;
}

function clonePolicyRules(input) {
  const source = input || {};
  return {
    [POLICY_MODE_DEV]: {
      ...(source[POLICY_MODE_DEV] || DEFAULT_POLICY_RULES[POLICY_MODE_DEV]),
    },
    [POLICY_MODE_STAGING]: {
      ...(source[POLICY_MODE_STAGING] ||
        DEFAULT_POLICY_RULES[POLICY_MODE_STAGING]),
    },
    [POLICY_MODE_PROD]: {
      ...(source[POLICY_MODE_PROD] || DEFAULT_POLICY_RULES[POLICY_MODE_PROD]),
    },
  };
}

function normalizePolicyRule(input, fallback) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback || DEFAULT_POLICY_RULES[POLICY_MODE_DEV];
  const allowWriteValue =
    source.allowWrite !== undefined
      ? source.allowWrite
      : source.allow_write !== undefined
        ? source.allow_write
        : base.allowWrite;
  const allowDdlAdminValue =
    source.allowDdlAdmin !== undefined
      ? source.allowDdlAdmin
      : source.allow_ddl_admin !== undefined
        ? source.allow_ddl_admin
        : base.allowDdlAdmin;
  const requireApprovalValue =
    source.requireApproval !== undefined
      ? source.requireApproval
      : source.require_approval !== undefined
        ? source.require_approval
        : base.requireApproval;
  return {
    allowWrite: !!allowWriteValue,
    allowDdlAdmin: !!allowDdlAdminValue,
    requireApproval: !!requireApprovalValue,
  };
}

function normalizePolicyRules(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    [POLICY_MODE_DEV]: normalizePolicyRule(
      source[POLICY_MODE_DEV],
      DEFAULT_POLICY_RULES[POLICY_MODE_DEV],
    ),
    [POLICY_MODE_STAGING]: normalizePolicyRule(
      source[POLICY_MODE_STAGING],
      DEFAULT_POLICY_RULES[POLICY_MODE_STAGING],
    ),
    [POLICY_MODE_PROD]: normalizePolicyRule(
      source[POLICY_MODE_PROD],
      DEFAULT_POLICY_RULES[POLICY_MODE_PROD],
    ),
  };
}

function readPolicyRules() {
  try {
    const raw = fs.readFileSync(policySettingsFile(), "utf8");
    const parsed = JSON.parse(raw);
    const envs =
      parsed &&
      typeof parsed === "object" &&
      parsed.environments &&
      typeof parsed.environments === "object"
        ? parsed.environments
        : parsed;
    return normalizePolicyRules(envs);
  } catch (_) {
    return clonePolicyRules(DEFAULT_POLICY_RULES);
  }
}

function writePolicyRules(nextRules) {
  const payload = {
    version: 1,
    updated_at: Date.now(),
    environments: normalizePolicyRules(nextRules),
  };
  fs.mkdirSync(path.dirname(policySettingsFile()), { recursive: true });
  fs.writeFileSync(
    policySettingsFile(),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

function ensurePolicyRulesLoaded() {
  if (!policyRules) {
    policyRules = readPolicyRules();
  }
  return policyRules;
}

function getPolicyRulesSnapshot() {
  return clonePolicyRules(ensurePolicyRulesLoaded());
}

function savePolicyRules(input) {
  const normalized = normalizePolicyRules(input);
  policyRules = normalized;
  writePolicyRules(normalized);
  return getPolicyRulesSnapshot();
}

function getPolicyRuleByMode(mode) {
  const policyMode = normalizePolicyMode(mode);
  const current = ensurePolicyRulesLoaded();
  return (
    current[policyMode] ||
    DEFAULT_POLICY_RULES[policyMode] ||
    DEFAULT_POLICY_RULES[POLICY_MODE_DEV]
  );
}

function getEntryPolicyMode(entry) {
  if (!entry || typeof entry !== "object") return POLICY_MODE_DEV;
  return normalizePolicyMode(entry.policyMode || entry.policy_mode);
}

function isReadOnlyConfig(config) {
  if (!config || typeof config !== "object") return false;
  return !!(config.readOnly || config.read_only);
}

function splitSqlStatements(sql) {
  const text = String(sql || "");
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "-" && next === "-") {
        inLineComment = true;
        current += ch + next;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        current += ch + next;
        i += 1;
        continue;
      }
    }

    if (!inDouble && !inBacktick && ch === "'") {
      if (inSingle && next === "'") {
        current += ch + next;
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inSingle && !inBacktick && ch === '"') {
      if (inDouble && next === '"') {
        current += ch + next;
        i += 1;
        continue;
      }
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === "`") {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && ch === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripLeadingComments(sql) {
  let text = String(sql || "");
  let changed = true;
  while (changed) {
    changed = false;
    text = text.trimStart();
    if (text.startsWith("--")) {
      const idx = text.indexOf("\n");
      text = idx === -1 ? "" : text.slice(idx + 1);
      changed = true;
      continue;
    }
    if (text.startsWith("/*")) {
      const idx = text.indexOf("*/");
      text = idx === -1 ? "" : text.slice(idx + 2);
      changed = true;
      continue;
    }
  }
  return text.trimStart();
}

function statementActionKeyword(sql) {
  const cleaned = stripLeadingComments(sql);
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();

  const cteOrExplain = lower.startsWith("with") || lower.startsWith("explain");
  if (cteOrExplain) {
    const match = lower.match(
      /\b(select|insert|update|delete|merge|upsert|replace|create|alter|drop|truncate|rename|comment|grant|revoke|call|do|copy|refresh|reindex|cluster|vacuum|analyze)\b/,
    );
    return match ? match[1] : "";
  }

  const match = lower.match(/^([a-z]+)/);
  return match ? match[1] : "";
}

function readOnlyViolation(sqlText) {
  const statements = splitSqlStatements(sqlText);
  if (statements.length === 0) return null;

  for (const statement of statements) {
    const action = statementActionKeyword(statement);
    if (!action) continue;
    if (READ_ONLY_BLOCKED_KEYWORDS.has(action)) {
      return action.toUpperCase();
    }
  }

  return null;
}

function sanitizeSqlForPolicy(sql) {
  const text = String(sql || "");
  let sanitized = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        sanitized += "\n";
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    if (inBacktick) {
      if (ch === "`") inBacktick = false;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      continue;
    }

    sanitized += ch;
  }

  return sanitized.toLowerCase();
}

function findFirstBlockedKeyword(text, keywords) {
  const tokenRegex = /\b[a-z]+\b/g;
  let match = tokenRegex.exec(text);
  while (match) {
    const token = match[0];
    if (keywords.has(token)) {
      return { token, index: match.index };
    }
    match = tokenRegex.exec(text);
  }
  return null;
}

function statementPolicyClassification(sql) {
  const sanitized = sanitizeSqlForPolicy(sql);
  if (!sanitized.trim()) return null;

  const firstWrite = findFirstBlockedKeyword(sanitized, WRITE_BLOCKED_KEYWORDS);
  const firstDdlAdmin = findFirstBlockedKeyword(
    sanitized,
    DDL_ADMIN_BLOCKED_KEYWORDS,
  );
  const selectIntoMatch = /\bselect\b[\s\S]*\binto\b/.exec(sanitized);
  const selectIntoWrite = selectIntoMatch
    ? { token: "select into", index: selectIntoMatch.index }
    : null;

  let effectiveWrite = firstWrite;
  if (
    selectIntoWrite &&
    (!effectiveWrite || selectIntoWrite.index < effectiveWrite.index)
  ) {
    effectiveWrite = selectIntoWrite;
  }

  if (!effectiveWrite && !firstDdlAdmin) return null;

  if (
    firstDdlAdmin &&
    (!effectiveWrite || firstDdlAdmin.index <= effectiveWrite.index)
  ) {
    return { kind: "ddlAdmin", action: firstDdlAdmin.token.toUpperCase() };
  }

  return {
    kind: "write",
    action: effectiveWrite.token.toUpperCase(),
  };
}

function extractPolicyApproval(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(payload.policyApproval || payload.policy_approval || "")
    .trim()
    .toUpperCase();
}

function policyViolation(sqlText, mode, approvalToken) {
  const statements = splitSqlStatements(sqlText);
  if (statements.length === 0) return null;

  const policyMode = normalizePolicyMode(mode);
  const rule = getPolicyRuleByMode(policyMode);
  const label = policyMode.toUpperCase();

  for (const statement of statements) {
    const classification = statementPolicyClassification(statement);
    if (!classification) continue;

    if (classification.kind === "ddlAdmin" && !rule.allowDdlAdmin) {
      return {
        message: `${label} policy blocks ${classification.action} statements.`,
      };
    }

    if (classification.kind === "write") {
      if (!rule.allowWrite) {
        return {
          message: `${label} policy blocks ${classification.action} statements.`,
        };
      }
      if (rule.requireApproval && approvalToken !== POLICY_APPROVAL_TOKEN) {
        return {
          message: `${label} policy requires explicit confirmation for ${classification.action} statements.`,
        };
      }
    }

    if (classification.kind !== "write" && rule.requireApproval) {
      if (approvalToken !== POLICY_APPROVAL_TOKEN) {
        return {
          message: `${label} policy requires explicit confirmation for ${classification.action} statements.`,
        };
      }
    }
  }

  return null;
}

function extractSqlFromRunPayload(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  return String(payload.sql || "");
}

function normalizedPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizedPortForFingerprint(type, port) {
  const value = normalizedPart(port);
  if (value) return value;
  if (type === "postgresql") return "5432";
  if (type === "mysql" || type === "mariadb") return "3306";
  return "";
}

function connectionFingerprint(entry) {
  const source = entry || {};
  const ssh = source.ssh || {};
  const type = normalizeConnectionType(source.type);
  const sshEnabled = !!(
    source.ssh_enabled ||
    source.sshEnabled ||
    (ssh && ssh.enabled)
  );
  const readOnly = !!(source.read_only || source.readOnly);
  const filePath = normalizedPart(
    source.file_path || source.filePath || source.path,
  );
  const hostPart =
    type === "sqlite" ? filePath : normalizedPart(source.host || "localhost");
  const portPart =
    type === "sqlite" ? "" : normalizedPortForFingerprint(type, source.port);
  const userPart = type === "sqlite" ? "" : normalizedPart(source.user);
  const databasePart = type === "sqlite" ? "" : normalizedPart(source.database);
  return [
    type,
    hostPart,
    portPart,
    userPart,
    databasePart,
    readOnly ? "ro" : "rw",
    normalizedPart(getEntryPolicyMode(source)),
    sshEnabled ? "ssh" : "direct",
    normalizedPart(ssh.host || source.ssh_host || source.sshHost),
    normalizedPart(ssh.port || source.ssh_port || source.sshPort),
    normalizedPart(ssh.user || source.ssh_user || source.sshUser),
    normalizedPart(
      ssh.localPort || source.ssh_local_port || source.sshLocalPort,
    ),
  ].join("|");
}

function normalizeConnectionName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeImportedConnection(entry, index) {
  if (!entry || typeof entry !== "object") return null;
  const source = entry;
  const ssh = source.ssh || {};
  const sshEnabled = !!(
    source.ssh_enabled ||
    source.sshEnabled ||
    (ssh && ssh.enabled)
  );
  const normalizedType = normalizeConnectionType(source.type);
  const isSqlite = normalizedType === "sqlite";
  const filePath = String(
    source.file_path || source.filePath || source.path || "",
  ).trim();
  const normalized = {
    ...source,
    name:
      String(source.name || "").trim() || `Imported connection ${index + 1}`,
    type: normalizedType,
    file_path: filePath,
    host: isSqlite ? "" : String(source.host || "").trim() || "localhost",
    port: String(source.port || "").trim(),
    user: String(source.user || ""),
    password: String(source.password || ""),
    database: String(source.database || "").trim(),
    readOnly: !!(source.readOnly || source.read_only),
    policyMode: getEntryPolicyMode(source),
    policy_mode: getEntryPolicyMode(source),
    ssh: sshEnabled
      ? {
          enabled: true,
          host: String(
            ssh.host || source.ssh_host || source.sshHost || "",
          ).trim(),
          port: String(
            ssh.port || source.ssh_port || source.sshPort || "",
          ).trim(),
          user: String(
            ssh.user || source.ssh_user || source.sshUser || "",
          ).trim(),
          password: String(
            ssh.password || source.ssh_password || source.sshPassword || "",
          ),
          privateKey: String(
            ssh.privateKey ||
              source.ssh_private_key ||
              source.sshPrivateKey ||
              "",
          ),
          passphrase: String(
            ssh.passphrase ||
              source.ssh_passphrase ||
              source.sshPassphrase ||
              "",
          ),
          localPort: String(
            ssh.localPort || source.ssh_local_port || source.sshLocalPort || "",
          ).trim(),
        }
      : { enabled: false },
  };
  if (source.rememberSecrets !== undefined) {
    normalized.rememberSecrets = !!source.rememberSecrets;
  }
  if (source.remember_secrets !== undefined) {
    normalized.remember_secrets = source.remember_secrets;
  }
  return normalized;
}

function toConnectionMetadata(entry) {
  const source = entry || {};
  const ssh = source.ssh || {};
  const sshEnabled = !!(
    source.ssh_enabled ||
    source.sshEnabled ||
    (ssh && ssh.enabled)
  );
  const readOnly = !!(source.read_only || source.readOnly);
  const policyMode = getEntryPolicyMode(source);
  const filePath = String(
    source.file_path || source.filePath || source.path || "",
  ).trim();
  return {
    name: String(source.name || "").trim(),
    type: normalizeConnectionType(source.type),
    file_path: filePath,
    host: String(source.host || "").trim(),
    port: String(source.port || "").trim(),
    user: String(source.user || ""),
    database: String(source.database || "").trim(),
    policy_mode: policyMode,
    last_connected_at:
      Number(source.last_connected_at || source.lastConnectedAt || 0) || 0,
    read_only: readOnly ? 1 : 0,
    ssh_enabled: sshEnabled ? 1 : 0,
    ssh_host: String(
      source.ssh_host || (ssh && ssh.host) || source.sshHost || "",
    ).trim(),
    ssh_port: String(
      source.ssh_port || (ssh && ssh.port) || source.sshPort || "",
    ).trim(),
    ssh_user: String(
      source.ssh_user || (ssh && ssh.user) || source.sshUser || "",
    ).trim(),
    ssh_local_port: String(
      source.ssh_local_port ||
        (ssh && ssh.localPort) ||
        source.sshLocalPort ||
        "",
    ).trim(),
  };
}

function getConnectionMetadata(dbInstance) {
  const res = dbInstance.exec(
    "SELECT id, name, type, file_path, host, port, user, policy_mode, database, last_connected_at, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_local_port FROM connections ORDER BY COALESCE(last_connected_at, 0) DESC, name COLLATE NOCASE ASC",
  );
  return rowsFromExec(res);
}

function rebuildFingerprintMapByName(metaByName) {
  const fingerprintMap = new Map();
  for (const meta of metaByName.values()) {
    const fingerprint = connectionFingerprint(meta);
    if (!fingerprintMap.has(fingerprint)) {
      fingerprintMap.set(fingerprint, meta);
    }
  }
  return fingerprintMap;
}

function upsertConnectionRecord(dbInstance, entry, now = Date.now()) {
  if (!entry || !entry.name) {
    throw new Error("Connection name is required.");
  }
  const resolvedId =
    (entry && entry.id ? String(entry.id) : "") ||
    getConnectionIdByName(dbInstance, entry.name) ||
    generateId("conn");
  const stored = toStoredConnectionEntry(entry);
  const policyMode = getEntryPolicyMode(entry);
  const readOnly = !!(entry && (entry.read_only || entry.readOnly));
  const sshEnabled = !!(
    entry &&
    (entry.ssh_enabled || entry.sshEnabled || (entry.ssh && entry.ssh.enabled))
  );
  const stmt = dbInstance.prepare(`
    INSERT INTO connections
      (id, name, type, file_path, host, port, user, password, remember_secrets, policy_mode, database, last_connected_at, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      id = excluded.id,
      type = excluded.type,
      file_path = excluded.file_path,
      host = excluded.host,
      port = excluded.port,
      user = excluded.user,
      password = excluded.password,
      remember_secrets = excluded.remember_secrets,
      policy_mode = excluded.policy_mode,
      database = excluded.database,
      last_connected_at = CASE
        WHEN excluded.last_connected_at > 0 THEN excluded.last_connected_at
        ELSE connections.last_connected_at
      END,
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
    resolvedId,
    entry.name,
    normalizeConnectionType(entry.type),
    entry.file_path || entry.filePath || entry.path || "",
    entry.host || "",
    entry.port || "",
    entry.user || "",
    stored.password || "",
    stored.remember_secrets || 0,
    policyMode,
    entry.database || "",
    entry.last_connected_at || entry.lastConnectedAt || 0,
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
    "SELECT id, name, type, file_path, host, port, user, password, remember_secrets, policy_mode, database, last_connected_at, read_only, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_password, ssh_private_key, ssh_passphrase, ssh_local_port FROM connections ORDER BY COALESCE(last_connected_at, 0) DESC, name COLLATE NOCASE ASC",
  );
  return rowsFromExec(res).map((entry) => toPublicConnectionEntry(entry));
}

async function saveConnection(entry) {
  const dbInstance = await initDb();
  const source = entry && typeof entry === "object" ? entry : {};
  const originalName = String(
    source.originalName || source.original_name || "",
  ).trim();
  const nextEntry = { ...source };
  delete nextEntry.originalName;
  delete nextEntry.original_name;
  const nextName = String(nextEntry.name || "").trim();
  const now = Date.now();
  nextEntry.last_connected_at = now;
  if (!nextEntry.id) {
    const existingId = getConnectionIdByName(
      dbInstance,
      originalName || nextName,
    );
    nextEntry.id = existingId || generateId("conn");
  }

  dbInstance.run("BEGIN");
  try {
    upsertConnectionRecord(dbInstance, nextEntry, now);
    if (originalName && nextName && originalName !== nextName) {
      const deleteStmt = dbInstance.prepare(
        "DELETE FROM connections WHERE name = ?",
      );
      deleteStmt.run([originalName]);
      deleteStmt.free();
    }
    dbInstance.run("COMMIT");
  } catch (err) {
    try {
      dbInstance.run("ROLLBACK");
    } catch (_) {}
    throw err;
  }
  persistDb(dbInstance);
  return listConnections();
}

async function touchConnection(name) {
  if (!name) return listConnections();
  const dbInstance = await initDb();
  const now = Date.now();
  const stmt = dbInstance.prepare(`
    UPDATE connections
    SET last_connected_at = ?, updated_at = ?
    WHERE name = ?
  `);
  stmt.run([now, now, name]);
  stmt.free();
  persistDb(dbInstance);
  return listConnections();
}

async function exportConnections(ownerWindow) {
  try {
    const connections = await listConnections();
    const stamp = new Date().toISOString().slice(0, 10);
    const defaultPath = path.join(
      app.getPath("documents"),
      `qury-connections-${stamp}.json`,
    );
    const activeOwner =
      ownerWindow && !ownerWindow.isDestroyed()
        ? ownerWindow
        : BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    if (activeOwner && !activeOwner.isDestroyed()) activeOwner.focus();
    const saveResult = await dialog.showSaveDialog({
      title: "Export saved connections",
      buttonLabel: "Export",
      defaultPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!saveResult || saveResult.canceled || !saveResult.filePath) {
      return { ok: false, canceled: true };
    }
    const payload = {
      exported_at: new Date().toISOString(),
      app: "Qury Editor",
      connections,
    };
    fs.writeFileSync(
      saveResult.filePath,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    return {
      ok: true,
      path: saveResult.filePath,
      count: Array.isArray(connections) ? connections.length : 0,
    };
  } catch (err) {
    const message = err && err.message ? err.message : "Failed to export.";
    return { ok: false, error: message };
  }
}

async function importConnections(ownerWindow) {
  try {
    const activeOwner =
      ownerWindow && !ownerWindow.isDestroyed()
        ? ownerWindow
        : BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    if (activeOwner && !activeOwner.isDestroyed()) activeOwner.focus();
    const openResult = await dialog.showOpenDialog({
      title: "Import saved connections",
      buttonLabel: "Import",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (
      !openResult ||
      openResult.canceled ||
      !openResult.filePaths ||
      !openResult.filePaths[0]
    ) {
      return { ok: false, canceled: true };
    }

    const raw = fs.readFileSync(openResult.filePaths[0], "utf8");
    const parsed = JSON.parse(raw);
    const sourceList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed && parsed.connections)
        ? parsed.connections
        : null;
    if (!sourceList) {
      return { ok: false, error: "Invalid file format. Expected a JSON list." };
    }

    const dbInstance = await initDb();
    const now = Date.now();
    const existing = getConnectionMetadata(dbInstance);
    const metadataByName = new Map(
      existing.map((item) => [normalizeConnectionName(item.name), item]),
    );
    let metadataByFingerprint = rebuildFingerprintMapByName(metadataByName);

    let added = 0;
    let updated = 0;
    let matchedBySimilarity = 0;
    let skipped = 0;

    dbInstance.run("BEGIN TRANSACTION");
    try {
      sourceList.forEach((item, index) => {
        const normalized = normalizeImportedConnection(item, index);
        if (!normalized || !normalized.name) {
          skipped += 1;
          return;
        }

        const importedNameKey = normalizeConnectionName(normalized.name);
        const byName = metadataByName.get(importedNameKey);

        if (byName && byName.name) {
          normalized.name = byName.name;
          if (!normalized.last_connected_at && byName.last_connected_at) {
            normalized.last_connected_at = byName.last_connected_at;
          }
          upsertConnectionRecord(dbInstance, normalized, now);
          updated += 1;
          const nextMeta = toConnectionMetadata(normalized);
          metadataByName.set(normalizeConnectionName(nextMeta.name), nextMeta);
          metadataByFingerprint = rebuildFingerprintMapByName(metadataByName);
          return;
        }

        const fingerprint = connectionFingerprint(normalized);
        const similar = metadataByFingerprint.get(fingerprint);
        if (similar && similar.name) {
          normalized.name = similar.name;
          if (!normalized.last_connected_at && similar.last_connected_at) {
            normalized.last_connected_at = similar.last_connected_at;
          }
          upsertConnectionRecord(dbInstance, normalized, now);
          updated += 1;
          matchedBySimilarity += 1;
          const nextMeta = toConnectionMetadata(normalized);
          metadataByName.set(normalizeConnectionName(nextMeta.name), nextMeta);
          metadataByFingerprint = rebuildFingerprintMapByName(metadataByName);
          return;
        }

        upsertConnectionRecord(dbInstance, normalized, now);
        added += 1;
        const nextMeta = toConnectionMetadata(normalized);
        metadataByName.set(normalizeConnectionName(nextMeta.name), nextMeta);
        metadataByFingerprint = rebuildFingerprintMapByName(metadataByName);
      });

      dbInstance.run("COMMIT");
    } catch (err) {
      try {
        dbInstance.run("ROLLBACK");
      } catch (_) {}
      throw err;
    }

    persistDb(dbInstance);
    return {
      ok: true,
      path: openResult.filePaths[0],
      total: sourceList.length,
      added,
      updated,
      matchedBySimilarity,
      skipped,
    };
  } catch (err) {
    const message = err && err.message ? err.message : "Failed to import.";
    return { ok: false, error: message };
  }
}

async function deleteConnection(name) {
  const dbInstance = await initDb();
  const stmt = dbInstance.prepare("DELETE FROM connections WHERE name = ?");
  stmt.run([name]);
  stmt.free();
  persistDb(dbInstance);
  return listConnections();
}

async function listSnippets(payload) {
  const connectionId =
    payload && payload.connectionId ? String(payload.connectionId) : "";
  if (!connectionId) return [];
  const limit =
    payload && Number.isFinite(Number(payload.limit))
      ? Math.max(1, Math.floor(Number(payload.limit)))
      : DEFAULT_SNIPPETS_LIMIT;
  const dbInstance = await initDb();
  const stmt = dbInstance.prepare(
    "SELECT id, name, sql, updated_at FROM snippets WHERE connection_id = ? ORDER BY updated_at DESC LIMIT ?",
  );
  stmt.bind([connectionId, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sql: row.sql,
    ts: row.updated_at || 0,
  }));
}

function getSnippetIdByName(dbInstance, connectionId, name) {
  const stmt = dbInstance.prepare(
    "SELECT id FROM snippets WHERE connection_id = ? AND name = ?",
  );
  stmt.bind([connectionId, name]);
  let id = "";
  if (stmt.step()) {
    const row = stmt.getAsObject();
    id = row && row.id ? String(row.id) : "";
  }
  stmt.free();
  return id;
}

async function saveSnippet(payload) {
  const connectionId =
    payload && payload.connectionId ? String(payload.connectionId) : "";
  const name = payload && payload.name ? String(payload.name).trim() : "";
  const sql = payload && payload.sql ? String(payload.sql) : "";
  if (!connectionId || !name || !sql.trim()) {
    return { ok: false, error: "Invalid snippet payload." };
  }
  const dbInstance = await initDb();
  const existingId = getSnippetIdByName(dbInstance, connectionId, name);
  const nextId =
    existingId ||
    (payload && payload.id ? String(payload.id) : "") ||
    generateId("snip");
  const now = Date.now();

  dbInstance.run("BEGIN");
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO snippets
        (id, connection_id, name, sql, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?)
      ON CONFLICT(connection_id, name) DO UPDATE SET
        sql = excluded.sql,
        updated_at = excluded.updated_at
    `);
    stmt.run([nextId, connectionId, name, sql, now, now]);
    stmt.free();

    const cleanup = dbInstance.prepare(
      "DELETE FROM snippets WHERE connection_id = ? AND id NOT IN (SELECT id FROM snippets WHERE connection_id = ? ORDER BY updated_at DESC LIMIT ?)",
    );
    cleanup.run([connectionId, connectionId, DEFAULT_SNIPPETS_LIMIT]);
    cleanup.free();

    dbInstance.run("COMMIT");
  } catch (err) {
    try {
      dbInstance.run("ROLLBACK");
    } catch (_) {}
    return {
      ok: false,
      error: err && err.message ? err.message : "Failed to save snippet.",
    };
  }
  persistDb(dbInstance);
  return { ok: true, id: nextId };
}

async function deleteSnippet(payload) {
  const connectionId =
    payload && payload.connectionId ? String(payload.connectionId) : "";
  if (!connectionId) return { ok: false, error: "Missing connectionId." };
  const id = payload && payload.id ? String(payload.id) : "";
  const name = payload && payload.name ? String(payload.name) : "";
  const dbInstance = await initDb();
  let stmt = null;
  if (id) {
    stmt = dbInstance.prepare(
      "DELETE FROM snippets WHERE connection_id = ? AND id = ?",
    );
    stmt.run([connectionId, id]);
  } else if (name) {
    stmt = dbInstance.prepare(
      "DELETE FROM snippets WHERE connection_id = ? AND name = ?",
    );
    stmt.run([connectionId, name]);
  }
  if (stmt) stmt.free();
  persistDb(dbInstance);
  return { ok: true };
}

async function listHistory(payload) {
  const connectionId =
    payload && payload.connectionId ? String(payload.connectionId) : "";
  if (!connectionId) return [];
  const limit =
    payload && Number.isFinite(Number(payload.limit))
      ? Math.max(1, Math.floor(Number(payload.limit)))
      : DEFAULT_HISTORY_LIMIT;
  const dbInstance = await initDb();
  const stmt = dbInstance.prepare(
    "SELECT sql, ts FROM query_history WHERE connection_id = ? ORDER BY ts DESC LIMIT ?",
  );
  stmt.bind([connectionId, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({ sql: row.sql, ts: row.ts || 0 }));
}

async function recordHistory(payload) {
  const connectionId =
    payload && payload.connectionId ? String(payload.connectionId) : "";
  const sql = payload && payload.sql ? String(payload.sql).trim() : "";
  if (!connectionId || !sql)
    return { ok: false, error: "Invalid history payload." };
  const ts = payload && payload.ts ? Number(payload.ts) : Date.now();
  const dbInstance = await initDb();
  const stmt = dbInstance.prepare(`
    INSERT INTO query_history (connection_id, sql, ts)
    VALUES (?, ?, ?)
    ON CONFLICT(connection_id, sql) DO UPDATE SET
      ts = excluded.ts
  `);
  stmt.run([connectionId, sql, ts]);
  stmt.free();

  const cleanup = dbInstance.prepare(
    "DELETE FROM query_history WHERE connection_id = ? AND sql NOT IN (SELECT sql FROM query_history WHERE connection_id = ? ORDER BY ts DESC LIMIT ?)",
  );
  cleanup.run([connectionId, connectionId, DEFAULT_HISTORY_LIMIT]);
  cleanup.free();

  persistDb(dbInstance);
  return { ok: true };
}

async function disconnect() {
  try {
    if (currentDriver) {
      await currentDriver.disconnect();
    }
  } finally {
    currentDriver = null;
    currentConnectionState = { readOnly: false, policyMode: POLICY_MODE_DEV };
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
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
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
  if (isMac) {
    windowOptions.titleBarStyle = "hiddenInset";
  } else if (isWindows || isLinux) {
    windowOptions.frame = true;
  } else {
    windowOptions.frame = false;
    windowOptions.titleBarOverlay = {
      color: "#0f172a",
      symbolColor: "#e2e8f0",
      height: 44,
    };
  }
  if (Number.isFinite(initialBounds.x) && Number.isFinite(initialBounds.y)) {
    windowOptions.x = initialBounds.x;
    windowOptions.y = initialBounds.y;
  }
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:/i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

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
  ensurePolicyRulesLoaded();
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

ipcMain.handle("history:list", async (_evt, payload) => {
  return listHistory(payload);
});

ipcMain.handle("history:record", async (_evt, payload) => {
  return recordHistory(payload);
});

ipcMain.handle("snippets:list", async (_evt, payload) => {
  return listSnippets(payload);
});

ipcMain.handle("snippets:save", async (_evt, payload) => {
  return saveSnippet(payload);
});

ipcMain.handle("snippets:delete", async (_evt, payload) => {
  return deleteSnippet(payload);
});

ipcMain.handle("connections:touch", async (_evt, name) => {
  return touchConnection(name);
});

ipcMain.handle("connections:export", async (evt) => {
  const owner =
    evt && evt.sender ? BrowserWindow.fromWebContents(evt.sender) : null;
  return exportConnections(owner);
});

ipcMain.handle("connections:import", async (evt) => {
  const owner =
    evt && evt.sender ? BrowserWindow.fromWebContents(evt.sender) : null;
  return importConnections(owner);
});

ipcMain.handle("settings:getPolicy", async () => {
  return { ok: true, policies: getPolicyRulesSnapshot() };
});

ipcMain.handle("settings:savePolicy", async (_evt, payload) => {
  try {
    const source =
      payload && typeof payload === "object" && payload.policies
        ? payload.policies
        : payload;
    const policies = savePolicyRules(source);
    return { ok: true, policies };
  } catch (err) {
    const message =
      err && err.message ? err.message : "Failed to save policy settings.";
    return { ok: false, error: message };
  }
});

ipcMain.handle("dialog:sqliteOpen", async (evt) => {
  try {
    const owner =
      evt && evt.sender ? BrowserWindow.fromWebContents(evt.sender) : null;
    const activeOwner =
      owner && !owner.isDestroyed()
        ? owner
        : BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    if (activeOwner && !activeOwner.isDestroyed()) activeOwner.focus();
    const openResult = await dialog.showOpenDialog({
      title: "Open SQLite database",
      buttonLabel: "Open",
      properties: ["openFile"],
      filters: [{ name: "SQLite", extensions: ["sqlite", "db", "sqlite3"] }],
    });
    if (
      !openResult ||
      openResult.canceled ||
      !openResult.filePaths ||
      !openResult.filePaths[0]
    ) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: openResult.filePaths[0] };
  } catch (err) {
    const message =
      err && err.message ? err.message : "Failed to open SQLite file.";
    return { ok: false, error: message };
  }
});

ipcMain.handle("dialog:sqliteSave", async (evt) => {
  try {
    const owner =
      evt && evt.sender ? BrowserWindow.fromWebContents(evt.sender) : null;
    const activeOwner =
      owner && !owner.isDestroyed()
        ? owner
        : BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    if (activeOwner && !activeOwner.isDestroyed()) activeOwner.focus();
    const defaultPath = path.join(app.getPath("documents"), "database.sqlite");
    const saveResult = await dialog.showSaveDialog({
      title: "Create SQLite database",
      buttonLabel: "Create",
      defaultPath,
      filters: [{ name: "SQLite", extensions: ["sqlite", "db", "sqlite3"] }],
    });
    if (!saveResult || saveResult.canceled || !saveResult.filePath) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: saveResult.filePath };
  } catch (err) {
    const message =
      err && err.message ? err.message : "Failed to save SQLite file.";
    return { ok: false, error: message };
  }
});

ipcMain.handle("db:connect", async (_evt, config) => {
  try {
    await disconnect();
    const normalizedConfig = {
      ...(config || {}),
      type: normalizeConnectionType(config && config.type),
      readOnly: isReadOnlyConfig(config),
      policyMode: getEntryPolicyMode(config),
    };
    const sshConfig = normalizeSshConfig(normalizedConfig.ssh);
    const driver = createDriver(normalizedConfig.type, {
      createTunnel: createSshTunnel,
      closeTunnel,
    });
    const res = await driver.connect(normalizedConfig, sshConfig);
    if (!res || !res.ok)
      return res || { ok: false, error: "Failed to connect." };
    currentDriver = driver;
    currentConnectionState = {
      readOnly: normalizedConfig.readOnly,
      policyMode: normalizedConfig.policyMode,
    };
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

ipcMain.handle("db:setSessionTimezone", async (_evt, payload) => {
  if (!currentDriver) return { ok: true, applied: false };
  if (!currentDriver.setSessionTimezone) {
    return { ok: false, error: "Session timezone not supported." };
  }
  return currentDriver.setSessionTimezone(payload);
});

ipcMain.handle("db:testConnection", async (_evt, config) => {
  try {
    const normalizedConfig = {
      ...(config || {}),
      type: normalizeConnectionType(config && config.type),
    };
    const sshConfig = normalizeSshConfig(normalizedConfig.ssh);
    const driver = createDriver(normalizedConfig.type, {
      createTunnel: createSshTunnel,
      closeTunnel,
    });
    return await driver.testConnection(normalizedConfig, sshConfig);
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
  const sql = extractSqlFromRunPayload(payload);
  if (currentConnectionState && currentConnectionState.readOnly) {
    const blockedAction = readOnlyViolation(sql);
    if (blockedAction) {
      return {
        ok: false,
        error: `Read-only connection blocks ${blockedAction} statements.`,
      };
    }
  }
  const policyMode = currentConnectionState
    ? currentConnectionState.policyMode
    : POLICY_MODE_DEV;
  const approvalToken = extractPolicyApproval(payload);
  const blockedByPolicy = policyViolation(sql, policyMode, approvalToken);
  if (blockedByPolicy) {
    return { ok: false, error: blockedByPolicy.message };
  }
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
