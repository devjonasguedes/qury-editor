import { renderTableTree, resetTreeCache } from '../tree.js';

export function createTreeView({
  api,
  tableList,
  tableSearch,
  tableSearchClear,
  resultsTable,
  queryStatus,
  getActiveConnection
}) {
  let tableCache = [];
  let treeExpanded = {};
  let activeSchema = '';

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

  const quoteIdentifier = (name, type) => {
    if (!name) return name;
    const parts = String(name).split('.');
    if (type === 'postgres' || type === 'postgresql') {
      return parts.map((p) => (p.startsWith('"') ? p : `"${p.replace(/"/g, '""')}"`)).join('.');
    }
    return parts.map((p) => (p.startsWith('`') ? p : `\`${p.replace(/`/g, '``')}\``)).join('.');
  };

  const buildQualified = (schema, name, type) => {
    if (!schema) return quoteIdentifier(name, type);
    return `${quoteIdentifier(schema, type)}.${quoteIdentifier(name, type)}`;
  };

  const renderResults = (rows, totalRows, truncated) => {
    if (!resultsTable) return;
    resultsTable.innerHTML = '';
    resultsTable.className = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
      return;
    }
    const columns = Object.keys(rows[0] || {});
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
    rows.forEach((row) => {
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

    const total = Number.isFinite(totalRows) ? totalRows : rows.length;
    if (truncated || total > rows.length) {
      const note = document.createElement('caption');
      note.textContent = `Mostrando ${rows.length} de ${total} linhas.`;
      note.style.captionSide = 'bottom';
      note.style.padding = '6px 8px';
      note.style.color = '#666';
      resultsTable.appendChild(note);
    }
  };

  const runOpenTable = async (schema, name) => {
    const conn = typeof getActiveConnection === 'function' ? getActiveConnection() : null;
    const type = conn && conn.type ? conn.type : 'mysql';
    const qualified = buildQualified(schema, name, type);
    const sql = `SELECT * FROM ${qualified} LIMIT 100`;
    const startedAt = Date.now();
    setQueryStatus({ state: 'running', message: 'Executando...' });
    const res = await api.runQuery({ sql });
    if (!res || !res.ok) {
      await api.showError((res && res.error) || 'Erro ao executar query.');
      setQueryStatus({ state: 'error', message: res && res.error ? res.error : 'Erro' });
      return;
    }
    renderResults(res.rows || [], res.totalRows, res.truncated);
    setQueryStatus({
      state: 'success',
      message: `Linhas: ${res.totalRows || 0}`,
      duration: Date.now() - startedAt
    });
  };

  const render = (filterText = '') => {
    renderTableTree({
      tableList,
      tableCache,
      filterText,
      activeSchema,
      onOpenTable: runOpenTable,
      listColumns: api.listColumns,
      onShowError: api.showError,
      expandedState: treeExpanded,
      onToggleExpand: (key, expanded) => {
        treeExpanded[key] = expanded;
      },
      onCopyName: async (name) => {
        if (!name) return;
        try {
          await navigator.clipboard.writeText(name);
        } catch (_) {
          if (api.showError) await api.showError('Nao foi possivel copiar.');
        }
      },
      onCopyQualified: async (schema, name) => {
        if (!name) return;
        const conn = typeof getActiveConnection === 'function' ? getActiveConnection() : null;
        const type = conn && conn.type ? conn.type : 'mysql';
        const qualified = buildQualified(schema, name, type);
        try {
          await navigator.clipboard.writeText(qualified);
        } catch (_) {
          if (api.showError) await api.showError('Nao foi possivel copiar.');
        }
      }
    });
  };

  const refresh = async () => {
    if (!tableList) return;
    const res = await api.listTables();
    if (!res || !res.ok) {
      tableCache = [];
      render(tableSearch ? tableSearch.value : '');
      if (api.showError) {
        await api.showError((res && res.error) || 'Erro ao listar tabelas.');
      }
      return;
    }
    tableCache = res.rows || [];
    resetTreeCache();
    treeExpanded = {};
    render(tableSearch ? tableSearch.value : '');
  };

  const setActiveSchema = (schema) => {
    activeSchema = schema || '';
    render(tableSearch ? tableSearch.value : '');
  };

  const bindSearch = () => {
    if (tableSearch) {
      tableSearch.addEventListener('input', () => {
        render(tableSearch.value);
      });
    }

    if (tableSearchClear) {
      tableSearchClear.addEventListener('click', () => {
        if (tableSearch) tableSearch.value = '';
        render('');
      });
    }
  };

  bindSearch();

  return {
    refresh,
    render,
    setActiveSchema
  };
}
