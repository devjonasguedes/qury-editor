import {
  buildConnectionKey,
  connectionTitle,
  getEntrySshConfig,
  isEntryReadOnly,
  isEntrySsh,
  makeRecentKey
} from './renderer/connectionUtils.js';
import { readJson, writeJson } from './renderer/storage.js';
import { createTreeView } from './modules/treeView.js';
import { createTabConnections } from './modules/tabConnections.js';

const RECENT_KEY = 'sqlEditor.recentConnections';
const THEME_KEY = 'sqlEditor.theme';

export function initHome({ api }) {
  const byId = (id) => document.getElementById(id);

  const dbType = byId('dbType');
  const host = byId('host');
  const port = byId('port');
  const user = byId('user');
  const password = byId('password');
  const database = byId('database');
  const saveName = byId('saveName');
  const readOnly = byId('readOnly');
  const tabDirectBtn = byId('tabDirectBtn');
  const tabSshBtn = byId('tabSshBtn');
  const sshHost = byId('sshHost');
  const sshPort = byId('sshPort');
  const sshUser = byId('sshUser');
  const sshPassword = byId('sshPassword');
  const sshPrivateKey = byId('sshPrivateKey');
  const sshPassphrase = byId('sshPassphrase');
  const sshLocalPort = byId('sshLocalPort');
  const sshFields = byId('sshFields');
  const connectBtn = byId('connectBtn');
  const saveBtn = byId('saveBtn');
  const testBtn = byId('testBtn');
  const clearFormBtn = byId('clearFormBtn');
  const cancelEditBtn = byId('cancelEditBtn');
  const savedList = byId('savedList');
  const recentList = byId('recentList');
  const mainScreen = byId('mainScreen');
  const welcomeScreen = byId('welcomeScreen');
  const connectSpinner = byId('connectSpinner');
  const tabConnections = byId('tabConnections');
  const openConnectModalBtn = byId('openConnectModalBtn');
  const quickConnectBtn = byId('quickConnectBtn');
  const closeConnectModalBtn = byId('closeConnectModalBtn');
  const homeBtn = byId('homeBtn');
  const connectModal = byId('connectModal');
  const connectModalBackdrop = byId('connectModalBackdrop');
  const connectModalTitle = byId('connectModalTitle');
  const connectModalSubtitle = byId('connectModalSubtitle');
  const themeToggle = byId('themeToggle');
  const sidebarTreeBtn = byId('sidebarTreeBtn');
  const sidebarHistoryBtn = byId('sidebarHistoryBtn');
  const sidebarSnippetsBtn = byId('sidebarSnippetsBtn');
  const tablePanel = byId('tablePanel');
  const historyPanel = byId('historyPanel');
  const snippetsPanel = byId('snippetsPanel');
  const tableList = byId('tableList');
  const tableSearch = byId('tableSearch');
  const tableSearchClear = byId('tableSearchClear');
  const sidebarShell = byId('sidebarShell');
  const dbSelect = byId('dbSelect');
  const sidebarResizer = byId('sidebarResizer');
  const editorResizer = byId('editorResizer');
  const sidebar = document.querySelector('.tables');
  const editorPanel = document.querySelector('.editor');
  const resultsPanel = byId('resultsPanel');
  let globalLoading = byId('globalLoading');

  let isConnecting = false;
  let isEditingConnection = false;
  let treeView = null;
  let tabConnectionsView = null;

  const safeApi = api || {};

  const ensureGlobalLoading = () => {
    if (globalLoading) return globalLoading;
    const overlay = document.createElement('div');
    overlay.id = 'globalLoading';
    overlay.className = 'global-loading hidden';
    const card = document.createElement('div');
    card.className = 'global-loading-card';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    const label = document.createElement('span');
    label.textContent = 'Conectando...';
    card.appendChild(spinner);
    card.appendChild(label);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    globalLoading = overlay;
    return overlay;
  };

  const setGlobalLoading = (loading, labelText) => {
    const overlay = ensureGlobalLoading();
    if (overlay) {
      const label = overlay.querySelector('span:last-child');
      if (label && labelText) label.textContent = labelText;
      overlay.classList.toggle('hidden', !loading);
    }
  };

  const applyTheme = (theme) => {
    const next = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', next === 'light');
    localStorage.setItem(THEME_KEY, next);
    if (themeToggle) {
      themeToggle.innerHTML =
        next === 'light' ? '<i class=\"bi bi-moon\"></i>' : '<i class=\"bi bi-sun\"></i>';
      themeToggle.title =
        next === 'light' ? 'Alternar para tema escuro' : 'Alternar para tema claro';
    }
  };

  const toggleTheme = () => {
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  };


  const setEditMode = (enabled) => {
    isEditingConnection = enabled;
    if (cancelEditBtn) cancelEditBtn.classList.toggle('hidden', !enabled);
  };

  const setConnectTab = (tab) => {
    const isSsh = tab === 'ssh';
    if (tabDirectBtn) tabDirectBtn.classList.toggle('active', !isSsh);
    if (tabSshBtn) tabSshBtn.classList.toggle('active', isSsh);
    if (sshFields) sshFields.classList.toggle('hidden', !isSsh);
  };

  const resetConnectionForm = () => {
    if (dbType) dbType.value = 'mysql';
    if (host) host.value = 'localhost';
    if (port) port.value = '';
    if (user) user.value = '';
    if (password) password.value = '';
    if (database) database.value = '';
    if (saveName) saveName.value = '';
    if (readOnly) readOnly.checked = false;
    setConnectTab('direct');
    if (sshHost) sshHost.value = '';
    if (sshPort) sshPort.value = '';
    if (sshUser) sshUser.value = '';
    if (sshPassword) sshPassword.value = '';
    if (sshPrivateKey) sshPrivateKey.value = '';
    if (sshPassphrase) sshPassphrase.value = '';
    if (sshLocalPort) sshLocalPort.value = '';
  };

  const setConnectMode = (mode) => {
    const panel = connectModal ? connectModal.querySelector('.connect-panel') : null;
    if (panel) panel.classList.toggle('quick', mode === 'quick');
    if (connectModalTitle) {
      connectModalTitle.textContent = mode === 'quick' ? 'Conexao rapida' : 'Nova conexao';
    }
    if (connectModalSubtitle) {
      connectModalSubtitle.textContent =
        mode === 'quick'
          ? 'Conecte sem salvar a conexao.'
          : 'Preencha os dados para conectar ao banco.';
    }
    if (connectBtn) {
      connectBtn.textContent = mode === 'quick' ? 'Conectar rapido' : 'Conectar';
    }
  };

  const openConnectModal = ({ keepForm = false, mode = 'full' } = {}) => {
    if (!connectModal) return;
    if (!keepForm) {
      resetConnectionForm();
      setEditMode(false);
    }
    if (mode === 'quick' && saveName) {
      saveName.value = '';
      setEditMode(false);
    }
    setConnectMode(mode);
    connectModal.classList.remove('hidden');
  };

  const closeConnectModal = () => {
    if (!connectModal) return;
    connectModal.classList.add('hidden');
    setEditMode(false);
    setConnectMode('full');
  };

  const setScreen = (connected) => {
    if (mainScreen) mainScreen.classList.remove('hidden');
    if (welcomeScreen) welcomeScreen.classList.toggle('hidden', connected);
    if (sidebarShell) sidebarShell.classList.toggle('hidden', !connected);
    if (dbSelect) dbSelect.classList.toggle('hidden', !connected);
    if (sidebar) sidebar.classList.toggle('hidden', !connected);
    if (sidebarResizer) sidebarResizer.classList.toggle('hidden', !connected);
    if (editorResizer) editorResizer.classList.toggle('hidden', !connected);
    if (editorPanel) editorPanel.classList.toggle('hidden', !connected);
    if (resultsPanel) resultsPanel.classList.toggle('hidden', !connected);
    if (!connected) closeConnectModal();
    if (homeBtn) {
      homeBtn.classList.toggle(
        'hidden',
        !tabConnectionsView || tabConnectionsView.size() === 0
      );
    }
    if (connected) setSidebarView('tree');
  };

  const setSidebarView = (view) => {
    const next = view === 'history' ? 'history' : view === 'snippets' ? 'snippets' : 'tree';
    if (tablePanel) tablePanel.classList.toggle('hidden', next !== 'tree');
    if (historyPanel) historyPanel.classList.toggle('hidden', next !== 'history');
    if (snippetsPanel) snippetsPanel.classList.toggle('hidden', next !== 'snippets');
    if (sidebarTreeBtn) sidebarTreeBtn.classList.toggle('active', next === 'tree');
    if (sidebarHistoryBtn) sidebarHistoryBtn.classList.toggle('active', next === 'history');
    if (sidebarSnippetsBtn) sidebarSnippetsBtn.classList.toggle('active', next === 'snippets');
  };

  const renderConnectionTabs = () => {
    if (!tabConnectionsView) return;
    tabConnectionsView.render();
    if (homeBtn) {
      homeBtn.classList.toggle('hidden', tabConnectionsView.size() === 0);
    }
  };

  const upsertConnectionTab = (entry) => {
    if (!entry || !tabConnectionsView) return;
    const key = buildConnectionKey(entry);
    tabConnectionsView.upsert(key, entry);
    renderConnectionTabs();
  };

  const configFromEntry = (entry) => ({
    type: entry.type,
    host: entry.host || 'localhost',
    port: entry.port || undefined,
    user: entry.user || '',
    password: entry.password || '',
    database: entry.database || '',
    readOnly: isEntryReadOnly(entry),
    ssh: getEntrySshConfig(entry)
  });

  const activateConnection = async (entry) => {
    const key = buildConnectionKey(entry);
    setScreen(true);
    if (tabConnectionsView) tabConnectionsView.setActive(key);

    const res = await connectWithLoading(configFromEntry(entry));
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao conectar.');
      return false;
    }
    if (treeView) treeView.setActiveSchema(entry.database || '');
    if (treeView) await treeView.refresh();
    return true;
  };

  const tryActivateExistingConnection = async (entry) => {
    if (!entry) return false;
    const key = buildConnectionKey(entry);
    if (!tabConnectionsView || !tabConnectionsView.has(key)) return false;
    const ok = await activateConnection(entry);
    if (ok) closeConnectModal();
    return ok;
  };

  const isSshTabActive = () => {
    if (!tabSshBtn) return false;
    return tabSshBtn.classList.contains('active');
  };

  const buildSshConfig = () => {
    const enabled = isSshTabActive();
    if (!enabled) return { enabled: false };
    return {
      enabled: true,
      host: sshHost ? sshHost.value.trim() : '',
      port: sshPort ? sshPort.value.trim() : '',
      user: sshUser ? sshUser.value.trim() : '',
      password: sshPassword ? sshPassword.value : '',
      privateKey: sshPrivateKey ? sshPrivateKey.value : '',
      passphrase: sshPassphrase ? sshPassphrase.value : '',
      localPort: sshLocalPort ? sshLocalPort.value.trim() : ''
    };
  };

  const setConnecting = (loading) => {
    isConnecting = loading;
    if (connectSpinner) connectSpinner.classList.toggle('hidden', !loading);
    if (connectBtn) connectBtn.disabled = loading;
    if (saveBtn) saveBtn.disabled = loading;
    if (testBtn) testBtn.disabled = loading;
    if (clearFormBtn) clearFormBtn.disabled = loading;
    if (cancelEditBtn) cancelEditBtn.disabled = loading;
    if (openConnectModalBtn) openConnectModalBtn.disabled = loading;
    if (quickConnectBtn) quickConnectBtn.disabled = loading;
    if (savedList) savedList.classList.toggle('is-connecting', loading);
    if (recentList) recentList.classList.toggle('is-connecting', loading);
    if (connectModal) connectModal.classList.toggle('is-connecting', loading);
  };

  const connectWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: 'Conexao em andamento.' };
    setConnecting(true);
    setGlobalLoading(true, 'Conectando...');
    try {
      return await safeApi.connect(config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Erro ao conectar.' };
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const testConnectionWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: 'Conexao em andamento.' };
    setConnecting(true);
    try {
      return await safeApi.testConnection(config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Erro ao testar conexao.' };
    } finally {
      setConnecting(false);
    }
  };

  const readRecentConnections = () => {
    const parsed = readJson(RECENT_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  };

  const writeRecentConnections = (list) => {
    writeJson(RECENT_KEY, list);
  };

  const recordRecentConnection = (entry) => {
    if (!entry) return;
    const list = readRecentConnections();
    const key = makeRecentKey(entry);
    const next = list.filter((item) => makeRecentKey(item) !== key);
    next.unshift({
      name: entry.name || '',
      type: entry.type,
      host: entry.host || 'localhost',
      port: entry.port || '',
      user: entry.user || '',
      password: entry.password || '',
      database: entry.database || '',
      readOnly: isEntryReadOnly(entry),
      ssh: getEntrySshConfig(entry),
      lastUsed: Date.now()
    });
    writeRecentConnections(next.slice(0, 8));
    renderRecentList();
  };

  const removeRecentConnection = (entry) => {
    if (!entry) return;
    const list = readRecentConnections();
    const key = makeRecentKey(entry);
    const next = list.filter((item) => makeRecentKey(item) !== key);
    writeRecentConnections(next);
    renderRecentList();
  };

  const renderRecentList = () => {
    if (!recentList) return;
    const list = readRecentConnections();
    recentList.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Nenhuma conexao recente.';
      recentList.appendChild(empty);
      return;
    }
    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'saved-item';

      const info = document.createElement('div');
      info.className = 'saved-info';

      const title = document.createElement('div');
      title.className = 'saved-title';
      title.textContent = entry.name || entry.database || entry.host || 'Conexao';

      const meta = document.createElement('div');
      meta.className = 'saved-meta';
      const roTag = isEntryReadOnly(entry) ? ' • RO' : '';
      const sshTag = isEntrySsh(entry) ? ' • SSH' : '';
      meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}${roTag}${sshTag}`;

      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'saved-actions';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'icon-btn';
      removeBtn.innerHTML = '<i class="bi bi-x"></i>';
      removeBtn.title = 'Remover da lista';
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        removeRecentConnection(entry);
      });

      actions.appendChild(removeBtn);
      item.appendChild(actions);

      info.addEventListener('click', async () => {
        if (isConnecting) return;
        if (await tryActivateExistingConnection(entry)) return;
        const res = await connectWithLoading(configFromEntry(entry));

        if (!res.ok) {
          await safeApi.showError(res.error || 'Erro ao conectar.');
          return;
        }
        recordRecentConnection(entry);
        upsertConnectionTab(entry);
        if (treeView) treeView.setActiveSchema(entry.database || '');
        if (treeView) await treeView.refresh();
        setScreen(true);
        closeConnectModal();
      });

      recentList.appendChild(item);
    });
  };

  const renderSavedList = async () => {
    if (!savedList) return;
    const list = await safeApi.listSavedConnections();
    savedList.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Nenhuma conexao salva.';
      savedList.appendChild(empty);
      return;
    }
    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'saved-item';

      const info = document.createElement('div');
      info.className = 'saved-info';

      const title = document.createElement('div');
      title.className = 'saved-title';
      title.textContent = entry.name || connectionTitle(entry);

      const meta = document.createElement('div');
      meta.className = 'saved-meta';
      const roTag = isEntryReadOnly(entry) ? ' • RO' : '';
      const sshTag = isEntrySsh(entry) ? ' • SSH' : '';
      meta.textContent = `${entry.type} • ${entry.host}:${entry.port || ''}${entry.database ? ` • ${entry.database}` : ''}${roTag}${sshTag}`;

      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'saved-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editBtn.title = 'Editar';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.title = 'Excluir';

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      info.addEventListener('click', async () => {
        if (isConnecting) return;
        if (await tryActivateExistingConnection(entry)) return;
        const res = await connectWithLoading(configFromEntry(entry));

        if (!res.ok) {
          await safeApi.showError(res.error || 'Erro ao conectar.');
          return;
        }
        recordRecentConnection(entry);
        upsertConnectionTab(entry);
        if (treeView) treeView.setActiveSchema(entry.database || '');
        if (treeView) await treeView.refresh();
        setScreen(true);
        closeConnectModal();
      });

      editBtn.addEventListener('click', () => {
        if (dbType) dbType.value = entry.type;
        if (host) host.value = entry.host;
        if (port) port.value = entry.port || '';
        if (user) user.value = entry.user || '';
        if (password) password.value = entry.password || '';
        if (database) database.value = entry.database || '';
        if (saveName) saveName.value = entry.name || '';
        if (readOnly) readOnly.checked = isEntryReadOnly(entry);
        const ssh = getEntrySshConfig(entry);
        setConnectTab(ssh.enabled ? 'ssh' : 'direct');
        if (sshHost) sshHost.value = ssh.host || '';
        if (sshPort) sshPort.value = ssh.port || '';
        if (sshUser) sshUser.value = ssh.user || '';
        if (sshPassword) sshPassword.value = ssh.password || '';
        if (sshPrivateKey) sshPrivateKey.value = ssh.privateKey || '';
        if (sshPassphrase) sshPassphrase.value = ssh.passphrase || '';
        if (sshLocalPort) sshLocalPort.value = ssh.localPort || '';
        setEditMode(true);
        openConnectModal({ keepForm: true, mode: 'full' });
      });

      deleteBtn.addEventListener('click', async () => {
        const name = entry.name || connectionTitle(entry);
        const confirmed = confirm(`Remover conexao "${name}"?`);
        if (!confirmed) return;
        await safeApi.deleteConnection(entry.name);
        await renderSavedList();
      });

      savedList.appendChild(item);
    });
  };

  const connectFromForm = async () => {
    const config = {
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || undefined : undefined,
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      ssh: buildSshConfig()
    };

    if (await tryActivateExistingConnection(config)) return;

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao conectar.');
      return;
    }
    recordRecentConnection(config);
    upsertConnectionTab(config);
    if (treeView) treeView.setActiveSchema(config.database || '');
    if (treeView) await treeView.refresh();
    setScreen(true);
    closeConnectModal();
  };

  const saveConnection = async () => {
    if (!saveName || !saveName.value.trim()) {
      await safeApi.showError('Informe um nome para salvar.');
      return;
    }

    const entry = {
      name: saveName.value.trim(),
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || '' : '',
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      ssh: buildSshConfig()
    };

    const res = await testConnectionWithLoading({
      type: entry.type,
      host: entry.host,
      port: entry.port || undefined,
      user: entry.user,
      password: entry.password,
      database: entry.database,
      readOnly: entry.readOnly,
      ssh: entry.ssh
    });
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao testar conexao.');
      return;
    }
    await safeApi.saveConnection(entry);
    setEditMode(false);
    await renderSavedList();
    closeConnectModal();
  };

  const testConnection = async () => {
    const config = {
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || undefined : undefined,
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      ssh: buildSshConfig()
    };

    const res = await testConnectionWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Erro ao testar conexao.');
      return;
    }
    alert('Conexao OK.');
  };

  if (tabDirectBtn) {
    tabDirectBtn.addEventListener('click', () => setConnectTab('direct'));
  }
  if (tabSshBtn) {
    tabSshBtn.addEventListener('click', () => setConnectTab('ssh'));
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      setScreen(false);
      if (tabConnectionsView) tabConnectionsView.clearActive();
      renderConnectionTabs();
      renderRecentList();
      renderSavedList();
    });
  }

  if (openConnectModalBtn) {
    openConnectModalBtn.addEventListener('click', () => openConnectModal({ mode: 'full' }));
  }

  if (quickConnectBtn) {
    quickConnectBtn.addEventListener('click', () => openConnectModal({ mode: 'quick' }));
  }

  if (closeConnectModalBtn) {
    closeConnectModalBtn.addEventListener('click', () => closeConnectModal());
  }

  if (connectModalBackdrop) {
    connectModalBackdrop.addEventListener('click', () => closeConnectModal());
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => connectFromForm());
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveConnection());
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => testConnection());
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => resetConnectionForm());
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      setEditMode(false);
      resetConnectionForm();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => toggleTheme());
  }

  if (sidebarTreeBtn) {
    sidebarTreeBtn.addEventListener('click', () => setSidebarView('tree'));
  }
  if (sidebarHistoryBtn) {
    sidebarHistoryBtn.addEventListener('click', () => setSidebarView('history'));
  }
  if (sidebarSnippetsBtn) {
    sidebarSnippetsBtn.addEventListener('click', () => setSidebarView('snippets'));
  }

  setScreen(false);
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  treeView = createTreeView({
    api: safeApi,
    tableList,
    tableSearch,
    tableSearchClear
  });
  tabConnectionsView = createTabConnections({
    container: tabConnections,
    getTitle: (entry) => connectionTitle(entry),
    onSelect: (_key, entry) => {
      activateConnection(entry);
    },
    onClose: async (key, entry) => {
      if (!tabConnectionsView) return;
      const wasActive = tabConnectionsView.getActiveKey() === key;
      tabConnectionsView.remove(key);
      renderConnectionTabs();
      if (tabConnectionsView.size() === 0) {
        setScreen(false);
        return;
      }
      if (wasActive) {
        const next = tabConnectionsView.getFirstEntry();
        if (next) {
          await activateConnection(next);
        }
      }
    }
  });
  renderSavedList();
  renderRecentList();
}
