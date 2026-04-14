export function createResultsRenderer({
  resultsTable,
  copyCellBtn,
  copyRowBtn,
  exportToggle,
  exportMenu,
  exportCsvBtn,
  exportJsonBtn,
  getActiveTab,
  onOpenForeignKey,
  onSort,
  showError,
  onToast,
  onExportAvailabilityChange,
  maxRows = 2000,
  canEditCell,
  onCellEdit,
  getCellEditState,
  onSelectionChange
}) {
  let selectedCell = null;
  let selectedRow = null;
  let selectedCellEl = null;
  let selectedRowEl = null;
  let activeEditor = null;
  let resizeState = null;
  let lastColumns = [];
  const columnWidths = new Map();
  const MIN_COL_WIDTH = 150;
  const DEFAULT_COL_WIDTH = 200;
  let suppressNextSortClick = false;

  const getColWidth = (colEl) => {
    if (!colEl) return DEFAULT_COL_WIDTH;
    const explicit = Number.parseFloat(colEl.style.width);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const rect = colEl.getBoundingClientRect();
    return rect && rect.width ? rect.width : DEFAULT_COL_WIDTH;
  };

  const syncTableWidth = (colgroupEl) => {
    if (!resultsTable || !colgroupEl) return;
    let total = 0;
    Array.from(colgroupEl.children).forEach((colEl) => {
      total += getColWidth(colEl);
    });
    if (Number.isFinite(total) && total > 0) {
      resultsTable.style.width = `${total}px`;
    }
  };

  const cleanupResize = () => {
    if (resizeState && resizeState.th) resizeState.th.classList.remove('resizing');
    if (resultsTable) resultsTable.classList.remove('resizing');
    resizeState = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (event) => {
    if (!resizeState) return;
    const delta = event.clientX - resizeState.startX;
    if (!resizeState.moved && Math.abs(delta) > 2) resizeState.moved = true;
    const nextWidth = Math.max(MIN_COL_WIDTH, resizeState.startWidth + delta);
    if (resizeState.col) resizeState.col.style.width = `${nextWidth}px`;
    if (resizeState.colgroup) syncTableWidth(resizeState.colgroup);
  };

  const handleResizeEnd = () => {
    if (resizeState && resizeState.col) {
      const width = Number.parseFloat(resizeState.col.style.width);
      if (Number.isFinite(width) && resizeState.colName) {
        columnWidths.set(resizeState.colName, width);
      }
      if (resizeState.moved) suppressNextSortClick = true;
    }
    cleanupResize();
  };

  const startResize = (event, th, col, colName) => {
    if (!th || !col) return;
    event.preventDefault();
    event.stopPropagation();
    const startWidth = getColWidth(col);
    resizeState = {
      th,
      col,
      colgroup: col.parentNode,
      colName,
      startX: event.clientX,
      startWidth,
      moved: false
    };
    th.classList.add('resizing');
    if (resultsTable) resultsTable.classList.add('resizing');
    if (resultsTable) resultsTable.style.tableLayout = 'fixed';
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  function updateSelectionActions() {
    const tab = getActiveTab();
    const hasRows = !!(tab && Array.isArray(tab.rows) && tab.rows.length > 0);
    if (copyCellBtn) copyCellBtn.disabled = !selectedCell;
    if (copyRowBtn) copyRowBtn.disabled = !selectedRow;
    if (exportCsvBtn) exportCsvBtn.disabled = !hasRows;
    if (exportJsonBtn) exportJsonBtn.disabled = !hasRows;
    if (exportToggle) exportToggle.disabled = !hasRows;
    if (!hasRows && exportMenu) {
      exportMenu.classList.add('hidden');
      if (exportToggle) exportToggle.setAttribute('aria-expanded', 'false');
    }
    if (onExportAvailabilityChange) onExportAvailabilityChange(hasRows);
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
    if (typeof onSelectionChange === 'function') {
      onSelectionChange({
        rowIndex,
        colIndex,
        row: rowData || null,
        column: colName
      });
    }
  }

  function clearSelection() {
    if (selectedCellEl) selectedCellEl.classList.remove('selected');
    if (selectedRowEl) selectedRowEl.classList.remove('selected');
    selectedCellEl = null;
    selectedRowEl = null;
    selectedCell = null;
    selectedRow = null;
    if (typeof onSelectionChange === 'function') {
      onSelectionChange(null);
    }
  }

  const getColumnMeta = (columnKeyMeta, columnName) => {
    if (!columnKeyMeta || typeof columnKeyMeta !== 'object') return null;
    return columnKeyMeta[String(columnName || '').toLowerCase()] || null;
  };

  const resolveEditable = (row, column, rowIndex, colIndex) => {
    if (typeof canEditCell !== 'function') return { ok: false };
    const result = canEditCell({ row, column, rowIndex, colIndex });
    if (result && typeof result === 'object') {
      return { ok: !!result.ok, reason: result.reason || '' };
    }
    return { ok: !!result };
  };

  const toDisplayValue = (value) => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_) {
        return String(value);
      }
    }
    return String(value);
  };

  const finishEdit = ({ cancel = false } = {}) => {
    if (!activeEditor) return;
    const {
      td,
      input,
      valueEl,
      rowIndex,
      colIndex,
      row,
      column,
      previousValue
    } = activeEditor;
    activeEditor = null;
    const rawValue = input ? input.value : '';
    if (td) td.classList.remove('editing');
    if (valueEl) valueEl.classList.remove('hidden');
    if (input && input.parentNode) input.parentNode.removeChild(input);
    let result = null;
    if (!cancel && typeof onCellEdit === 'function') {
      result = onCellEdit({
        rowIndex,
        colIndex,
        column,
        rawValue,
        row,
        previousValue
      });
      if (result && result.ok === false) {
        if (result.message && typeof showError === 'function') {
          void showError(result.message);
        } else if (result.message && typeof onToast === 'function') {
          onToast(result.message);
        }
        if (row && column) row[column] = previousValue;
      }
    }
    if (cancel && row && column) row[column] = previousValue;
    const nextValue = row && column ? row[column] : previousValue;
    const displayValue =
      result && result.displayValue !== undefined
        ? result.displayValue
        : toDisplayValue(nextValue);
    if (valueEl) valueEl.textContent = displayValue;
    if (td) td.title = displayValue;
    if (
      selectedCell &&
      selectedCell.rowIndex === rowIndex &&
      selectedCell.colIndex === colIndex
    ) {
      selectedCell.value = nextValue;
    }
    if (td && typeof getCellEditState === 'function') {
      const pending = getCellEditState(rowIndex, column, row);
      td.classList.toggle('pending-edit', !!pending);
    }
  };

  const startEdit = ({ td, rowIndex, colIndex, row, column }) => {
    if (!td || !row || !column) return;
    if (activeEditor && activeEditor.td === td) return;
    if (activeEditor) finishEdit();
    const editable = resolveEditable(row, column, rowIndex, colIndex);
    if (!editable.ok) {
      if (editable.reason && typeof onToast === 'function') {
        onToast(editable.reason);
      }
      return;
    }
    const valueEl = td.querySelector('.results-cell-value');
    if (!valueEl) return;
    const previousValue = row[column];
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'results-cell-input';
    input.value = toDisplayValue(previousValue);
    td.classList.add('editing');
    valueEl.classList.add('hidden');
    td.appendChild(input);
    input.focus();
    input.select();
    activeEditor = {
      td,
      input,
      valueEl,
      rowIndex,
      colIndex,
      row,
      column,
      previousValue
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishEdit({ cancel: true });
      }
    });
    input.addEventListener('blur', () => {
      finishEdit();
    });
  };

  function buildTable(rows, totalRows, columnKeyMeta = null) {
    clearSelection();
    if (activeEditor) finishEdit({ cancel: true });
    const columnsChanged = lastColumns.length > 0;
    resultsTable.innerHTML = '';
    resultsTable.className = '';
    resultsTable.style.tableLayout = 'fixed';
    resultsTable.style.width = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      resultsTable.innerHTML = '<tr><td>No results.</td></tr>';
      updateSelectionActions();
      return;
    }

    const limitedRows = rows.slice(0, maxRows);
    const firstVisible = limitedRows.find((row) => row && !row.__deleted);
    if (!firstVisible || typeof firstVisible !== 'object') {
      resultsTable.innerHTML = '<tr><td>No results.</td></tr>';
      updateSelectionActions();
      return;
    }
    const columns = Object.keys(firstVisible);
    if (
      columnsChanged
      && (columns.length !== lastColumns.length
        || columns.some((col, idx) => col !== lastColumns[idx]))
    ) {
      columnWidths.clear();
    }
    const colgroup = document.createElement('colgroup');
    columns.forEach((colName) => {
      const col = document.createElement('col');
      const width = columnWidths.has(colName)
        ? columnWidths.get(colName)
        : DEFAULT_COL_WIDTH;
      const safeWidth = Math.max(MIN_COL_WIDTH, Number(width) || DEFAULT_COL_WIDTH);
      col.style.width = `${safeWidth}px`;
      colgroup.appendChild(col);
    });
    resultsTable.appendChild(colgroup);
    syncTableWidth(colgroup);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const normalizedKeyMeta = columnKeyMeta && typeof columnKeyMeta === 'object' ? columnKeyMeta : null;
    columns.forEach((col, colIndex) => {
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
      const resizer = document.createElement('span');
      resizer.className = 'results-col-resizer';
      resizer.addEventListener('mousedown', (event) => {
        const colEl = colgroup.children[colIndex];
        startResize(event, th, colEl, col);
      });
      resizer.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      th.appendChild(resizer);
      th.addEventListener('click', (event) => {
        if (suppressNextSortClick) {
          suppressNextSortClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (onSort) onSort(col);
      });
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    resultsTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    limitedRows.forEach((row, rowIndex) => {
      if (!row || row.__deleted) return;
      const tr = document.createElement('tr');
      columns.forEach((col, colIndex) => {
        const td = document.createElement('td');
        const value = row[col];
        const text = toDisplayValue(value);
        const content = document.createElement('span');
        content.className = 'results-cell-value';
        content.textContent = text;
        td.appendChild(content);
        td.title = text;
        td.dataset.col = col;
        td.dataset.colIndex = String(colIndex);
        td.dataset.rowIndex = String(rowIndex);

        const editable = resolveEditable(row, col, rowIndex, colIndex);
        if (editable.ok) td.classList.add('editable');
        const isPending =
          typeof getCellEditState === 'function'
            ? getCellEditState(rowIndex, col, row)
            : false;
        if (isPending) td.classList.add('pending-edit');

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

        td.addEventListener('dblclick', (event) => {
          if (event.target && event.target.closest('.results-fk-open-btn')) return;
          startEdit({ td, rowIndex, colIndex, row, column: col });
        });

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
    lastColumns = columns.slice();

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
      const str = toDisplayValue(val);
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
      await navigator.clipboard.writeText(toDisplayValue(selectedCell.value));
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
