import { getField, normalizeName } from './utils.js';

let columnCache = new Map();
let selectedKey = null;

export function resetTreeCache() {
  columnCache = new Map();
  selectedKey = null;
}

function typeLabel(rawType) {
  const type = String(rawType || '').toUpperCase();
  if (type.includes('VIEW')) return 'Views';
  if (type.includes('BASE')) return 'Tables';
  return 'Outros';
}

function buildTreeData(rows, filterText, activeSchema) {
  const filter = (filterText || '').toLowerCase().trim();
  const map = new Map();
  rows.forEach((row) => {
    const schema = getField(row, ['table_schema', 'schema', 'table_schema_name'])
      || activeSchema
      || 'default';
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

const INDENT = 20;

function createGroup({ label, depth, expanded = true, icon, count, key, level, onToggle, isFolder, isActive }) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-group' + (expanded ? ' expanded' : '');
  if (isActive) item.classList.add('active-schema');
  item.style.paddingLeft = `${8 + depth * INDENT}px`;
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-level', String(level || 1));
  item.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  item.dataset.key = key || '';
  if (key && selectedKey === key) {
    item.classList.add('selected');
    item.setAttribute('aria-selected', 'true');
  }

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.innerHTML = '<i class="bi bi-chevron-right"></i>';
  content.appendChild(caret);

  const iconEl = document.createElement('span');
  iconEl.className = 'tree-icon';
  if (icon) {
    iconEl.innerHTML = icon;
  } else {
    iconEl.classList.add('placeholder');
  }
  content.appendChild(iconEl);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.textContent = label;
  content.appendChild(text);

  if (typeof count === 'number') {
    const badge = document.createElement('span');
    badge.className = 'tree-badge';
    badge.textContent = String(count);
    content.appendChild(badge);
  }

  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  item.appendChild(content);
  item.appendChild(actions);

  const children = document.createElement('div');
  children.className = 'tree-children' + (expanded ? '' : ' hidden');

  const toggleGroup = () => {
    item.classList.toggle('expanded');
    children.classList.toggle('hidden');
    const isExpanded = item.classList.contains('expanded');
    item.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    if (isFolder && iconEl) {
      iconEl.innerHTML = isExpanded ? '<i class="bi bi-folder2-open"></i>' : '<i class="bi bi-folder2"></i>';
    }
    if (onToggle) onToggle(item.classList.contains('expanded'));
  };

  caret.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleGroup();
  });

  item.addEventListener('click', (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-item') !== item) return;
    setSelected(item);
  });

  item.addEventListener('dblclick', (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-item') !== item) return;
    toggleGroup();
  });

  return { item, children };
}

function createColumnLeaf(label, type, depth) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-column';
  item.style.paddingLeft = `${8 + depth * INDENT}px`;
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-level', String(depth + 1));

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.innerHTML = '&nbsp;';
  content.appendChild(caret);

  const iconEl = document.createElement('span');
  iconEl.className = 'tree-icon placeholder';
  content.appendChild(iconEl);

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

function createTableNode(schema, name, depth, onOpenTable, listColumns, onShowError, isView, highlightText, options = {}) {
  const { expanded = false, onToggle, onCopyName, onCopyQualified, key } = options;
  const item = document.createElement('div');
  item.className = 'tree-item tree-leaf tree-table';
  item.style.paddingLeft = `${8 + depth * INDENT}px`;
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-level', String(depth + 1));
  item.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  item.dataset.key = key || `${schema}.${name}`;
  if (selectedKey === item.dataset.key) {
    item.classList.add('selected');
    item.setAttribute('aria-selected', 'true');
  }

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.innerHTML = '<i class="bi bi-chevron-right"></i>';
  content.appendChild(caret);

  const iconEl = document.createElement('span');
  iconEl.className = 'tree-icon';
  iconEl.innerHTML = isView ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-table"></i>';
  content.appendChild(iconEl);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.appendChild(makeHighlight(name, highlightText));
  content.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'icon-btn tree-action';
  openBtn.title = 'SELECT * FROM table LIMIT 100';
  openBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
  openBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onOpenTable) await onOpenTable(schema, name);
  });

  const copyNameBtn = document.createElement('button');
  copyNameBtn.className = 'icon-btn tree-action';
  copyNameBtn.title = 'Copiar nome';
  copyNameBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
  copyNameBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onCopyName) await onCopyName(name);
  });

  const copyQualifiedBtn = document.createElement('button');
  copyQualifiedBtn.className = 'icon-btn tree-action';
  copyQualifiedBtn.title = 'Copiar nome qualificado';
  copyQualifiedBtn.innerHTML = '<i class="bi bi-clipboard2-plus"></i>';
  copyQualifiedBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onCopyQualified) await onCopyQualified(schema, name);
  });

  actions.appendChild(openBtn);
  actions.appendChild(copyNameBtn);
  actions.appendChild(copyQualifiedBtn);

  item.appendChild(content);
  item.appendChild(actions);

  const children = document.createElement('div');
  children.className = 'tree-children' + (expanded ? '' : ' hidden');
  let loaded = false;

  const toggle = async () => {
    item.classList.toggle('expanded');
    children.classList.toggle('hidden');
    item.setAttribute('aria-expanded', item.classList.contains('expanded') ? 'true' : 'false');
    if (onToggle) onToggle(item.classList.contains('expanded'));
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
    setSelected(item);
  });

  item.addEventListener('dblclick', async (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-caret')) return;
    if (onOpenTable) await onOpenTable(schema, name);
  });

  if (expanded) {
    toggle();
  }

  return { item, children };
}

export function renderTableTree({
  tableList,
  tableCache,
  filterText,
  activeSchema,
  onOpenTable,
  listColumns,
  onShowError,
  expandedState,
  onToggleExpand,
  onCopyName,
  onCopyQualified
}) {
  if (!tableList) return;
  tableList.innerHTML = '';
  tableList.className = 'tree';
  tableList.setAttribute('role', 'tree');

  if (!tableCache || tableCache.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(empty);
    return;
  }

  const treeData = buildTreeData(tableCache, filterText, activeSchema);
  if (treeData.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Sem tabelas encontradas.';
    tableList.appendChild(empty);
    return;
  }

  const filterActive = !!(filterText || '').trim();

  const normalizedActive = normalizeName(activeSchema);
  for (const [schema, groups] of treeData.entries()) {
    const isActiveSchema = normalizedActive && normalizeName(schema) === normalizedActive;
    const schemaKey = `db:${schema}`;
    const schemaExpanded = expandedState && Object.prototype.hasOwnProperty.call(expandedState, schemaKey)
      ? !!expandedState[schemaKey]
      : true;
    const schemaNode = createGroup({
      label: schema,
      depth: 0,
      expanded: schemaExpanded,
      icon: '<i class="bi bi-database"></i>',
      key: schemaKey,
      level: 1,
      isActive: isActiveSchema,
      onToggle: (expanded) => {
        if (onToggleExpand) onToggleExpand(schemaKey, expanded);
      }
    });
    tableList.appendChild(schemaNode.item);
    tableList.appendChild(schemaNode.children);

    ['Tables', 'Views', 'Outros'].forEach((groupLabel) => {
      const items = groups[groupLabel] || [];
      if (items.length === 0) return;

      const groupKey = `group:${schema}:${groupLabel}`;
      const groupExpanded = expandedState && Object.prototype.hasOwnProperty.call(expandedState, groupKey)
        ? !!expandedState[groupKey]
        : true;
      const groupNode = createGroup({
        label: groupLabel,
        depth: 1,
        expanded: groupExpanded,
        icon: '<i class="bi bi-folder2-open"></i>',
        count: items.length,
        key: groupKey,
        level: 2,
        isFolder: true,
        onToggle: (expanded) => {
          if (onToggleExpand) onToggleExpand(groupKey, expanded);
          if (!filterActive) return;
          groupNode.children
            .querySelectorAll('.tree-item.tree-table')
            .forEach((item) => {
              item.classList.toggle('expanded', expanded);
              const sibling = item.nextElementSibling;
              if (sibling && sibling.classList.contains('tree-children')) {
                sibling.classList.toggle('hidden', !expanded);
              }
            });
        }
      });
      schemaNode.children.appendChild(groupNode.item);
      schemaNode.children.appendChild(groupNode.children);

      items.sort((a, b) => a.localeCompare(b));
      items.forEach((name) => {
        const tableKey = `table:${schema}.${name}`;
        const tableExpanded = expandedState && Object.prototype.hasOwnProperty.call(expandedState, tableKey)
          ? !!expandedState[tableKey]
          : false;
        const tableNode = createTableNode(
          schema,
          name,
          2,
          onOpenTable,
          listColumns,
          onShowError,
          groupLabel === 'Views',
          filterText,
          {
            key: tableKey,
            expanded: tableExpanded,
            onToggle: (expanded) => {
              if (onToggleExpand) onToggleExpand(tableKey, expanded);
            },
            onCopyName,
            onCopyQualified
          }
        );
        groupNode.children.appendChild(tableNode.item);
        groupNode.children.appendChild(tableNode.children);
      });
    });
  }
}

function setSelected(item) {
  if (!item) return;
  if (selectedKey) {
    const prev = document.querySelector(`[data-key="${selectedKey}"]`);
    if (prev) {
      prev.classList.remove('selected');
      prev.setAttribute('aria-selected', 'false');
    }
  }
  const key = item.dataset.key || '';
  if (key) {
    selectedKey = key;
    item.classList.add('selected');
    item.setAttribute('aria-selected', 'true');
  }
}

function makeHighlight(text, query) {
  const q = (query || '').trim();
  if (!q) return document.createTextNode(text);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return document.createTextNode(text);
  const frag = document.createDocumentFragment();
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  if (before) frag.appendChild(document.createTextNode(before));
  const mark = document.createElement('span');
  mark.className = 'tree-highlight';
  mark.textContent = match;
  frag.appendChild(mark);
  if (after) frag.appendChild(document.createTextNode(after));
  return frag;
}
