const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listSavedConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (entry) => ipcRenderer.invoke('connections:save', entry),
  deleteConnection: (name) => ipcRenderer.invoke('connections:delete', name),
  connect: (config) => ipcRenderer.invoke('db:connect', config),
  disconnect: () => ipcRenderer.invoke('db:disconnect'),
  listTables: () => ipcRenderer.invoke('db:listTables'),
  runQuery: (sql) => ipcRenderer.invoke('db:runQuery', sql),
  showError: (message) => ipcRenderer.invoke('dialog:error', message)
});
