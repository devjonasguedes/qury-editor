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

const connStatus = byId('connStatus');
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
const tableActionsBar = byId('tableActionsBar');
const tableRefreshBtn = byId('tableRefreshBtn');
const copyCellBtn = byId('copyCellBtn');
const copyRowBtn = byId('copyRowBtn');
const exportCsvBtn = byId('exportCsvBtn');
const exportJsonBtn = byId('exportJsonBtn');

let isConnected = false;
let isReadOnly = false;
let currentHistoryKey = null;
let currentConnection = null;
let isRestoringTabs = false;
let saveTabsTimer = null;
const MAX_RENDER_ROWS = 2000;
let isLoading = false;
let isConnecting = false;
let tabs = [];
let activeTabId = null;
let tabCounter = 1;
let editor = null;
let snippetEditor = null;
let isSettingEditor = false;
let isEditingConnection = false;
let searchTimer = null;
let treeExpanded = {};
let selectedCell = null;
let selectedRow = null;
let selectedCellEl = null;
let selectedRowEl = null;
let historyManager;
let snippetsManager;
const api = window.api;
const showErrorFallback = async (message) => {
  console.error('API indisponível:', message);
  if (message) {
    alert(message);
  }
};
const RECENT_KEY = 'sqlEditor.recentConnections';
const SIDEBAR_KEY = 'sqlEditor.sidebarWidth';
const THEME_KEY = 'sqlEditor.theme';
const SIDEBAR_VIEW_KEY = 'sqlEditor.sidebarView';
const TIMEOUT_KEY = 'sqlEditor.queryTimeout';
const TABS_KEY = 'sqlEditor.tabsState';
const TREE_STATE_KEY = 'sqlEditor.treeState';
const EDITOR_HEIGHT_KEY = 'sqlEditor.editorHeight';
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

function setStatus(text, ok) {
  connStatus.textContent = text;
  connStatus.style.color = ok ? '#22c55e' : '#fbbf24';
}

function isEntryReadOnly(entry) {
  if (!entry) return false;
  return !!(entry.readOnly || entry.read_only);
}

function isEntrySsh(entry) {
  if (!entry) return false;
  if (entry.ssh && entry.ssh.enabled) return true;
  return !!(entry.ssh_enabled || entry.sshEnabled);
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

function getEntrySshConfig(entry) {
  if (!entry || !isEntrySsh(entry)) return { enabled: false };
  const ssh = entry.ssh || {};
  return {
    enabled: true,
    host: ssh.host || entry.ssh_host || entry.sshHost || '',
    port: ssh.port || entry.ssh_port || entry.sshPort || '',
    user: ssh.user || entry.ssh_user || entry.sshUser || '',
    password: ssh.password || entry.ssh_password || entry.sshPassword || '',
    privateKey: ssh.privateKey || entry.ssh_private_key || entry.sshPrivateKey || '',
    passphrase: ssh.passphrase || entry.ssh_passphrase || entry.sshPassphrase || '',
    localPort: ssh.localPort || entry.ssh_local_port || entry.sshLocalPort || ''
  };
}

function setReadOnlyMode(enabled) {
  isReadOnly = !!enabled;
  const base = isReadOnly ? 'Conectado (somente leitura)' : 'Conectado';
  if (isConnected) setStatus(base, true);
}

function buildConnectionKey(entry) {
  if (!entry) return null;
  const ssh = getEntrySshConfig(entry);
  return [
    entry.type || '',
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.database || '',
    isEntryReadOnly(entry) ? 'ro' : 'rw',
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || ''
  ].join('|');
}

function setCurrentConnection(entry) {
  currentConnection = entry ? { ...entry } : null;
  currentHistoryKey = buildConnectionKey(currentConnection);
  treeExpanded = readTreeState();
  if (historyPanel && !historyPanel.classList.contains('hidden')) {
    historyManager.renderHistoryList();
  }
  if (snippetsPanel && !snippetsPanel.classList.contains('hidden')) {
    snippetsManager.renderSnippetsList();
  }
}

function treeStateKey() {
  if (!currentHistoryKey) return null;
  return `${TREE_STATE_KEY}:${currentHistoryKey}`;
}

function readTreeState() {
  try {
    const key = treeStateKey();
    if (!key) return {};
    const raw = localStorage.getItem(key);
    const data = JSON.parse(raw || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function writeTreeState() {
  const key = treeStateKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(treeExpanded));
  } catch (_) {
    // ignore
  }
}

function setTreeExpanded(key, expanded) {
  if (!key) return;
  treeExpanded[key] = !!expanded;
  writeTreeState();
}

function tabsStorageKey() {
  if (!currentHistoryKey) return null;
  return `${TABS_KEY}:${currentHistoryKey}`;
}

function saveTabsState() {
  if (isRestoringTabs) return;
  const key = tabsStorageKey();
  if (!key) return;
  const snapshot = {
    activeTabId,
    tabCounter,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      query: tab.query,
      baseQuery: tab.baseQuery,
      filter: tab.filter,
      filterEnabled: tab.filterEnabled,
      filterSource: tab.filterSource,
      kind: tab.kind,
      showEditor: tab.showEditor,
      sort: tab.sort || null
    }))
  };
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (_) {
    // ignore
  }
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
  const key = tabsStorageKey();
  if (!key) return false;
  let snapshot = null;
  try {
    const raw = localStorage.getItem(key);
    snapshot = raw ? JSON.parse(raw) : null;
  } catch (_) {
    snapshot = null;
  }

  isRestoringTabs = true;
  tabs = [];
  activeTabId = null;
  tabCounter = 1;

  if (snapshot && Array.isArray(snapshot.tabs) && snapshot.tabs.length > 0) {
    tabCounter = snapshot.tabCounter || snapshot.tabs.length + 1;
    tabs = snapshot.tabs.map((saved) => ({
      id: saved.id || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: saved.title || `Query ${tabCounter++}`,
      query: saved.query || '',
      baseQuery: saved.baseQuery || '',
      filter: saved.filter || '',
      filterEnabled: saved.filterEnabled || false,
      filterSource: saved.filterSource || '',
      rows: null,
      kind: saved.kind || 'query',
      showEditor: saved.showEditor || false,
      sort: saved.sort || null
    }));
    activeTabId = snapshot.activeTabId && tabs.some((t) => t.id === snapshot.activeTabId)
      ? snapshot.activeTabId
      : tabs[0].id;
    renderTabBar();
    setActiveTab(activeTabId);
    isRestoringTabs = false;
    return true;
  }

  renderTabBar();
  createTab(`Query ${tabCounter++}`, '');
  isRestoringTabs = false;
  return false;
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

function getField(row, candidates) {
  for (const key of candidates) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  const lower = Object.keys(row || {}).reduce((acc, k) => {
    acc[k.toLowerCase()] = row[k];
    return acc;
  }, {});
  for (const key of candidates) {
    const val = lower[key.toLowerCase()];
    if (val !== undefined) return val;
  }
  return undefined;
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

  const onMove = (event) => {
    if (!dragging) return;
    const rect = mainLayout.getBoundingClientRect();
    const next = Math.min(520, Math.max(200, event.clientX - rect.left));
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

  const onMove = (event) => {
    if (!dragging) return;
    const panelRect = editorPanel.getBoundingClientRect();
    const headerHeight = getEditorHeaderHeight();
    const rawHeight = event.clientY - panelRect.top - headerHeight;
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
    exitBtn.classList.remove('hidden');
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
    exitBtn.classList.add('hidden');
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

function buildTable(rows, totalRows) {
  clearSelection();
  resultsTable.innerHTML = '';
  resultsTable.className = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    updateSelectionActions();
    return;
  }

  const limitedRows = rows.slice(0, MAX_RENDER_ROWS);
  if (!limitedRows[0] || typeof limitedRows[0] !== 'object') {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    updateSelectionActions();
    return;
  }
  const columns = Object.keys(limitedRows[0]);
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.addEventListener('click', () => {
      applySort(col);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  resultsTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  limitedRows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    columns.forEach((col, colIndex) => {
      const td = document.createElement('td');
      const value = row[col];
      td.textContent = value === null || value === undefined ? '' : String(value);
      td.title = td.textContent;
      td.dataset.col = col;
      td.dataset.colIndex = String(colIndex);
      tr.appendChild(td);
    });
    tr.dataset.rowIndex = String(rowIndex);
    tr.addEventListener('click', (event) => {
      const cell = event.target.closest('td');
      if (!cell) return;
      const colIndex = Number(cell.dataset.colIndex || 0);
      setSelection(rowIndex, colIndex, cell, tr, row, columns);
    });
    tbody.appendChild(tr);
  });
  resultsTable.appendChild(tbody);

  const total = totalRows || rows.length;
  if (total > MAX_RENDER_ROWS) {
    const note = document.createElement('caption');
    note.textContent = `Mostrando ${MAX_RENDER_ROWS} de ${total} linhas. Use LIMIT para reduzir.`;
    note.style.captionSide = 'bottom';
    note.style.padding = '6px 8px';
    note.style.color = '#666';
    resultsTable.appendChild(note);
  }
  updateSelectionActions();
}

function setSelection(rowIndex, colIndex, cellEl, rowEl, rowData, columns) {
  if (selectedCellEl) selectedCellEl.classList.remove('selected');
  if (selectedRowEl) selectedRowEl.classList.remove('selected');
  selectedCellEl = cellEl;
  selectedRowEl = rowEl;
  if (selectedCellEl) selectedCellEl.classList.add('selected');
  if (selectedRowEl) selectedRowEl.classList.add('selected');
  selectedRow = rowData || null;
  const colName = columns && columns[colIndex] ? columns[colIndex] : null;
  selectedCell = colName ? { rowIndex, colIndex, value: rowData ? rowData[colName] : '' } : null;
  updateSelectionActions();
}

function clearSelection() {
  if (selectedCellEl) selectedCellEl.classList.remove('selected');
  if (selectedRowEl) selectedRowEl.classList.remove('selected');
  selectedCellEl = null;
  selectedRowEl = null;
  selectedCell = null;
  selectedRow = null;
}

function updateSelectionActions() {
  const tab = getActiveTab();
  const hasRows = !!(tab && Array.isArray(tab.rows) && tab.rows.length > 0);
  if (copyCellBtn) copyCellBtn.disabled = !selectedCell;
  if (copyRowBtn) copyRowBtn.disabled = !selectedRow;
  if (exportCsvBtn) exportCsvBtn.disabled = !hasRows;
  if (exportJsonBtn) exportJsonBtn.disabled = !hasRows;
}

function getExportRows() {
  const tab = getActiveTab();
  if (!tab || !Array.isArray(tab.rows)) return [];
  return tab.rows;
}

function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';
  let normalized = rows;
  if (typeof rows[0] !== 'object' || rows[0] === null || Array.isArray(rows[0])) {
    normalized = rows.map((value) => ({ value }));
  }
  const columns = Array.from(
    new Set(normalized.flatMap((row) => Object.keys(row || {})))
  );
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [columns.join(',')];
  normalized.forEach((row) => {
    lines.push(columns.map((col) => escape(row[col])).join(','));
  });
  return lines.join('\n');
}

function formatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadText(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
      setActiveTab(tab.id);
    });
    tabBar.appendChild(el);
  });
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
    buildTable(tab.rows);
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
    showEditor: resolvedOptions.showEditor || false
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

function closeTab(tabId) {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const wasActive = tabs[idx].id === activeTabId;
  tabs.splice(idx, 1);
  if (wasActive) {
    const next = tabs[idx] || tabs[idx - 1] || tabs[0] || null;
    if (next) setActiveTab(next.id);
    else createTab(`Query ${tabCounter++}`, '');
  } else {
    renderTabBar();
    scheduleSaveTabs();
  }
}

function ensureActiveTab() {
  let tab = getActiveTab();
  if (!tab) {
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

function readRecentConnections() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentConnections(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}


function makeRecentKey(entry) {
  const ro = isEntryReadOnly(entry);
  const ssh = getEntrySshConfig(entry);
  return [
    entry.type,
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.database || '',
    ro ? 'ro' : 'rw',
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || '',
    ssh.localPort || ''
  ].join('|');
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
        await window.api.showError(res.error || 'Erro ao conectar.');
        return;
      }
      recordRecentConnection(entry);
      isConnected = true;
      setCurrentConnection(entry);
      setReadOnlyMode(isEntryReadOnly(entry));
      setScreen(true);
      restoreTabsState();
      resetTableState();
      await refreshDatabases();
      await refreshTables();
    });

    recentList.appendChild(item);
  });
}

async function refreshDatabases() {
  if (!dbSelect) return;
  const res = await window.api.listDatabases();
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao listar databases.');
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
    const useRes = await window.api.useDatabase(dbSelect.value);
    if (!useRes.ok) {
      await window.api.showError(useRes.error || 'Erro ao selecionar database.');
    }
  }
  if (currentConnection) {
    saveTabsState();
  }
  if (currentConnection && dbSelect.value) {
    currentConnection.database = dbSelect.value;
    setCurrentConnection(currentConnection);
    restoreTabsState();
  }
}

async function connectWithLoading(config) {
  if (isConnecting) return { ok: false, error: 'Conexão em andamento.' };
  setConnecting(true);
  try {
    return await window.api.connect(config);
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
    return await window.api.testConnection(config);
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
        ensureActiveTab();
        const tab = getActiveTab();
        if (isTableTab(tab) && !isTableEditor(tab)) return;
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        safeRunQueries(full).then(async (ok) => {
          if (ok) enableQueryFilter(tab, full);
          if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(full))) {
            await runTableTabQuery(tab);
          }
        });
      },
      'Cmd-Enter': () => {
        ensureActiveTab();
        const tab = getActiveTab();
        if (isTableTab(tab) && !isTableEditor(tab)) return;
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        safeRunQueries(full).then(async (ok) => {
          if (ok) enableQueryFilter(tab, full);
          if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(full))) {
            await runTableTabQuery(tab);
          }
        });
      },
      'Shift-Enter': () => {
        ensureActiveTab();
        const tab = getActiveTab();
        if (isTableTab(tab) && !isTableEditor(tab)) return;
        const baseSql = getSelectionOrStatement(false);
        if (!baseSql) return;
        safeRunQueries(baseSql).then(async (ok) => {
          if (ok) enableQueryFilter(tab, baseSql);
          if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(baseSql))) {
            await runTableTabQuery(tab);
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

function confirmDangerous(statements) {
  const risky = statements.filter((stmt) => isDangerousStatement(stmt));
  if (risky.length === 0) return true;
  const summary = risky
    .map((stmt) => stripLeadingComments(stmt).trim().split('\n')[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('\n');
  return confirm(
    `Atenção: você está executando ${risky.length} comando(s) perigoso(s) (DELETE/DROP sem WHERE).\nDeseja continuar?\n\n${summary}`
  );
}

function getWhereFilter() {
  const tab = getActiveTab();
  if (tab && typeof tab.filter === 'string') return tab.filter.trim();
  return queryFilter && queryFilter.value ? queryFilter.value.trim() : '';
}

function applyQueryModifiers(sqlText) {
  const tab = getActiveTab();
  if (isTableTab(tab) && !isTableEditor(tab)) {
    const withWhere = insertWhere(sqlText, getWhereFilter());
    return applyLimit(withWhere);
  }
  return applyLimit(sqlText);
}

function buildTableSql(tab) {
  if (!tab) return '';
  const base = tab.baseQuery || tab.query || '';
  const filter = tab.filter || '';
  let sql = insertWhere(base, filter);
  if (tab.sort && tab.sort.column) {
    sql = buildOrderBy(sql, tab.sort.column, tab.sort.direction || 'asc');
  }
  return applyLimit(sql);
}

function buildCountSql(tab) {
  if (!tab) return '';
  const base = (tab.baseQuery || tab.query || '').trim();
  if (!base) return '';
  const clean = base.replace(/;$/, '');
  const upper = clean.toUpperCase();
  const fromIndex = upper.indexOf(' FROM ');
  if (fromIndex === -1) return '';
  const fromClause = clean.slice(fromIndex);
  const countBase = `SELECT COUNT(*) AS total${fromClause}`;
  return insertWhere(countBase, tab.filter || '');
}

function hasNonSelect(statements) {
  return statements.some((stmt) => {
    const key = firstDmlKeyword(stmt);
    return key && key !== 'select';
  });
}

async function runTableTabQuery(tab) {
  if (!tab) return;
  tab.filter = getWhereFilter();
  const sql = buildTableSql(tab);
  await runQuery(sql, { storeQuery: false });
}

function enableQueryFilter(tab, baseSql) {
  if (!tab || isTableTab(tab)) return;
  tab.filterEnabled = true;
  tab.filterSource = baseSql || tab.query || '';
  if (queryFilter) queryFilter.disabled = false;
  updateRunAvailability();
}

function isReadOnlyViolation(sqlText) {
  if (!isReadOnly) return false;
  const statements = splitStatements(sqlText || '');
  if (statements.length === 0) return false;
  return statements.some((stmt) => {
    const cleaned = stripLeadingComments(stmt).trim();
    if (!cleaned) return false;
    const key = firstDmlKeyword(cleaned);
    if (key) return key !== 'select';
    const upper = cleaned.toUpperCase();
    if (upper.startsWith('SELECT')) return false;
    if (upper.startsWith('WITH')) {
      const withKey = firstDmlKeyword(cleaned);
      return withKey && withKey !== 'select';
    }
    if (upper.startsWith('SHOW')) return false;
    if (upper.startsWith('DESCRIBE')) return false;
    if (upper.startsWith('EXPLAIN')) return false;
    return true;
  });
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
    const roBlocked = isReadOnlyViolation(sqlText);
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
    window.api.showError('Formatador SQL não disponível.');
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
    const sql = buildTableSql(tab);
    await runQuery(sql, { storeQuery: false });
    return;
  }

  const sql = buildOrderBy(getQueryValue(), column, sortState.direction);
  setQueryValue(sql);
  await runQuery(sql);
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

async function openTableTab(schema, name) {
  const sql = tableQuery(schema, name);
  const tab = createTab({
    title: `${schema}.${name}`,
    kind: 'table',
    baseQuery: sql,
    query: sql,
    filter: ''
  });
  await runTableTabQuery(tab);
}

function renderSidebarTree(filterText) {
  renderTableTree({
    tableList,
    tableCache,
    filterText,
    onOpenTable: openTableTab,
    listColumns: window.api.listColumns,
    onShowError: window.api.showError,
    expandedState: treeExpanded,
    onToggleExpand: (key, expanded) => {
      setTreeExpanded(key, expanded);
    },
    onCopyName: async (name) => {
      if (!name) return;
      try {
        await navigator.clipboard.writeText(name);
      } catch (_) {
        await window.api.showError('Não foi possível copiar.');
      }
    },
    onCopyQualified: async (schema, name) => {
      if (!name) return;
      const qualified = schema ? `${quoteIdentifier(schema)}.${quoteIdentifier(name)}` : quoteIdentifier(name);
      try {
        await navigator.clipboard.writeText(qualified);
      } catch (_) {
        await window.api.showError('Não foi possível copiar.');
      }
    }
  });
}

async function refreshTables() {
  tableList.innerHTML = '';
  tableCache = [];
  const res = await window.api.listTables();
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao listar tabelas.');
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
}

async function runQuery(sql, options = {}) {
  if (isLoading) return;
  const tab = ensureActiveTab();
  const storeQuery = options.storeQuery !== false;
  if (tab) {
    if (storeQuery && !isTableTab(tab)) {
      tab.query = sql;
    } else if (isTableTab(tab)) {
      tab.lastQuery = sql;
    }
  }
  const prevHtml = resultsTable.innerHTML;
  const prevClass = resultsTable.className;
  const start = performance.now();
  setLoading(true);
  let res;
  try {
    res = await window.api.runQuery({ sql, timeoutMs: getTimeoutMs() });
  } finally {
    setLoading(false);
  }
  if (!res || !res.ok) {
    resultsTable.innerHTML = prevHtml;
    resultsTable.className = prevClass;
    const duration = performance.now() - start;
    setQueryStatus({ state: 'error', message: (res && res.error) || 'Erro ao executar query.', duration });
    await window.api.showError((res && res.error) || 'Erro ao executar query.');
    return;
  }
  tab.rows = res.rows;
  buildTable(res.rows, res.totalRows);
  historyManager.recordHistory(sql);
  const duration = performance.now() - start;
  setQueryStatus({ state: 'success', duration });
}

async function runQueriesSequential(sqlText) {
  if (isReadOnlyViolation(sqlText)) {
    await window.api.showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
    return false;
  }
  const statements = splitStatements(sqlText);
  if (statements.length === 0) {
    await window.api.showError('Query vazia.');
    return false;
  }
  if (!confirmDangerous(statements)) {
    return false;
  }
  if (statements.length === 1) {
    const tab = ensureActiveTab();
    await runQuery(applyQueryModifiers(statements[0]), {
      storeQuery: tab ? !isTableTab(tab) : true
    });
    return true;
  }

  if (isLoading) return;
  const tab = ensureActiveTab();
  if (tab && !isTableTab(tab)) tab.query = sqlText;

  const prevHtml = resultsTable.innerHTML;
  const prevClass = resultsTable.className;
  const start = performance.now();
  setLoading(true);
  let lastRows = null;
  let lastTotalRows = 0;
  try {
    for (const stmt of statements) {
      const res = await window.api.runQuery({ sql: applyQueryModifiers(stmt), timeoutMs: getTimeoutMs() });
      if (!res || !res.ok) {
        throw new Error((res && res.error) || 'Erro ao executar query.');
      }
      lastRows = res.rows;
      lastTotalRows = res.totalRows || 0;
    }
  } catch (err) {
    resultsTable.innerHTML = prevHtml;
    resultsTable.className = prevClass;
    const duration = performance.now() - start;
    setQueryStatus({ state: 'error', message: err && err.message ? err.message : 'Erro ao executar query.', duration });
    await window.api.showError(err && err.message ? err.message : 'Erro ao executar query.');
    return false;
  } finally {
    setLoading(false);
  }

  if (lastRows) {
    tab.rows = lastRows;
    buildTable(lastRows, lastTotalRows);
  } else {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
  }
  const duration = performance.now() - start;
  setQueryStatus({ state: 'success', duration });
  return true;
}

async function safeRunQueries(sqlText) {
  try {
    return await runQueriesSequential(sqlText);
  } catch (err) {
    await window.api.showError(err && err.message ? err.message : 'Erro ao executar query.');
    return false;
  }
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
  safeRunQueries,
  runTableTabQuery,
  isReadOnlyViolation,
  hasMultipleStatementsWithSelect,
  hasNonSelect,
  splitStatements,
  showError: api ? api.showError : showErrorFallback
});
snippetsManager.bindEvents();

async function refreshSaved() {
  const list = await window.api.listSavedConnections();
  savedList.innerHTML = '';
  if (!list || list.length === 0) {
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
        await window.api.showError(res.error || 'Erro ao conectar.');
        return;
      }
      recordRecentConnection(entry);
      isConnected = true;
      setCurrentConnection(entry);
      setReadOnlyMode(isEntryReadOnly(entry));
      setScreen(true);
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
      await window.api.deleteConnection(entry.name);
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

  const res = await connectWithLoading(config);
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao conectar.');
    return;
  }
  recordRecentConnection(config);
  isConnected = true;
  setCurrentConnection(config);
  setReadOnlyMode(!!config.readOnly);
  setScreen(true);
  restoreTabsState();
  resetTableState();
  await refreshDatabases();
  await refreshTables();
  closeConnectModal();
});

saveBtn.addEventListener('click', async () => {
  if (!saveName.value.trim()) {
    await window.api.showError('Informe um nome para salvar.');
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
    await window.api.showError(testRes.error || 'Falha ao validar conexão.');
    return;
  }

  await window.api.saveConnection(entry);
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
    await window.api.showError(testRes.error || 'Falha ao validar conexão.');
    return;
  }
  await window.api.showError('Conexão OK.');
});

exitBtn.addEventListener('click', async () => {
  saveTabsState();
  await window.api.disconnect();
  isConnected = false;
  currentHistoryKey = null;
  currentConnection = null;
  setStatus('Desconectado', false);
  setReadOnlyMode(false);
  setScreen(false);
  resetTableState();
  if (dbSelect) dbSelect.innerHTML = '';
  tabs = [];
  activeTabId = null;
  tabCounter = 1;
  renderTabBar();
  setQueryValue('');
  createTab(`Query ${tabCounter++}`, '');
});

runBtn.addEventListener('click', async () => {
  ensureActiveTab();
  const tab = getActiveTab();
  if (isTableTab(tab) && !isTableEditor(tab)) {
    await runTableTabQuery(tab);
    return;
  }
  const full = getQueryValue();
  if (isReadOnlyViolation(full)) {
    await window.api.showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
    return;
  }
  if (hasMultipleStatementsWithSelect(full)) {
    await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
    return;
  }
  const ok = await safeRunQueries(full);
  if (ok) enableQueryFilter(tab, full);
  if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(full))) {
    await runTableTabQuery(tab);
  }
});

runSelectionBtn.addEventListener('click', async () => {
  ensureActiveTab();
  const tab = getActiveTab();
  if (isTableTab(tab) && !isTableEditor(tab)) return;
  const baseSql = getSelectionOrStatement(false);
  if (!baseSql) {
    await window.api.showError('Selecione um trecho ou posicione o cursor em uma instrução.');
    return;
  }
  if (isReadOnlyViolation(baseSql)) {
    await window.api.showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
    return;
  }
  try {
    const ok = await safeRunQueries(baseSql);
    if (ok) enableQueryFilter(tab, baseSql);
    if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(baseSql))) {
      await runTableTabQuery(tab);
    }
  } catch (err) {
    await window.api.showError(err && err.message ? err.message : 'Erro ao executar seleção.');
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
    if (isTableTab(tab)) {
      await runTableTabQuery(tab);
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
      await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    await safeRunQueries(nextSql);
  });
}

if (applyFilterBtn) {
  applyFilterBtn.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (isTableTab(tab)) {
      await runTableTabQuery(tab);
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
      await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    await safeRunQueries(nextSql);
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
    ensureActiveTab();
    const full = getQueryValue();
    if (hasMultipleStatementsWithSelect(full)) {
      await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    const ok = await safeRunQueries(full);
    if (ok) enableQueryFilter(tab, full);
    if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(full))) {
      await runTableTabQuery(tab);
    }
  }
});

function scheduleTreeRender() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderSidebarTree(tableSearch ? tableSearch.value : '');
  }, 150);
}

if (tableSearch) {
  tableSearch.addEventListener('input', () => {
    if (tableSearchClear) {
      tableSearchClear.classList.toggle('visible', !!tableSearch.value);
    }
    scheduleTreeRender();
  });
}

if (tableSearchClear) {
  tableSearchClear.addEventListener('click', () => {
    if (tableSearch) tableSearch.value = '';
    tableSearchClear.classList.remove('visible');
    renderSidebarTree('');
    if (tableSearch) tableSearch.focus();
  });
}

newTabBtn.addEventListener('click', () => {
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
    const sql = buildCountSql(tab);
    if (!sql) {
      await window.api.showError('Não foi possível montar o COUNT.');
      return;
    }
    await runQuery(sql, { storeQuery: false });
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
    await runTableTabQuery(tab);
  });
}

if (copyCellBtn) {
  copyCellBtn.addEventListener('click', async () => {
    if (!selectedCell) return;
    try {
      await navigator.clipboard.writeText(
        selectedCell.value === null || selectedCell.value === undefined
          ? ''
          : String(selectedCell.value)
      );
    } catch (_) {
      await window.api.showError('Não foi possível copiar a célula.');
    }
  });
}

if (copyRowBtn) {
  copyRowBtn.addEventListener('click', async () => {
    if (!selectedRow) return;
    try {
      const text = typeof selectedRow === 'object'
        ? JSON.stringify(selectedRow)
        : String(selectedRow);
      await navigator.clipboard.writeText(text);
    } catch (_) {
      await window.api.showError('Não foi possível copiar a linha.');
    }
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    const rows = getExportRows();
    if (!rows || rows.length === 0) return;
    const csv = rowsToCsv(rows);
    downloadText(`results-${formatTimestamp()}.csv`, csv, 'text/csv');
  });
}

if (exportJsonBtn) {
  exportJsonBtn.addEventListener('click', () => {
    const rows = getExportRows();
    if (!rows || rows.length === 0) return;
    const json = JSON.stringify(rows, null, 2);
    downloadText(`results-${formatTimestamp()}.json`, json, 'application/json');
  });
}

dbSelect.addEventListener('change', async () => {
  const name = dbSelect.value;
  if (!name) return;
  setConnecting(true);
  const res = await window.api.useDatabase(name);
  setConnecting(false);
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao trocar database.');
    return;
  }
  saveTabsState();
  if (currentConnection) {
    currentConnection.database = name;
    setCurrentConnection(currentConnection);
    restoreTabsState();
  }
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
    const res = await window.api.cancelQuery();
    if (!res || !res.ok) {
      await window.api.showError((res && res.error) || 'Erro ao cancelar query.');
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
      await window.api.showError('Conecte para atualizar o schema.');
      return;
    }
    resetTableState();
    await refreshTables();
  });
}

async function bootstrap() {
  setStatus('Desconectado', false);
  setScreen(false);
  if (!api) {
    console.error('API do preload não encontrada. Verifique o caminho do preload.');
    return;
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
  createTab(`Query ${tabCounter++}`, '');
  if (timeoutSelect) {
    const savedTimeout = localStorage.getItem(TIMEOUT_KEY);
    if (savedTimeout) timeoutSelect.value = savedTimeout;
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  setSidebarView(localStorage.getItem(SIDEBAR_VIEW_KEY) || 'tree');
}

bootstrap();
