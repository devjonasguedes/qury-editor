const HISTORY_KEY = 'sqlEditor.queryHistory';

const safeJsonParse = (raw, fallback) => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
};

const readJson = (key, fallback) => {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return safeJsonParse(raw, fallback);
  } catch (_) {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
};

export function createQueryHistory({
  historyList,
  getCurrentHistoryKey,
  getActiveTab,
  isTableTab,
  isTableEditor,
  createNewQueryTab,
  setQueryValue
}) {
  const buildKey = () => {
    const scope = typeof getCurrentHistoryKey === 'function' ? getCurrentHistoryKey() : null;
    if (!scope) return null;
    return `${HISTORY_KEY}:${scope}`;
  };

  const readHistory = () => {
    const key = buildKey();
    return Array.isArray(readJson(key, [])) ? readJson(key, []) : [];
  };

  const writeHistory = (list) => {
    const key = buildKey();
    if (!key) return;
    writeJson(key, list);
  };

  const recordHistory = (sqlText) => {
    const key = buildKey();
    if (!key) return;
    const text = String(sqlText || '').trim();
    if (!text) return;
    const list = readHistory();
    const normalized = text.replace(/\s+/g, ' ');
    const next = list.filter((item) => item && item.sql !== normalized);
    next.unshift({ sql: normalized, ts: Date.now() });
    writeHistory(next.slice(0, 50));
    renderHistoryList();
  };

  const renderHistoryList = () => {
    if (!historyList) return;
    if (!buildKey()) {
      historyList.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Connect to view history.';
      historyList.appendChild(empty);
      return;
    }
    const list = readHistory();
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
        const tab = getActiveTab ? getActiveTab() : null;
        if (!tab || (isTableTab && isTableTab(tab) && isTableEditor && !isTableEditor(tab))) {
          if (createNewQueryTab) createNewQueryTab(sql);
          if (setQueryValue) setQueryValue(sql);
          return;
        }
        if (setQueryValue) setQueryValue(sql);
        if (tab) tab.query = sql;
      });

      historyList.appendChild(item);
    });
  };

  return {
    recordHistory,
    renderHistoryList
  };
}
