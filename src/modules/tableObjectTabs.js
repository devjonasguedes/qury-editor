import { getField } from '../utils.js';

const TAB_DEFS = [
  { id: 'data', label: 'Data' },
  { id: 'columns', label: 'Columns' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'indexes', label: 'Indexes' },
  { id: 'ddl', label: 'DDL' },
  { id: 'relations', label: 'Relations' },
  { id: 'quality', label: 'Quality' }
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

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toPercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function normalizeStatusCounts(summary) {
  const source = summary || {};
  return {
    errors: Math.max(0, Math.floor(asNumber(source.errors))),
    warnings: Math.max(0, Math.floor(asNumber(source.warnings))),
    info: Math.max(0, Math.floor(asNumber(source.info)))
  };
}

function qualityStatusClass(level) {
  if (level === 'error') return 'is-error';
  if (level === 'warning') return 'is-warning';
  return 'is-info';
}

function qualityStatusText(level) {
  if (level === 'error') return 'Error';
  if (level === 'warning') return 'Warning';
  return 'Info';
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
  runQuery,
  quoteIdentifier,
  buildQualifiedTableRef,
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
  const qualityCache = new Map();

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

  const quoteName = (value) => {
    if (typeof quoteIdentifier === 'function') return quoteIdentifier(value);
    return `"${String(value || '').replace(/"/g, '""')}"`;
  };

  const buildTableRef = (schema, table) => {
    if (typeof buildQualifiedTableRef === 'function') {
      return buildQualifiedTableRef(schema, table);
    }
    if (!schema) return quoteName(table);
    return `${quoteName(schema)}.${quoteName(table)}`;
  };

  const readScalar = (rows, aliases) => {
    const row = ensureArray(rows)[0] || {};
    const keys = Array.isArray(aliases) ? aliases : [aliases];
    for (const key of keys) {
      if (key && row[key] !== undefined) return asNumber(row[key]);
      const alt = String(key || '').toUpperCase();
      if (alt && row[alt] !== undefined) return asNumber(row[alt]);
      const lower = String(key || '').toLowerCase();
      if (lower && row[lower] !== undefined) return asNumber(row[lower]);
    }
    const firstKey = Object.keys(row)[0];
    return firstKey ? asNumber(row[firstKey]) : 0;
  };

  const runQualityQuery = async (sql) => {
    if (typeof runQuery !== 'function') {
      throw new Error('Quality checks are unavailable for this connection.');
    }
    const res = await runQuery({ sql });
    if (!res || !res.ok) {
      const message = res && res.error ? res.error : 'Failed to run quality checks.';
      throw new Error(message);
    }
    return ensureArray(res.rows);
  };

  const loadQuality = async (schema, table, { force = false } = {}) => {
    const key = scopedTableKey(schema, table);
    if (!force && qualityCache.has(key)) return qualityCache.get(key);

    const columns = await loadColumns(schema, table, { silent: true });
    const info = await loadTableInfo(schema, table, { silent: true });
    const constraints = ensureArray(info.constraints);
    const primaryIndex = ensureArray(info.indexes).find((index) => index && index.primary);
    const primaryColumns = primaryIndex ? ensureArray(primaryIndex.columns).filter(Boolean) : [];
    const foreignKeys = constraints.filter((constraint) => isForeignKey(constraint));
    const tableRef = buildTableRef(schema, table);

    const nullability = [];
    let totalRows = 0;

    if (columns.length > 0) {
      const nullSelect = columns
        .map((col, idx) => `SUM(CASE WHEN ${quoteName(col.name)} IS NULL THEN 1 ELSE 0 END) AS ${quoteName(`null_${idx}`)}`)
        .join(', ');
      const nullSql = `SELECT COUNT(*) AS ${quoteName('total_rows')}${nullSelect ? `, ${nullSelect}` : ''} FROM ${tableRef}`;
      const nullRows = await runQualityQuery(nullSql);
      totalRows = readScalar(nullRows, ['total_rows']);
      const row = nullRows[0] || {};
      columns.forEach((col, idx) => {
        const nullCount = asNumber(row[`null_${idx}`]);
        nullability.push({
          column: col.name,
          type: col.type || '-',
          nullRows: nullCount,
          nullPct: toPercent(nullCount, totalRows)
        });
      });
    }

    let pkDuplicateGroups = 0;
    let pkNullRows = 0;
    if (primaryColumns.length > 0) {
      const groupCols = primaryColumns.map((name) => quoteName(name)).join(', ');
      const pkDupSql = [
        `SELECT COUNT(*) AS ${quoteName('duplicate_groups')} FROM (`,
        `SELECT ${groupCols} FROM ${tableRef}`,
        `GROUP BY ${groupCols}`,
        'HAVING COUNT(*) > 1',
        `) AS ${quoteName('__q_pk_dup')}`
      ].join(' ');
      pkDuplicateGroups = readScalar(await runQualityQuery(pkDupSql), ['duplicate_groups']);

      const pkNullWhere = primaryColumns.map((name) => `${quoteName(name)} IS NULL`).join(' OR ');
      const pkNullSql = `SELECT COUNT(*) AS ${quoteName('null_rows')} FROM ${tableRef} WHERE ${pkNullWhere}`;
      pkNullRows = readScalar(await runQualityQuery(pkNullSql), ['null_rows']);
    }

    const fkChecks = [];
    for (let i = 0; i < foreignKeys.length; i += 1) {
      const constraint = foreignKeys[i];
      const fromColumns = ensureArray(constraint.columns).filter(Boolean);
      if (fromColumns.length === 0) continue;
      const ref = constraint.ref || constraint.reference || {};
      const refTable = String(ref.table || '').trim();
      if (!refTable) continue;
      const refSchema = String(ref.schema || schema || '').trim();
      const toColumnsRaw = ensureArray(ref.columns).filter(Boolean);
      const toColumns = toColumnsRaw.length === fromColumns.length ? toColumnsRaw : fromColumns;

      const fromGroupCols = fromColumns.map((name) => quoteName(name)).join(', ');
      const notNullFilters = fromColumns.map((name) => `${quoteName(name)} IS NOT NULL`).join(' AND ');
      const fkDupSql = [
        `SELECT COUNT(*) AS ${quoteName('duplicate_groups')} FROM (`,
        `SELECT ${fromGroupCols} FROM ${tableRef}`,
        `WHERE ${notNullFilters}`,
        `GROUP BY ${fromGroupCols}`,
        'HAVING COUNT(*) > 1',
        `) AS ${quoteName(`__q_fk_dup_${i}`)}`
      ].join(' ');
      const duplicateGroups = readScalar(await runQualityQuery(fkDupSql), ['duplicate_groups']);

      const childAlias = quoteName('c');
      const parentAlias = quoteName('p');
      const refTableRef = buildTableRef(refSchema, refTable);
      const joinExpr = fromColumns
        .map((fromCol, idx) => `${quoteName(`c.${fromCol}`)} = ${quoteName(`p.${toColumns[idx] || fromCol}`)}`)
        .join(' AND ');
      const orphanFilter = fromColumns.map((fromCol) => `${quoteName(`c.${fromCol}`)} IS NOT NULL`).join(' AND ');
      const probeCol = toColumns[0] || fromColumns[0];
      const orphanSql = [
        `SELECT COUNT(*) AS ${quoteName('orphan_rows')} FROM ${tableRef} AS ${childAlias}`,
        `LEFT JOIN ${refTableRef} AS ${parentAlias} ON ${joinExpr}`,
        `WHERE ${orphanFilter} AND ${quoteName(`p.${probeCol}`)} IS NULL`
      ].join(' ');
      const orphanRows = readScalar(await runQualityQuery(orphanSql), ['orphan_rows']);

      fkChecks.push({
        name: constraint.name || `FK_${i + 1}`,
        fromColumns,
        toColumns,
        refSchema,
        refTable,
        duplicateGroups,
        orphanRows
      });
    }

    const summary = { errors: 0, warnings: 0, info: 0 };
    nullability.forEach((item) => {
      if (item.nullRows > 0) summary.warnings += 1;
    });
    if (pkDuplicateGroups > 0) summary.errors += 1;
    if (pkNullRows > 0) summary.errors += 1;
    fkChecks.forEach((item) => {
      if (item.orphanRows > 0) summary.errors += 1;
      if (item.duplicateGroups > 0) summary.warnings += 1;
    });
    if (summary.errors === 0 && summary.warnings === 0) summary.info = 1;

    const report = {
      table: { schema, table, totalRows },
      summary: normalizeStatusCounts(summary),
      nullability,
      primary: {
        columns: primaryColumns,
        duplicateGroups: pkDuplicateGroups,
        nullRows: pkNullRows
      },
      foreignKeys: fkChecks
    };

    qualityCache.set(key, report);
    return report;
  };

  const renderQuality = async (schema, table) => {
    if (!detailsContainer) return;
    if (typeof runQuery !== 'function') {
      renderMessage('Quality', 'Quality checks are not available for this connection.');
      return;
    }

    const report = await loadQuality(schema, table);
    const summary = normalizeStatusCounts(report.summary);
    const nullRows = report.nullability.map((item) => {
      const level = item.nullRows > 0 ? 'warning' : 'info';
      return [
        item.column || '-',
        item.type || '-',
        String(item.nullRows),
        `${item.nullPct}%`,
        qualityStatusText(level)
      ];
    });

    const pk = report.primary || { columns: [], duplicateGroups: 0, nullRows: 0 };
    const pkRows = pk.columns.length
      ? [[
        pk.columns.join(', '),
        String(pk.duplicateGroups || 0),
        String(pk.nullRows || 0),
        qualityStatusText((pk.duplicateGroups || 0) > 0 || (pk.nullRows || 0) > 0 ? 'error' : 'info')
      ]]
      : [['-', '0', '0', 'Info']];

    const fkRows = ensureArray(report.foreignKeys).map((item) => {
      const level = item.orphanRows > 0 ? 'error' : (item.duplicateGroups > 0 ? 'warning' : 'info');
      const reference = `${item.refSchema ? `${item.refSchema}.` : ''}${item.refTable || '-'}`;
      return [
        item.name || '-',
        item.fromColumns.join(', ') || '-',
        reference,
        item.toColumns.join(', ') || '-',
        String(item.orphanRows || 0),
        String(item.duplicateGroups || 0),
        qualityStatusText(level)
      ];
    });

    const summaryHelp = 'Errors = integrity breaks (duplicate/NULL primary keys, orphan foreign keys). Warnings = potential issues (NULLs in columns, repeated foreign key values). Info = check passed. Counts are per check, not rows.';
    const pkHelp = 'Error when a primary key has duplicate values or NULLs.';
    const fkHelp = 'Error when child rows point to missing parents. Warning when the same foreign key values repeat (may be expected).';
    const nullHelp = 'Warning when a column has NULL rows; info when none.';

    detailsContainer.innerHTML = `
      <div class="object-section-head">
        <div class="object-section-title">Quality</div>
        <button type="button" class="icon-btn mini" title="Re-run checks" aria-label="Re-run checks" data-refresh-quality>
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>
      <div class="object-quality-summary">
        <span class="object-quality-chip ${qualityStatusClass('error')}">${summary.errors} errors</span>
        <span class="object-quality-chip ${qualityStatusClass('warning')}">${summary.warnings} warnings</span>
        <span class="object-quality-chip ${qualityStatusClass('info')}">${summary.info} info</span>
        <span class="object-quality-meta">Rows scanned: ${escapeHtml(report.table.totalRows)}</span>
      </div>
      <div class="object-quality-help">${summaryHelp}</div>
      <section class="object-quality-section">
        <h4>Primary Key</h4>
        <div class="object-quality-help">${pkHelp}</div>
        ${renderRowsTable(['Columns', 'Duplicate Groups', 'Rows With NULL', 'Status'], pkRows)}
      </section>
      <section class="object-quality-section">
        <h4>Foreign Keys</h4>
        <div class="object-quality-help">${fkHelp}</div>
        ${fkRows.length
          ? renderRowsTable(['Constraint', 'Columns', 'References', 'Ref Columns', 'Orphan Rows', 'Duplicate Groups', 'Status'], fkRows)
          : '<div class="object-muted">No foreign keys found.</div>'}
      </section>
      <section class="object-quality-section">
        <h4>Nullability</h4>
        <div class="object-quality-help">${nullHelp}</div>
        ${nullRows.length
          ? renderRowsTable(['Column', 'Type', 'NULL Rows', 'NULL %', 'Status'], nullRows)
          : '<div class="object-muted">No columns found.</div>'}
      </section>
    `;

    const refreshBtn = detailsContainer.querySelector('[data-refresh-quality]');
    if (!refreshBtn) return;
    refreshBtn.addEventListener('click', async () => {
      try {
        await loadQuality(schema, table, { force: true });
        await renderQuality(schema, table);
      } catch (err) {
        if (onShowError) {
          const message = err && err.message ? err.message : 'Failed to run quality checks.';
          await onShowError(message);
        }
      }
    });
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
    } else if (activeTab === 'quality') {
      try {
        await renderQuality(schema, table);
      } catch (err) {
        const message = err && err.message ? err.message : 'Failed to run quality checks.';
        if (onShowError) await onShowError(message);
        renderMessage('Quality', message);
      }
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
    for (const key of Array.from(qualityCache.keys())) {
      if (key.startsWith(prefix)) qualityCache.delete(key);
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
