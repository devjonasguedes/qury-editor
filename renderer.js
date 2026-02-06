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
const disconnectBtn = byId('disconnectBtn');
const savedList = byId('savedList');
const tableList = byId('tableList');
const schemaName = byId('schemaName');
const tableSearch = byId('tableSearch');
const query = byId('query');
const runBtn = byId('runBtn');
const resultsTable = byId('resultsTable');
const exitBtn = byId('exitBtn');
const connectScreen = byId('connectScreen');
const mainScreen = byId('mainScreen');

let isConnected = false;
const MAX_RENDER_ROWS = 2000;

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

function tableQuery(schema, table) {
  if (dbType.value === 'postgres') {
    return `SELECT * FROM "${schema}"."${table}" LIMIT 500`;
  }
  if (schema) {
    return `SELECT * FROM \`${schema}\`.\`${table}\` LIMIT 500`;
  }
  return `SELECT * FROM \`${table}\` LIMIT 500`;
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

function renderTableList(filterText) {
  const filter = (filterText || '').toLowerCase().trim();
  tableList.innerHTML = '';
  const filtered = tableCache.filter((row) => {
    const name = getField(row, ['table_name', 'name', 'table']) || '';
    return name.toLowerCase().includes(filter);
  });

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(li);
    return;
  }

  filtered.forEach((row) => {
    const li = document.createElement('li');
    const schema = getField(row, ['table_schema', 'schema', 'table_schema_name']);
    const name = getField(row, ['table_name', 'name', 'table']);
    li.textContent = name;
    li.addEventListener('click', async () => {
      const sql = tableQuery(schema, name);
      query.value = sql;
      await runQuery(sql);
    });
    tableList.appendChild(li);
  });
}

async function refreshTables() {
  tableList.innerHTML = '';
  schemaName.textContent = '';
  const res = await window.api.listTables();
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao listar tabelas.');
    return;
  }

  if (!res.rows || res.rows.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(li);
    return;
  }

  tableCache = res.rows;

  const schemas = new Set();
  res.rows.forEach((row) => {
    const schema = getField(row, ['table_schema', 'schema', 'table_schema_name']);
    if (schema) schemas.add(schema);
  });

  if (schemas.size === 1) {
    schemaName.textContent = `(${Array.from(schemas)[0]})`;
  } else if (schemas.size > 1) {
    schemaName.textContent = '(vários)';
  }

  renderTableList(tableSearch.value);
}

async function runQuery(sql) {
  const res = await window.api.runQuery(sql);
  if (!res.ok) {
    await window.api.showError(res.error || 'Erro ao executar query.');
    return;
  }
  buildTable(res.rows);
}

async function refreshSaved() {
  const list = await window.api.listSavedConnections();
  savedList.innerHTML = '';
  list.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry.name;

    li.addEventListener('click', async () => {
      dbType.value = entry.type;
      host.value = entry.host;
      port.value = entry.port || '';
      user.value = entry.user || '';
      password.value = entry.password || '';
      database.value = entry.database || '';
      saveName.value = entry.name;
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

disconnectBtn.addEventListener('click', async () => {
  await window.api.disconnect();
  isConnected = false;
  setStatus('Desconectado', false);
  setScreen(false);
  tableList.innerHTML = '';
  resultsTable.innerHTML = '';
});

exitBtn.addEventListener('click', async () => {
  await window.api.disconnect();
  isConnected = false;
  setStatus('Desconectado', false);
  setScreen(false);
  tableList.innerHTML = '';
  resultsTable.innerHTML = '';
});

runBtn.addEventListener('click', async () => {
  const sql = query.value;
  await runQuery(sql);
});

query.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    await runQuery(query.value);
  }
});

tableSearch.addEventListener('input', () => {
  renderTableList(tableSearch.value);
});

setStatus('Desconectado', false);
setScreen(false);
refreshSaved();
