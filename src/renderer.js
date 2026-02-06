import {
  splitStatements,
  stripLeadingComments,
  firstDmlKeyword,
  hasMultipleStatementsWithSelect,
  insertWhere,
  isDangerousStatement
} from './sql.js';
import { renderTableTree, resetTreeCache } from './tree.js';

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
const sidebar = document.querySelector('.tables');
const sidebarShell = byId('sidebarShell');
const mainLayout = document.querySelector('.main');
const editorPanel = document.querySelector('.editor');
const themeToggle = byId('themeToggle');
const sidebarTreeBtn = byId('sidebarTreeBtn');
const sidebarHistoryBtn = byId('sidebarHistoryBtn');
const tablePanel = byId('tablePanel');
const historyPanel = byId('historyPanel');
const historyList = byId('historyList');

let isConnected = false;
let isReadOnly = false;
let currentHistoryKey = null;
let currentConnection = null;
const MAX_RENDER_ROWS = 2000;
let isLoading = false;
let isConnecting = false;
let tabs = [];
let activeTabId = null;
let tabCounter = 1;
let editor = null;
let isSettingEditor = false;
let isEditingConnection = false;
let searchTimer = null;
const RECENT_KEY = 'sqlEditor.recentConnections';
const SIDEBAR_KEY = 'sqlEditor.sidebarWidth';
const THEME_KEY = 'sqlEditor.theme';
const HISTORY_KEY = 'sqlEditor.queryHistory';
const SIDEBAR_VIEW_KEY = 'sqlEditor.sidebarView';
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

function setReadOnlyMode(enabled) {
  isReadOnly = !!enabled;
  const base = isReadOnly ? 'Conectado (somente leitura)' : 'Conectado';
  if (isConnected) setStatus(base, true);
}

function buildConnectionKey(entry) {
  if (!entry) return null;
  return [
    entry.type || '',
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.database || '',
    isEntryReadOnly(entry) ? 'ro' : 'rw'
  ].join('|');
}

function setCurrentConnection(entry) {
  currentConnection = entry ? { ...entry } : null;
  currentHistoryKey = buildConnectionKey(currentConnection);
  if (historyPanel && !historyPanel.classList.contains('hidden')) {
    renderHistoryList();
  }
}

function historyStorageKey() {
  if (!currentHistoryKey) return null;
  return `${HISTORY_KEY}:${currentHistoryKey}`;
}

function readHistory() {
  try {
    const key = historyStorageKey();
    if (!key) return [];
    const raw = localStorage.getItem(key);
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeHistory(list) {
  try {
    const key = historyStorageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(list));
  } catch (_) {
    // ignore
  }
}

function recordHistory(sqlText) {
  if (!currentHistoryKey) return;
  const text = String(sqlText || '').trim();
  if (!text) return;
  const list = readHistory();
  const key = text.replace(/\s+/g, ' ');
  const next = list.filter((item) => item && item.sql !== key);
  next.unshift({ sql: key, ts: Date.now() });
  writeHistory(next.slice(0, 50));
  renderHistoryList();
}

function renderHistoryList() {
  if (!historyList) return;
  if (!currentHistoryKey) {
    historyList.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Conecte para ver o histórico.';
    historyList.appendChild(empty);
    return;
  }
  const list = readHistory();
  historyList.innerHTML = '';
  if (!list || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Nenhuma query executada.';
    historyList.appendChild(empty);
    return;
  }
  list.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = entry.sql.split('\n')[0];

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const when = new Date(entry.ts || Date.now());
    meta.textContent = when.toLocaleString();

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => {
      const sql = entry.sql || '';
      if (!sql) return;
      const tab = getActiveTab();
      if (!tab || (isTableTab(tab) && !isTableEditor(tab))) {
        createTab(`Query ${tabCounter++}`, sql);
        setQueryValue(sql);
        return;
      }
      setQueryValue(sql);
      if (tab) tab.query = sql;
    });

    historyList.appendChild(item);
  });
}

function setSidebarView(view) {
  const next = view === 'history' ? 'history' : 'tree';
  localStorage.setItem(SIDEBAR_VIEW_KEY, next);
  if (tablePanel) tablePanel.classList.toggle('hidden', next !== 'tree');
  if (historyPanel) historyPanel.classList.toggle('hidden', next !== 'history');
  if (sidebarTreeBtn) sidebarTreeBtn.classList.toggle('active', next === 'tree');
  if (sidebarHistoryBtn) sidebarHistoryBtn.classList.toggle('active', next === 'history');
  if (next === 'history') renderHistoryList();
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

function resetConnectionForm() {
  dbType.value = 'mysql';
  host.value = 'localhost';
  port.value = '';
  user.value = '';
  password.value = '';
  database.value = '';
  saveName.value = '';
  if (readOnly) readOnly.checked = false;
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
    if (editorPanel) editorPanel.classList.add('hidden');
    if (resultsPanel) resultsPanel.classList.add('hidden');
    closeConnectModal();
    setReadOnlyMode(false);
  }
}

function buildTable(rows, totalRows) {
  resultsTable.innerHTML = '';
  resultsTable.className = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    return;
  }

  const limitedRows = rows.slice(0, MAX_RENDER_ROWS);
  if (!limitedRows[0] || typeof limitedRows[0] !== 'object') {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
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
  limitedRows.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((col) => {
      const td = document.createElement('td');
      const value = row[col];
      td.textContent = value === null || value === undefined ? '' : String(value);
      td.title = td.textContent;
      tr.appendChild(td);
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
  }
  updateRunAvailability();
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
  return tab;
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
  if (querySpinner) querySpinner.classList.toggle('hidden', !loading);
  if (resultsPanel) resultsPanel.classList.toggle('loading', loading);
  if (loading) showSkeleton();
  if (loading) setQueryStatus({ state: 'running', message: 'Executando...' });
  updateRunAvailability();
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
  return [
    entry.type,
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.database || '',
    ro ? 'ro' : 'rw'
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
    lastUsed: Date.now()
  });
  writeRecentConnections(next.slice(0, 8));
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
    meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}${roTag}`;

    info.appendChild(title);
    info.appendChild(meta);
    item.appendChild(info);

    info.addEventListener('click', async () => {
      const res = await connectWithLoading({
        type: entry.type,
        host: entry.host || 'localhost',
        port: entry.port || undefined,
        user: entry.user || '',
        password: entry.password || '',
        database: entry.database || '',
        readOnly: isEntryReadOnly(entry)
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
  if (currentConnection && dbSelect.value) {
    currentConnection.database = dbSelect.value;
    setCurrentConnection(currentConnection);
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
  });

  editor.on('inputRead', (cm, change) => {
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
  if (!window.sqlFormatter || !window.sqlFormatter.format) {
    window.api.showError('Formatador SQL não disponível.');
    return;
  }
  const source = getQueryValue();
  if (!source.trim()) return;
  const language = dbType.value === 'postgres' ? 'postgresql' : 'mysql';
  const formatted = window.sqlFormatter.format(source, { language });
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
    onShowError: window.api.showError
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
    res = await window.api.runQuery(sql);
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
  recordHistory(sql);
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
      const res = await window.api.runQuery(applyQueryModifiers(stmt));
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
    meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}${roTag}`;
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
    const res = await connectWithLoading({
      type: entry.type,
      host: entry.host || 'localhost',
      port: entry.port || undefined,
      user: entry.user || '',
      password: entry.password || '',
      database: entry.database || '',
      readOnly: isEntryReadOnly(entry)
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
  const config = {
    type: dbType.value,
    host: host.value || 'localhost',
    port: port.value || undefined,
    user: user.value || '',
    password: password.value || '',
    database: database.value || '',
    readOnly: readOnly ? readOnly.checked : false
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

const entry = {
  name: saveName.value.trim(),
  type: dbType.value,
  host: host.value || 'localhost',
  port: port.value || '',
  user: user.value || '',
  password: password.value || '',
  database: database.value || '',
  read_only: readOnly ? (readOnly.checked ? 1 : 0) : 0
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
    database: database.value || ''
  };

  const testRes = await testConnectionWithLoading(entry);
  if (!testRes.ok) {
    await window.api.showError(testRes.error || 'Falha ao validar conexão.');
    return;
  }
  await window.api.showError('Conexão OK.');
});

exitBtn.addEventListener('click', async () => {
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
  if (currentConnection) {
    currentConnection.database = name;
    setCurrentConnection(currentConnection);
  }
  resetTableState();
  await refreshTables();
});

setStatus('Desconectado', false);
setScreen(false);
refreshSaved();
renderRecentList();
initEditor();
loadSidebarWidth();
initSidebarResizer();
setQueryValue('');
resetConnectionForm();
setEditMode(false);
createTab(`Query ${tabCounter++}`, '');

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    toggleTheme();
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

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
setSidebarView(localStorage.getItem(SIDEBAR_VIEW_KEY) || 'tree');
