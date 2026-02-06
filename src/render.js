import { format as formatSql } from 'sql-formatter';

import {
  buildConnectionBaseKey,
  connectionTitle,
  getEntrySshConfig,
  isEntryReadOnly,
  isEntrySsh,
  makeRecentKey
} from './modules/connectionUtils.js';
import { readJson, writeJson } from './modules/storage.js';
import { createTreeView } from './modules/treeView.js';
import { createTabConnections } from './modules/tabConnections.js';
import { createTabTables } from './modules/tabTables.js';
import { createCodeEditor } from './modules/codeEditor.js';
import { createTableView } from './modules/tableView.js';
import { createQueryHistory } from './modules/queryHistory.js';
import { createSnippetsManager } from './modules/snippets.js';
import { createSqlAutocomplete } from './modules/sqlAutocomplete.js';
import { firstDmlKeyword, insertWhere, isDangerousStatement, splitStatements } from './sql.js';

const RECENT_KEY = 'sqlEditor.recentConnections';
const THEME_KEY = 'sqlEditor.theme';
const SIDEBAR_KEY = 'sqlEditor.sidebarWidth';
const EDITOR_HEIGHT_KEY = 'sqlEditor.editorHeight';

export function initHome({ api }) {
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
  const recentList = byId('recentList');
  const mainScreen = byId('mainScreen');
  const welcomeScreen = byId('welcomeScreen');
  const connectSpinner = byId('connectSpinner');
  const tabConnections = byId('tabConnections');
  const openConnectModalBtn = byId('openConnectModalBtn');
  const quickConnectBtn = byId('quickConnectBtn');
  const closeConnectModalBtn = byId('closeConnectModalBtn');
  const homeBtn = byId('homeBtn');
  const connectModal = byId('connectModal');
  const connectModalBackdrop = byId('connectModalBackdrop');
  const connectModalTitle = byId('connectModalTitle');
  const connectModalSubtitle = byId('connectModalSubtitle');
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
  const tableList = byId('tableList');
  const tableSearch = byId('tableSearch');
  const tableSearchClear = byId('tableSearchClear');
  const sidebarShell = byId('sidebarShell');
  const dbSelect = byId('dbSelect');
  const sidebarResizer = byId('sidebarResizer');
  const editorResizer = byId('editorResizer');
  const sidebar = document.querySelector('.tables');
  const editorPanel = document.querySelector('.editor');
  const editorBody = document.querySelector('.editor-body');
  const mainLayout = document.querySelector('.main');
  const workspace = document.querySelector('.workspace');
  const resultsPanel = byId('resultsPanel');
  const resultsTable = byId('resultsTable');
  const queryStatus = byId('queryStatus');
  const queryOutputBtn = byId('queryOutputBtn');
  const queryOutputPreview = byId('queryOutputPreview');
  const tableActionsBar = byId('tableActionsBar');
  const copyCellBtn = byId('copyCellBtn');
  const copyRowBtn = byId('copyRowBtn');
  const exportCsvBtn = byId('exportCsvBtn');
  const exportJsonBtn = byId('exportJsonBtn');
  const refreshSchemaBtn = byId('refreshSchemaBtn');
  const tabBar = byId('tabBar');
  const newTabBtn = byId('newTabBtn');
  const query = byId('query');
  const runBtn = byId('runBtn');
  const runSelectionBtn = byId('runSelectionBtn');
  const formatBtn = byId('formatBtn');
  const stopBtn = byId('stopBtn');
  const limitSelect = byId('limitSelect');
  const timeoutSelect = byId('timeoutSelect');
  const toggleEditorBtn = byId('toggleEditorBtn');
  const countBtn = byId('countBtn');
  const queryFilter = byId('queryFilter');
  const applyFilterBtn = byId('applyFilterBtn');
  let globalLoading = byId('globalLoading');

  const outputModal = byId('outputModal');
  const outputModalBackdrop = byId('outputModalBackdrop');
  const outputLogBody = byId('outputLogBody');
  const outputModalSubtitle = byId('outputModalSubtitle');
  const outputCloseBtn = byId('outputCloseBtn');
  const outputCloseBtnBottom = byId('outputCloseBtnBottom');
  const outputCopyBtn = byId('outputCopyBtn');

  let isConnecting = false;
  let isEditingConnection = false;
  let treeView = null;
  let tabConnectionsView = null;
  let tabTablesView = null;
  let codeEditor = null;
  let snippetEditor = null;
  let tableView = null;
  let lastSort = null;
  let resultsByTabId = new Map();
  let outputByTabId = new Map();
  let currentOutput = null;
  let historyManager = null;
  let snippetsManager = null;
  let sqlAutocomplete = null;

  const safeApi = api || {};

  const ensureGlobalLoading = () => {
    if (globalLoading) return globalLoading;
    const overlay = document.createElement('div');
    overlay.id = 'globalLoading';
    overlay.className = 'global-loading hidden';
    const card = document.createElement('div');
    card.className = 'global-loading-card';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    const label = document.createElement('span');
    label.textContent = 'Conectando...';
    card.appendChild(spinner);
    card.appendChild(label);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    globalLoading = overlay;
    return overlay;
  };

  const setGlobalLoading = (loading, labelText) => {
    const overlay = ensureGlobalLoading();
    if (overlay) {
      const label = overlay.querySelector('span:last-child');
      if (label && labelText) label.textContent = labelText;
      overlay.classList.toggle('hidden', !loading);
    }
  };

  const applyTheme = (theme) => {
    const next = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', next === 'light');
    localStorage.setItem(THEME_KEY, next);
    if (themeToggle) {
      themeToggle.innerHTML =
        next === 'light' ? '<i class=\"bi bi-moon\"></i>' : '<i class=\"bi bi-sun\"></i>';
      themeToggle.title =
        next === 'light' ? 'Alternar para tema escuro' : 'Alternar para tema claro';
    }
  };

  const toggleTheme = () => {
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  };


  const setEditMode = (enabled) => {
    isEditingConnection = enabled;
    if (cancelEditBtn) cancelEditBtn.classList.toggle('hidden', !enabled);
  };

  const setConnectTab = (tab) => {
    const isSsh = tab === 'ssh';
    if (tabDirectBtn) tabDirectBtn.classList.toggle('active', !isSsh);
    if (tabSshBtn) tabSshBtn.classList.toggle('active', isSsh);
    if (sshFields) sshFields.classList.toggle('hidden', !isSsh);
  };

  const resetConnectionForm = () => {
    if (dbType) dbType.value = 'mysql';
    if (host) host.value = 'localhost';
    if (port) port.value = '';
    if (user) user.value = '';
    if (password) password.value = '';
    if (database) database.value = '';
    if (saveName) saveName.value = '';
    if (readOnly) readOnly.checked = false;
    setConnectTab('direct');
    if (sshHost) sshHost.value = '';
    if (sshPort) sshPort.value = '';
    if (sshUser) sshUser.value = '';
    if (sshPassword) sshPassword.value = '';
    if (sshPrivateKey) sshPrivateKey.value = '';
    if (sshPassphrase) sshPassphrase.value = '';
    if (sshLocalPort) sshLocalPort.value = '';
  };

  const setConnectMode = (mode) => {
    const panel = connectModal ? connectModal.querySelector('.connect-panel') : null;
    if (panel) panel.classList.toggle('quick', mode === 'quick');
    if (connectModalTitle) {
      connectModalTitle.textContent = mode === 'quick' ? 'Conexao rapida' : 'Nova conexao';
    }
    if (connectModalSubtitle) {
      connectModalSubtitle.textContent =
        mode === 'quick'
          ? 'Conecte sem salvar a conexao.'
          : 'Preencha os dados para conectar ao banco.';
    }
    if (connectBtn) {
      connectBtn.textContent = mode === 'quick' ? 'Conectar rapido' : 'Conectar';
    }
  };

  const openConnectModal = ({ keepForm = false, mode = 'full' } = {}) => {
    if (!connectModal) return;
    if (!keepForm) {
      resetConnectionForm();
      setEditMode(false);
    }
    if (mode === 'quick' && saveName) {
      saveName.value = '';
      setEditMode(false);
    }
    setConnectMode(mode);
    connectModal.classList.remove('hidden');
  };

  const closeConnectModal = () => {
    if (!connectModal) return;
    connectModal.classList.add('hidden');
    setEditMode(false);
    setConnectMode('full');
  };

  const setScreen = (connected) => {
    if (mainScreen) mainScreen.classList.remove('hidden');
    if (welcomeScreen) welcomeScreen.classList.toggle('hidden', connected);
    if (sidebarShell) sidebarShell.classList.toggle('hidden', !connected);
    if (dbSelect) dbSelect.classList.toggle('hidden', !connected);
    if (sidebar) sidebar.classList.toggle('hidden', !connected);
    if (sidebarResizer) sidebarResizer.classList.toggle('hidden', !connected);
    if (editorResizer) editorResizer.classList.toggle('hidden', !connected);
    if (editorPanel) editorPanel.classList.toggle('hidden', !connected);
    if (resultsPanel) resultsPanel.classList.toggle('hidden', !connected);
    if (!connected) closeConnectModal();
    if (!connected) setOutputDisplay(null);
    if (homeBtn) {
      homeBtn.classList.toggle(
        'hidden',
        !tabConnectionsView || tabConnectionsView.size() === 0
      );
    }
    if (connected) {
      setSidebarView('tree');
      refreshEditor();
    }
  };

  const setSidebarView = (view) => {
    const next = view === 'history' ? 'history' : view === 'snippets' ? 'snippets' : 'tree';
    if (tablePanel) tablePanel.classList.toggle('hidden', next !== 'tree');
    if (historyPanel) historyPanel.classList.toggle('hidden', next !== 'history');
    if (snippetsPanel) snippetsPanel.classList.toggle('hidden', next !== 'snippets');
    if (sidebarTreeBtn) sidebarTreeBtn.classList.toggle('active', next === 'tree');
    if (sidebarHistoryBtn) sidebarHistoryBtn.classList.toggle('active', next === 'history');
    if (sidebarSnippetsBtn) sidebarSnippetsBtn.classList.toggle('active', next === 'snippets');
    if (next === 'history' && historyManager) historyManager.renderHistoryList();
    if (next === 'snippets' && snippetsManager) snippetsManager.renderSnippetsList();
  };

  const renderConnectionTabs = () => {
    if (!tabConnectionsView) return;
    tabConnectionsView.render();
    if (homeBtn) {
      homeBtn.classList.toggle('hidden', tabConnectionsView.size() === 0);
    }
  };

  const upsertConnectionTab = (entry) => {
    if (!entry || !tabConnectionsView) return;
    const key = getTabKey(entry);
    tabConnectionsView.upsert(key, entry);
    renderConnectionTabs();
  };

  const configFromEntry = (entry) => ({
    type: entry.type,
    host: entry.host || 'localhost',
    port: entry.port || undefined,
    user: entry.user || '',
    password: entry.password || '',
    database: entry.database || '',
    readOnly: isEntryReadOnly(entry),
    ssh: getEntrySshConfig(entry)
  });

  const getTabKey = (entry) => buildConnectionBaseKey(entry);

  const getActiveConnection = () => {
    if (!tabConnectionsView) return null;
    const key = tabConnectionsView.getActiveKey();
    return key ? tabConnectionsView.getEntry(key) : null;
  };

  sqlAutocomplete = createSqlAutocomplete({ api: safeApi, getActiveConnection });

  const getCurrentHistoryKey = () => {
    if (!tabConnectionsView) return null;
    return tabConnectionsView.getActiveKey();
  };

  const tabsStorageKey = (key) => (key ? `sqlEditor.tabs:${key}` : null);

  const saveTabsForKey = (key) => {
    if (!key || !tabTablesView) return;
    writeJson(tabsStorageKey(key), tabTablesView.getState());
  };

  const saveTabsForActive = () => {
    if (!tabConnectionsView) return;
    const key = tabConnectionsView.getActiveKey();
    if (key) {
      saveTabsForKey(key);
    }
  };

  const loadTabsForKey = (key) => {
    if (!key || !tabTablesView) return;
    const state = readJson(tabsStorageKey(key), null);
    if (state && Array.isArray(state.tabs)) {
      tabTablesView.setState(state);
      if (state.tabs.length === 0) tabTablesView.ensureOne();
      refreshEditor();
      return;
    }
    tabTablesView.setState({ tabs: [], activeTabId: null, tabCounter: 1 });
    tabTablesView.ensureOne();
    refreshEditor();
  };

  const applyEntryToForm = (entry) => {
    if (!entry) return;
    if (dbType) dbType.value = entry.type || 'mysql';
    if (host) host.value = entry.host || '';
    if (port) port.value = entry.port || '';
    if (user) user.value = entry.user || '';
    if (password) password.value = entry.password || '';
    if (database) database.value = entry.database || '';
    if (saveName) saveName.value = entry.name || '';
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
  };

  const loadSidebarWidth = () => {
    if (!sidebar) return;
    const raw = localStorage.getItem(SIDEBAR_KEY);
    const width = Number(raw);
    if (Number.isFinite(width) && width >= 200 && width <= 520) {
      sidebar.style.width = `${width}px`;
    }
  };

  const initSidebarResizer = () => {
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
  };

  const getEditorHeaderHeight = () => {
    if (!editorPanel) return 0;
    const tab = editorPanel.querySelector('.tab-bar');
    const toolbar = editorPanel.querySelector('.editor-toolbar');
    return (tab ? tab.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0);
  };

  const clampEditorBodyHeight = (rawHeight) => {
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
  };

  const applyEditorBodyHeight = (height, { save = true } = {}) => {
    if (!editorBody) return;
    const next = clampEditorBodyHeight(height);
    editorBody.style.height = `${next}px`;
    if (codeEditor) {
      codeEditor.setSize('100%', next);
    }
    if (save) {
      localStorage.setItem(EDITOR_HEIGHT_KEY, String(next));
    }
  };

  const loadEditorHeight = () => {
    const raw = Number(localStorage.getItem(EDITOR_HEIGHT_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return;
    applyEditorBodyHeight(raw, { save: false });
  };

  const initEditorResizer = () => {
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
      startHeight = Number.isFinite(current) && current > 0
        ? current
        : (editorBody ? editorBody.offsetHeight : 220);
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
  };

  const refreshEditor = () => {
    if (!codeEditor) return;
    codeEditor.refresh();
  };

  const setQueryStatus = ({ state, message, duration }) => {
    if (!queryStatus) return;
    const parts = [];
    if (state === 'success') parts.push('Sucesso');
    if (state === 'error') parts.push('Erro');
    if (state === 'running') parts.push('Executando');
    if (message) parts.push(message);
    if (Number.isFinite(duration)) parts.push(`${Math.round(duration)}ms`);
    queryStatus.textContent = parts.join(' • ');
    queryStatus.className = `query-status${state ? ` ${state}` : ''}`;
  };

  const OUTPUT_PREVIEW_MAX = 160;

  const normalizePreview = (text) => String(text || '').replace(/\s+/g, ' ').trim();

  const truncatePreview = (text) => {
    const preview = normalizePreview(text);
    if (preview.length <= OUTPUT_PREVIEW_MAX) return preview;
    return `${preview.slice(0, OUTPUT_PREVIEW_MAX - 1)}…`;
  };

  const formatTime = (date) => {
    const value = date instanceof Date ? date : new Date();
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const ACTION_MAX = 220;

  const truncateAction = (text) => {
    const clean = normalizePreview(text);
    if (clean.length <= ACTION_MAX) return clean;
    return `${clean.slice(0, ACTION_MAX - 1)}…`;
  };

  const buildAction = (sql) => {
    const clean = String(sql || '').trim();
    if (!clean) return 'QUERY';
    return truncateAction(clean);
  };

  const buildOutputEntry = ({ sql, ok, totalRows, truncated, affectedRows, changedRows, error, duration }) => {
    const keyword = firstDmlKeyword(sql || '');
    const isDml = keyword === 'insert' || keyword === 'update' || keyword === 'delete';
    const preferredAffected = Number.isFinite(changedRows) && changedRows > 0
      ? changedRows
      : (Number.isFinite(affectedRows) ? affectedRows : undefined);
    let response = error || 'Erro';
    if (ok) {
      if (Number.isFinite(preferredAffected)) {
        response = `Rows affected: ${preferredAffected}`;
      } else if (isDml) {
        response = 'Rows affected: 0';
      } else {
        response = `Rows: ${Number.isFinite(totalRows) ? totalRows : 0}${truncated ? ' (truncado)' : ''}`;
      }
    }
    return {
      id: 0,
      time: formatTime(new Date()),
      action: buildAction(sql),
      response,
      durationMs: Number.isFinite(duration) ? Math.round(duration) : 0,
      fullResponse: response
    };
  };

  const ensureOutputState = (tabId) => {
    if (!tabId) return null;
    if (!outputByTabId.has(tabId)) {
      outputByTabId.set(tabId, { seq: 0, items: [], subtitle: 'Último resultado' });
    }
    return outputByTabId.get(tabId);
  };

  const appendOutputEntry = (tabId, entry) => {
    const state = ensureOutputState(tabId);
    if (!state || !entry) return;
    state.seq += 1;
    const next = { ...entry, id: state.seq };
    state.items.push(next);
    if (state.items.length > 200) {
      state.items.shift();
    }
  };

  const setOutputDisplay = (payload) => {
    currentOutput = payload || null;
    if (queryOutputPreview) {
      if (payload && payload.items && payload.items.length) {
        const last = payload.items[payload.items.length - 1];
        const preview = `${last.action} • ${last.response}`;
        queryOutputPreview.textContent = truncatePreview(preview);
      } else {
        queryOutputPreview.textContent = 'Sem output.';
      }
    }
    if (queryOutputBtn) {
      queryOutputBtn.disabled = !(payload && payload.items && payload.items.length);
    }
  };

  const openOutputModal = () => {
    if (!outputModal || !currentOutput || !currentOutput.items) return;
    if (outputModalSubtitle) {
      outputModalSubtitle.textContent = currentOutput.subtitle || 'Último resultado';
    }
    if (outputLogBody) {
      outputLogBody.innerHTML = '';
      currentOutput.items.forEach((entry) => {
        const tr = document.createElement('tr');
        const cols = [
          String(entry.id),
          entry.time,
          entry.action,
          entry.response,
          entry.durationMs ? `${entry.durationMs}ms` : ''
        ];
        cols.forEach((value, index) => {
          const td = document.createElement('td');
          td.textContent = value;
          if (index === 3) td.classList.add('response');
          tr.appendChild(td);
        });
        outputLogBody.appendChild(tr);
      });
    }
    outputModal.classList.remove('hidden');
  };

  const closeOutputModal = () => {
    if (outputModal) outputModal.classList.add('hidden');
  };

  const updateOutputForActiveTab = () => {
    if (!tabTablesView) {
      setOutputDisplay(null);
      return;
    }
    const tab = tabTablesView.getActiveTab();
    if (!tab || !tab.id) {
      setOutputDisplay(null);
      return;
    }
    const payload = outputByTabId.get(tab.id) || null;
    setOutputDisplay(payload);
  };

  const renderResults = (rows, totalRows, truncated, baseSql = '', sourceSql = '') => {
    if (!tableView) return;
    tableView.setResults({ rows, totalRows, truncated, baseSql, sourceSql });
    if (tabTablesView) {
      const tab = tabTablesView.getActiveTab();
      if (tab && tab.id) {
        resultsByTabId.set(tab.id, { rows, totalRows, truncated, baseSql, sourceSql });
      }
    }
  };

  const normalizeSql = (sql) => String(sql || '').trim().replace(/;$/, '').trim();

  const applyLimit = (sql) => {
    const limitValue = limitSelect ? limitSelect.value : 'none';
    if (!limitValue || limitValue === 'none') return sql;
    const clean = normalizeSql(sql);
    if (!clean) return clean;
    if (/\\blimit\\b/i.test(clean)) return clean;
    return `${clean} LIMIT ${limitValue}`;
  };

  const applyLimitIfSelect = (sql) => {
    const keyword = firstDmlKeyword(sql);
    if (keyword !== 'select') return sql;
    return applyLimit(sql);
  };

  const getTimeoutMs = () => {
    const value = timeoutSelect ? timeoutSelect.value : 'none';
    if (!value || value === 'none') return 0;
    const ms = Number(value);
    return Number.isFinite(ms) ? ms : 0;
  };

  const runSql = async (rawSql, sourceSqlOverride = '') => {
    const baseSql = normalizeSql(rawSql);
    if (!baseSql) return;
    const sourceSql = sourceSqlOverride ? normalizeSql(sourceSqlOverride) : baseSql;
    const statements = splitStatements(sourceSql);
    const total = statements.length || 1;
    if (total === 0) return;

    let lastResult = null;
    const overallStart = Date.now();
    if (runBtn) runBtn.disabled = true;
    if (runSelectionBtn) runSelectionBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      if (isDangerousStatement(stmt)) {
        const keyword = firstDmlKeyword(stmt);
        const actionLabel = keyword ? keyword.toUpperCase() : 'QUERY';
        const confirmed = confirm(`Confirmar ${actionLabel} sem WHERE?`);
        if (!confirmed) {
          setQueryStatus({ state: 'error', message: 'Cancelada pelo usuario' });
          if (runBtn) runBtn.disabled = false;
          if (runSelectionBtn) runSelectionBtn.disabled = false;
          if (stopBtn) stopBtn.disabled = true;
          return;
        }
      }
      const sql = applyLimitIfSelect(stmt);
      const startedAt = Date.now();
      setQueryStatus({ state: 'running', message: `Executando ${i + 1}/${total}...` });
      const res = await safeApi.runQuery({ sql, timeoutMs: getTimeoutMs() || undefined });
      if (!res || !res.ok) {
        await safeApi.showError((res && res.error) || 'Erro ao executar query.');
        setQueryStatus({ state: 'error', message: res && res.error ? res.error : 'Erro' });
        if (tabTablesView) {
          const tab = tabTablesView.getActiveTab();
          if (tab && tab.id) {
            appendOutputEntry(tab.id, buildOutputEntry({
              sql: stmt,
              ok: false,
              error: res && res.error ? res.error : 'Erro',
              duration: Date.now() - startedAt
            }));
            updateOutputForActiveTab();
          }
        }
        if (runBtn) runBtn.disabled = false;
        if (runSelectionBtn) runSelectionBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        return;
      }
      lastResult = { rows: res.rows || [], totalRows: res.totalRows, truncated: res.truncated, stmt };
      if (historyManager) historyManager.recordHistory(stmt);
      if (tabTablesView) {
        const tab = tabTablesView.getActiveTab();
        if (tab && tab.id) {
          appendOutputEntry(tab.id, buildOutputEntry({
            sql: stmt,
            ok: true,
            totalRows: res.totalRows || 0,
            truncated: !!res.truncated,
            affectedRows: Number.isFinite(res.affectedRows) ? res.affectedRows : undefined,
            changedRows: Number.isFinite(res.changedRows) ? res.changedRows : undefined,
            duration: Date.now() - startedAt
          }));
          updateOutputForActiveTab();
        }
      }
    }

    if (lastResult) {
      renderResults(
        lastResult.rows || [],
        lastResult.totalRows,
        lastResult.truncated,
        lastResult.stmt,
        lastResult.stmt
      );
      setQueryStatus({
        state: 'success',
        message: `Linhas: ${lastResult.totalRows || 0}`,
        duration: Date.now() - overallStart
      });
    }
    if (runBtn) runBtn.disabled = false;
    if (runSelectionBtn) runSelectionBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  };

  const updateRunAvailability = () => {
    const sql = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
    const hasText = !!(sql && sql.trim());
    if (runBtn) runBtn.disabled = !hasText;
    if (runSelectionBtn) {
      const selection = codeEditor ? codeEditor.getSelection() : '';
      const hasSelection = !!(selection && selection.trim());
      runSelectionBtn.disabled = !hasText || !hasSelection;
    }
    if (runBtn) runBtn.classList.toggle('ready', hasText);
  };

  const handleRun = async () => {
    const sql = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
    if (!sql || !sql.trim()) {
      await safeApi.showError('Query vazia.');
      return;
    }
    lastSort = null;
    await runSql(sql);
  };

  const handleRunSelection = async () => {
    const selection = codeEditor ? codeEditor.getSelection() : '';
    const sql = selection && selection.trim() ? selection : '';
    if (!sql) {
      await safeApi.showError('Selecione uma query.');
      return;
    }
    lastSort = null;
    await runSql(sql);
  };

  const buildCountSql = (rawSql) => {
    const clean = normalizeSql(rawSql);
    if (!clean) return '';
    return `SELECT COUNT(*) AS total FROM (${clean}) AS subquery`;
  };

  const applyTableFilter = async () => {
    const filter = queryFilter ? queryFilter.value.trim() : '';
    const active = tableView ? tableView.getActive() : null;
    const base = active && (active.sourceSql || active.baseSql)
      ? (active.sourceSql || active.baseSql)
      : (codeEditor ? codeEditor.getValue() : (query ? query.value : ''));
    if (!base || !base.trim()) {
      await safeApi.showError('Query vazia.');
      return;
    }
    if (!filter) {
      lastSort = null;
      await runSql(base, base);
      return;
    }
    const sql = insertWhere(base, filter);
    if (!sql || !sql.trim()) return;
    lastSort = null;
    await runSql(sql, base);
  };

  const quoteIdentifier = (name) => {
    if (!name) return name;
    const text = String(name);
    if (!/^[A-Za-z0-9_$.]+$/.test(text)) {
      return text;
    }
    const active = getActiveConnection();
    const type = active && active.type ? active.type : 'mysql';
    const parts = text.split('.');
    if (type === 'postgres' || type === 'postgresql') {
      return parts.map((p) => (p.startsWith('\"') ? p : `\"${p.replace(/\"/g, '\"\"')}\"`)).join('.');
    }
    return parts.map((p) => (p.startsWith('`') ? p : `\`${p.replace(/`/g, '``')}\``)).join('.');
  };

  const setEditorVisible = (visible) => {
    if (!editorBody) return;
    editorBody.classList.toggle('hidden', !visible);
    if (toggleEditorBtn) toggleEditorBtn.classList.toggle('active', visible);
    if (visible) refreshEditor();
  };

  const refreshDatabases = async () => {
    if (!dbSelect) return;
    const res = await safeApi.listDatabases();
    if (!res || !res.ok) {
      await safeApi.showError((res && res.error) || 'Erro ao listar databases.');
      return;
    }
    dbSelect.innerHTML = '';
    (res.databases || []).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      dbSelect.appendChild(opt);
    });
    const active = getActiveConnection();
    const preferred = active && active.database ? active.database : '';
    const targetDb = res.current || preferred || (dbSelect.options.length > 0 ? dbSelect.options[0].value : '');
    if (targetDb) {
      dbSelect.value = targetDb;
    }
    if (targetDb && res.current !== targetDb) {
      const useRes = await safeApi.useDatabase(targetDb);
      if (!useRes || !useRes.ok) {
        await safeApi.showError((useRes && useRes.error) || 'Erro ao selecionar database.');
        return;
      }
      if (active) {
        const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
        active.database = targetDb;
        if (tabConnectionsView && key) {
          tabConnectionsView.upsert(key, active);
          renderConnectionTabs();
        }
      }
      if (treeView) treeView.setActiveSchema(targetDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(targetDb);
    }
  };

  const activateConnection = async (entry, previousKey = null) => {
    const key = getTabKey(entry);
    if (previousKey) saveTabsForKey(previousKey);
    setScreen(true);
    if (tabConnectionsView) tabConnectionsView.setActive(key);

    const res = await connectWithLoading(configFromEntry(entry));
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao conectar.');
      return false;
    }
    if (treeView) treeView.setActiveSchema(entry.database || '');
    if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(entry.database || '');
    await refreshDatabases();
    const tables = treeView ? await treeView.refresh() : null;
    if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
    if (tabTablesView) loadTabsForKey(key);
    resultsByTabId = new Map();
    outputByTabId = new Map();
    setOutputDisplay(null);
    if (tableView) tableView.clearUi();
    return true;
  };

  const tryActivateExistingConnection = async (entry) => {
    if (!entry) return false;
    const key = getTabKey(entry);
    if (!tabConnectionsView || !tabConnectionsView.has(key)) return false;
    const previousKey = tabConnectionsView.getActiveKey();
    const ok = await activateConnection(entry, previousKey && previousKey !== key ? previousKey : null);
    if (ok) closeConnectModal();
    return ok;
  };

  const isSshTabActive = () => {
    if (!tabSshBtn) return false;
    return tabSshBtn.classList.contains('active');
  };

  const buildSshConfig = () => {
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
  };

  const setConnecting = (loading) => {
    isConnecting = loading;
    if (connectSpinner) connectSpinner.classList.toggle('hidden', !loading);
    if (connectBtn) connectBtn.disabled = loading;
    if (saveBtn) saveBtn.disabled = loading;
    if (testBtn) testBtn.disabled = loading;
    if (clearFormBtn) clearFormBtn.disabled = loading;
    if (cancelEditBtn) cancelEditBtn.disabled = loading;
    if (openConnectModalBtn) openConnectModalBtn.disabled = loading;
    if (quickConnectBtn) quickConnectBtn.disabled = loading;
    if (savedList) savedList.classList.toggle('is-connecting', loading);
    if (recentList) recentList.classList.toggle('is-connecting', loading);
    if (connectModal) connectModal.classList.toggle('is-connecting', loading);
  };

  const connectWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: 'Conexao em andamento.' };
    setConnecting(true);
    setGlobalLoading(true, 'Conectando...');
    try {
      return await safeApi.connect(config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Erro ao conectar.' };
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const testConnectionWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: 'Conexao em andamento.' };
    setConnecting(true);
    try {
      return await safeApi.testConnection(config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Erro ao testar conexao.' };
    } finally {
      setConnecting(false);
    }
  };

  const readRecentConnections = () => {
    const parsed = readJson(RECENT_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  };

  const writeRecentConnections = (list) => {
    writeJson(RECENT_KEY, list);
  };

  const recordRecentConnection = (entry) => {
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
  };

  const removeRecentConnection = (entry) => {
    if (!entry) return;
    const list = readRecentConnections();
    const key = makeRecentKey(entry);
    const next = list.filter((item) => makeRecentKey(item) !== key);
    writeRecentConnections(next);
    renderRecentList();
  };

  const renderRecentList = () => {
    if (!recentList) return;
    const list = readRecentConnections();
    recentList.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Nenhuma conexao recente.';
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
      title.textContent = entry.name || entry.database || entry.host || 'Conexao';

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
        if (await tryActivateExistingConnection(entry)) return;
        const res = await connectWithLoading(configFromEntry(entry));

        if (!res.ok) {
          await safeApi.showError(res.error || 'Erro ao conectar.');
          return;
        }
        recordRecentConnection(entry);
        saveTabsForActive();
        upsertConnectionTab(entry);
        if (treeView) treeView.setActiveSchema(entry.database || '');
        if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(entry.database || '');
        await refreshDatabases();
        const tables = treeView ? await treeView.refresh() : null;
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
        loadTabsForKey(getTabKey(entry));
        setScreen(true);
        closeConnectModal();
      });

      recentList.appendChild(item);
    });
  };

  const renderSavedList = async () => {
    if (!savedList) return;
    const list = await safeApi.listSavedConnections();
    savedList.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Nenhuma conexao salva.';
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
      title.textContent = entry.name || connectionTitle(entry);

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
        if (await tryActivateExistingConnection(entry)) return;
        const res = await connectWithLoading(configFromEntry(entry));

        if (!res.ok) {
          await safeApi.showError(res.error || 'Erro ao conectar.');
          return;
        }
        recordRecentConnection(entry);
        saveTabsForActive();
        upsertConnectionTab(entry);
        if (treeView) treeView.setActiveSchema(entry.database || '');
        if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(entry.database || '');
        await refreshDatabases();
        const tables = treeView ? await treeView.refresh() : null;
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
        loadTabsForKey(getTabKey(entry));
        setScreen(true);
        closeConnectModal();
      });

      editBtn.addEventListener('click', () => {
        applyEntryToForm(entry);
        setEditMode(true);
        openConnectModal({ keepForm: true, mode: 'full' });
      });

      deleteBtn.addEventListener('click', async () => {
        const name = entry.name || connectionTitle(entry);
        const confirmed = confirm(`Remover conexao "${name}"?`);
        if (!confirmed) return;
        await safeApi.deleteConnection(entry.name);
        await renderSavedList();
      });

      savedList.appendChild(item);
    });
  };

  const connectFromForm = async () => {
    const config = {
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || undefined : undefined,
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      ssh: buildSshConfig()
    };

    if (await tryActivateExistingConnection(config)) return;

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao conectar.');
      return;
    }
    recordRecentConnection(config);
    saveTabsForActive();
    upsertConnectionTab(config);
    if (treeView) treeView.setActiveSchema(config.database || '');
    if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(config.database || '');
    await refreshDatabases();
    const tables = treeView ? await treeView.refresh() : null;
    if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
    loadTabsForKey(getTabKey(config));
    setScreen(true);
    closeConnectModal();
  };

  const saveConnection = async () => {
    if (!saveName || !saveName.value.trim()) {
      await safeApi.showError('Informe um nome para salvar.');
      return;
    }

    const entry = {
      name: saveName.value.trim(),
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || '' : '',
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      ssh: buildSshConfig()
    };

    const res = await testConnectionWithLoading({
      type: entry.type,
      host: entry.host,
      port: entry.port || undefined,
      user: entry.user,
      password: entry.password,
      database: entry.database,
      readOnly: entry.readOnly,
      ssh: entry.ssh
    });
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao testar conexao.');
      return;
    }
    await safeApi.saveConnection(entry);
    setEditMode(false);
    await renderSavedList();
    closeConnectModal();
  };

  const testConnection = async () => {
    const config = {
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || undefined : undefined,
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      ssh: buildSshConfig()
    };

    const res = await testConnectionWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao testar conexao.');
      return;
    }
    alert('Conexao OK.');
  };

  if (tabDirectBtn) {
    tabDirectBtn.addEventListener('click', () => setConnectTab('direct'));
  }
  if (tabSshBtn) {
    tabSshBtn.addEventListener('click', () => setConnectTab('ssh'));
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      if (tabConnectionsView) {
        const key = tabConnectionsView.getActiveKey();
        if (key) saveTabsForKey(key);
      }
      setScreen(false);
      if (tabConnectionsView) tabConnectionsView.clearActive();
      renderConnectionTabs();
      renderRecentList();
      renderSavedList();
    });
  }

  if (openConnectModalBtn) {
    openConnectModalBtn.addEventListener('click', () => openConnectModal({ mode: 'full' }));
  }

  if (quickConnectBtn) {
    quickConnectBtn.addEventListener('click', () => openConnectModal({ mode: 'quick' }));
  }

  if (closeConnectModalBtn) {
    closeConnectModalBtn.addEventListener('click', () => closeConnectModal());
  }

  if (connectModalBackdrop) {
    connectModalBackdrop.addEventListener('click', () => closeConnectModal());
  }

  if (queryOutputBtn) {
    queryOutputBtn.addEventListener('click', () => openOutputModal());
  }

  if (outputCloseBtn) {
    outputCloseBtn.addEventListener('click', () => closeOutputModal());
  }

  if (outputCloseBtnBottom) {
    outputCloseBtnBottom.addEventListener('click', () => closeOutputModal());
  }

  if (outputModalBackdrop) {
    outputModalBackdrop.addEventListener('click', () => closeOutputModal());
  }

  if (outputCopyBtn) {
    outputCopyBtn.addEventListener('click', async () => {
      if (!currentOutput || !currentOutput.items || currentOutput.items.length === 0) return;
      try {
        const header = ['#', 'Time', 'Action', 'Response', 'Duration'].join('\t');
        const lines = currentOutput.items.map((entry) => [
          entry.id,
          entry.time,
          entry.action,
          entry.response,
          entry.durationMs ? `${entry.durationMs}ms` : ''
        ].join('\t'));
        await navigator.clipboard.writeText([header, ...lines].join('\n'));
      } catch (_) {
        if (safeApi.showError) await safeApi.showError('Nao foi possivel copiar o output.');
      }
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => connectFromForm());
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveConnection());
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => testConnection());
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => resetConnectionForm());
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      setEditMode(false);
      resetConnectionForm();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => toggleTheme());
  }

  if (sidebarTreeBtn) {
    sidebarTreeBtn.addEventListener('click', () => setSidebarView('tree'));
  }
  if (sidebarHistoryBtn) {
    sidebarHistoryBtn.addEventListener('click', () => setSidebarView('history'));
  }
  if (sidebarSnippetsBtn) {
    sidebarSnippetsBtn.addEventListener('click', () => setSidebarView('snippets'));
  }

  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      await handleRun();
    });
  }

  if (runSelectionBtn) {
    runSelectionBtn.addEventListener('click', async () => {
      await handleRunSelection();
    });
  }

  if (formatBtn) {
    formatBtn.addEventListener('click', () => {
      const source = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
      if (!source || !source.trim()) return;
      const active = getActiveConnection();
      const language = active && active.type === 'postgres' ? 'postgresql' : 'mysql';
      const formatted = formatSql(source, { language });
      if (codeEditor) codeEditor.setValue(formatted);
      else if (query) query.value = formatted;
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      const res = await safeApi.cancelQuery();
      if (!res || !res.ok) {
        await safeApi.showError((res && res.error) || 'Nao foi possivel cancelar.');
      } else {
        setQueryStatus({ state: 'error', message: 'Cancelada' });
      }
      if (runBtn) runBtn.disabled = false;
      if (runSelectionBtn) runSelectionBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    });
  }

  if (toggleEditorBtn) {
    toggleEditorBtn.addEventListener('click', () => {
      const isHidden = editorBody ? editorBody.classList.contains('hidden') : false;
      setEditorVisible(isHidden);
    });
  }

  if (countBtn) {
    countBtn.addEventListener('click', async () => {
      const sql = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
      if (!sql || !sql.trim()) {
        await safeApi.showError('Query vazia.');
        return;
      }
      const countSql = buildCountSql(sql);
      if (!countSql) return;
      lastSort = null;
      await runSql(countSql);
    });
  }

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', async () => {
      await applyTableFilter();
    });
  }

  if (queryFilter) {
    queryFilter.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyTableFilter();
      }
    });
  }

  if (dbSelect) {
    dbSelect.addEventListener('change', async () => {
      const name = dbSelect.value;
      if (!name) return;
      setGlobalLoading(true, 'Alterando database...');
      const res = await safeApi.useDatabase(name);
      if (!res || !res.ok) {
        await safeApi.showError((res && res.error) || 'Erro ao selecionar database.');
        setGlobalLoading(false);
        return;
      }
      const active = getActiveConnection();
      if (active) {
        const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
        active.database = name;
        if (tabConnectionsView && key) {
          tabConnectionsView.upsert(key, active);
          renderConnectionTabs();
        }
      }
      if (treeView) treeView.setActiveSchema(name);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(name);
      const tables = treeView ? await treeView.refresh() : null;
      if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
      setGlobalLoading(false);
    });
  }

  if (refreshSchemaBtn) {
    refreshSchemaBtn.addEventListener('click', async () => {
      if (treeView) {
        setGlobalLoading(true, 'Atualizando schema...');
        const tables = await treeView.refresh();
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
        setGlobalLoading(false);
      }
    });
  }

  setScreen(false);
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  loadSidebarWidth();
  loadEditorHeight();
  initSidebarResizer();
  initEditorResizer();
  treeView = createTreeView({
    api: safeApi,
    tableList,
    tableSearch,
    tableSearchClear,
    getActiveConnection,
    onOpenTable: (_schema, name, sql) => {
      if (tabTablesView) tabTablesView.createWithQuery(name, sql);
      setEditorVisible(false);
      lastSort = null;
      runSql(sql);
    }
  });
  codeEditor = createCodeEditor({ textarea: query });
  codeEditor.init();
  if (sqlAutocomplete) {
    codeEditor.setHintProvider({
      getHintOptions: () => sqlAutocomplete.getHintOptions(),
      prefetch: (editor) => sqlAutocomplete.prefetch(editor)
    });
  }
  if (snippetQueryInput) {
    snippetEditor = createCodeEditor({ textarea: snippetQueryInput });
    snippetEditor.init();
    if (sqlAutocomplete) {
      snippetEditor.setHintProvider({
        getHintOptions: () => sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => sqlAutocomplete.prefetch(editor)
      });
    }
  }
  codeEditor.setHandlers({
    run: () => handleRun(),
    runSelection: () => handleRunSelection()
  });
  updateRunAvailability();
  tabTablesView = createTabTables({
    tabBar,
    newTabBtn,
    queryInput: query,
    getValue: () => (codeEditor ? codeEditor.getValue() : (query ? query.value : '')),
    setValue: (value) => {
      if (codeEditor) codeEditor.setValue(value || '');
      else if (query) query.value = value || '';
      refreshEditor();
    },
    onInput: (handler) => {
      if (codeEditor) codeEditor.onChange(() => {
        handler();
        updateRunAvailability();
      });
    },
    onChange: () => {
      if (!tabConnectionsView) return;
      const key = tabConnectionsView.getActiveKey();
      if (key) saveTabsForKey(key);
      if (tabTablesView) {
        const state = tabTablesView.getState();
        const ids = new Set((state.tabs || []).map((t) => t.id));
        for (const id of resultsByTabId.keys()) {
          if (!ids.has(id)) resultsByTabId.delete(id);
        }
        for (const id of outputByTabId.keys()) {
          if (!ids.has(id)) outputByTabId.delete(id);
        }
      }
    },
    onActiveChange: (id) => {
      if (!tableView) return;
      if (!id) {
        tableView.clearUi();
        setOutputDisplay(null);
        return;
      }
      const snapshot = resultsByTabId.get(id);
      if (snapshot && Array.isArray(snapshot.rows)) {
        tableView.setResults(snapshot);
      } else {
        tableView.clearUi();
      }
      updateRunAvailability();
      updateOutputForActiveTab();
    }
  });
  historyManager = createQueryHistory({
    historyList,
    getCurrentHistoryKey,
    getActiveTab: () => (tabTablesView ? tabTablesView.getActiveTab() : null),
    isTableTab: () => false,
    isTableEditor: () => true,
    createNewQueryTab: (sql) => {
      if (!tabTablesView) return;
      tabTablesView.create();
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    setQueryValue: (sql) => {
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    }
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
    getSnippetValue: () => (snippetEditor ? snippetEditor.getValue() : (snippetQueryInput ? snippetQueryInput.value : '')),
    setSnippetValue: (value) => {
      if (snippetEditor) {
        snippetEditor.setValue(value || '');
        snippetEditor.refresh();
      } else if (snippetQueryInput) {
        snippetQueryInput.value = value || '';
      }
    },
    getCurrentHistoryKey,
    getQueryValue: () => (codeEditor ? codeEditor.getValue() : (query ? query.value : '')),
    setQueryValue: (sql) => {
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    createNewQueryTab: (sql) => {
      if (!tabTablesView) return;
      tabTablesView.create();
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    runSnippet: async (sql) => {
      const text = String(sql || '').trim();
      if (!text) return;
      if (codeEditor) codeEditor.setValue(text);
      if (tabTablesView) tabTablesView.syncActiveTabContent();
      lastSort = null;
      await runSql(text);
    },
    showError: safeApi.showError
  });
  const buildOrderBy = (sql, column, direction) => {
    const clean = normalizeSql(sql);
    if (!clean) return clean;
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

    const upperBase = base.toUpperCase();
    const orderIndex = upperBase.lastIndexOf(' ORDER BY ');
    if (orderIndex !== -1) {
      base = base.slice(0, orderIndex).trimEnd();
    }

    const orderSql = `${base} ORDER BY ${quoteIdentifier(column)} ${direction.toUpperCase()}`;
    return suffix ? `${orderSql} ${suffix}` : orderSql;
  };

  const rerunSortedQuery = async (column, active) => {
    const base = active && active.baseSql ? active.baseSql : '';
    if (!base) return;
    if (lastSort && lastSort.column === column) {
      if (lastSort.direction === 'asc') {
        lastSort = { column, direction: 'desc' };
        const orderSql = buildOrderBy(base, column, 'desc');
        if (orderSql) await runSql(orderSql);
        return;
      }
      if (lastSort.direction === 'desc') {
        lastSort = null;
        await runSql(base);
        return;
      }
    }
    lastSort = { column, direction: 'asc' };
    const orderSql = buildOrderBy(base, column, 'asc');
    if (!orderSql) return;
    await runSql(orderSql);
  };

  tableView = createTableView({
    resultsTable,
    tableActionsBar,
    copyCellBtn,
    copyRowBtn,
    exportCsvBtn,
    exportJsonBtn,
    onShowError: safeApi.showError,
    onSort: rerunSortedQuery
  });
tabConnectionsView = createTabConnections({
    container: tabConnections,
    getTitle: (entry) => connectionTitle(entry),
    onSelect: (_key, entry, previousKey) => {
      activateConnection(entry, previousKey);
    },
    onClose: async (key, entry) => {
      if (!tabConnectionsView) return;
      const wasActive = tabConnectionsView.getActiveKey() === key;
      tabConnectionsView.remove(key);
      renderConnectionTabs();
      if (tabConnectionsView.size() === 0) {
        setScreen(false);
        return;
      }
      if (wasActive) {
        const next = tabConnectionsView.getFirstEntry();
        if (next) {
          await activateConnection(next);
        }
      }
    }
  });
  renderSavedList();
  renderRecentList();
}
