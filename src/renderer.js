import 'bootstrap-icons/font/bootstrap-icons.css';
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/hint/show-hint.css';
import CodeMirror from 'codemirror';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/addon/hint/sql-hint.js';
import { format as formatSql } from 'sql-formatter';

import { createHistoryManager } from './renderer/history.js';
import { createSnippetsManager } from './renderer/snippets.js';
import { createQueryRunner } from './renderer/queryRunner.js';
import { createResultsRenderer } from './renderer/resultsRenderer.js';
import { removeKeysByPrefix, readJson, writeJson } from './renderer/storage.js';
import { createTabsStateManager } from './renderer/tabsState.js';
import { createTableSearch } from './renderer/tableSearch.js';
import {
  buildConnectionBaseKey,
  buildConnectionKey,
  connectionTitle,
  getEntrySshConfig,
  isEntryReadOnly,
  isEntrySsh,
  makeRecentKey,
  normalizeKeyToBase
} from './renderer/connectionUtils.js';
import { getField, normalizeName } from './utils.js';

import {
  splitStatements,
  stripLeadingComments,
  firstDmlKeyword,
  hasMultipleStatementsWithSelect,
  insertWhere,
  isDangerousStatement
} from './sql.js';
import { renderTableTree, resetTreeCache } from './tree.js';

window.CodeMirror = CodeMirror;

const byId = (id) => document.getElementById(id);

const dbType = byId('dbType');
const host = byId('host');
const port = byId('port');
const user = byId('user');
const password = byId('password');
const database = byId('database');
const saveName = byId('saveName');
const readOnly = byId('readOnly');
const tabDirectBtn = byId('tabDirectBtn');
const tabSshBtn = byId('tabSshBtn');
const sshHost = byId('sshHost');
const sshPort = byId('sshPort');
const sshUser = byId('sshUser');
const sshPassword = byId('sshPassword');
const sshPrivateKey = byId('sshPrivateKey');
const sshPassphrase = byId('sshPassphrase');
const sshLocalPort = byId('sshLocalPort');
const sshFields = byId('sshFields');
const connectBtn = byId('connectBtn');
const saveBtn = byId('saveBtn');
const testBtn = byId('testBtn');
const clearFormBtn = byId('clearFormBtn');
const cancelEditBtn = byId('cancelEditBtn');
const savedList = byId('savedList');
const tableList = byId('tableList');
const tableSearch = byId('tableSearch');
const tableSearchClear = byId('tableSearchClear');
const recentList = byId('recentList');
const query = byId('query');
const runBtn = byId('runBtn');
const resultsTable = byId('resultsTable');
const resultsPanel = byId('resultsPanel');
const exitBtn = byId('exitBtn');
const mainScreen = byId('mainScreen');
const welcomeScreen = byId('welcomeScreen');
const querySpinner = byId('querySpinner');
const tabBar = byId('tabBar');
const connTabs = byId('connTabs');
const newTabBtn = byId('newTabBtn');
const connectSpinner = byId('connectSpinner');
const dbSelect = byId('dbSelect');
const formatBtn = byId('formatBtn');
const runSelectionBtn = byId('runSelectionBtn');
const limitSelect = byId('limitSelect');
const timeoutSelect = byId('timeoutSelect');
const queryFilter = byId('queryFilter');
const applyFilterBtn = byId('applyFilterBtn');
const countBtn = byId('countBtn');
const toggleEditorBtn = byId('toggleEditorBtn');
const editorBody = document.querySelector('.editor-body');
const queryStatus = byId('queryStatus');
const openConnectModalBtn = byId('openConnectModalBtn');
const quickConnectBtn = byId('quickConnectBtn');
const closeConnectModalBtn = byId('closeConnectModalBtn');
const homeBtn = byId('homeBtn');
const connectModal = byId('connectModal');
const connectModalBackdrop = byId('connectModalBackdrop');
const connectModalTitle = byId('connectModalTitle');
const connectModalSubtitle = byId('connectModalSubtitle');
const sidebarResizer = byId('sidebarResizer');
const editorResizer = byId('editorResizer');
const sidebar = document.querySelector('.tables');
const sidebarShell = byId('sidebarShell');
const mainLayout = document.querySelector('.main');
const editorPanel = document.querySelector('.editor');
const workspace = document.querySelector('.workspace');
const themeToggle = byId('themeToggle');
const sidebarTreeBtn = byId('sidebarTreeBtn');
const sidebarHistoryBtn = byId('sidebarHistoryBtn');
const sidebarSnippetsBtn = byId('sidebarSnippetsBtn');
const tablePanel = byId('tablePanel');
const historyPanel = byId('historyPanel');
const historyList = byId('historyList');
const snippetsPanel = byId('snippetsPanel');
const snippetsList = byId('snippetsList');
const addSnippetBtn = byId('addSnippetBtn');
const snippetModal = byId('snippetModal');
const snippetModalBackdrop = byId('snippetModalBackdrop');
const snippetCloseBtn = byId('snippetCloseBtn');
const snippetCancelBtn = byId('snippetCancelBtn');
const snippetSaveBtn = byId('snippetSaveBtn');
const snippetNameInput = byId('snippetNameInput');
const snippetQueryInput = byId('snippetQueryInput');
const stopBtn = byId('stopBtn');
const refreshSchemaBtn = byId('refreshSchemaBtn');
const tableSettingsBtn = byId('tableSettingsBtn');
const tableActionsBar = byId('tableActionsBar');
const tableRefreshBtn = byId('tableRefreshBtn');
const copyCellBtn = byId('copyCellBtn');
const copyRowBtn = byId('copyRowBtn');
const exportCsvBtn = byId('exportCsvBtn');
const exportJsonBtn = byId('exportJsonBtn');
const settingsModal = byId('settingsModal');
const settingsModalBackdrop = byId('settingsModalBackdrop');
const settingsCloseBtn = byId('settingsCloseBtn');
const settingsCancelBtn = byId('settingsCancelBtn');
const settingsClearBtn = byId('settingsClearBtn');
const settingsSubtitle = byId('settingsSubtitle');
const clearTabsOption = byId('clearTabs');
const clearHistoryOption = byId('clearHistory');
const clearSnippetsOption = byId('clearSnippets');
const clearTreeOption = byId('clearTreeState');

let isConnected = false;
let isReadOnly = false;
let currentHistoryKey = null;
let currentConnection = null;
let isRestoringTabs = false;
let saveTabsTimer = null;
const MAX_RENDER_ROWS = 2000;
let isLoading = false;
let isConnecting = false;
let connections = [];
let activeConnectionKey = null;
let connectedKey = null;
let tabs = [];
let activeTabId = null;
const tabsMemory = new Map();
const tableStateMemory = new Map();
const dbStateMemory = new Map();
let tabCounter = 1;
let editor = null;
let snippetEditor = null;
let isSettingEditor = false;
let isEditingConnection = false;
let treeExpanded = {};
let historyManager;
let snippetsManager;
const api = window.api;
const showErrorFallback = async (message) => {
  console.error('API indisponível:', message);
  if (message) {
    alert(message);
  }
};
const SAFE_EMPTY_LIST_METHODS = new Set([
  'listSavedConnections',
  'listTables',
  'listDatabases',
  'listColumns'
]);
const safeApi = new Proxy(
  {},
  {
    get(_target, prop) {
      if (api && typeof api[prop] !== 'undefined') {
        return api[prop];
      }
      if (prop === 'showError') {
        return showErrorFallback;
      }
      if (SAFE_EMPTY_LIST_METHODS.has(prop)) {
        return async () => [];
      }
      return async () => {
        await showErrorFallback('API do preload não encontrada.');
        return { ok: false, error: 'API indisponível.' };
      };
    }
  }
);
const RECENT_KEY = 'sqlEditor.recentConnections';
const SIDEBAR_KEY = 'sqlEditor.sidebarWidth';
const THEME_KEY = 'sqlEditor.theme';
const SIDEBAR_VIEW_KEY = 'sqlEditor.sidebarView';
const TIMEOUT_KEY = 'sqlEditor.queryTimeout';
const EDITOR_HEIGHT_KEY = 'sqlEditor.editorHeight';
const CLEANUP_KEY = 'sqlEditor.cleanup.v1';
const HISTORY_KEY = 'sqlEditor.queryHistory';
const SNIPPETS_KEY = 'sqlEditor.snippets';
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'ON',
  'GROUP',
  'ORDER',
  'BY',
  'LIMIT',
  'OFFSET',
  'HAVING',
  'AS',
  'DISTINCT',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'LIKE',
  'BETWEEN',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'UNION',
  'ALL',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'VIEW',
  'INDEX',
  'DATABASE',
  'PRIMARY',
  'KEY',
  'FOREIGN',
  'REFERENCES',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX'
];
let tableHints = [];
const tabsState = createTabsStateManager({
  getCurrentConnection: () => currentConnection,
  getCurrentHistoryKey: () => currentHistoryKey,
  getTabs: () => tabs,
  setTabs: (next) => {
    tabs = next;
  },
  getActiveTabId: () => activeTabId,
  setActiveTabId: (next) => {
    activeTabId = next;
  },
  getTabCounter: () => tabCounter,
  setTabCounter: (next) => {
    tabCounter = next;
  },
  tabsMemory,
  buildConnectionBaseKey,
  normalizeKeyToBase,
  renderTabBar: () => renderTabBar(),
  setActiveTab: (id) => setActiveTab(id),
  onRestoring: (value) => {
    isRestoringTabs = value;
  }
});
const resultsRenderer = createResultsRenderer({
  resultsTable,
  copyCellBtn,
  copyRowBtn,
  exportCsvBtn,
  exportJsonBtn,
  getActiveTab: () => getActiveTab(),
  onSort: (column) => applySort(column),
  showError: safeApi.showError,
  maxRows: MAX_RENDER_ROWS
});

function clearSelection() {
  resultsRenderer.clearSelection();
}

function updateSelectionActions() {
  resultsRenderer.updateSelectionActions();
}

function getResultsSnapshot() {
  return {
    html: resultsTable.innerHTML,
    className: resultsTable.className
  };
}

function restoreResultsSnapshot(snapshot) {
  if (!snapshot) return;
  resultsTable.innerHTML = snapshot.html;
  resultsTable.className = snapshot.className;
}

const queryRunner = createQueryRunner({
  safeApi,
  splitStatements,
  stripLeadingComments,
  firstDmlKeyword,
  hasMultipleStatementsWithSelect,
  insertWhere,
  isDangerousStatement,
  applyLimit: (sqlText) => applyLimit(sqlText),
  buildOrderBy: (sql, column, direction) => buildOrderBy(sql, column, direction),
  getTimeoutMs: () => getTimeoutMs(),
  getQueryValue: () => getQueryValue(),
  getWhereFilter: () => getWhereFilter(),
  getActiveTab: () => getActiveTab(),
  ensureActiveTab: () => ensureActiveTab(),
  ensureConnected: () => ensureConnected(),
  isReadOnly: () => isReadOnly,
  isTableTab: (tab) => isTableTab(tab),
  isTableEditor: (tab) => isTableEditor(tab),
  isLoading: () => isLoading,
  setLoading: (loading) => setLoading(loading),
  setQueryStatus: (state) => setQueryStatus(state),
  showError: (message) => safeApi.showError(message),
  getResultsSnapshot: () => getResultsSnapshot(),
  restoreResultsSnapshot: (snapshot) => restoreResultsSnapshot(snapshot),
  onResults: (rows, totalRows, tab) => {
    if (tab) tab.rows = rows;
    resultsRenderer.buildTable(rows, totalRows);
  },
  onEmptyResults: () => {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    clearSelection();
    updateSelectionActions();
  },
  onHistory: (sql) => {
    if (historyManager) historyManager.recordHistory(sql);
  }
});

function clearLocalStateOnce() {
  if (localStorage.getItem(CLEANUP_KEY) === '1') return;
  removeKeysByPrefix('sqlEditor.', { exclude: [CLEANUP_KEY] });
  tabsMemory.clear();
  tableStateMemory.clear();
  dbStateMemory.clear();
  treeExpanded = {};
  localStorage.setItem(CLEANUP_KEY, '1');
}

function setStatus() {
  // status view removed from topbar
}

function isSshTabActive() {
  if (!tabSshBtn) return false;
  return tabSshBtn.classList.contains('active');
}

function buildSshConfig() {
  const enabled = isSshTabActive();
  if (!enabled) return { enabled: false };
  return {
    enabled: true,
    host: sshHost ? sshHost.value.trim() : '',
    port: sshPort ? sshPort.value.trim() : '',
    user: sshUser ? sshUser.value.trim() : '',
    password: sshPassword ? sshPassword.value : '',
    privateKey: sshPrivateKey ? sshPrivateKey.value : '',
    passphrase: sshPassphrase ? sshPassphrase.value : '',
    localPort: sshLocalPort ? sshLocalPort.value.trim() : ''
  };
}

function setReadOnlyMode(enabled) {
  isReadOnly = !!enabled;
  const base = isReadOnly ? 'Conectado (somente leitura)' : 'Conectado';
  if (isConnected) setStatus(base, true);
}

function setCurrentConnection(entry) {
  currentConnection = entry ? { ...entry } : null;
  currentHistoryKey = buildConnectionKey(currentConnection);
  activeConnectionKey = currentHistoryKey;
  treeExpanded = tabsState.readTreeState();
  if (historyPanel && !historyPanel.classList.contains('hidden')) {
    historyManager.renderHistoryList();
  }
  if (snippetsPanel && !snippetsPanel.classList.contains('hidden')) {
    snippetsManager.renderSnippetsList();
  }
}

function formatTableTabTitle(schema, name) {
  const safeName = name || 'Tabela';
  const schemaName = schema || '';
  const currentDb = currentConnection && currentConnection.database ? currentConnection.database : '';
  if (dbType && dbType.value === 'postgres') {
    return schemaName ? `${schemaName}.${safeName}` : safeName;
  }
  if (!schemaName) return safeName;
  if (currentDb && normalizeName(schemaName) === normalizeName(currentDb)) return safeName;
  return `${schemaName}.${safeName}`;
}

function syncConnectionKeyForDatabase(nextDatabase) {
  if (!currentConnection) return;
  const previousKey = currentHistoryKey;
  const nextConnection = { ...currentConnection, database: nextDatabase || '' };
  const nextKey = buildConnectionKey(nextConnection);
  if (previousKey && nextKey && previousKey !== nextKey) {
    const baseKey = buildConnectionBaseKey(nextConnection);
    let sourceKey = previousKey;
    if (baseKey && !tabsState.hasStoredTabs(previousKey)) {
      const candidate = tabsState.findStoredTabsKeyForBase(baseKey);
      if (candidate) sourceKey = candidate;
    }
    tabsState.migrateConnectionState(sourceKey, nextKey);
    tabs.forEach((tab) => {
      if (tab.connectionKey === previousKey || tab.connectionKey === sourceKey) {
        tab.connection = { ...nextConnection };
        tab.connectionKey = nextKey;
      }
    });
    connections = connections.map((conn) => {
      if (conn.key !== previousKey) return conn;
      return {
        key: nextKey,
        title: connectionTitle(nextConnection),
        entry: { ...nextConnection }
      };
    });
    activeConnectionKey = nextKey;
  }
  setCurrentConnection(nextConnection);
  renderConnectionTabs();
}

function tryActivateExistingConnection(entry) {
  if (!entry) return false;
  const key = buildConnectionKey(entry);
  const existing = connections.find((conn) => conn.key === key);
  if (existing) {
    activateConnectionTab(existing.key);
    return true;
  }
  if (!entry.database) {
    const baseKey = buildConnectionBaseKey(entry);
    const loose = connections.find((conn) => buildConnectionBaseKey(conn.entry) === baseKey);
    if (loose) {
      activateConnectionTab(loose.key);
      return true;
    }
  }
  return false;
}

function upsertConnectionTab(entry) {
  const key = buildConnectionKey(entry);
  const existing = connections.find((conn) => conn.key === key);
  const title = connectionTitle(entry);
  if (existing) {
    existing.entry = { ...entry };
    existing.title = title;
  } else {
    connections.push({ key, title, entry: { ...entry } });
  }
  activeConnectionKey = key;
  renderConnectionTabs();
}

function removeConnectionTab(key) {
  connections = connections.filter((conn) => conn.key !== key);
  if (activeConnectionKey === key) {
    activeConnectionKey = connections.length ? connections[0].key : null;
  }
  renderConnectionTabs();
}

async function activateConnectionTab(key) {
  const target = connections.find((conn) => conn.key === key);
  if (!target) return;
  if (currentHistoryKey) {
    saveTabsState();
  }
  activeConnectionKey = key;
  setCurrentConnection(target.entry);
  setReadOnlyMode(isEntryReadOnly(target.entry));
  setScreen(true);
  resetTableState();
  if (dbSelect) dbSelect.innerHTML = '';
  const restored = restoreTabsStateWithFallback();
  if (!restored && tabs.length === 0) {
    createTab(`Query ${tabCounter++}`, '');
  }
  restoreCachedSchema();
  renderConnectionTabs();
}

function setTreeExpanded(key, expanded) {
  treeExpanded = tabsState.setTreeExpanded(treeExpanded, key, expanded);
}

function saveTabsState() {
  if (isRestoringTabs) return;
  tabsState.saveTabsState();
}

function scheduleSaveTabs() {
  if (isRestoringTabs) return;
  if (saveTabsTimer) clearTimeout(saveTabsTimer);
  saveTabsTimer = setTimeout(() => {
    saveTabsTimer = null;
    saveTabsState();
  }, 300);
}

function restoreTabsState() {
  return tabsState.restoreTabsState();
}

function restoreTabsStateWithFallback() {
  return tabsState.restoreTabsStateWithFallback();
}

function setSidebarView(view) {
  const next = view === 'history' ? 'history' : view === 'snippets' ? 'snippets' : 'tree';
  localStorage.setItem(SIDEBAR_VIEW_KEY, next);
  if (tablePanel) tablePanel.classList.toggle('hidden', next !== 'tree');
  if (historyPanel) historyPanel.classList.toggle('hidden', next !== 'history');
  if (snippetsPanel) snippetsPanel.classList.toggle('hidden', next !== 'snippets');
  if (sidebarTreeBtn) sidebarTreeBtn.classList.toggle('active', next === 'tree');
  if (sidebarHistoryBtn) sidebarHistoryBtn.classList.toggle('active', next === 'history');
  if (sidebarSnippetsBtn) sidebarSnippetsBtn.classList.toggle('active', next === 'snippets');
  if (next === 'history') historyManager.renderHistoryList();
  if (next === 'snippets') snippetsManager.renderSnippetsList();
}

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('theme-light', next === 'light');
  localStorage.setItem(THEME_KEY, next);
  if (themeToggle) {
    themeToggle.innerHTML = next === 'light' ? '<i class="bi bi-moon"></i>' : '<i class="bi bi-sun"></i>';
    themeToggle.title = next === 'light' ? 'Alternar para tema escuro' : 'Alternar para tema claro';
  }
  if (editor) {
    setTimeout(() => editor.refresh(), 0);
  }
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

function rebuildTableHints() {
  const next = new Set();
  tableCache.forEach((row) => {
    const schema = getField(row, ['table_schema', 'schema', 'table_schema_name']) || '';
    const name = getField(row, ['table_name', 'name', 'table']) || '';
    if (!name) return;
    next.add(name);
    if (schema) next.add(`${schema}.${name}`);
  });
  tableHints = Array.from(next).sort((a, b) => a.localeCompare(b));
}

function sqlHint(cm) {
  if (!cm) return null;
  const cur = cm.getCursor();
  const token = cm.getTokenAt(cur);
  if (token && token.type && /(comment|string)/.test(token.type)) return null;
  const line = cm.getLine(cur.line);
  let start = cur.ch;
  while (start > 0 && /[A-Za-z0-9_.$]/.test(line.charAt(start - 1))) {
    start -= 1;
  }
  const end = cur.ch;
  const word = line.slice(start, end);
  if (!word) return null;
  const upper = word.toUpperCase();
  const list = [];
  SQL_KEYWORDS.forEach((kw) => {
    if (kw.startsWith(upper)) list.push(kw);
  });
  tableHints.forEach((name) => {
    if (name.toUpperCase().startsWith(upper)) list.push(name);
  });
  if (list.length === 0) return null;
  return {
    list: Array.from(new Set(list)),
    from: window.CodeMirror.Pos(cur.line, start),
    to: window.CodeMirror.Pos(cur.line, end)
  };
}

function triggerAutocomplete(cm) {
  if (!cm) return;
  if (typeof cm.showHint === 'function') {
    cm.showHint({ hint: sqlHint, completeSingle: false });
    return;
  }
  if (window.CodeMirror && typeof window.CodeMirror.showHint === 'function') {
    window.CodeMirror.showHint(cm, sqlHint, { completeSingle: false });
  }
}

function setEditMode(enabled) {
  isEditingConnection = enabled;
  if (cancelEditBtn) cancelEditBtn.classList.toggle('hidden', !enabled);
}

function setConnectTab(tab) {
  const isSsh = tab === 'ssh';
  if (tabDirectBtn) tabDirectBtn.classList.toggle('active', !isSsh);
  if (tabSshBtn) tabSshBtn.classList.toggle('active', isSsh);
  if (sshFields) sshFields.classList.toggle('hidden', !isSsh);
}

function resetConnectionForm() {
  dbType.value = 'mysql';
  host.value = 'localhost';
  port.value = '';
  user.value = '';
  password.value = '';
  database.value = '';
  saveName.value = '';
  if (readOnly) readOnly.checked = false;
  setConnectTab('direct');
  if (sshHost) sshHost.value = '';
  if (sshPort) sshPort.value = '';
  if (sshUser) sshUser.value = '';
  if (sshPassword) sshPassword.value = '';
  if (sshPrivateKey) sshPrivateKey.value = '';
  if (sshPassphrase) sshPassphrase.value = '';
  if (sshLocalPort) sshLocalPort.value = '';
}

function loadSidebarWidth() {
  if (!sidebar) return;
  const raw = localStorage.getItem(SIDEBAR_KEY);
  const width = Number(raw);
  if (Number.isFinite(width) && width >= 200 && width <= 520) {
    sidebar.style.width = `${width}px`;
  }
}

function initSidebarResizer() {
  if (!sidebarResizer || !sidebar || !mainLayout) return;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  const onMove = (event) => {
    if (!dragging) return;
    const delta = event.clientX - startX;
    const next = Math.min(520, Math.max(200, startWidth + delta));
    sidebar.style.width = `${next}px`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const width = parseFloat(getComputedStyle(sidebar).width);
    if (Number.isFinite(width)) {
      localStorage.setItem(SIDEBAR_KEY, String(Math.round(width)));
    }
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  sidebarResizer.addEventListener('mousedown', (event) => {
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = parseFloat(getComputedStyle(sidebar).width) || sidebar.offsetWidth || 260;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function setConnectMode(mode) {
  const panel = connectModal ? connectModal.querySelector('.connect-panel') : null;
  if (panel) panel.classList.toggle('quick', mode === 'quick');
  if (connectModalTitle) {
    connectModalTitle.textContent = mode === 'quick' ? 'Conexão rápida' : 'Nova conexão';
  }
  if (connectModalSubtitle) {
    connectModalSubtitle.textContent =
      mode === 'quick'
        ? 'Conecte sem salvar a conexão.'
        : 'Preencha os dados para conectar ao banco.';
  }
  if (connectBtn) {
    connectBtn.textContent = mode === 'quick' ? 'Conectar rápido' : 'Conectar';
  }
}

function getEditorHeaderHeight() {
  if (!editorPanel) return 0;
  const tab = editorPanel.querySelector('.tab-bar');
  const toolbar = editorPanel.querySelector('.editor-toolbar');
  return (tab ? tab.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0);
}

function clampEditorBodyHeight(rawHeight) {
  const minEditor = 120;
  const minResults = 180;
  const resizerHeight = editorResizer ? editorResizer.offsetHeight : 6;
  const workspaceRect = workspace ? workspace.getBoundingClientRect() : null;
  const headerHeight = getEditorHeaderHeight();
  let maxBody = Number.isFinite(rawHeight) ? rawHeight : minEditor;

  if (workspaceRect && workspaceRect.height) {
    maxBody = workspaceRect.height - headerHeight - resizerHeight - minResults;
  }

  if (!Number.isFinite(maxBody)) {
    maxBody = minEditor;
  }

  if (maxBody < minEditor) {
    maxBody = minEditor;
  }

  const clamped = Math.min(Math.max(rawHeight, minEditor), maxBody);
  return Math.round(clamped);
}

function applyEditorBodyHeight(height, { save = true } = {}) {
  if (!editorBody) return;
  const next = clampEditorBodyHeight(height);
  editorBody.style.height = `${next}px`;
  if (editor && typeof editor.setSize === 'function') {
    editor.setSize('100%', next);
  }
  if (save) {
    localStorage.setItem(EDITOR_HEIGHT_KEY, String(next));
  }
}

function loadEditorHeight() {
  const raw = Number(localStorage.getItem(EDITOR_HEIGHT_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return;
  applyEditorBodyHeight(raw, { save: false });
}

function initEditorResizer() {
  if (!editorResizer || !editorPanel || !workspace) return;
  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  const onMove = (event) => {
    if (!dragging) return;
    const delta = event.clientY - startY;
    const rawHeight = startHeight + delta;
    applyEditorBodyHeight(rawHeight);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  editorResizer.addEventListener('mousedown', (event) => {
    event.preventDefault();
    dragging = true;
    startY = event.clientY;
    const current = parseFloat(editorBody ? editorBody.style.height : '');
    startHeight = Number.isFinite(current) && current > 0 ? current : (editorBody ? editorBody.offsetHeight : 220);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  window.addEventListener('resize', () => {
    const current = parseFloat(editorBody ? editorBody.style.height : '');
    if (Number.isFinite(current) && current > 0) {
      applyEditorBodyHeight(current, { save: false });
    }
  });
}

function openConnectModal({ keepForm = false, mode = 'full' } = {}) {
  if (!connectModal) return;
  if (!keepForm) {
    resetConnectionForm();
    setEditMode(false);
  }
  if (mode === 'quick') {
    saveName.value = '';
    setEditMode(false);
  }
  setConnectMode(mode);
  connectModal.classList.remove('hidden');
}

function closeConnectModal() {
  if (!connectModal) return;
  connectModal.classList.add('hidden');
  setEditMode(false);
  setConnectMode('full');
}

function setScreen(connected) {
  if (connected) {
    mainScreen.classList.remove('hidden');
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (sidebarShell) sidebarShell.classList.remove('hidden');
    if (dbSelect) dbSelect.classList.remove('hidden');
    if (sidebar) sidebar.classList.remove('hidden');
    if (sidebarResizer) sidebarResizer.classList.remove('hidden');
    if (editorResizer) editorResizer.classList.remove('hidden');
    if (editorPanel) editorPanel.classList.remove('hidden');
    if (resultsPanel) resultsPanel.classList.remove('hidden');
    setSidebarView('tree');
    if (editor) {
      setTimeout(() => editor.refresh(), 0);
    }
  } else {
    mainScreen.classList.remove('hidden');
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (sidebarShell) sidebarShell.classList.add('hidden');
    if (dbSelect) dbSelect.classList.add('hidden');
    if (sidebar) sidebar.classList.add('hidden');
    if (sidebarResizer) sidebarResizer.classList.add('hidden');
    if (editorResizer) editorResizer.classList.add('hidden');
    if (editorPanel) editorPanel.classList.add('hidden');
    if (resultsPanel) resultsPanel.classList.add('hidden');
    closeConnectModal();
    setReadOnlyMode(false);
  }
}

function goHome() {
  saveTabsState();
  isConnected = false;
  connectedKey = null;
  setCurrentConnection(null);
  activeConnectionKey = null;
  setReadOnlyMode(false);
  setScreen(false);
  closeSettingsModal();
  resetTableState();
  if (dbSelect) dbSelect.innerHTML = '';
  renderConnectionTabs();
}

function resetSettingsOptions() {
  if (clearTabsOption) clearTabsOption.checked = false;
  if (clearHistoryOption) clearHistoryOption.checked = false;
  if (clearSnippetsOption) clearSnippetsOption.checked = false;
  if (clearTreeOption) clearTreeOption.checked = false;
}

function openSettingsModal() {
  if (!settingsModal) return;
  if (!currentHistoryKey) {
    safeApi.showError('Conecte para gerenciar preferências.');
    return;
  }
  resetSettingsOptions();
  if (settingsSubtitle) {
    const title = currentConnection ? connectionTitle(currentConnection) : '';
    settingsSubtitle.textContent = title
      ? `Conexão: ${title}`
      : 'Limpar dados salvos desta conexão.';
  }
  settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.add('hidden');
}

function removeScopedPreference(prefix, historyKey) {
  if (!historyKey) return;
  try {
    localStorage.removeItem(`${prefix}:${historyKey}`);
  } catch (_) {
    // ignore
  }
}

function clearSelectedPreferences() {
  if (!currentHistoryKey) return;
  const selections = {
    tabs: !!(clearTabsOption && clearTabsOption.checked),
    history: !!(clearHistoryOption && clearHistoryOption.checked),
    snippets: !!(clearSnippetsOption && clearSnippetsOption.checked),
    tree: !!(clearTreeOption && clearTreeOption.checked)
  };
  const hasAny = Object.values(selections).some(Boolean);
  if (!hasAny) {
    safeApi.showError('Selecione ao menos uma opção para limpar.');
    return;
  }
  const confirmed = confirm('Limpar as preferências selecionadas desta conexão?');
  if (!confirmed) return;

  if (selections.tabs) {
    tabsState.clearTabsState();
    if (currentConnection && tabs.length === 0) {
      createTab(`Query ${tabCounter++}`, '');
    }
  }
  if (selections.history) {
    removeScopedPreference(HISTORY_KEY, currentHistoryKey);
    if (historyPanel && !historyPanel.classList.contains('hidden')) {
      historyManager.renderHistoryList();
    }
  }
  if (selections.snippets) {
    removeScopedPreference(SNIPPETS_KEY, currentHistoryKey);
    if (snippetsPanel && !snippetsPanel.classList.contains('hidden')) {
      snippetsManager.renderSnippetsList();
    }
  }
  if (selections.tree) {
    treeExpanded = tabsState.clearTreeState();
    renderSidebarTree(tableSearch ? tableSearch.value : '');
  }

  closeSettingsModal();
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function isTableTab(tab) {
  return !!tab && tab.kind === 'table';
}

function isTableEditor(tab) {
  return isTableTab(tab) && !!tab.showEditor;
}

function renderTabBar() {
  if (!tabBar) return;
  tabBar.innerHTML = '';
  if (newTabBtn) tabBar.appendChild(newTabBtn);
  tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.textContent = tab.title;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.innerHTML = '<i class="bi bi-x"></i>';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    el.appendChild(close);

    el.addEventListener('click', () => {
      activateTab(tab.id);
    });
    tabBar.appendChild(el);
  });
}

function renderConnectionTabs() {
  if (!connTabs) return;
  connTabs.innerHTML = '';
  connTabs.classList.toggle('hidden', connections.length === 0);
  if (homeBtn) homeBtn.classList.toggle('hidden', connections.length === 0);
  connections.forEach((conn) => {
    const el = document.createElement('div');
    el.className = 'conn-tab' + (conn.key === activeConnectionKey ? ' active' : '');
    el.textContent = conn.title;

    const close = document.createElement('span');
    close.className = 'conn-tab-close';
    close.innerHTML = '<i class="bi bi-x"></i>';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      handleCloseConnectionTab(conn.key);
    });
    el.appendChild(close);

    el.addEventListener('click', () => {
      activateConnectionTab(conn.key);
    });
    connTabs.appendChild(el);
  });
}

async function switchToTabConnection(tab, previousTabId) {
  if (!tab || !tab.connection) return;
  if (tab.connectionKey && tab.connectionKey === currentHistoryKey) return;
  const res = await connectWithLoading(tab.connection);
  if (!res.ok) {
    await safeApi.showError(res.error || 'Erro ao conectar.');
    if (previousTabId) setActiveTab(previousTabId);
    return;
  }
  isConnected = true;
  setCurrentConnection(tab.connection);
  setReadOnlyMode(isEntryReadOnly(tab.connection));
  setScreen(true);
  resetTableState();
  await refreshDatabases();
  await refreshTables();
}

function activateTab(tabId) {
  const previousTabId = activeTabId;
  setActiveTab(tabId);
  const tab = getActiveTab();
  if (tab && tab.connectionKey && tab.connectionKey !== currentHistoryKey) {
    switchToTabConnection(tab, previousTabId);
  }
}

function setActiveTab(tabId) {
  activeTabId = tabId;
  renderTabBar();
  const tab = getActiveTab();
  if (!tab) {
    setQueryValue('');
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    clearSelection();
    updateSelectionActions();
    return;
  }
  const tableTab = isTableTab(tab);
  const tableEditor = isTableEditor(tab);
  const filterEnabled = tableTab || !!tab.filterEnabled;
  if (queryFilter) {
    queryFilter.value = tab.filter || '';
    queryFilter.disabled = !filterEnabled;
  }
  if (editorBody) editorBody.classList.toggle('hidden', tableTab && !tableEditor);
  if (formatBtn) formatBtn.classList.toggle('hidden', tableTab && !tableEditor);
  if (runSelectionBtn) runSelectionBtn.classList.toggle('hidden', tableTab && !tableEditor);
  if (runBtn) runBtn.classList.toggle('hidden', tableTab && !tableEditor);
  if (applyFilterBtn) {
    applyFilterBtn.classList.toggle('hidden', false);
    applyFilterBtn.disabled = !filterEnabled || isLoading || isConnecting;
  }
  if (countBtn) {
    countBtn.disabled = !tableTab || isLoading || isConnecting;
  }
  if (toggleEditorBtn) {
    toggleEditorBtn.classList.toggle('hidden', !tableTab);
    toggleEditorBtn.classList.toggle('active', tableEditor);
  }
  if (tableActionsBar) {
    tableActionsBar.classList.toggle('hidden', false);
  }
  if (!tableTab) {
    setQueryValue(tab.query || '');
  } else {
    const text = tableEditor ? (tab.query || tab.baseQuery || '') : (tab.baseQuery || tab.query || '');
    setQueryValue(text, { focus: false });
  }
  if (tab.rows) {
    resultsRenderer.buildTable(tab.rows);
  } else {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    clearSelection();
    updateSelectionActions();
  }
  updateRunAvailability();
  scheduleSaveTabs();
}

function createTab(title, queryText, options = {}) {
  let resolvedTitle = title;
  let resolvedQuery = queryText;
  let resolvedOptions = options;

  if (typeof title === 'object' && title !== null) {
    resolvedOptions = title;
    resolvedTitle = resolvedOptions.title;
    resolvedQuery = resolvedOptions.query || '';
  }

  const connection = resolvedOptions.connection || currentConnection;
  if (!connection) {
    safeApi.showError('Conecte para criar uma aba.');
    return null;
  }

  const kind = resolvedOptions.kind || 'query';
  const baseQuery = resolvedOptions.baseQuery || (kind === 'table' ? resolvedQuery : '');
  const tab = {
    id: `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: resolvedTitle || `Query ${tabCounter++}`,
    query: resolvedQuery || '',
    baseQuery: baseQuery || '',
    filter: resolvedOptions.filter || '',
    filterEnabled: kind === 'table',
    filterSource: resolvedOptions.filterSource || '',
    rows: null,
    kind,
    showEditor: resolvedOptions.showEditor || false,
    connectionKey: buildConnectionKey(connection),
    connection: { ...connection }
  };
  tabs.push(tab);
  setActiveTab(tab.id);
  scheduleSaveTabs();
  return tab;
}

function createNewQueryTab(queryText) {
  const title = `Query ${tabCounter++}`;
  return createTab(title, queryText);
}

function handleCloseConnectionTab(key) {
  if (!key) return;
  if (currentHistoryKey === key) {
    saveTabsState();
    safeApi.disconnect();
    isConnected = false;
    connectedKey = null;
    setCurrentConnection(null);
    setReadOnlyMode(false);
    setScreen(false);
    resetTableState();
    if (dbSelect) dbSelect.innerHTML = '';
    tabs = [];
    activeTabId = null;
    tabCounter = 1;
  }
  removeConnectionTab(key);
  if (activeConnectionKey) {
    activateConnectionTab(activeConnectionKey);
  }
}

function closeTab(tabId) {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const wasActive = tabs[idx].id === activeTabId;
  tabs.splice(idx, 1);
  if (wasActive) {
    const next = tabs[idx] || tabs[idx - 1] || tabs[0] || null;
    if (next) activateTab(next.id);
    else {
      activeTabId = null;
      renderTabBar();
      if (currentConnection) {
        createTab(`Query ${tabCounter++}`, '');
      } else {
        safeApi.disconnect();
        setScreen(false);
        isConnected = false;
        setCurrentConnection(null);
        setStatus('Desconectado', false);
        setReadOnlyMode(false);
        resetTableState();
        if (dbSelect) dbSelect.innerHTML = '';
      }
    }
  } else {
    renderTabBar();
    scheduleSaveTabs();
  }
}

function ensureActiveTab() {
  let tab = getActiveTab();
  if (!tab) {
    if (!currentConnection) return null;
    tab = createTab(`Query ${tabCounter++}`, query.value || '');
  }
  return tab;
}

function showSkeleton() {
  resultsTable.innerHTML = '';
  resultsTable.className = 'skeleton';
  const cols = 4;
  const rows = 6;
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (let c = 0; c < cols; c++) {
    const th = document.createElement('th');
    const box = document.createElement('div');
    box.className = 'skeleton-box';
    th.appendChild(box);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  resultsTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      const box = document.createElement('div');
      box.className = 'skeleton-box';
      td.appendChild(box);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  resultsTable.appendChild(tbody);
}

function setLoading(loading) {
  isLoading = loading;
  if (runBtn) runBtn.disabled = loading;
  if (stopBtn) stopBtn.disabled = !loading;
  if (querySpinner) querySpinner.classList.toggle('hidden', !loading);
  if (resultsPanel) resultsPanel.classList.toggle('loading', loading);
  if (loading) showSkeleton();
  if (loading) setQueryStatus({ state: 'running', message: 'Executando...' });
  updateRunAvailability();
  updateSelectionActions();
}

function setConnecting(loading) {
  isConnecting = loading;
  if (connectSpinner) connectSpinner.classList.toggle('hidden', !loading);
  if (connectBtn) connectBtn.disabled = loading;
  if (saveBtn) saveBtn.disabled = loading;
  if (testBtn) testBtn.disabled = loading;
  if (clearFormBtn) clearFormBtn.disabled = loading;
  if (cancelEditBtn) cancelEditBtn.disabled = loading;
  if (dbSelect) dbSelect.disabled = loading;
  if (openConnectModalBtn) openConnectModalBtn.disabled = loading;
  if (quickConnectBtn) quickConnectBtn.disabled = loading;
  if (savedList) savedList.classList.toggle('is-connecting', loading);
  if (recentList) recentList.classList.toggle('is-connecting', loading);
  if (connectModal) connectModal.classList.toggle('is-connecting', loading);
  if (connTabs) connTabs.classList.toggle('is-connecting', loading);
  updateRunAvailability();
}

function setQueryStatus({ state, message, duration }) {
  if (!queryStatus) return;
  const parts = [];
  if (state === 'success') parts.push('Sucesso');
  if (state === 'error') parts.push('Erro');
  if (state === 'running') parts.push('Executando');
  if (message) parts.push(message);
  if (Number.isFinite(duration)) parts.push(`${Math.round(duration)}ms`);
  queryStatus.textContent = parts.join(' • ');
  queryStatus.className = `query-status${state ? ` ${state}` : ''}`;
}

async function ensureConnected() {
  if (!currentConnection) {
    await safeApi.showError('Conecte para continuar.');
    return false;
  }
  if (connectedKey === currentHistoryKey) return true;
  const res = await connectWithLoading(currentConnection);
  if (!res.ok) {
    await safeApi.showError(res.error || 'Erro ao conectar.');
    return false;
  }
  isConnected = true;
  connectedKey = currentHistoryKey;
  setReadOnlyMode(isEntryReadOnly(currentConnection));
  setScreen(true);
  return true;
}

function readRecentConnections() {
  const parsed = readJson(RECENT_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeRecentConnections(list) {
  writeJson(RECENT_KEY, list);
}


function recordRecentConnection(entry) {
  if (!entry) return;
  const list = readRecentConnections();
  const key = makeRecentKey(entry);
  const next = list.filter((item) => makeRecentKey(item) !== key);
  next.unshift({
    name: entry.name || '',
    type: entry.type,
    host: entry.host || 'localhost',
    port: entry.port || '',
    user: entry.user || '',
    password: entry.password || '',
    database: entry.database || '',
    readOnly: isEntryReadOnly(entry),
    ssh: getEntrySshConfig(entry),
    lastUsed: Date.now()
  });
  writeRecentConnections(next.slice(0, 8));
  renderRecentList();
}

function removeRecentConnection(entry) {
  if (!entry) return;
  const list = readRecentConnections();
  const key = makeRecentKey(entry);
  const next = list.filter((item) => makeRecentKey(item) !== key);
  writeRecentConnections(next);
  renderRecentList();
}

function renderRecentList() {
  if (!recentList) return;
  const list = readRecentConnections();
  recentList.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Nenhuma conexão recente.';
    recentList.appendChild(empty);
    return;
  }
  list.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'saved-item';

    const info = document.createElement('div');
    info.className = 'saved-info';

    const title = document.createElement('div');
    title.className = 'saved-title';
    title.textContent = entry.name || entry.database || entry.host || 'Conexão';

    const meta = document.createElement('div');
    meta.className = 'saved-meta';
    const roTag = isEntryReadOnly(entry) ? ' • RO' : '';
    const sshTag = isEntrySsh(entry) ? ' • SSH' : '';
    meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}${roTag}${sshTag}`;

    info.appendChild(title);
    info.appendChild(meta);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'saved-actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.innerHTML = '<i class="bi bi-x"></i>';
    removeBtn.title = 'Remover da lista';
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeRecentConnection(entry);
    });

    actions.appendChild(removeBtn);
    item.appendChild(actions);

    info.addEventListener('click', async () => {
      if (isConnecting) return;
      if (tryActivateExistingConnection(entry)) return;
      if (isConnected) saveTabsState();
      const res = await connectWithLoading({
        type: entry.type,
        host: entry.host || 'localhost',
        port: entry.port || undefined,
        user: entry.user || '',
        password: entry.password || '',
        database: entry.database || '',
        readOnly: isEntryReadOnly(entry),
        ssh: getEntrySshConfig(entry)
      });

      if (!res.ok) {
        await safeApi.showError(res.error || 'Erro ao conectar.');
        return;
      }
      recordRecentConnection(entry);
      isConnected = true;
      setCurrentConnection(entry);
      setReadOnlyMode(isEntryReadOnly(entry));
      setScreen(true);
      upsertConnectionTab(entry);
      connectedKey = currentHistoryKey;
      resetTableState();
      await refreshDatabases();
      const restored = restoreTabsStateWithFallback();
      if (!restored && tabs.length === 0) {
        createTab(`Query ${tabCounter++}`, '');
      }
      await refreshTables();
    });

    recentList.appendChild(item);
  });
}

async function refreshDatabases() {
  if (!dbSelect) return;
  const ok = await ensureConnected();
  if (!ok) return;
  const res = await safeApi.listDatabases();
  if (!res.ok) {
    await safeApi.showError(res.error || 'Erro ao listar databases.');
    return;
  }
  dbSelect.innerHTML = '';
  res.databases.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (res.current && res.current === name) opt.selected = true;
    dbSelect.appendChild(opt);
  });

  if ((!res.current || !dbSelect.value) && res.databases.length > 0) {
    dbSelect.value = res.databases[0];
    const useRes = await safeApi.useDatabase(dbSelect.value);
    if (!useRes.ok) {
      await safeApi.showError(useRes.error || 'Erro ao selecionar database.');
    }
  }
  if (currentConnection) {
    saveTabsState();
  }
  if (currentConnection && dbSelect.value) {
    syncConnectionKeyForDatabase(dbSelect.value);
  }
  if (currentHistoryKey) {
    dbStateMemory.set(currentHistoryKey, {
      databases: res.databases || [],
      current: res.current || dbSelect.value || ''
    });
  }
  restoreCachedSchema();
}

async function connectWithLoading(config) {
  if (isConnecting) return { ok: false, error: 'Conexão em andamento.' };
  setConnecting(true);
  try {
    return await safeApi.connect(config);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Erro ao conectar.' };
  } finally {
    setConnecting(false);
  }
}

async function testConnectionWithLoading(config) {
  if (isConnecting) return { ok: false, error: 'Conexão em andamento.' };
  setConnecting(true);
  try {
    return await safeApi.testConnection(config);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Erro ao testar conexão.' };
  } finally {
    setConnecting(false);
  }
}

function initEditor() {
  if (!window.CodeMirror || !query) return;
  editor = window.CodeMirror.fromTextArea(query, {
    mode: 'text/x-sql',
    lineNumbers: true,
    indentWithTabs: true,
    tabSize: 2,
    indentUnit: 2,
    lineWrapping: false,
    autofocus: true,
    extraKeys: {
      'Ctrl-Enter': () => {
        const tab = ensureActiveTab();
        if (!tab) {
          safeApi.showError('Conecte para executar queries.');
          return;
        }
        if (isTableTab(tab) && !isTableEditor(tab)) return;
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          safeApi.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        queryRunner.safeRunQueries(full).then(async (ok) => {
          if (ok) enableQueryFilter(tab, full);
          if (ok && isTableEditor(tab) && queryRunner.hasNonSelect(splitStatements(full))) {
            await queryRunner.runTableTabQuery(tab);
          }
        });
      },
      'Cmd-Enter': () => {
        const tab = ensureActiveTab();
        if (!tab) {
          safeApi.showError('Conecte para executar queries.');
          return;
        }
        if (isTableTab(tab) && !isTableEditor(tab)) return;
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          safeApi.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        queryRunner.safeRunQueries(full).then(async (ok) => {
          if (ok) enableQueryFilter(tab, full);
          if (ok && isTableEditor(tab) && queryRunner.hasNonSelect(splitStatements(full))) {
            await queryRunner.runTableTabQuery(tab);
          }
        });
      },
      'Shift-Enter': () => {
        const tab = ensureActiveTab();
        if (!tab) {
          safeApi.showError('Conecte para executar queries.');
          return;
        }
        if (isTableTab(tab) && !isTableEditor(tab)) return;
        const baseSql = getSelectionOrStatement(false);
        if (!baseSql) return;
        queryRunner.safeRunQueries(baseSql).then(async (ok) => {
          if (ok) enableQueryFilter(tab, baseSql);
          if (ok && isTableEditor(tab) && queryRunner.hasNonSelect(splitStatements(baseSql))) {
            await queryRunner.runTableTabQuery(tab);
          }
        });
      },
      'Shift-Alt-F': () => {
        formatSQL();
      },
      'Ctrl-Space': () => {
        triggerAutocomplete(editor);
      },
      'Cmd-T': () => {
        if (!currentConnection) {
          openConnectModal({ keepForm: false, mode: 'full' });
          return;
        }
        createTab(`Query ${tabCounter++}`, '');
      }
    }
  });

  editor.on('change', () => {
    if (isSettingEditor) return;
    const tab = getActiveTab();
    if (tab && !isTableTab(tab)) {
      tab.query = editor.getValue();
      if (tab.filterEnabled) {
        if (queryFilter && queryFilter.value.trim()) {
          queryFilter.value = '';
          tab.filter = '';
        }
        tab.filterSource = tab.query;
      }
    }
    updateRunAvailability();
    scheduleSaveTabs();
  });

  editor.on('inputRead', (cm, change) => {
    if (!change || !change.text || !change.text[0]) return;
    const ch = change.text[0];
    if (!/[A-Za-z0-9_.]/.test(ch)) return;
    triggerAutocomplete(cm);
  });

  loadEditorHeight();
}

function initSnippetEditor() {
  if (!window.CodeMirror || !snippetQueryInput) return;
  snippetEditor = window.CodeMirror.fromTextArea(snippetQueryInput, {
    mode: 'text/x-sql',
    lineNumbers: false,
    indentWithTabs: true,
    tabSize: 2,
    indentUnit: 2,
    lineWrapping: true,
    autofocus: false,
    extraKeys: {
      'Ctrl-Enter': () => {
        if (snippetsManager) snippetsManager.saveSnippetFromModal();
      },
      'Cmd-Enter': () => {
        if (snippetsManager) snippetsManager.saveSnippetFromModal();
      },
      'Esc': () => {
        if (snippetsManager) snippetsManager.closeSnippetModal();
      },
      'Ctrl-Space': () => {
        triggerAutocomplete(snippetEditor);
      }
    }
  });

  snippetEditor.on('inputRead', (cm, change) => {
    if (!change || !change.text || !change.text[0]) return;
    const ch = change.text[0];
    if (!/[A-Za-z0-9_.]/.test(ch)) return;
    triggerAutocomplete(cm);
  });
}

function getQueryValue() {
  const tab = getActiveTab();
  if (isTableTab(tab) && !isTableEditor(tab)) {
    return tab.baseQuery || tab.query || '';
  }
  return editor ? editor.getValue() : query.value;
}

function getSelectedQuery() {
  if (editor) {
    const selection = editor.getSelection();
    return selection && selection.trim() ? selection : null;
  }
  return null;
}

function getSelectionOrStatement(withLimit = true) {
  if (!editor) return null;
  const selection = editor.getSelection();
  if (selection && selection.trim()) {
    const trimmed = selection.trim();
    return withLimit ? applyLimit(trimmed) : trimmed;
  }

  const doc = editor.getDoc();
  const cursor = doc.getCursor();
  const fullText = doc.getValue();
  const cursorIndex = doc.indexFromPos(cursor);

  // Use splitStatements to properly parse, then find which statement the cursor is in
  const statements = splitStatements(fullText);
  if (statements.length <= 1) {
    const stmt = (statements[0] || '').trim();
    if (!stmt) return null;
    return withLimit ? applyLimit(stmt) : stmt;
  }

  // Map each statement back to its position in the original text
  let searchFrom = 0;
  for (const stmt of statements) {
    const idx = fullText.indexOf(stmt, searchFrom);
    if (idx === -1) continue;
    const stmtEnd = idx + stmt.length;
    // Find the semicolon after this statement (if any)
    const semiPos = fullText.indexOf(';', stmtEnd);
    const blockEnd = semiPos !== -1 ? semiPos + 1 : stmtEnd;
    if (cursorIndex >= idx && cursorIndex <= blockEnd) {
      const cleaned = stmt.trim();
      if (!cleaned) return null;
      return withLimit ? applyLimit(cleaned) : cleaned;
    }
    searchFrom = stmtEnd;
  }

  // Fallback: return the last statement if cursor is past all statements
  const last = statements[statements.length - 1].trim();
  if (!last) return null;
  return withLimit ? applyLimit(last) : last;
}

function applyLimit(sqlText) {
  if (!limitSelect) return sqlText;
  const value = limitSelect.value;
  if (!value || value === 'none') return sqlText;
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return sqlText;

  const clean = sqlText.trim().replace(/;$/, '');
  const upper = clean.toUpperCase();
  if (upper.includes(' LIMIT ')) return `${clean};`;
  return `${clean} LIMIT ${limit};`;
}

function getTimeoutMs() {
  if (!timeoutSelect) return 0;
  const value = timeoutSelect.value;
  if (!value || value === 'none') return 0;
  const ms = Number(value);
  return Number.isFinite(ms) ? ms : 0;
}

function getWhereFilter() {
  const tab = getActiveTab();
  if (tab && typeof tab.filter === 'string') return tab.filter.trim();
  return queryFilter && queryFilter.value ? queryFilter.value.trim() : '';
}

function enableQueryFilter(tab, baseSql) {
  if (!tab || isTableTab(tab)) return;
  tab.filterEnabled = true;
  tab.filterSource = baseSql || tab.query || '';
  if (queryFilter) queryFilter.disabled = false;
  updateRunAvailability();
}

function updateRunAvailability() {
  if (!runBtn) return;
  const tab = getActiveTab();
  const isTable = isTableTab(tab);
  const tableEditor = isTableEditor(tab);
  if (!tab) {
    runBtn.disabled = true;
  } else if (isTable && !tableEditor) {
    runBtn.disabled = true;
  } else {
    const sqlText = getQueryValue();
    const blocked = hasMultipleStatementsWithSelect(sqlText);
    const roBlocked = queryRunner.isReadOnlyViolation(sqlText);
    runBtn.disabled = blocked || roBlocked || isLoading || isConnecting;
  }

  if (applyFilterBtn) {
    const filterEnabled = !!tab && (isTable || tab.filterEnabled);
    applyFilterBtn.disabled = !filterEnabled || isLoading || isConnecting;
  }
  if (countBtn) {
    countBtn.disabled = !isTable || isLoading || isConnecting;
  }
  if (stopBtn) {
    stopBtn.disabled = !isLoading;
  }
}

function setQueryValue(value, options = {}) {
  const { focus = true, skipUpdate = false } = options;
  if (editor) {
    isSettingEditor = true;
    editor.setValue(value || '');
    if (focus) editor.focus();
    isSettingEditor = false;
  } else {
    query.value = value || '';
  }
  if (!skipUpdate) updateRunAvailability();
}

function formatSQL() {
  const tab = getActiveTab();
  if (isTableTab(tab)) return;
  if (typeof formatSql !== 'function') {
    safeApi.showError('Formatador SQL não disponível.');
    return;
  }
  const source = getQueryValue();
  if (!source.trim()) return;
  const language = dbType.value === 'postgres' ? 'postgresql' : 'mysql';
  const formatted = formatSql(source, { language });
  setQueryValue(formatted);
  if (tab) tab.query = formatted;
}


function quoteIdentifier(name) {
  if (!name) return name;
  const parts = String(name).split('.');
  if (dbType.value === 'postgres') {
    return parts.map((p) => (p.startsWith('"') ? p : `"${p.replace(/"/g, '""')}"`)).join('.');
  }
  return parts.map((p) => (p.startsWith('`') ? p : `\`${p.replace(/`/g, '``')}\``)).join('.');
}

function buildOrderBy(sql, column, direction) {
  const clean = sql.trim().replace(/;$/, '');
  const upper = clean.toUpperCase();
  const limitIndex = upper.lastIndexOf(' LIMIT ');
  const offsetIndex = upper.lastIndexOf(' OFFSET ');
  let cutIndex = -1;
  if (limitIndex !== -1) cutIndex = limitIndex;
  if (offsetIndex !== -1) cutIndex = cutIndex === -1 ? offsetIndex : Math.min(cutIndex, offsetIndex);

  let base = clean;
  let suffix = '';
  if (cutIndex !== -1) {
    base = clean.slice(0, cutIndex).trimEnd();
    suffix = clean.slice(cutIndex).trimStart();
  }

  const baseUpper = base.toUpperCase();
  const orderIndex = baseUpper.lastIndexOf(' ORDER BY ');
  if (orderIndex !== -1) {
    base = base.slice(0, orderIndex).trimEnd();
  }

  const orderExpr = `ORDER BY ${quoteIdentifier(column)} ${direction.toUpperCase()}`;
  const rebuilt = [base, orderExpr, suffix].filter(Boolean).join(' ');
  return `${rebuilt};`;
}

async function applySort(column) {
  const tab = getActiveTab();
  if (!tab) return;

  const sortState = tab.sort || { column: null, direction: 'asc' };
  if (sortState.column === column) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.column = column;
    sortState.direction = 'asc';
  }
  tab.sort = sortState;

  if (isTableTab(tab)) {
    const sql = queryRunner.buildTableSql(tab);
    await queryRunner.runQuery(sql, { storeQuery: false });
    return;
  }

  const sql = buildOrderBy(getQueryValue(), column, sortState.direction);
  setQueryValue(sql);
  await queryRunner.runQuery(sql);
}

function tableQuery(schema, table) {
  if (dbType.value === 'postgres') {
    return `SELECT * FROM "${schema}"."${table}";`;
  }
  if (schema) {
    return `SELECT * FROM \`${schema}\`.\`${table}\`;`;
  }
  return `SELECT * FROM \`${table}\`;`;
}

let tableCache = [];
function resetTableState() {
  tableCache = [];
  tableHints = [];
  resetTreeCache();
  tableList.innerHTML = '';
  if (tableSearch) tableSearch.value = '';
  resultsTable.innerHTML = '';
  clearSelection();
  updateSelectionActions();
}

function restoreCachedSchema() {
  const key = currentHistoryKey;
  if (!key) return;
  const tableState = tableStateMemory.get(key);
  if (tableState && Array.isArray(tableState.rows)) {
    tableCache = tableState.rows;
    rebuildTableHints();
    renderSidebarTree(tableSearch ? tableSearch.value : '');
  }
  const dbState = dbStateMemory.get(key);
  if (dbSelect && dbState && Array.isArray(dbState.databases)) {
    dbSelect.innerHTML = '';
    dbState.databases.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (dbState.current && dbState.current === name) opt.selected = true;
      dbSelect.appendChild(opt);
    });
  }
}

async function openTableTab(schema, name) {
  if (!currentConnection) {
    await safeApi.showError('Conecte para abrir tabelas.');
    return;
  }
  const sql = tableQuery(schema, name);
  const tab = createTab({
    title: formatTableTabTitle(schema, name),
    kind: 'table',
    baseQuery: sql,
    query: sql,
    filter: ''
  });
  if (tab) await queryRunner.runTableTabQuery(tab);
}

function renderSidebarTree(filterText) {
  renderTableTree({
    tableList,
    tableCache,
    filterText,
    activeSchema: currentConnection ? currentConnection.database || '' : '',
    onOpenTable: openTableTab,
    listColumns: safeApi.listColumns,
    onShowError: safeApi.showError,
    expandedState: treeExpanded,
    onToggleExpand: (key, expanded) => {
      setTreeExpanded(key, expanded);
    },
    onCopyName: async (name) => {
      if (!name) return;
      try {
        await navigator.clipboard.writeText(name);
      } catch (_) {
        await safeApi.showError('Não foi possível copiar.');
      }
    },
    onCopyQualified: async (schema, name) => {
      if (!name) return;
      const qualified = schema ? `${quoteIdentifier(schema)}.${quoteIdentifier(name)}` : quoteIdentifier(name);
      try {
        await navigator.clipboard.writeText(qualified);
      } catch (_) {
        await safeApi.showError('Não foi possível copiar.');
      }
    }
  });
}

async function refreshTables() {
  tableList.innerHTML = '';
  tableCache = [];
  const ok = await ensureConnected();
  if (!ok) return;
  const res = await safeApi.listTables();
  if (!res.ok) {
    await safeApi.showError(res.error || 'Erro ao listar tabelas.');
    return;
  }

  if (!res.rows || res.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(empty);
    return;
  }

  tableCache = res.rows;
  rebuildTableHints();
  renderSidebarTree(tableSearch.value);
  if (currentHistoryKey) {
    tableStateMemory.set(currentHistoryKey, {
      rows: tableCache
    });
  }
  restoreCachedSchema();
}

historyManager = createHistoryManager({
  historyList,
  getCurrentHistoryKey: () => currentHistoryKey,
  getActiveTab,
  isTableTab,
  isTableEditor,
  createNewQueryTab,
  setQueryValue
});

snippetsManager = createSnippetsManager({
  snippetsList,
  addSnippetBtn,
  snippetModal,
  snippetModalBackdrop,
  snippetCloseBtn,
  snippetCancelBtn,
  snippetSaveBtn,
  snippetNameInput,
  snippetQueryInput,
  getSnippetEditor: () => snippetEditor,
  getCurrentHistoryKey: () => currentHistoryKey,
  getQueryValue,
  getActiveTab,
  isTableTab,
  isTableEditor,
  createNewQueryTab,
  setQueryValue,
  updateRunAvailability,
  scheduleSaveTabs,
  enableQueryFilter,
  safeRunQueries: queryRunner.safeRunQueries,
  runTableTabQuery: queryRunner.runTableTabQuery,
  isReadOnlyViolation: queryRunner.isReadOnlyViolation,
  hasMultipleStatementsWithSelect,
  hasNonSelect: queryRunner.hasNonSelect,
  splitStatements,
  showError: safeApi.showError
});
snippetsManager.bindEvents();

async function refreshSaved() {
  const list = await safeApi.listSavedConnections();
  savedList.innerHTML = '';
  if (!Array.isArray(list) || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Nenhuma conexão salva.';
    savedList.appendChild(empty);
    return;
  }
  list.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'saved-item';

    const info = document.createElement('div');
    info.className = 'saved-info';

    const title = document.createElement('div');
    title.className = 'saved-title';
    title.textContent = entry.name;

    const meta = document.createElement('div');
    meta.className = 'saved-meta';
    {
      const roTag = isEntryReadOnly(entry) ? ' • RO' : '';
      const sshTag = isEntrySsh(entry) ? ' • SSH' : '';
      meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}${roTag}${sshTag}`;
    }

    info.appendChild(title);
    info.appendChild(meta);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'saved-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
    editBtn.title = 'Editar';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
    deleteBtn.title = 'Excluir';

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    info.addEventListener('click', async () => {
      if (isConnecting) return;
      if (tryActivateExistingConnection(entry)) return;
      if (isConnected) saveTabsState();
      const res = await connectWithLoading({
        type: entry.type,
        host: entry.host || 'localhost',
        port: entry.port || undefined,
        user: entry.user || '',
        password: entry.password || '',
        database: entry.database || '',
        readOnly: isEntryReadOnly(entry),
        ssh: getEntrySshConfig(entry)
      });

      if (!res.ok) {
        await safeApi.showError(res.error || 'Erro ao conectar.');
        return;
      }
      recordRecentConnection(entry);
      isConnected = true;
      setCurrentConnection(entry);
      setReadOnlyMode(isEntryReadOnly(entry));
      setScreen(true);
      upsertConnectionTab(entry);
      connectedKey = currentHistoryKey;
      const restored = restoreTabsState();
      if (!restored && tabs.length === 0) {
        createTab(`Query ${tabCounter++}`, '');
      }
      resetTableState();
      await refreshDatabases();
      await refreshTables();
    });

    editBtn.addEventListener('click', () => {
      dbType.value = entry.type;
      host.value = entry.host;
      port.value = entry.port || '';
      user.value = entry.user || '';
      password.value = entry.password || '';
      database.value = entry.database || '';
      saveName.value = entry.name;
      if (readOnly) readOnly.checked = isEntryReadOnly(entry);
      const ssh = getEntrySshConfig(entry);
      setConnectTab(ssh.enabled ? 'ssh' : 'direct');
      if (sshHost) sshHost.value = ssh.host || '';
      if (sshPort) sshPort.value = ssh.port || '';
      if (sshUser) sshUser.value = ssh.user || '';
      if (sshPassword) sshPassword.value = ssh.password || '';
      if (sshPrivateKey) sshPrivateKey.value = ssh.privateKey || '';
      if (sshPassphrase) sshPassphrase.value = ssh.passphrase || '';
      if (sshLocalPort) sshLocalPort.value = ssh.localPort || '';
      setEditMode(true);
      openConnectModal({ keepForm: true, mode: 'full' });
    });

    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm(`Remover conexão "${entry.name}"?`);
      if (!confirmed) return;
      await safeApi.deleteConnection(entry.name);
      await refreshSaved();
    });

    savedList.appendChild(item);
  });
}

connectBtn.addEventListener('click', async () => {
  if (isConnected) saveTabsState();
  const config = {
    type: dbType.value,
    host: host.value || 'localhost',
    port: port.value || undefined,
    user: user.value || '',
    password: password.value || '',
    database: database.value || '',
    readOnly: readOnly ? readOnly.checked : false,
    ssh: buildSshConfig()
  };

  if (tryActivateExistingConnection(config)) {
    closeConnectModal();
    return;
  }

  const res = await connectWithLoading(config);
  if (!res.ok) {
    await safeApi.showError(res.error || 'Erro ao conectar.');
    return;
  }
  recordRecentConnection(config);
  isConnected = true;
  setCurrentConnection(config);
  setReadOnlyMode(!!config.readOnly);
  setScreen(true);
  upsertConnectionTab(config);
  connectedKey = currentHistoryKey;
  resetTableState();
  await refreshDatabases();
  const restored = restoreTabsStateWithFallback();
  if (!restored && tabs.length === 0) {
    createTab(`Query ${tabCounter++}`, '');
  }
  await refreshTables();
  closeConnectModal();
});

saveBtn.addEventListener('click', async () => {
  if (!saveName.value.trim()) {
    await safeApi.showError('Informe um nome para salvar.');
    return;
  }

  const ssh = buildSshConfig();
  const entry = {
    name: saveName.value.trim(),
    type: dbType.value,
    host: host.value || 'localhost',
    port: port.value || '',
    user: user.value || '',
    password: password.value || '',
    database: database.value || '',
    read_only: readOnly ? (readOnly.checked ? 1 : 0) : 0,
    ssh_enabled: ssh.enabled ? 1 : 0,
    ssh_host: ssh.host || '',
    ssh_port: ssh.port || '',
    ssh_user: ssh.user || '',
    ssh_password: ssh.password || '',
    ssh_private_key: ssh.privateKey || '',
    ssh_passphrase: ssh.passphrase || '',
    ssh_local_port: ssh.localPort || ''
  };

  const testRes = await testConnectionWithLoading(entry);
  if (!testRes.ok) {
    await safeApi.showError(testRes.error || 'Falha ao validar conexão.');
    return;
  }

  await safeApi.saveConnection(entry);
  await refreshSaved();
  setEditMode(false);
  closeConnectModal();
});

cancelEditBtn.addEventListener('click', () => {
  resetConnectionForm();
  setEditMode(false);
  closeConnectModal();
});

clearFormBtn.addEventListener('click', () => {
  resetConnectionForm();
  setEditMode(false);
});

testBtn.addEventListener('click', async () => {
  const entry = {
    name: saveName.value.trim(),
    type: dbType.value,
    host: host.value || 'localhost',
    port: port.value || '',
    user: user.value || '',
    password: password.value || '',
    database: database.value || '',
    ssh: buildSshConfig()
  };

  const testRes = await testConnectionWithLoading(entry);
  if (!testRes.ok) {
    await safeApi.showError(testRes.error || 'Falha ao validar conexão.');
    return;
  }
  await safeApi.showError('Conexão OK.');
});

if (exitBtn) {
  exitBtn.addEventListener('click', async () => {
    if (!currentHistoryKey) return;
    saveTabsState();
    handleCloseConnectionTab(currentHistoryKey);
  });
}

if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    goHome();
  });
}

runBtn.addEventListener('click', async () => {
  const tab = ensureActiveTab();
  if (!tab) {
    await safeApi.showError('Conecte para executar queries.');
    return;
  }
  if (isTableTab(tab) && !isTableEditor(tab)) {
    await queryRunner.runTableTabQuery(tab);
    return;
  }
  const full = getQueryValue();
  if (queryRunner.isReadOnlyViolation(full)) {
    await safeApi.showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
    return;
  }
  if (hasMultipleStatementsWithSelect(full)) {
    await safeApi.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
    return;
  }
  const ok = await queryRunner.safeRunQueries(full);
  if (ok) enableQueryFilter(tab, full);
  if (ok && isTableEditor(tab) && queryRunner.hasNonSelect(splitStatements(full))) {
    await queryRunner.runTableTabQuery(tab);
  }
});

runSelectionBtn.addEventListener('click', async () => {
  const tab = ensureActiveTab();
  if (!tab) {
    await safeApi.showError('Conecte para executar queries.');
    return;
  }
  if (isTableTab(tab) && !isTableEditor(tab)) return;
  const baseSql = getSelectionOrStatement(false);
  if (!baseSql) {
    await safeApi.showError('Selecione um trecho ou posicione o cursor em uma instrução.');
    return;
  }
  if (queryRunner.isReadOnlyViolation(baseSql)) {
    await safeApi.showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
    return;
  }
  try {
    const ok = await queryRunner.safeRunQueries(baseSql);
    if (ok) enableQueryFilter(tab, baseSql);
    if (ok && isTableEditor(tab) && queryRunner.hasNonSelect(splitStatements(baseSql))) {
      await queryRunner.runTableTabQuery(tab);
    }
  } catch (err) {
    await safeApi.showError(err && err.message ? err.message : 'Erro ao executar seleção.');
  }
});

if (queryFilter) {
  queryFilter.addEventListener('input', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.filter = queryFilter.value;
    if (isTableTab(tab)) return;
    if (!tab.filterEnabled) return;
    const filter = queryFilter.value.trim();
    const base = tab.filterSource || tab.query || getQueryValue();
    if (!tab.filterSource) tab.filterSource = base;
    const nextSql = filter ? insertWhere(base, filter) : base;
    setQueryValue(nextSql, { focus: false, skipUpdate: true });
    tab.query = nextSql;
    updateRunAvailability();
    scheduleSaveTabs();
  });

  queryFilter.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const tab = getActiveTab();
    if (!tab) return;
    if (isTableTab(tab)) {
      await queryRunner.runTableTabQuery(tab);
      return;
    }
    if (!tab || !tab.filterEnabled) return;
    const base = tab.filterSource || tab.query || getQueryValue();
    const filter = queryFilter.value.trim();
    const nextSql = filter ? insertWhere(base, filter) : base;
    setQueryValue(nextSql, { focus: false, skipUpdate: true });
    tab.query = nextSql;
    updateRunAvailability();
    scheduleSaveTabs();
    if (hasMultipleStatementsWithSelect(nextSql)) {
      await safeApi.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    await queryRunner.safeRunQueries(nextSql);
  });
}

if (applyFilterBtn) {
  applyFilterBtn.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (isTableTab(tab)) {
      await queryRunner.runTableTabQuery(tab);
      return;
    }
    if (!tab.filterEnabled) return;
    const filter = queryFilter ? queryFilter.value.trim() : '';
    const base = tab.filterSource || tab.query || getQueryValue();
    const nextSql = filter ? insertWhere(base, filter) : base;
    setQueryValue(nextSql, { focus: false, skipUpdate: true });
    tab.query = nextSql;
    updateRunAvailability();
    scheduleSaveTabs();
    if (hasMultipleStatementsWithSelect(nextSql)) {
      await safeApi.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    await queryRunner.safeRunQueries(nextSql);
  });
}

if (openConnectModalBtn) {
  openConnectModalBtn.addEventListener('click', () => {
    openConnectModal({ mode: 'full' });
  });
}

if (quickConnectBtn) {
  quickConnectBtn.addEventListener('click', () => {
    openConnectModal({ mode: 'quick' });
  });
}

if (tabDirectBtn) {
  tabDirectBtn.addEventListener('click', () => {
    setConnectTab('direct');
  });
}

if (tabSshBtn) {
  tabSshBtn.addEventListener('click', () => {
    setConnectTab('ssh');
  });
}

if (closeConnectModalBtn) {
  closeConnectModalBtn.addEventListener('click', () => {
    closeConnectModal();
  });
}

if (connectModalBackdrop) {
  connectModalBackdrop.addEventListener('click', () => {
    closeConnectModal();
  });
}

query.addEventListener('keydown', async (event) => {
  const tab = getActiveTab();
  if (isTableTab(tab) && !isTableEditor(tab)) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    const active = ensureActiveTab();
    if (!active) {
      await safeApi.showError('Conecte para executar queries.');
      return;
    }
    const full = getQueryValue();
    if (hasMultipleStatementsWithSelect(full)) {
      await safeApi.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    const ok = await queryRunner.safeRunQueries(full);
    if (ok) enableQueryFilter(tab, full);
    if (ok && isTableEditor(tab) && queryRunner.hasNonSelect(splitStatements(full))) {
      await queryRunner.runTableTabQuery(tab);
    }
  }
});

createTableSearch({
  input: tableSearch,
  clearButton: tableSearchClear,
  onSearch: (value) => renderSidebarTree(value),
  onClear: () => renderSidebarTree('')
});

newTabBtn.addEventListener('click', () => {
  if (!currentConnection) {
    openConnectModal({ keepForm: false, mode: 'full' });
    return;
  }
  createTab(`Query ${tabCounter++}`, '');
});

limitSelect.addEventListener('change', () => {
  updateRunAvailability();
});

formatBtn.addEventListener('click', () => {
  formatSQL();
});

if (countBtn) {
  countBtn.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!isTableTab(tab)) return;
    tab.filter = getWhereFilter();
    const sql = queryRunner.buildCountSql(tab);
    if (!sql) {
      await safeApi.showError('Não foi possível montar o COUNT.');
      return;
    }
    await queryRunner.runQuery(sql, { storeQuery: false });
  });
}

if (toggleEditorBtn) {
  toggleEditorBtn.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!isTableTab(tab)) return;
    tab.showEditor = !tab.showEditor;
    if (tab.showEditor && !tab.query) {
      tab.query = tab.baseQuery || '';
    }
    setActiveTab(tab.id);
    updateRunAvailability();
    scheduleSaveTabs();
  });
}

if (tableRefreshBtn) {
  tableRefreshBtn.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!isTableTab(tab)) return;
    await queryRunner.runTableTabQuery(tab);
  });
}

dbSelect.addEventListener('change', async () => {
  const name = dbSelect.value;
  if (!name) return;
  setConnecting(true);
  const res = await safeApi.useDatabase(name);
  setConnecting(false);
  if (!res.ok) {
    await safeApi.showError(res.error || 'Erro ao trocar database.');
    return;
  }
  saveTabsState();
  if (currentConnection) syncConnectionKeyForDatabase(name);
  resetTableState();
  await refreshTables();
});

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    toggleTheme();
  });
}

if (timeoutSelect) {
  timeoutSelect.addEventListener('change', () => {
    localStorage.setItem(TIMEOUT_KEY, timeoutSelect.value);
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', async () => {
    if (!isLoading) return;
    setQueryStatus({ state: 'running', message: 'Cancelando...' });
    const res = await safeApi.cancelQuery();
    if (!res || !res.ok) {
      await safeApi.showError((res && res.error) || 'Erro ao cancelar query.');
    }
  });
}

if (sidebarTreeBtn) {
  sidebarTreeBtn.addEventListener('click', () => {
    setSidebarView('tree');
  });
}

if (sidebarHistoryBtn) {
  sidebarHistoryBtn.addEventListener('click', () => {
    setSidebarView('history');
  });
}

if (sidebarSnippetsBtn) {
  sidebarSnippetsBtn.addEventListener('click', () => {
    setSidebarView('snippets');
  });
}

if (refreshSchemaBtn) {
  refreshSchemaBtn.addEventListener('click', async () => {
    if (!isConnected) {
      await safeApi.showError('Conecte para atualizar o schema.');
      return;
    }
    resetTableState();
    await refreshTables();
  });
}

if (tableSettingsBtn) {
  tableSettingsBtn.addEventListener('click', () => {
    openSettingsModal();
  });
}

if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener('click', () => {
    closeSettingsModal();
  });
}

if (settingsCancelBtn) {
  settingsCancelBtn.addEventListener('click', () => {
    closeSettingsModal();
  });
}

if (settingsModalBackdrop) {
  settingsModalBackdrop.addEventListener('click', () => {
    closeSettingsModal();
  });
}

if (settingsClearBtn) {
  settingsClearBtn.addEventListener('click', () => {
    clearSelectedPreferences();
  });
}

async function bootstrap() {
  clearLocalStateOnce();
  setStatus('Desconectado', false);
  setScreen(false);
  if (!api) {
    console.error('API do preload não encontrada. Verifique o caminho do preload.');
  }
  refreshSaved();
  renderRecentList();
  initEditor();
  initSnippetEditor();
  loadSidebarWidth();
  initSidebarResizer();
  initEditorResizer();
  setQueryValue('');
  resetConnectionForm();
  setEditMode(false);
  renderConnectionTabs();
  if (timeoutSelect) {
    const savedTimeout = localStorage.getItem(TIMEOUT_KEY);
    if (savedTimeout) timeoutSelect.value = savedTimeout;
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  setSidebarView(localStorage.getItem(SIDEBAR_VIEW_KEY) || 'tree');
}

bootstrap();
