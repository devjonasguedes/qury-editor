import { renderTableTree, resetTreeCache } from '../tree.js';

export function createTreeView({ api, tableList, tableSearch, tableSearchClear }) {
  let tableCache = [];
  let treeExpanded = {};
  let activeSchema = '';

  const render = (filterText = '') => {
    renderTableTree({
      tableList,
      tableCache,
      filterText,
      activeSchema,
      listColumns: api.listColumns,
      onShowError: api.showError,
      expandedState: treeExpanded,
      onToggleExpand: (key, expanded) => {
        treeExpanded[key] = expanded;
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
