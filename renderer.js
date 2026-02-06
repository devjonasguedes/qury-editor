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
const connectBtn = byId('connectBtn');
const saveBtn = byId('saveBtn');
const testBtn = byId('testBtn');
const clearFormBtn = byId('clearFormBtn');
const cancelEditBtn = byId('cancelEditBtn');
const savedList = byId('savedList');
const tableList = byId('tableList');
const tableSearch = byId('tableSearch');
const query = byId('query');
const runBtn = byId('runBtn');
const resultsTable = byId('resultsTable');
const resultsPanel = byId('resultsPanel');
const exitBtn = byId('exitBtn');
const connectScreen = byId('connectScreen');
const mainScreen = byId('mainScreen');
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
const editorBody = document.querySelector('.editor-body');

let isConnected = false;
const MAX_RENDER_ROWS = 2000;
let isLoading = false;
let isConnecting = false;
let tabs = [];
let activeTabId = null;
let tabCounter = 1;
let editor = null;
let isSettingEditor = false;
let isEditingConnection = false;

function setStatus(text, ok) {
  connStatus.textContent = text;
  connStatus.style.color = ok ? '#22c55e' : '#fbbf24';
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
}

function setScreen(connected) {
  if (connected) {
    connectScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    exitBtn.classList.remove('hidden');
    if (dbSelect) dbSelect.classList.remove('hidden');
    if (editor) {
      setTimeout(() => editor.refresh(), 0);
    }
  } else {
    connectScreen.classList.remove('hidden');
    mainScreen.classList.add('hidden');
    exitBtn.classList.add('hidden');
    if (dbSelect) dbSelect.classList.add('hidden');
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
  const filterEnabled = tableTab || !!tab.filterEnabled;
  if (queryFilter) {
    queryFilter.value = tab.filter || '';
    queryFilter.disabled = !filterEnabled;
  }
  if (editorBody) editorBody.classList.toggle('hidden', tableTab);
  if (formatBtn) formatBtn.classList.toggle('hidden', tableTab);
  if (runSelectionBtn) runSelectionBtn.classList.toggle('hidden', tableTab);
  if (runBtn) runBtn.classList.toggle('hidden', tableTab);
  if (applyFilterBtn) {
    applyFilterBtn.classList.toggle('hidden', false);
    applyFilterBtn.disabled = !filterEnabled || isLoading || isConnecting;
  }
  if (countBtn) {
    countBtn.disabled = !tableTab || isLoading || isConnecting;
  }
  if (!tableTab) {
    setQueryValue(tab.query || '');
  } else {
    setQueryValue(tab.baseQuery || tab.query || '', { focus: false });
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
    kind
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
        if (isTableTab(tab)) return;
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        safeRunQueries(full).then((ok) => {
          if (ok) enableQueryFilter(tab, full);
        });
      },
      'Cmd-Enter': () => {
        ensureActiveTab();
        const tab = getActiveTab();
        if (isTableTab(tab)) return;
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        safeRunQueries(full).then((ok) => {
          if (ok) enableQueryFilter(tab, full);
        });
      },
      'Shift-Enter': () => {
        ensureActiveTab();
        const tab = getActiveTab();
        if (isTableTab(tab)) return;
        const baseSql = getSelectionOrStatement(false);
        if (!baseSql) return;
        safeRunQueries(baseSql).then((ok) => {
          if (ok) enableQueryFilter(tab, baseSql);
        });
      },
      'Shift-Alt-F': () => {
        formatSQL();
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

}

function getQueryValue() {
  const tab = getActiveTab();
  if (isTableTab(tab)) {
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
  if (isTableTab(tab)) {
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

function updateRunAvailability() {
  if (!runBtn) return;
  const tab = getActiveTab();
  const isTable = isTableTab(tab);
  if (!tab || isTable) {
    runBtn.disabled = true;
  } else {
    const sqlText = getQueryValue();
    const blocked = hasMultipleStatementsWithSelect(sqlText);
    runBtn.disabled = blocked || isLoading || isConnecting;
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
    await window.api.showError((res && res.error) || 'Erro ao executar query.');
    return;
  }
  tab.rows = res.rows;
  buildTable(res.rows, res.totalRows);
}

async function runQueriesSequential(sqlText) {
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
    meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}`;

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
        database: entry.database || ''
      });

      if (!res.ok) {
        await window.api.showError(res.error || 'Erro ao conectar.');
        return;
      }
      isConnected = true;
      setStatus('Conectado', true);
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
      setEditMode(true);
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
    database: database.value || ''
  };

  const res = await connectWithLoading(config);
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao conectar.');
    return;
  }
  isConnected = true;
  setStatus('Conectado', true);
  setScreen(true);
  resetTableState();
  await refreshDatabases();
  await refreshTables();
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
    database: database.value || ''
  };

  const testRes = await testConnectionWithLoading(entry);
  if (!testRes.ok) {
    await window.api.showError(testRes.error || 'Falha ao validar conexão.');
    return;
  }

  await window.api.saveConnection(entry);
  await refreshSaved();
  setEditMode(false);
});

cancelEditBtn.addEventListener('click', () => {
  resetConnectionForm();
  setEditMode(false);
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
  setStatus('Desconectado', false);
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
  if (isTableTab(tab)) {
    await runTableTabQuery(tab);
    return;
  }
  const full = getQueryValue();
  if (hasMultipleStatementsWithSelect(full)) {
    await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
    return;
  }
  const ok = await safeRunQueries(full);
  if (ok) enableQueryFilter(tab, full);
});

runSelectionBtn.addEventListener('click', async () => {
  ensureActiveTab();
  const tab = getActiveTab();
  if (isTableTab(tab)) return;
  const baseSql = getSelectionOrStatement(false);
  if (!baseSql) {
    await window.api.showError('Selecione um trecho ou posicione o cursor em uma instrução.');
    return;
  }
  try {
    const ok = await safeRunQueries(baseSql);
    if (ok) enableQueryFilter(tab, baseSql);
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

query.addEventListener('keydown', async (event) => {
  const tab = getActiveTab();
  if (isTableTab(tab)) return;
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
  }
});

tableSearch.addEventListener('input', () => {
  renderSidebarTree(tableSearch.value);
});

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
  resetTableState();
  await refreshTables();
});

setStatus('Desconectado', false);
setScreen(false);
refreshSaved();
initEditor();
setQueryValue('');
resetConnectionForm();
setEditMode(false);
createTab(`Query ${tabCounter++}`, '');
