let columnCache = new Map();

export function resetTreeCache() {
  columnCache = new Map();
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

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = '▸';
  content.appendChild(caret);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.textContent = label;
  content.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  item.appendChild(content);
  item.appendChild(actions);

  const children = document.createElement('div');
  children.className = 'tree-children' + (expanded ? '' : ' hidden');

  item.addEventListener('click', (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-item') !== item) return;
    item.classList.toggle('expanded');
    children.classList.toggle('hidden');
  });

  return { item, children };
}

function createColumnLeaf(label, type, depth) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-column';
  item.style.paddingLeft = `${8 + depth * 14}px`;

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = ' ';
  content.appendChild(caret);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.textContent = label;
  content.appendChild(text);

  const typeEl = document.createElement('span');
  typeEl.className = 'tree-column-type';
  typeEl.textContent = type || '';
  content.appendChild(typeEl);

  item.appendChild(content);
  return item;
}

async function fetchColumns(schema, table, listColumns, onShowError) {
  const key = `${schema}.${table}`;
  if (columnCache.has(key)) return columnCache.get(key);
  if (!listColumns) return [];
  const res = await listColumns({ schema, table });
  if (!res || !res.ok) {
    if (onShowError) await onShowError((res && res.error) || 'Erro ao listar colunas.');
    return null;
  }
  const cols = res.columns || [];
  columnCache.set(key, cols);
  return cols;
}

function renderColumns(container, columns, depth) {
  container.innerHTML = '';
  if (!columns || columns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Sem colunas.';
    container.appendChild(empty);
    return;
  }

  columns.forEach((col) => {
    const name = getField(col, ['column_name', 'name']) || '';
    const type = getField(col, ['data_type', 'type']) || '';
    const leaf = createColumnLeaf(name, type, depth);
    container.appendChild(leaf);
  });
}

function createTableNode(schema, name, depth, onOpenTable, listColumns, onShowError) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-leaf tree-table';
  item.style.paddingLeft = `${8 + depth * 14}px`;

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = '▸';
  content.appendChild(caret);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.textContent = name;
  content.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'icon-btn tree-action';
  openBtn.title = 'Abrir tabela';
  openBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
  openBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onOpenTable) await onOpenTable(schema, name);
  });

  actions.appendChild(openBtn);

  item.appendChild(content);
  item.appendChild(actions);

  const children = document.createElement('div');
  children.className = 'tree-children hidden';
  let loaded = false;

  const toggle = async () => {
    item.classList.toggle('expanded');
    children.classList.toggle('hidden');
    if (!children.classList.contains('hidden') && !loaded) {
      children.innerHTML = '<div class="tree-empty">Carregando...</div>';
      const cols = await fetchColumns(schema, name, listColumns, onShowError);
      renderColumns(children, cols || [], depth + 1);
      loaded = true;
    }
  };

  caret.addEventListener('click', async (event) => {
    event.stopPropagation();
    await toggle();
  });

  item.addEventListener('click', async (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-caret')) return;
    if (onOpenTable) await onOpenTable(schema, name);
  });

  return { item, children };
}

export function renderTableTree({
  tableList,
  tableCache,
  filterText,
  onOpenTable,
  listColumns,
  onShowError
}) {
  if (!tableList) return;
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
        const tableNode = createTableNode(
          schema,
          name,
          2,
          onOpenTable,
          listColumns,
          onShowError
        );
        groupNode.children.appendChild(tableNode.item);
        groupNode.children.appendChild(tableNode.children);
      });
    });
  }
}
