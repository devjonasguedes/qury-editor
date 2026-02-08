export function createDbConnection(api) {
  const SAFE_EMPTY_LIST_METHODS = new Set(['listSavedConnections']);

  const showErrorFallback = async (message) => {
    console.error('API unavailable:', message);
    if (message) {
      alert(message);
    }
  };

  const safeApi = new Proxy(
    {},
    {
      get(_target, prop) {
        if (api && typeof api[prop] !== 'undefined') {
          return api[prop];
        }
        if (prop === 'showError') {
          return showErrorFallback;
        }
        if (SAFE_EMPTY_LIST_METHODS.has(prop)) {
          return async () => [];
        }
        return async () => {
          await showErrorFallback('Preload API not found.');
          return { ok: false, error: 'API unavailable.' };
        };
      }
    }
  );

  return {
    connect: (config) => safeApi.connect(config),
    disconnect: () => safeApi.disconnect(),
    testConnection: (config) => safeApi.testConnection(config),
    runQuery: (payload) => safeApi.runQuery(payload),
    setProgressBar: (value) => {
      if (api && typeof api.setProgressBar === 'function') {
        return api.setProgressBar(value);
      }
      return Promise.resolve({ ok: false, error: 'API unavailable.' });
    },
    listTables: () => safeApi.listTables(),
    listColumns: (payload) => safeApi.listColumns(payload),
    listTableInfo: (payload) => safeApi.listTableInfo(payload),
    getViewDefinition: (payload) => safeApi.getViewDefinition(payload),
    getTableDefinition: (payload) => safeApi.getTableDefinition(payload),
    listRoutines: () => safeApi.listRoutines(),
    listDatabases: () => safeApi.listDatabases(),
    useDatabase: (name) => safeApi.useDatabase(name),
    listSavedConnections: () => safeApi.listSavedConnections(),
    saveConnection: (entry) => safeApi.saveConnection(entry),
    touchConnection: (name) => safeApi.touchConnection(name),
    exportSavedConnections: () => safeApi.exportSavedConnections(),
    importSavedConnections: () => safeApi.importSavedConnections(),
    deleteConnection: (name) => safeApi.deleteConnection(name),
    getPolicySettings: () => safeApi.getPolicySettings(),
    savePolicySettings: (payload) => safeApi.savePolicySettings(payload),
    getNativeTheme: () => {
      if (api && typeof api.getNativeTheme === 'function') {
        return api.getNativeTheme();
      }
      return Promise.resolve({ ok: false, error: 'API unavailable.' });
    },
    onNativeThemeUpdated: (handler) => {
      if (api && typeof api.onNativeThemeUpdated === 'function') {
        return api.onNativeThemeUpdated(handler);
      }
      return () => {};
    },
    showError: (message) => safeApi.showError(message)
  };
}
