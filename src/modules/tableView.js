import { createResultsRenderer } from './resultsRenderer.js';

export function createTableView({
  resultsTable,
  resultsEmptyState,
  tableActionsBar,
  copyCellBtn,
  copyRowBtn,
  exportToggle,
  exportMenu,
  exportCsvBtn,
  exportJsonBtn,
  onShowError,
  onToast,
  onSort,
  onOpenForeignKey,
  canEditCell,
  onCellEdit,
  getCellEditState,
  onSelectionChange
}) {
  let activeResults = {
    rows: [],
    baseSql: '',
    sourceSql: '',
    totalRows: 0,
    truncated: false,
    columnKeyMeta: null,
    pagination: null
  };

  const setEmptyStateVisible = (visible) => {
    if (resultsEmptyState) resultsEmptyState.classList.toggle('hidden', !visible);
    if (resultsTable) resultsTable.classList.toggle('hidden', !!visible);
  };

  const setExportMenuOpen = (open) => {
    if (!exportMenu || !exportToggle) return;
    exportMenu.classList.toggle('hidden', !open);
    exportToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const resultsRenderer = createResultsRenderer({
    resultsTable,
    copyCellBtn,
    copyRowBtn,
    exportToggle,
    exportMenu,
    exportCsvBtn,
    exportJsonBtn,
    getActiveTab: () => ({ rows: activeResults.rows }),
    onOpenForeignKey,
    onSort: (column) => {
      if (onSort) onSort(column, activeResults);
    },
    showError: onShowError,
    onToast,
    maxRows: 2000,
    canEditCell,
    onCellEdit,
    getCellEditState,
    onSelectionChange,
    onExportAvailabilityChange: (hasRows) => {
      if (exportToggle) exportToggle.disabled = !hasRows;
      if (!hasRows) setExportMenuOpen(false);
    }
  });

  if (exportToggle) {
    exportToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (exportToggle.disabled) return;
      const isOpen = exportMenu && !exportMenu.classList.contains('hidden');
      setExportMenuOpen(!isOpen);
    });
  }

  if (exportMenu) {
    exportMenu.addEventListener('click', (event) => {
      const item = event.target.closest('button');
      if (!item) return;
      setExportMenuOpen(false);
    });
  }

  document.addEventListener('click', (event) => {
    if (!exportMenu || !exportToggle) return;
    if (exportMenu.classList.contains('hidden')) return;
    if (event.target === exportToggle || exportToggle.contains(event.target)) return;
    if (event.target === exportMenu || exportMenu.contains(event.target)) return;
    setExportMenuOpen(false);
  });

  const setResults = ({
    rows = [],
    totalRows = 0,
    truncated = false,
    baseSql = '',
    sourceSql = '',
    columnKeyMeta = null,
    pagination = null
  } = {}) => {
    activeResults = {
      rows: Array.isArray(rows) ? rows : [],
      totalRows: Number.isFinite(totalRows) ? totalRows : (rows ? rows.length : 0),
      truncated: !!truncated,
      baseSql: baseSql || '',
      sourceSql: sourceSql || '',
      columnKeyMeta: columnKeyMeta && typeof columnKeyMeta === 'object' ? columnKeyMeta : null,
      pagination: pagination && typeof pagination === 'object' ? pagination : null
    };
    if (resultsRenderer) {
      resultsRenderer.buildTable(activeResults.rows, activeResults.totalRows, activeResults.columnKeyMeta);
      resultsRenderer.updateSelectionActions();
    }
    setEmptyStateVisible(false);
    if (tableActionsBar) tableActionsBar.classList.remove('hidden');
    if (exportToggle && exportToggle.disabled) {
      exportToggle.disabled = false;
    }
  };

  const clear = () => {
    activeResults = {
      rows: [],
      baseSql: '',
      sourceSql: '',
      totalRows: 0,
      truncated: false,
      columnKeyMeta: null,
      pagination: null
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
    if (exportToggle) exportToggle.disabled = true;
    setExportMenuOpen(false);
  };

  const clearUi = () => {
    if (tableActionsBar) tableActionsBar.classList.add('hidden');
    if (resultsTable) {
      resultsTable.innerHTML = '';
      resultsTable.className = '';
    }
    setEmptyStateVisible(true);
    if (exportToggle) exportToggle.disabled = true;
    setExportMenuOpen(false);
  };

  const getActive = () => activeResults;

  return {
    setResults,
    clear,
    getActive,
    clearUi
  };
}
