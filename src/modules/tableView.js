import { createResultsRenderer } from './resultsRenderer.js';

export function createTableView({
  resultsTable,
  resultsEmptyState,
  tableActionsBar,
  copyCellBtn,
  copyRowBtn,
  exportCsvBtn,
  exportJsonBtn,
  onShowError,
  onToast,
  onSort,
  onOpenForeignKey
}) {
  let activeResults = {
    rows: [],
    baseSql: '',
    sourceSql: '',
    totalRows: 0,
    truncated: false,
    columnKeyMeta: null
  };

  const setEmptyStateVisible = (visible) => {
    if (resultsEmptyState) resultsEmptyState.classList.toggle('hidden', !visible);
    if (resultsTable) resultsTable.classList.toggle('hidden', !!visible);
  };

  const resultsRenderer = createResultsRenderer({
    resultsTable,
    copyCellBtn,
    copyRowBtn,
    exportCsvBtn,
    exportJsonBtn,
    getActiveTab: () => ({ rows: activeResults.rows }),
    onOpenForeignKey,
    onSort: (column) => {
      if (onSort) onSort(column, activeResults);
    },
    showError: onShowError,
    onToast,
    maxRows: 2000
  });

  const setResults = ({
    rows = [],
    totalRows = 0,
    truncated = false,
    baseSql = '',
    sourceSql = '',
    columnKeyMeta = null
  } = {}) => {
    activeResults = {
      rows: Array.isArray(rows) ? rows : [],
      totalRows: Number.isFinite(totalRows) ? totalRows : (rows ? rows.length : 0),
      truncated: !!truncated,
      baseSql: baseSql || '',
      sourceSql: sourceSql || '',
      columnKeyMeta: columnKeyMeta && typeof columnKeyMeta === 'object' ? columnKeyMeta : null
    };
    if (resultsRenderer) {
      resultsRenderer.buildTable(activeResults.rows, activeResults.totalRows, activeResults.columnKeyMeta);
      resultsRenderer.updateSelectionActions();
    }
    setEmptyStateVisible(false);
    if (tableActionsBar) tableActionsBar.classList.remove('hidden');
  };

  const clear = () => {
    activeResults = {
      rows: [],
      baseSql: '',
      sourceSql: '',
      totalRows: 0,
      truncated: false,
      columnKeyMeta: null
    };
    if (resultsRenderer) {
      resultsRenderer.clearSelection();
      resultsRenderer.updateSelectionActions();
    }
    if (resultsTable) {
      resultsTable.innerHTML = '';
      resultsTable.className = '';
    }
    setEmptyStateVisible(true);
  };

  const clearUi = () => {
    if (tableActionsBar) tableActionsBar.classList.add('hidden');
    if (resultsTable) {
      resultsTable.innerHTML = '';
      resultsTable.className = '';
    }
    setEmptyStateVisible(true);
  };

  const getActive = () => activeResults;

  return {
    setResults,
    clear,
    getActive,
    clearUi
  };
}
