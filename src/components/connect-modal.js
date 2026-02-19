// Connect modal component (full + quick connect)

import { connectionsApi } from '../api/connections.js';
import { dbApi } from '../api/db.js';
import { dialogsApi } from '../api/dialogs.js';

export function createConnectModal({
  onConnectSuccess,
  onSaveSuccess,
  onTestSuccess,
  onTestError,
  onError,
  onClose,
}) {
  const modal = document.getElementById('connectModal');
  const backdrop = document.getElementById('connectModalBackdrop');
  const title = document.getElementById('connectModalTitle');
  const subtitle = document.getElementById('connectModalSubtitle');
  const connectBtn = document.getElementById('connectBtn');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const connectSpinner = document.getElementById('connectSpinner');
  const closeBtn = document.getElementById('closeConnectModalBtn');
  const settingsTabs = document.getElementById('connectSettingsTabs');
  const clearFormBtn = document.getElementById('clearFormBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  
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
  const sshFields = document.getElementById('sshFields');
  const sshHost = document.getElementById('sshHost');
  const sshPort = document.getElementById('sshPort');
  const sshUser = document.getElementById('sshUser');
  const sshPassword = document.getElementById('sshPassword');
  const sshPrivateKey = document.getElementById('sshPrivateKey');
  const sshPassphrase = document.getElementById('sshPassphrase');
  const sshLocalPort = document.getElementById('sshLocalPort');

  const getFieldContainer = (input) => (input ? input.closest('.field') : null);
  const hostField = getFieldContainer(host);
  const portField = getFieldContainer(port);
  const userField = getFieldContainer(user);
  const passwordField = getFieldContainer(password);
  const databaseField = getFieldContainer(database);
  const connectionUrlField = getFieldContainer(connectionUrl);
  const rememberSecretsField = rememberPassword
    ? rememberPassword.closest('.save-settings-option')
    : null;

  let activeMode = 'full'; // 'full' | 'quick'
  let activeTab = 'direct'; // 'direct' | 'ssh'
  let activeSettingsTab = 'connection'; // 'connection' | 'access' | 'save'

  const setEditMode = (enabled) => {
    const next = !!enabled;
    if (dbType) {
      dbType.disabled = next;
      if (next) {
        dbType.title =
          'Type cannot be changed while editing. Create a new connection to change type.';
      } else {
        dbType.removeAttribute('title');
      }
    }
    if (cancelEditBtn) cancelEditBtn.classList.toggle('hidden', !next);
  };

  const setLoading = (loading) => {
    const isLoading = !!loading;
    if (connectSpinner) connectSpinner.classList.toggle('hidden', !isLoading);
    if (connectBtn) connectBtn.disabled = isLoading;
    if (saveBtn) saveBtn.disabled = isLoading;
    if (testBtn) testBtn.disabled = isLoading;
    if (clearFormBtn) clearFormBtn.disabled = isLoading;
    if (cancelEditBtn) cancelEditBtn.disabled = isLoading;
    if (modal) modal.classList.toggle('is-connecting', isLoading);
  };

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

  const setMode = (mode = 'full') => {
    activeMode = mode === 'quick' ? 'quick' : 'full';
    updateUI();
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
    if (hostField) hostField.classList.toggle('hidden', isSqlite);
    if (portField) portField.classList.toggle('hidden', isSqlite);
    if (userField) userField.classList.toggle('hidden', isSqlite);
    if (passwordField) passwordField.classList.toggle('hidden', isSqlite);
    if (databaseField) databaseField.classList.toggle('hidden', isSqlite);
    if (connectionUrlField) connectionUrlField.classList.toggle('hidden', isSqlite);
    if (tabSshBtn) tabSshBtn.classList.toggle('hidden', isSqlite);
    if (rememberSecretsField)
      rememberSecretsField.classList.toggle('hidden', isSqlite);
    if (isSqlite && activeTab === 'ssh') {
      activeTab = 'direct';
      updateTabs();
    }
    if (sshFields) sshFields.classList.toggle('hidden', activeTab !== 'ssh');
    updateConnectionUrlPlaceholder(type);
  };

  const normalizeTypeForPlaceholder = (value) => {
    const type = String(value || '')
      .trim()
      .toLowerCase();
    if (!type) return 'mysql';
    if (type === 'postgresql') return 'postgres';
    if (type === 'sqlite3') return 'sqlite';
    if (
      type === 'postgres' ||
      type === 'mysql' ||
      type === 'sqlite'
    )
      return type;
    return 'mysql';
  };

  const resolveConnectionUrlPlaceholder = (typeValue) => {
    const type = normalizeTypeForPlaceholder(typeValue);
    if (type === 'postgres')
      return 'postgresql://user:password@localhost:5432/database';
    if (type === 'sqlite') return 'sqlite:///path/to/database.sqlite';
    return 'mysql://user:password@localhost:3306/database';
  };

  const updateConnectionUrlPlaceholder = (typeValue) => {
    setConnectionUrlPlaceholder(resolveConnectionUrlPlaceholder(typeValue));
  };

  const resetForm = () => {
    if (dbType) dbType.value = 'sqlite';
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

  const setActiveTab = (tab) => {
    activeTab = tab === 'ssh' ? 'ssh' : 'direct';
    updateTabs();
  };

  const setSettingsTab = (tab) => {
    const normalized = tab === 'access' || tab === 'save' ? tab : 'connection';
    activeSettingsTab = normalized;
    updateSettingsTabs();
  };

  const setConnectionUrlPlaceholder = (value) => {
    if (connectionUrl) connectionUrl.placeholder = value || '';
  };

  const decodeUrlPart = (value) => {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value;
    }
  };

  const normalizeTypeFromProtocol = (value) => {
    const type = String(value || '')
      .trim()
      .toLowerCase();
    if (type === 'postgres' || type === 'postgresql') return 'postgres';
    if (type === 'mysql') return 'mysql';
    if (type === 'sqlite' || type === 'sqlite3') return 'sqlite';
    return '';
  };

  const parseConnectionUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    let parsedUrl = null;
    try {
      parsedUrl = new URL(raw);
    } catch (err) {
      return null;
    }

    const protocol = normalizeTypeFromProtocol(
      String(parsedUrl.protocol || '').replace(':', ''),
    );
    if (!protocol) return null;

    if (protocol === 'sqlite') {
      let filePath = decodeUrlPart(parsedUrl.pathname || '');
      if (!filePath && parsedUrl.host) {
        filePath = decodeUrlPart(parsedUrl.host);
      }
      if (filePath === '/:memory:' || filePath === ':memory:') {
        filePath = ':memory:';
      }
      if (filePath.startsWith('/') && /^[A-Za-z]:/.test(filePath.slice(1))) {
        filePath = filePath.slice(1);
      }
      return {
        type: 'sqlite',
        filePath,
      };
    }

    return {
      type: protocol,
      host: decodeUrlPart(parsedUrl.hostname || ''),
      port: parsedUrl.port || '',
      user: decodeUrlPart(parsedUrl.username || ''),
      password: decodeUrlPart(parsedUrl.password || ''),
      database: decodeUrlPart(String(parsedUrl.pathname || '').replace(/^\/+/, '')),
    };
  };

  const applyConnectionUrl = (value, { force = false } = {}) => {
    const parsed = parseConnectionUrl(value);
    if (!parsed) return false;

    if (!force) {
      const hasDetails =
        parsed.type === 'sqlite' ||
        parsed.host ||
        parsed.database ||
        parsed.user ||
        parsed.password ||
        parsed.port;
      if (!hasDetails) return false;
    }

    if (dbType) dbType.value = parsed.type;

    if (parsed.type === 'sqlite') {
      if (sqlitePath) sqlitePath.value = parsed.filePath || '';
      if (sqliteModeExisting) sqliteModeExisting.checked = !!parsed.filePath;
      if (sqliteModeCreate) sqliteModeCreate.checked = !parsed.filePath;
      if (host) host.value = '';
      if (port) port.value = '';
      if (user) user.value = '';
      if (password) password.value = '';
      if (database) database.value = '';
    } else {
      if (host) host.value = parsed.host || '';
      if (port) port.value = parsed.port || '';
      if (user) user.value = parsed.user || '';
      if (password) password.value = parsed.password || '';
      if (database) database.value = parsed.database || '';
    }

    syncTypeFields();
    updateTabs();
    return true;
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
    updateConnectionUrlPlaceholder(dbType ? dbType.value : '');
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
        const testResult = await dbApi.testConnection(data);
        
        if (!testResult || testResult.ok === false) {
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
        const testResult = await dbApi.testConnection(data);
        
        if (!testResult || testResult.ok === false) {
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
        const result = await dbApi.testConnection(data);
        
        if (!result || result.ok === false) {
          if (onTestError) {
            onTestError(result?.error || 'Failed to test connection.');
          } else if (onError) {
            onError(result?.error || 'Failed to test connection.');
          }
          return;
        }

        if (onTestSuccess) onTestSuccess(data);
        
      } catch (err) {
        if (onTestError) {
          onTestError(err?.message || 'Failed to test connection.');
        } else if (onError) {
          onError(err?.message || 'Failed to test connection.');
        }
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  if (backdrop) {
    backdrop.addEventListener('click', close);
  }

  if (dbType) {
    dbType.addEventListener('change', () => {
      syncTypeFields();
    });
  }

  if (connectionUrl) {
    let urlSyncTimeout = null;
    const scheduleUrlSync = (force = false) => {
      if (urlSyncTimeout) clearTimeout(urlSyncTimeout);
      urlSyncTimeout = setTimeout(() => {
        applyConnectionUrl(connectionUrl.value, { force });
      }, 200);
    };

    connectionUrl.addEventListener('input', () => scheduleUrlSync(false));
    connectionUrl.addEventListener('change', () => scheduleUrlSync(true));
    connectionUrl.addEventListener('blur', () => applyConnectionUrl(connectionUrl.value, { force: true }));
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

  if (sqliteModeCreate) {
    sqliteModeCreate.addEventListener('change', () => {
      if (sqliteModeCreate.checked && sqlitePath) sqlitePath.value = '';
    });
  }

  if (sqliteModeExisting) {
    sqliteModeExisting.addEventListener('change', () => {
      if (sqliteModeExisting.checked && sqlitePath) sqlitePath.value = '';
    });
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => {
      resetForm();
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      setEditMode(false);
      resetForm();
    });
  }

  if (sqliteBrowseBtn) {
    sqliteBrowseBtn.addEventListener('click', async () => {
      try {
        if (!dialogsApi.openSqliteFile || !dialogsApi.saveSqliteFile) {
          if (onError) onError('SQLite file picker not available.');
          return;
        }

        const mode = sqliteModeExisting && sqliteModeExisting.checked
          ? 'existing'
          : 'create';
        const res =
          mode === 'existing'
            ? await dialogsApi.openSqliteFile()
            : await dialogsApi.saveSqliteFile();
        if (!res || !res.ok) {
          if (!res || !res.canceled) {
            if (onError) {
              onError(res?.error || 'Failed to choose SQLite file.');
            }
          }
          return;
        }
        if (sqlitePath) sqlitePath.value = res.path || '';
      } catch (err) {
        console.error('Failed to open SQLite file dialog', err);
        if (onError) onError(err?.message || 'Failed to choose SQLite file.');
      }
    });
  }

  return {
    open,
    close,
    setMode,
    setEditMode,
    setLoading,
    setActiveTab,
    setSettingsTab,
    setConnectionUrlPlaceholder,
    syncTypeFields,
    getFormData,
    setFormData,
    resetForm,
    getMode: () => activeMode,
    getActiveTab: () => activeTab,
  };
}
