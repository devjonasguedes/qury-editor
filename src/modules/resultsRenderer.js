export function createResultsRenderer({
  resultsTable,
  copyCellBtn,
  copyRowBtn,
  exportCsvBtn,
  exportJsonBtn,
  getActiveTab,
  onOpenForeignKey,
  onSort,
  showError,
  onToast,
  maxRows = 2000
}) {
  let selectedCell = null;
  let selectedRow = null;
  let selectedCellEl = null;
  let selectedRowEl = null;

  function updateSelectionActions() {
    const tab = getActiveTab();
    const hasRows = !!(tab && Array.isArray(tab.rows) && tab.rows.length > 0);
    if (copyCellBtn) copyCellBtn.disabled = !selectedCell;
    if (copyRowBtn) copyRowBtn.disabled = !selectedRow;
    if (exportCsvBtn) exportCsvBtn.disabled = !hasRows;
    if (exportJsonBtn) exportJsonBtn.disabled = !hasRows;
  }

  function setSelection(rowIndex, colIndex, cellEl, rowEl, rowData, columns) {
    if (selectedCellEl) selectedCellEl.classList.remove('selected');
    if (selectedRowEl) selectedRowEl.classList.remove('selected');
    selectedCellEl = cellEl;
    selectedRowEl = rowEl;
    if (selectedCellEl) selectedCellEl.classList.add('selected');
    if (selectedRowEl) selectedRowEl.classList.add('selected');
    selectedRow = rowData || null;
    const colName = columns && columns[colIndex] ? columns[colIndex] : null;
    selectedCell = colName ? { rowIndex, colIndex, value: rowData ? rowData[colName] : '' } : null;
    updateSelectionActions();
  }

  function clearSelection() {
    if (selectedCellEl) selectedCellEl.classList.remove('selected');
    if (selectedRowEl) selectedRowEl.classList.remove('selected');
    selectedCellEl = null;
    selectedRowEl = null;
    selectedCell = null;
    selectedRow = null;
  }

  const getColumnMeta = (columnKeyMeta, columnName) => {
    if (!columnKeyMeta || typeof columnKeyMeta !== 'object') return null;
    return columnKeyMeta[String(columnName || '').toLowerCase()] || null;
  };

  function buildTable(rows, totalRows, columnKeyMeta = null) {
    clearSelection();
    resultsTable.innerHTML = '';
    resultsTable.className = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      resultsTable.innerHTML = '<tr><td>No results.</td></tr>';
      updateSelectionActions();
      return;
    }

    const limitedRows = rows.slice(0, maxRows);
    if (!limitedRows[0] || typeof limitedRows[0] !== 'object') {
      resultsTable.innerHTML = '<tr><td>No results.</td></tr>';
      updateSelectionActions();
      return;
    }
    const columns = Object.keys(limitedRows[0]);
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const normalizedKeyMeta = columnKeyMeta && typeof columnKeyMeta === 'object' ? columnKeyMeta : null;
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.title = `Order by ${col}`;
      const content = document.createElement('span');
      content.className = 'results-header-content';

      const labelWrap = document.createElement('span');
      labelWrap.className = 'results-header-label-wrap';

      const meta = normalizedKeyMeta ? normalizedKeyMeta[String(col).toLowerCase()] : null;
      if (meta && (meta.pk || meta.fk)) {
        const keyIcons = document.createElement('span');
        keyIcons.className = 'results-header-key-icons';

        if (meta.pk) {
          const pkIcon = document.createElement('i');
          pkIcon.className = 'bi bi-key-fill results-header-key-icon is-pk';
          pkIcon.setAttribute('aria-hidden', 'true');
          pkIcon.title = 'Primary key';
          keyIcons.appendChild(pkIcon);
        }

        if (meta.fk) {
          const fkIcon = document.createElement('i');
          fkIcon.className = 'bi bi-key-fill results-header-key-icon is-fk';
          fkIcon.setAttribute('aria-hidden', 'true');
          fkIcon.title = 'Foreign key';
          keyIcons.appendChild(fkIcon);
        }

        labelWrap.appendChild(keyIcons);
      }

      const label = document.createElement('span');
      label.className = 'results-header-label';
      label.textContent = col;
      labelWrap.appendChild(label);

      const icon = document.createElement('i');
      icon.className = 'bi bi-arrow-down-up results-header-sort-icon';
      icon.setAttribute('aria-hidden', 'true');

      content.appendChild(labelWrap);
      content.appendChild(icon);
      th.appendChild(content);
      th.addEventListener('click', () => {
        if (onSort) onSort(col);
      });
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    resultsTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    limitedRows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      columns.forEach((col, colIndex) => {
        const td = document.createElement('td');
        const value = row[col];
        const text = value === null || value === undefined ? '' : String(value);
        const content = document.createElement('span');
        content.className = 'results-cell-value';
        content.textContent = text;
        td.appendChild(content);
        td.title = text;
        td.dataset.col = col;
        td.dataset.colIndex = String(colIndex);

        const colMeta = getColumnMeta(normalizedKeyMeta, col);
        const fkRefs = colMeta && Array.isArray(colMeta.fkRefs) ? colMeta.fkRefs : [];
        if (fkRefs.length > 0 && typeof onOpenForeignKey === 'function') {
          td.classList.add('has-fk-action');
          const openFkBtn = document.createElement('button');
          openFkBtn.type = 'button';
          openFkBtn.className = 'results-fk-open-btn';
          openFkBtn.title = 'Open foreign key row';
          openFkBtn.setAttribute('aria-label', `Open foreign key row for ${col}`);
          openFkBtn.innerHTML = '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>';
          openFkBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await onOpenForeignKey({
              column: col,
              value,
              row,
              fkRefs
            });
          });
          td.appendChild(openFkBtn);
        }

        tr.appendChild(td);
      });
      tr.dataset.rowIndex = String(rowIndex);
      tr.addEventListener('click', (event) => {
        const cell = event.target.closest('td');
        if (!cell) return;
        const colIndex = Number(cell.dataset.colIndex || 0);
        setSelection(rowIndex, colIndex, cell, tr, row, columns);
      });
      tbody.appendChild(tr);
    });
    resultsTable.appendChild(tbody);

    const total = totalRows || rows.length;
    if (total > maxRows) {
      const note = document.createElement('caption');
      note.textContent = `Mostrando ${maxRows} de ${total} linhas. Use LIMIT para reduzir.`;
      note.style.captionSide = 'bottom';
      note.style.padding = '6px 8px';
      note.style.color = '#666';
      resultsTable.appendChild(note);
    }
    updateSelectionActions();
  }

  function getExportRows() {
    const tab = getActiveTab();
    if (!tab || !Array.isArray(tab.rows)) return [];
    return tab.rows;
  }

  function rowsToCsv(rows) {
    if (!rows || rows.length === 0) return '';
    let normalized = rows;
    if (typeof rows[0] !== 'object' || rows[0] === null || Array.isArray(rows[0])) {
      normalized = rows.map((value) => ({ value }));
    }
    const columns = Array.from(
      new Set(normalized.flatMap((row) => Object.keys(row || {})))
    );
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const lines = [columns.join(',')];
    normalized.forEach((row) => {
      lines.push(columns.map((col) => escape(row[col])).join(','));
    });
    return lines.join('\n');
  }

  function formatTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function downloadText(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copyCell() {
    if (!selectedCell) return;
    try {
      await navigator.clipboard.writeText(
        selectedCell.value === null || selectedCell.value === undefined
          ? ''
          : String(selectedCell.value)
      );
      if (onToast) onToast('Cell copied');
    } catch (_) {
      if (showError) await showError('Unable to copy cell.');
    }
  }

  async function copyRow() {
    if (!selectedRow) return;
    try {
      const text = typeof selectedRow === 'object'
        ? JSON.stringify(selectedRow)
        : String(selectedRow);
      await navigator.clipboard.writeText(text);
      if (onToast) onToast('Row copied');
    } catch (_) {
      if (showError) await showError('Unable to copy row.');
    }
  }

  function exportCsv() {
    const rows = getExportRows();
    if (!rows || rows.length === 0) return;
    const csv = rowsToCsv(rows);
    downloadText(`results-${formatTimestamp()}.csv`, csv, 'text/csv');
  }

  function exportJson() {
    const rows = getExportRows();
    if (!rows || rows.length === 0) return;
    const json = JSON.stringify(rows, null, 2);
    downloadText(`results-${formatTimestamp()}.json`, json, 'application/json');
  }

  if (copyCellBtn) {
    copyCellBtn.addEventListener('click', async () => {
      await copyCell();
    });
  }

  if (copyRowBtn) {
    copyRowBtn.addEventListener('click', async () => {
      await copyRow();
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      exportCsv();
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      exportJson();
    });
  }

  return {
    buildTable,
    clearSelection,
    updateSelectionActions
  };
}
