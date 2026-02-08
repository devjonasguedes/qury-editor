const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listSavedConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (entry) => ipcRenderer.invoke('connections:save', entry),
  touchConnection: (name) => ipcRenderer.invoke('connections:touch', name),
  exportSavedConnections: () => ipcRenderer.invoke('connections:export'),
  importSavedConnections: () => ipcRenderer.invoke('connections:import'),
  deleteConnection: (name) => ipcRenderer.invoke('connections:delete', name),
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
  testConnection: (config) => ipcRenderer.invoke('db:testConnection', config),
  runQuery: (payload) => ipcRenderer.invoke('db:runQuery', payload),
  cancelQuery: () => ipcRenderer.invoke('db:cancelQuery'),
  setProgressBar: (value) => ipcRenderer.invoke('app:setProgressBar', value),
  getNativeTheme: () => ipcRenderer.invoke('system:getNativeTheme'),
  onNativeThemeUpdated: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('system:theme-updated', listener);
    return () => {
      ipcRenderer.removeListener('system:theme-updated', listener);
    };
  },
  showError: (message) => ipcRenderer.invoke('dialog:error', message)
});
