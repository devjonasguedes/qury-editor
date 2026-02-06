import { createScopedStorage } from './storage.js';

const HISTORY_KEY = 'sqlEditor.queryHistory';

export function createHistoryManager({
  historyList,
  getCurrentHistoryKey,
  getActiveTab,
  isTableTab,
  isTableEditor,
  createNewQueryTab,
  setQueryValue
}) {
  const historyStore = createScopedStorage(HISTORY_KEY, getCurrentHistoryKey);

  function readHistory() {
    return historyStore.readList([]);
  }

  function writeHistory(list) {
    historyStore.writeList(list);
  }

  function recordHistory(sqlText) {
    const key = getCurrentHistoryKey();
    if (!key) return;
    const text = String(sqlText || '').trim();
    if (!text) return;
    const list = readHistory();
    const normalized = text.replace(/\s+/g, ' ');
    const next = list.filter((item) => item && item.sql !== normalized);
    next.unshift({ sql: normalized, ts: Date.now() });
    writeHistory(next.slice(0, 50));
    renderHistoryList();
  }

  function renderHistoryList() {
    if (!historyList) return;
    if (!getCurrentHistoryKey()) {
      historyList.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Conecte para ver o histórico.';
      historyList.appendChild(empty);
      return;
    }
    const list = readHistory();
    historyList.innerHTML = '';
    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Nenhuma query executada.';
      historyList.appendChild(empty);
      return;
    }
    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = entry.sql.split('\n')[0];

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const when = new Date(entry.ts || Date.now());
      meta.textContent = when.toLocaleString();

      item.appendChild(title);
      item.appendChild(meta);

      item.addEventListener('click', () => {
        const sql = entry.sql || '';
        if (!sql) return;
        const tab = getActiveTab();
        if (!tab || (isTableTab(tab) && !isTableEditor(tab))) {
          createNewQueryTab(sql);
          setQueryValue(sql);
          return;
        }
        setQueryValue(sql);
        if (tab) tab.query = sql;
      });

      historyList.appendChild(item);
    });
  }

  return {
    recordHistory,
    renderHistoryList
  };
}
