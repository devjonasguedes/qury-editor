// Connect modal component (full + quick connect)

import { connectionsApi } from '../api/connections.js';
import { apiService } from '../services/apiService.js';

export function createConnectModal({
  onConnectSuccess,
  onSaveSuccess,
  onTestSuccess,
  onError,
  onClose,
}) {
  const modal = document.getElementById('connectModal');
  const title = document.getElementById('connectModalTitle');
  const subtitle = document.getElementById('connectModalSubtitle');
  const connectBtn = document.getElementById('connectBtn');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const closeBtn = document.getElementById('closeConnectModalBtn');
  const settingsTabs = document.getElementById('connectSettingsTabs');
  
  // Form fields
  const dbType = document.getElementById('dbType');
  const connectionUrl = document.getElementById('connectionUrl');
  const host = document.getElementById('host');
  const port = document.getElementById('port');
  const user = document.getElementById('user');
  const password = document.getElementById('password');
  const database = document.getElementById('database');
  const saveName = document.getElementById('saveName');
  const rememberPassword = document.getElementById('rememberPassword');
  const readOnly = document.getElementById('readOnly');
  const policyMode = document.getElementById('policyMode');
  
  // SQLite fields
  const sqlitePath = document.getElementById('sqlitePath');
  const sqliteModeCreate = document.getElementById('sqliteModeCreate');
  const sqliteModeExisting = document.getElementById('sqliteModeExisting');
  const sqliteBrowseBtn = document.getElementById('sqliteBrowseBtn');
  
  // SSH fields
  const tabDirectBtn = document.getElementById('tabDirectBtn');
  const tabSshBtn = document.getElementById('tabSshBtn');
  const sshHost = document.getElementById('sshHost');
  const sshPort = document.getElementById('sshPort');
  const sshUser = document.getElementById('sshUser');
  const sshPassword = document.getElementById('sshPassword');
  const sshPrivateKey = document.getElementById('sshPrivateKey');
  const sshPassphrase = document.getElementById('sshPassphrase');
  const sshLocalPort = document.getElementById('sshLocalPort');

  let activeMode = 'full'; // 'full' | 'quick'
  let activeTab = 'direct'; // 'direct' | 'ssh'
  let activeSettingsTab = 'connection'; // 'connection' | 'access' | 'save'

  const open = ({ mode = 'full', keepForm = false } = {}) => {
    if (!modal) return;
    
    activeMode = mode;
    
    if (!keepForm) {
      resetForm();
    }
    
    if (mode === 'quick' && saveName) {
      saveName.value = '';
      if (rememberPassword) rememberPassword.checked = false;
    }
    
    updateUI();
    modal.classList.remove('hidden');
  };

  const close = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    activeMode = 'full';
    activeTab = 'direct';
    activeSettingsTab = 'connection';
    if (onClose) onClose();
  };

  const updateUI = () => {
    const isQuick = activeMode === 'quick';
    const panel = modal?.querySelector('.connect-panel');
    
    if (panel) panel.classList.toggle('quick', isQuick);
    if (title) title.textContent = isQuick ? 'Quick connect' : 'New connection';
    if (subtitle) {
      subtitle.textContent = isQuick 
        ? 'Connect without saving.' 
        : 'Fill in the details to connect and save.';
    }
    if (connectBtn) {
      connectBtn.textContent = isQuick ? 'Quick connect' : 'Connect & save';
    }
    if (saveBtn) saveBtn.classList.add('hidden');
    
    updateTabs();
    updateSettingsTabs();
    syncTypeFields();
  };

  const updateTabs = () => {
    if (tabDirectBtn) tabDirectBtn.classList.toggle('active', activeTab === 'direct');
    if (tabSshBtn) tabSshBtn.classList.toggle('active', activeTab === 'ssh');
    
    const sshFields = document.getElementById('sshFields');
    if (sshFields) sshFields.classList.toggle('hidden', activeTab !== 'ssh');
  };

  const updateSettingsTabs = () => {
    const tabs = settingsTabs?.querySelectorAll('[data-connect-settings-tab]');
    tabs?.forEach(tab => {
      const tabName = tab.getAttribute('data-connect-settings-tab');
      tab.classList.toggle('active', tabName === activeSettingsTab);
    });

    const connectionSection = document.getElementById('connectSectionConnection');
    const accessSection = document.getElementById('connectSectionAccess');
    const saveSection = document.getElementById('connectSectionSave');
    
    if (connectionSection) connectionSection.classList.toggle('hidden', activeSettingsTab !== 'connection');
    if (accessSection) accessSection.classList.toggle('hidden', activeSettingsTab !== 'access');
    if (saveSection) {
      const showSave = activeSettingsTab === 'connection' && activeMode !== 'quick';
      saveSection.classList.toggle('hidden', !showSave);
    }
  };

  const syncTypeFields = () => {
    const type = dbType?.value || 'postgres';
    const isSqlite = type === 'sqlite';
    
    const sqliteFields = document.getElementById('sqliteFields');
    const standardFields = document.getElementById('standardFields');
    
    if (sqliteFields) sqliteFields.classList.toggle('hidden', !isSqlite);
    if (standardFields) standardFields.classList.toggle('hidden', isSqlite);
  };

  const resetForm = () => {
    if (dbType) dbType.value = 'postgres';
    if (connectionUrl) connectionUrl.value = '';
    if (host) host.value = '';
    if (port) port.value = '';
    if (user) user.value = '';
    if (password) password.value = '';
    if (database) database.value = '';
    if (saveName) saveName.value = '';
    if (sqlitePath) sqlitePath.value = '';
    if (rememberPassword) rememberPassword.checked = false;
    if (readOnly) readOnly.checked = false;
    if (policyMode) policyMode.value = 'dev';
    if (sqliteModeExisting) sqliteModeExisting.checked = true;
    if (sshHost) sshHost.value = '';
    if (sshPort) sshPort.value = '';
    if (sshUser) sshUser.value = '';
    if (sshPassword) sshPassword.value = '';
    if (sshPrivateKey) sshPrivateKey.value = '';
    if (sshPassphrase) sshPassphrase.value = '';
    if (sshLocalPort) sshLocalPort.value = '';
    activeTab = 'direct';
    activeSettingsTab = 'connection';
  };

  const getFormData = ({ includeSaveFields = false } = {}) => {
    const type = dbType?.value || 'postgres';
    const isSqlite = type === 'sqlite';
    const isSsh = activeTab === 'ssh';

    const data = {
      type,
      connectionUrl: connectionUrl?.value || '',
      host: host?.value || '',
      port: port?.value || '',
      user: user?.value || '',
      password: password?.value || '',
      database: database?.value || '',
      readOnly: readOnly?.checked || false,
      policyMode: policyMode?.value || 'dev',
    };

    if (isSqlite) {
      data.filePath = sqlitePath?.value || '';
      data.sqliteMode = sqliteModeCreate?.checked ? 'create' : 'existing';
    }

    if (includeSaveFields) {
      data.name = saveName?.value || '';
      data.rememberPassword = rememberPassword?.checked || false;
    }

    if (isSsh) {
      data.ssh = {
        enabled: true,
        host: sshHost?.value || '',
        port: sshPort?.value || '',
        user: sshUser?.value || '',
        password: sshPassword?.value || '',
        privateKey: sshPrivateKey?.value || '',
        passphrase: sshPassphrase?.value || '',
        localPort: sshLocalPort?.value || '',
      };
    }

    return data;
  };

  const setFormData = (entry) => {
    if (!entry) return;
    
    if (dbType) dbType.value = entry.type || 'postgres';
    if (connectionUrl) connectionUrl.value = entry.connectionUrl || entry.connection_url || entry.url || '';
    if (host) host.value = entry.host || '';
    if (port) port.value = entry.port || '';
    if (user) user.value = entry.user || '';
    if (password) password.value = entry.password || '';
    if (database) database.value = entry.database || '';
    if (saveName) saveName.value = entry.name || '';
    if (readOnly) readOnly.checked = entry.readOnly || false;
    if (policyMode) policyMode.value = entry.policyMode || 'dev';
    if (rememberPassword) rememberPassword.checked = entry.rememberPassword || false;
    
    const filePath = entry.filePath || entry.file_path || entry.path || '';
    if (sqlitePath) sqlitePath.value = filePath;
    if (sqliteModeExisting) sqliteModeExisting.checked = !!filePath;
    if (sqliteModeCreate) sqliteModeCreate.checked = !filePath;
    
    const ssh = entry.ssh || {};
    activeTab = ssh.enabled ? 'ssh' : 'direct';
    if (sshHost) sshHost.value = ssh.host || '';
    if (sshPort) sshPort.value = ssh.port || '';
    if (sshUser) sshUser.value = ssh.user || '';
    if (sshPassword) sshPassword.value = ssh.password || '';
    if (sshPrivateKey) sshPrivateKey.value = ssh.privateKey || '';
    if (sshPassphrase) sshPassphrase.value = ssh.passphrase || '';
    if (sshLocalPort) sshLocalPort.value = ssh.localPort || '';
    
    syncTypeFields();
    updateTabs();
  };

  // Event listeners
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const shouldSave = activeMode !== 'quick';
      const data = getFormData({ includeSaveFields: shouldSave });
      
      if (shouldSave && !data.name) {
        if (onError) onError('Enter a name to save.');
        return;
      }

      try {
        // Test connection first
        const db = apiService.db;
        const testResult = await db.testConnection(data);
        
        if (!testResult || !testResult.ok) {
          if (onError) onError(testResult?.error || 'Failed to test connection.');
          return;
        }

        // Save if needed
        if (shouldSave) {
          await connectionsApi.saveConnection(data);
          if (onSaveSuccess) onSaveSuccess(data);
        }

        // Notify success
        if (onConnectSuccess) await onConnectSuccess(data, { shouldSave });
        
      } catch (err) {
        if (onError) onError(err?.message || 'Failed to connect.');
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const data = getFormData({ includeSaveFields: true });
      
      if (!data.name) {
        if (onError) onError('Enter a name to save.');
        return;
      }

      try {
        // Test connection first
        const db = apiService.db;
        const testResult = await db.testConnection(data);
        
        if (!testResult || !testResult.ok) {
          if (onError) onError(testResult?.error || 'Failed to test connection.');
          return;
        }

        // Save connection
        await connectionsApi.saveConnection(data);
        
        if (onSaveSuccess) onSaveSuccess(data);
        close();
        
      } catch (err) {
        if (onError) onError(err?.message || 'Failed to save connection.');
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const data = getFormData({ includeSaveFields: true });
      
      try {
        const db = apiService.db;
        const result = await db.testConnection(data);
        
        if (!result || !result.ok) {
          if (onError) onError(result?.error || 'Failed to test connection.');
          return;
        }

        if (onTestSuccess) onTestSuccess(data);
        
      } catch (err) {
        if (onError) onError(err?.message || 'Failed to test connection.');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  if (dbType) {
    dbType.addEventListener('change', syncTypeFields);
  }

  if (tabDirectBtn) {
    tabDirectBtn.addEventListener('click', () => {
      activeTab = 'direct';
      updateTabs();
    });
  }

  if (tabSshBtn) {
    tabSshBtn.addEventListener('click', () => {
      activeTab = 'ssh';
      updateTabs();
    });
  }

  if (settingsTabs) {
    settingsTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-connect-settings-tab]');
      if (!tab) return;
      activeSettingsTab = tab.getAttribute('data-connect-settings-tab');
      updateSettingsTabs();
    });
  }

  if (sqliteBrowseBtn) {
    sqliteBrowseBtn.addEventListener('click', async () => {
      try {
        const db = apiService.db;
        if (!db.showOpenSqliteDialog) return;
        
        const res = await db.showOpenSqliteDialog();
        if (res?.ok && res?.filePath && sqlitePath) {
          sqlitePath.value = res.filePath;
        }
      } catch (err) {
        console.error('Failed to open SQLite file dialog', err);
      }
    });
  }

  return {
    open,
    close,
    getFormData,
    setFormData,
    resetForm,
  };
}
