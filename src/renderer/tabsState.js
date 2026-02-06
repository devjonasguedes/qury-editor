import { readJson, writeJson } from './storage.js';

const TABS_KEY = 'sqlEditor.tabsState';
const TREE_STATE_KEY = 'sqlEditor.treeState';
const LAST_KEY_MAP = 'sqlEditor.lastKeyByBase';

export function createTabsStateManager({
  getCurrentConnection,
  getCurrentHistoryKey,
  getTabs,
  setTabs,
  getActiveTabId,
  setActiveTabId,
  getTabCounter,
  setTabCounter,
  tabsMemory,
  buildConnectionBaseKey,
  normalizeKeyToBase,
  renderTabBar,
  setActiveTab,
  onRestoring
}) {
  function tabsStorageKey() {
    const historyKey = getCurrentHistoryKey();
    if (!historyKey) return null;
    return `${TABS_KEY}:${historyKey}`;
  }

  function treeStateKey() {
    const historyKey = getCurrentHistoryKey();
    if (!historyKey) return null;
    return `${TREE_STATE_KEY}:${historyKey}`;
  }

  function hasStoredTabs(key) {
    if (!key) return false;
    if (tabsMemory.has(key)) return true;
    try {
      return !!localStorage.getItem(`${TABS_KEY}:${key}`);
    } catch (_) {
      return false;
    }
  }

  function readLastKeyMap() {
    return readJson(LAST_KEY_MAP, {}) || {};
  }

  function writeLastKeyMap(map) {
    writeJson(LAST_KEY_MAP, map || {});
  }

  function updateLastKeyMap() {
    const currentConnection = getCurrentConnection();
    const historyKey = getCurrentHistoryKey();
    if (!currentConnection || !historyKey) return;
    const baseKey = buildConnectionBaseKey(currentConnection);
    if (!baseKey) return;
    const map = readLastKeyMap();
    map[baseKey] = historyKey;
    writeLastKeyMap(map);
  }

  function findStoredTabsKeyForBase(baseKey) {
    if (!baseKey) return null;
    const map = readLastKeyMap();
    if (map && map[baseKey]) return map[baseKey];
    for (const key of tabsMemory.keys()) {
      if (normalizeKeyToBase(key) === baseKey) return key;
    }
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const rawKey = localStorage.key(i);
        if (!rawKey || !rawKey.startsWith(`${TABS_KEY}:`)) continue;
        const connKey = rawKey.slice(`${TABS_KEY}:`.length);
        if (normalizeKeyToBase(connKey) === baseKey) return connKey;
      }
    } catch (_) {
      // ignore
    }
    return null;
  }

  function migrateConnectionState(previousKey, nextKey) {
    if (!previousKey || !nextKey || previousKey === nextKey) return;
    if (tabsMemory.has(previousKey) && !tabsMemory.has(nextKey)) {
      tabsMemory.set(nextKey, tabsMemory.get(previousKey));
    }
    tabsMemory.delete(previousKey);
    try {
      const prevTabsKey = `${TABS_KEY}:${previousKey}`;
      const nextTabsKey = `${TABS_KEY}:${nextKey}`;
      const prevTreeKey = `${TREE_STATE_KEY}:${previousKey}`;
      const nextTreeKey = `${TREE_STATE_KEY}:${nextKey}`;
      if (!localStorage.getItem(nextTabsKey)) {
        const prevTabsRaw = localStorage.getItem(prevTabsKey);
        if (prevTabsRaw) localStorage.setItem(nextTabsKey, prevTabsRaw);
      }
      if (!localStorage.getItem(nextTreeKey)) {
        const prevTreeRaw = localStorage.getItem(prevTreeKey);
        if (prevTreeRaw) localStorage.setItem(nextTreeKey, prevTreeRaw);
      }
      localStorage.removeItem(prevTabsKey);
      localStorage.removeItem(prevTreeKey);
    } catch (_) {
      // ignore
    }
  }

  function saveTabsState() {
    const key = tabsStorageKey();
    if (!key) return;
    const tabs = getTabs();
    if (!tabs || tabs.length === 0) return;
    updateLastKeyMap();
    const activeTabId = getActiveTabId();
    const tabCounter = getTabCounter();
    tabsMemory.set(key, {
      activeTabId,
      tabCounter,
      tabs: tabs.map((tab) => ({
        ...tab,
        rows: tab.rows || null
      }))
    });
    const snapshot = {
      activeTabId,
      tabCounter,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        query: tab.query,
        baseQuery: tab.baseQuery,
        filter: tab.filter,
        filterEnabled: tab.filterEnabled,
        filterSource: tab.filterSource,
        kind: tab.kind,
        showEditor: tab.showEditor,
        sort: tab.sort || null
      }))
    };
    writeJson(key, snapshot);
  }

  function restoreTabsState() {
    const currentConnection = getCurrentConnection();
    if (!currentConnection) return false;
    const key = tabsStorageKey();
    if (!key) return false;
    let snapshot = null;
    if (tabsMemory.has(key)) {
      snapshot = tabsMemory.get(key);
    } else {
      snapshot = readJson(key, null);
    }

    if (typeof onRestoring === 'function') onRestoring(true);
    setTabs([]);
    setActiveTabId(null);
    setTabCounter(1);

    if (snapshot && Array.isArray(snapshot.tabs) && snapshot.tabs.length > 0) {
      const currentHistoryKey = getCurrentHistoryKey();
      let counter = snapshot.tabCounter || snapshot.tabs.length + 1;
      const restoredTabs = snapshot.tabs.map((saved) => ({
        id: saved.id || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: saved.title || `Query ${counter++}`,
        query: saved.query || '',
        baseQuery: saved.baseQuery || '',
        filter: saved.filter || '',
        filterEnabled: saved.filterEnabled || false,
        filterSource: saved.filterSource || '',
        rows: saved.rows || null,
        kind: saved.kind || 'query',
        showEditor: saved.showEditor || false,
        sort: saved.sort || null,
        connectionKey: currentHistoryKey,
        connection: currentConnection ? { ...currentConnection } : null
      }));
      setTabs(restoredTabs);
      setTabCounter(counter);
      const activeTabId = snapshot.activeTabId && restoredTabs.some((t) => t.id === snapshot.activeTabId)
        ? snapshot.activeTabId
        : restoredTabs[0].id;
      setActiveTabId(activeTabId);
      renderTabBar();
      setActiveTab(activeTabId);
      if (typeof onRestoring === 'function') onRestoring(false);
      return true;
    }

    renderTabBar();
    if (typeof onRestoring === 'function') onRestoring(false);
    return false;
  }

  function restoreTabsStateWithFallback() {
    const currentConnection = getCurrentConnection();
    if (!currentConnection) return false;
    const restored = restoreTabsState();
    if (restored) return true;
    const baseKey = buildConnectionBaseKey(currentConnection);
    const historyKey = getCurrentHistoryKey();
    const candidate = findStoredTabsKeyForBase(baseKey);
    if (candidate && candidate !== historyKey) {
      migrateConnectionState(candidate, historyKey);
      return restoreTabsState();
    }
    return false;
  }

  function readTreeState() {
    const key = treeStateKey();
    if (!key) return {};
    const data = readJson(key, {});
    return data && typeof data === 'object' ? data : {};
  }

  function writeTreeState(expandedState) {
    const key = treeStateKey();
    if (!key) return;
    writeJson(key, expandedState || {});
  }

  function setTreeExpanded(expandedState, key, expanded) {
    if (!key) return expandedState || {};
    const next = expandedState || {};
    next[key] = !!expanded;
    writeTreeState(next);
    return next;
  }

  function clearTabsState({ reset = true } = {}) {
    const key = tabsStorageKey();
    if (key) {
      tabsMemory.delete(key);
      try {
        localStorage.removeItem(key);
      } catch (_) {
        // ignore
      }
    }
    const currentConnection = getCurrentConnection();
    const historyKey = getCurrentHistoryKey();
    if (currentConnection && historyKey) {
      const baseKey = buildConnectionBaseKey(currentConnection);
      if (baseKey) {
        const map = readLastKeyMap();
        if (map && map[baseKey] === historyKey) {
          delete map[baseKey];
          writeLastKeyMap(map);
        }
      }
    }
    if (reset) {
      setTabs([]);
      setActiveTabId(null);
      setTabCounter(1);
      renderTabBar();
    }
    return true;
  }

  function clearTreeState() {
    const key = treeStateKey();
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch (_) {
        // ignore
      }
    }
    return {};
  }

  return {
    tabsStorageKey,
    treeStateKey,
    hasStoredTabs,
    updateLastKeyMap,
    findStoredTabsKeyForBase,
    migrateConnectionState,
    saveTabsState,
    restoreTabsState,
    restoreTabsStateWithFallback,
    readTreeState,
    writeTreeState,
    setTreeExpanded,
    clearTabsState,
    clearTreeState
  };
}
