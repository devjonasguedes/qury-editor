import { getField } from '../utils.js';

const TAB_DEFS = [
  { id: 'data', label: 'Data' },
  { id: 'columns', label: 'Columns' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'indexes', label: 'Indexes' },
  { id: 'ddl', label: 'DDL' },
  { id: 'relations', label: 'Relations' }
];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function tableKey(schema, table) {
  return `${String(schema || '').toLowerCase()}.${String(table || '').toLowerCase()}`;
}

function renderRowsTable(columns, rows) {
  const head = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `
    <div class="object-grid-wrap">
      <table class="object-grid">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || '<tr><td colspan="99">No data.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function resolveConstraintType(constraint) {
  return String(constraint.type || constraint.constraint_type || '').toUpperCase();
}

function isForeignKey(constraint) {
  return resolveConstraintType(constraint).includes('FOREIGN');
}

export function createTableObjectTabs({
  container,
  detailsContainer,
  resultsToolbar,
  resultsTableWrap,
  getScopeKey,
  listColumns,
  listTableInfo,
  getTableDefinition,
  listTables,
  onShowError,
  onToast
}) {
  let context = null;
  let activeTab = 'data';
  let requestSeq = 0;
  let metaVisible = false;
  let toolbarVisibleForData = false;

  const columnsCache = new Map();
  const infoCache = new Map();
  const ddlCache = new Map();
  const inboundCache = new Map();

  const scopeKey = () => (typeof getScopeKey === 'function' ? String(getScopeKey() || '__default__') : '__default__');
  const scopedTableKey = (schema, table) => `${scopeKey()}::${tableKey(schema, table)}`;
  const scopedSchemaKey = (schema) => `${scopeKey()}::${String(schema || '').toLowerCase()}`;

  const setMetaVisible = (visible) => {
    const showMeta = !!visible;
    if (resultsTableWrap) {
      resultsTableWrap.classList.toggle('hidden', showMeta);
    }
    if (detailsContainer) {
      detailsContainer.classList.toggle('hidden', !showMeta);
    }
    if (resultsToolbar) {
      if (showMeta && !metaVisible) {
        toolbarVisibleForData = !resultsToolbar.classList.contains('hidden');
        resultsToolbar.classList.add('hidden');
      } else if (!showMeta && metaVisible) {
        resultsToolbar.classList.toggle('hidden', !toolbarVisibleForData);
      }
    }
    metaVisible = showMeta;
  };

  const normalizeColumns = (rows) =>
    ensureArray(rows).map((row) => ({
      name: getField(row, ['column_name', 'name']) || '',
      type: getField(row, ['data_type', 'type']) || ''
    }));

  const loadColumns = async (schema, table, { silent = false } = {}) => {
    const key = scopedTableKey(schema, table);
    if (columnsCache.has(key)) return columnsCache.get(key);
    if (typeof listColumns !== 'function') {
      columnsCache.set(key, []);
      return [];
    }
    try {
      const res = await listColumns({ schema, table });
      if (!res || !res.ok) {
        if (!silent && onShowError) await onShowError((res && res.error) || 'Failed to load columns.');
        return [];
      }
      const columns = normalizeColumns(res.columns || []);
      columnsCache.set(key, columns);
      return columns;
    } catch (err) {
      if (!silent && onShowError) {
        const message = err && err.message ? err.message : 'Failed to load columns.';
        await onShowError(message);
      }
      return [];
    }
  };

  const loadTableInfo = async (schema, table, { silent = false } = {}) => {
    const key = scopedTableKey(schema, table);
    if (infoCache.has(key)) return infoCache.get(key);
    if (typeof listTableInfo !== 'function') {
      const fallback = { indexes: [], constraints: [], triggers: [] };
      infoCache.set(key, fallback);
      return fallback;
    }
    try {
      const res = await listTableInfo({ schema, table });
      if (!res || !res.ok) {
        if (!silent && onShowError) await onShowError((res && res.error) || 'Failed to load table metadata.');
        return { indexes: [], constraints: [], triggers: [] };
      }
      const info = {
        indexes: ensureArray(res.indexes),
        constraints: ensureArray(res.constraints),
        triggers: ensureArray(res.triggers)
      };
      infoCache.set(key, info);
      return info;
    } catch (err) {
      if (!silent && onShowError) {
        const message = err && err.message ? err.message : 'Failed to load table metadata.';
        await onShowError(message);
      }
      return { indexes: [], constraints: [], triggers: [] };
    }
  };

  const loadDdl = async (schema, table) => {
    const key = scopedTableKey(schema, table);
    if (ddlCache.has(key)) return ddlCache.get(key);
    if (typeof getTableDefinition !== 'function') {
      ddlCache.set(key, '');
      return '';
    }
    try {
      const res = await getTableDefinition({ schema, table });
      if (!res || !res.ok) {
        if (onShowError) await onShowError((res && res.error) || 'Failed to load DDL.');
        return '';
      }
      const ddl = String(res.sql || res.definition || '').trim();
      ddlCache.set(key, ddl);
      return ddl;
    } catch (err) {
      if (onShowError) {
        const message = err && err.message ? err.message : 'Failed to load DDL.';
        await onShowError(message);
      }
      return '';
    }
  };

  const loadInboundRelations = async (schema, table) => {
    const schemaCacheKey = scopedSchemaKey(schema);
    if (inboundCache.has(schemaCacheKey)) {
      const index = inboundCache.get(schemaCacheKey);
      return ensureArray(index.get(tableKey(schema, table)));
    }

    const relationIndex = new Map();
    if (typeof listTables !== 'function') {
      inboundCache.set(schemaCacheKey, relationIndex);
      return [];
    }

    try {
      const listRes = await listTables();
      if (!listRes || !listRes.ok) {
        inboundCache.set(schemaCacheKey, relationIndex);
        return [];
      }
      const rows = ensureArray(listRes.rows);
      const sameSchemaRows = rows.filter((row) => {
        const rowSchema = String(getField(row, ['table_schema', 'schema']) || '').toLowerCase();
        return rowSchema === String(schema || '').toLowerCase();
      });

      for (const row of sameSchemaRows) {
        const sourceTable = getField(row, ['table_name', 'name', 'table']) || '';
        if (!sourceTable) continue;
        const info = await loadTableInfo(schema, sourceTable, { silent: true });
        ensureArray(info.constraints)
          .filter((constraint) => isForeignKey(constraint))
          .forEach((constraint) => {
            const ref = constraint.ref || constraint.reference || {};
            const refSchema = ref.schema || schema;
            const refTable = ref.table || '';
            if (!refTable) return;
            const key = tableKey(refSchema, refTable);
            if (!relationIndex.has(key)) relationIndex.set(key, []);
            relationIndex.get(key).push({
              constraint: constraint.name || '',
              fromSchema: schema,
              fromTable: sourceTable,
              fromColumns: ensureArray(constraint.columns),
              toSchema: refSchema,
              toTable: refTable,
              toColumns: ensureArray(ref.columns)
            });
          });
      }
    } catch (_) {
      // Keep empty relation index on failures.
    }

    inboundCache.set(schemaCacheKey, relationIndex);
    return ensureArray(relationIndex.get(tableKey(schema, table)));
  };

  const renderMessage = (title, description) => {
    if (!detailsContainer) return;
    detailsContainer.innerHTML = `
      <div class="object-message">
        <div class="object-message-title">${escapeHtml(title)}</div>
        <div class="object-message-body">${escapeHtml(description)}</div>
      </div>
    `;
  };

  const copyText = async (text) => {
    const value = String(text || '');
    if (!value) return false;
    if (typeof navigator !== 'undefined'
      && navigator.clipboard
      && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {
        // Fallback below.
      }
    }
    try {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', 'readonly');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(input);
      return !!copied;
    } catch (_) {
      return false;
    }
  };

  const renderColumns = async (schema, table) => {
    const columns = await loadColumns(schema, table);
    if (!detailsContainer) return;
    if (columns.length === 0) {
      renderMessage('Columns', 'No columns found for this table.');
      return;
    }
    const rows = columns.map((col) => [col.name, col.type]);
    detailsContainer.innerHTML = `
      <div class="object-section-title">Columns</div>
      ${renderRowsTable(['Column', 'Type'], rows)}
    `;
  };

  const renderConstraints = async (schema, table) => {
    const info = await loadTableInfo(schema, table);
    const constraints = ensureArray(info.constraints);
    if (!detailsContainer) return;
    if (constraints.length === 0) {
      renderMessage('Constraints', 'No constraints found for this table.');
      return;
    }
    const rows = constraints.map((constraint) => {
      const type = resolveConstraintType(constraint);
      const columns = ensureArray(constraint.columns).join(', ');
      const ref = constraint.ref || constraint.reference || {};
      const reference = ref.table
        ? `${ref.schema ? `${ref.schema}.` : ''}${ref.table}${ensureArray(ref.columns).length ? ` (${ensureArray(ref.columns).join(', ')})` : ''}`
        : '';
      const details = reference || constraint.definition || '';
      return [constraint.name || '-', type || '-', columns || '-', details || '-'];
    });
    detailsContainer.innerHTML = `
      <div class="object-section-title">Constraints</div>
      ${renderRowsTable(['Name', 'Type', 'Columns', 'Details'], rows)}
    `;
  };

  const renderIndexes = async (schema, table) => {
    const info = await loadTableInfo(schema, table);
    const indexes = ensureArray(info.indexes);
    if (!detailsContainer) return;
    if (indexes.length === 0) {
      renderMessage('Indexes', 'No indexes found for this table.');
      return;
    }
    const rows = indexes.map((index) => {
      const type = String(index.method || index.type || index.index_type || '').toUpperCase();
      const unique = index.primary ? 'PRIMARY' : (index.unique ? 'YES' : 'NO');
      const columns = ensureArray(index.columns).join(', ');
      return [index.name || '-', type || '-', unique, columns || '-'];
    });
    detailsContainer.innerHTML = `
      <div class="object-section-title">Indexes</div>
      ${renderRowsTable(['Name', 'Type', 'Unique', 'Columns'], rows)}
    `;
  };

  const renderDdl = async (schema, table) => {
    const ddl = await loadDdl(schema, table);
    if (!detailsContainer) return;
    if (!ddl) {
      renderMessage('DDL', 'DDL was not returned for this table.');
      return;
    }
    detailsContainer.innerHTML = `
      <div class="object-section-head">
        <div class="object-section-title">DDL</div>
        <button type="button" class="icon-btn mini object-ddl-copy" title="Copy DDL" aria-label="Copy DDL" data-copy-ddl>
          <i class="bi bi-clipboard"></i>
        </button>
      </div>
      <pre class="object-ddl">${escapeHtml(ddl)}</pre>
    `;
    const copyBtn = detailsContainer.querySelector('[data-copy-ddl]');
    if (!copyBtn) return;
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(ddl);
      if (!ok) {
        if (onShowError) await onShowError('Unable to copy DDL.');
        return;
      }
      if (typeof onToast === 'function') onToast('DDL copied');
    });
  };

  const renderRelations = async (schema, table) => {
    const info = await loadTableInfo(schema, table);
    const outbound = ensureArray(info.constraints)
      .filter((constraint) => isForeignKey(constraint))
      .map((constraint) => {
        const ref = constraint.ref || constraint.reference || {};
        return [
          constraint.name || '-',
          ensureArray(constraint.columns).join(', ') || '-',
          `${ref.schema ? `${ref.schema}.` : ''}${ref.table || '-'}`,
          ensureArray(ref.columns).join(', ') || '-'
        ];
      });

    const inbound = await loadInboundRelations(schema, table);
    const inboundRows = inbound.map((item) => [
      item.constraint || '-',
      `${item.fromSchema ? `${item.fromSchema}.` : ''}${item.fromTable || '-'}`,
      ensureArray(item.fromColumns).join(', ') || '-',
      ensureArray(item.toColumns).join(', ') || '-'
    ]);

    if (!detailsContainer) return;
    detailsContainer.innerHTML = `
      <div class="object-section-title">Relations</div>
      <div class="object-relations-grid">
        <section>
          <h4>Outbound (FKs)</h4>
          ${outbound.length
            ? renderRowsTable(['Constraint', 'Columns', 'References', 'Ref Columns'], outbound)
            : '<div class="object-muted">No outbound foreign keys.</div>'}
        </section>
        <section>
          <h4>Inbound (Referenced By)</h4>
          ${inboundRows.length
            ? renderRowsTable(['Constraint', 'From Table', 'From Columns', 'To Columns'], inboundRows)
            : '<div class="object-muted">No inbound references found.</div>'}
        </section>
      </div>
    `;
  };

  const renderTabs = () => {
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = TAB_DEFS.map((tab) => {
      const active = tab.id === activeTab ? ' active' : '';
      const disabled = !context && tab.id !== 'data';
      return `<button type="button" class="object-tab-btn${active}${disabled ? ' disabled' : ''}" data-object-tab="${tab.id}" ${disabled ? 'disabled aria-disabled="true"' : ''}>${escapeHtml(tab.label)}</button>`;
    }).join('');
  };

  const renderActiveMeta = async () => {
    if (!context || activeTab === 'data') return;
    if (!detailsContainer) return;

    const seq = ++requestSeq;
    detailsContainer.innerHTML = '<div class="object-loading">Loading...</div>';
    const { schema, table } = context;

    if (activeTab === 'columns') {
      await renderColumns(schema, table);
    } else if (activeTab === 'constraints') {
      await renderConstraints(schema, table);
    } else if (activeTab === 'indexes') {
      await renderIndexes(schema, table);
    } else if (activeTab === 'ddl') {
      await renderDdl(schema, table);
    } else if (activeTab === 'relations') {
      await renderRelations(schema, table);
    }

    if (seq !== requestSeq) return;
  };

  const activate = (tabId) => {
    const next = TAB_DEFS.some((tab) => tab.id === tabId) ? tabId : 'data';
    if (!context && next !== 'data') {
      return;
    }
    activeTab = next;
    renderTabs();

    if (next === 'data') {
      setMetaVisible(false);
      return;
    }

    setMetaVisible(true);
    void renderActiveMeta();
  };

  const openTable = ({ schema, table, active = 'data' } = {}) => {
    if (!table) return;
    const normalizedSchema = String(schema || '');
    const normalizedTable = String(table || '');
    const sameContext =
      context &&
      context.schema === normalizedSchema &&
      context.table === normalizedTable;

    context = { schema: normalizedSchema, table: normalizedTable };
    if (!sameContext) {
      requestSeq += 1;
    }

    renderTabs();
    activate(sameContext ? activeTab : active);
  };

  const clear = () => {
    context = null;
    activeTab = 'data';
    requestSeq += 1;
    metaVisible = false;
    toolbarVisibleForData = false;
    if (detailsContainer) {
      detailsContainer.classList.add('hidden');
      detailsContainer.innerHTML = '';
    }
    if (resultsTableWrap) {
      resultsTableWrap.classList.remove('hidden');
    }
    renderTabs();
    setMetaVisible(false);
  };

  const resetScopeCache = () => {
    const currentScope = scopeKey();
    const prefix = `${currentScope}::`;

    for (const key of Array.from(columnsCache.keys())) {
      if (key.startsWith(prefix)) columnsCache.delete(key);
    }
    for (const key of Array.from(infoCache.keys())) {
      if (key.startsWith(prefix)) infoCache.delete(key);
    }
    for (const key of Array.from(ddlCache.keys())) {
      if (key.startsWith(prefix)) ddlCache.delete(key);
    }
    for (const key of Array.from(inboundCache.keys())) {
      if (key.startsWith(prefix)) inboundCache.delete(key);
    }
  };

  if (container) {
    container.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-object-tab]');
      if (!btn) return;
      activate(btn.getAttribute('data-object-tab') || 'data');
    });
  }

  clear();

  return {
    openTable,
    clear,
    activateData: () => activate('data'),
    setDataToolbarVisible: (visible) => {
      toolbarVisibleForData = !!visible;
      if (!metaVisible && resultsToolbar) {
        resultsToolbar.classList.toggle('hidden', !toolbarVisibleForData);
      }
    },
    resetScopeCache,
    getContext: () => (context ? { ...context } : null)
  };
}
