const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listSavedConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (entry) => ipcRenderer.invoke('connections:save', entry),
  deleteConnection: (name) => ipcRenderer.invoke('connections:delete', name),
  connect: (config) => ipcRenderer.invoke('db:connect', config),
  disconnect: () => ipcRenderer.invoke('db:disconnect'),
  listTables: () => ipcRenderer.invoke('db:listTables'),
  listColumns: (payload) => ipcRenderer.invoke('db:listColumns', payload),
  listDatabases: () => ipcRenderer.invoke('db:listDatabases'),
  useDatabase: (name) => ipcRenderer.invoke('db:useDatabase', name),
  testConnection: (config) => ipcRenderer.invoke('db:testConnection', config),
  runQuery: (sql) => ipcRenderer.invoke('db:runQuery', sql),
  showError: (message) => ipcRenderer.invoke('dialog:error', message)
});
