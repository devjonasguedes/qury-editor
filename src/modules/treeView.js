import { renderTableTree, resetTreeCache } from '../tree.js';

export function createTreeView({
  api,
  tableList,
  tableSearch,
  tableSearchClear,
  getActiveConnection,
  onOpenTable
}) {
  let tableCache = [];
  let routineCache = [];
  let treeExpanded = {};
  let activeSchema = '';

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

  const runOpenTable = async (schema, name) => {
    if (onOpenTable) {
      const conn = typeof getActiveConnection === 'function' ? getActiveConnection() : null;
      const type = conn && conn.type ? conn.type : 'mysql';
      const qualified = buildQualified(schema, name, type);
      const sql = `SELECT * FROM ${qualified};`;
      onOpenTable(schema, name, sql);
    }
  };

  const runOpenRoutine = async (schema, name, routineType) => {
    if (onOpenTable) {
      const conn = typeof getActiveConnection === 'function' ? getActiveConnection() : null;
      const type = conn && conn.type ? conn.type : 'mysql';
      const qualified = buildQualified(schema, name, type);
      const isProcedure = String(routineType || '').toUpperCase() === 'PROCEDURE';
      const sql = isProcedure ? `CALL ${qualified}();` : `SELECT ${qualified}();`;
      onOpenTable(schema, name, sql);
    }
  };

  const render = (filterText = '') => {
    renderTableTree({
      tableList,
      tableCache,
      routineCache,
      filterText,
      activeSchema,
      onOpenTable: runOpenTable,
      onOpenRoutine: runOpenRoutine,
      listColumns: api.listColumns,
      listTableInfo: api.listTableInfo,
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
    const resTables = await api.listTables();
    if (!resTables || !resTables.ok) {
      tableCache = [];
      if (api.showError) {
        await api.showError((resTables && resTables.error) || 'Erro ao listar tabelas.');
      }
    } else {
      tableCache = resTables.rows || [];
    }

    if (api.listRoutines) {
      const resRoutines = await api.listRoutines();
      if (!resRoutines || !resRoutines.ok) {
        routineCache = [];
        if (api.showError) {
          await api.showError((resRoutines && resRoutines.error) || 'Erro ao listar routines.');
        }
      } else {
        routineCache = resRoutines.rows || [];
      }
    } else {
      routineCache = [];
    }

    resetTreeCache();
    treeExpanded = {};
    render(tableSearch ? tableSearch.value : '');
    return tableCache;
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
