export function createTabTables({
  tabBar,
  newTabBtn,
  queryInput,
  getValue,
  setValue,
  getCurrentDatabase,
  onInput,
  onChange,
  onActiveChange
}) {
  let activeTabId = null;
  let tabCounter = 1;
  const tabs = [];
  const MAX_TAB_DATABASE_LABEL_LENGTH = 18;
  const tabsContainer = tabBar ? (tabBar.querySelector('.tab-scroll') || tabBar) : null;

  const getActiveTab = () => tabs.find((tab) => tab.id === activeTabId) || null;

  const readValue = typeof getValue === 'function'
    ? getValue
    : () => (queryInput ? queryInput.value || '' : '');

  const resolveCurrentDatabase = typeof getCurrentDatabase === 'function'
    ? () => String(getCurrentDatabase() || '').trim()
    : () => '';

  const normalizeDatabase = (value) => String(value || '').trim();

  const truncateLabel = (value, maxLength = MAX_TAB_DATABASE_LABEL_LENGTH) => {
    const text = String(value || '');
    if (!text || !Number.isFinite(maxLength) || maxLength <= 3) return text;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  };

  const isSameDatabase = (left, right) => {
    const a = normalizeDatabase(left);
    const b = normalizeDatabase(right);
    if (!a || !b) return false;
    return a.toLowerCase() === b.toLowerCase();
  };

  const formatTabLabel = (tab, options = {}) => {
    const truncateDatabase = options.truncateDatabase !== false;
    const baseTitle = tab && tab.title ? String(tab.title) : '';
    const database = normalizeDatabase(tab && tab.database ? tab.database : '');
    const currentDatabase = normalizeDatabase(resolveCurrentDatabase());
    if (!database || isSameDatabase(database, currentDatabase)) return baseTitle;
    const databaseLabel = truncateDatabase ? truncateLabel(database) : database;
    return `${baseTitle} [${databaseLabel}]`;
  };

  const inferDatabaseFromSql = (sql) => {
    const source = String(sql || '');
    if (!source.trim()) return '';
    const patterns = [
      /(?:from|join|update|into|table|call)\s+`([^`]+)`\s*\./i,
      /(?:from|join|update|into|table|call)\s+"([^"]+)"\s*\./i,
      /(?:from|join|update|into|table|call)\s+([A-Za-z0-9_]+)\s*\./i
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) return normalizeDatabase(match[1]);
    }
    return '';
  };

  const writeValue = typeof setValue === 'function'
    ? setValue
    : (value) => {
      if (queryInput) queryInput.value = value || '';
    };

  const syncActiveTabContent = () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.query = readValue() || '';
  };

  const getState = () => ({
    tabs: tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      database: normalizeDatabase(tab.database),
      query: tab.query,
      editorVisible: tab.editorVisible !== false
    })),
    activeTabId,
    tabCounter
  });

  const ensureActiveTabVisible = () => {
    if (!tabsContainer || !activeTabId) return;
    requestAnimationFrame(() => {
      const activeEl = tabsContainer.querySelector(`.tab[data-tab-id="${activeTabId}"]`);
      if (!activeEl) return;
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  const render = () => {
    if (!tabsContainer) return;
    tabsContainer.querySelectorAll('.tab').forEach((el) => el.remove());
    let didBackfillDatabase = false;
    tabs.forEach((tab) => {
      if (!normalizeDatabase(tab.database)) {
        const inferred = inferDatabaseFromSql(tab.query);
        if (inferred) {
          tab.database = inferred;
          didBackfillDatabase = true;
        }
      }
      const el = document.createElement('div');
      el.className = 'tab';
      el.dataset.tabId = tab.id;
      if (tab.id === activeTabId) el.classList.add('active');

      const label = document.createElement('span');
      label.textContent = formatTabLabel(tab);
      label.title = formatTabLabel(tab, { truncateDatabase: false });
      label.addEventListener('click', () => {
        syncActiveTabContent();
        activeTabId = tab.id;
        render();
        if (onChange) onChange(getState());
        if (onActiveChange) onActiveChange(tab.id, tab);
        writeValue(tab.query);
      });

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.innerHTML = '<i class="bi bi-x"></i>';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        closeTab(tab.id);
      });

      el.appendChild(label);
      el.appendChild(close);
      tabsContainer.appendChild(el);
    });
    ensureActiveTabVisible();
    if (didBackfillDatabase && onChange) onChange(getState());
  };

  const create = (title) => {
    const name = title || `Query ${tabCounter++}`;
    const id = `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const tab = {
      id,
      title: name,
      database: resolveCurrentDatabase(),
      query: '',
      editorVisible: true
    };
    tabs.push(tab);
    activeTabId = id;
    render();
    if (onChange) onChange(getState());
    if (onActiveChange) onActiveChange(id, tab);
    writeValue('');
    return tab;
  };

  const createWithQuery = (title, sql, options = {}) => {
    const tab = create(title);
    const nextDb = normalizeDatabase(options.database) || inferDatabaseFromSql(sql);
    if (nextDb) tab.database = nextDb;
    tab.query = sql || '';
    writeValue(tab.query);
    render();
    if (onChange) onChange(getState());
    return tab;
  };

  const ensureOne = () => {
    if (tabs.length === 0) create();
  };

  const closeTab = (id) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activeTabId === id) {
      activeTabId = tabs.length ? tabs[Math.max(0, idx - 1)].id : null;
      if (activeTabId) {
        const next = getActiveTab();
        writeValue(next ? next.query : '');
        if (onActiveChange) onActiveChange(activeTabId, next);
      } else {
        writeValue('');
        if (onActiveChange) onActiveChange(null, null);
      }
    }
    render();
    if (onChange) onChange(getState());
    if (tabs.length === 0) {
      tabCounter = 1;
      create();
    }
  };

  const closeActive = () => {
    if (!activeTabId) return;
    closeTab(activeTabId);
  };

  const setState = (state) => {
    tabs.splice(0, tabs.length);
    if (state && Array.isArray(state.tabs)) {
      state.tabs.forEach((tab) => {
        if (!tab || !tab.id) return;
        tabs.push({
          id: tab.id,
          title: tab.title || `Query ${tabCounter++}`,
          database:
            normalizeDatabase(tab.database)
            || inferDatabaseFromSql(tab.query)
            || resolveCurrentDatabase(),
          query: tab.query || '',
          editorVisible: tab.editorVisible !== false
        });
      });
    }
    tabCounter = state && Number.isFinite(state.tabCounter) ? state.tabCounter : tabCounter;
    activeTabId = state && state.activeTabId ? state.activeTabId : (tabs[0] ? tabs[0].id : null);
    render();
    if (activeTabId) {
      const active = getActiveTab();
      writeValue(active ? active.query : '');
      if (onActiveChange) onActiveChange(activeTabId, active);
    } else {
      writeValue('');
      if (onActiveChange) onActiveChange(null, null);
    }
    if (onChange) onChange(getState());
  };

  const setActiveTabDatabase = (database, options = {}) => {
    const active = getActiveTab();
    if (!active) return;
    const next = normalizeDatabase(database);
    if (normalizeDatabase(active.database) === next) return;
    active.database = next;
    if (options.render !== false) render();
    if (onChange) onChange(getState());
  };

  const bind = () => {
    if (newTabBtn) {
      newTabBtn.addEventListener('click', () => {
        syncActiveTabContent();
        create();
      });
    }

    if (typeof onInput === 'function') {
      onInput(() => {
        syncActiveTabContent();
        if (onChange) onChange(getState());
      });
    } else if (queryInput) {
      queryInput.addEventListener('input', () => {
        syncActiveTabContent();
        if (onChange) onChange(getState());
      });
    }
  };

  bind();

  return {
    render,
    create,
    createWithQuery,
    closeTab,
    closeActive,
    ensureOne,
    getActiveTab,
    getState,
    setState,
    syncActiveTabContent,
    setActiveTabDatabase
  };
}
