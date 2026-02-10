const { contextBridge, ipcRenderer } = require('electron');

// Preferred: use the namespaced API exposed as `window.api.db`.
// TODO (LEGACY): this file still exposes flat top-level methods for backward compatibility.
// Remove the flat exports (`...db` / `...electronApi`) once the renderer is migrated to `window.api.db/*`
const db = {
  connect: (config) => ipcRenderer.invoke('db:connect', config),
  disconnect: () => ipcRenderer.invoke('db:disconnect'),
  listTables: () => ipcRenderer.invoke('db:listTables'),
  listColumns: (payload) => ipcRenderer.invoke('db:listColumns', payload),
  listTableInfo: (payload) => ipcRenderer.invoke('db:listTableInfo', payload),
  getViewDefinition: (payload) => ipcRenderer.invoke('db:getViewDefinition', payload),
  getTableDefinition: (payload) => ipcRenderer.invoke('db:getTableDefinition', payload),
  listRoutines: () => ipcRenderer.invoke('db:listRoutines'),
  listDatabases: () => ipcRenderer.invoke('db:listDatabases'),
  useDatabase: (name) => ipcRenderer.invoke('db:useDatabase', name),
  setSessionTimezone: (payload) => ipcRenderer.invoke('db:setSessionTimezone', payload),
  testConnection: (config) => ipcRenderer.invoke('db:testConnection', config),
  runQuery: (payload) => ipcRenderer.invoke('db:runQuery', payload),
  cancelQuery: () => ipcRenderer.invoke('db:cancelQuery'),
  listSavedConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (entry) => ipcRenderer.invoke('connections:save', entry),
  touchConnection: (name) => ipcRenderer.invoke('connections:touch', name),
  exportSavedConnections: () => ipcRenderer.invoke('connections:export'),
  importSavedConnections: () => ipcRenderer.invoke('connections:import'),
  deleteConnection: (name) => ipcRenderer.invoke('connections:delete', name),
  listHistory: (payload) => ipcRenderer.invoke('history:list', payload),
  recordHistory: (payload) => ipcRenderer.invoke('history:record', payload),
  listSnippets: (payload) => ipcRenderer.invoke('snippets:list', payload),
  saveSnippet: (payload) => ipcRenderer.invoke('snippets:save', payload),
  deleteSnippet: (payload) => ipcRenderer.invoke('snippets:delete', payload),
  getPolicySettings: () => ipcRenderer.invoke('settings:getPolicy'),
  savePolicySettings: (payload) => ipcRenderer.invoke('settings:savePolicy', payload),
  openSqliteFile: () => ipcRenderer.invoke('dialog:sqliteOpen'),
  saveSqliteFile: () => ipcRenderer.invoke('dialog:sqliteSave')
};

// Preferred: use `window.api.electron` for app/system operations.
// TODO (LEGACY): flat top-level methods are also exported below for compatibility.
const electronApi = {
  setProgressBar: (value) => ipcRenderer.invoke('app:setProgressBar', value),
  getNativeTheme: () => ipcRenderer.invoke('system:getNativeTheme'),
  onNativeThemeUpdated: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('system:theme-updated', listener);
    return () => ipcRenderer.removeListener('system:theme-updated', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  showError: (message) => ipcRenderer.invoke('dialog:error', message)
};

// Expose both namespaced and flat (legacy) API for compatibility
// TODO (LEGACY): the spreads below export flat methods (e.g. `window.api.connect`).
// Once migration completes, remove `...db` and `...electronApi` to force use of `window.api.db`/`window.api.electron`.
contextBridge.exposeInMainWorld('api', {
  // Namespaced APIs (preferred). Legacy flat exports removed after migration.
  db,
  electron: electronApi
});
