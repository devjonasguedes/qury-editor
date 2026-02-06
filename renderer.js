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
const lineNumbers = byId('lineNumbers');
const queryHighlight = byId('queryHighlight');
const querySpinner = byId('querySpinner');
const tabBar = byId('tabBar');

let isConnected = false;
const MAX_RENDER_ROWS = 2000;
let currentSort = { column: null, direction: 'asc' };
let isLoading = false;
let tabs = [];
let activeTabId = null;
let tabCounter = 1;

function setStatus(text, ok) {
  connStatus.textContent = text;
  connStatus.style.color = ok ? '#22c55e' : '#fbbf24';
}

function setScreen(connected) {
  if (connected) {
    connectScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    exitBtn.classList.remove('hidden');
  } else {
    connectScreen.classList.remove('hidden');
    mainScreen.classList.add('hidden');
    exitBtn.classList.add('hidden');
  }
}

function buildTable(rows) {
  resultsTable.innerHTML = '';
  resultsTable.className = '';
  if (!rows || rows.length === 0) {
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    return;
  }

  const limitedRows = rows.slice(0, MAX_RENDER_ROWS);
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

  if (rows.length > MAX_RENDER_ROWS) {
    const note = document.createElement('caption');
    note.textContent = `Mostrando ${MAX_RENDER_ROWS} de ${rows.length} linhas. Use LIMIT para reduzir.`;
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
  tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.textContent = tab.title;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
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
    query.value = '';
    updateEditor();
    resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
    return;
  }
  query.value = tab.query || '';
  updateEditor();
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
    else setActiveTab(null);
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
}

function updateLineNumbers() {
  if (!lineNumbers) return;
  const count = Math.max(1, query.value.split('\n').length);
  const numbers = Array.from({ length: count }, (_, i) => String(i + 1)).join('\n');
  lineNumbers.textContent = numbers;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightSQL(input) {
  const keywords = new Set([
    'select','from','where','and','or','insert','into','values','update','set','delete','create','table',
    'alter','drop','join','left','right','inner','outer','group','by','order','limit','offset','as',
    'distinct','on','having','union','all','case','when','then','else','end','null','is','not','in',
    'exists','like','between','primary','key','foreign','references','index','view','database'
  ]);

  let i = 0;
  let out = '';
  while (i < input.length) {
    const ch = input[i];

    if (ch === '-' && input[i + 1] === '-') {
      let j = i + 2;
      while (j < input.length && input[j] !== '\n') j++;
      const comment = escapeHtml(input.slice(i, j));
      out += `<span class="tok-comment">${comment}</span>`;
      i = j;
      continue;
    }

    if (ch === '/' && input[i + 1] === '*') {
      let j = i + 2;
      while (j < input.length && !(input[j] === '*' && input[j + 1] === '/')) j++;
      j = Math.min(j + 2, input.length);
      const comment = escapeHtml(input.slice(i, j));
      out += `<span class="tok-comment">${comment}</span>`;
      i = j;
      continue;
    }

    if (ch === '\'' || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === quote) {
          if (input[j + 1] === quote) {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      const str = escapeHtml(input.slice(i, j));
      out += `<span class="tok-string">${str}</span>`;
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const num = escapeHtml(input.slice(i, j));
      out += `<span class="tok-number">${num}</span>`;
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j])) j++;
      const word = input.slice(i, j);
      const lower = word.toLowerCase();
      if (keywords.has(lower)) {
        out += `<span class="tok-keyword">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
      i = j;
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }
  return out;
}

function updateHighlight() {
  if (!queryHighlight) return;
  queryHighlight.innerHTML = highlightSQL(query.value || '');
}

function updateEditor() {
  updateLineNumbers();
  updateHighlight();
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
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }

  const sql = buildOrderBy(query.value, column, currentSort.direction);
  query.value = sql;
  updateEditor();
  await runQuery(sql);
}

function tableQuery(schema, table) {
  if (dbType.value === 'postgres') {
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
          updateEditor();
          await runQuery(sql);
        });
        groupNode.children.appendChild(leaf);
      });
    });
  }
}

async function refreshTables() {
  tableList.innerHTML = '';
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
  buildTable(res.rows);
}

async function refreshSaved() {
  const list = await window.api.listSavedConnections();
  savedList.innerHTML = '';
  list.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry.name;

    li.addEventListener('click', async () => {
      const res = await window.api.connect({
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
      await refreshTables();
    });

    li.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      const confirmed = confirm(`Remover conexão "${entry.name}"?`);
      if (!confirmed) return;
      await window.api.deleteConnection(entry.name);
      await refreshSaved();
    });

    savedList.appendChild(li);
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

  const res = await window.api.connect(config);
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao conectar.');
    return;
  }
  isConnected = true;
  setStatus('Conectado', true);
  setScreen(true);
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
});

exitBtn.addEventListener('click', async () => {
  await window.api.disconnect();
  isConnected = false;
  setStatus('Desconectado', false);
  setScreen(false);
  tableList.innerHTML = '';
  resultsTable.innerHTML = '';
  tabs = [];
  activeTabId = null;
  renderTabBar();
  query.value = '';
  updateEditor();
});

runBtn.addEventListener('click', async () => {
  ensureActiveTab();
  const sql = query.value;
  await runQuery(sql);
});

query.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    ensureActiveTab();
    await runQuery(query.value);
  }
});

query.addEventListener('input', () => {
  const tab = getActiveTab();
  if (tab) tab.query = query.value;
  updateEditor();
});

query.addEventListener('scroll', () => {
  if (lineNumbers) {
    lineNumbers.scrollTop = query.scrollTop;
  }
  if (queryHighlight) {
    queryHighlight.scrollTop = query.scrollTop;
    queryHighlight.scrollLeft = query.scrollLeft;
  }
});

tableSearch.addEventListener('input', () => {
  renderTableTree(tableSearch.value);
});

setStatus('Desconectado', false);
setScreen(false);
refreshSaved();
updateEditor();
