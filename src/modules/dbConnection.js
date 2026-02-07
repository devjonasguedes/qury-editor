export function createDbConnection(api) {
  const SAFE_EMPTY_LIST_METHODS = new Set(['listSavedConnections']);

  const showErrorFallback = async (message) => {
    console.error('API indisponivel:', message);
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
          await showErrorFallback('API do preload nao encontrada.');
          return { ok: false, error: 'API indisponivel.' };
        };
      }
    }
  );

  return {
    connect: (config) => safeApi.connect(config),
    disconnect: () => safeApi.disconnect(),
    testConnection: (config) => safeApi.testConnection(config),
    runQuery: (payload) => safeApi.runQuery(payload),
    listTables: () => safeApi.listTables(),
    listColumns: (payload) => safeApi.listColumns(payload),
    listTableInfo: (payload) => safeApi.listTableInfo(payload),
    listRoutines: () => safeApi.listRoutines(),
    listDatabases: () => safeApi.listDatabases(),
    useDatabase: (name) => safeApi.useDatabase(name),
    listSavedConnections: () => safeApi.listSavedConnections(),
    saveConnection: (entry) => safeApi.saveConnection(entry),
    deleteConnection: (name) => safeApi.deleteConnection(name),
    showError: (message) => safeApi.showError(message)
  };
}
