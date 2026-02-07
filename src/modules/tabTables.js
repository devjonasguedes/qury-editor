export function createTabTables({
  tabBar,
  newTabBtn,
  queryInput,
  getValue,
  setValue,
  onInput,
  onChange,
  onActiveChange
}) {
  let activeTabId = null;
  let tabCounter = 1;
  const tabs = [];

  const getActiveTab = () => tabs.find((tab) => tab.id === activeTabId) || null;

  const readValue = typeof getValue === 'function'
    ? getValue
    : () => (queryInput ? queryInput.value || '' : '');

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
    tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, query: tab.query })),
    activeTabId,
    tabCounter
  });

  const render = () => {
    if (!tabBar) return;
    tabBar.querySelectorAll('.tab').forEach((el) => el.remove());
    if (newTabBtn) {
      tabBar.appendChild(newTabBtn);
    }
    tabs.forEach((tab) => {
      const el = document.createElement('div');
      el.className = 'tab';
      if (tab.id === activeTabId) el.classList.add('active');

      const label = document.createElement('span');
      label.textContent = tab.title;
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
      tabBar.appendChild(el);
    });
  };

  const create = (title) => {
    const name = title || `Query ${tabCounter++}`;
    const id = `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const tab = { id, title: name, query: '' };
    tabs.push(tab);
    activeTabId = id;
    render();
    if (onChange) onChange(getState());
    if (onActiveChange) onActiveChange(id, tab);
    writeValue('');
    return tab;
  };

  const createWithQuery = (title, sql) => {
    const tab = create(title);
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
          query: tab.query || ''
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
    syncActiveTabContent
  };
}
