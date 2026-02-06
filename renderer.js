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

let isConnected = false;
const MAX_RENDER_ROWS = 2000;
let currentSort = { column: null, direction: 'asc' };
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
  setQueryValue(tab.query || '');
  if (tab.rows) {
    buildTable(tab.rows);
  } else {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
  }
}

function createTab(title, queryText) {
  const tab = {
    id: `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: title || `Query ${tabCounter++}`,
    query: queryText || '',
    rows: null
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
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        safeRunQueries(full).catch(() => {});
      },
      'Cmd-Enter': () => {
        ensureActiveTab();
        const full = getQueryValue();
        if (hasMultipleStatementsWithSelect(full)) {
          window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
          return;
        }
        safeRunQueries(full).catch(() => {});
      },
      'Shift-Enter': () => {
        ensureActiveTab();
        const sql = getSelectionOrStatement();
        if (!sql) return;
        safeRunQueries(sql).catch(() => {});
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
    if (tab) tab.query = editor.getValue();
    updateRunAvailability();
  });

}

function getQueryValue() {
  return editor ? editor.getValue() : query.value;
}

function getSelectedQuery() {
  if (editor) {
    const selection = editor.getSelection();
    return selection && selection.trim() ? selection : null;
  }
  return null;
}

function getSelectionOrStatement() {
  if (!editor) return null;
  const selection = editor.getSelection();
  if (selection && selection.trim()) return selection;

  const doc = editor.getDoc();
  const cursor = doc.getCursor();
  const fullText = doc.getValue();
  const cursorIndex = doc.indexFromPos(cursor);

  // Use splitStatements to properly parse, then find which statement the cursor is in
  const statements = splitStatements(fullText);
  if (statements.length <= 1) {
    const stmt = (statements[0] || '').trim();
    return stmt || null;
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
      return stmt.trim() || null;
    }
    searchFrom = stmtEnd;
  }

  // Fallback: return the last statement if cursor is past all statements
  const last = statements[statements.length - 1].trim();
  return last || null;
}

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-') {
        inLineComment = true;
        current += ch + next;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        current += ch + next;
        i++;
        continue;
      }
    }

    if (!inDouble && !inBacktick && ch === "'") {
      if (inSingle && next === "'") {
        current += ch + next;
        i++;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inSingle && !inBacktick && ch === '"') {
      if (inDouble && next === '"') {
        current += ch + next;
        i++;
        continue;
      }
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripLeadingComments(sql) {
  let s = sql;
  let changed = true;
  while (changed) {
    changed = false;
    s = s.trimStart();
    if (s.startsWith('--')) {
      const idx = s.indexOf('\n');
      s = idx === -1 ? '' : s.slice(idx + 1);
      changed = true;
      continue;
    }
    if (s.startsWith('/*')) {
      const idx = s.indexOf('*/');
      s = idx === -1 ? '' : s.slice(idx + 2);
      changed = true;
    }
  }
  return s.trimStart();
}

function firstDmlKeyword(sql) {
  const s = stripLeadingComments(sql).toLowerCase();
  if (!s) return '';
  if (s.startsWith('with')) {
    const match = s.match(/\b(select|update|insert|delete)\b/);
    return match ? match[1] : '';
  }
  const match = s.match(/^(select|update|insert|delete)\b/);
  return match ? match[1] : '';
}

function hasMultipleStatementsWithSelect(sqlText) {
  const statements = splitStatements(sqlText);
  if (statements.length <= 1) return false;
  return statements.some((stmt) => firstDmlKeyword(stmt) === 'select');
}

function updateRunAvailability() {
  if (!runBtn) return;
  const sqlText = getQueryValue();
  const blocked = hasMultipleStatementsWithSelect(sqlText);
  runBtn.disabled = blocked || isLoading || isConnecting;
}

function setQueryValue(value) {
  if (editor) {
    isSettingEditor = true;
    editor.setValue(value || '');
    editor.focus();
    isSettingEditor = false;
  } else {
    query.value = value || '';
  }
  updateRunAvailability();
}

function formatSQL() {
  if (!window.sqlFormatter || !window.sqlFormatter.format) {
    window.api.showError('Formatador SQL não disponível.');
    return;
  }
  const source = getQueryValue();
  if (!source.trim()) return;
  const language = dbType.value === 'postgres' ? 'postgresql' : 'mysql';
  const formatted = window.sqlFormatter.format(source, { language });
  setQueryValue(formatted);
  const tab = getActiveTab();
  if (tab) tab.query = formatted;
}


function quoteIdentifier(name) {
  if (!name) return name;
  const parts = String(name).split('.');
  if (dbType.value === 'postgresql') {
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
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }

  const sql = buildOrderBy(getQueryValue(), column, currentSort.direction);
  setQueryValue(sql);
  await runQuery(sql);
}

function tableQuery(schema, table) {
  if (dbType.value === 'postgresql') {
    return `SELECT * FROM "${schema}"."${table}" LIMIT 500;`;
  }
  if (schema) {
    return `SELECT * FROM \`${schema}\`.\`${table}\` LIMIT 500;`;
  }
  return `SELECT * FROM \`${table}\` LIMIT 500;`;
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

let tableCache = [];
function resetTableState() {
  tableCache = [];
  tableList.innerHTML = '';
  if (tableSearch) tableSearch.value = '';
  resultsTable.innerHTML = '';
}

function typeLabel(rawType) {
  const type = String(rawType || '').toUpperCase();
  if (type.includes('VIEW')) return 'Views';
  if (type.includes('BASE')) return 'Tables';
  return 'Outros';
}

function buildTreeData(rows, filterText) {
  const filter = (filterText || '').toLowerCase().trim();
  const map = new Map();
  rows.forEach((row) => {
    const schema = getField(row, ['table_schema', 'schema', 'table_schema_name']) || 'default';
    const name = getField(row, ['table_name', 'name', 'table']) || '';
    const rawType = getField(row, ['table_type', 'type']) || '';
    if (filter && !name.toLowerCase().includes(filter)) return;

    if (!map.has(schema)) {
      map.set(schema, { Tables: [], Views: [], Outros: [] });
    }
    const group = map.get(schema);
    const label = typeLabel(rawType);
    group[label] = group[label] || [];
    group[label].push(name);
  });
  return map;
}

function createGroup(label, depth, expanded = true) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-group' + (expanded ? ' expanded' : '');
  item.style.paddingLeft = `${8 + depth * 14}px`;

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = '▸';
  item.appendChild(caret);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.textContent = label;
  item.appendChild(text);

  const children = document.createElement('div');
  children.className = 'tree-children' + (expanded ? '' : ' hidden');

  item.addEventListener('click', (event) => {
    if (event.target.closest('.tree-item') !== item) return;
    item.classList.toggle('expanded');
    children.classList.toggle('hidden');
  });

  return { item, children };
}

function createLeaf(label, depth, onClick) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-leaf';
  item.style.paddingLeft = `${8 + depth * 14}px`;

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = ' ';
  item.appendChild(caret);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.textContent = label;
  item.appendChild(text);

  item.addEventListener('click', onClick);
  return item;
}

function renderTableTree(filterText) {
  tableList.innerHTML = '';
  tableList.className = 'tree';

  if (!tableCache || tableCache.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(empty);
    return;
  }

  const treeData = buildTreeData(tableCache, filterText);
  if (treeData.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(empty);
    return;
  }

  for (const [schema, groups] of treeData.entries()) {
    const schemaNode = createGroup(schema, 0, true);
    tableList.appendChild(schemaNode.item);
    tableList.appendChild(schemaNode.children);

    ['Tables', 'Views', 'Outros'].forEach((groupLabel) => {
      const items = groups[groupLabel] || [];
      if (items.length === 0) return;

      const groupNode = createGroup(groupLabel, 1, true);
      schemaNode.children.appendChild(groupNode.item);
      schemaNode.children.appendChild(groupNode.children);

      items.sort((a, b) => a.localeCompare(b));
      items.forEach((name) => {
        const leaf = createLeaf(name, 2, async () => {
          const sql = tableQuery(schema, name);
          createTab(`${schema}.${name}`, sql);
          setQueryValue(sql);
          await runQuery(sql);
        });
        groupNode.children.appendChild(leaf);
      });
    });
  }
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
  renderTableTree(tableSearch.value);
}

async function runQuery(sql) {
  if (isLoading) return;
  const tab = ensureActiveTab();
  tab.query = sql;
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
  if (statements.length === 1) {
    await runQuery(statements[0]);
    return true;
  }

  if (isLoading) return;
  const tab = ensureActiveTab();
  tab.query = sqlText;

  const prevHtml = resultsTable.innerHTML;
  const prevClass = resultsTable.className;
  setLoading(true);
  let lastRows = null;
  let lastTotalRows = 0;
  try {
    for (const stmt of statements) {
      const res = await window.api.runQuery(stmt);
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
  const full = getQueryValue();
  if (hasMultipleStatementsWithSelect(full)) {
    await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
    return;
  }
  await safeRunQueries(full);
});

runSelectionBtn.addEventListener('click', async () => {
  ensureActiveTab();
  const sql = getSelectionOrStatement();
  if (!sql) {
    await window.api.showError('Selecione um trecho ou posicione o cursor em uma instrução.');
    return;
  }
  try {
    await safeRunQueries(sql);
  } catch (err) {
    await window.api.showError(err && err.message ? err.message : 'Erro ao executar seleção.');
  }
});

query.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    ensureActiveTab();
    const full = getQueryValue();
    if (hasMultipleStatementsWithSelect(full)) {
      await window.api.showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    await safeRunQueries(full);
  }
});

tableSearch.addEventListener('input', () => {
  renderTableTree(tableSearch.value);
});

newTabBtn.addEventListener('click', () => {
  createTab(`Query ${tabCounter++}`, '');
});

formatBtn.addEventListener('click', () => {
  formatSQL();
});

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
