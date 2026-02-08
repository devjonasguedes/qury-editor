import { format as formatSql } from 'sql-formatter';

import {
  buildConnectionBaseKey,
  connectionTitle,
  getEntrySshConfig,
  getEntryPolicyMode,
  isEntryReadOnly,
  isEntrySsh
} from './modules/connectionUtils.js';
import { readJson, writeJson } from './modules/storage.js';
import { createTreeView } from './modules/treeView.js';
import { createTabConnections } from './modules/tabConnections.js';
import { createTabTables } from './modules/tabTables.js';
import { createCodeEditor } from './modules/codeEditor.js';
import { createTableView } from './modules/tableView.js';
import { createTableObjectTabs } from './modules/tableObjectTabs.js';
import { createQueryHistory } from './modules/queryHistory.js';
import { createSnippetsManager } from './modules/snippets.js';
import { createSqlAutocomplete } from './modules/sqlAutocomplete.js';
import {
  firstDmlKeyword,
  insertWhere,
  isDangerousStatement,
  splitStatements,
  splitStatementsWithRanges,
  stripLeadingComments
} from './sql.js';

const THEME_KEY = 'sqlEditor.theme';
const THEME_MODE_SYSTEM = 'system';
const THEME_MODE_LIGHT = 'light';
const THEME_MODE_DARK = 'dark';
const SIDEBAR_KEY = 'sqlEditor.sidebarWidth';
const EDITOR_HEIGHT_KEY = 'sqlEditor.editorHeight';
const EDITOR_FONT_SIZE_KEY = 'sqlEditor.editorFontSize';
const EDITOR_COLLAPSED_KEY_PREFIX = 'sqlEditor.editorCollapsed';
const QUERY_DEFAULT_LIMIT_KEY = 'sqlEditor.defaultLimit';
const QUERY_DEFAULT_TIMEOUT_KEY = 'sqlEditor.defaultTimeout';
const QUERY_DEFAULTS = Object.freeze({
  limit: '100',
  timeoutMs: '30000'
});
const QUERY_PROGRESS_SHOW_DELAY_MS = 5000;
const POLICY_MODE_DEV = 'dev';
const POLICY_MODE_STAGING = 'staging';
const POLICY_MODE_PROD = 'prod';
const POLICY_APPROVAL_TOKEN = 'PROCEED';
const ENVIRONMENT_POLICY_DEFAULTS = Object.freeze({
  [POLICY_MODE_DEV]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: true,
    requireApproval: false
  }),
  [POLICY_MODE_STAGING]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: false,
    requireApproval: true
  }),
  [POLICY_MODE_PROD]: Object.freeze({
    allowWrite: false,
    allowDdlAdmin: false,
    requireApproval: false
  })
});
const POLICY_WRITE_KEYWORDS = new Set([
  'insert',
  'update',
  'delete',
  'merge',
  'upsert',
  'replace',
  'copy'
]);
const POLICY_DDL_ADMIN_KEYWORDS = new Set([
  'create',
  'alter',
  'drop',
  'truncate',
  'rename',
  'comment',
  'grant',
  'revoke',
  'call',
  'do',
  'refresh',
  'reindex',
  'cluster',
  'vacuum',
  'analyze'
]);

export function initHome({ api }) {
  const byId = (id) => document.getElementById(id);

  const dbType = byId('dbType');
  const host = byId('host');
  const port = byId('port');
  const user = byId('user');
  const password = byId('password');
  const database = byId('database');
  const saveName = byId('saveName');
  const rememberPassword = byId('rememberPassword');
  const readOnly = byId('readOnly');
  const policyMode = byId('policyMode');
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
  const savedPolicyFilters = byId('savedPolicyFilters');
  const importConnectionsBtn = byId('importConnectionsBtn');
  const exportConnectionsBtn = byId('exportConnectionsBtn');
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
  const credentialModal = byId('credentialModal');
  const credentialModalBackdrop = byId('credentialModalBackdrop');
  const credentialModalTitle = byId('credentialModalTitle');
  const credentialModalSubtitle = byId('credentialModalSubtitle');
  const credentialDbPassword = byId('credentialDbPassword');
  const credentialSshFields = byId('credentialSshFields');
  const credentialSshPassword = byId('credentialSshPassword');
  const credentialSshPrivateKey = byId('credentialSshPrivateKey');
  const credentialSshPassphrase = byId('credentialSshPassphrase');
  const credentialCloseBtn = byId('credentialCloseBtn');
  const credentialCancelBtn = byId('credentialCancelBtn');
  const credentialConfirmBtn = byId('credentialConfirmBtn');
  const policyApprovalModal = byId('policyApprovalModal');
  const policyApprovalModalBackdrop = byId('policyApprovalModalBackdrop');
  const policyApprovalTitle = byId('policyApprovalTitle');
  const policyApprovalSubtitle = byId('policyApprovalSubtitle');
  const policyApprovalInput = byId('policyApprovalInput');
  const policyApprovalCloseBtn = byId('policyApprovalCloseBtn');
  const policyApprovalCancelBtn = byId('policyApprovalCancelBtn');
  const policyApprovalConfirmBtn = byId('policyApprovalConfirmBtn');
  const themeToggle = byId('themeToggle');
  const themeMenu = byId('themeMenu');
  const openSettingsBtn = byId('openSettingsBtn');
  const sidebarTreeBtn = byId('sidebarTreeBtn');
  const sidebarHistoryBtn = byId('sidebarHistoryBtn');
  const sidebarSnippetsBtn = byId('sidebarSnippetsBtn');
  const tablePanel = byId('tablePanel');
  const historyPanel = byId('historyPanel');
  const historyList = byId('historyList');
  const snippetsPanel = byId('snippetsPanel');
  const snippetsList = byId('snippetsList');
  const addSnippetBtn = byId('addSnippetBtn');
  const snippetModal = byId('snippetModal');
  const snippetModalBackdrop = byId('snippetModalBackdrop');
  const snippetCloseBtn = byId('snippetCloseBtn');
  const snippetCancelBtn = byId('snippetCancelBtn');
  const snippetSaveBtn = byId('snippetSaveBtn');
  const snippetNameInput = byId('snippetNameInput');
  const snippetQueryInput = byId('snippetQueryInput');
  const tableList = byId('tableList');
  const tableSearch = byId('tableSearch');
  const tableSearchModeBtn = byId('tableSearchModeBtn');
  const tableSearchClear = byId('tableSearchClear');
  const sidebarShell = byId('sidebarShell');
  const dbSelect = byId('dbSelect');
  const sidebarResizer = byId('sidebarResizer');
  const editorResizer = byId('editorResizer');
  const sidebar = document.querySelector('.tables');
  const editorPanel = document.querySelector('.editor');
  const editorBody = document.querySelector('.editor-body');
  const mainLayout = document.querySelector('.main');
  const workspace = document.querySelector('.workspace');
  const resultsPanel = byId('resultsPanel');
  const tableObjectTabs = byId('tableObjectTabs');
  const objectDetailsPanel = byId('objectDetailsPanel');
  const resultsTableWrap = byId('resultsTableWrap');
  const resultsEmptyState = byId('resultsEmptyState');
  const resultsTable = byId('resultsTable');
  const queryStatus = byId('queryStatus');
  const queryOutputBtn = byId('queryOutputBtn');
  const queryOutputPreview = byId('queryOutputPreview');
  const tableActionsBar = byId('tableActionsBar');
  const copyCellBtn = byId('copyCellBtn');
  const copyRowBtn = byId('copyRowBtn');
  const exportCsvBtn = byId('exportCsvBtn');
  const exportJsonBtn = byId('exportJsonBtn');
  const refreshSchemaBtn = byId('refreshSchemaBtn');
  const tabBar = byId('tabBar');
  const newTabBtn = byId('newTabBtn');
  const query = byId('query');
  const runBtn = byId('runBtn');
  const runSelectionBtn = byId('runSelectionBtn');
  const runCurrentBtn = byId('runCurrentBtn');
  const formatBtn = byId('formatBtn');
  const zoomOutBtn = byId('zoomOutBtn');
  const zoomInBtn = byId('zoomInBtn');
  const explainBtn = byId('explainBtn');
  const stopBtn = byId('stopBtn');
  const limitSelect = byId('limitSelect');
  const timeoutSelect = byId('timeoutSelect');
  const toggleEditorBtn = byId('toggleEditorBtn');
  const saveSnippetEditorBtn = byId('saveSnippetEditorBtn');
  const countBtn = byId('countBtn');
  const queryFilter = byId('queryFilter');
  const queryFilterClear = byId('queryFilterClear');
  const applyFilterBtn = byId('applyFilterBtn');
  let globalLoading = byId('globalLoading');

  const outputModal = byId('outputModal');
  const outputModalBackdrop = byId('outputModalBackdrop');
  const outputLogBody = byId('outputLogBody');
  const outputModalSubtitle = byId('outputModalSubtitle');
  const outputCloseBtn = byId('outputCloseBtn');
  const outputCloseBtnBottom = byId('outputCloseBtnBottom');
  const outputCopyBtn = byId('outputCopyBtn');
  const toast = byId('toast');
  const definitionModal = byId('definitionModal');
  const definitionModalBackdrop = byId('definitionModalBackdrop');
  const definitionCloseBtn = byId('definitionCloseBtn');
  const definitionTitle = byId('definitionTitle');
  const definitionSubtitle = byId('definitionSubtitle');
  const definitionFormatBtn = byId('definitionFormatBtn');
  const definitionCopyBtn = byId('definitionCopyBtn');
  const definitionQueryInput = byId('definitionQueryInput');
  const settingsModal = byId('settingsModal');
  const settingsModalBackdrop = byId('settingsModalBackdrop');
  const settingsCloseBtn = byId('settingsCloseBtn');
  const settingsCancelBtn = byId('settingsCancelBtn');
  const settingsSaveBtn = byId('settingsSaveBtn');
  const settingsResetDefaultsBtn = byId('settingsResetDefaultsBtn');
  const settingsTabs = byId('settingsTabs');
  const settingsPanelGeneral = byId('settingsPanelGeneral');
  const settingsPanelEnvironments = byId('settingsPanelEnvironments');
  const settingsDefaultLimit = byId('settingsDefaultLimit');
  const settingsDefaultTimeout = byId('settingsDefaultTimeout');
  const envPolicyDevAllowWrite = byId('envPolicyDevAllowWrite');
  const envPolicyDevAllowDdl = byId('envPolicyDevAllowDdl');
  const envPolicyDevRequireApproval = byId('envPolicyDevRequireApproval');
  const envPolicyStagingAllowWrite = byId('envPolicyStagingAllowWrite');
  const envPolicyStagingAllowDdl = byId('envPolicyStagingAllowDdl');
  const envPolicyStagingRequireApproval = byId('envPolicyStagingRequireApproval');
  const envPolicyProdAllowWrite = byId('envPolicyProdAllowWrite');
  const envPolicyProdAllowDdl = byId('envPolicyProdAllowDdl');
  const envPolicyProdRequireApproval = byId('envPolicyProdRequireApproval');

  let isConnecting = false;
  let isEditingConnection = false;
  let treeView = null;
  let tabConnectionsView = null;
  let tabTablesView = null;
  let codeEditor = null;
  let snippetEditor = null;
  let definitionEditor = null;
  let tableView = null;
  let tableObjectTabsView = null;
  let lastSort = null;
  let resultsByTabId = new Map();
  let objectContextByTabId = new Map();
  let outputByTabId = new Map();
  let currentOutput = null;
  let historyManager = null;
  let snippetsManager = null;
  let sqlAutocomplete = null;
  let queryProgressTimer = null;
  let queryProgressRevealTimer = null;
  let queryProgressStartedAt = 0;
  let editingConnectionSeed = null;
  let environmentPolicyRules = null;
  let activeSettingsTab = 'general';
  let removeNativeThemeListener = null;
  let currentThemeMode = THEME_MODE_SYSTEM;
  let systemPrefersDark = true;
  const DEFAULT_EDITOR_FONT_SIZE = 14;
  const MIN_EDITOR_FONT_SIZE = 12;
  const MAX_EDITOR_FONT_SIZE = 16;
  let credentialPromptResolver = null;
  let policyApprovalPromptResolver = null;

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
    label.textContent = 'Connecting...';
    card.appendChild(spinner);
    card.appendChild(label);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    globalLoading = overlay;
    return overlay;
  };

  let toastTimer = null;
  const showToast = (message, duration = 1600) => {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 200);
    }, duration);
  };

  const setGlobalLoading = (loading, labelText) => {
    const overlay = ensureGlobalLoading();
    if (overlay) {
      const label = overlay.querySelector('span:last-child');
      if (label && labelText) label.textContent = labelText;
      overlay.classList.toggle('hidden', !loading);
    }
  };

  const normalizeThemeMode = (value) => {
    const mode = String(value || '').toLowerCase();
    if (mode === THEME_MODE_LIGHT || mode === THEME_MODE_DARK || mode === THEME_MODE_SYSTEM) {
      return mode;
    }
    return THEME_MODE_SYSTEM;
  };

  const resolveThemeFromMode = (mode) => {
    if (mode === THEME_MODE_LIGHT) return THEME_MODE_LIGHT;
    if (mode === THEME_MODE_DARK) return THEME_MODE_DARK;
    return systemPrefersDark ? THEME_MODE_DARK : THEME_MODE_LIGHT;
  };

  const themeModeLabel = (mode) => {
    if (mode === THEME_MODE_LIGHT) return 'Claro';
    if (mode === THEME_MODE_DARK) return 'Escuro';
    return 'Sistema';
  };

  const themeModeIcon = (mode) => {
    if (mode === THEME_MODE_LIGHT) return 'bi-sun';
    if (mode === THEME_MODE_DARK) return 'bi-moon-stars';
    return 'bi-circle-half';
  };

  const applyTheme = (theme) => {
    const next = theme === THEME_MODE_LIGHT ? THEME_MODE_LIGHT : THEME_MODE_DARK;
    document.body.classList.toggle('theme-light', next === 'light');
    if (codeEditor && typeof codeEditor.setTheme === 'function') {
      codeEditor.setTheme();
      codeEditor.refresh();
    }
    if (snippetEditor && typeof snippetEditor.setTheme === 'function') {
      snippetEditor.setTheme();
      snippetEditor.refresh();
    }
  };

  const updateThemeUi = () => {
    if (themeToggle) {
      themeToggle.innerHTML = `<i class="bi ${themeModeIcon(currentThemeMode)}"></i>`;
      themeToggle.title = `Tema: ${themeModeLabel(currentThemeMode)}`;
      themeToggle.setAttribute('aria-label', `Tema: ${themeModeLabel(currentThemeMode)}`);
    }
    if (themeMenu) {
      const items = themeMenu.querySelectorAll('[data-theme-mode]');
      items.forEach((item) => {
        const selected = item.getAttribute('data-theme-mode') === currentThemeMode;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-checked', selected ? 'true' : 'false');
      });
    }
  };

  const setThemeMode = (mode, { persist = true } = {}) => {
    currentThemeMode = normalizeThemeMode(mode);
    if (persist) {
      localStorage.setItem(THEME_KEY, currentThemeMode);
    }
    applyTheme(resolveThemeFromMode(currentThemeMode));
    updateThemeUi();
  };

  const setThemeMenuOpen = (open) => {
    if (!themeMenu || !themeToggle) return;
    themeMenu.classList.toggle('hidden', !open);
    themeToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const applySystemThemeSnapshot = (payload) => {
    if (!payload || typeof payload.shouldUseDarkColors !== 'boolean') return;
    systemPrefersDark = !!payload.shouldUseDarkColors;
    if (currentThemeMode === THEME_MODE_SYSTEM) {
      applyTheme(resolveThemeFromMode(THEME_MODE_SYSTEM));
      updateThemeUi();
    }
  };

  const loadThemeMode = async () => {
    currentThemeMode = normalizeThemeMode(localStorage.getItem(THEME_KEY));
    if (!safeApi.getNativeTheme) {
      setThemeMode(currentThemeMode, { persist: false });
      return;
    }
    try {
      const res = await safeApi.getNativeTheme();
      if (res && res.ok && typeof res.shouldUseDarkColors === 'boolean') {
        systemPrefersDark = !!res.shouldUseDarkColors;
      }
    } catch (_) {
      // Keep default when system theme cannot be resolved.
    }
    setThemeMode(currentThemeMode, { persist: false });
  };

  const cloneEnvironmentPolicyRules = (input) => {
    const source = input || ENVIRONMENT_POLICY_DEFAULTS;
    return {
      [POLICY_MODE_DEV]: {
        ...(source[POLICY_MODE_DEV] || ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV])
      },
      [POLICY_MODE_STAGING]: {
        ...(source[POLICY_MODE_STAGING] || ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_STAGING])
      },
      [POLICY_MODE_PROD]: {
        ...(source[POLICY_MODE_PROD] || ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_PROD])
      }
    };
  };

  const normalizeEnvironmentPolicyRule = (input, fallback) => {
    const source = input && typeof input === 'object' ? input : {};
    const base = fallback || ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV];
    return {
      allowWrite: source.allowWrite !== undefined ? !!source.allowWrite : !!base.allowWrite,
      allowDdlAdmin: source.allowDdlAdmin !== undefined ? !!source.allowDdlAdmin : !!base.allowDdlAdmin,
      requireApproval: source.requireApproval !== undefined ? !!source.requireApproval : !!base.requireApproval
    };
  };

  const normalizeEnvironmentPolicyRules = (input) => {
    const source = input && typeof input === 'object' ? input : {};
    return {
      [POLICY_MODE_DEV]: normalizeEnvironmentPolicyRule(
        source[POLICY_MODE_DEV],
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV]
      ),
      [POLICY_MODE_STAGING]: normalizeEnvironmentPolicyRule(
        source[POLICY_MODE_STAGING],
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_STAGING]
      ),
      [POLICY_MODE_PROD]: normalizeEnvironmentPolicyRule(
        source[POLICY_MODE_PROD],
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_PROD]
      )
    };
  };

  const resolveEnvironmentPoliciesPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (payload.policies && typeof payload.policies === 'object') return payload.policies;
    if (payload.environments && typeof payload.environments === 'object') return payload.environments;
    return payload;
  };

  const setEnvironmentPolicyRules = (rules) => {
    environmentPolicyRules = normalizeEnvironmentPolicyRules(resolveEnvironmentPoliciesPayload(rules));
    return environmentPolicyRules;
  };

  const getEnvironmentPolicyRules = () => {
    if (!environmentPolicyRules) {
      environmentPolicyRules = cloneEnvironmentPolicyRules(ENVIRONMENT_POLICY_DEFAULTS);
    }
    return environmentPolicyRules;
  };

  const getEnvironmentPolicyRule = (mode) => {
    const policyMode = getEntryPolicyMode({ policyMode: mode });
    const rules = getEnvironmentPolicyRules();
    return (
      rules[policyMode] ||
      ENVIRONMENT_POLICY_DEFAULTS[policyMode] ||
      ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV]
    );
  };

  const hasSelectOption = (select, value) => {
    if (!select || !select.options) return false;
    const target = String(value || '');
    return Array.from(select.options).some((option) => option.value === target);
  };

  const normalizeSelectValue = (select, value, fallback) => {
    const target = String(value || '');
    if (hasSelectOption(select, target)) return target;
    const fallbackValue = String(fallback || '');
    if (hasSelectOption(select, fallbackValue)) return fallbackValue;
    return select && select.options && select.options.length ? select.options[0].value : fallbackValue;
  };

  const normalizeQueryDefaults = (input) => {
    const source = input && typeof input === 'object' ? input : {};
    const limitAnchor = settingsDefaultLimit || limitSelect;
    const timeoutAnchor = settingsDefaultTimeout || timeoutSelect;
    return {
      limit: normalizeSelectValue(limitAnchor, source.limit, QUERY_DEFAULTS.limit),
      timeoutMs: normalizeSelectValue(timeoutAnchor, source.timeoutMs, QUERY_DEFAULTS.timeoutMs)
    };
  };

  const readStoredQueryDefaults = () =>
    normalizeQueryDefaults({
      limit: localStorage.getItem(QUERY_DEFAULT_LIMIT_KEY),
      timeoutMs: localStorage.getItem(QUERY_DEFAULT_TIMEOUT_KEY)
    });

  const applyQueryDefaultsToEditorControls = (input) => {
    const next = normalizeQueryDefaults(input);
    if (limitSelect) {
      limitSelect.value = normalizeSelectValue(limitSelect, next.limit, QUERY_DEFAULTS.limit);
    }
    if (timeoutSelect) {
      timeoutSelect.value = normalizeSelectValue(timeoutSelect, next.timeoutMs, QUERY_DEFAULTS.timeoutMs);
    }
    return next;
  };

  const applyQueryDefaultsToSettingsInputs = (input) => {
    const next = normalizeQueryDefaults(input);
    if (settingsDefaultLimit) {
      settingsDefaultLimit.value = normalizeSelectValue(settingsDefaultLimit, next.limit, QUERY_DEFAULTS.limit);
    }
    if (settingsDefaultTimeout) {
      settingsDefaultTimeout.value = normalizeSelectValue(
        settingsDefaultTimeout,
        next.timeoutMs,
        QUERY_DEFAULTS.timeoutMs
      );
    }
    return next;
  };

  const readQueryDefaultsInputs = () =>
    normalizeQueryDefaults({
      limit: settingsDefaultLimit ? settingsDefaultLimit.value : (limitSelect ? limitSelect.value : QUERY_DEFAULTS.limit),
      timeoutMs: settingsDefaultTimeout
        ? settingsDefaultTimeout.value
        : (timeoutSelect ? timeoutSelect.value : QUERY_DEFAULTS.timeoutMs)
    });

  const persistQueryDefaults = (input) => {
    const next = normalizeQueryDefaults(input);
    localStorage.setItem(QUERY_DEFAULT_LIMIT_KEY, next.limit);
    localStorage.setItem(QUERY_DEFAULT_TIMEOUT_KEY, next.timeoutMs);
    return next;
  };

  const getEnvironmentPolicyInputs = () => ({
    [POLICY_MODE_DEV]: {
      allowWrite: envPolicyDevAllowWrite,
      allowDdlAdmin: envPolicyDevAllowDdl,
      requireApproval: envPolicyDevRequireApproval
    },
    [POLICY_MODE_STAGING]: {
      allowWrite: envPolicyStagingAllowWrite,
      allowDdlAdmin: envPolicyStagingAllowDdl,
      requireApproval: envPolicyStagingRequireApproval
    },
    [POLICY_MODE_PROD]: {
      allowWrite: envPolicyProdAllowWrite,
      allowDdlAdmin: envPolicyProdAllowDdl,
      requireApproval: envPolicyProdRequireApproval
    }
  });

  const applyEnvironmentPolicyInputs = (rules) => {
    const nextRules = normalizeEnvironmentPolicyRules(rules);
    const inputs = getEnvironmentPolicyInputs();
    [POLICY_MODE_DEV, POLICY_MODE_STAGING, POLICY_MODE_PROD].forEach((mode) => {
      const fields = inputs[mode] || {};
      const rule = nextRules[mode];
      if (fields.allowWrite) fields.allowWrite.checked = !!rule.allowWrite;
      if (fields.allowDdlAdmin) fields.allowDdlAdmin.checked = !!rule.allowDdlAdmin;
      if (fields.requireApproval) fields.requireApproval.checked = !!rule.requireApproval;
    });
  };

  const readEnvironmentPolicyInputs = () => {
    const inputs = getEnvironmentPolicyInputs();
    const next = {};
    [POLICY_MODE_DEV, POLICY_MODE_STAGING, POLICY_MODE_PROD].forEach((mode) => {
      const defaults = ENVIRONMENT_POLICY_DEFAULTS[mode];
      const fields = inputs[mode] || {};
      next[mode] = {
        allowWrite:
          fields.allowWrite && fields.allowWrite.checked !== undefined
            ? !!fields.allowWrite.checked
            : !!defaults.allowWrite,
        allowDdlAdmin:
          fields.allowDdlAdmin && fields.allowDdlAdmin.checked !== undefined
            ? !!fields.allowDdlAdmin.checked
            : !!defaults.allowDdlAdmin,
        requireApproval:
          fields.requireApproval && fields.requireApproval.checked !== undefined
            ? !!fields.requireApproval.checked
            : !!defaults.requireApproval
      };
    });
    return normalizeEnvironmentPolicyRules(next);
  };

  const areEnvironmentPoliciesEqual = (left, right) => {
    const normalizedLeft = normalizeEnvironmentPolicyRules(left);
    const normalizedRight = normalizeEnvironmentPolicyRules(right);
    return [POLICY_MODE_DEV, POLICY_MODE_STAGING, POLICY_MODE_PROD].every((mode) => {
      const a = normalizedLeft[mode];
      const b = normalizedRight[mode];
      return (
        a.allowWrite === b.allowWrite &&
        a.allowDdlAdmin === b.allowDdlAdmin &&
        a.requireApproval === b.requireApproval
      );
    });
  };

  const setSettingsTab = (tab) => {
    const next = tab === 'environments' ? 'environments' : 'general';
    activeSettingsTab = next;
    if (settingsTabs) {
      const items = settingsTabs.querySelectorAll('[data-settings-tab]');
      items.forEach((item) => {
        const selected = item.getAttribute('data-settings-tab') === next;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
    }
    if (settingsPanelGeneral) settingsPanelGeneral.classList.toggle('hidden', next !== 'general');
    if (settingsPanelEnvironments) settingsPanelEnvironments.classList.toggle('hidden', next !== 'environments');
  };

  const closeSettingsModal = () => {
    if (settingsModal) settingsModal.classList.add('hidden');
  };

  const loadEnvironmentPolicySettings = async ({ silent = true } = {}) => {
    const fallback = cloneEnvironmentPolicyRules(ENVIRONMENT_POLICY_DEFAULTS);
    try {
      if (!safeApi.getPolicySettings) {
        setEnvironmentPolicyRules(fallback);
        applyEnvironmentPolicyInputs(fallback);
        return fallback;
      }
      const res = await safeApi.getPolicySettings();
      if (!res || !res.ok) {
        if (!silent && safeApi.showError) {
          await safeApi.showError((res && res.error) || 'Failed to load policy settings.');
        }
        setEnvironmentPolicyRules(fallback);
        applyEnvironmentPolicyInputs(fallback);
        return fallback;
      }
      const next = setEnvironmentPolicyRules(res.policies || res);
      applyEnvironmentPolicyInputs(next);
      return next;
    } catch (err) {
      if (!silent && safeApi.showError) {
        await safeApi.showError(err && err.message ? err.message : 'Failed to load policy settings.');
      }
      setEnvironmentPolicyRules(fallback);
      applyEnvironmentPolicyInputs(fallback);
      return fallback;
    }
  };

  const openSettingsModal = async () => {
    if (!settingsModal) return;
    setThemeMenuOpen(false);
    applyQueryDefaultsToSettingsInputs(readStoredQueryDefaults());
    await loadEnvironmentPolicySettings({ silent: false });
    setSettingsTab(activeSettingsTab || 'general');
    settingsModal.classList.remove('hidden');
  };

  const resetGeneralSettingsDefaults = () => {
    applyQueryDefaultsToSettingsInputs(QUERY_DEFAULTS);
  };

  const resetEnvironmentPolicyDefaults = () => {
    const next = cloneEnvironmentPolicyRules(ENVIRONMENT_POLICY_DEFAULTS);
    setEnvironmentPolicyRules(next);
    applyEnvironmentPolicyInputs(next);
  };

  const resetSettingsDefaults = () => {
    if (activeSettingsTab === 'environments') {
      resetEnvironmentPolicyDefaults();
      return;
    }
    resetGeneralSettingsDefaults();
  };

  const saveEnvironmentPolicySettings = async () => {
    const next = readEnvironmentPolicyInputs();
    const current = getEnvironmentPolicyRules();
    if (areEnvironmentPoliciesEqual(current, next)) return { ok: true, saved: false };
    if (!safeApi.savePolicySettings) {
      if (safeApi.showError) await safeApi.showError('Settings API unavailable.');
      return { ok: false };
    }
    const res = await safeApi.savePolicySettings({ policies: next });
    if (!res || !res.ok) {
      if (safeApi.showError) {
        await safeApi.showError((res && res.error) || 'Failed to save policy settings.');
      }
      return { ok: false };
    }
    const saved = setEnvironmentPolicyRules(res.policies || next);
    applyEnvironmentPolicyInputs(saved);
    return { ok: true, saved: true };
  };

  const saveSettings = async () => {
    const queryDefaults = persistQueryDefaults(readQueryDefaultsInputs());
    applyQueryDefaultsToEditorControls(queryDefaults);
    applyQueryDefaultsToSettingsInputs(queryDefaults);
    if (settingsSaveBtn) settingsSaveBtn.disabled = true;
    try {
      const envResult = await saveEnvironmentPolicySettings();
      if (!envResult || !envResult.ok) return;
      showToast('Settings saved');
      closeSettingsModal();
    } finally {
      if (settingsSaveBtn) settingsSaveBtn.disabled = false;
    }
  };


  const setEditMode = (enabled) => {
    isEditingConnection = enabled;
    if (!enabled) {
      editingConnectionSeed = null;
      if (saveName) delete saveName.dataset.originalName;
    }
    if (cancelEditBtn) cancelEditBtn.classList.toggle('hidden', !enabled);
  };

  const setConnectTab = (tab) => {
    const isSsh = tab === 'ssh';
    if (tabDirectBtn) tabDirectBtn.classList.toggle('active', !isSsh);
    if (tabSshBtn) tabSshBtn.classList.toggle('active', isSsh);
    if (sshFields) sshFields.classList.toggle('hidden', !isSsh);
  };

  const entryRemembersSecrets = (entry) => {
    if (!entry) return false;
    if (entry.rememberSecrets !== undefined) return !!entry.rememberSecrets;
    if (entry.remember_secrets !== undefined) return Number(entry.remember_secrets) === 1;
    if (entry.save_secrets !== undefined) return Number(entry.save_secrets) === 1;
    return false;
  };

  const closeCredentialPrompt = (result = null) => {
    if (credentialModal) credentialModal.classList.add('hidden');
    const resolver = credentialPromptResolver;
    credentialPromptResolver = null;
    if (resolver) resolver(result);
  };

  const promptConnectionSecrets = (entry) => {
    if (!credentialModal) return Promise.resolve(null);
    if (credentialPromptResolver) closeCredentialPrompt(null);
    const isSsh = isEntrySsh(entry);
    if (credentialModalTitle) {
      credentialModalTitle.textContent = `Enter password to connect`;
    }
    if (credentialModalSubtitle) {
      const target = entry && (entry.name || entry.host) ? (entry.name || entry.host) : 'connection';
      credentialModalSubtitle.textContent = `${target} • password is not saved`;
    }
    if (credentialDbPassword) credentialDbPassword.value = '';
    if (credentialSshPassword) credentialSshPassword.value = '';
    if (credentialSshPrivateKey) credentialSshPrivateKey.value = '';
    if (credentialSshPassphrase) credentialSshPassphrase.value = '';
    if (credentialSshFields) credentialSshFields.classList.toggle('hidden', !isSsh);
    credentialModal.classList.remove('hidden');
    if (credentialDbPassword) credentialDbPassword.focus();
    return new Promise((resolve) => {
      credentialPromptResolver = resolve;
    });
  };

  const closePolicyApprovalPrompt = (result = '') => {
    if (policyApprovalModal) policyApprovalModal.classList.add('hidden');
    const resolver = policyApprovalPromptResolver;
    policyApprovalPromptResolver = null;
    if (resolver) resolver(result);
  };

  const isValidPolicyApprovalInput = (value) =>
    String(value || '').trim().toUpperCase() === POLICY_APPROVAL_TOKEN;

  const updatePolicyApprovalConfirmState = () => {
    if (!policyApprovalConfirmBtn) return;
    const currentValue = policyApprovalInput ? policyApprovalInput.value : '';
    policyApprovalConfirmBtn.disabled = !isValidPolicyApprovalInput(currentValue);
  };

  const promptPolicyApproval = ({ policyLabel, actionLabel } = {}) => {
    if (!policyApprovalModal) return Promise.resolve('');
    if (policyApprovalPromptResolver) closePolicyApprovalPrompt('');
    if (policyApprovalTitle) {
      policyApprovalTitle.textContent = `${policyLabel || 'Policy'} confirmation`;
    }
    if (policyApprovalSubtitle) {
      const action = actionLabel ? ` ${actionLabel}` : '';
      policyApprovalSubtitle.textContent = `${policyLabel || 'Policy'} requires confirmation for${action}. Type ${POLICY_APPROVAL_TOKEN} to continue.`;
    }
    if (policyApprovalInput) policyApprovalInput.value = '';
    updatePolicyApprovalConfirmState();
    policyApprovalModal.classList.remove('hidden');
    if (policyApprovalInput) policyApprovalInput.focus();
    return new Promise((resolve) => {
      policyApprovalPromptResolver = resolve;
    });
  };

  const resolveConnectEntry = async (entry) => {
    if (!entry || !entry.name || !safeApi.listSavedConnections) return entry;
    try {
      const list = await safeApi.listSavedConnections();
      if (!Array.isArray(list)) return entry;
      const match = list.find((item) => item && item.name === entry.name);
      return match || entry;
    } catch (_) {
      return entry;
    }
  };

  const buildConnectionConfigFromEntry = async (entry) => {
    if (!entry) return null;
    const config = configFromEntry(entry);
    const ssh = getEntrySshConfig(entry);
    const hasRuntimeSecrets = !!(
      (entry.password && String(entry.password).length) ||
      (ssh.password && String(ssh.password).length) ||
      (ssh.privateKey && String(ssh.privateKey).length) ||
      (ssh.passphrase && String(ssh.passphrase).length)
    );
    if (hasRuntimeSecrets) return config;
    if (entryRemembersSecrets(entry)) return config;
    const secrets = await promptConnectionSecrets(entry);
    if (!secrets) return null;
    config.password = secrets.password || '';
    if (config.ssh && config.ssh.enabled) {
      config.ssh.password = secrets.sshPassword || '';
      config.ssh.privateKey = secrets.sshPrivateKey || '';
      config.ssh.passphrase = secrets.sshPassphrase || '';
    }
    return config;
  };

  const hasRuntimeSecretsInConfig = (config) => {
    if (!config) return false;
    const ssh = config.ssh || {};
    return !!(
      (config.password && String(config.password).length) ||
      (ssh.password && String(ssh.password).length) ||
      (ssh.privateKey && String(ssh.privateKey).length) ||
      (ssh.passphrase && String(ssh.passphrase).length)
    );
  };

  const buildPromptEntryForValidation = (baseEntry, currentConfig) => {
    const fallback = {
      name: currentConfig && currentConfig.name ? currentConfig.name : '',
      host: currentConfig && currentConfig.host ? currentConfig.host : '',
      type: currentConfig && currentConfig.type ? currentConfig.type : 'mysql',
      ssh: currentConfig && currentConfig.ssh ? { ...currentConfig.ssh } : { enabled: false }
    };
    if (!baseEntry) return fallback;
    const merged = { ...baseEntry };
    merged.ssh = {
      ...getEntrySshConfig(baseEntry),
      ...(currentConfig && currentConfig.ssh ? currentConfig.ssh : {})
    };
    if (!merged.name && fallback.name) merged.name = fallback.name;
    if (!merged.host && fallback.host) merged.host = fallback.host;
    if (!merged.type && fallback.type) merged.type = fallback.type;
    return merged;
  };

  const resolveSaveValidationEntry = async (name) => {
    if (editingConnectionSeed) {
      return resolveConnectEntry(editingConnectionSeed);
    }
    if (!name) return null;
    return resolveConnectEntry({ name });
  };

  const ensureValidationSecretsIfNeeded = async (config) => {
    const next = {
      ...(config || {}),
      ssh: { ...((config && config.ssh) || {}) }
    };
    if (hasRuntimeSecretsInConfig(next)) return next;
    if (!isEditingConnection) return next;
    const sourceEntry = await resolveSaveValidationEntry(next.name);
    if (!sourceEntry || entryRemembersSecrets(sourceEntry)) return next;
    const promptEntry = buildPromptEntryForValidation(sourceEntry, next);
    const secrets = await promptConnectionSecrets(promptEntry);
    if (!secrets) return null;
    next.password = secrets.password || '';
    if (next.ssh && next.ssh.enabled) {
      next.ssh.password = secrets.sshPassword || '';
      next.ssh.privateKey = secrets.sshPrivateKey || '';
      next.ssh.passphrase = secrets.sshPassphrase || '';
    }
    return next;
  };

  const resetConnectionForm = () => {
    if (dbType) dbType.value = 'mysql';
    if (host) host.value = 'localhost';
    if (port) port.value = '';
    if (user) user.value = '';
    if (password) password.value = '';
    if (database) database.value = '';
    if (saveName) saveName.value = '';
    if (saveName) delete saveName.dataset.originalName;
    if (rememberPassword) rememberPassword.checked = false;
    if (readOnly) readOnly.checked = false;
    if (policyMode) policyMode.value = 'dev';
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
      connectModalTitle.textContent = mode === 'quick' ? 'Quick connect' : 'New connection';
    }
    if (connectModalSubtitle) {
      connectModalSubtitle.textContent =
        mode === 'quick'
          ? 'Connect without saving.'
          : 'Fill in the details to connect.';
    }
    if (connectBtn) {
      connectBtn.textContent = mode === 'quick' ? 'Quick connect' : 'Connect';
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
    if (mode === 'quick' && rememberPassword) rememberPassword.checked = false;
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
    if (!connected) setOutputDisplay(null);
    if (!connected) stopQueryProgress();
    if (!connected) {
      objectContextByTabId = new Map();
      applyResultsPanelState({ snapshot: null, objectContext: null });
    }
    if (homeBtn) {
      homeBtn.classList.toggle(
        'hidden',
        !tabConnectionsView || tabConnectionsView.size() === 0
      );
    }
    if (connected) {
      setSidebarView('tree');
      refreshEditor();
    }
  };

  const setSidebarView = (view) => {
    const next = view === 'history' ? 'history' : view === 'snippets' ? 'snippets' : 'tree';
    if (tablePanel) tablePanel.classList.toggle('hidden', next !== 'tree');
    if (historyPanel) historyPanel.classList.toggle('hidden', next !== 'history');
    if (snippetsPanel) snippetsPanel.classList.toggle('hidden', next !== 'snippets');
    if (sidebarTreeBtn) sidebarTreeBtn.classList.toggle('active', next === 'tree');
    if (sidebarHistoryBtn) sidebarHistoryBtn.classList.toggle('active', next === 'history');
    if (sidebarSnippetsBtn) sidebarSnippetsBtn.classList.toggle('active', next === 'snippets');
    if (next === 'history' && historyManager) historyManager.renderHistoryList();
    if (next === 'snippets' && snippetsManager) snippetsManager.renderSnippetsList();
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
    const key = getTabKey(entry);
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
    policyMode: getEntryPolicyMode(entry),
    ssh: getEntrySshConfig(entry)
  });

  const getTabKey = (entry) => buildConnectionBaseKey(entry);

  const getActiveConnection = () => {
    if (!tabConnectionsView) return null;
    const key = tabConnectionsView.getActiveKey();
    return key ? tabConnectionsView.getEntry(key) : null;
  };

  sqlAutocomplete = createSqlAutocomplete({ api: safeApi, getActiveConnection });

  const getCurrentHistoryKey = () => {
    if (!tabConnectionsView) return null;
    return tabConnectionsView.getActiveKey();
  };

  const tabsStorageKey = (key) => (key ? `sqlEditor.tabs:${key}` : null);
  const editorCollapsedStorageKey = (key) => (key ? `${EDITOR_COLLAPSED_KEY_PREFIX}:${key}` : null);

  const readEditorVisibilityForConnection = (key) => {
    const storageKey = editorCollapsedStorageKey(key);
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    return raw !== '1';
  };

  const saveEditorVisibilityForConnection = (key, visible) => {
    const storageKey = editorCollapsedStorageKey(key);
    if (!storageKey) return;
    localStorage.setItem(storageKey, visible ? '0' : '1');
  };

  const saveTabsForKey = (key) => {
    if (!key || !tabTablesView) return;
    writeJson(tabsStorageKey(key), tabTablesView.getState());
  };

  const saveTabsForActive = () => {
    if (!tabConnectionsView) return;
    const key = tabConnectionsView.getActiveKey();
    if (key) {
      saveTabsForKey(key);
    }
  };

  const loadTabsForKey = (key) => {
    if (!key || !tabTablesView) return;
    const state = readJson(tabsStorageKey(key), null);
    if (state && Array.isArray(state.tabs)) {
      tabTablesView.setState(state);
      if (state.tabs.length === 0) tabTablesView.ensureOne();
      refreshEditor();
      return;
    }
    tabTablesView.setState({ tabs: [], activeTabId: null, tabCounter: 1 });
    tabTablesView.ensureOne();
    refreshEditor();
  };

  const applyEntryToForm = (entry) => {
    if (!entry) return;
    if (dbType) dbType.value = entry.type || 'mysql';
    if (host) host.value = entry.host || '';
    if (port) port.value = entry.port || '';
    if (user) user.value = entry.user || '';
    if (password) password.value = entry.password || '';
    if (database) database.value = entry.database || '';
    if (saveName) saveName.value = entry.name || '';
    if (rememberPassword) rememberPassword.checked = entryRemembersSecrets(entry);
    if (readOnly) readOnly.checked = isEntryReadOnly(entry);
    if (policyMode) policyMode.value = getEntryPolicyMode(entry);
    const ssh = getEntrySshConfig(entry);
    setConnectTab(ssh.enabled ? 'ssh' : 'direct');
    if (sshHost) sshHost.value = ssh.host || '';
    if (sshPort) sshPort.value = ssh.port || '';
    if (sshUser) sshUser.value = ssh.user || '';
    if (sshPassword) sshPassword.value = ssh.password || '';
    if (sshPrivateKey) sshPrivateKey.value = ssh.privateKey || '';
    if (sshPassphrase) sshPassphrase.value = ssh.passphrase || '';
    if (sshLocalPort) sshLocalPort.value = ssh.localPort || '';
  };

  const loadSidebarWidth = () => {
    if (!sidebar) return;
    const raw = localStorage.getItem(SIDEBAR_KEY);
    const width = Number(raw);
    if (Number.isFinite(width) && width >= 200 && width <= 520) {
      sidebar.style.width = `${width}px`;
    }
  };

  const initSidebarResizer = () => {
    if (!sidebarResizer || !sidebar || !mainLayout) return;
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    const onMove = (event) => {
      if (!dragging) return;
      const delta = event.clientX - startX;
      const next = Math.min(520, Math.max(200, startWidth + delta));
      sidebar.style.width = `${next}px`;
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const width = parseFloat(getComputedStyle(sidebar).width);
      if (Number.isFinite(width)) {
        localStorage.setItem(SIDEBAR_KEY, String(Math.round(width)));
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    sidebarResizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      dragging = true;
      startX = event.clientX;
      startWidth = parseFloat(getComputedStyle(sidebar).width) || sidebar.offsetWidth || 260;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  };

  const bindTabShortcuts = () => {
    document.addEventListener('keydown', (event) => {
      const primaryKey = event.metaKey || event.ctrlKey;
      if (!primaryKey || event.altKey) return;
      const key = String(event.key || '').toLowerCase();
      if (!event.shiftKey && key === 'w') {
        event.preventDefault();
        if (tabTablesView) tabTablesView.closeActive();
      } else if (!event.shiftKey && key === 't') {
        event.preventDefault();
        if (tabTablesView) {
          tabTablesView.syncActiveTabContent();
          tabTablesView.create();
          setEditorVisible(true);
        }
      } else if (key === '+' || key === '=') {
        event.preventDefault();
        adjustEditorFontSize(1);
      } else if (key === '-' || key === '_') {
        event.preventDefault();
        adjustEditorFontSize(-1);
      } else if (!event.shiftKey && key === '0') {
        event.preventDefault();
        resetEditorFontSize();
      }
    });
  };

  let resultsVisible = true;

  const getEditorHeaderHeight = () => {
    if (!editorPanel) return 0;
    const tab = editorPanel.querySelector('.tab-bar');
    const toolbar = editorPanel.querySelector('.editor-toolbar');
    return (tab ? tab.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0);
  };

  const resolveMaxEditorBodyHeight = (fallbackHeight) => {
    const minEditor = 120;
    const minResults = resultsVisible ? 180 : 0;
    const resizerHeight = resultsVisible ? (editorResizer ? editorResizer.offsetHeight : 6) : 0;
    const workspaceRect = workspace ? workspace.getBoundingClientRect() : null;
    const headerHeight = getEditorHeaderHeight();
    if (workspaceRect && workspaceRect.height) {
      const maxBody = workspaceRect.height - headerHeight - resizerHeight - minResults;
      return Math.max(minEditor, Math.round(maxBody));
    }
    if (Number.isFinite(fallbackHeight) && fallbackHeight > 0) {
      return Math.max(minEditor, Math.round(fallbackHeight));
    }
    return minEditor;
  };

  const clampEditorBodyHeight = (rawHeight) => {
    const minEditor = 120;
    const maxBody = resolveMaxEditorBodyHeight(rawHeight);
    const clamped = Math.min(Math.max(rawHeight, minEditor), maxBody);
    return Math.round(clamped);
  };

  const applyEditorBodyHeight = (height, { save = true } = {}) => {
    if (!editorBody) return;
    const next = clampEditorBodyHeight(height);
    editorBody.style.height = `${next}px`;
    if (codeEditor) {
      codeEditor.setSize('100%', next);
    }
    if (save) {
      localStorage.setItem(EDITOR_HEIGHT_KEY, String(next));
    }
  };

  const loadEditorHeight = () => {
    const raw = Number(localStorage.getItem(EDITOR_HEIGHT_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return;
    applyEditorBodyHeight(raw, { save: false });
  };

  const clampEditorFontSize = (value) => {
    const size = Number(value);
    if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
    return Math.max(MIN_EDITOR_FONT_SIZE, Math.min(MAX_EDITOR_FONT_SIZE, Math.round(size)));
  };

  const applyEditorFontSize = (size, { save = true, notify = true } = {}) => {
    const next = clampEditorFontSize(size);
    document.documentElement.style.setProperty('--editor-font-size', `${next}px`);
    if (save) localStorage.setItem(EDITOR_FONT_SIZE_KEY, String(next));
    if (notify) showToast(`Font: ${next}px`, 900);
  };

  const getCurrentEditorFontSize = () => {
    const cssValue = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size'),
      10
    );
    if (Number.isFinite(cssValue)) return cssValue;
    const saved = Number(localStorage.getItem(EDITOR_FONT_SIZE_KEY));
    return Number.isFinite(saved) ? saved : DEFAULT_EDITOR_FONT_SIZE;
  };

  const adjustEditorFontSize = (delta) => {
    applyEditorFontSize(getCurrentEditorFontSize() + delta);
  };

  const resetEditorFontSize = () => {
    applyEditorFontSize(DEFAULT_EDITOR_FONT_SIZE);
  };

  const loadEditorFontSize = () => {
    const raw = Number(localStorage.getItem(EDITOR_FONT_SIZE_KEY));
    if (!Number.isFinite(raw)) {
      applyEditorFontSize(DEFAULT_EDITOR_FONT_SIZE, { save: false, notify: false });
      return;
    }
    applyEditorFontSize(raw, { save: false, notify: false });
  };

  const initEditorResizer = () => {
    if (!editorResizer || !editorPanel || !workspace) return;
    let dragging = false;
    let startY = 0;
    let startHeight = 0;

    const onMove = (event) => {
      if (!dragging) return;
      const delta = event.clientY - startY;
      const rawHeight = startHeight + delta;
      applyEditorBodyHeight(rawHeight);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    editorResizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      dragging = true;
      startY = event.clientY;
      const current = parseFloat(editorBody ? editorBody.style.height : '');
      startHeight = Number.isFinite(current) && current > 0
        ? current
        : (editorBody ? editorBody.offsetHeight : 220);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    window.addEventListener('resize', () => {
      const current = parseFloat(editorBody ? editorBody.style.height : '');
      if (Number.isFinite(current) && current > 0) {
        applyEditorBodyHeight(current, { save: false });
      }
    });
  };

  const refreshEditor = () => {
    if (!codeEditor) return;
    codeEditor.refresh();
  };

  const setQueryStatus = ({ state, message, duration }) => {
    if (!queryStatus) return;
    const parts = [];
    if (state === 'success') parts.push('Success');
    if (state === 'error') parts.push('Error');
    if (state === 'running') parts.push('Running');
    if (message) parts.push(message);
    if (Number.isFinite(duration)) parts.push(`${Math.round(duration)}ms`);
    queryStatus.textContent = parts.join(' • ');
    queryStatus.className = `query-status${state ? ` ${state}` : ''}`;
  };

  const OUTPUT_PREVIEW_MAX = 160;

  const normalizePreview = (text) => String(text || '').replace(/\s+/g, ' ').trim();

  const truncatePreview = (text) => {
    const preview = normalizePreview(text);
    if (preview.length <= OUTPUT_PREVIEW_MAX) return preview;
    return `${preview.slice(0, OUTPUT_PREVIEW_MAX - 1)}…`;
  };

  const formatTime = (date) => {
    const value = date instanceof Date ? date : new Date();
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const ACTION_MAX = 220;

  const truncateAction = (text) => {
    const clean = normalizePreview(text);
    if (clean.length <= ACTION_MAX) return clean;
    return `${clean.slice(0, ACTION_MAX - 1)}…`;
  };

  const buildAction = (sql) => {
    const clean = String(sql || '').trim();
    if (!clean) return 'QUERY';
    return truncateAction(clean);
  };

  const buildOutputEntry = ({ sql, ok, totalRows, truncated, affectedRows, changedRows, error, duration }) => {
    const keyword = firstDmlKeyword(sql || '');
    const isDml = keyword === 'insert' || keyword === 'update' || keyword === 'delete';
    const preferredAffected = Number.isFinite(changedRows) && changedRows > 0
      ? changedRows
      : (Number.isFinite(affectedRows) ? affectedRows : undefined);
    let response = error || 'Error';
    if (ok) {
      if (Number.isFinite(preferredAffected)) {
        response = `Rows affected: ${preferredAffected}`;
      } else if (isDml) {
        response = 'Rows affected: 0';
      } else {
        response = `Rows: ${Number.isFinite(totalRows) ? totalRows : 0}${truncated ? ' (truncated)' : ''}`;
      }
    }
    return {
      id: 0,
      time: formatTime(new Date()),
      action: buildAction(sql),
      response,
      durationMs: Number.isFinite(duration) ? Math.round(duration) : 0,
      fullResponse: response
    };
  };

  const ensureOutputState = (tabId) => {
    if (!tabId) return null;
    if (!outputByTabId.has(tabId)) {
      outputByTabId.set(tabId, { seq: 0, items: [], subtitle: 'Latest result' });
    }
    return outputByTabId.get(tabId);
  };

  const appendOutputEntry = (tabId, entry) => {
    const state = ensureOutputState(tabId);
    if (!state || !entry) return;
    state.seq += 1;
    const next = { ...entry, id: state.seq };
    state.items.push(next);
    if (state.items.length > 200) {
      state.items.shift();
    }
  };

  const setOutputDisplay = (payload) => {
    currentOutput = payload || null;
    if (queryOutputPreview) {
      if (payload && payload.items && payload.items.length) {
        const last = payload.items[payload.items.length - 1];
        const preview = `${last.action} • ${last.response}`;
        queryOutputPreview.textContent = truncatePreview(preview);
      } else {
        queryOutputPreview.textContent = 'No output.';
      }
    }
    if (queryOutputBtn) {
      queryOutputBtn.disabled = !(payload && payload.items && payload.items.length);
    }
  };

  const openOutputModal = () => {
    if (!outputModal || !currentOutput || !currentOutput.items) return;
    if (outputModalSubtitle) {
      outputModalSubtitle.textContent = currentOutput.subtitle || 'Latest result';
    }
    if (outputLogBody) {
      outputLogBody.innerHTML = '';
      currentOutput.items.forEach((entry) => {
        const tr = document.createElement('tr');
        const cols = [
          String(entry.id),
          entry.time,
          entry.action,
          entry.response,
          entry.durationMs ? `${entry.durationMs}ms` : ''
        ];
        cols.forEach((value, index) => {
          const td = document.createElement('td');
          td.textContent = value;
          if (index === 3) td.classList.add('response');
          tr.appendChild(td);
        });
        outputLogBody.appendChild(tr);
      });
    }
    outputModal.classList.remove('hidden');
  };

  const closeOutputModal = () => {
    if (outputModal) outputModal.classList.add('hidden');
  };

  const openDefinitionModal = ({ title, subtitle, sql } = {}) => {
    if (!definitionModal) return;
    if (definitionTitle) definitionTitle.textContent = title || 'Definition';
    if (definitionSubtitle) definitionSubtitle.textContent = subtitle || '';
    if (definitionEditor) definitionEditor.setValue(sql || '');
    else if (definitionQueryInput) definitionQueryInput.value = sql || '';
    definitionModal.classList.remove('hidden');
    if (definitionEditor) definitionEditor.refresh();
  };

  const closeDefinitionModal = () => {
    if (definitionModal) definitionModal.classList.add('hidden');
  };

  const updateOutputForActiveTab = () => {
    if (!tabTablesView) {
      setOutputDisplay(null);
      return;
    }
    const tab = tabTablesView.getActiveTab();
    if (!tab || !tab.id) {
      setOutputDisplay(null);
      return;
    }
    const payload = outputByTabId.get(tab.id) || null;
    setOutputDisplay(payload);
  };

  const normalizeObjectContext = (context) => {
    if (!context || !context.table) return null;
    return {
      schema: String(context.schema || ''),
      table: String(context.table || '')
    };
  };

  const getObjectContextForTab = (tabId) => {
    if (!tabId) return null;
    return normalizeObjectContext(objectContextByTabId.get(tabId));
  };

  const setObjectContextForTab = (tabId, context) => {
    if (!tabId) return;
    const normalized = normalizeObjectContext(context);
    if (normalized) {
      objectContextByTabId.set(tabId, normalized);
      return;
    }
    objectContextByTabId.delete(tabId);
  };

  const applyResultsPanelState = ({ snapshot = null, objectContext = null, preferredObjectTab = 'data' } = {}) => {
    const hasSnapshot = !!(snapshot && Array.isArray(snapshot.rows));
    const normalizedContext = normalizeObjectContext(objectContext);
    const nextObjectTab = hasSnapshot ? 'data' : (preferredObjectTab === 'columns' ? 'columns' : 'data');

    if (tableView) {
      if (hasSnapshot) tableView.setResults(snapshot);
      else tableView.clearUi();
    }

    if (tableObjectTabsView) {
      if (normalizedContext) {
        tableObjectTabsView.openTable({
          schema: normalizedContext.schema,
          table: normalizedContext.table,
          active: nextObjectTab
        });
      } else {
        tableObjectTabsView.clear();
      }
      if (nextObjectTab === 'data') {
        tableObjectTabsView.activateData();
      }
      tableObjectTabsView.setDataToolbarVisible(hasSnapshot);
    }
  };

  const renderResults = (rows, totalRows, truncated, baseSql = '', sourceSql = '') => {
    const snapshot = { rows, totalRows, truncated, baseSql, sourceSql };
    let context = null;
    if (tabTablesView) {
      const tab = tabTablesView.getActiveTab();
      if (tab && tab.id) {
        resultsByTabId.set(tab.id, snapshot);
        const inferred = inferObjectContextFromSql(sourceSql || baseSql);
        if (inferred) {
          setObjectContextForTab(tab.id, inferred);
          context = inferred;
        } else {
          context = getObjectContextForTab(tab.id);
        }
      }
    }
    applyResultsPanelState({ snapshot, objectContext: context });
  };

  const sanitizeSqlForPolicy = (sqlText) => {
    const text = String(sqlText || '');
    let sanitized = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          sanitized += '\n';
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          i += 1;
          inBlockComment = false;
        }
        continue;
      }

      if (inSingle) {
        if (ch === "'" && next === "'") {
          i += 1;
          continue;
        }
        if (ch === "'") inSingle = false;
        continue;
      }

      if (inDouble) {
        if (ch === '"' && next === '"') {
          i += 1;
          continue;
        }
        if (ch === '"') inDouble = false;
        continue;
      }

      if (inBacktick) {
        if (ch === '`') inBacktick = false;
        continue;
      }

      if (ch === '-' && next === '-') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === '`') {
        inBacktick = true;
        continue;
      }

      sanitized += ch;
    }

    return sanitized.toLowerCase();
  };

  const findFirstPolicyKeyword = (text, keywords) => {
    const tokenRegex = /\b[a-z]+\b/g;
    let match = tokenRegex.exec(text);
    while (match) {
      const token = match[0];
      if (keywords.has(token)) {
        return { token, index: match.index };
      }
      match = tokenRegex.exec(text);
    }
    return null;
  };

  const classifyStatementByPolicy = (statementSql) => {
    const sanitized = sanitizeSqlForPolicy(statementSql);
    if (!sanitized.trim()) return null;

    const firstWrite = findFirstPolicyKeyword(sanitized, POLICY_WRITE_KEYWORDS);
    const firstDdlAdmin = findFirstPolicyKeyword(sanitized, POLICY_DDL_ADMIN_KEYWORDS);
    const selectIntoMatch = /\bselect\b[\s\S]*\binto\b/.exec(sanitized);
    const selectIntoWrite = selectIntoMatch
      ? { token: 'select into', index: selectIntoMatch.index }
      : null;

    let effectiveWrite = firstWrite;
    if (selectIntoWrite && (!effectiveWrite || selectIntoWrite.index < effectiveWrite.index)) {
      effectiveWrite = selectIntoWrite;
    }

    if (!effectiveWrite && !firstDdlAdmin) return null;

    if (firstDdlAdmin && (!effectiveWrite || firstDdlAdmin.index <= effectiveWrite.index)) {
      return { kind: 'ddlAdmin', action: String(firstDdlAdmin.token || '').toUpperCase() };
    }

    return { kind: 'write', action: String(effectiveWrite.token || '').toUpperCase() };
  };

  const normalizeSql = (sql) => String(sql || '').trim().replace(/;$/, '').trim();

  const applyLimit = (sql) => {
    const limitValue = limitSelect ? limitSelect.value : 'none';
    if (!limitValue || limitValue === 'none') return sql;
    const clean = normalizeSql(sql);
    if (!clean) return clean;
    if (/\\blimit\\b/i.test(clean)) return clean;
    return `${clean} LIMIT ${limitValue}`;
  };

  const applyLimitIfSelect = (sql) => {
    const keyword = firstDmlKeyword(sql);
    if (keyword !== 'select') return sql;
    return applyLimit(sql);
  };

  const getTimeoutMs = () => {
    const value = timeoutSelect ? timeoutSelect.value : 'none';
    if (!value || value === 'none') return 0;
    const ms = Number(value);
    return Number.isFinite(ms) ? ms : 0;
  };

  const setProgressBar = (value) => {
    if (!safeApi.setProgressBar) return;
    void safeApi.setProgressBar(value);
  };

  const stopQueryProgress = () => {
    if (queryProgressRevealTimer) {
      clearTimeout(queryProgressRevealTimer);
      queryProgressRevealTimer = null;
    }
    if (queryProgressTimer) {
      clearInterval(queryProgressTimer);
      queryProgressTimer = null;
    }
    queryProgressStartedAt = 0;
    setProgressBar(-1);
  };

  const startQueryProgress = (timeoutMs) => {
    stopQueryProgress();
    queryProgressStartedAt = Date.now();
    const safeTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(safeTimeout) && safeTimeout > 0;
    const tick = () => {
      if (!queryProgressStartedAt) return;
      if (!hasTimeout) {
        setProgressBar(2);
        return;
      }
      const elapsed = Date.now() - queryProgressStartedAt;
      const progress = Math.min(elapsed / safeTimeout, 0.99);
      setProgressBar(progress);
    };
    queryProgressRevealTimer = setTimeout(() => {
      queryProgressRevealTimer = null;
      if (!queryProgressStartedAt) return;
      tick();
      if (hasTimeout) {
        queryProgressTimer = setInterval(tick, 180);
      }
    }, QUERY_PROGRESS_SHOW_DELAY_MS);
  };

  const runSql = async (rawSql, sourceSqlOverride = '', options = {}) => {
    const applyDefaultLimit = options.applyDefaultLimit !== false;
    const executionSql = normalizeSql(rawSql);
    if (!executionSql) return;
    setResultsVisible(true);
    if (tabTablesView) {
      const tab = tabTablesView.getActiveTab();
      const tabId = tab && tab.id ? tab.id : '';
      const snapshot = tabId ? resultsByTabId.get(tabId) || null : null;
      const objectContext = tabId ? getObjectContextForTab(tabId) : null;
      applyResultsPanelState({ snapshot, objectContext });
    }
    const sourceSql = sourceSqlOverride ? normalizeSql(sourceSqlOverride) : executionSql;
    const statements = splitStatements(executionSql);
    const total = statements.length || 1;
    if (total === 0) return;
    const timeoutMs = getTimeoutMs() || 0;
    const activeConnection = getActiveConnection();
    const activePolicyMode = getEntryPolicyMode(activeConnection);
    const activePolicyRule = getEnvironmentPolicyRule(activePolicyMode);

    let lastResult = null;
    let lastExecutedStmt = '';
    let policyApprovalToken = '';
    let firstApprovalAction = '';

    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      const classification = classifyStatementByPolicy(stmt);
      if (!classification) continue;
      const policyLabel = String(activePolicyMode || POLICY_MODE_DEV).toUpperCase();
      if (classification.kind === 'ddlAdmin' && !activePolicyRule.allowDdlAdmin) {
        const message = `${policyLabel} policy blocks ${classification.action} statements.`;
        await safeApi.showError(message);
        setQueryStatus({ state: 'error', message });
        return;
      }
      if (classification.kind === 'write' && !activePolicyRule.allowWrite) {
        const message = `${policyLabel} policy blocks ${classification.action} statements.`;
        await safeApi.showError(message);
        setQueryStatus({ state: 'error', message });
        return;
      }
      if (activePolicyRule.requireApproval && !firstApprovalAction) {
        if (classification.kind === 'write' && activePolicyRule.allowWrite) {
          firstApprovalAction = classification.action;
        } else if (classification.kind === 'ddlAdmin' && activePolicyRule.allowDdlAdmin) {
          firstApprovalAction = classification.action;
        }
      }
    }

    if (activePolicyRule.requireApproval && firstApprovalAction) {
      const policyLabel = String(activePolicyMode || POLICY_MODE_DEV).toUpperCase();
      const confirmation = await promptPolicyApproval({
        policyLabel: `${policyLabel} policy`,
        actionLabel: firstApprovalAction
      });
      if (String(confirmation || '').trim().toUpperCase() !== POLICY_APPROVAL_TOKEN) {
        setQueryStatus({ state: 'error', message: `Canceled by ${policyLabel} policy` });
        return;
      }
      policyApprovalToken = POLICY_APPROVAL_TOKEN;
    }

    const overallStart = Date.now();
    if (runBtn) runBtn.disabled = true;
    if (runSelectionBtn) runSelectionBtn.disabled = true;
    if (runCurrentBtn) runCurrentBtn.disabled = true;
    if (explainBtn) explainBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    startQueryProgress(timeoutMs);
    try {
      for (let i = 0; i < statements.length; i += 1) {
        const stmt = normalizeSql(statements[i]);
        if (!stmt) continue;
        lastExecutedStmt = stmt;
        if (isDangerousStatement(stmt)) {
          const keyword = firstDmlKeyword(stmt);
          const actionLabel = keyword ? `${keyword.toUpperCase()} without WHERE` : 'dangerous statement';
          const confirmation = await promptPolicyApproval({
            policyLabel: 'Safety check',
            actionLabel
          });
          if (String(confirmation || '').trim().toUpperCase() !== POLICY_APPROVAL_TOKEN) {
            setQueryStatus({ state: 'error', message: 'Canceled by safety check' });
            return;
          }
        }
        const sql = applyDefaultLimit ? applyLimitIfSelect(stmt) : stmt;
        const startedAt = Date.now();
        setQueryStatus({ state: 'running', message: `Running ${i + 1}/${total}...` });
        const payload = {
          sql,
          timeoutMs: timeoutMs || undefined
        };
        if (policyApprovalToken) payload.policyApproval = policyApprovalToken;
        const res = await safeApi.runQuery(payload);
        if (!res || !res.ok) {
          await safeApi.showError((res && res.error) || 'Failed to run query.');
          setQueryStatus({ state: 'error', message: res && res.error ? res.error : 'Error' });
          if (tabTablesView) {
            const tab = tabTablesView.getActiveTab();
            if (tab && tab.id) {
              appendOutputEntry(tab.id, buildOutputEntry({
                sql: stmt,
                ok: false,
                error: res && res.error ? res.error : 'Error',
                duration: Date.now() - startedAt
              }));
              updateOutputForActiveTab();
            }
          }
          return;
        }
        lastResult = { rows: res.rows || [], totalRows: res.totalRows, truncated: res.truncated, stmt };
        if (historyManager) historyManager.recordHistory(stmt);
        if (tabTablesView) {
          const tab = tabTablesView.getActiveTab();
          if (tab && tab.id) {
            appendOutputEntry(tab.id, buildOutputEntry({
              sql: stmt,
              ok: true,
              totalRows: res.totalRows || 0,
              truncated: !!res.truncated,
              affectedRows: Number.isFinite(res.affectedRows) ? res.affectedRows : undefined,
              changedRows: Number.isFinite(res.changedRows) ? res.changedRows : undefined,
              duration: Date.now() - startedAt
            }));
            updateOutputForActiveTab();
          }
        }
      }

      if (lastResult) {
        const sourceStatements = splitStatements(sourceSql);
        const lastSourceStmt = normalizeSql(
          sourceStatements.length ? sourceStatements[sourceStatements.length - 1] : sourceSql
        );
        renderResults(
          lastResult.rows || [],
          lastResult.totalRows,
          lastResult.truncated,
          lastExecutedStmt || lastResult.stmt,
          lastSourceStmt || lastExecutedStmt || lastResult.stmt
        );
        setQueryStatus({
          state: 'success',
          message: `Rows: ${lastResult.totalRows || 0}`,
          duration: Date.now() - overallStart
        });
      }
    } finally {
      stopQueryProgress();
      if (runBtn) runBtn.disabled = false;
      if (runSelectionBtn) runSelectionBtn.disabled = false;
      if (runCurrentBtn) runCurrentBtn.disabled = false;
      if (explainBtn) explainBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  };

  const updateRunAvailability = () => {
    const sql = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
    const hasText = !!(sql && sql.trim());
    if (runBtn) runBtn.disabled = !hasText;
    if (runSelectionBtn) {
      const selection = codeEditor ? codeEditor.getSelection() : '';
      const hasSelection = !!(selection && selection.trim());
      runSelectionBtn.disabled = !hasText || !hasSelection;
    }
    if (runCurrentBtn) runCurrentBtn.disabled = !hasText;
    if (explainBtn) explainBtn.disabled = !hasText;
    if (runBtn) runBtn.classList.toggle('ready', hasText);
    if (saveSnippetEditorBtn) {
      saveSnippetEditorBtn.classList.toggle('hidden', !hasText);
      saveSnippetEditorBtn.disabled = !hasText;
    }
  };

  const handleRun = async () => {
    const sql = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
    if (!sql || !sql.trim()) {
      await safeApi.showError('Empty query.');
      return;
    }
    lastSort = null;
    await runSql(sql);
  };

  const handleRunSelection = async () => {
    const selection = codeEditor ? codeEditor.getSelection() : '';
    const sql = selection && selection.trim() ? selection : '';
    if (!sql) {
      await safeApi.showError('Select a query.');
      return;
    }
    lastSort = null;
    await runSql(sql);
  };

  const resolveEditorCursorOffset = () => {
    if (codeEditor && typeof codeEditor.getCursorOffset === 'function') {
      const offset = Number(codeEditor.getCursorOffset());
      return Number.isFinite(offset) ? offset : 0;
    }
    if (query && Number.isFinite(query.selectionStart)) {
      const offset = Number(query.selectionStart);
      return Number.isFinite(offset) ? offset : 0;
    }
    return 0;
  };

  const findStatementAtCursor = (sourceSql, cursorOffset) => {
    const source = String(sourceSql || '');
    const statements = splitStatementsWithRanges(source);
    if (!statements.length) return '';
    const safeCursor = Math.max(0, Math.min(source.length, Number(cursorOffset) || 0));

    for (let i = 0; i < statements.length; i += 1) {
      const current = statements[i];
      if (safeCursor >= current.start && safeCursor <= current.end) {
        return current.text;
      }
    }

    for (let i = statements.length - 1; i >= 0; i -= 1) {
      const current = statements[i];
      if (safeCursor > current.end) return current.text;
    }

    return statements[0].text;
  };

  const handleRunCurrentStatement = async () => {
    const sql = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
    if (!sql || !sql.trim()) {
      await safeApi.showError('Empty query.');
      return;
    }
    const cursorOffset = resolveEditorCursorOffset();
    const stmt = findStatementAtCursor(sql, cursorOffset);
    if (!stmt) {
      await safeApi.showError('No statement found at cursor.');
      return;
    }
    lastSort = null;
    await runSql(stmt);
  };

  const handleExplain = async () => {
    const selection = codeEditor ? codeEditor.getSelection() : '';
    const sourceSql = selection && selection.trim()
      ? selection
      : (codeEditor ? codeEditor.getValue() : (query ? query.value : ''));
    if (!sourceSql || !sourceSql.trim()) {
      await safeApi.showError('Empty query.');
      return;
    }

    const statements = splitStatements(sourceSql);
    const explainStatements = [];
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      if (firstDmlKeyword(stmt) !== 'select') {
        await safeApi.showError('EXPLAIN is currently available only for SELECT statements.');
        return;
      }
      explainStatements.push(`EXPLAIN ${stmt}`);
    }

    if (!explainStatements.length) {
      await safeApi.showError('Empty query.');
      return;
    }

    lastSort = null;
    await runSql(explainStatements.join(';\n'), sourceSql, { applyDefaultLimit: false });
  };

  const extractSelectAllTableRef = (rawSql) => {
    const clean = normalizeSql(stripLeadingComments(rawSql));
    if (!clean) return '';
    const match = clean.match(/^select\s+\*\s+from\s+(.+)$/i);
    if (!match || !match[1]) return '';
    let fromRef = match[1].trim();
    const clauseMatch = fromRef.match(/\s+(where|order\s+by|limit|offset|group\s+by|having)\b/i);
    if (clauseMatch && Number.isFinite(clauseMatch.index)) {
      fromRef = fromRef.slice(0, clauseMatch.index).trim();
    }
    if (!fromRef || /[\s,()]/.test(fromRef)) return '';
    return fromRef;
  };

  const extractSingleFromTableRef = (rawSql) => {
    const clean = normalizeSql(stripLeadingComments(rawSql));
    if (!clean) return '';
    const match = clean.match(/^select\s+[\s\S]+?\s+from\s+(.+)$/i);
    if (!match || !match[1]) return '';
    let fromRef = match[1].trim();
    const clauseMatch = fromRef.match(
      /\s+(where|order\s+by|limit|offset|group\s+by|having|inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join|union)\b/i
    );
    if (clauseMatch && Number.isFinite(clauseMatch.index)) {
      fromRef = fromRef.slice(0, clauseMatch.index).trim();
    }
    const aliasMatch = fromRef.match(/^([^\s]+)\s+/);
    if (aliasMatch && aliasMatch[1]) {
      fromRef = aliasMatch[1].trim();
    }
    if (!fromRef || /[,()]/.test(fromRef)) return '';
    return fromRef;
  };

  const parseTableReference = (rawRef) => {
    const text = String(rawRef || '').trim();
    if (!text) return null;
    const parts = [];
    let token = '';
    let quote = '';
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === quote) {
          if (i + 1 < text.length && text[i + 1] === quote) {
            token += quote;
            i += 1;
            continue;
          }
          quote = '';
          continue;
        }
        token += ch;
        continue;
      }
      if (ch === '`' || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === '.') {
        parts.push(token.trim());
        token = '';
        continue;
      }
      token += ch;
    }
    if (quote) return null;
    parts.push(token.trim());
    const cleanParts = parts.filter((part) => part !== '');
    if (cleanParts.length === 1) {
      return { schema: '', table: cleanParts[0] };
    }
    if (cleanParts.length === 2) {
      return { schema: cleanParts[0], table: cleanParts[1] };
    }
    return null;
  };

  const inferObjectContextFromSql = (rawSql) => {
    const tableRef = extractSingleFromTableRef(rawSql);
    if (!tableRef) return null;
    return parseTableReference(tableRef);
  };

  const buildTableCountSql = (rawSql) => {
    const tableRef = extractSelectAllTableRef(rawSql);
    if (!tableRef) return '';
    return `SELECT COUNT(*) AS total FROM ${tableRef};`;
  };

  const applyTableFilter = async () => {
    const filter = queryFilter ? queryFilter.value.trim() : '';
    const active = tableView ? tableView.getActive() : null;
    const base = active && (active.sourceSql || active.baseSql)
      ? (active.sourceSql || active.baseSql)
      : (codeEditor ? codeEditor.getValue() : (query ? query.value : ''));
    if (!base || !base.trim()) {
      await safeApi.showError('Empty query.');
      return;
    }
    if (!filter) {
      lastSort = null;
      await runSql(base, base);
      return;
    }
    const sql = insertWhere(base, filter);
    if (!sql || !sql.trim()) return;
    lastSort = null;
    await runSql(sql, base);
  };

  const updateQueryFilterClearVisibility = () => {
    if (!queryFilterClear) return;
    const hasValue = !!(queryFilter && queryFilter.value);
    queryFilterClear.classList.toggle('hidden', !hasValue);
  };

  const quoteIdentifier = (name) => {
    if (!name) return name;
    const text = String(name);
    if (!/^[A-Za-z0-9_$.]+$/.test(text)) {
      return text;
    }
    const active = getActiveConnection();
    const type = active && active.type ? active.type : 'mysql';
    const parts = text.split('.');
    if (type === 'postgres' || type === 'postgresql') {
      return parts.map((p) => (p.startsWith('\"') ? p : `\"${p.replace(/\"/g, '\"\"')}\"`)).join('.');
    }
    return parts.map((p) => (p.startsWith('`') ? p : `\`${p.replace(/`/g, '``')}\``)).join('.');
  };

  const quoteDbIdentifier = (value, type) => {
    const raw = String(value || '');
    if (!raw) return raw;
    const parts = raw.split('.');
    if (type === 'postgres' || type === 'postgresql') {
      return parts.map((part) => `"${part.replace(/"/g, '""')}"`).join('.');
    }
    return parts.map((part) => `\`${part.replace(/`/g, '``')}\``).join('.');
  };

  const buildQualifiedTableRef = (schema, table) => {
    const active = getActiveConnection();
    const type = active && active.type ? active.type : 'mysql';
    if (!schema) return quoteDbIdentifier(table, type);
    return `${quoteDbIdentifier(schema, type)}.${quoteDbIdentifier(table, type)}`;
  };

  const buildSelectAllSql = (schema, table) => `SELECT * FROM ${buildQualifiedTableRef(schema, table)};`;

  const openTableFromNavigator = async (schema, name, sql = '', options = {}) => {
    const table = String(name || '').trim();
    if (!table) return;
    const querySql = String(sql || '').trim() || buildSelectAllSql(schema, table);
    let openedTab = null;
    if (tabTablesView) {
      openedTab = tabTablesView.createWithQuery(table, querySql);
    }
    if (openedTab && openedTab.id) {
      setObjectContextForTab(openedTab.id, { schema, table });
    }
    const preferredObjectTab =
      options && options.execute === false && options.openObjectTab === 'columns'
        ? 'columns'
        : 'data';
    applyResultsPanelState({
      snapshot: null,
      objectContext: { schema, table },
      preferredObjectTab
    });
    setEditorVisible(true);
    if (codeEditor) codeEditor.focus();
    lastSort = null;
    if (options && options.execute) {
      await runSql(querySql);
    }
  };

  const updateToggleEditorButtonState = (visible) => {
    if (!toggleEditorBtn) return;
    const nextVisible = !!visible;
    toggleEditorBtn.classList.toggle('active', nextVisible);
    toggleEditorBtn.title = nextVisible ? 'Collapse editor' : 'Expand editor';
    toggleEditorBtn.setAttribute('aria-label', nextVisible ? 'Collapse editor' : 'Expand editor');
    toggleEditorBtn.setAttribute('aria-pressed', nextVisible ? 'true' : 'false');
    const icon = toggleEditorBtn.querySelector('i');
    if (icon) {
      icon.className = nextVisible ? 'bi bi-chevron-up' : 'bi bi-chevron-down';
    }
  };

  const resolveEditorVisibility = () => {
    const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
    const persisted = readEditorVisibilityForConnection(key);
    if (typeof persisted === 'boolean') return persisted;
    const tab = tabTablesView ? tabTablesView.getActiveTab() : null;
    return tab ? tab.editorVisible !== false : true;
  };

  const setEditorVisible = (visible, { persist = true } = {}) => {
    const nextVisible = !!visible;
    if (editorBody) editorBody.classList.toggle('hidden', !nextVisible);
    updateToggleEditorButtonState(nextVisible);
    if (persist && tabTablesView) {
      const tab = tabTablesView.getActiveTab();
      if (tab) tab.editorVisible = nextVisible;
    }
    if (persist) {
      const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
      saveEditorVisibilityForConnection(key, nextVisible);
    }
    if (nextVisible) refreshEditor();
  };

  const getCurrentEditorBodyHeight = () => {
    if (!editorBody) return 0;
    const current = parseFloat(editorBody.style.height || '');
    if (Number.isFinite(current) && current > 0) return current;
    return editorBody.offsetHeight || 0;
  };

  const setResultsVisible = (visible) => {
    resultsVisible = !!visible;
    if (resultsPanel) resultsPanel.classList.toggle('hidden', !resultsVisible);
    if (editorResizer) editorResizer.classList.toggle('hidden', !resultsVisible);
    if (!editorBody) return;
    if (!resultsVisible) {
      const maxHeight = resolveMaxEditorBodyHeight(getCurrentEditorBodyHeight());
      applyEditorBodyHeight(maxHeight, { save: false });
    } else {
      const stored = Number(localStorage.getItem(EDITOR_HEIGHT_KEY));
      if (Number.isFinite(stored) && stored > 0) {
        applyEditorBodyHeight(stored, { save: false });
      } else {
        applyEditorBodyHeight(getCurrentEditorBodyHeight(), { save: false });
      }
    }
  };

  const refreshDatabases = async () => {
    if (!dbSelect) return;
    const res = await safeApi.listDatabases();
    if (!res || !res.ok) {
      await safeApi.showError((res && res.error) || 'Failed to list databases.');
      return;
    }
    dbSelect.innerHTML = '';
    (res.databases || []).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      dbSelect.appendChild(opt);
    });
    const active = getActiveConnection();
    const preferred = active && active.database ? active.database : '';
    const targetDb = res.current || preferred || (dbSelect.options.length > 0 ? dbSelect.options[0].value : '');
    if (targetDb) {
      dbSelect.value = targetDb;
    }
    if (targetDb && res.current !== targetDb) {
      const useRes = await safeApi.useDatabase(targetDb);
      if (!useRes || !useRes.ok) {
        await safeApi.showError((useRes && useRes.error) || 'Failed to select database.');
        return;
      }
      if (active) {
        const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
        active.database = targetDb;
        if (tabConnectionsView && key) {
          tabConnectionsView.upsert(key, active);
          renderConnectionTabs();
        }
      }
      if (treeView) treeView.setActiveSchema(targetDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(targetDb);
    }
  };

  const openViewDefinition = async (schema, name) => {
    if (!name) return;
    if (!safeApi.getViewDefinition) {
      await safeApi.showError('View definitions not supported.');
      return;
    }
    setGlobalLoading(true, 'Loading view...');
    let res = null;
    try {
      res = await safeApi.getViewDefinition({ schema, view: name });
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to load view definition.';
      await safeApi.showError(message);
      setGlobalLoading(false);
      return;
    }
    if (!res || !res.ok) {
      await safeApi.showError((res && res.error) || 'Failed to load view definition.');
      setGlobalLoading(false);
      return;
    }
    const sql = res.sql || res.definition || '';
    if (!sql || !sql.trim()) {
      await safeApi.showError('View definition is empty.');
      setGlobalLoading(false);
      return;
    }
    const title = 'View definition';
    const subtitle = schema ? `${schema}.${name}` : name;
    openDefinitionModal({ title, subtitle, sql });
    setGlobalLoading(false);
  };

  const resetConnectionScopedUi = () => {
    resultsByTabId = new Map();
    objectContextByTabId = new Map();
    outputByTabId = new Map();
    setOutputDisplay(null);
    if (tableObjectTabsView) {
      tableObjectTabsView.resetScopeCache();
    }
    applyResultsPanelState({ snapshot: null, objectContext: null });
  };

  const syncActiveDatabaseAndTree = async (entry, key) => {
    const selectedDb = dbSelect ? String(dbSelect.value || '') : '';
    if (selectedDb) {
      if (treeView) treeView.setActiveSchema(selectedDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(selectedDb);
      if (entry) entry.database = selectedDb;
      if (entry && tabConnectionsView && key) {
        tabConnectionsView.upsert(key, entry);
      }
    } else {
      const fallbackDb = entry && entry.database ? String(entry.database) : '';
      if (treeView) treeView.setActiveSchema(fallbackDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(fallbackDb);
    }
    const tables = treeView ? await treeView.refresh() : null;
    if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
    return tables;
  };

  const changeDatabase = async (name) => {
    const targetDb = String(name || '').trim();
    if (!targetDb) return;
    setGlobalLoading(true, 'Switching database...');
    try {
      const res = await safeApi.useDatabase(targetDb);
      if (!res || !res.ok) {
        await safeApi.showError((res && res.error) || 'Failed to select database.');
        return;
      }
      const active = getActiveConnection();
      if (active) {
        const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
        active.database = targetDb;
        if (tabConnectionsView && key) {
          tabConnectionsView.upsert(key, active);
          renderConnectionTabs();
        }
      }
      if (treeView) treeView.setActiveSchema(targetDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(targetDb);
      const tables = treeView ? await treeView.refresh() : null;
      if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
    } finally {
      setGlobalLoading(false);
    }
  };

  const activateConnection = async (entry, previousKey = null) => {
    const resolvedEntry = await resolveConnectEntry(entry);
    const config = await buildConnectionConfigFromEntry(resolvedEntry);
    if (!config) {
      if (tabConnectionsView && previousKey) tabConnectionsView.setActive(previousKey);
      return false;
    }
    const key = getTabKey(entry);
    if (previousKey) saveTabsForKey(previousKey);
    setScreen(true);
    if (tabConnectionsView) tabConnectionsView.setActive(key);
    if (treeView && typeof treeView.clear === 'function') treeView.clear();

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Failed to connect.');
      if (treeView && typeof treeView.clear === 'function') treeView.clear();
      if (tabConnectionsView) tabConnectionsView.clearActive();
      setScreen(false);
      return false;
    }
    if (entry && resolvedEntry && entry !== resolvedEntry) {
      Object.assign(entry, resolvedEntry);
    }
    if (resolvedEntry && resolvedEntry.name && safeApi.touchConnection) {
      try {
        await safeApi.touchConnection(resolvedEntry.name);
      } catch (_) {
        // best-effort recency update
      }
    }
    await refreshDatabases();
    await syncActiveDatabaseAndTree(entry, key);
    resetConnectionScopedUi();
    if (tabTablesView) loadTabsForKey(key);
    return true;
  };

  const tryActivateExistingConnection = async (entry) => {
    if (!entry) return false;
    const key = getTabKey(entry);
    if (!tabConnectionsView || !tabConnectionsView.has(key)) return false;
    const previousKey = tabConnectionsView.getActiveKey();
    const ok = await activateConnection(entry, previousKey && previousKey !== key ? previousKey : null);
    if (ok) closeConnectModal();
    return ok;
  };

  const normalizeSavedPolicyFilter = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'dev' || mode === 'staging' || mode === 'prod' || mode === 'all') {
      return mode;
    }
    return 'all';
  };

  const getSavedPolicyFilter = () => {
    if (!savedPolicyFilters) return 'all';
    const selected = savedPolicyFilters.querySelector('input[name="savedPolicyFilter"]:checked');
    return normalizeSavedPolicyFilter(selected ? selected.value : 'all');
  };

  const formatSavedPolicyFilterLabel = (value) => {
    const mode = normalizeSavedPolicyFilter(value);
    if (mode === 'all') return 'All';
    return mode.toUpperCase();
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
    if (importConnectionsBtn) importConnectionsBtn.disabled = loading;
    if (exportConnectionsBtn) exportConnectionsBtn.disabled = loading;
    if (openConnectModalBtn) openConnectModalBtn.disabled = loading;
    if (quickConnectBtn) quickConnectBtn.disabled = loading;
    if (savedList) savedList.classList.toggle('is-connecting', loading);
    if (connectModal) connectModal.classList.toggle('is-connecting', loading);
  };

  const connectWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: 'Connection in progress.' };
    setConnecting(true);
    setGlobalLoading(true, 'Connecting...');
    try {
      return await safeApi.connect(config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Failed to connect.' };
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const testConnectionWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: 'Connection in progress.' };
    setConnecting(true);
    try {
      return await safeApi.testConnection(config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Failed to test connection.' };
    } finally {
      setConnecting(false);
    }
  };

  const connectEntryFromList = async (entry) => {
    if (!entry) return false;
    const resolvedEntry = await resolveConnectEntry(entry);
    if (await tryActivateExistingConnection(resolvedEntry)) return true;
    const config = await buildConnectionConfigFromEntry(resolvedEntry);
    if (!config) return false;
    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Failed to connect.');
      return false;
    }
    if (resolvedEntry.name && safeApi.touchConnection) {
      try {
        await safeApi.touchConnection(resolvedEntry.name);
      } catch (_) {
        // best-effort recency update
      }
    }
    saveTabsForActive();
    upsertConnectionTab(resolvedEntry);
    await refreshDatabases();
    await syncActiveDatabaseAndTree(resolvedEntry, getTabKey(resolvedEntry));
    resetConnectionScopedUi();
    loadTabsForKey(getTabKey(resolvedEntry));
    setScreen(true);
    closeConnectModal();
    return true;
  };

  const renderSavedList = async () => {
    if (!savedList) return;
    const list = await safeApi.listSavedConnections();
    const entries = Array.isArray(list) ? list : [];
    const filterMode = getSavedPolicyFilter();
    const filtered = filterMode === 'all'
      ? entries
      : entries.filter((entry) => getEntryPolicyMode(entry) === filterMode);
    savedList.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'No saved connections.';
      savedList.appendChild(empty);
      return;
    }
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = `No saved connections for ${formatSavedPolicyFilterLabel(filterMode)}.`;
      savedList.appendChild(empty);
      return;
    }
    filtered.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'saved-item';

      const info = document.createElement('div');
      info.className = 'saved-info';

      const title = document.createElement('div');
      title.className = 'saved-title';
      title.textContent = entry.name || connectionTitle(entry);

      const meta = document.createElement('div');
      meta.className = 'saved-meta';
      const metaMain = document.createElement('span');
      metaMain.className = 'saved-meta-main';
      const typeLabel = String(entry.type || '').trim().toUpperCase();
      const hostLabel = entry.port ? `${entry.host}:${entry.port}` : `${entry.host}`;
      const segments = [typeLabel, hostLabel];
      if (entry.database) segments.push(String(entry.database));
      metaMain.textContent = segments.filter(Boolean).join(' • ');

      const badges = document.createElement('div');
      badges.className = 'saved-badges';
      const appendBadge = (text, variant = '') => {
        const badge = document.createElement('span');
        badge.className = variant ? `saved-badge ${variant}` : 'saved-badge';
        badge.textContent = text;
        badges.appendChild(badge);
      };

      const policy = String(getEntryPolicyMode(entry) || 'dev').toLowerCase();
      appendBadge(policy.toUpperCase(), `is-${policy}`);
      if (isEntryReadOnly(entry)) appendBadge('RO', 'is-readonly');
      if (isEntrySsh(entry)) appendBadge('SSH', 'is-ssh');

      meta.appendChild(metaMain);
      meta.appendChild(badges);

      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'saved-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editBtn.title = 'Edit';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.title = 'Delete';

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      info.addEventListener('click', async () => {
        if (isConnecting) return;
        await connectEntryFromList(entry);
      });

      editBtn.addEventListener('click', () => {
        editingConnectionSeed = entry ? { ...entry, ssh: getEntrySshConfig(entry) } : null;
        if (saveName) {
          const originalName = entry && entry.name ? String(entry.name).trim() : '';
          if (originalName) saveName.dataset.originalName = originalName;
          else delete saveName.dataset.originalName;
        }
        applyEntryToForm(entry);
        setEditMode(true);
        openConnectModal({ keepForm: true, mode: 'full' });
      });

      deleteBtn.addEventListener('click', async () => {
        const name = entry.name || connectionTitle(entry);
        const confirmed = confirm(`Remove connection "${name}"?`);
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
      policyMode: policyMode ? policyMode.value || 'dev' : 'dev',
      ssh: buildSshConfig()
    };

    if (await tryActivateExistingConnection(config)) return;

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Failed to connect.');
      return;
    }
    saveTabsForActive();
    upsertConnectionTab(config);
    await refreshDatabases();
    await syncActiveDatabaseAndTree(config, getTabKey(config));
    resetConnectionScopedUi();
    loadTabsForKey(getTabKey(config));
    setScreen(true);
    closeConnectModal();
  };

  const saveConnection = async () => {
    if (!saveName || !saveName.value.trim()) {
      await safeApi.showError('Enter a name to save.');
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
      rememberSecrets: rememberPassword ? rememberPassword.checked : false,
      readOnly: readOnly ? readOnly.checked : false,
      policyMode: policyMode ? policyMode.value || 'dev' : 'dev',
      ssh: buildSshConfig()
    };

    const entryForValidation = await ensureValidationSecretsIfNeeded(entry);
    if (!entryForValidation) return;

    const res = await testConnectionWithLoading({
      type: entryForValidation.type,
      host: entryForValidation.host,
      port: entryForValidation.port || undefined,
      user: entryForValidation.user,
      password: entryForValidation.password,
      database: entryForValidation.database,
      readOnly: entryForValidation.readOnly,
      policyMode: entryForValidation.policyMode,
      ssh: entryForValidation.ssh
    });
    if (!res.ok) {
      await safeApi.showError(res.error || 'Failed to test connection.');
      return;
    }
    const originalName = editingConnectionSeed && editingConnectionSeed.name
      ? String(editingConnectionSeed.name).trim()
      : (saveName && saveName.dataset && saveName.dataset.originalName
        ? String(saveName.dataset.originalName).trim()
        : '');
    const nextName = entry && entry.name ? String(entry.name).trim() : '';
    const payload =
      isEditingConnection && originalName
        ? { ...entry, originalName }
        : entry;

    await safeApi.saveConnection(payload);
    setEditMode(false);
    await renderSavedList();
    closeConnectModal();
  };

  const testConnection = async () => {
    const config = {
      name: saveName ? saveName.value.trim() : '',
      type: dbType ? dbType.value : 'mysql',
      host: host ? host.value || 'localhost' : 'localhost',
      port: port ? port.value || undefined : undefined,
      user: user ? user.value || '' : '',
      password: password ? password.value || '' : '',
      database: database ? database.value || '' : '',
      readOnly: readOnly ? readOnly.checked : false,
      policyMode: policyMode ? policyMode.value || 'dev' : 'dev',
      ssh: buildSshConfig()
    };

    const configForValidation = await ensureValidationSecretsIfNeeded(config);
    if (!configForValidation) return;

    const res = await testConnectionWithLoading(configForValidation);
    if (!res.ok) {
      await safeApi.showError(res.error || 'Failed to test connection.');
      return;
    }
    alert('Connection OK.');
  };

  if (tabDirectBtn) {
    tabDirectBtn.addEventListener('click', () => setConnectTab('direct'));
  }
  if (tabSshBtn) {
    tabSshBtn.addEventListener('click', () => setConnectTab('ssh'));
  }

  if (savedPolicyFilters) {
    savedPolicyFilters.addEventListener('change', (event) => {
      const target = event && event.target ? event.target : null;
      if (!target || target.name !== 'savedPolicyFilter') return;
      void renderSavedList();
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      if (tabConnectionsView) {
        const key = tabConnectionsView.getActiveKey();
        if (key) saveTabsForKey(key);
      }
      setScreen(false);
      if (tabConnectionsView) tabConnectionsView.clearActive();
      renderConnectionTabs();
      renderSavedList();
    });
  }

  if (exportConnectionsBtn) {
    exportConnectionsBtn.addEventListener('click', async () => {
      try {
        if (!safeApi.exportSavedConnections) {
          await safeApi.showError('Export API unavailable. Restart the app and try again.');
          return;
        }
        showToast('Opening save dialog...');
        const res = await safeApi.exportSavedConnections();
        if (!res || !res.ok) {
          if (res && res.canceled) return;
          await safeApi.showError((res && res.error) || 'Failed to export saved connections.');
          return;
        }
        showToast(`Exported ${res.count || 0} connection(s)`);
      } catch (err) {
        const message = err && err.message ? err.message : '';
        if (message.includes("No handler registered for 'connections:export'")) {
          await safeApi.showError('Export unavailable in this running process. Restart the app and try again.');
          return;
        }
        await safeApi.showError('Failed to export saved connections.');
      }
    });
  }

  if (importConnectionsBtn) {
    importConnectionsBtn.addEventListener('click', async () => {
      try {
        if (!safeApi.importSavedConnections) {
          await safeApi.showError('Import API unavailable. Restart the app and try again.');
          return;
        }
        const confirmed = confirm(
          'Importar conexoes pode atualizar conexoes existentes com o mesmo nome ou configuracao similar. Deseja continuar?',
        );
        if (!confirmed) return;
        showToast('Opening file dialog...');
        const res = await safeApi.importSavedConnections();
        if (!res || !res.ok) {
          if (res && res.canceled) return;
          await safeApi.showError((res && res.error) || 'Failed to import saved connections.');
          return;
        }
        await renderSavedList();
        const label = `Imported ${res.added || 0} new, updated ${res.updated || 0}`;
        showToast(label);
      } catch (err) {
        const message = err && err.message ? err.message : '';
        if (message.includes("No handler registered for 'connections:import'")) {
          await safeApi.showError('Import unavailable in this running process. Restart the app and try again.');
          return;
        }
        await safeApi.showError('Failed to import saved connections.');
      }
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

  if (credentialCloseBtn) {
    credentialCloseBtn.addEventListener('click', () => closeCredentialPrompt(null));
  }

  if (credentialCancelBtn) {
    credentialCancelBtn.addEventListener('click', () => closeCredentialPrompt(null));
  }

  if (credentialModalBackdrop) {
    credentialModalBackdrop.addEventListener('click', () => closeCredentialPrompt(null));
  }

  if (credentialConfirmBtn) {
    credentialConfirmBtn.addEventListener('click', () => {
      closeCredentialPrompt({
        password: credentialDbPassword ? credentialDbPassword.value || '' : '',
        sshPassword: credentialSshPassword ? credentialSshPassword.value || '' : '',
        sshPrivateKey: credentialSshPrivateKey ? credentialSshPrivateKey.value || '' : '',
        sshPassphrase: credentialSshPassphrase ? credentialSshPassphrase.value || '' : ''
      });
    });
  }

  if (credentialDbPassword) {
    credentialDbPassword.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (!credentialModal || credentialModal.classList.contains('hidden')) return;
      event.preventDefault();
      if (credentialConfirmBtn) credentialConfirmBtn.click();
    });
  }

  if (policyApprovalCloseBtn) {
    policyApprovalCloseBtn.addEventListener('click', () => closePolicyApprovalPrompt(''));
  }

  if (policyApprovalCancelBtn) {
    policyApprovalCancelBtn.addEventListener('click', () => closePolicyApprovalPrompt(''));
  }

  if (policyApprovalModalBackdrop) {
    policyApprovalModalBackdrop.addEventListener('click', () => closePolicyApprovalPrompt(''));
  }

  if (policyApprovalConfirmBtn) {
    policyApprovalConfirmBtn.addEventListener('click', () => {
      closePolicyApprovalPrompt(policyApprovalInput ? policyApprovalInput.value || '' : '');
    });
  }

  if (policyApprovalInput) {
    policyApprovalInput.addEventListener('input', () => {
      updatePolicyApprovalConfirmState();
    });
    policyApprovalInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (!policyApprovalModal || policyApprovalModal.classList.contains('hidden')) return;
      event.preventDefault();
      if (policyApprovalConfirmBtn) policyApprovalConfirmBtn.click();
    });
  }

  if (queryOutputBtn) {
    queryOutputBtn.addEventListener('click', () => openOutputModal());
  }

  if (outputCloseBtn) {
    outputCloseBtn.addEventListener('click', () => closeOutputModal());
  }

  if (outputCloseBtnBottom) {
    outputCloseBtnBottom.addEventListener('click', () => closeOutputModal());
  }

  if (outputModalBackdrop) {
    outputModalBackdrop.addEventListener('click', () => closeOutputModal());
  }

  if (outputCopyBtn) {
    outputCopyBtn.addEventListener('click', async () => {
      if (!currentOutput || !currentOutput.items || currentOutput.items.length === 0) return;
      try {
        const header = ['#', 'Time', 'Action', 'Response', 'Duration'].join('\t');
        const lines = currentOutput.items.map((entry) => [
          entry.id,
          entry.time,
          entry.action,
          entry.response,
          entry.durationMs ? `${entry.durationMs}ms` : ''
        ].join('\t'));
        await navigator.clipboard.writeText([header, ...lines].join('\n'));
        showToast('Output copied');
      } catch (_) {
        if (safeApi.showError) await safeApi.showError('Unable to copy output.');
      }
    });
  }

  if (definitionCloseBtn) {
    definitionCloseBtn.addEventListener('click', () => closeDefinitionModal());
  }

  if (definitionModalBackdrop) {
    definitionModalBackdrop.addEventListener('click', () => closeDefinitionModal());
  }

  if (definitionFormatBtn) {
    definitionFormatBtn.addEventListener('click', () => {
      const source = definitionEditor ? definitionEditor.getValue() : (definitionQueryInput ? definitionQueryInput.value : '');
      if (!source || !source.trim()) return;
      const active = getActiveConnection();
      const language = active && active.type === 'postgres' ? 'postgresql' : 'mysql';
      const formatted = formatSql(source, { language });
      if (definitionEditor) definitionEditor.setValue(formatted);
      else if (definitionQueryInput) definitionQueryInput.value = formatted;
    });
  }

  if (definitionCopyBtn) {
    definitionCopyBtn.addEventListener('click', async () => {
      const source = definitionEditor ? definitionEditor.getValue() : (definitionQueryInput ? definitionQueryInput.value : '');
      if (!source || !source.trim()) return;
      try {
        await navigator.clipboard.writeText(source);
        showToast('SQL copied');
      } catch (_) {
        if (safeApi.showError) await safeApi.showError('Unable to copy.');
      }
    });
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
    themeToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = themeMenu ? !themeMenu.classList.contains('hidden') : false;
      setThemeMenuOpen(!isOpen);
    });
  }
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      void openSettingsModal();
    });
  }
  if (settingsTabs) {
    settingsTabs.addEventListener('click', (event) => {
      const item = event.target.closest('[data-settings-tab]');
      if (!item) return;
      const tab = item.getAttribute('data-settings-tab');
      setSettingsTab(tab);
    });
  }
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', () => closeSettingsModal());
  }
  if (settingsCancelBtn) {
    settingsCancelBtn.addEventListener('click', () => closeSettingsModal());
  }
  if (settingsModalBackdrop) {
    settingsModalBackdrop.addEventListener('click', () => closeSettingsModal());
  }
  if (settingsResetDefaultsBtn) {
    settingsResetDefaultsBtn.addEventListener('click', () => resetSettingsDefaults());
  }
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      void saveSettings();
    });
  }
  if (themeMenu) {
    themeMenu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-theme-mode]');
      if (!item) return;
      const mode = item.getAttribute('data-theme-mode');
      setThemeMode(mode);
      setThemeMenuOpen(false);
    });
  }
  document.addEventListener('click', (event) => {
    if (!themeMenu || themeMenu.classList.contains('hidden')) return;
    if (event.target && event.target.closest('#themeControl')) return;
    setThemeMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setThemeMenuOpen(false);
      closeSettingsModal();
      closePolicyApprovalPrompt('');
    }
  });
  if (typeof safeApi.onNativeThemeUpdated === 'function') {
    removeNativeThemeListener = safeApi.onNativeThemeUpdated((payload) => {
      applySystemThemeSnapshot(payload);
    });
  }
  window.addEventListener('beforeunload', () => {
    if (typeof removeNativeThemeListener === 'function') {
      removeNativeThemeListener();
      removeNativeThemeListener = null;
    }
  });

  if (sidebarTreeBtn) {
    sidebarTreeBtn.addEventListener('click', () => setSidebarView('tree'));
  }
  if (sidebarHistoryBtn) {
    sidebarHistoryBtn.addEventListener('click', () => setSidebarView('history'));
  }
  if (sidebarSnippetsBtn) {
    sidebarSnippetsBtn.addEventListener('click', () => setSidebarView('snippets'));
  }

  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      await handleRun();
    });
  }

  if (runSelectionBtn) {
    runSelectionBtn.addEventListener('click', async () => {
      await handleRunSelection();
    });
  }

  if (runCurrentBtn) {
    runCurrentBtn.addEventListener('click', async () => {
      await handleRunCurrentStatement();
    });
  }

  if (explainBtn) {
    explainBtn.addEventListener('click', async () => {
      await handleExplain();
    });
  }

  if (formatBtn) {
    formatBtn.addEventListener('click', () => {
      const source = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
      if (!source || !source.trim()) return;
      const active = getActiveConnection();
      const language = active && active.type === 'postgres' ? 'postgresql' : 'mysql';
      const formatted = formatSql(source, { language });
      if (codeEditor) codeEditor.setValue(formatted);
      else if (query) query.value = formatted;
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      adjustEditorFontSize(-1);
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      adjustEditorFontSize(1);
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      stopQueryProgress();
      const res = await safeApi.cancelQuery();
      if (!res || !res.ok) {
        await safeApi.showError((res && res.error) || 'Unable to cancel.');
      } else {
        setQueryStatus({ state: 'error', message: 'Canceled' });
      }
      if (runBtn) runBtn.disabled = false;
      if (runSelectionBtn) runSelectionBtn.disabled = false;
      if (runCurrentBtn) runCurrentBtn.disabled = false;
      if (explainBtn) explainBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    });
  }

  if (toggleEditorBtn) {
    toggleEditorBtn.addEventListener('click', () => {
      const isVisible = editorBody ? !editorBody.classList.contains('hidden') : true;
      setEditorVisible(!isVisible);
    });
  }

  if (saveSnippetEditorBtn) {
    saveSnippetEditorBtn.addEventListener('click', async () => {
      const sqlText = codeEditor ? codeEditor.getValue() : (query ? query.value : '');
      const trimmed = String(sqlText || '').trim();
      if (!trimmed) return;
      if (!getCurrentHistoryKey()) {
        if (safeApi.showError) await safeApi.showError('Connect to save snippets.');
        return;
      }
      const suggestion = trimmed.split('\n')[0].slice(0, 40);
      if (snippetsManager && typeof snippetsManager.openSnippetModal === 'function') {
        snippetsManager.openSnippetModal({ sql: trimmed, name: suggestion });
      }
    });
  }

  if (countBtn) {
    countBtn.addEventListener('click', async () => {
      const active = tableView ? tableView.getActive() : null;
      const source = active && (active.sourceSql || active.baseSql)
        ? (active.sourceSql || active.baseSql)
        : '';
      if (!source) {
        await safeApi.showError('Open a table first.');
        return;
      }
      const countSql = buildTableCountSql(source);
      if (!countSql) {
        await safeApi.showError('Count works only for table query (SELECT * FROM table).');
        return;
      }
      lastSort = null;
      await runSql(countSql, source);
    });
  }

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', async () => {
      await applyTableFilter();
    });
  }

  if (queryFilter) {
    queryFilter.addEventListener('input', () => {
      updateQueryFilterClearVisibility();
    });
    queryFilter.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyTableFilter();
      }
    });
  }

  if (queryFilterClear) {
    queryFilterClear.addEventListener('click', async () => {
      const hadFilter = !!(queryFilter && queryFilter.value.trim());
      if (queryFilter) {
        queryFilter.value = '';
        queryFilter.focus();
      }
      updateQueryFilterClearVisibility();
      if (hadFilter) {
        lastSort = null;
        await applyTableFilter();
      }
    });
  }
  updateQueryFilterClearVisibility();

  if (dbSelect) {
    dbSelect.addEventListener('change', async () => {
      const name = dbSelect.value;
      if (!name) return;
      await changeDatabase(name);
    });
  }

  if (refreshSchemaBtn) {
    refreshSchemaBtn.addEventListener('click', async () => {
      if (treeView) {
        setGlobalLoading(true, 'Refreshing schema...');
        const tables = await treeView.refresh();
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
        setGlobalLoading(false);
      }
    });
  }

  setScreen(false);
  setSettingsTab('general');
  applyQueryDefaultsToEditorControls(readStoredQueryDefaults());
  void loadEnvironmentPolicySettings({ silent: true });
  updateToggleEditorButtonState(true);
  void loadThemeMode();
  loadEditorFontSize();
  loadSidebarWidth();
  loadEditorHeight();
  initSidebarResizer();
  initEditorResizer();
  bindTabShortcuts();
  treeView = createTreeView({
    api: safeApi,
    tableList,
    tableSearch,
    tableSearchModeBtn,
    tableSearchClear,
    getActiveConnectionKey: getCurrentHistoryKey,
    getActiveConnection,
    onOpenTable: openTableFromNavigator,
    onOpenView: async (schema, name) => {
      await openViewDefinition(schema, name);
    },
    onToast: (message) => showToast(message)
  });
  codeEditor = createCodeEditor({ textarea: query });
  codeEditor.init();
  if (sqlAutocomplete) {
    codeEditor.setHintProvider({
      getHintOptions: () => sqlAutocomplete.getHintOptions(),
      prefetch: (editor) => sqlAutocomplete.prefetch(editor)
    });
  }
  if (snippetQueryInput) {
    snippetEditor = createCodeEditor({ textarea: snippetQueryInput, lineWrapping: true });
    snippetEditor.init();
    if (sqlAutocomplete) {
      snippetEditor.setHintProvider({
        getHintOptions: () => sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => sqlAutocomplete.prefetch(editor)
      });
    }
  }
  if (definitionQueryInput) {
    definitionEditor = createCodeEditor({ textarea: definitionQueryInput });
    definitionEditor.init();
    if (sqlAutocomplete) {
      definitionEditor.setHintProvider({
        getHintOptions: () => sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => sqlAutocomplete.prefetch(editor)
      });
    }
  }
  codeEditor.setHandlers({
    run: () => handleRun(),
    runSelection: () => handleRunSelection()
  });
  updateRunAvailability();
  tabTablesView = createTabTables({
    tabBar,
    newTabBtn,
    queryInput: query,
    getValue: () => (codeEditor ? codeEditor.getValue() : (query ? query.value : '')),
    setValue: (value) => {
      if (codeEditor) codeEditor.setValue(value || '');
      else if (query) query.value = value || '';
      refreshEditor();
    },
    onInput: (handler) => {
      if (codeEditor) codeEditor.onChange(() => {
        handler();
        updateRunAvailability();
      });
    },
    onChange: () => {
      if (!tabConnectionsView) return;
      const key = tabConnectionsView.getActiveKey();
      if (key) saveTabsForKey(key);
      if (tabTablesView) {
        const state = tabTablesView.getState();
        const ids = new Set((state.tabs || []).map((t) => t.id));
        for (const id of resultsByTabId.keys()) {
          if (!ids.has(id)) resultsByTabId.delete(id);
        }
        for (const id of outputByTabId.keys()) {
          if (!ids.has(id)) outputByTabId.delete(id);
        }
        for (const id of objectContextByTabId.keys()) {
          if (!ids.has(id)) objectContextByTabId.delete(id);
        }
      }
    },
    onActiveChange: (id) => {
      if (!id) {
        applyResultsPanelState({ snapshot: null, objectContext: null });
        setOutputDisplay(null);
        return;
      }
      const activeTab = tabTablesView ? tabTablesView.getActiveTab() : null;
      if (activeTab) {
        const visible = resolveEditorVisibility();
        activeTab.editorVisible = visible;
        setEditorVisible(visible, { persist: false });
      } else {
        setEditorVisible(true, { persist: false });
      }
      const snapshot = resultsByTabId.get(id) || null;
      const objectContext = getObjectContextForTab(id);
      applyResultsPanelState({ snapshot, objectContext });
      updateRunAvailability();
      updateOutputForActiveTab();
    }
  });
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => {
      setEditorVisible(true);
    });
  }
  historyManager = createQueryHistory({
    historyList,
    getCurrentHistoryKey,
    getActiveTab: () => (tabTablesView ? tabTablesView.getActiveTab() : null),
    isTableTab: () => false,
    isTableEditor: () => true,
    createNewQueryTab: (sql) => {
      if (!tabTablesView) return;
      tabTablesView.create();
      setEditorVisible(true);
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    setQueryValue: (sql) => {
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    }
  });
  snippetsManager = createSnippetsManager({
    snippetsList,
    addSnippetBtn,
    snippetModal,
    snippetModalBackdrop,
    snippetCloseBtn,
    snippetCancelBtn,
    snippetSaveBtn,
    snippetNameInput,
    snippetQueryInput,
    getSnippetValue: () => (snippetEditor ? snippetEditor.getValue() : (snippetQueryInput ? snippetQueryInput.value : '')),
    setSnippetValue: (value) => {
      if (snippetEditor) {
        snippetEditor.setValue(value || '');
        snippetEditor.refresh();
      } else if (snippetQueryInput) {
        snippetQueryInput.value = value || '';
      }
    },
    getCurrentHistoryKey,
    setQueryValue: (sql) => {
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    createNewQueryTab: (sql) => {
      if (!tabTablesView) return;
      tabTablesView.create();
      setEditorVisible(true);
      if (codeEditor) codeEditor.setValue(sql || '');
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    runSnippet: async (sql) => {
      const text = String(sql || '').trim();
      if (!text) return;
      if (codeEditor) codeEditor.setValue(text);
      if (tabTablesView) tabTablesView.syncActiveTabContent();
      lastSort = null;
      await runSql(text);
    },
    showError: safeApi.showError
  });
  const buildOrderBy = (sql, column, direction) => {
    const clean = normalizeSql(sql);
    if (!clean) return clean;
    const upper = clean.toUpperCase();
    const limitIndex = upper.lastIndexOf(' LIMIT ');
    const offsetIndex = upper.lastIndexOf(' OFFSET ');
    let cutIndex = -1;
    if (limitIndex !== -1) cutIndex = limitIndex;
    if (offsetIndex !== -1) cutIndex = cutIndex === -1 ? offsetIndex : Math.min(cutIndex, offsetIndex);

    let base = clean;
    let suffix = '';
    if (cutIndex !== -1) {
      base = clean.slice(0, cutIndex).trimEnd();
      suffix = clean.slice(cutIndex).trimStart();
    }

    const upperBase = base.toUpperCase();
    const orderIndex = upperBase.lastIndexOf(' ORDER BY ');
    if (orderIndex !== -1) {
      base = base.slice(0, orderIndex).trimEnd();
    }

    const orderSql = `${base} ORDER BY ${quoteIdentifier(column)} ${direction.toUpperCase()}`;
    return suffix ? `${orderSql} ${suffix}` : orderSql;
  };

  const rerunSortedQuery = async (column, active) => {
    const base = active && active.baseSql ? active.baseSql : '';
    if (!base) return;
    if (lastSort && lastSort.column === column) {
      if (lastSort.direction === 'asc') {
        lastSort = { column, direction: 'desc' };
        const orderSql = buildOrderBy(base, column, 'desc');
        if (orderSql) await runSql(orderSql);
        return;
      }
      if (lastSort.direction === 'desc') {
        lastSort = null;
        await runSql(base);
        return;
      }
    }
    lastSort = { column, direction: 'asc' };
    const orderSql = buildOrderBy(base, column, 'asc');
    if (!orderSql) return;
    await runSql(orderSql);
  };

  tableView = createTableView({
    resultsTable,
    resultsEmptyState,
    tableActionsBar,
    copyCellBtn,
    copyRowBtn,
    exportCsvBtn,
    exportJsonBtn,
    onShowError: safeApi.showError,
    onToast: (message) => showToast(message),
    onSort: rerunSortedQuery
  });
  tableObjectTabsView = createTableObjectTabs({
    container: tableObjectTabs,
    detailsContainer: objectDetailsPanel,
    resultsToolbar: tableActionsBar,
    resultsTableWrap,
    getScopeKey: getCurrentHistoryKey,
    listColumns: (payload) => safeApi.listColumns(payload),
    listTableInfo: (payload) => safeApi.listTableInfo(payload),
    getTableDefinition: (payload) => safeApi.getTableDefinition(payload),
    listTables: () => safeApi.listTables(),
    onShowError: safeApi.showError,
    onToast: (message) => showToast(message)
  });
  tabConnectionsView = createTabConnections({
    container: tabConnections,
    getTitle: (entry) => connectionTitle(entry),
    onSelect: (_key, entry, previousKey) => {
      activateConnection(entry, previousKey);
    },
    onClose: async (key, entry) => {
      if (!tabConnectionsView) return;
      const wasActive = tabConnectionsView.getActiveKey() === key;
      tabConnectionsView.remove(key);
      renderConnectionTabs();
      if (tabConnectionsView.size() === 0) {
        try {
          await safeApi.disconnect();
        } catch (_) {}
        setScreen(false);
        updateToggleEditorButtonState(true);
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
}
