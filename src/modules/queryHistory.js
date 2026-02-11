export function createQueryHistory({
  historyList,
  getCurrentHistoryKey,
  getActiveTab,
  isTableTab,
  isTableEditor,
  createNewQueryTab,
  setQueryValue,
  listHistory,
  recordHistory,
  showError
}) {
  const resolveScope = () => {
    if (typeof getCurrentHistoryKey !== 'function') return null;
    return getCurrentHistoryKey();
  };

  const fetchHistory = async () => {
    const scope = resolveScope();
    if (!scope || typeof listHistory !== 'function') return [];
    try {
      const entries = await listHistory({ connectionId: scope, limit: 50 });
      return Array.isArray(entries) ? entries : [];
    } catch (_) {
      if (showError) await showError('Failed to load history.');
      return [];
    }
  };

  const renderHistoryList = async () => {
    if (!historyList) return;
    if (!resolveScope()) {
      historyList.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Connect to view history.';
      historyList.appendChild(empty);
      return;
    }
    const list = await fetchHistory();
    historyList.innerHTML = '';
    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'No queries executed.';
      historyList.appendChild(empty);
      return;
    }
    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = String(entry.sql || '').split('\n')[0];

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const when = new Date(entry.ts || Date.now());
      meta.textContent = when.toLocaleString();

      item.appendChild(title);
      item.appendChild(meta);

      item.addEventListener('click', () => {
        const sql = entry.sql || '';
        if (!sql) return;
        if (createNewQueryTab) {
          createNewQueryTab(sql);
          return;
        }
        if (setQueryValue) setQueryValue(sql);
      });

      historyList.appendChild(item);
    });
  };

  const recordHistoryEntry = async (sqlText) => {
    const scope = resolveScope();
    if (!scope || typeof recordHistory !== 'function') return;
    const text = String(sqlText || '').trim();
    if (!text) return;
    const normalized = text.replace(/\s+/g, ' ');
    try {
      await recordHistory({ connectionId: scope, sql: normalized, ts: Date.now() });
      await renderHistoryList();
    } catch (_) {
      if (showError) await showError('Failed to save history.');
    }
  };

  return {
    recordHistory: recordHistoryEntry,
    renderHistoryList
  };
}
