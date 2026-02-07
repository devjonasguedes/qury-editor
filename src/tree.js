import { getField, normalizeName } from './utils.js';

let columnCache = new Map();
let tableInfoCache = new Map();
let selectedKey = null;

export function resetTreeCache() {
  columnCache = new Map();
  tableInfoCache = new Map();
  selectedKey = null;
}

function tableTypeLabel(rawType) {
  const type = String(rawType || '').toUpperCase();
  if (type.includes('VIEW')) return 'Views';
  if (type.includes('BASE')) return 'Tables';
  return 'Other';
}

function routineTypeLabel(rawType) {
  const type = String(rawType || '').toUpperCase();
  if (type.includes('PROCEDURE')) return 'Procedures';
  if (type.includes('FUNCTION')) return 'Functions';
  return 'Other';
}

function ensureGroup(map, schema) {
  if (!map.has(schema)) {
    map.set(schema, { Tables: [], Views: [], Procedures: [], Functions: [], Other: [] });
  }
  return map.get(schema);
}

function buildTreeData(tableRows, routineRows, filterText, activeSchema) {
  const filter = (filterText || '').toLowerCase().trim();
  const map = new Map();
  (tableRows || []).forEach((row) => {
    const schema = getField(row, ['table_schema', 'schema', 'table_schema_name'])
      || activeSchema
      || 'default';
    const name = getField(row, ['table_name', 'name', 'table']) || '';
    const rawType = getField(row, ['table_type', 'type']) || '';
    if (filter && !name.toLowerCase().includes(filter)) return;
    const group = ensureGroup(map, schema);
    const label = tableTypeLabel(rawType);
    group[label] = group[label] || [];
    group[label].push({ name, itemType: 'table', isView: label === 'Views' });
  });

  (routineRows || []).forEach((row) => {
    const schema = getField(row, ['routine_schema', 'schema', 'routine_schema_name'])
      || activeSchema
      || 'default';
    const name = getField(row, ['routine_name', 'name', 'routine']) || '';
    const rawType = getField(row, ['routine_type', 'type']) || '';
    if (filter && !name.toLowerCase().includes(filter)) return;
    const group = ensureGroup(map, schema);
    const label = routineTypeLabel(rawType);
    group[label] = group[label] || [];
    group[label].push({ name, itemType: 'routine', routineType: rawType });
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

function createColumnLeaf(label, type, depth, className = 'tree-column') {
  const item = document.createElement('div');
  item.className = `tree-item ${className}`;
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
    if (onShowError) await onShowError((res && res.error) || 'Failed to list columns.');
    return null;
  }
  const cols = res.columns || [];
  columnCache.set(key, cols);
  return cols;
}

async function fetchTableInfo(schema, table, listTableInfo, onShowError) {
  const key = `${schema}.${table}`;
  if (tableInfoCache.has(key)) return tableInfoCache.get(key);
  if (!listTableInfo) return { indexes: [], constraints: [] };
  const res = await listTableInfo({ schema, table });
  if (!res || !res.ok) {
    if (onShowError) await onShowError((res && res.error) || 'Failed to load table info.');
    return null;
  }
  const info = {
    indexes: Array.isArray(res.indexes) ? res.indexes : [],
    constraints: Array.isArray(res.constraints) ? res.constraints : []
  };
  tableInfoCache.set(key, info);
  return info;
}

function createSectionHeader(label, depth, icon) {
  const item = document.createElement('div');
  item.className = 'tree-item tree-section';
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

  item.appendChild(content);
  return item;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatIndexMeta(index) {
  const parts = [];
  if (index.primary) parts.push('PRIMARY');
  if (index.unique && !index.primary) parts.push('UNIQUE');
  const method = index.method || index.type || index.index_type;
  if (method) parts.push(String(method).toUpperCase());
  const cols = normalizeList(index.columns);
  if (cols.length) parts.push(`(${cols.join(', ')})`);
  return parts.join(' ');
}

function isKeyConstraint(constraint) {
  const type = String(constraint.type || constraint.constraint_type || '').toUpperCase();
  return type.includes('PRIMARY') || type.includes('FOREIGN');
}

function formatKeyMeta(constraint) {
  const type = String(constraint.type || constraint.constraint_type || '').toUpperCase();
  const cols = normalizeList(constraint.columns);
  const colPart = cols.length ? `(${cols.join(', ')})` : '';
  if (type.includes('FOREIGN')) {
    const ref = constraint.ref || constraint.reference || {};
    const refSchema = ref.schema ? `${ref.schema}.` : '';
    const refTable = ref.table || '';
    const refCols = normalizeList(ref.columns);
    const refPart = refTable
      ? ` -> ${refSchema}${refTable}${refCols.length ? `(${refCols.join(', ')})` : ''}`
      : '';
    return `FOREIGN KEY ${colPart}${refPart}`;
  }
  return `PRIMARY KEY ${colPart}`.trim();
}

function formatConstraintMeta(constraint) {
  const type = String(constraint.type || constraint.constraint_type || '').toUpperCase();
  const cols = normalizeList(constraint.columns);
  const colPart = cols.length ? `(${cols.join(', ')})` : '';
  if (type.includes('CHECK')) {
    const clause = constraint.definition || constraint.check_clause || '';
    if (clause) {
      const trimmed = String(clause).trim();
      return `CHECK ${trimmed.startsWith('(') ? trimmed : `(${trimmed})`}`;
    }
    return `CHECK ${colPart}`.trim();
  }
  if (type.includes('UNIQUE')) {
    return `UNIQUE ${colPart}`.trim();
  }
  return `${type}${colPart ? ` ${colPart}` : ''}`.trim();
}

function renderSection(container, options) {
  const { label, icon, items, emptyText, depth, renderItem } = options;
  container.appendChild(createSectionHeader(label, depth, icon));
  if (!items || items.length === 0) {
    const emptyLeaf = createColumnLeaf(emptyText, '', depth + 1, 'tree-meta tree-muted');
    container.appendChild(emptyLeaf);
    return;
  }
  items.forEach((item) => {
    const leaf = renderItem(item, depth + 1);
    if (leaf) container.appendChild(leaf);
  });
}

function renderTableDetails(container, columns, tableInfo, depth) {
  container.innerHTML = '';
  const cols = Array.isArray(columns) ? columns : [];
  const info = tableInfo || {};
  const indexes = normalizeList(info.indexes);
  const constraints = normalizeList(info.constraints);
  const keyConstraints = constraints.filter((constraint) => isKeyConstraint(constraint));
  const otherConstraints = constraints.filter((constraint) => !isKeyConstraint(constraint));

  renderSection(container, {
    label: 'Columns',
    icon: '<i class="bi bi-list-ul"></i>',
    items: cols,
    emptyText: 'No columns.',
    depth,
    renderItem: (col, itemDepth) => {
      const name = getField(col, ['column_name', 'name']) || '';
      const type = getField(col, ['data_type', 'type']) || '';
      return createColumnLeaf(name, type, itemDepth, 'tree-column');
    }
  });

  renderSection(container, {
    label: 'Indexes',
    icon: '<i class="bi bi-hash"></i>',
    items: indexes,
    emptyText: 'No indexes.',
    depth,
    renderItem: (index, itemDepth) => {
      const label = index.name || (index.primary ? 'PRIMARY' : 'INDEX');
      const meta = formatIndexMeta(index);
      return createColumnLeaf(label, meta, itemDepth, 'tree-meta');
    }
  });

  renderSection(container, {
    label: 'Keys',
    icon: '<i class="bi bi-key"></i>',
    items: keyConstraints,
    emptyText: 'No keys.',
    depth,
    renderItem: (constraint, itemDepth) => {
      const label = constraint.name || 'KEY';
      const meta = formatKeyMeta(constraint);
      return createColumnLeaf(label, meta, itemDepth, 'tree-meta');
    }
  });

  renderSection(container, {
    label: 'Constraints',
    icon: '<i class="bi bi-shield-check"></i>',
    items: otherConstraints,
    emptyText: 'No constraints.',
    depth,
    renderItem: (constraint, itemDepth) => {
      const label = constraint.name || 'CONSTRAINT';
      const meta = formatConstraintMeta(constraint);
      return createColumnLeaf(label, meta, itemDepth, 'tree-meta');
    }
  });
}

function createTableNode(schema, name, depth, onOpenTable, onOpenView, onOpenTableDefinition, listColumns, listTableInfo, onShowError, isView, highlightText, options = {}) {
  const { expanded = false, onToggle, onCopyName, onCopyQualified, key } = options;
  const item = document.createElement('div');
  item.className = 'tree-item tree-leaf tree-routine';
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

  let viewDefBtn = null;
  if (isView) {
    viewDefBtn = document.createElement('button');
    viewDefBtn.className = 'icon-btn tree-action';
    viewDefBtn.title = 'Open view definition';
    viewDefBtn.innerHTML = '<i class="bi bi-code-slash"></i>';
    viewDefBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (onOpenView) await onOpenView(schema, name);
    });
  }

  let tableDefBtn = null;
  if (!isView) {
    tableDefBtn = document.createElement('button');
    tableDefBtn.className = 'icon-btn tree-action';
    tableDefBtn.title = 'Open table definition';
    tableDefBtn.innerHTML = '<i class="bi bi-code-slash"></i>';
    tableDefBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (onOpenTableDefinition) await onOpenTableDefinition(schema, name);
    });
  }

  const copyNameBtn = document.createElement('button');
  copyNameBtn.className = 'icon-btn tree-action';
  copyNameBtn.title = 'Copy name';
  copyNameBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
  copyNameBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onCopyName) await onCopyName(name);
  });

  const copyQualifiedBtn = document.createElement('button');
  copyQualifiedBtn.className = 'icon-btn tree-action';
  copyQualifiedBtn.title = 'Copy qualified name';
  copyQualifiedBtn.innerHTML = '<i class="bi bi-clipboard2-plus"></i>';
  copyQualifiedBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onCopyQualified) await onCopyQualified(schema, name);
  });

  actions.appendChild(openBtn);
  if (viewDefBtn) actions.appendChild(viewDefBtn);
  if (tableDefBtn) actions.appendChild(tableDefBtn);
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
      children.innerHTML = '<div class="tree-empty">Loading...</div>';
      const [cols, info] = await Promise.all([
        fetchColumns(schema, name, listColumns, onShowError),
        fetchTableInfo(schema, name, listTableInfo, onShowError)
      ]);
      renderTableDetails(children, cols || [], info || {}, depth + 1);
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

function createRoutineNode(schema, name, routineType, depth, onOpenRoutine, highlightText, options = {}) {
  const { onCopyName, onCopyQualified, key } = options;
  const item = document.createElement('div');
  item.className = 'tree-item tree-leaf tree-table';
  item.style.paddingLeft = `${8 + depth * INDENT}px`;
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-level', String(depth + 1));
  item.dataset.key = key || `${schema}.${name}`;
  if (selectedKey === item.dataset.key) {
    item.classList.add('selected');
    item.setAttribute('aria-selected', 'true');
  }

  const content = document.createElement('div');
  content.className = 'tree-content';

  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.innerHTML = '&nbsp;';
  content.appendChild(caret);

  const iconEl = document.createElement('span');
  iconEl.className = 'tree-icon';
  const isProcedure = String(routineType || '').toUpperCase() === 'PROCEDURE';
  iconEl.innerHTML = isProcedure ? '<i class="bi bi-gear"></i>' : '<i class="bi bi-braces"></i>';
  content.appendChild(iconEl);

  const text = document.createElement('span');
  text.className = 'tree-label';
  text.appendChild(makeHighlight(name, highlightText));
  content.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'icon-btn tree-action';
  openBtn.title = isProcedure ? 'CALL routine()' : 'SELECT routine()';
  openBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
  openBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onOpenRoutine) await onOpenRoutine(schema, name, routineType);
  });

  const copyNameBtn = document.createElement('button');
  copyNameBtn.className = 'icon-btn tree-action';
  copyNameBtn.title = 'Copy name';
  copyNameBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
  copyNameBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (onCopyName) await onCopyName(name);
  });

  const copyQualifiedBtn = document.createElement('button');
  copyQualifiedBtn.className = 'icon-btn tree-action';
  copyQualifiedBtn.title = 'Copy qualified name';
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
  children.className = 'tree-children hidden';

  item.addEventListener('click', async (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-caret')) return;
    setSelected(item);
  });

  item.addEventListener('dblclick', async (event) => {
    if (event.target.closest('.tree-actions')) return;
    if (event.target.closest('.tree-caret')) return;
    if (onOpenRoutine) await onOpenRoutine(schema, name, routineType);
  });

  return { item, children };
}

export function renderTableTree({
  tableList,
  tableCache,
  routineCache,
  filterText,
  activeSchema,
  onOpenTable,
  onOpenView,
  onOpenTableDefinition,
  onOpenRoutine,
  listColumns,
  listTableInfo,
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

  const hasTables = Array.isArray(tableCache) && tableCache.length > 0;
  const hasRoutines = Array.isArray(routineCache) && routineCache.length > 0;
  if (!hasTables && !hasRoutines) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'No objects found.';
    tableList.appendChild(empty);
    return;
  }

  const treeData = buildTreeData(tableCache, routineCache, filterText, activeSchema);
  if (treeData.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'No objects found.';
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

    ['Tables', 'Views', 'Procedures', 'Functions', 'Other'].forEach((groupLabel) => {
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

      items.sort((a, b) => a.name.localeCompare(b.name));
      items.forEach((item) => {
        if (item.itemType === 'table') {
          const name = item.name;
          const tableKey = `table:${schema}.${name}`;
          const tableExpanded = expandedState && Object.prototype.hasOwnProperty.call(expandedState, tableKey)
            ? !!expandedState[tableKey]
            : false;
          const tableNode = createTableNode(
            schema,
            name,
            2,
            onOpenTable,
            onOpenView,
            onOpenTableDefinition,
            listColumns,
            listTableInfo,
            onShowError,
            item.isView,
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
          return;
        }

        const routineKey = `routine:${schema}.${item.name}`;
        const routineNode = createRoutineNode(
          schema,
          item.name,
          item.routineType,
          2,
          onOpenRoutine,
          filterText,
          {
            key: routineKey,
            onCopyName,
            onCopyQualified
          }
        );
        groupNode.children.appendChild(routineNode.item);
        groupNode.children.appendChild(routineNode.children);
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
