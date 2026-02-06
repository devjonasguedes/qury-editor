import { createResultsRenderer } from './resultsRenderer.js';

export function createTableView({
  resultsTable,
  tableActionsBar,
  copyCellBtn,
  copyRowBtn,
  exportCsvBtn,
  exportJsonBtn,
  onShowError,
  onSort
}) {
  let activeResults = { rows: [], baseSql: '', sourceSql: '', totalRows: 0, truncated: false };

  const resultsRenderer = createResultsRenderer({
    resultsTable,
    copyCellBtn,
    copyRowBtn,
    exportCsvBtn,
    exportJsonBtn,
    getActiveTab: () => ({ rows: activeResults.rows }),
    onSort: (column) => {
      if (onSort) onSort(column, activeResults);
    },
    showError: onShowError,
    maxRows: 2000
  });

  const setResults = ({ rows = [], totalRows = 0, truncated = false, baseSql = '', sourceSql = '' } = {}) => {
    activeResults = {
      rows: Array.isArray(rows) ? rows : [],
      totalRows: Number.isFinite(totalRows) ? totalRows : (rows ? rows.length : 0),
      truncated: !!truncated,
      baseSql: baseSql || '',
      sourceSql: sourceSql || ''
    };
    if (resultsRenderer) {
      resultsRenderer.buildTable(activeResults.rows, activeResults.totalRows);
      resultsRenderer.updateSelectionActions();
    }
    if (tableActionsBar) tableActionsBar.classList.remove('hidden');
  };

  const clear = () => {
    activeResults = { rows: [], baseSql: '', sourceSql: '', totalRows: 0, truncated: false };
    if (resultsRenderer) {
      resultsRenderer.clearSelection();
      resultsRenderer.updateSelectionActions();
    }
    if (resultsTable) {
      resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
      resultsTable.className = '';
    }
  };

  const clearUi = () => {
    if (tableActionsBar) tableActionsBar.classList.add('hidden');
    if (resultsTable) {
      resultsTable.innerHTML = '<tr><td>Sem resultados.</td></tr>';
      resultsTable.className = '';
    }
  };

  const getActive = () => activeResults;

  return {
    setResults,
    clear,
    getActive,
    clearUi
  };
}
