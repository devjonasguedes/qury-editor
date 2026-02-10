import { format as formatSql } from "sql-formatter";

import {
  getConnectionScopeKey,
  connectionTitle,
  getEntrySshConfig,
  getEntryPolicyMode,
  isEntryReadOnly,
  isEntrySsh,
} from "./modules/connectionUtils.js";
import { readJson, writeJson } from "./modules/storage.js";
import { createTreeView } from "./modules/treeView.js";
import { createTabConnections } from "./modules/tabConnections.js";
import { createTabTables } from "./modules/tabTables.js";
import { createCodeEditor } from "./modules/codeEditor.js";
import { createTableView } from "./modules/tableView.js";
import { createTableObjectTabs } from "./modules/tableObjectTabs.js";
import { createQueryHistory } from "./modules/queryHistory.js";
import { createSnippetsManager } from "./modules/snippets.js";
import { createSqlAutocomplete } from "./modules/sqlAutocomplete.js";
import { createSavedConnections } from "./components/saved-connections.js";
import { createConnectModal } from "./components/connect-modal.js";
import { createQuickConnect } from "./components/quick-connect.js";
import { createCredentialModal } from "./components/credential-modal.js";
import { createSettingsModal } from "./components/settings-modal.js";
import {
  firstDmlKeyword,
  insertWhere,
  isDangerousStatement,
  splitStatements,
  splitStatementsWithRanges,
  stripLeadingComments,
} from "./sql.js";

const THEME_KEY = "sqlEditor.theme";
const THEME_MODE_SYSTEM = "system";
const THEME_MODE_LIGHT = "light";
const THEME_MODE_DARK = "dark";
const SIDEBAR_KEY = "sqlEditor.sidebarWidth";
const EDITOR_HEIGHT_KEY = "sqlEditor.editorHeight";
const EDITOR_FONT_SIZE_KEY = "sqlEditor.editorFontSize";
const EDITOR_COLLAPSED_KEY_PREFIX = "sqlEditor.editorCollapsed";
const QUERY_DEFAULT_LIMIT_KEY = "sqlEditor.defaultLimit";
const QUERY_DEFAULT_TIMEOUT_KEY = "sqlEditor.defaultTimeout";
const SESSION_TIMEZONE_KEY = "sqlEditor.sessionTimezone";
const CONNECTION_OPEN_TIMEOUT_KEY = "sqlEditor.connectionOpenTimeoutMs";
const CONNECTION_CLOSE_TIMEOUT_KEY = "sqlEditor.connectionCloseTimeoutMs";
const CONNECTION_VALIDATION_TIMEOUT_KEY =
  "sqlEditor.connectionValidationTimeoutMs";
const ERROR_STOP_ON_FIRST_KEY = "sqlEditor.errorStopOnFirst";
const ERROR_CONTINUE_ON_ERROR_KEY = "sqlEditor.errorContinueOnError";
const ERROR_AUTO_OPEN_OUTPUT_KEY = "sqlEditor.errorAutoOpenOutput";
const ERROR_SHOW_DETAILED_CODE_KEY = "sqlEditor.errorShowDetailedCode";
const ERROR_HIDE_SENSITIVE_KEY = "sqlEditor.errorHideSensitive";
const ERROR_RETRY_TRANSIENT_KEY = "sqlEditor.errorRetryTransient";
const QUERY_DEFAULTS = Object.freeze({
  limit: "100",
  timeoutMs: "30000",
});
const CONNECTION_TIMEOUT_DEFAULTS = Object.freeze({
  openMs: "10000",
  closeMs: "5000",
  validationMs: "10000",
});
const ERROR_HANDLING_DEFAULTS = Object.freeze({
  stopOnFirstError: true,
  continueOnError: false,
  autoOpenOutputOnError: true,
  showDetailedDbErrorCode: true,
  hideSensitiveValuesInErrors: true,
  retryTransientSelectErrors: false,
});
const DEFAULT_SESSION_TIMEZONE = "UTC";
const SESSION_TIMEZONE_SYSTEM = "SYSTEM";
const SESSION_TIMEZONE_SYSTEM_LABEL = "Use system timezone";
const SESSION_TIMEZONE_ITEMS = Object.freeze([
  { id: "UTC", label: "UTC", offset: 0, gmt: "GMT+00:00" },

  {
    id: "America/Sao_Paulo",
    label: "Brasilia / Sao Paulo",
    offset: -180,
    gmt: "GMT-03:00",
  },
  { id: "America/Manaus", label: "Manaus", offset: -240, gmt: "GMT-04:00" },
  { id: "America/Cuiaba", label: "Cuiaba", offset: -240, gmt: "GMT-04:00" },
  { id: "America/Belem", label: "Belem", offset: -180, gmt: "GMT-03:00" },
  {
    id: "America/Porto_Velho",
    label: "Porto Velho",
    offset: -240,
    gmt: "GMT-04:00",
  },
  {
    id: "America/Rio_Branco",
    label: "Rio Branco",
    offset: -300,
    gmt: "GMT-05:00",
  },
  {
    id: "America/Noronha",
    label: "Fernando de Noronha",
    offset: -120,
    gmt: "GMT-02:00",
  },

  {
    id: "America/New_York",
    label: "New York (ET)",
    offset: -300,
    gmt: "GMT-05:00",
  },
  {
    id: "America/Chicago",
    label: "Chicago (CT)",
    offset: -360,
    gmt: "GMT-06:00",
  },
  {
    id: "America/Denver",
    label: "Denver (MT)",
    offset: -420,
    gmt: "GMT-07:00",
  },
  {
    id: "America/Los_Angeles",
    label: "Los Angeles (PT)",
    offset: -480,
    gmt: "GMT-08:00",
  },
  { id: "America/Phoenix", label: "Phoenix", offset: -420, gmt: "GMT-07:00" },
  { id: "America/Toronto", label: "Toronto", offset: -300, gmt: "GMT-05:00" },
  {
    id: "America/Vancouver",
    label: "Vancouver",
    offset: -480,
    gmt: "GMT-08:00",
  },

  {
    id: "America/Mexico_City",
    label: "Mexico City",
    offset: -360,
    gmt: "GMT-06:00",
  },
  { id: "America/Bogota", label: "Bogota", offset: -300, gmt: "GMT-05:00" },
  { id: "America/Lima", label: "Lima", offset: -300, gmt: "GMT-05:00" },
  { id: "America/Santiago", label: "Santiago", offset: -240, gmt: "GMT-04:00" },
  {
    id: "America/Buenos_Aires",
    label: "Buenos Aires",
    offset: -180,
    gmt: "GMT-03:00",
  },
  {
    id: "America/Montevideo",
    label: "Montevideo",
    offset: -180,
    gmt: "GMT-03:00",
  },
  { id: "America/Asuncion", label: "Asuncion", offset: -240, gmt: "GMT-04:00" },
  { id: "America/Caracas", label: "Caracas", offset: -240, gmt: "GMT-04:00" },

  { id: "Europe/London", label: "London", offset: 0, gmt: "GMT+00:00" },
  { id: "Europe/Dublin", label: "Dublin", offset: 0, gmt: "GMT+00:00" },
  { id: "Europe/Lisbon", label: "Lisbon", offset: 0, gmt: "GMT+00:00" },
  { id: "Europe/Paris", label: "Paris", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Madrid", label: "Madrid", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Berlin", label: "Berlin", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Rome", label: "Rome", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Amsterdam", label: "Amsterdam", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Brussels", label: "Brussels", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Zurich", label: "Zurich", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Vienna", label: "Vienna", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Stockholm", label: "Stockholm", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Warsaw", label: "Warsaw", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Athens", label: "Athens", offset: 120, gmt: "GMT+02:00" },
  { id: "Europe/Helsinki", label: "Helsinki", offset: 120, gmt: "GMT+02:00" },
  { id: "Europe/Istanbul", label: "Istanbul", offset: 180, gmt: "GMT+03:00" },
  { id: "Europe/Moscow", label: "Moscow", offset: 180, gmt: "GMT+03:00" },

  {
    id: "Africa/Johannesburg",
    label: "Johannesburg",
    offset: 120,
    gmt: "GMT+02:00",
  },
  { id: "Africa/Cairo", label: "Cairo", offset: 120, gmt: "GMT+02:00" },
  { id: "Africa/Nairobi", label: "Nairobi", offset: 180, gmt: "GMT+03:00" },
  { id: "Africa/Lagos", label: "Lagos", offset: 60, gmt: "GMT+01:00" },
  {
    id: "Africa/Casablanca",
    label: "Casablanca",
    offset: 60,
    gmt: "GMT+01:00",
  },

  { id: "Asia/Dubai", label: "Dubai", offset: 240, gmt: "GMT+04:00" },
  { id: "Asia/Riyadh", label: "Riyadh", offset: 180, gmt: "GMT+03:00" },
  { id: "Asia/Kolkata", label: "Kolkata", offset: 330, gmt: "GMT+05:30" },
  { id: "Asia/Bangkok", label: "Bangkok", offset: 420, gmt: "GMT+07:00" },
  { id: "Asia/Singapore", label: "Singapore", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Hong_Kong", label: "Hong Kong", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Shanghai", label: "Shanghai", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Taipei", label: "Taipei", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Seoul", label: "Seoul", offset: 540, gmt: "GMT+09:00" },
  { id: "Asia/Tokyo", label: "Tokyo", offset: 540, gmt: "GMT+09:00" },
  { id: "Asia/Jakarta", label: "Jakarta", offset: 420, gmt: "GMT+07:00" },
  { id: "Asia/Manila", label: "Manila", offset: 480, gmt: "GMT+08:00" },

  { id: "Australia/Sydney", label: "Sydney", offset: 600, gmt: "GMT+10:00" },
  {
    id: "Australia/Melbourne",
    label: "Melbourne",
    offset: 600,
    gmt: "GMT+10:00",
  },
  {
    id: "Australia/Brisbane",
    label: "Brisbane",
    offset: 600,
    gmt: "GMT+10:00",
  },
  { id: "Australia/Perth", label: "Perth", offset: 480, gmt: "GMT+08:00" },
  { id: "Pacific/Auckland", label: "Auckland", offset: 720, gmt: "GMT+12:00" },
]);
const SESSION_TIMEZONE_VALUES = new Set(
  SESSION_TIMEZONE_ITEMS.map((item) => item.id),
);
const SESSION_TIMEZONE_ITEM_BY_ID = new Map(
  SESSION_TIMEZONE_ITEMS.map((item) => [item.id, item]),
);
const QUERY_PROGRESS_SHOW_DELAY_MS = 5000;
const SERVER_PAGE_SIZE_DEFAULT = 100;
const SERVER_PAGE_SIZE_MAX = 1000;
const POLICY_MODE_DEV = "dev";
const POLICY_MODE_STAGING = "staging";
const POLICY_MODE_PROD = "prod";
const POLICY_APPROVAL_TOKEN = "PROCEED";
const ENVIRONMENT_POLICY_DEFAULTS = Object.freeze({
  [POLICY_MODE_DEV]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: true,
    requireApproval: false,
  }),
  [POLICY_MODE_STAGING]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: false,
    requireApproval: true,
  }),
  [POLICY_MODE_PROD]: Object.freeze({
    allowWrite: false,
    allowDdlAdmin: false,
    requireApproval: false,
  }),
});
const POLICY_WRITE_KEYWORDS = new Set([
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "replace",
  "copy",
]);
const POLICY_DDL_ADMIN_KEYWORDS = new Set([
  "create",
  "alter",
  "drop",
  "truncate",
  "rename",
  "comment",
  "grant",
  "revoke",
  "call",
  "do",
  "refresh",
  "reindex",
  "cluster",
  "vacuum",
  "analyze",
]);

export function initHome({ api }) {
  const byId = (id) => document.getElementById(id);

  const dbType = byId("dbType");
  const sqliteFields = byId("sqliteFields");
  const sqliteModeCreate = byId("sqliteModeCreate");
  const sqliteModeExisting = byId("sqliteModeExisting");
  const sqlitePath = byId("sqlitePath");
  const sqliteBrowseBtn = byId("sqliteBrowseBtn");
  const connectionUrl = byId("connectionUrl");
  const host = byId("host");
  const port = byId("port");
  const user = byId("user");
  const password = byId("password");
  const database = byId("database");
  const saveName = byId("saveName");
  const rememberPassword = byId("rememberPassword");
  const readOnly = byId("readOnly");
  const policyMode = byId("policyMode");
  const tabDirectBtn = byId("tabDirectBtn");
  const tabSshBtn = byId("tabSshBtn");
  const sshHost = byId("sshHost");
  const sshPort = byId("sshPort");
  const sshUser = byId("sshUser");
  const sshPassword = byId("sshPassword");
  const sshPrivateKey = byId("sshPrivateKey");
  const sshPassphrase = byId("sshPassphrase");
  const sshLocalPort = byId("sshLocalPort");
  const sshFields = byId("sshFields");
  const connectBtn = byId("connectBtn");
  const saveBtn = byId("saveBtn");
  const testBtn = byId("testBtn");
  const clearFormBtn = byId("clearFormBtn");
  const cancelEditBtn = byId("cancelEditBtn");
  const savedList = byId("savedList");
  const savedPolicyFilters = byId("savedPolicyFilters");
  const importConnectionsBtn = byId("importConnectionsBtn");
  const exportConnectionsBtn = byId("exportConnectionsBtn");
  const mainScreen = byId("mainScreen");
  const welcomeScreen = byId("welcomeScreen");
  const connectSpinner = byId("connectSpinner");
  const tabConnections = byId("tabConnections");
  const openConnectModalBtn = byId("openConnectModalBtn");
  const quickConnectBtn = byId("quickConnectBtn");
  const heroCreditLink = document.querySelector(".hero-credit a");
  const closeConnectModalBtn = byId("closeConnectModalBtn");
  const homeBtn = byId("homeBtn");
  const connectModal = byId("connectModal");
  const connectModalBackdrop = byId("connectModalBackdrop");
  const connectModalTitle = byId("connectModalTitle");
  const connectModalSubtitle = byId("connectModalSubtitle");
  const connectSettingsTabs = byId("connectSettingsTabs");
  const connectSectionConnection = byId("connectSectionConnection");
  const connectSectionAccess = byId("connectSectionAccess");
  const connectSectionSave = byId("connectSectionSave");
  const credentialModal = byId("credentialModal");
  const credentialModalBackdrop = byId("credentialModalBackdrop");
  const credentialModalTitle = byId("credentialModalTitle");
  const credentialModalSubtitle = byId("credentialModalSubtitle");
  const credentialDbPassword = byId("credentialDbPassword");
  const credentialSshFields = byId("credentialSshFields");
  const credentialSshPassword = byId("credentialSshPassword");
  const credentialSshPrivateKey = byId("credentialSshPrivateKey");
  const credentialSshPassphrase = byId("credentialSshPassphrase");
  const credentialCloseBtn = byId("credentialCloseBtn");
  const credentialCancelBtn = byId("credentialCancelBtn");
  const credentialConfirmBtn = byId("credentialConfirmBtn");
  const policyApprovalModal = byId("policyApprovalModal");
  const policyApprovalModalBackdrop = byId("policyApprovalModalBackdrop");
  const policyApprovalTitle = byId("policyApprovalTitle");
  const policyApprovalSubtitle = byId("policyApprovalSubtitle");
  const policyApprovalInput = byId("policyApprovalInput");
  const policyApprovalCloseBtn = byId("policyApprovalCloseBtn");
  const policyApprovalCancelBtn = byId("policyApprovalCancelBtn");
  const policyApprovalConfirmBtn = byId("policyApprovalConfirmBtn");
  const themeToggle = byId("themeToggle");
  const themeMenu = byId("themeMenu");
  const openSettingsBtn = byId("openSettingsBtn");
  const sidebarTreeBtn = byId("sidebarTreeBtn");
  const sidebarHistoryBtn = byId("sidebarHistoryBtn");
  const sidebarSnippetsBtn = byId("sidebarSnippetsBtn");
  const tablePanel = byId("tablePanel");
  const historyPanel = byId("historyPanel");
  const historyList = byId("historyList");
  const snippetsPanel = byId("snippetsPanel");
  const snippetsList = byId("snippetsList");
  const addSnippetBtn = byId("addSnippetBtn");
  const snippetModal = byId("snippetModal");
  const snippetModalBackdrop = byId("snippetModalBackdrop");
  const snippetCloseBtn = byId("snippetCloseBtn");
  const snippetCancelBtn = byId("snippetCancelBtn");
  const snippetSaveBtn = byId("snippetSaveBtn");
  const snippetNameInput = byId("snippetNameInput");
  const snippetQueryInput = byId("snippetQueryInput");
  const tableList = byId("tableList");
  const tableSearch = byId("tableSearch");
  const tableSearchModeBtn = byId("tableSearchModeBtn");
  const tableSearchClear = byId("tableSearchClear");
  const sidebarShell = byId("sidebarShell");
  const dbSelect = byId("dbSelect");
  const dbSelectWrap = byId("dbSelectWrap");
  const sidebarResizer = byId("sidebarResizer");
  const editorResizer = byId("editorResizer");
  const sidebar = document.querySelector(".tables");
  const editorPanel = document.querySelector(".editor");
  const editorBody = document.querySelector(".editor-body");
  const mainLayout = document.querySelector(".main");
  const workspace = document.querySelector(".workspace");
  const resultsPanel = byId("resultsPanel");
  const tableObjectTabs = byId("tableObjectTabs");
  const objectDetailsPanel = byId("objectDetailsPanel");
  const resultsTableWrap = byId("resultsTableWrap");
  const resultsEmptyState = byId("resultsEmptyState");
  const resultsTable = byId("resultsTable");
  const queryStatus = byId("queryStatus");
  const queryOutputBtn = byId("queryOutputBtn");
  const queryOutputPreview = byId("queryOutputPreview");
  const tableActionsBar = byId("tableActionsBar");
  const tablePagination = byId("tablePagination");
  const pagePrevBtn = byId("pagePrevBtn");
  const pageNextBtn = byId("pageNextBtn");
  const pageInfo = byId("pageInfo");
  const copyCellBtn = byId("copyCellBtn");
  const copyRowBtn = byId("copyRowBtn");
  const exportCsvBtn = byId("exportCsvBtn");
  const exportJsonBtn = byId("exportJsonBtn");
  const refreshSchemaBtn = byId("refreshSchemaBtn");
  const tabBar = byId("tabBar");
  const newTabBtn = byId("newTabBtn");
  const query = byId("query");
  const runBtn = byId("runBtn");
  const runSelectionBtn = byId("runSelectionBtn");
  const runCurrentBtn = byId("runCurrentBtn");
  const formatBtn = byId("formatBtn");
  const zoomOutBtn = byId("zoomOutBtn");
  const zoomInBtn = byId("zoomInBtn");
  const explainBtn = byId("explainBtn");
  const explainAnalyzeBtn = byId("explainAnalyzeBtn");
  const stopBtn = byId("stopBtn");
  const limitSelect = byId("limitSelect");
  const timeoutSelect = byId("timeoutSelect");
  const toggleEditorBtn = byId("toggleEditorBtn");
  const saveSnippetEditorBtn = byId("saveSnippetEditorBtn");
  const countBtn = byId("countBtn");
  const queryFilter = byId("queryFilter");
  const queryFilterClear = byId("queryFilterClear");
  const applyFilterBtn = byId("applyFilterBtn");
  let globalLoading = byId("globalLoading");

  const outputModal = byId("outputModal");
  const outputModalBackdrop = byId("outputModalBackdrop");
  const outputLogBody = byId("outputLogBody");
  const outputModalSubtitle = byId("outputModalSubtitle");
  const outputCloseBtn = byId("outputCloseBtn");
  const outputCloseBtnBottom = byId("outputCloseBtnBottom");
  const outputCopyBtn = byId("outputCopyBtn");
  const toast = byId("toast");
  const definitionModal = byId("definitionModal");
  const definitionModalBackdrop = byId("definitionModalBackdrop");
  const definitionCloseBtn = byId("definitionCloseBtn");
  const definitionTitle = byId("definitionTitle");
  const definitionSubtitle = byId("definitionSubtitle");
  const definitionFormatBtn = byId("definitionFormatBtn");
  const definitionCopyBtn = byId("definitionCopyBtn");
  const definitionSaveBtn = byId("definitionSaveBtn");
  const definitionQueryInput = byId("definitionQueryInput");
  const settingsModal = byId("settingsModal");
  const settingsModalBackdrop = byId("settingsModalBackdrop");
  const settingsCloseBtn = byId("settingsCloseBtn");
  const settingsCancelBtn = byId("settingsCancelBtn");
  const settingsSaveBtn = byId("settingsSaveBtn");
  const settingsResetDefaultsBtn = byId("settingsResetDefaultsBtn");
  const settingsTabs = byId("settingsTabs");
  const settingsPanelGeneral = byId("settingsPanelGeneral");
  const settingsPanelErrorsTimeouts = byId("settingsPanelErrorsTimeouts");
  const settingsPanelEnvironments = byId("settingsPanelEnvironments");
  const settingsSessionTimezoneCombobox = byId(
    "settingsSessionTimezoneCombobox",
  );
  const settingsSessionTimezone = byId("settingsSessionTimezone");
  const settingsSessionTimezoneToggle = byId("settingsSessionTimezoneToggle");
  const settingsSessionTimezoneMenu = byId("settingsSessionTimezoneMenu");
  const settingsSessionTimezoneOptions = byId("settingsSessionTimezoneOptions");
  const settingsConnectionOpenTimeout = byId("settingsConnectionOpenTimeout");
  const settingsConnectionCloseTimeout = byId("settingsConnectionCloseTimeout");
  const settingsConnectionValidationTimeout = byId(
    "settingsConnectionValidationTimeout",
  );
  const settingsErrorStopOnFirst = byId("settingsErrorStopOnFirst");
  const settingsErrorContinueOnError = byId("settingsErrorContinueOnError");
  const settingsErrorAutoOpenOutput = byId("settingsErrorAutoOpenOutput");
  const settingsErrorShowDetailedCode = byId("settingsErrorShowDetailedCode");
  const settingsErrorHideSensitive = byId("settingsErrorHideSensitive");
  const settingsErrorRetryTransient = byId("settingsErrorRetryTransient");
  const settingsDefaultLimit = byId("settingsDefaultLimit");
  const settingsDefaultTimeout = byId("settingsDefaultTimeout");
  const envPolicyDevAllowWrite = byId("envPolicyDevAllowWrite");
  const envPolicyDevAllowDdl = byId("envPolicyDevAllowDdl");
  const envPolicyDevRequireApproval = byId("envPolicyDevRequireApproval");
  const envPolicyStagingAllowWrite = byId("envPolicyStagingAllowWrite");
  const envPolicyStagingAllowDdl = byId("envPolicyStagingAllowDdl");
  const envPolicyStagingRequireApproval = byId(
    "envPolicyStagingRequireApproval",
  );
  const envPolicyProdAllowWrite = byId("envPolicyProdAllowWrite");
  const envPolicyProdAllowDdl = byId("envPolicyProdAllowDdl");
  const envPolicyProdRequireApproval = byId("envPolicyProdRequireApproval");

  let isConnecting = false;
  let isEditingConnection = false;
  let treeView = null;
  let tabConnectionsView = null;
  let tabTablesView = null;
  let codeEditor = null;
  let snippetEditor = null;
  let definitionEditor = null;
  let activeDefinitionTarget = null;
  let isSavingDefinition = false;
  let tableView = null;
  let tableObjectTabsView = null;
  let lastSort = null;
  let resultsByTabId = new Map();
  let objectContextByTabId = new Map();
  let columnKeyMetaByTableKey = new Map();
  let columnKeyMetaRequestSeq = 0;
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
  let activeSettingsTab = "general";
  let activeConnectSettingsTab = "connection";
  let activeConnectMode = "full";
  let sessionTimezoneOptionItems = [];
  let sessionTimezoneVisibleItems = [];
  let sessionTimezoneHighlightedIndex = -1;
  let sessionTimezoneMenuOpen = false;
  let removeNativeThemeListener = null;
  let currentThemeMode = THEME_MODE_SYSTEM;
  let systemPrefersDark = true;
  const DEFAULT_EDITOR_FONT_SIZE = 14;
  const MIN_EDITOR_FONT_SIZE = 12;
  const MAX_EDITOR_FONT_SIZE = 16;
  let policyApprovalPromptResolver = null;

  const dbApi =
    typeof window !== "undefined" && window.api && window.api.db
      ? window.api.db
      : api || {};
  const electronApi =
    typeof window !== "undefined" && window.api && window.api.electron
      ? window.api.electron
      : api || {};

  const safeApi = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "showError") {
          if (electronApi && typeof electronApi.showError === "function")
            return electronApi.showError;
          if (dbApi && typeof dbApi.showError === "function")
            return dbApi.showError;
          return async (message) => {
            console.error("API unavailable:", message);
            if (message) alert(message);
          };
        }
        if (prop === "setProgressBar") {
          if (electronApi && typeof electronApi.setProgressBar === "function")
            return electronApi.setProgressBar;
          if (dbApi && typeof dbApi.setProgressBar === "function")
            return dbApi.setProgressBar;
          return async () => ({ ok: false, error: "API unavailable." });
        }
        if (dbApi && typeof dbApi[prop] !== "undefined") {
          return dbApi[prop];
        }
        return async () => ({ ok: false, error: "API unavailable." });
      },
    },
  );

  const ensureGlobalLoading = () => {
    if (globalLoading) return globalLoading;
    const overlay = document.createElement("div");
    overlay.id = "globalLoading";
    overlay.className = "global-loading hidden";
    const card = document.createElement("div");
    card.className = "global-loading-card";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    const label = document.createElement("span");
    label.textContent = "Connecting...";
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
    toast.classList.remove("hidden");
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.classList.add("hidden");
      }, 200);
    }, duration);
  };

  const setGlobalLoading = (loading, labelText) => {
    const overlay = ensureGlobalLoading();
    if (overlay) {
      const label = overlay.querySelector("span:last-child");
      if (label && labelText) label.textContent = labelText;
      overlay.classList.toggle("hidden", !loading);
    }
  };

  const normalizeThemeMode = (value) => {
    const mode = String(value || "").toLowerCase();
    if (
      mode === THEME_MODE_LIGHT ||
      mode === THEME_MODE_DARK ||
      mode === THEME_MODE_SYSTEM
    ) {
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
    if (mode === THEME_MODE_LIGHT) return "Light";
    if (mode === THEME_MODE_DARK) return "Dark";
    return "System";
  };

  const themeModeIcon = (mode) => {
    if (mode === THEME_MODE_LIGHT) return "bi-sun";
    if (mode === THEME_MODE_DARK) return "bi-moon-stars";
    return "bi-circle-half";
  };

  const applyTheme = (theme) => {
    const next =
      theme === THEME_MODE_LIGHT ? THEME_MODE_LIGHT : THEME_MODE_DARK;
    document.body.classList.toggle("theme-light", next === "light");
    if (codeEditor && typeof codeEditor.setTheme === "function") {
      codeEditor.setTheme();
      codeEditor.refresh();
    }
    if (snippetEditor && typeof snippetEditor.setTheme === "function") {
      snippetEditor.setTheme();
      snippetEditor.refresh();
    }
  };

  const updateThemeUi = () => {
    if (themeToggle) {
      themeToggle.innerHTML = `<i class="bi ${themeModeIcon(currentThemeMode)}"></i>`;
      themeToggle.title = `Theme: ${themeModeLabel(currentThemeMode)}`;
      themeToggle.setAttribute(
        "aria-label",
        `Theme: ${themeModeLabel(currentThemeMode)}`,
      );
    }
    if (themeMenu) {
      const items = themeMenu.querySelectorAll("[data-theme-mode]");
      items.forEach((item) => {
        const selected =
          item.getAttribute("data-theme-mode") === currentThemeMode;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-checked", selected ? "true" : "false");
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
    themeMenu.classList.toggle("hidden", !open);
    themeToggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const applySystemThemeSnapshot = (payload) => {
    if (!payload || typeof payload.shouldUseDarkColors !== "boolean") return;
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
      if (res && res.ok && typeof res.shouldUseDarkColors === "boolean") {
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
        ...(source[POLICY_MODE_DEV] ||
          ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV]),
      },
      [POLICY_MODE_STAGING]: {
        ...(source[POLICY_MODE_STAGING] ||
          ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_STAGING]),
      },
      [POLICY_MODE_PROD]: {
        ...(source[POLICY_MODE_PROD] ||
          ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_PROD]),
      },
    };
  };

  const normalizeEnvironmentPolicyRule = (input, fallback) => {
    const source = input && typeof input === "object" ? input : {};
    const base = fallback || ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV];
    return {
      allowWrite:
        source.allowWrite !== undefined
          ? !!source.allowWrite
          : !!base.allowWrite,
      allowDdlAdmin:
        source.allowDdlAdmin !== undefined
          ? !!source.allowDdlAdmin
          : !!base.allowDdlAdmin,
      requireApproval:
        source.requireApproval !== undefined
          ? !!source.requireApproval
          : !!base.requireApproval,
    };
  };

  const normalizeEnvironmentPolicyRules = (input) => {
    const source = input && typeof input === "object" ? input : {};
    return {
      [POLICY_MODE_DEV]: normalizeEnvironmentPolicyRule(
        source[POLICY_MODE_DEV],
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV],
      ),
      [POLICY_MODE_STAGING]: normalizeEnvironmentPolicyRule(
        source[POLICY_MODE_STAGING],
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_STAGING],
      ),
      [POLICY_MODE_PROD]: normalizeEnvironmentPolicyRule(
        source[POLICY_MODE_PROD],
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_PROD],
      ),
    };
  };

  const resolveEnvironmentPoliciesPayload = (payload) => {
    if (!payload || typeof payload !== "object") return payload;
    if (payload.policies && typeof payload.policies === "object")
      return payload.policies;
    if (payload.environments && typeof payload.environments === "object")
      return payload.environments;
    return payload;
  };

  const setEnvironmentPolicyRules = (rules) => {
    environmentPolicyRules = normalizeEnvironmentPolicyRules(
      resolveEnvironmentPoliciesPayload(rules),
    );
    return environmentPolicyRules;
  };

  const getEnvironmentPolicyRules = () => {
    if (!environmentPolicyRules) {
      environmentPolicyRules = cloneEnvironmentPolicyRules(
        ENVIRONMENT_POLICY_DEFAULTS,
      );
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
    const target = String(value || "");
    return Array.from(select.options).some((option) => option.value === target);
  };

  const SESSION_TIMEZONE_OFFSET_RE = /^([+-])(0\d|1[0-4]):([0-5]\d)$/;
  const SESSION_TIMEZONE_IANA_RE = /^[A-Za-z_]+\/[A-Za-z0-9_\-+/]+$/;

  const coerceOffsetTimezone = (value) => {
    const text = String(value || "").trim();
    const match = text.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return "";
    const sign = match[1];
    const hour = Number(match[2] || 0);
    const minute = Number(match[3] || 0);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
    if (hour < 0 || hour > 14 || minute < 0 || minute > 59) return "";
    return `${sign}${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const extractSessionTimezoneToken = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const labelMatch = text.match(/^(.+?)\s+\(UTC[+-]\d{2}:\d{2}\)$/i);
    if (labelMatch && labelMatch[1]) return String(labelMatch[1]).trim();
    return text;
  };

  const resolveSystemSessionTimezone = () => {
    try {
      const systemTimezone = String(
        Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      ).trim();
      if (SESSION_TIMEZONE_VALUES.has(systemTimezone)) return systemTimezone;
      if (SESSION_TIMEZONE_IANA_RE.test(systemTimezone)) return systemTimezone;
    } catch (_) {
      // no-op
    }
    return DEFAULT_SESSION_TIMEZONE;
  };

  const normalizeSessionTimezone = (value) => {
    const token = extractSessionTimezoneToken(value);
    if (!token) return DEFAULT_SESSION_TIMEZONE;
    if (token.toUpperCase() === DEFAULT_SESSION_TIMEZONE)
      return DEFAULT_SESSION_TIMEZONE;
    if (token.toUpperCase() === SESSION_TIMEZONE_SYSTEM)
      return SESSION_TIMEZONE_SYSTEM;
    if (/^use system timezone\b/i.test(token)) return SESSION_TIMEZONE_SYSTEM;
    const offset = coerceOffsetTimezone(token);
    if (offset) return offset;
    if (SESSION_TIMEZONE_VALUES.has(token)) return token;
    if (SESSION_TIMEZONE_IANA_RE.test(token)) return token;
    return DEFAULT_SESSION_TIMEZONE;
  };

  const resolveUtcOffsetLabel = (timezone) => {
    const normalized = normalizeSessionTimezone(timezone);
    if (normalized === DEFAULT_SESSION_TIMEZONE) return "UTC+00:00";
    if (normalized === SESSION_TIMEZONE_SYSTEM) {
      const effective = resolveSystemSessionTimezone();
      return resolveUtcOffsetLabel(effective);
    }
    if (SESSION_TIMEZONE_OFFSET_RE.test(normalized)) return `UTC${normalized}`;
    const preset = SESSION_TIMEZONE_ITEM_BY_ID.get(normalized);
    if (preset && typeof preset.gmt === "string") {
      const utc = preset.gmt.trim().replace(/^GMT/i, "UTC");
      if (/^UTC[+-]\d{2}:\d{2}$/.test(utc)) return utc;
    }
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: normalized,
        timeZoneName: "shortOffset",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const raw = String(
        (parts.find((part) => part.type === "timeZoneName") || {}).value || "",
      )
        .replace("−", "-")
        .trim();
      if (!raw) return "UTC+00:00";
      if (raw === "GMT" || raw === "UTC") return "UTC+00:00";
      const match = raw.match(/(?:GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
      if (!match) return "UTC+00:00";
      const sign = String(match[1]).startsWith("-") ? "-" : "+";
      const hour = String(Math.abs(Number(match[1]))).padStart(2, "0");
      const minute = String(match[2] || "00").padStart(2, "0");
      return `UTC${sign}${hour}:${minute}`;
    } catch (_) {
      return "UTC+00:00";
    }
  };

  const buildSessionTimezoneDisplay = (timezone) => {
    const normalized = normalizeSessionTimezone(timezone);
    if (normalized === SESSION_TIMEZONE_SYSTEM)
      return SESSION_TIMEZONE_SYSTEM_LABEL;
    return `${normalized} (${resolveUtcOffsetLabel(normalized)})`;
  };

  const buildSystemTimezoneOptionDisplay = () => {
    const systemTimezone = resolveSystemSessionTimezone();
    return `${SESSION_TIMEZONE_SYSTEM_LABEL} (${systemTimezone} ${resolveUtcOffsetLabel(systemTimezone)})`;
  };

  const setSessionTimezoneMenuOpen = (open) => {
    const nextOpen = !!open;
    sessionTimezoneMenuOpen = nextOpen;
    if (settingsSessionTimezoneMenu)
      settingsSessionTimezoneMenu.classList.toggle("hidden", !nextOpen);
    if (settingsSessionTimezoneCombobox)
      settingsSessionTimezoneCombobox.classList.toggle("open", nextOpen);
    if (settingsSessionTimezone)
      settingsSessionTimezone.setAttribute(
        "aria-expanded",
        nextOpen ? "true" : "false",
      );
    if (settingsSessionTimezoneToggle)
      settingsSessionTimezoneToggle.setAttribute(
        "aria-expanded",
        nextOpen ? "true" : "false",
      );
    if (!nextOpen) sessionTimezoneHighlightedIndex = -1;
  };

  const renderSessionTimezoneMenu = () => {
    if (!settingsSessionTimezoneOptions) return;
    settingsSessionTimezoneOptions.innerHTML = "";
    if (!sessionTimezoneVisibleItems.length) {
      const empty = document.createElement("div");
      empty.className = "timezone-empty";
      empty.textContent = "No timezones found";
      settingsSessionTimezoneOptions.appendChild(empty);
      return;
    }
    sessionTimezoneVisibleItems.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "timezone-option";
      option.setAttribute("role", "option");
      option.textContent = item.display;
      if (index === sessionTimezoneHighlightedIndex)
        option.classList.add("active");
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      option.addEventListener("click", () => {
        applySessionTimezoneToSettingsInput(item.timezone);
        setSessionTimezoneMenuOpen(false);
        if (settingsSessionTimezone) settingsSessionTimezone.focus();
      });
      settingsSessionTimezoneOptions.appendChild(option);
    });
  };

  const ensureSessionTimezoneHighlightedVisible = () => {
    if (!settingsSessionTimezoneOptions) return;
    if (sessionTimezoneHighlightedIndex < 0) return;
    const active = settingsSessionTimezoneOptions.querySelector(
      ".timezone-option.active",
    );
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  };

  const setSessionTimezoneHighlightedIndex = (index) => {
    if (!sessionTimezoneVisibleItems.length) {
      sessionTimezoneHighlightedIndex = -1;
      renderSessionTimezoneMenu();
      return;
    }
    const next = Math.max(
      0,
      Math.min(sessionTimezoneVisibleItems.length - 1, Number(index) || 0),
    );
    sessionTimezoneHighlightedIndex = next;
    renderSessionTimezoneMenu();
    ensureSessionTimezoneHighlightedVisible();
  };

  const filterSessionTimezoneMenu = (query) => {
    const token = extractSessionTimezoneToken(query).toLowerCase();
    if (!token) {
      sessionTimezoneVisibleItems = [...sessionTimezoneOptionItems];
    } else {
      sessionTimezoneVisibleItems = sessionTimezoneOptionItems.filter((item) =>
        item.search.includes(token),
      );
    }
    if (!sessionTimezoneVisibleItems.length) {
      sessionTimezoneHighlightedIndex = -1;
    } else if (
      sessionTimezoneHighlightedIndex < 0 ||
      sessionTimezoneHighlightedIndex >= sessionTimezoneVisibleItems.length
    ) {
      sessionTimezoneHighlightedIndex = 0;
    }
    renderSessionTimezoneMenu();
    ensureSessionTimezoneHighlightedVisible();
  };

  const renderSessionTimezoneOptions = (
    selectedTimezone = DEFAULT_SESSION_TIMEZONE,
  ) => {
    const normalized = normalizeSessionTimezone(selectedTimezone);
    const items = [];
    items.push({
      id: SESSION_TIMEZONE_SYSTEM,
      label: SESSION_TIMEZONE_SYSTEM_LABEL,
      gmt: resolveUtcOffsetLabel(SESSION_TIMEZONE_SYSTEM),
    });
    if (
      normalized !== SESSION_TIMEZONE_SYSTEM &&
      !SESSION_TIMEZONE_ITEM_BY_ID.has(normalized)
    ) {
      items.push({
        id: normalized,
        label: normalized,
        gmt: resolveUtcOffsetLabel(normalized),
      });
    }
    items.push(...SESSION_TIMEZONE_ITEMS);
    sessionTimezoneOptionItems = items.map((item) => {
      const timezone = item.id;
      const display =
        timezone === SESSION_TIMEZONE_SYSTEM
          ? buildSystemTimezoneOptionDisplay()
          : buildSessionTimezoneDisplay(timezone);
      const search =
        `${item.id} ${item.label || ""} ${display} ${(item.gmt || "").replace(/^GMT/i, "UTC")}`.toLowerCase();
      return {
        timezone,
        display,
        search,
      };
    });
    const selectedIndex = sessionTimezoneOptionItems.findIndex(
      (item) => item.timezone === normalized,
    );
    sessionTimezoneHighlightedIndex = selectedIndex >= 0 ? selectedIndex : -1;
    filterSessionTimezoneMenu("");
  };

  const applySessionTimezoneToSettingsInput = (value) => {
    const timezone = normalizeSessionTimezone(value);
    renderSessionTimezoneOptions(timezone);
    if (settingsSessionTimezone)
      settingsSessionTimezone.value = buildSessionTimezoneDisplay(timezone);
    setSessionTimezoneMenuOpen(false);
    return timezone;
  };

  const persistSessionTimezone = (value) => {
    const next = normalizeSessionTimezone(value);
    localStorage.setItem(SESSION_TIMEZONE_KEY, next);
    return next;
  };

  const readStoredSessionTimezone = () =>
    normalizeSessionTimezone(localStorage.getItem(SESSION_TIMEZONE_KEY));

  const resolveEffectiveSessionTimezone = (value) => {
    const normalized = normalizeSessionTimezone(value);
    if (normalized === SESSION_TIMEZONE_SYSTEM)
      return resolveSystemSessionTimezone();
    return normalized;
  };

  const readSessionTimezoneInput = () =>
    normalizeSessionTimezone(
      settingsSessionTimezone
        ? settingsSessionTimezone.value
        : readStoredSessionTimezone(),
    );

  const getSessionTimezoneSetting = () =>
    resolveEffectiveSessionTimezone(readStoredSessionTimezone());

  const initSessionTimezoneSettings = () => {
    const storedTimezone = readStoredSessionTimezone();
    applySessionTimezoneToSettingsInput(storedTimezone);
  };

  const normalizeTimeoutMsInput = (value, fallback) => {
    const raw = String(value ?? "").trim();
    const fallbackMs = Math.max(0, Number(fallback) || 0);
    if (!raw) return String(fallbackMs);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return String(fallbackMs);
    return String(Math.floor(parsed));
  };

  const normalizeConnectionTimeouts = (input) => {
    const source = input && typeof input === "object" ? input : {};
    return {
      openMs: normalizeTimeoutMsInput(
        source.openMs,
        CONNECTION_TIMEOUT_DEFAULTS.openMs,
      ),
      closeMs: normalizeTimeoutMsInput(
        source.closeMs,
        CONNECTION_TIMEOUT_DEFAULTS.closeMs,
      ),
      validationMs: normalizeTimeoutMsInput(
        source.validationMs,
        CONNECTION_TIMEOUT_DEFAULTS.validationMs,
      ),
    };
  };

  const readStoredConnectionTimeouts = () =>
    normalizeConnectionTimeouts({
      openMs: localStorage.getItem(CONNECTION_OPEN_TIMEOUT_KEY),
      closeMs: localStorage.getItem(CONNECTION_CLOSE_TIMEOUT_KEY),
      validationMs: localStorage.getItem(CONNECTION_VALIDATION_TIMEOUT_KEY),
    });

  const applyConnectionTimeoutsToSettingsInputs = (input) => {
    const next = normalizeConnectionTimeouts(input);
    if (settingsConnectionOpenTimeout)
      settingsConnectionOpenTimeout.value = next.openMs;
    if (settingsConnectionCloseTimeout)
      settingsConnectionCloseTimeout.value = next.closeMs;
    if (settingsConnectionValidationTimeout)
      settingsConnectionValidationTimeout.value = next.validationMs;
    return next;
  };

  const readConnectionTimeoutsInputs = () =>
    normalizeConnectionTimeouts({
      openMs: settingsConnectionOpenTimeout
        ? settingsConnectionOpenTimeout.value
        : CONNECTION_TIMEOUT_DEFAULTS.openMs,
      closeMs: settingsConnectionCloseTimeout
        ? settingsConnectionCloseTimeout.value
        : CONNECTION_TIMEOUT_DEFAULTS.closeMs,
      validationMs: settingsConnectionValidationTimeout
        ? settingsConnectionValidationTimeout.value
        : CONNECTION_TIMEOUT_DEFAULTS.validationMs,
    });

  const persistConnectionTimeouts = (input) => {
    const next = normalizeConnectionTimeouts(input);
    localStorage.setItem(CONNECTION_OPEN_TIMEOUT_KEY, next.openMs);
    localStorage.setItem(CONNECTION_CLOSE_TIMEOUT_KEY, next.closeMs);
    localStorage.setItem(CONNECTION_VALIDATION_TIMEOUT_KEY, next.validationMs);
    return next;
  };

  const getConnectionTimeoutSettings = () => {
    const stored = readStoredConnectionTimeouts();
    return {
      connectionOpenTimeoutMs: Number(stored.openMs),
      connectionCloseTimeoutMs: Number(stored.closeMs),
      connectionValidationTimeoutMs: Number(stored.validationMs),
    };
  };

  const normalizeBooleanSetting = (value, fallback) => {
    if (value === true || value === false) return value;
    if (value === null || value === undefined || value === "")
      return !!fallback;
    const text = String(value).trim().toLowerCase();
    if (text === "1" || text === "true" || text === "yes" || text === "on")
      return true;
    if (text === "0" || text === "false" || text === "no" || text === "off")
      return false;
    return !!fallback;
  };

  const normalizeErrorHandlingSettings = (input) => {
    const source = input && typeof input === "object" ? input : {};
    const stopOnFirstError = normalizeBooleanSetting(
      source.stopOnFirstError,
      ERROR_HANDLING_DEFAULTS.stopOnFirstError,
    );
    let continueOnError = normalizeBooleanSetting(
      source.continueOnError,
      ERROR_HANDLING_DEFAULTS.continueOnError,
    );
    if (continueOnError === stopOnFirstError)
      continueOnError = !stopOnFirstError;
    return {
      stopOnFirstError,
      continueOnError,
      autoOpenOutputOnError: normalizeBooleanSetting(
        source.autoOpenOutputOnError,
        ERROR_HANDLING_DEFAULTS.autoOpenOutputOnError,
      ),
      showDetailedDbErrorCode: normalizeBooleanSetting(
        source.showDetailedDbErrorCode,
        ERROR_HANDLING_DEFAULTS.showDetailedDbErrorCode,
      ),
      hideSensitiveValuesInErrors: normalizeBooleanSetting(
        source.hideSensitiveValuesInErrors,
        ERROR_HANDLING_DEFAULTS.hideSensitiveValuesInErrors,
      ),
      retryTransientSelectErrors: normalizeBooleanSetting(
        source.retryTransientSelectErrors,
        ERROR_HANDLING_DEFAULTS.retryTransientSelectErrors,
      ),
    };
  };

  const readStoredErrorHandlingSettings = () =>
    normalizeErrorHandlingSettings({
      stopOnFirstError: localStorage.getItem(ERROR_STOP_ON_FIRST_KEY),
      continueOnError: localStorage.getItem(ERROR_CONTINUE_ON_ERROR_KEY),
      autoOpenOutputOnError: localStorage.getItem(ERROR_AUTO_OPEN_OUTPUT_KEY),
      showDetailedDbErrorCode: localStorage.getItem(
        ERROR_SHOW_DETAILED_CODE_KEY,
      ),
      hideSensitiveValuesInErrors: localStorage.getItem(
        ERROR_HIDE_SENSITIVE_KEY,
      ),
      retryTransientSelectErrors: localStorage.getItem(
        ERROR_RETRY_TRANSIENT_KEY,
      ),
    });

  const syncErrorModeInputs = (source = "") => {
    if (!settingsErrorStopOnFirst || !settingsErrorContinueOnError) return;
    if (source === "stop") {
      settingsErrorContinueOnError.checked = !settingsErrorStopOnFirst.checked;
      return;
    }
    if (source === "continue") {
      settingsErrorStopOnFirst.checked = !settingsErrorContinueOnError.checked;
      return;
    }
    if (
      settingsErrorStopOnFirst.checked === settingsErrorContinueOnError.checked
    ) {
      settingsErrorContinueOnError.checked = !settingsErrorStopOnFirst.checked;
    }
  };

  const applyErrorHandlingToSettingsInputs = (input) => {
    const next = normalizeErrorHandlingSettings(input);
    if (settingsErrorStopOnFirst)
      settingsErrorStopOnFirst.checked = next.stopOnFirstError;
    if (settingsErrorContinueOnError)
      settingsErrorContinueOnError.checked = next.continueOnError;
    if (settingsErrorAutoOpenOutput)
      settingsErrorAutoOpenOutput.checked = next.autoOpenOutputOnError;
    if (settingsErrorShowDetailedCode)
      settingsErrorShowDetailedCode.checked = next.showDetailedDbErrorCode;
    if (settingsErrorHideSensitive)
      settingsErrorHideSensitive.checked = next.hideSensitiveValuesInErrors;
    if (settingsErrorRetryTransient)
      settingsErrorRetryTransient.checked = next.retryTransientSelectErrors;
    syncErrorModeInputs();
    return normalizeErrorHandlingSettings({
      stopOnFirstError: settingsErrorStopOnFirst
        ? settingsErrorStopOnFirst.checked
        : next.stopOnFirstError,
      continueOnError: settingsErrorContinueOnError
        ? settingsErrorContinueOnError.checked
        : next.continueOnError,
      autoOpenOutputOnError: settingsErrorAutoOpenOutput
        ? settingsErrorAutoOpenOutput.checked
        : next.autoOpenOutputOnError,
      showDetailedDbErrorCode: settingsErrorShowDetailedCode
        ? settingsErrorShowDetailedCode.checked
        : next.showDetailedDbErrorCode,
      hideSensitiveValuesInErrors: settingsErrorHideSensitive
        ? settingsErrorHideSensitive.checked
        : next.hideSensitiveValuesInErrors,
      retryTransientSelectErrors: settingsErrorRetryTransient
        ? settingsErrorRetryTransient.checked
        : next.retryTransientSelectErrors,
    });
  };

  const readErrorHandlingSettingsInputs = () =>
    normalizeErrorHandlingSettings({
      stopOnFirstError: settingsErrorStopOnFirst
        ? settingsErrorStopOnFirst.checked
        : ERROR_HANDLING_DEFAULTS.stopOnFirstError,
      continueOnError: settingsErrorContinueOnError
        ? settingsErrorContinueOnError.checked
        : ERROR_HANDLING_DEFAULTS.continueOnError,
      autoOpenOutputOnError: settingsErrorAutoOpenOutput
        ? settingsErrorAutoOpenOutput.checked
        : ERROR_HANDLING_DEFAULTS.autoOpenOutputOnError,
      showDetailedDbErrorCode: settingsErrorShowDetailedCode
        ? settingsErrorShowDetailedCode.checked
        : ERROR_HANDLING_DEFAULTS.showDetailedDbErrorCode,
      hideSensitiveValuesInErrors: settingsErrorHideSensitive
        ? settingsErrorHideSensitive.checked
        : ERROR_HANDLING_DEFAULTS.hideSensitiveValuesInErrors,
      retryTransientSelectErrors: settingsErrorRetryTransient
        ? settingsErrorRetryTransient.checked
        : ERROR_HANDLING_DEFAULTS.retryTransientSelectErrors,
    });

  const persistErrorHandlingSettings = (input) => {
    const next = normalizeErrorHandlingSettings(input);
    localStorage.setItem(
      ERROR_STOP_ON_FIRST_KEY,
      next.stopOnFirstError ? "1" : "0",
    );
    localStorage.setItem(
      ERROR_CONTINUE_ON_ERROR_KEY,
      next.continueOnError ? "1" : "0",
    );
    localStorage.setItem(
      ERROR_AUTO_OPEN_OUTPUT_KEY,
      next.autoOpenOutputOnError ? "1" : "0",
    );
    localStorage.setItem(
      ERROR_SHOW_DETAILED_CODE_KEY,
      next.showDetailedDbErrorCode ? "1" : "0",
    );
    localStorage.setItem(
      ERROR_HIDE_SENSITIVE_KEY,
      next.hideSensitiveValuesInErrors ? "1" : "0",
    );
    localStorage.setItem(
      ERROR_RETRY_TRANSIENT_KEY,
      next.retryTransientSelectErrors ? "1" : "0",
    );
    return next;
  };

  const getErrorHandlingSettings = () => readStoredErrorHandlingSettings();

  const normalizeSelectValue = (select, value, fallback) => {
    const target = String(value || "");
    if (hasSelectOption(select, target)) return target;
    const fallbackValue = String(fallback || "");
    if (hasSelectOption(select, fallbackValue)) return fallbackValue;
    return select && select.options && select.options.length
      ? select.options[0].value
      : fallbackValue;
  };

  const normalizeQueryDefaults = (input) => {
    const source = input && typeof input === "object" ? input : {};
    const limitAnchor = settingsDefaultLimit || limitSelect;
    const timeoutAnchor = settingsDefaultTimeout || timeoutSelect;
    return {
      limit: normalizeSelectValue(
        limitAnchor,
        source.limit,
        QUERY_DEFAULTS.limit,
      ),
      timeoutMs: normalizeSelectValue(
        timeoutAnchor,
        source.timeoutMs,
        QUERY_DEFAULTS.timeoutMs,
      ),
    };
  };

  const readStoredQueryDefaults = () =>
    normalizeQueryDefaults({
      limit: localStorage.getItem(QUERY_DEFAULT_LIMIT_KEY),
      timeoutMs: localStorage.getItem(QUERY_DEFAULT_TIMEOUT_KEY),
    });

  const applyQueryDefaultsToEditorControls = (input) => {
    const next = normalizeQueryDefaults(input);
    if (limitSelect) {
      limitSelect.value = normalizeSelectValue(
        limitSelect,
        next.limit,
        QUERY_DEFAULTS.limit,
      );
    }
    if (timeoutSelect) {
      timeoutSelect.value = normalizeSelectValue(
        timeoutSelect,
        next.timeoutMs,
        QUERY_DEFAULTS.timeoutMs,
      );
    }
    return next;
  };

  const applyQueryDefaultsToSettingsInputs = (input) => {
    const next = normalizeQueryDefaults(input);
    if (settingsDefaultLimit) {
      settingsDefaultLimit.value = normalizeSelectValue(
        settingsDefaultLimit,
        next.limit,
        QUERY_DEFAULTS.limit,
      );
    }
    if (settingsDefaultTimeout) {
      settingsDefaultTimeout.value = normalizeSelectValue(
        settingsDefaultTimeout,
        next.timeoutMs,
        QUERY_DEFAULTS.timeoutMs,
      );
    }
    return next;
  };

  const readQueryDefaultsInputs = () =>
    normalizeQueryDefaults({
      limit: settingsDefaultLimit
        ? settingsDefaultLimit.value
        : limitSelect
          ? limitSelect.value
          : QUERY_DEFAULTS.limit,
      timeoutMs: settingsDefaultTimeout
        ? settingsDefaultTimeout.value
        : timeoutSelect
          ? timeoutSelect.value
          : QUERY_DEFAULTS.timeoutMs,
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
      requireApproval: envPolicyDevRequireApproval,
    },
    [POLICY_MODE_STAGING]: {
      allowWrite: envPolicyStagingAllowWrite,
      allowDdlAdmin: envPolicyStagingAllowDdl,
      requireApproval: envPolicyStagingRequireApproval,
    },
    [POLICY_MODE_PROD]: {
      allowWrite: envPolicyProdAllowWrite,
      allowDdlAdmin: envPolicyProdAllowDdl,
      requireApproval: envPolicyProdRequireApproval,
    },
  });

  const applyEnvironmentPolicyInputs = (rules) => {
    const nextRules = normalizeEnvironmentPolicyRules(rules);
    const inputs = getEnvironmentPolicyInputs();
    [POLICY_MODE_DEV, POLICY_MODE_STAGING, POLICY_MODE_PROD].forEach((mode) => {
      const fields = inputs[mode] || {};
      const rule = nextRules[mode];
      if (fields.allowWrite) fields.allowWrite.checked = !!rule.allowWrite;
      if (fields.allowDdlAdmin)
        fields.allowDdlAdmin.checked = !!rule.allowDdlAdmin;
      if (fields.requireApproval)
        fields.requireApproval.checked = !!rule.requireApproval;
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
            : !!defaults.requireApproval,
      };
    });
    return normalizeEnvironmentPolicyRules(next);
  };

  const areEnvironmentPoliciesEqual = (left, right) => {
    const normalizedLeft = normalizeEnvironmentPolicyRules(left);
    const normalizedRight = normalizeEnvironmentPolicyRules(right);
    return [POLICY_MODE_DEV, POLICY_MODE_STAGING, POLICY_MODE_PROD].every(
      (mode) => {
        const a = normalizedLeft[mode];
        const b = normalizedRight[mode];
        return (
          a.allowWrite === b.allowWrite &&
          a.allowDdlAdmin === b.allowDdlAdmin &&
          a.requireApproval === b.requireApproval
        );
      },
    );
  };

  // setSettingsTab now defined after component initialization

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
          await safeApi.showError(
            (res && res.error) || "Failed to load policy settings.",
          );
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
        await safeApi.showError(
          err && err.message ? err.message : "Failed to load policy settings.",
        );
      }
      setEnvironmentPolicyRules(fallback);
      applyEnvironmentPolicyInputs(fallback);
      return fallback;
    }
  };

  const resetGeneralSettingsDefaults = () => {
    applySessionTimezoneToSettingsInput(DEFAULT_SESSION_TIMEZONE);
  };

  const resetErrorsTimeoutsSettingsDefaults = () => {
    applyErrorHandlingToSettingsInputs(ERROR_HANDLING_DEFAULTS);
    applyConnectionTimeoutsToSettingsInputs(CONNECTION_TIMEOUT_DEFAULTS);
    applyQueryDefaultsToSettingsInputs(QUERY_DEFAULTS);
  };

  const resetEnvironmentPolicyDefaults = () => {
    const next = cloneEnvironmentPolicyRules(ENVIRONMENT_POLICY_DEFAULTS);
    setEnvironmentPolicyRules(next);
    applyEnvironmentPolicyInputs(next);
  };

  const saveEnvironmentPolicySettings = async () => {
    const next = readEnvironmentPolicyInputs();
    const current = getEnvironmentPolicyRules();
    if (areEnvironmentPoliciesEqual(current, next))
      return { ok: true, saved: false };
    if (!safeApi.savePolicySettings) {
      if (safeApi.showError)
        await safeApi.showError("Settings API unavailable.");
      return { ok: false };
    }
    const res = await safeApi.savePolicySettings({ policies: next });
    if (!res || !res.ok) {
      if (safeApi.showError) {
        await safeApi.showError(
          (res && res.error) || "Failed to save policy settings.",
        );
      }
      return { ok: false };
    }
    const saved = setEnvironmentPolicyRules(res.policies || next);
    applyEnvironmentPolicyInputs(saved);
    return { ok: true, saved: true };
  };

  const applySessionTimezoneToActiveConnection = async (timezone) => {
    if (!safeApi.setSessionTimezone) return { ok: true, applied: false };
    const res = await safeApi.setSessionTimezone({ timezone });
    if (!res || !res.ok) {
      return {
        ok: false,
        error: (res && res.error) || "Failed to set session timezone.",
      };
    }
    return {
      ok: true,
      applied: !!res.applied,
      timezone: normalizeSessionTimezone(res.timezone || timezone),
    };
  };

  // saveSettings now defined after component initialization

  const setEditMode = (enabled) => {
    isEditingConnection = enabled;
    if (!enabled) {
      editingConnectionSeed = null;
      if (saveName) delete saveName.dataset.originalName;
    }
    if (dbType) {
      dbType.disabled = !!enabled;
      if (enabled) {
        dbType.title =
          "Type cannot be changed while editing. Create a new connection to change type.";
      } else {
        dbType.removeAttribute("title");
      }
    }
    if (cancelEditBtn) cancelEditBtn.classList.toggle("hidden", !enabled);
  };

  const setConnectTab = (tab) => {
    const isSsh = tab === "ssh";
    if (tabDirectBtn) tabDirectBtn.classList.toggle("active", !isSsh);
    if (tabSshBtn) tabSshBtn.classList.toggle("active", isSsh);
    if (sshFields) sshFields.classList.toggle("hidden", !isSsh);
  };

  const entryRemembersSecrets = (entry) => {
    if (!entry) return false;
    if (entry.rememberSecrets !== undefined) return !!entry.rememberSecrets;
    if (entry.remember_secrets !== undefined)
      return Number(entry.remember_secrets) === 1;
    if (entry.save_secrets !== undefined)
      return Number(entry.save_secrets) === 1;
    return false;
  };

  // promptConnectionSecrets and closeCredentialPrompt now defined after component initialization

  const closePolicyApprovalPrompt = (result = "") => {
    if (policyApprovalModal) policyApprovalModal.classList.add("hidden");
    const resolver = policyApprovalPromptResolver;
    policyApprovalPromptResolver = null;
    if (resolver) resolver(result);
  };

  const isValidPolicyApprovalInput = (value) =>
    String(value || "")
      .trim()
      .toUpperCase() === POLICY_APPROVAL_TOKEN;

  const updatePolicyApprovalConfirmState = () => {
    if (!policyApprovalConfirmBtn) return;
    const currentValue = policyApprovalInput ? policyApprovalInput.value : "";
    policyApprovalConfirmBtn.disabled =
      !isValidPolicyApprovalInput(currentValue);
  };

  const promptPolicyApproval = ({ policyLabel, actionLabel } = {}) => {
    if (!policyApprovalModal) return Promise.resolve("");
    if (policyApprovalPromptResolver) closePolicyApprovalPrompt("");
    if (policyApprovalTitle) {
      policyApprovalTitle.textContent = `${policyLabel || "Policy"} confirmation`;
    }
    if (policyApprovalSubtitle) {
      const action = actionLabel ? ` ${actionLabel}` : "";
      policyApprovalSubtitle.textContent = `${policyLabel || "Policy"} requires confirmation for${action}. Type ${POLICY_APPROVAL_TOKEN} to continue.`;
    }
    if (policyApprovalInput) policyApprovalInput.value = "";
    updatePolicyApprovalConfirmState();
    policyApprovalModal.classList.remove("hidden");
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
    if (String(config.type || "").toLowerCase() === "sqlite") return config;
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
    config.password = secrets.password || "";
    if (config.ssh && config.ssh.enabled) {
      config.ssh.password = secrets.sshPassword || "";
      config.ssh.privateKey = secrets.sshPrivateKey || "";
      config.ssh.passphrase = secrets.sshPassphrase || "";
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
      name: currentConfig && currentConfig.name ? currentConfig.name : "",
      host: currentConfig && currentConfig.host ? currentConfig.host : "",
      type: currentConfig && currentConfig.type ? currentConfig.type : "mysql",
      ssh:
        currentConfig && currentConfig.ssh
          ? { ...currentConfig.ssh }
          : { enabled: false },
    };
    if (!baseEntry) return fallback;
    const merged = { ...baseEntry };
    merged.ssh = {
      ...getEntrySshConfig(baseEntry),
      ...(currentConfig && currentConfig.ssh ? currentConfig.ssh : {}),
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
      ssh: { ...((config && config.ssh) || {}) },
    };
    if (String(next.type || "").toLowerCase() === "sqlite") return next;
    if (hasRuntimeSecretsInConfig(next)) return next;
    if (!isEditingConnection) return next;
    const sourceEntry = await resolveSaveValidationEntry(next.name);
    if (!sourceEntry || entryRemembersSecrets(sourceEntry)) return next;
    const promptEntry = buildPromptEntryForValidation(sourceEntry, next);
    const secrets = await promptConnectionSecrets(promptEntry);
    if (!secrets) return null;
    next.password = secrets.password || "";
    if (next.ssh && next.ssh.enabled) {
      next.ssh.password = secrets.sshPassword || "";
      next.ssh.privateKey = secrets.sshPrivateKey || "";
      next.ssh.passphrase = secrets.sshPassphrase || "";
    }
    return next;
  };

  const resetConnectionForm = () => {
    if (dbType) dbType.value = "mysql";
    updateConnectionUrlPlaceholder("mysql");
    if (connectionUrl) connectionUrl.value = "";
    if (sqliteModeCreate) sqliteModeCreate.checked = true;
    if (sqliteModeExisting) sqliteModeExisting.checked = false;
    if (sqlitePath) sqlitePath.value = "";
    if (host) host.value = "localhost";
    if (port) port.value = "";
    if (user) user.value = "";
    if (password) password.value = "";
    if (database) database.value = "";
    if (saveName) saveName.value = "";
    if (saveName) delete saveName.dataset.originalName;
    if (rememberPassword) rememberPassword.checked = false;
    if (readOnly) readOnly.checked = false;
    if (policyMode) policyMode.value = "dev";
    setConnectTab("direct");
    if (sshHost) sshHost.value = "";
    if (sshPort) sshPort.value = "";
    if (sshUser) sshUser.value = "";
    if (sshPassword) sshPassword.value = "";
    if (sshPrivateKey) sshPrivateKey.value = "";
    if (sshPassphrase) sshPassphrase.value = "";
    if (sshLocalPort) sshLocalPort.value = "";
    syncConnectionTypeFields();
  };

  const normalizeTypeForForm = (value) => {
    const type = String(value || "")
      .trim()
      .toLowerCase();
    if (!type) return "mysql";
    if (type === "postgresql") return "postgres";
    if (type === "maria" || type === "maria-db") return "mariadb";
    if (type === "sqlite3") return "sqlite";
    if (
      type === "postgres" ||
      type === "mysql" ||
      type === "mariadb" ||
      type === "sqlite"
    )
      return type;
    return "mysql";
  };

  const getSelectedDbType = () =>
    normalizeTypeForForm(dbType ? dbType.value : "mysql");
  const isSqliteSelected = () => getSelectedDbType() === "sqlite";
  const resolveSqliteMode = () =>
    sqliteModeExisting && sqliteModeExisting.checked ? "existing" : "create";

  const getFieldContainer = (input) => (input ? input.closest(".field") : null);
  const hostField = getFieldContainer(host);
  const portField = getFieldContainer(port);
  const userField = getFieldContainer(user);
  const passwordField = getFieldContainer(password);
  const databaseField = getFieldContainer(database);
  const connectionUrlField = getFieldContainer(connectionUrl);
  const rememberSecretsField = rememberPassword
    ? rememberPassword.closest(".save-settings-option")
    : null;

  const syncConnectionTypeFields = () => {
    const sqlite = isSqliteSelected();
    if (sqliteFields) sqliteFields.classList.toggle("hidden", !sqlite);
    if (hostField) hostField.classList.toggle("hidden", sqlite);
    if (portField) portField.classList.toggle("hidden", sqlite);
    if (userField) userField.classList.toggle("hidden", sqlite);
    if (passwordField) passwordField.classList.toggle("hidden", sqlite);
    if (databaseField) databaseField.classList.toggle("hidden", sqlite);
    if (connectionUrlField)
      connectionUrlField.classList.toggle("hidden", sqlite);
    if (tabSshBtn) tabSshBtn.classList.toggle("hidden", sqlite);
    if (rememberSecretsField)
      rememberSecretsField.classList.toggle("hidden", sqlite);
    if (sqlite && tabSshBtn && tabSshBtn.classList.contains("active")) {
      setConnectTab("direct");
    }
  };

  const resolveConnectionUrlPlaceholder = (typeValue) => {
    const type = normalizeTypeForForm(typeValue);
    if (type === "postgres")
      return "postgresql://user:password@localhost:5432/database";
    if (type === "mariadb")
      return "mariadb://user:password@localhost:3306/database";
    if (type === "sqlite") return "sqlite:///path/to/database.sqlite";
    return "mysql://user:password@localhost:3306/database";
  };

  const updateConnectionUrlPlaceholder = (typeValue) => {
    if (!connectionUrl) return;
    connectionUrl.placeholder = resolveConnectionUrlPlaceholder(
      typeValue || (dbType ? dbType.value : "mysql"),
    );
  };

  const normalizeTypeFromUrlScheme = (value) => {
    const scheme = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/:$/, "");
    if (scheme === "postgres" || scheme === "postgresql") return "postgres";
    if (scheme === "mysql") return "mysql";
    if (scheme === "mariadb" || scheme === "maria" || scheme === "maria-db")
      return "mariadb";
    if (scheme === "sqlite") return "sqlite";
    if (scheme === "sqlite3") return "sqlite";
    return "";
  };

  const decodeUrlPart = (value) => {
    const text = String(value || "");
    if (!text) return "";
    try {
      return decodeURIComponent(text);
    } catch (_) {
      return text;
    }
  };

  const parseConnectionUrl = (rawValue) => {
    const text = String(rawValue || "").trim();
    if (!text) return null;
    let parsed = null;
    try {
      parsed = new URL(text);
    } catch (_) {
      throw new Error("Invalid connection URL.");
    }
    const type = normalizeTypeFromUrlScheme(parsed.protocol);
    if (!type)
      throw new Error(
        "Unsupported URL scheme. Use postgresql://, mysql://, mariadb:// or sqlite://",
      );
    if (type !== "sqlite" && !parsed.hostname)
      throw new Error("Connection URL must include host.");
    const pathname = String(parsed.pathname || "").replace(/^\/+/, "");
    if (type === "sqlite") {
      const hostPart = decodeUrlPart(parsed.hostname || "");
      const pathPart = decodeUrlPart(parsed.pathname || "");
      let filePath = pathPart;
      if (!filePath && hostPart) filePath = hostPart;
      if (hostPart && filePath && !filePath.startsWith("/")) {
        filePath = `${hostPart}/${filePath}`;
      }
      filePath = filePath.replace(/^\/+/, "/");
      if (!filePath) throw new Error("SQLite URL must include a file path.");
      return {
        type,
        filePath,
      };
    }
    return {
      type,
      host: parsed.hostname,
      port: parsed.port || "",
      user: decodeUrlPart(parsed.username || ""),
      password: decodeUrlPart(parsed.password || ""),
      database: decodeUrlPart(pathname || ""),
    };
  };

  const getLockedEditType = () => {
    if (
      !isEditingConnection ||
      !editingConnectionSeed ||
      !editingConnectionSeed.type
    )
      return "";
    return normalizeTypeForForm(editingConnectionSeed.type);
  };

  const buildConnectionFromForm = ({ includeSaveFields = false } = {}) => {
    const lockedType = getLockedEditType();
    const selectedType = lockedType || getSelectedDbType();
    const sqliteSelected = selectedType === "sqlite";
    const sqliteFilePath = sqlitePath
      ? String(sqlitePath.value || "").trim()
      : "";
    const base = {
      type: selectedType,
      filePath: sqliteSelected ? sqliteFilePath : "",
      sqliteMode: sqliteSelected ? resolveSqliteMode() : undefined,
      host: sqliteSelected
        ? ""
        : host
          ? host.value || "localhost"
          : "localhost",
      port: sqliteSelected ? "" : port ? String(port.value || "").trim() : "",
      user: sqliteSelected ? "" : user ? user.value || "" : "",
      password: sqliteSelected ? "" : password ? password.value || "" : "",
      database: sqliteSelected ? "" : database ? database.value || "" : "",
      sessionTimezone: getSessionTimezoneSetting(),
      ...getConnectionTimeoutSettings(),
      readOnly: readOnly ? readOnly.checked : false,
      policyMode: policyMode ? policyMode.value || "dev" : "dev",
      ssh: sqliteSelected ? { enabled: false } : buildSshConfig(),
    };
    if (includeSaveFields) {
      base.name = saveName ? saveName.value.trim() : "";
      base.rememberSecrets = rememberPassword
        ? rememberPassword.checked
        : false;
    }

    if (sqliteSelected && !base.filePath) {
      throw new Error("Select a SQLite database file.");
    }

    const urlValue = connectionUrl
      ? String(connectionUrl.value || "").trim()
      : "";
    if (!urlValue) {
      base.connectionUrl = "";
      return base;
    }

    const parsed = parseConnectionUrl(urlValue);
    if (lockedType && parsed.type !== lockedType) {
      throw new Error("Connection type cannot be changed while editing.");
    }
    return {
      ...base,
      ...parsed,
      connectionUrl: urlValue,
    };
  };

  const chooseSqlitePath = async () => {
    if (!safeApi.openSqliteFile || !safeApi.saveSqliteFile) {
      await safeApi.showError("SQLite file picker not available.");
      return;
    }
    const mode = resolveSqliteMode();
    const res =
      mode === "existing"
        ? await safeApi.openSqliteFile()
        : await safeApi.saveSqliteFile();
    if (!res || !res.ok) {
      if (!res || !res.canceled) {
        await safeApi.showError(
          (res && res.error) || "Failed to choose SQLite file.",
        );
      }
      return;
    }
    if (sqlitePath) sqlitePath.value = res.path || "";
  };

  const normalizeConnectSettingsTab = (tab) => {
    if (tab === "access") return tab;
    return "connection";
  };

  const setConnectSettingsTab = (tab) => {
    const requested = normalizeConnectSettingsTab(tab);
    const next = requested;
    activeConnectSettingsTab = next;

    if (connectSettingsTabs) {
      const items = connectSettingsTabs.querySelectorAll(
        "[data-connect-settings-tab]",
      );
      items.forEach((item) => {
        const selected =
          item.getAttribute("data-connect-settings-tab") === next;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    if (connectSectionConnection) {
      connectSectionConnection.classList.toggle(
        "hidden",
        next !== "connection",
      );
    }
    if (connectSectionAccess) {
      connectSectionAccess.classList.toggle("hidden", next !== "access");
    }
    if (connectSectionSave) {
      const showSave = next === "connection" && activeConnectMode !== "quick";
      connectSectionSave.classList.toggle("hidden", !showSave);
    }
  };

  const setConnectMode = (mode) => {
    activeConnectMode = mode === "quick" ? "quick" : "full";
    const panel = connectModal
      ? connectModal.querySelector(".connect-panel")
      : null;
    if (panel) panel.classList.toggle("quick", activeConnectMode === "quick");
    if (connectModalTitle) {
      connectModalTitle.textContent =
        activeConnectMode === "quick" ? "Quick connect" : "New connection";
    }
    if (connectModalSubtitle) {
      connectModalSubtitle.textContent =
        activeConnectMode === "quick"
          ? "Connect without saving."
          : "Fill in the details to connect and save.";
    }
    if (connectBtn) {
      connectBtn.textContent =
        activeConnectMode === "quick" ? "Quick connect" : "Connect & save";
    }
    if (saveBtn) {
      saveBtn.classList.add("hidden");
    }
    setConnectSettingsTab(activeConnectSettingsTab || "connection");
  };

  const setScreen = (connected) => {
    if (mainScreen) mainScreen.classList.remove("hidden");
    if (welcomeScreen) welcomeScreen.classList.toggle("hidden", connected);
    if (sidebarShell) sidebarShell.classList.toggle("hidden", !connected);
    if (dbSelectWrap) dbSelectWrap.classList.toggle("hidden", !connected);
    if (sidebar) sidebar.classList.toggle("hidden", !connected);
    if (sidebarResizer) sidebarResizer.classList.toggle("hidden", !connected);
    if (editorResizer) editorResizer.classList.toggle("hidden", !connected);
    if (editorPanel) editorPanel.classList.toggle("hidden", !connected);
    if (resultsPanel) resultsPanel.classList.toggle("hidden", !connected);
    if (!connected) closeConnectModal();
    if (!connected) setOutputDisplay(null);
    if (!connected) stopQueryProgress();
    if (!connected) {
      objectContextByTabId = new Map();
      applyResultsPanelState({ snapshot: null, objectContext: null });
    }
    if (homeBtn) {
      homeBtn.classList.toggle(
        "hidden",
        !tabConnectionsView || tabConnectionsView.size() === 0,
      );
    }
    if (connected) {
      setSidebarView("tree");
      refreshEditor();
    }
  };

  const setSidebarView = (view) => {
    const next =
      view === "history"
        ? "history"
        : view === "snippets"
          ? "snippets"
          : "tree";
    if (tablePanel) tablePanel.classList.toggle("hidden", next !== "tree");
    if (historyPanel)
      historyPanel.classList.toggle("hidden", next !== "history");
    if (snippetsPanel)
      snippetsPanel.classList.toggle("hidden", next !== "snippets");
    if (sidebarTreeBtn)
      sidebarTreeBtn.classList.toggle("active", next === "tree");
    if (sidebarHistoryBtn)
      sidebarHistoryBtn.classList.toggle("active", next === "history");
    if (sidebarSnippetsBtn)
      sidebarSnippetsBtn.classList.toggle("active", next === "snippets");
    if (next === "history" && historyManager)
      void historyManager.renderHistoryList();
    if (next === "snippets" && snippetsManager)
      void snippetsManager.renderSnippetsList();
  };

  const renderConnectionTabs = () => {
    if (!tabConnectionsView) return;
    tabConnectionsView.render();
    if (homeBtn) {
      homeBtn.classList.toggle("hidden", tabConnectionsView.size() === 0);
    }
  };

  const upsertConnectionTab = (entry) => {
    if (!entry || !tabConnectionsView) return;
    const key = getTabKey(entry);
    tabConnectionsView.upsert(key, entry);
    renderConnectionTabs();
  };

  const configFromEntry = (entry) => {
    const type = normalizeTypeForForm(
      entry && entry.type ? entry.type : "mysql",
    );
    const isSqlite = type === "sqlite";
    const filePath =
      entry && (entry.filePath || entry.file_path || entry.path)
        ? entry.filePath || entry.file_path || entry.path
        : "";
    return {
      type,
      filePath: isSqlite ? filePath : "",
      sqliteMode: isSqlite ? "existing" : undefined,
      host: isSqlite ? "" : entry.host || "localhost",
      port: isSqlite ? undefined : entry.port || undefined,
      user: isSqlite ? "" : entry.user || "",
      password: isSqlite ? "" : entry.password || "",
      database: isSqlite ? "" : entry.database || "",
      sessionTimezone: getSessionTimezoneSetting(),
      ...getConnectionTimeoutSettings(),
      readOnly: isEntryReadOnly(entry),
      policyMode: getEntryPolicyMode(entry),
      ssh: isSqlite ? { enabled: false } : getEntrySshConfig(entry),
    };
  };

  const getTabKey = (entry) => getConnectionScopeKey(entry);

  const getActiveConnection = () => {
    if (!tabConnectionsView) return null;
    const key = tabConnectionsView.getActiveKey();
    return key ? tabConnectionsView.getEntry(key) : null;
  };

  sqlAutocomplete = createSqlAutocomplete({
    api: safeApi,
    getActiveConnection,
  });

  const getCurrentHistoryKey = () => {
    if (!tabConnectionsView) return null;
    return tabConnectionsView.getActiveKey();
  };

  const tabsStorageKey = (key) => (key ? `sqlEditor.tabs:${key}` : null);
  const editorCollapsedStorageKey = (key) =>
    key ? `${EDITOR_COLLAPSED_KEY_PREFIX}:${key}` : null;

  const readEditorVisibilityForConnection = (key) => {
    const storageKey = editorCollapsedStorageKey(key);
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    return raw !== "1";
  };

  const saveEditorVisibilityForConnection = (key, visible) => {
    const storageKey = editorCollapsedStorageKey(key);
    if (!storageKey) return;
    localStorage.setItem(storageKey, visible ? "0" : "1");
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
    if (dbType) dbType.value = normalizeTypeForForm(entry.type);
    updateConnectionUrlPlaceholder(dbType ? dbType.value : "");
    if (connectionUrl)
      connectionUrl.value =
        entry.connectionUrl || entry.connection_url || entry.url || "";
    const filePath = entry.filePath || entry.file_path || entry.path || "";
    if (sqlitePath) sqlitePath.value = filePath;
    if (sqliteModeExisting) sqliteModeExisting.checked = !!filePath;
    if (sqliteModeCreate) sqliteModeCreate.checked = !filePath;
    if (host) host.value = entry.host || "";
    if (port) port.value = entry.port || "";
    if (user) user.value = entry.user || "";
    if (password) password.value = entry.password || "";
    if (database) database.value = entry.database || "";
    if (saveName) saveName.value = entry.name || "";
    if (rememberPassword)
      rememberPassword.checked = entryRemembersSecrets(entry);
    if (readOnly) readOnly.checked = isEntryReadOnly(entry);
    if (policyMode) policyMode.value = getEntryPolicyMode(entry);
    const ssh = getEntrySshConfig(entry);
    setConnectTab(ssh.enabled ? "ssh" : "direct");
    if (sshHost) sshHost.value = ssh.host || "";
    if (sshPort) sshPort.value = ssh.port || "";
    if (sshUser) sshUser.value = ssh.user || "";
    if (sshPassword) sshPassword.value = ssh.password || "";
    if (sshPrivateKey) sshPrivateKey.value = ssh.privateKey || "";
    if (sshPassphrase) sshPassphrase.value = ssh.passphrase || "";
    if (sshLocalPort) sshLocalPort.value = ssh.localPort || "";
    syncConnectionTypeFields();
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
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const width = parseFloat(getComputedStyle(sidebar).width);
      if (Number.isFinite(width)) {
        localStorage.setItem(SIDEBAR_KEY, String(Math.round(width)));
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    sidebarResizer.addEventListener("mousedown", (event) => {
      event.preventDefault();
      dragging = true;
      startX = event.clientX;
      startWidth =
        parseFloat(getComputedStyle(sidebar).width) ||
        sidebar.offsetWidth ||
        260;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  };

  const bindTabShortcuts = () => {
    document.addEventListener("keydown", (event) => {
      const primaryKey = event.metaKey || event.ctrlKey;
      if (!primaryKey || event.altKey) return;
      const key = String(event.key || "").toLowerCase();
      if (!event.shiftKey && key === "w") {
        event.preventDefault();
        if (tabTablesView) tabTablesView.closeActive();
      } else if (!event.shiftKey && key === "t") {
        event.preventDefault();
        if (tabTablesView) {
          tabTablesView.syncActiveTabContent();
          tabTablesView.create();
          setEditorVisible(true);
        }
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        adjustEditorFontSize(1);
      } else if (key === "-" || key === "_") {
        event.preventDefault();
        adjustEditorFontSize(-1);
      } else if (!event.shiftKey && key === "0") {
        event.preventDefault();
        resetEditorFontSize();
      }
    });
  };

  let resultsVisible = true;

  const getEditorHeaderHeight = () => {
    if (!editorPanel) return 0;
    const tab = editorPanel.querySelector(".tab-bar");
    const toolbar = editorPanel.querySelector(".editor-toolbar");
    return (tab ? tab.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0);
  };

  const resolveMaxEditorBodyHeight = (fallbackHeight) => {
    const minEditor = 120;
    const minResults = resultsVisible ? 180 : 0;
    const resizerHeight = resultsVisible
      ? editorResizer
        ? editorResizer.offsetHeight
        : 6
      : 0;
    const workspaceRect = workspace ? workspace.getBoundingClientRect() : null;
    const headerHeight = getEditorHeaderHeight();
    if (workspaceRect && workspaceRect.height) {
      const maxBody =
        workspaceRect.height - headerHeight - resizerHeight - minResults;
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
      codeEditor.setSize("100%", next);
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
    return Math.max(
      MIN_EDITOR_FONT_SIZE,
      Math.min(MAX_EDITOR_FONT_SIZE, Math.round(size)),
    );
  };

  const applyEditorFontSize = (size, { save = true, notify = true } = {}) => {
    const next = clampEditorFontSize(size);
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${next}px`,
    );
    if (save) localStorage.setItem(EDITOR_FONT_SIZE_KEY, String(next));
    if (notify) showToast(`Font: ${next}px`, 900);
  };

  const getCurrentEditorFontSize = () => {
    const cssValue = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--editor-font-size",
      ),
      10,
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
      applyEditorFontSize(DEFAULT_EDITOR_FONT_SIZE, {
        save: false,
        notify: false,
      });
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
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    editorResizer.addEventListener("mousedown", (event) => {
      event.preventDefault();
      dragging = true;
      startY = event.clientY;
      const current = parseFloat(editorBody ? editorBody.style.height : "");
      startHeight =
        Number.isFinite(current) && current > 0
          ? current
          : editorBody
            ? editorBody.offsetHeight
            : 220;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    window.addEventListener("resize", () => {
      const current = parseFloat(editorBody ? editorBody.style.height : "");
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
    if (state === "success") parts.push("Success");
    if (state === "error") parts.push("Error");
    if (state === "running") parts.push("Running");
    if (message) parts.push(message);
    if (Number.isFinite(duration)) parts.push(`${Math.round(duration)}ms`);
    queryStatus.textContent = parts.join(" • ");
    queryStatus.className = `query-status${state ? ` ${state}` : ""}`;
  };

  const OUTPUT_PREVIEW_MAX = 160;

  const normalizePreview = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();

  const truncatePreview = (text) => {
    const preview = normalizePreview(text);
    if (preview.length <= OUTPUT_PREVIEW_MAX) return preview;
    return `${preview.slice(0, OUTPUT_PREVIEW_MAX - 1)}…`;
  };

  const formatTime = (date) => {
    const value = date instanceof Date ? date : new Date();
    return value.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const ACTION_MAX = 220;

  const truncateAction = (text) => {
    const clean = normalizePreview(text);
    if (clean.length <= ACTION_MAX) return clean;
    return `${clean.slice(0, ACTION_MAX - 1)}…`;
  };

  const buildAction = (sql) => {
    const clean = String(sql || "").trim();
    if (!clean) return "QUERY";
    return truncateAction(clean);
  };

  const buildOutputEntry = ({
    sql,
    ok,
    totalRows,
    truncated,
    affectedRows,
    changedRows,
    error,
    duration,
  }) => {
    const keyword = firstDmlKeyword(sql || "");
    const isDml =
      keyword === "insert" || keyword === "update" || keyword === "delete";
    const preferredAffected =
      Number.isFinite(changedRows) && changedRows > 0
        ? changedRows
        : Number.isFinite(affectedRows)
          ? affectedRows
          : undefined;
    let response = error || "Error";
    if (ok) {
      if (Number.isFinite(preferredAffected)) {
        response = `Rows affected: ${preferredAffected}`;
      } else if (isDml) {
        response = "Rows affected: 0";
      } else {
        response = `Rows: ${Number.isFinite(totalRows) ? totalRows : 0}${truncated ? " (truncated)" : ""}`;
      }
    }
    return {
      id: 0,
      time: formatTime(new Date()),
      action: buildAction(sql),
      response,
      durationMs: Number.isFinite(duration) ? Math.round(duration) : 0,
      fullResponse: response,
    };
  };

  const ensureOutputState = (tabId) => {
    if (!tabId) return null;
    if (!outputByTabId.has(tabId)) {
      outputByTabId.set(tabId, {
        seq: 0,
        items: [],
        subtitle: "Latest result",
      });
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
        queryOutputPreview.textContent = "No output.";
      }
    }
    if (queryOutputBtn) {
      queryOutputBtn.disabled = !(
        payload &&
        payload.items &&
        payload.items.length
      );
    }
  };

  const openOutputModal = () => {
    if (!outputModal || !currentOutput || !currentOutput.items) return;
    if (outputModalSubtitle) {
      outputModalSubtitle.textContent =
        currentOutput.subtitle || "Latest result";
    }
    if (outputLogBody) {
      outputLogBody.innerHTML = "";
      currentOutput.items.forEach((entry) => {
        const tr = document.createElement("tr");
        const cols = [
          String(entry.id),
          entry.time,
          entry.action,
          entry.response,
          entry.durationMs ? `${entry.durationMs}ms` : "",
        ];
        cols.forEach((value, index) => {
          const td = document.createElement("td");
          td.textContent = value;
          if (index === 3) td.classList.add("response");
          tr.appendChild(td);
        });
        outputLogBody.appendChild(tr);
      });
    }
    outputModal.classList.remove("hidden");
  };

  const closeOutputModal = () => {
    if (outputModal) outputModal.classList.add("hidden");
  };

  const getDefinitionSql = () => {
    if (definitionEditor) return definitionEditor.getValue();
    return definitionQueryInput ? definitionQueryInput.value : "";
  };

  const syncDefinitionSaveState = () => {
    if (!definitionSaveBtn) return;
    const hasTarget = !!(
      activeDefinitionTarget &&
      activeDefinitionTarget.kind === "view" &&
      activeDefinitionTarget.name
    );
    const hasSql = !!String(getDefinitionSql() || "").trim();
    definitionSaveBtn.disabled = isSavingDefinition || !hasTarget || !hasSql;
  };

  const openDefinitionModal = ({ title, subtitle, sql, target } = {}) => {
    if (!definitionModal) return;
    activeDefinitionTarget = target || null;
    isSavingDefinition = false;
    if (definitionTitle) definitionTitle.textContent = title || "Definition";
    if (definitionSubtitle) definitionSubtitle.textContent = subtitle || "";
    if (definitionEditor) definitionEditor.setValue(sql || "");
    else if (definitionQueryInput) definitionQueryInput.value = sql || "";
    syncDefinitionSaveState();
    definitionModal.classList.remove("hidden");
    if (definitionEditor) definitionEditor.refresh();
  };

  const closeDefinitionModal = () => {
    activeDefinitionTarget = null;
    isSavingDefinition = false;
    syncDefinitionSaveState();
    if (definitionModal) definitionModal.classList.add("hidden");
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
      schema: String(context.schema || ""),
      table: String(context.table || ""),
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

  const normalizeColumnName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const buildColumnKeyMeta = (tableInfo) => {
    const meta = {};
    const mark = (columnName, kind, fkRef = null) => {
      const key = normalizeColumnName(columnName);
      if (!key) return;
      if (!meta[key]) meta[key] = { pk: false, fk: false, fkRefs: [] };
      if (kind === "pk") meta[key].pk = true;
      if (kind === "fk") {
        meta[key].fk = true;
        if (fkRef) {
          const refKey = [
            String(fkRef.refSchema || "").toLowerCase(),
            String(fkRef.refTable || "").toLowerCase(),
            Array.isArray(fkRef.fromColumns)
              ? fkRef.fromColumns
                  .map((name) => normalizeColumnName(name))
                  .join(",")
              : "",
            Array.isArray(fkRef.toColumns)
              ? fkRef.toColumns
                  .map((name) => normalizeColumnName(name))
                  .join(",")
              : "",
          ].join("|");
          const alreadyMarked = meta[key].fkRefs.some((entry) => {
            const entryKey = [
              String(entry.refSchema || "").toLowerCase(),
              String(entry.refTable || "").toLowerCase(),
              Array.isArray(entry.fromColumns)
                ? entry.fromColumns
                    .map((name) => normalizeColumnName(name))
                    .join(",")
                : "",
              Array.isArray(entry.toColumns)
                ? entry.toColumns
                    .map((name) => normalizeColumnName(name))
                    .join(",")
                : "",
            ].join("|");
            return entryKey === refKey;
          });
          if (!alreadyMarked) meta[key].fkRefs.push(fkRef);
        }
      }
    };

    const indexes =
      tableInfo && Array.isArray(tableInfo.indexes) ? tableInfo.indexes : [];
    indexes.forEach((index) => {
      if (!index || !index.primary) return;
      const columns = Array.isArray(index.columns) ? index.columns : [];
      columns.forEach((columnName) => mark(columnName, "pk"));
    });

    const constraints =
      tableInfo && Array.isArray(tableInfo.constraints)
        ? tableInfo.constraints
        : [];
    constraints.forEach((constraint) => {
      const type = String(
        (constraint && (constraint.type || constraint.constraint_type)) || "",
      ).toUpperCase();
      if (!type.includes("FOREIGN")) return;
      const columns =
        constraint && Array.isArray(constraint.columns)
          ? constraint.columns
          : [];
      const ref =
        (constraint && (constraint.ref || constraint.reference)) || {};
      const refTable = String(ref.table || "").trim();
      const refSchema = String(ref.schema || "").trim();
      const refColumns = Array.isArray(ref.columns) ? ref.columns : [];
      const fkRef = refTable
        ? {
            name: String((constraint && constraint.name) || ""),
            fromColumns: columns.map((columnName) => String(columnName || "")),
            toColumns: refColumns.map((columnName) => String(columnName || "")),
            refSchema,
            refTable,
          }
        : null;
      columns.forEach((columnName) => mark(columnName, "fk", fkRef));
    });

    return meta;
  };

  const buildColumnMetaCacheKey = (context) => {
    if (!context || !context.table) return "";
    const scope = String(getCurrentHistoryKey() || "__default__");
    const schema = String(context.schema || "").toLowerCase();
    const table = String(context.table || "").toLowerCase();
    return `${scope}::${schema}.${table}`;
  };

  const loadColumnKeyMeta = async (context) => {
    if (!context || !context.table) return null;
    if (typeof safeApi.listTableInfo !== "function") return null;
    const cacheKey = buildColumnMetaCacheKey(context);
    if (!cacheKey) return null;
    if (columnKeyMetaByTableKey.has(cacheKey)) {
      return columnKeyMetaByTableKey.get(cacheKey);
    }

    try {
      const res = await safeApi.listTableInfo({
        schema: String(context.schema || ""),
        table: String(context.table || ""),
      });
      if (!res || !res.ok) return null;
      const meta = buildColumnKeyMeta(res);
      columnKeyMetaByTableKey.set(cacheKey, meta);
      return meta;
    } catch (_) {
      return null;
    }
  };

  const normalizeSnapshotPagination = (pagination) => {
    if (!pagination || !pagination.enabled) return null;
    const page = Number.isFinite(Number(pagination.page))
      ? Math.max(0, Math.floor(Number(pagination.page)))
      : 0;
    const pageSize = resolveServerPageSize(pagination.pageSize);
    const hasNext = !!pagination.hasNext;
    const baseSql = normalizeSql(pagination.baseSql || "");
    if (!baseSql) return null;
    return {
      enabled: true,
      page,
      pageSize,
      hasNext,
      baseSql,
    };
  };

  const updatePaginationControls = (snapshot) => {
    const pagination = normalizeSnapshotPagination(
      snapshot && snapshot.pagination,
    );
    if (tablePagination) {
      tablePagination.classList.toggle("hidden", !pagination);
    }
    if (!pagination) {
      if (pagePrevBtn) pagePrevBtn.disabled = true;
      if (pageNextBtn) pageNextBtn.disabled = true;
      if (pageInfo) pageInfo.textContent = "Page 1";
      return;
    }
    if (pagePrevBtn) pagePrevBtn.disabled = pagination.page <= 0;
    if (pageNextBtn) pageNextBtn.disabled = !pagination.hasNext;
    if (pageInfo) pageInfo.textContent = `Page ${pagination.page + 1}`;
  };

  const applyResultsPanelState = ({
    snapshot = null,
    objectContext = null,
    preferredObjectTab = "data",
  } = {}) => {
    const hasSnapshot = !!(snapshot && Array.isArray(snapshot.rows));
    const normalizedContext = normalizeObjectContext(objectContext);
    const nextObjectTab = hasSnapshot
      ? "data"
      : preferredObjectTab === "columns"
        ? "columns"
        : "data";
    const requestSeq = ++columnKeyMetaRequestSeq;

    if (tableView) {
      if (hasSnapshot) tableView.setResults(snapshot);
      else tableView.clearUi();
    }
    updatePaginationControls(hasSnapshot ? snapshot : null);

    if (hasSnapshot && normalizedContext && tableView) {
      void (async () => {
        const columnKeyMeta = await loadColumnKeyMeta(normalizedContext);
        if (!columnKeyMeta) return;
        if (requestSeq !== columnKeyMetaRequestSeq) return;
        if (!tableView) return;
        tableView.setResults({
          ...snapshot,
          columnKeyMeta,
        });
      })();
    }

    if (tableObjectTabsView) {
      if (normalizedContext) {
        tableObjectTabsView.openTable({
          schema: normalizedContext.schema,
          table: normalizedContext.table,
          active: nextObjectTab,
        });
      } else {
        tableObjectTabsView.clear();
      }
      if (nextObjectTab === "data") {
        tableObjectTabsView.activateData();
      }
      tableObjectTabsView.setDataToolbarVisible(hasSnapshot);
    }
  };

  const renderResults = (
    rows,
    totalRows,
    truncated,
    baseSql = "",
    sourceSql = "",
    pagination = null,
  ) => {
    const snapshot = {
      rows,
      totalRows,
      truncated,
      baseSql,
      sourceSql,
      pagination,
    };
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
    const text = String(sqlText || "");
    let sanitized = "";
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (inLineComment) {
        if (ch === "\n") {
          inLineComment = false;
          sanitized += "\n";
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
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
        if (ch === "`") inBacktick = false;
        continue;
      }

      if (ch === "-" && next === "-") {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
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
      if (ch === "`") {
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
    const firstDdlAdmin = findFirstPolicyKeyword(
      sanitized,
      POLICY_DDL_ADMIN_KEYWORDS,
    );
    const selectIntoMatch = /\bselect\b[\s\S]*\binto\b/.exec(sanitized);
    const selectIntoWrite = selectIntoMatch
      ? { token: "select into", index: selectIntoMatch.index }
      : null;

    let effectiveWrite = firstWrite;
    if (
      selectIntoWrite &&
      (!effectiveWrite || selectIntoWrite.index < effectiveWrite.index)
    ) {
      effectiveWrite = selectIntoWrite;
    }

    if (!effectiveWrite && !firstDdlAdmin) return null;

    if (
      firstDdlAdmin &&
      (!effectiveWrite || firstDdlAdmin.index <= effectiveWrite.index)
    ) {
      return {
        kind: "ddlAdmin",
        action: String(firstDdlAdmin.token || "").toUpperCase(),
      };
    }

    return {
      kind: "write",
      action: String(effectiveWrite.token || "").toUpperCase(),
    };
  };

  const shouldRefreshSchema = (statementSql) => {
    const clean = normalizeSql(stripLeadingComments(statementSql));
    if (!clean) return false;
    return /^(create\s+table|create\s+view|create\s+index|alter|drop|delete)\b/i.test(
      clean,
    );
  };

  const normalizeSql = (sql) =>
    String(sql || "")
      .trim()
      .replace(/;$/, "")
      .trim();

  const isExplainStatement = (statementSql) => {
    const clean = normalizeSql(stripLeadingComments(statementSql));
    if (!clean) return false;
    return /^explain\b/i.test(clean);
  };

  const resolveServerPageSize = (value) => {
    const raw = String(value == null ? "" : value).trim();
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0)
      return SERVER_PAGE_SIZE_DEFAULT;
    return Math.min(SERVER_PAGE_SIZE_MAX, Math.max(1, Math.floor(numeric)));
  };

  const getServerPageSizeSelection = () => {
    const raw = limitSelect ? String(limitSelect.value || "").trim() : "";
    if (!raw || raw === "none") return SERVER_PAGE_SIZE_DEFAULT;
    return resolveServerPageSize(raw);
  };

  const buildServerPaginatedSql = (selectSql, page, pageSize) => {
    const baseSql = normalizeSql(selectSql);
    if (!baseSql) return "";
    const safePage = Number.isFinite(Number(page))
      ? Math.max(0, Math.floor(Number(page)))
      : 0;
    const safePageSize = resolveServerPageSize(pageSize);
    const fetchLimit = safePageSize + 1;
    const fetchOffset = safePage * safePageSize;
    return `SELECT * FROM (${baseSql}) AS __qury_page LIMIT ${fetchLimit} OFFSET ${fetchOffset}`;
  };

  const applyLimit = (sql) => {
    const limitValue = limitSelect ? limitSelect.value : "none";
    if (!limitValue || limitValue === "none") return sql;
    const clean = normalizeSql(sql);
    if (!clean) return clean;
    if (/\\blimit\\b/i.test(clean)) return clean;
    return `${clean} LIMIT ${limitValue}`;
  };

  const applyLimitIfSelect = (sql) => {
    const keyword = firstDmlKeyword(sql);
    if (keyword !== "select") return sql;
    return applyLimit(sql);
  };

  const getTimeoutMs = () => {
    const value = timeoutSelect ? timeoutSelect.value : "none";
    if (!value || value === "none") return 0;
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

  const sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });

  const TRANSIENT_SQLSTATE_CODES = new Set([
    "40001", // serialization_failure
    "40P01", // deadlock_detected
    "53300", // too_many_connections
    "57P01", // admin_shutdown
    "57P02", // crash_shutdown
    "57P03", // cannot_connect_now
  ]);

  const TRANSIENT_VENDOR_CODES = new Set([
    "1205", // lock wait timeout
    "1213", // deadlock
    "1040", // too many connections
    "2006", // server has gone away
    "2013", // lost connection
  ]);

  const TRANSIENT_MESSAGE_PATTERNS = [
    /\bdeadlock\b/i,
    /\bserialization\b/i,
    /\block wait timeout\b/i,
    /\btoo many connections\b/i,
    /\bserver has gone away\b/i,
    /\blost connection\b/i,
    /\bconnection (?:was )?(?:closed|reset|lost|refused|terminated)\b/i,
    /\bnetwork\b/i,
    /\btimeout\b/i,
    /\btimed out\b/i,
    /\bECONNRESET\b/i,
    /\bETIMEDOUT\b/i,
  ];

  const stripDbCodePrefixes = (value) => {
    let text = String(value || "");
    text = text.replace(/^\s*(?:SQLSTATE\s+)?[A-Z0-9_]{2,}\s*:\s*/i, "");
    text = text.replace(/^\s*\[[A-Z0-9_]{2,}\]\s*/i, "");
    text = text.replace(/\bSQLSTATE\s+[A-Z0-9]{5}\b/gi, "").trim();
    return text || "Error";
  };

  const redactSensitiveErrorText = (value) => {
    let text = String(value || "");
    text = text.replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\/\s]+):([^@\/\s]+)@/gi,
      "$1***:***@",
    );
    text = text.replace(
      /\b(password|passwd|pwd|token|secret|api[_-]?key)\b\s*([=:])\s*('[^']*'|"[^"]*"|`[^`]*`|[^\s,;]+)/gi,
      "$1$2<redacted>",
    );
    text = text.replace(
      /\b(authorization)\b\s*:\s*(?:bearer\s+)?[^\s,;]+/gi,
      "$1: <redacted>",
    );
    return text;
  };

  const normalizeDbErrorPayload = (payload) => {
    if (payload && typeof payload === "object") {
      return {
        error: payload.error || payload.message || "Error",
        code: payload.code || "",
        sqlState: payload.sqlState || payload.sqlstate || "",
        errno: payload.errno,
      };
    }
    return {
      error: payload || "Error",
      code: "",
      sqlState: "",
      errno: undefined,
    };
  };

  const formatDbErrorMessage = (payload, settings) => {
    const normalized = normalizeDbErrorPayload(payload);
    const mode = normalizeErrorHandlingSettings(settings);
    let message = String(normalized.error || "Error");
    if (!mode.showDetailedDbErrorCode) {
      message = stripDbCodePrefixes(message);
    } else {
      const details = [];
      if (
        normalized.sqlState &&
        !String(message).includes(normalized.sqlState)
      ) {
        details.push(`SQLSTATE ${normalized.sqlState}`);
      }
      if (
        normalized.code &&
        !String(message).includes(normalized.code) &&
        String(normalized.code) !== String(normalized.sqlState || "")
      ) {
        details.push(String(normalized.code));
      }
      if (normalized.errno !== undefined && normalized.errno !== null) {
        const errnoToken = `ERRNO ${normalized.errno}`;
        if (!String(message).includes(String(normalized.errno)))
          details.push(errnoToken);
      }
      if (details.length) {
        message = `${message} (${details.join(" | ")})`;
      }
    }
    if (mode.hideSensitiveValuesInErrors) {
      message = redactSensitiveErrorText(message);
    }
    return String(message || "Error").trim() || "Error";
  };

  const isTransientDbError = (payload) => {
    const normalized = normalizeDbErrorPayload(payload);
    const sqlState = String(normalized.sqlState || "").toUpperCase();
    const code = String(normalized.code || "").toUpperCase();
    const errno = String(normalized.errno || "");
    if (sqlState && TRANSIENT_SQLSTATE_CODES.has(sqlState)) return true;
    if (code && TRANSIENT_SQLSTATE_CODES.has(code)) return true;
    if (errno && TRANSIENT_VENDOR_CODES.has(errno)) return true;
    const message = String(normalized.error || "");
    return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
  };

  const runQueryWithRetry = async (payload, statementSql, settings) => {
    const mode = normalizeErrorHandlingSettings(settings);
    const allowRetry =
      mode.retryTransientSelectErrors &&
      firstDmlKeyword(statementSql) === "select";
    const maxAttempts = allowRetry ? 2 : 1;
    let attempt = 0;
    let result = null;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        result = await safeApi.runQuery(payload);
      } catch (err) {
        result = {
          ok: false,
          error: err && err.message ? err.message : "Failed to run query.",
        };
      }
      if (result && result.ok) {
        return { result, attempts: attempt, retried: attempt > 1 };
      }
      if (!allowRetry || attempt >= maxAttempts || !isTransientDbError(result))
        break;
      await sleep(250);
    }
    return { result, attempts: attempt, retried: attempt > 1 };
  };

  const runSql = async (rawSql, sourceSqlOverride = "", options = {}) => {
    const applyDefaultLimit = options.applyDefaultLimit !== false;
    const executionSql = normalizeSql(rawSql);
    if (!executionSql) return false;
    setResultsVisible(true);
    if (tabTablesView) {
      const tab = tabTablesView.getActiveTab();
      const tabId = tab && tab.id ? tab.id : "";
      const snapshot = tabId ? resultsByTabId.get(tabId) || null : null;
      const objectContext = tabId ? getObjectContextForTab(tabId) : null;
      applyResultsPanelState({ snapshot, objectContext });
    }
    const sourceSql = sourceSqlOverride
      ? normalizeSql(sourceSqlOverride)
      : executionSql;
    const statements = splitStatements(executionSql);
    const sourceStatements = splitStatements(sourceSql);
    const total = statements.length || 1;
    if (total === 0) return false;
    const timeoutMs = getTimeoutMs() || 0;
    const activeConnection = getActiveConnection();
    const activePolicyMode = getEntryPolicyMode(activeConnection);
    const activePolicyRule = getEnvironmentPolicyRule(activePolicyMode);
    const errorSettings = getErrorHandlingSettings();

    let lastResult = null;
    let lastExecutedStmt = "";
    let lastRenderableResult = null;
    let lastRenderableStmt = "";
    let lastRenderableSourceStmt = "";
    let policyApprovalToken = "";
    let firstApprovalAction = "";
    let executedStatements = 0;
    let errorCount = 0;
    let lastErrorMessage = "";
    let hasOutputErrorEntry = false;
    let lastPagination = null;
    let needsSchemaRefresh = false;

    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      const classification = classifyStatementByPolicy(stmt);
      if (!classification) continue;
      const policyLabel = String(
        activePolicyMode || POLICY_MODE_DEV,
      ).toUpperCase();
      if (
        classification.kind === "ddlAdmin" &&
        !activePolicyRule.allowDdlAdmin
      ) {
        const message = `${policyLabel} policy blocks ${classification.action} statements.`;
        await safeApi.showError(message);
        setQueryStatus({ state: "error", message });
        return false;
      }
      if (classification.kind === "write" && !activePolicyRule.allowWrite) {
        const message = `${policyLabel} policy blocks ${classification.action} statements.`;
        await safeApi.showError(message);
        setQueryStatus({ state: "error", message });
        return false;
      }
      if (activePolicyRule.requireApproval && !firstApprovalAction) {
        if (classification.kind === "write" && activePolicyRule.allowWrite) {
          firstApprovalAction = classification.action;
        } else if (
          classification.kind === "ddlAdmin" &&
          activePolicyRule.allowDdlAdmin
        ) {
          firstApprovalAction = classification.action;
        }
      }
    }

    if (activePolicyRule.requireApproval && firstApprovalAction) {
      const policyLabel = String(
        activePolicyMode || POLICY_MODE_DEV,
      ).toUpperCase();
      const confirmation = await promptPolicyApproval({
        policyLabel: `${policyLabel} policy`,
        actionLabel: firstApprovalAction,
      });
      if (
        String(confirmation || "")
          .trim()
          .toUpperCase() !== POLICY_APPROVAL_TOKEN
      ) {
        setQueryStatus({
          state: "error",
          message: `Canceled by ${policyLabel} policy`,
        });
        return false;
      }
      policyApprovalToken = POLICY_APPROVAL_TOKEN;
    }

    const overallStart = Date.now();
    if (runBtn) runBtn.disabled = true;
    if (runSelectionBtn) runSelectionBtn.disabled = true;
    if (runCurrentBtn) runCurrentBtn.disabled = true;
    if (explainBtn) explainBtn.disabled = true;
    if (explainAnalyzeBtn) explainAnalyzeBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    startQueryProgress(timeoutMs);
    try {
      for (let i = 0; i < statements.length; i += 1) {
        const stmt = normalizeSql(statements[i]);
        if (!stmt) continue;
        const classification = classifyStatementByPolicy(stmt);
        const keyword = firstDmlKeyword(stmt);
        const isExplain = isExplainStatement(stmt);
        const canPaginateSelect =
          keyword === "select" &&
          !(classification && classification.kind === "write");
        const serverPaginationConfig =
          options && options.serverPagination !== undefined
            ? options.serverPagination
            : null;
        const useServerPagination =
          canPaginateSelect && serverPaginationConfig !== false;
        const paginationPage =
          useServerPagination &&
          serverPaginationConfig &&
          Number.isFinite(Number(serverPaginationConfig.page))
            ? Math.max(0, Math.floor(Number(serverPaginationConfig.page)))
            : 0;
        const paginationPageSize =
          useServerPagination &&
          serverPaginationConfig &&
          serverPaginationConfig.pageSize != null
            ? resolveServerPageSize(serverPaginationConfig.pageSize)
            : getServerPageSizeSelection();
        const paginationBaseSql = useServerPagination
          ? normalizeSql(
              (serverPaginationConfig && serverPaginationConfig.baseSql) ||
                stmt,
            )
          : "";
        const displayStmt =
          useServerPagination && paginationBaseSql ? paginationBaseSql : stmt;

        executedStatements += 1;
        lastExecutedStmt = displayStmt;
        if (isDangerousStatement(stmt)) {
          const actionLabel = keyword
            ? `${keyword.toUpperCase()} without WHERE`
            : "dangerous statement";
          const confirmation = await promptPolicyApproval({
            policyLabel: "Safety check",
            actionLabel,
          });
          if (
            String(confirmation || "")
              .trim()
              .toUpperCase() !== POLICY_APPROVAL_TOKEN
          ) {
            setQueryStatus({
              state: "error",
              message: "Canceled by safety check",
            });
            return false;
          }
        }
        let sql = applyDefaultLimit ? applyLimitIfSelect(stmt) : stmt;
        if (useServerPagination && paginationBaseSql) {
          sql = buildServerPaginatedSql(
            paginationBaseSql,
            paginationPage,
            paginationPageSize,
          );
        }
        const startedAt = Date.now();
        setQueryStatus({
          state: "running",
          message: `Running ${i + 1}/${total}...`,
        });
        const payload = {
          sql,
          timeoutMs: timeoutMs || undefined,
        };
        if (policyApprovalToken) payload.policyApproval = policyApprovalToken;
        const { result: res } = await runQueryWithRetry(
          payload,
          stmt,
          errorSettings,
        );
        if (!res || !res.ok) {
          const formattedError = formatDbErrorMessage(
            res || { error: "Failed to run query." },
            errorSettings,
          );
          errorCount += 1;
          lastErrorMessage = formattedError;
          if (tabTablesView) {
            const tab = tabTablesView.getActiveTab();
            if (tab && tab.id) {
              appendOutputEntry(
                tab.id,
                buildOutputEntry({
                  sql: displayStmt,
                  ok: false,
                  error: formattedError,
                  duration: Date.now() - startedAt,
                }),
              );
              updateOutputForActiveTab();
              hasOutputErrorEntry = true;
            }
          }
          if (!errorSettings.continueOnError) {
            await safeApi.showError(formattedError);
            setQueryStatus({ state: "error", message: formattedError });
            if (errorSettings.autoOpenOutputOnError && hasOutputErrorEntry)
              openOutputModal();
            return false;
          }
          continue;
        }
        if (shouldRefreshSchema(stmt)) {
          needsSchemaRefresh = true;
        }
        let outputRows = res.rows || [];
        let outputTotalRows = res.totalRows;
        let outputTruncated = !!res.truncated;
        let pagination = null;
        if (useServerPagination && paginationBaseSql) {
          const hasNext = outputRows.length > paginationPageSize;
          if (hasNext) outputRows = outputRows.slice(0, paginationPageSize);
          outputTotalRows = outputRows.length;
          outputTruncated = false;
          pagination = {
            enabled: true,
            page: paginationPage,
            pageSize: paginationPageSize,
            hasNext,
            baseSql: paginationBaseSql,
          };
          lastPagination = pagination;
        } else {
          lastPagination = null;
        }

        lastResult = {
          rows: outputRows,
          totalRows: outputTotalRows,
          truncated: outputTruncated,
          stmt: displayStmt,
          pagination,
        };
        const sourceStmt = normalizeSql(
          sourceStatements.length > i ? sourceStatements[i] : sourceSql,
        );
        const shouldRenderResults =
          (keyword === "select" &&
            !(classification && classification.kind === "write")) ||
          (isExplain && Array.isArray(outputRows)) ||
          (!classification && Array.isArray(outputRows));
        if (shouldRenderResults) {
          lastRenderableResult = lastResult;
          lastRenderableStmt = displayStmt;
          lastRenderableSourceStmt = sourceStmt || displayStmt;
        }
        if (historyManager) await historyManager.recordHistory(displayStmt);
        if (tabTablesView) {
          const tab = tabTablesView.getActiveTab();
          if (tab && tab.id) {
            appendOutputEntry(
              tab.id,
              buildOutputEntry({
                sql: displayStmt,
                ok: true,
                totalRows: outputTotalRows || 0,
                truncated: outputTruncated,
                affectedRows: Number.isFinite(res.affectedRows)
                  ? res.affectedRows
                  : undefined,
                changedRows: Number.isFinite(res.changedRows)
                  ? res.changedRows
                  : undefined,
                duration: Date.now() - startedAt,
              }),
            );
            updateOutputForActiveTab();
          }
        }
        if (
          !isExplain &&
          classification &&
          (classification.kind === "write" ||
            classification.kind === "ddlAdmin")
        ) {
          const affected = Number.isFinite(res.affectedRows)
            ? res.affectedRows
            : null;
          const changed = Number.isFinite(res.changedRows)
            ? res.changedRows
            : null;
          const action =
            String(classification.action || "").trim() || "Changes applied";
          if (affected !== null) {
            showToast(`${action}: ${affected} row(s)`);
          } else if (changed !== null) {
            showToast(`${action}: ${changed} row(s)`);
          } else {
            showToast(action);
          }
        }
      }

      if (errorCount > 0) {
        if (lastRenderableResult) {
          renderResults(
            lastRenderableResult.rows || [],
            lastRenderableResult.totalRows,
            lastRenderableResult.truncated,
            lastRenderableStmt || lastRenderableResult.stmt,
            lastRenderableSourceStmt ||
              lastRenderableStmt ||
              lastRenderableResult.stmt,
            lastRenderableResult.pagination || null,
          );
          setQueryStatus({
            state: "error",
            message: `Completed with ${errorCount} error(s). Last rows: ${lastRenderableResult.totalRows || 0}`,
            duration: Date.now() - overallStart,
          });
        } else {
          setQueryStatus({
            state: "error",
            message:
              lastErrorMessage || `Completed with ${errorCount} error(s).`,
            duration: Date.now() - overallStart,
          });
        }
        if (errorSettings.autoOpenOutputOnError && hasOutputErrorEntry)
          openOutputModal();
        return false;
      }

      if (lastRenderableResult) {
        renderResults(
          lastRenderableResult.rows || [],
          lastRenderableResult.totalRows,
          lastRenderableResult.truncated,
          lastRenderableStmt || lastRenderableResult.stmt,
          lastRenderableSourceStmt ||
            lastRenderableStmt ||
            lastRenderableResult.stmt,
          lastRenderableResult.pagination || null,
        );
        const paginationInfo = lastRenderableResult.pagination;
        setQueryStatus({
          state: "success",
          message: paginationInfo
            ? `Rows: ${lastRenderableResult.totalRows || 0} (page ${Number(paginationInfo.page) + 1})`
            : `Rows: ${lastRenderableResult.totalRows || 0}`,
          duration: Date.now() - overallStart,
        });
      } else if (lastResult) {
        setQueryStatus({
          state: "success",
          message: `Rows: ${lastResult.totalRows || 0}`,
          duration: Date.now() - overallStart,
        });
      }
      if (needsSchemaRefresh && treeView) {
        const tables = await treeView.refresh();
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
      }
      return executedStatements > 0;
    } finally {
      stopQueryProgress();
      if (runBtn) runBtn.disabled = false;
      if (runSelectionBtn) runSelectionBtn.disabled = false;
      if (runCurrentBtn) runCurrentBtn.disabled = false;
      if (explainBtn) explainBtn.disabled = false;
      if (explainAnalyzeBtn) explainAnalyzeBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  };

  const updateRunAvailability = () => {
    const sql = codeEditor ? codeEditor.getValue() : query ? query.value : "";
    const hasText = !!(sql && sql.trim());
    if (runBtn) runBtn.disabled = !hasText;
    if (runSelectionBtn) {
      const selection = codeEditor ? codeEditor.getSelection() : "";
      const hasSelection = !!(selection && selection.trim());
      runSelectionBtn.disabled = !hasText || !hasSelection;
    }
    if (runCurrentBtn) runCurrentBtn.disabled = !hasText;
    if (explainBtn) explainBtn.disabled = !hasText;
    if (explainAnalyzeBtn) explainAnalyzeBtn.disabled = !hasText;
    if (runBtn) runBtn.classList.toggle("ready", hasText);
    if (saveSnippetEditorBtn) {
      saveSnippetEditorBtn.classList.toggle("hidden", !hasText);
      saveSnippetEditorBtn.disabled = !hasText;
    }
  };

  const handleRun = async () => {
    const sql = codeEditor ? codeEditor.getValue() : query ? query.value : "";
    if (!sql || !sql.trim()) {
      await safeApi.showError("Empty query.");
      return;
    }
    lastSort = null;
    await runSql(sql);
  };

  const handleRunSelection = async () => {
    const selection = codeEditor ? codeEditor.getSelection() : "";
    const sql = selection && selection.trim() ? selection : "";
    if (!sql) {
      await safeApi.showError("Select a query.");
      return;
    }
    lastSort = null;
    await runSql(sql);
  };

  const resolveEditorCursorOffset = () => {
    if (codeEditor && typeof codeEditor.getCursorOffset === "function") {
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
    const source = String(sourceSql || "");
    const statements = splitStatementsWithRanges(source);
    if (!statements.length) return "";
    const safeCursor = Math.max(
      0,
      Math.min(source.length, Number(cursorOffset) || 0),
    );

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
    const sql = codeEditor ? codeEditor.getValue() : query ? query.value : "";
    if (!sql || !sql.trim()) {
      await safeApi.showError("Empty query.");
      return;
    }
    const cursorOffset = resolveEditorCursorOffset();
    const stmt = findStatementAtCursor(sql, cursorOffset);
    if (!stmt) {
      await safeApi.showError("No statement found at cursor.");
      return;
    }
    lastSort = null;
    await runSql(stmt);
  };

  const handleExplain = async ({ analyze = false } = {}) => {
    const explainPrefix = analyze ? "EXPLAIN ANALYZE" : "EXPLAIN";
    const explainLabel = analyze ? "EXPLAIN ANALYZE" : "EXPLAIN";
    const selection = codeEditor ? codeEditor.getSelection() : "";
    const sourceSql =
      selection && selection.trim()
        ? selection
        : codeEditor
          ? codeEditor.getValue()
          : query
            ? query.value
            : "";
    if (!sourceSql || !sourceSql.trim()) {
      await safeApi.showError("Empty query.");
      return;
    }

    const statements = splitStatements(sourceSql);
    const explainStatements = [];
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      if (firstDmlKeyword(stmt) !== "select") {
        await safeApi.showError(
          `${explainLabel} is currently available only for SELECT statements.`,
        );
        return;
      }
      explainStatements.push(`${explainPrefix} ${stmt}`);
    }

    if (!explainStatements.length) {
      await safeApi.showError("Empty query.");
      return;
    }

    lastSort = null;
    await runSql(explainStatements.join(";\n"), sourceSql, {
      applyDefaultLimit: false,
    });
  };

  const extractSelectAllTableRef = (rawSql) => {
    const clean = normalizeSql(stripLeadingComments(rawSql));
    if (!clean) return "";
    const match = clean.match(/^select\s+\*\s+from\s+(.+)$/i);
    if (!match || !match[1]) return "";
    let fromRef = match[1].trim();
    const clauseMatch = fromRef.match(
      /\s+(where|order\s+by|limit|offset|group\s+by|having)\b/i,
    );
    if (clauseMatch && Number.isFinite(clauseMatch.index)) {
      fromRef = fromRef.slice(0, clauseMatch.index).trim();
    }
    if (!fromRef || /[\s,()]/.test(fromRef)) return "";
    return fromRef;
  };

  const extractSingleFromTableRef = (rawSql) => {
    const clean = normalizeSql(stripLeadingComments(rawSql));
    if (!clean) return "";
    const match = clean.match(/^select\s+[\s\S]+?\s+from\s+(.+)$/i);
    if (!match || !match[1]) return "";
    let fromRef = match[1].trim();
    const clauseMatch = fromRef.match(
      /\s+(where|order\s+by|limit|offset|group\s+by|having|inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join|union)\b/i,
    );
    if (clauseMatch && Number.isFinite(clauseMatch.index)) {
      fromRef = fromRef.slice(0, clauseMatch.index).trim();
    }
    const aliasMatch = fromRef.match(/^([^\s]+)\s+/);
    if (aliasMatch && aliasMatch[1]) {
      fromRef = aliasMatch[1].trim();
    }
    if (!fromRef || /[,()]/.test(fromRef)) return "";
    return fromRef;
  };

  const parseTableReference = (rawRef) => {
    const text = String(rawRef || "").trim();
    if (!text) return null;
    const parts = [];
    let token = "";
    let quote = "";
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === quote) {
          if (i + 1 < text.length && text[i + 1] === quote) {
            token += quote;
            i += 1;
            continue;
          }
          quote = "";
          continue;
        }
        token += ch;
        continue;
      }
      if (ch === "`" || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === ".") {
        parts.push(token.trim());
        token = "";
        continue;
      }
      token += ch;
    }
    if (quote) return null;
    parts.push(token.trim());
    const cleanParts = parts.filter((part) => part !== "");
    if (cleanParts.length === 1) {
      return { schema: "", table: cleanParts[0] };
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
    if (!tableRef) return "";
    return `SELECT COUNT(*) AS total FROM ${tableRef};`;
  };

  const applyTableFilter = async () => {
    const filter = queryFilter ? queryFilter.value.trim() : "";
    const active = tableView ? tableView.getActive() : null;
    const base =
      active && (active.sourceSql || active.baseSql)
        ? active.sourceSql || active.baseSql
        : codeEditor
          ? codeEditor.getValue()
          : query
            ? query.value
            : "";
    if (!base || !base.trim()) {
      await safeApi.showError("Empty query.");
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
    queryFilterClear.classList.toggle("hidden", !hasValue);
  };

  const quoteIdentifier = (name) => {
    if (!name) return name;
    const text = String(name);
    if (!/^[A-Za-z0-9_$.]+$/.test(text)) {
      return text;
    }
    const active = getActiveConnection();
    const type = active && active.type ? active.type : "mysql";
    const parts = text.split(".");
    if (type === "postgres" || type === "postgresql") {
      return parts
        .map((p) =>
          p.startsWith('\"') ? p : `\"${p.replace(/\"/g, '\"\"')}\"`,
        )
        .join(".");
    }
    return parts
      .map((p) => (p.startsWith("`") ? p : `\`${p.replace(/`/g, "``")}\``))
      .join(".");
  };

  const quoteDbIdentifier = (value, type) => {
    const raw = String(value || "");
    if (!raw) return raw;
    const parts = raw.split(".");
    if (type === "postgres" || type === "postgresql") {
      return parts.map((part) => `"${part.replace(/"/g, '""')}"`).join(".");
    }
    return parts.map((part) => `\`${part.replace(/`/g, "``")}\``).join(".");
  };

  const buildQualifiedTableRef = (schema, table) => {
    const active = getActiveConnection();
    const type = active && active.type ? active.type : "mysql";
    if (!schema) return quoteDbIdentifier(table, type);
    return `${quoteDbIdentifier(schema, type)}.${quoteDbIdentifier(table, type)}`;
  };

  const buildSelectAllSql = (schema, table) =>
    `SELECT * FROM ${buildQualifiedTableRef(schema, table)};`;

  const getRowValueForColumn = (row, columnName) => {
    if (!row || typeof row !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(row, columnName))
      return row[columnName];
    const target = normalizeColumnName(columnName);
    if (!target) return undefined;
    for (const key of Object.keys(row)) {
      if (normalizeColumnName(key) === target) return row[key];
    }
    return undefined;
  };

  const toSqlLiteral = (value) => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") {
      if (Number.isFinite(value)) return String(value);
      return `'${String(value).replace(/'/g, "''")}'`;
    }
    if (typeof value === "bigint") return String(value);
    if (typeof value === "boolean") {
      const active = getActiveConnection();
      const type = active && active.type ? active.type : "mysql";
      if (type === "postgres" || type === "postgresql")
        return value ? "TRUE" : "FALSE";
      return value ? "1" : "0";
    }
    if (value instanceof Date) {
      return `'${value.toISOString().replace(/'/g, "''")}'`;
    }
    if (typeof value === "object") {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  };

  const buildForeignKeyLookupSql = (fkRef, row, defaultSchema = "") => {
    if (!fkRef || !fkRef.refTable) return "";
    const fromColumns = Array.isArray(fkRef.fromColumns)
      ? fkRef.fromColumns.filter(Boolean)
      : [];
    const toColumnsRaw = Array.isArray(fkRef.toColumns)
      ? fkRef.toColumns.filter(Boolean)
      : [];
    if (fromColumns.length === 0) return "";
    const toColumns =
      toColumnsRaw.length === fromColumns.length ? toColumnsRaw : fromColumns;

    const conditions = [];
    for (let idx = 0; idx < fromColumns.length; idx += 1) {
      const sourceColumn = fromColumns[idx];
      const targetColumn = toColumns[idx];
      if (!targetColumn) return "";
      const sourceValue = getRowValueForColumn(row, sourceColumn);
      if (sourceValue === undefined) return "";
      if (sourceValue === null) {
        conditions.push(`${quoteIdentifier(targetColumn)} IS NULL`);
      } else {
        conditions.push(
          `${quoteIdentifier(targetColumn)} = ${toSqlLiteral(sourceValue)}`,
        );
      }
    }
    if (conditions.length === 0) return "";
    const targetSchema = String(fkRef.refSchema || defaultSchema || "").trim();
    return `SELECT * FROM ${buildQualifiedTableRef(targetSchema, fkRef.refTable)} WHERE ${conditions.join(" AND ")};`;
  };

  const openTableFromNavigator = async (
    schema,
    name,
    sql = "",
    options = {},
  ) => {
    const table = String(name || "").trim();
    if (!table) return;
    const querySql =
      String(sql || "").trim() || buildSelectAllSql(schema, table);
    let openedTab = null;
    if (tabTablesView) {
      const defaultDb = dbSelect ? String(dbSelect.value || "").trim() : "";
      openedTab = tabTablesView.createWithQuery(table, querySql, {
        database: schema || defaultDb,
      });
    }
    if (openedTab && openedTab.id) {
      setObjectContextForTab(openedTab.id, { schema, table });
    }
    const preferredObjectTab =
      options &&
      options.execute === false &&
      options.openObjectTab === "columns"
        ? "columns"
        : "data";
    applyResultsPanelState({
      snapshot: null,
      objectContext: { schema, table },
      preferredObjectTab,
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
    toggleEditorBtn.classList.toggle("active", nextVisible);
    toggleEditorBtn.title = nextVisible ? "Collapse editor" : "Expand editor";
    toggleEditorBtn.setAttribute(
      "aria-label",
      nextVisible ? "Collapse editor" : "Expand editor",
    );
    toggleEditorBtn.setAttribute(
      "aria-pressed",
      nextVisible ? "true" : "false",
    );
    const icon = toggleEditorBtn.querySelector("i");
    if (icon) {
      icon.className = nextVisible ? "bi bi-chevron-up" : "bi bi-chevron-down";
    }
  };

  const resolveEditorVisibility = () => {
    const key = tabConnectionsView ? tabConnectionsView.getActiveKey() : null;
    const persisted = readEditorVisibilityForConnection(key);
    if (typeof persisted === "boolean") return persisted;
    const tab = tabTablesView ? tabTablesView.getActiveTab() : null;
    return tab ? tab.editorVisible !== false : true;
  };

  const setEditorVisible = (visible, { persist = true } = {}) => {
    const nextVisible = !!visible;
    if (editorBody) editorBody.classList.toggle("hidden", !nextVisible);
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
    const current = parseFloat(editorBody.style.height || "");
    if (Number.isFinite(current) && current > 0) return current;
    return editorBody.offsetHeight || 0;
  };

  const setResultsVisible = (visible) => {
    resultsVisible = !!visible;
    if (resultsPanel) resultsPanel.classList.toggle("hidden", !resultsVisible);
    if (editorResizer)
      editorResizer.classList.toggle("hidden", !resultsVisible);
    if (!editorBody) return;
    if (!resultsVisible) {
      const maxHeight = resolveMaxEditorBodyHeight(
        getCurrentEditorBodyHeight(),
      );
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

  const updateDbSelectUsageHint = (name = "") => {
    if (!dbSelect) return;
    const current = String(name || "").trim();
    const title = current
      ? `Runs USE database to set the default context. Current: ${current}.`
      : "Runs USE database to set the default context.";
    dbSelect.title = title;
    if (dbSelectWrap) dbSelectWrap.title = title;
    dbSelect.setAttribute(
      "aria-label",
      current ? `Use database. Current ${current}` : "Use database",
    );
  };

  const refreshDatabases = async () => {
    if (!dbSelect) return;
    const res = await safeApi.listDatabases();
    if (!res || !res.ok) {
      await safeApi.showError(
        (res && res.error) || "Failed to list databases.",
      );
      return;
    }
    dbSelect.innerHTML = "";
    (res.databases || []).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      dbSelect.appendChild(opt);
    });
    const active = getActiveConnection();
    const preferred = active && active.database ? active.database : "";
    const targetDb =
      res.current ||
      preferred ||
      (dbSelect.options.length > 0 ? dbSelect.options[0].value : "");
    if (targetDb) {
      dbSelect.value = targetDb;
    }
    updateDbSelectUsageHint(targetDb);
    if (tabTablesView) tabTablesView.render();
    if (targetDb && res.current !== targetDb) {
      const useRes = await safeApi.useDatabase(targetDb);
      if (!useRes || !useRes.ok) {
        await safeApi.showError(
          (useRes && useRes.error) || "Failed to select database.",
        );
        return;
      }
      if (active) {
        const key = tabConnectionsView
          ? tabConnectionsView.getActiveKey()
          : null;
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
      await safeApi.showError("View definitions not supported.");
      return;
    }
    setGlobalLoading(true, "Loading view...");
    let res = null;
    try {
      res = await safeApi.getViewDefinition({ schema, view: name });
    } catch (err) {
      const message =
        err && err.message ? err.message : "Failed to load view definition.";
      await safeApi.showError(message);
      setGlobalLoading(false);
      return;
    }
    if (!res || !res.ok) {
      await safeApi.showError(
        (res && res.error) || "Failed to load view definition.",
      );
      setGlobalLoading(false);
      return;
    }
    const sql = res.sql || res.definition || "";
    if (!sql || !sql.trim()) {
      await safeApi.showError("View definition is empty.");
      setGlobalLoading(false);
      return;
    }
    const title = "View definition";
    const subtitle = schema ? `${schema}.${name}` : name;
    openDefinitionModal({
      title,
      subtitle,
      sql,
      target: {
        kind: "view",
        schema: String(schema || ""),
        name: String(name || ""),
      },
    });
    setGlobalLoading(false);
  };

  const saveDefinition = async () => {
    const target = activeDefinitionTarget;
    if (!target || target.kind !== "view" || !target.name) {
      await safeApi.showError("Save unavailable for this definition.");
      return;
    }
    const sql = String(getDefinitionSql() || "").trim();
    if (!sql) {
      await safeApi.showError("Empty definition.");
      return;
    }
    isSavingDefinition = true;
    syncDefinitionSaveState();
    setGlobalLoading(true, "Saving view...");
    try {
      const ok = await runSql(sql, sql, { applyDefaultLimit: false });
      if (!ok) return;
      if (treeView) {
        const tables = await treeView.refresh();
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
      }
      showToast("View saved");
    } finally {
      isSavingDefinition = false;
      syncDefinitionSaveState();
      setGlobalLoading(false);
    }
  };

  const resetConnectionScopedUi = () => {
    resultsByTabId = new Map();
    objectContextByTabId = new Map();
    columnKeyMetaByTableKey = new Map();
    columnKeyMetaRequestSeq += 1;
    outputByTabId = new Map();
    setOutputDisplay(null);
    if (tableObjectTabsView) {
      tableObjectTabsView.resetScopeCache();
    }
    applyResultsPanelState({ snapshot: null, objectContext: null });
  };

  const syncActiveDatabaseAndTree = async (entry, key) => {
    const selectedDb = dbSelect ? String(dbSelect.value || "") : "";
    if (selectedDb) {
      if (treeView) treeView.setActiveSchema(selectedDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(selectedDb);
      if (entry) entry.database = selectedDb;
      if (entry && tabConnectionsView && key) {
        tabConnectionsView.upsert(key, entry);
      }
    } else {
      const fallbackDb = entry && entry.database ? String(entry.database) : "";
      if (treeView) treeView.setActiveSchema(fallbackDb);
      if (sqlAutocomplete) sqlAutocomplete.setActiveSchema(fallbackDb);
    }
    const tables = treeView ? await treeView.refresh() : null;
    if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
    return tables;
  };

  const changeDatabase = async (name) => {
    const targetDb = String(name || "").trim();
    if (!targetDb) return;
    setGlobalLoading(true, "Running USE database...");
    try {
      const res = await safeApi.useDatabase(targetDb);
      if (!res || !res.ok) {
        await safeApi.showError(
          (res && res.error) || "Failed to select database.",
        );
        return;
      }
      const active = getActiveConnection();
      if (active) {
        const key = tabConnectionsView
          ? tabConnectionsView.getActiveKey()
          : null;
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
      updateDbSelectUsageHint(targetDb);
      if (tabTablesView) tabTablesView.render();
      showToast(`Using database: ${targetDb}`);
    } finally {
      setGlobalLoading(false);
    }
  };

  const activateConnection = async (entry, previousKey = null) => {
    const resolvedEntry = await resolveConnectEntry(entry);
    const config = await buildConnectionConfigFromEntry(resolvedEntry);
    if (!config) {
      if (tabConnectionsView && previousKey)
        tabConnectionsView.setActive(previousKey);
      return false;
    }
    const key = getTabKey(entry);
    if (previousKey) saveTabsForKey(previousKey);
    setScreen(true);
    if (tabConnectionsView) tabConnectionsView.setActive(key);
    if (treeView && typeof treeView.clear === "function") treeView.clear();

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || "Failed to connect.");
      if (treeView && typeof treeView.clear === "function") treeView.clear();
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
    const ok = await activateConnection(
      entry,
      previousKey && previousKey !== key ? previousKey : null,
    );
    if (ok) closeConnectModal();
    return ok;
  };

  const normalizeSavedPolicyFilter = (value) => {
    const mode = String(value || "")
      .trim()
      .toLowerCase();
    if (
      mode === "dev" ||
      mode === "staging" ||
      mode === "prod" ||
      mode === "all"
    ) {
      return mode;
    }
    return "all";
  };

  const getSavedPolicyFilter = () => {
    if (!savedPolicyFilters) return "all";
    const selected = savedPolicyFilters.querySelector(
      'input[name="savedPolicyFilter"]:checked',
    );
    return normalizeSavedPolicyFilter(selected ? selected.value : "all");
  };

  const formatSavedPolicyFilterLabel = (value) => {
    const mode = normalizeSavedPolicyFilter(value);
    if (mode === "all") return "All";
    return mode.toUpperCase();
  };

  const savedComponent = createSavedConnections({
    getEntryPolicyMode,
    isEntryReadOnly,
    isEntrySsh,
    connectionTitle,
    formatSavedPolicyFilterLabel,
    getSavedPolicyFilter,
    showToast,
    showError: safeApi.showError,
  });

  const connectModalComponent = createConnectModal({
    onConnectSuccess: async (data, { shouldSave }) => {
      let config = {
        ...data,
        port: data.port || undefined,
        sessionTimezone: getSessionTimezoneSetting(),
        ...getConnectionTimeoutSettings(),
      };

      if (await tryActivateExistingConnection(config)) {
        connectModalComponent.close();
        return;
      }

      const res = await connectWithLoading(config);
      if (!res.ok) {
        await safeApi.showError(res.error || "Failed to connect.");
        return;
      }

      // Connection was already saved by the component if shouldSave is true
      if (shouldSave) {
        setEditMode(false);
        await savedComponent.renderSavedList();
      }

      saveTabsForActive();
      upsertConnectionTab(config);
      await refreshDatabases();
      await syncActiveDatabaseAndTree(config, getTabKey(config));
      resetConnectionScopedUi();
      loadTabsForKey(getTabKey(config));
      setScreen(true);
      connectModalComponent.close();
    },
    onSaveSuccess: async (data) => {
      setEditMode(false);
      await savedComponent.renderSavedList();
    },
    onTestSuccess: (data) => {
      showToast("Connection successful");
    },
    onError: async (message) => {
      await safeApi.showError(message);
    },
    onClose: () => {
      setEditMode(false);
    },
  });

  // Quick connect buttons
  const quickConnectComponent = createQuickConnect({
    onQuickConnect: (mode) => {
      connectModalComponent.open({ mode, keepForm: false });
    },
  });

  // Credential modal
  const credentialModalComponent = createCredentialModal();

  // Settings modal
  const settingsModalComponent = createSettingsModal({
    onOpen: async () => {
      setThemeMenuOpen(false);
      applySessionTimezoneToSettingsInput(readStoredSessionTimezone());
      applyErrorHandlingToSettingsInputs(readStoredErrorHandlingSettings());
      applyConnectionTimeoutsToSettingsInputs(readStoredConnectionTimeouts());
      applyQueryDefaultsToSettingsInputs(readStoredQueryDefaults());
      await loadEnvironmentPolicySettings({ silent: false });
    },
    onSave: async (activeTab) => {
      const sessionTimezone = readSessionTimezoneInput();
      const previousTimezone = readStoredSessionTimezone();

      if (
        sessionTimezone === SESSION_TIMEZONE_SYSTEM ||
        sessionTimezone !== previousTimezone
      ) {
        const timezoneRes = await applySessionTimezoneToActiveConnection(
          resolveEffectiveSessionTimezone(sessionTimezone),
        );
        if (!timezoneRes.ok) {
          if (safeApi.showError) await safeApi.showError(timezoneRes.error);
          return { shouldClose: false };
        }
      }

      const persistedTimezone = persistSessionTimezone(sessionTimezone);
      applySessionTimezoneToSettingsInput(persistedTimezone);

      const errorHandling = persistErrorHandlingSettings(
        readErrorHandlingSettingsInputs(),
      );
      applyErrorHandlingToSettingsInputs(errorHandling);

      const connectionTimeouts = persistConnectionTimeouts(
        readConnectionTimeoutsInputs(),
      );
      applyConnectionTimeoutsToSettingsInputs(connectionTimeouts);

      const queryDefaults = persistQueryDefaults(readQueryDefaultsInputs());
      applyQueryDefaultsToEditorControls(queryDefaults);
      applyQueryDefaultsToSettingsInputs(queryDefaults);

      const envResult = await saveEnvironmentPolicySettings();
      if (!envResult || !envResult.ok) return { shouldClose: false };

      showToast("Settings saved");
      return { shouldClose: true };
    },
    onResetDefaults: (activeTab) => {
      if (activeTab === "environments") {
        resetEnvironmentPolicyDefaults();
      } else if (activeTab === "errors-timeouts") {
        resetErrorsTimeoutsSettingsDefaults();
      } else {
        resetGeneralSettingsDefaults();
      }
    },
    onClose: () => {
      setSessionTimezoneMenuOpen(false);
    },
  });

  // Wrap existing functions to use components
  const promptConnectionSecrets = (entry) => {
    return credentialModalComponent.prompt(entry);
  };

  const closeCredentialPrompt = (result = null) => {
    credentialModalComponent.close(result);
  };

  const openSettingsModal = async () => {
    await settingsModalComponent.open();
  };

  const closeSettingsModal = () => {
    settingsModalComponent.close();
  };

  const saveSettings = async () => {
    await settingsModalComponent.save();
  };

  const resetSettingsDefaults = () => {
    settingsModalComponent.resetDefaults();
  };

  const setSettingsTab = (tab) => {
    settingsModalComponent.setTab(tab);
  };

  // Wrap existing functions to use component
  const openConnectModal = ({ keepForm = false, mode = "full" } = {}) => {
    if (!keepForm) {
      resetConnectionForm();
      setEditMode(false);
    }
    if (mode === "quick" && saveName) {
      saveName.value = "";
      setEditMode(false);
    }
    if (mode === "quick" && rememberPassword) rememberPassword.checked = false;
    syncConnectionTypeFields();
    connectModalComponent.open({ mode, keepForm });
  };

  const closeConnectModal = () => {
    connectModalComponent.close();
    setEditMode(false);
  };

  const isSshTabActive = () => {
    if (!tabSshBtn) return false;
    return tabSshBtn.classList.contains("active");
  };

  const buildSshConfig = () => {
    const enabled = isSshTabActive();
    if (!enabled) return { enabled: false };
    return {
      enabled: true,
      host: sshHost ? sshHost.value.trim() : "",
      port: sshPort ? sshPort.value.trim() : "",
      user: sshUser ? sshUser.value.trim() : "",
      password: sshPassword ? sshPassword.value : "",
      privateKey: sshPrivateKey ? sshPrivateKey.value : "",
      passphrase: sshPassphrase ? sshPassphrase.value : "",
      localPort: sshLocalPort ? sshLocalPort.value.trim() : "",
    };
  };

  const setConnecting = (loading) => {
    isConnecting = loading;
    if (connectSpinner) connectSpinner.classList.toggle("hidden", !loading);
    if (connectBtn) connectBtn.disabled = loading;
    if (saveBtn) saveBtn.disabled = loading;
    if (testBtn) testBtn.disabled = loading;
    if (clearFormBtn) clearFormBtn.disabled = loading;
    if (cancelEditBtn) cancelEditBtn.disabled = loading;
    if (importConnectionsBtn) importConnectionsBtn.disabled = loading;
    if (exportConnectionsBtn) exportConnectionsBtn.disabled = loading;
    if (quickConnectComponent) quickConnectComponent.setDisabled(loading);
    if (savedList) savedList.classList.toggle("is-connecting", loading);
    if (connectModal) connectModal.classList.toggle("is-connecting", loading);
  };

  const connectWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: "Connection in progress." };
    setConnecting(true);
    setGlobalLoading(true, "Connecting...");
    try {
      return await safeApi.connect(config);
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Failed to connect.",
      };
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const testConnectionWithLoading = async (config) => {
    if (isConnecting) return { ok: false, error: "Connection in progress." };
    setConnecting(true);
    try {
      return await safeApi.testConnection(config);
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Failed to test connection.",
      };
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
      await safeApi.showError(res.error || "Failed to connect.");
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

  // Wire saved-connections component events to higher-level handlers
  document.addEventListener("saved:connect", async (ev) => {
    const entry = ev && ev.detail ? ev.detail : null;
    if (!entry) return;
    if (isConnecting) return;
    await connectEntryFromList(entry);
  });

  document.addEventListener("saved:edit", (ev) => {
    const entry = ev && ev.detail ? ev.detail : null;
    editingConnectionSeed = entry
      ? { ...entry, ssh: getEntrySshConfig(entry) }
      : null;
    if (saveName) {
      const originalName = entry && entry.name ? String(entry.name).trim() : "";
      if (originalName) saveName.dataset.originalName = originalName;
      else delete saveName.dataset.originalName;
    }
    applyEntryToForm(entry);
    setEditMode(true);
    openConnectModal({ keepForm: true, mode: "full" });
  });

  const renderSavedList = async () => {
    if (
      savedComponent &&
      typeof savedComponent.renderSavedList === "function"
    ) {
      return savedComponent.renderSavedList();
    }
    return Promise.resolve();
  };

  const connectFromForm = async () => {
    const shouldSave = activeConnectMode !== "quick";
    if (shouldSave && (!saveName || !saveName.value.trim())) {
      await safeApi.showError("Enter a name to save.");
      return;
    }

    let config = null;
    try {
      config = buildConnectionFromForm({ includeSaveFields: shouldSave });
    } catch (err) {
      await safeApi.showError(
        err && err.message ? err.message : "Invalid connection URL.",
      );
      return;
    }
    config = {
      ...config,
      port: config.port || undefined,
    };

    if (shouldSave) {
      const entryForValidation = await ensureValidationSecretsIfNeeded(config);
      if (!entryForValidation) return;
      config = entryForValidation;
    }

    if (await tryActivateExistingConnection(config)) return;

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || "Failed to connect.");
      return;
    }

    if (shouldSave) {
      const originalName =
        editingConnectionSeed && editingConnectionSeed.name
          ? String(editingConnectionSeed.name).trim()
          : saveName && saveName.dataset && saveName.dataset.originalName
            ? String(saveName.dataset.originalName).trim()
            : "";
      const payload =
        isEditingConnection && originalName
          ? { ...config, originalName }
          : config;
      await safeApi.saveConnection(payload);
      setEditMode(false);
      await renderSavedList();
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
      await safeApi.showError("Enter a name to save.");
      return;
    }

    let entry = null;
    try {
      entry = buildConnectionFromForm({ includeSaveFields: true });
    } catch (err) {
      await safeApi.showError(
        err && err.message ? err.message : "Invalid connection URL.",
      );
      return;
    }

    const entryForValidation = await ensureValidationSecretsIfNeeded(entry);
    if (!entryForValidation) return;

    const res = await testConnectionWithLoading({
      type: entryForValidation.type,
      filePath:
        entryForValidation.filePath ||
        entryForValidation.file_path ||
        entryForValidation.path ||
        "",
      sqliteMode:
        entryForValidation.sqliteMode || entryForValidation.sqlite_mode,
      host: entryForValidation.host,
      port: entryForValidation.port || undefined,
      user: entryForValidation.user,
      password: entryForValidation.password,
      database: entryForValidation.database,
      sessionTimezone: entryForValidation.sessionTimezone,
      readOnly: entryForValidation.readOnly,
      policyMode: entryForValidation.policyMode,
      ssh: entryForValidation.ssh,
    });
    if (!res.ok) {
      await safeApi.showError(res.error || "Failed to test connection.");
      return;
    }
    const originalName =
      editingConnectionSeed && editingConnectionSeed.name
        ? String(editingConnectionSeed.name).trim()
        : saveName && saveName.dataset && saveName.dataset.originalName
          ? String(saveName.dataset.originalName).trim()
          : "";
    const nextName = entry && entry.name ? String(entry.name).trim() : "";
    const payload =
      isEditingConnection && originalName ? { ...entry, originalName } : entry;

    await safeApi.saveConnection(payload);
    setEditMode(false);
    await renderSavedList();
    closeConnectModal();
  };

  const testConnection = async () => {
    let config = null;
    try {
      config = buildConnectionFromForm({ includeSaveFields: true });
    } catch (err) {
      await safeApi.showError(
        err && err.message ? err.message : "Invalid connection URL.",
      );
      return;
    }
    config = {
      ...config,
      port: config.port || undefined,
    };

    const configForValidation = await ensureValidationSecretsIfNeeded(config);
    if (!configForValidation) return;

    const res = await testConnectionWithLoading(configForValidation);
    if (!res.ok) {
      await safeApi.showError(res.error || "Failed to test connection.");
      return;
    }
    alert("Connection OK.");
  };

  if (tabDirectBtn) {
    tabDirectBtn.addEventListener("click", () => setConnectTab("direct"));
  }
  if (tabSshBtn) {
    tabSshBtn.addEventListener("click", () => setConnectTab("ssh"));
  }
  if (connectSettingsTabs) {
    connectSettingsTabs.addEventListener("click", (event) => {
      const item = event.target.closest("[data-connect-settings-tab]");
      if (!item) return;
      const tab = item.getAttribute("data-connect-settings-tab");
      setConnectSettingsTab(tab);
    });
  }

  if (savedPolicyFilters) {
    savedPolicyFilters.addEventListener("change", (event) => {
      const target = event && event.target ? event.target : null;
      if (!target || target.name !== "savedPolicyFilter") return;
      void renderSavedList();
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
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
    exportConnectionsBtn.addEventListener("click", async () => {
      try {
        if (!safeApi.exportSavedConnections) {
          await safeApi.showError(
            "Export API unavailable. Restart the app and try again.",
          );
          return;
        }
        showToast("Opening save dialog...");
        const res = await safeApi.exportSavedConnections();
        if (!res || !res.ok) {
          if (res && res.canceled) return;
          await safeApi.showError(
            (res && res.error) || "Failed to export saved connections.",
          );
          return;
        }
        showToast(`Exported ${res.count || 0} connection(s)`);
      } catch (err) {
        const message = err && err.message ? err.message : "";
        if (
          message.includes("No handler registered for 'connections:export'")
        ) {
          await safeApi.showError(
            "Export unavailable in this running process. Restart the app and try again.",
          );
          return;
        }
        await safeApi.showError("Failed to export saved connections.");
      }
    });
  }

  if (importConnectionsBtn) {
    importConnectionsBtn.addEventListener("click", async () => {
      try {
        if (!safeApi.importSavedConnections) {
          await safeApi.showError(
            "Import API unavailable. Restart the app and try again.",
          );
          return;
        }
        const confirmed = confirm(
          "Importar conexoes pode atualizar conexoes existentes com o mesmo nome ou configuracao similar. Deseja continuar?",
        );
        if (!confirmed) return;
        showToast("Opening file dialog...");
        const res = await safeApi.importSavedConnections();
        if (!res || !res.ok) {
          if (res && res.canceled) return;
          await safeApi.showError(
            (res && res.error) || "Failed to import saved connections.",
          );
          return;
        }
        await renderSavedList();
        const label = `Imported ${res.added || 0} new, updated ${res.updated || 0}`;
        showToast(label);
      } catch (err) {
        const message = err && err.message ? err.message : "";
        if (
          message.includes("No handler registered for 'connections:import'")
        ) {
          await safeApi.showError(
            "Import unavailable in this running process. Restart the app and try again.",
          );
          return;
        }
        await safeApi.showError("Failed to import saved connections.");
      }
    });
  }

  // openConnectModalBtn, quickConnectBtn, closeConnectModalBtn now handled by components

  if (heroCreditLink) {
    heroCreditLink.addEventListener("click", async (event) => {
      event.preventDefault();
      const href = heroCreditLink.getAttribute("href");
      if (!href) return;
      if (safeApi.openExternal) {
        await safeApi.openExternal(href);
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    });
  }

  if (connectModalBackdrop) {
    connectModalBackdrop.addEventListener("click", () => closeConnectModal());
  }

  // Credential modal event listeners now in component

  if (policyApprovalCloseBtn) {
    policyApprovalCloseBtn.addEventListener("click", () =>
      closePolicyApprovalPrompt(""),
    );
  }

  if (policyApprovalCancelBtn) {
    policyApprovalCancelBtn.addEventListener("click", () =>
      closePolicyApprovalPrompt(""),
    );
  }

  if (policyApprovalModalBackdrop) {
    policyApprovalModalBackdrop.addEventListener("click", () =>
      closePolicyApprovalPrompt(""),
    );
  }

  if (policyApprovalConfirmBtn) {
    policyApprovalConfirmBtn.addEventListener("click", () => {
      closePolicyApprovalPrompt(
        policyApprovalInput ? policyApprovalInput.value || "" : "",
      );
    });
  }

  if (policyApprovalInput) {
    policyApprovalInput.addEventListener("input", () => {
      updatePolicyApprovalConfirmState();
    });
    policyApprovalInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (
        !policyApprovalModal ||
        policyApprovalModal.classList.contains("hidden")
      )
        return;
      event.preventDefault();
      if (policyApprovalConfirmBtn) policyApprovalConfirmBtn.click();
    });
  }

  if (queryOutputBtn) {
    queryOutputBtn.addEventListener("click", () => openOutputModal());
  }

  if (outputCloseBtn) {
    outputCloseBtn.addEventListener("click", () => closeOutputModal());
  }

  if (outputCloseBtnBottom) {
    outputCloseBtnBottom.addEventListener("click", () => closeOutputModal());
  }

  if (outputModalBackdrop) {
    outputModalBackdrop.addEventListener("click", () => closeOutputModal());
  }

  if (outputCopyBtn) {
    outputCopyBtn.addEventListener("click", async () => {
      if (
        !currentOutput ||
        !currentOutput.items ||
        currentOutput.items.length === 0
      )
        return;
      try {
        const header = ["#", "Time", "Action", "Response", "Duration"].join(
          "\t",
        );
        const lines = currentOutput.items.map((entry) =>
          [
            entry.id,
            entry.time,
            entry.action,
            entry.response,
            entry.durationMs ? `${entry.durationMs}ms` : "",
          ].join("\t"),
        );
        await navigator.clipboard.writeText([header, ...lines].join("\n"));
        showToast("Output copied");
      } catch (_) {
        if (safeApi.showError)
          await safeApi.showError("Unable to copy output.");
      }
    });
  }

  if (definitionCloseBtn) {
    definitionCloseBtn.addEventListener("click", () => closeDefinitionModal());
  }

  if (definitionModalBackdrop) {
    definitionModalBackdrop.addEventListener("click", () =>
      closeDefinitionModal(),
    );
  }

  if (definitionFormatBtn) {
    definitionFormatBtn.addEventListener("click", () => {
      const source = getDefinitionSql();
      if (!source || !source.trim()) return;
      const active = getActiveConnection();
      const type =
        active && active.type ? String(active.type).toLowerCase() : "";
      const language =
        type === "postgres" || type === "postgresql" ? "postgresql" : "mysql";
      const formatted = formatSql(source, { language });
      if (definitionEditor) definitionEditor.setValue(formatted);
      else if (definitionQueryInput) definitionQueryInput.value = formatted;
      syncDefinitionSaveState();
    });
  }

  if (definitionCopyBtn) {
    definitionCopyBtn.addEventListener("click", async () => {
      const source = getDefinitionSql();
      if (!source || !source.trim()) return;
      try {
        await navigator.clipboard.writeText(source);
        showToast("SQL copied");
      } catch (_) {
        if (safeApi.showError) await safeApi.showError("Unable to copy.");
      }
    });
  }

  if (definitionSaveBtn) {
    definitionSaveBtn.addEventListener("click", async () => {
      await saveDefinition();
    });
  }

  if (definitionModal) {
    definitionModal.addEventListener("keydown", async (event) => {
      const primaryKey = event.metaKey || event.ctrlKey;
      if (!primaryKey || event.altKey || event.shiftKey) return;
      const key = String(event.key || "").toLowerCase();
      if (key !== "s") return;
      if (definitionModal.classList.contains("hidden")) return;
      event.preventDefault();
      await saveDefinition();
    });
  }

  // connectBtn, saveBtn, testBtn are now handled by connectModalComponent
  // openConnectModalBtn and quickConnectBtn are now handled by quickConnectComponent

  if (sqliteModeCreate) {
    sqliteModeCreate.addEventListener("change", () => {
      if (sqliteModeCreate.checked && sqlitePath) sqlitePath.value = "";
    });
  }

  if (sqliteModeExisting) {
    sqliteModeExisting.addEventListener("change", () => {
      if (sqliteModeExisting.checked && sqlitePath) sqlitePath.value = "";
    });
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener("click", () => resetConnectionForm());
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      setEditMode(false);
      resetConnectionForm();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = themeMenu
        ? !themeMenu.classList.contains("hidden")
        : false;
      setThemeMenuOpen(!isOpen);
    });
  }
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", () => {
      void openSettingsModal();
    });
  }
  // Settings modal event listeners (tabs, close, cancel, backdrop, resetDefaults, save) now in component
  if (settingsErrorStopOnFirst) {
    settingsErrorStopOnFirst.addEventListener("change", () => {
      syncErrorModeInputs("stop");
    });
  }
  if (settingsErrorContinueOnError) {
    settingsErrorContinueOnError.addEventListener("change", () => {
      syncErrorModeInputs("continue");
    });
  }
  if (settingsSessionTimezoneToggle) {
    settingsSessionTimezoneToggle.addEventListener("click", () => {
      if (sessionTimezoneMenuOpen) {
        setSessionTimezoneMenuOpen(false);
      } else {
        filterSessionTimezoneMenu("");
        setSessionTimezoneMenuOpen(true);
        if (settingsSessionTimezone) settingsSessionTimezone.focus();
      }
    });
  }
  if (settingsSessionTimezone) {
    settingsSessionTimezone.addEventListener("focus", () => {
      filterSessionTimezoneMenu("");
      setSessionTimezoneMenuOpen(true);
    });
    settingsSessionTimezone.addEventListener("input", () => {
      filterSessionTimezoneMenu(settingsSessionTimezone.value);
      setSessionTimezoneMenuOpen(true);
    });
    settingsSessionTimezone.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!sessionTimezoneMenuOpen) setSessionTimezoneMenuOpen(true);
        if (sessionTimezoneHighlightedIndex < 0) {
          setSessionTimezoneHighlightedIndex(0);
        } else {
          setSessionTimezoneHighlightedIndex(
            sessionTimezoneHighlightedIndex + 1,
          );
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!sessionTimezoneMenuOpen) setSessionTimezoneMenuOpen(true);
        if (sessionTimezoneHighlightedIndex < 0) {
          setSessionTimezoneHighlightedIndex(
            sessionTimezoneVisibleItems.length - 1,
          );
        } else {
          setSessionTimezoneHighlightedIndex(
            sessionTimezoneHighlightedIndex - 1,
          );
        }
        return;
      }
      if (event.key === "Enter") {
        if (!sessionTimezoneMenuOpen) return;
        event.preventDefault();
        const target =
          sessionTimezoneVisibleItems[sessionTimezoneHighlightedIndex];
        if (target) {
          applySessionTimezoneToSettingsInput(target.timezone);
        } else {
          applySessionTimezoneToSettingsInput(settingsSessionTimezone.value);
        }
        return;
      }
      if (event.key === "Escape") {
        if (!sessionTimezoneMenuOpen) return;
        event.preventDefault();
        setSessionTimezoneMenuOpen(false);
      }
    });
  }
  if (themeMenu) {
    themeMenu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-theme-mode]");
      if (!item) return;
      const mode = item.getAttribute("data-theme-mode");
      setThemeMode(mode);
      setThemeMenuOpen(false);
    });
  }
  document.addEventListener("click", (event) => {
    if (
      sessionTimezoneMenuOpen &&
      settingsSessionTimezoneCombobox &&
      !(
        event.target && event.target.closest("#settingsSessionTimezoneCombobox")
      )
    ) {
      setSessionTimezoneMenuOpen(false);
    }
    if (!themeMenu || themeMenu.classList.contains("hidden")) return;
    if (event.target && event.target.closest("#themeControl")) return;
    setThemeMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setThemeMenuOpen(false);
      closeSettingsModal();
      closePolicyApprovalPrompt("");
    }
  });
  if (typeof safeApi.onNativeThemeUpdated === "function") {
    removeNativeThemeListener = safeApi.onNativeThemeUpdated((payload) => {
      applySystemThemeSnapshot(payload);
    });
  }
  window.addEventListener("beforeunload", () => {
    if (typeof removeNativeThemeListener === "function") {
      removeNativeThemeListener();
      removeNativeThemeListener = null;
    }
  });

  if (sidebarTreeBtn) {
    sidebarTreeBtn.addEventListener("click", () => setSidebarView("tree"));
  }
  if (sidebarHistoryBtn) {
    sidebarHistoryBtn.addEventListener("click", () =>
      setSidebarView("history"),
    );
  }
  if (sidebarSnippetsBtn) {
    sidebarSnippetsBtn.addEventListener("click", () =>
      setSidebarView("snippets"),
    );
  }

  const runServerPage = async ({ page, pageSize } = {}) => {
    const active = tableView ? tableView.getActive() : null;
    const pagination = normalizeSnapshotPagination(active && active.pagination);
    if (!pagination) return false;
    const nextPage = Number.isFinite(Number(page))
      ? Math.max(0, Math.floor(Number(page)))
      : pagination.page;
    const nextPageSize =
      pageSize != null ? resolveServerPageSize(pageSize) : pagination.pageSize;
    const baseSql = normalizeSql(
      pagination.baseSql ||
        (active && (active.sourceSql || active.baseSql)) ||
        "",
    );
    if (!baseSql) return false;
    await runSql(baseSql, baseSql, {
      applyDefaultLimit: false,
      serverPagination: {
        page: nextPage,
        pageSize: nextPageSize,
        baseSql,
      },
    });
    return true;
  };

  if (runBtn) {
    runBtn.addEventListener("click", async () => {
      await handleRun();
    });
  }

  if (runSelectionBtn) {
    runSelectionBtn.addEventListener("click", async () => {
      await handleRunSelection();
    });
  }

  if (runCurrentBtn) {
    runCurrentBtn.addEventListener("click", async () => {
      await handleRunCurrentStatement();
    });
  }

  if (explainBtn) {
    explainBtn.addEventListener("click", async () => {
      await handleExplain();
    });
  }

  if (explainAnalyzeBtn) {
    explainAnalyzeBtn.addEventListener("click", async () => {
      await handleExplain({ analyze: true });
    });
  }

  if (formatBtn) {
    formatBtn.addEventListener("click", () => {
      const source = codeEditor
        ? codeEditor.getValue()
        : query
          ? query.value
          : "";
      if (!source || !source.trim()) return;
      const active = getActiveConnection();
      const type =
        active && active.type ? String(active.type).toLowerCase() : "";
      const language =
        type === "postgres" || type === "postgresql" ? "postgresql" : "mysql";
      const formatted = formatSql(source, { language });
      if (codeEditor) codeEditor.setValue(formatted);
      else if (query) query.value = formatted;
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      adjustEditorFontSize(-1);
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      adjustEditorFontSize(1);
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", async () => {
      stopQueryProgress();
      const res = await safeApi.cancelQuery();
      if (!res || !res.ok) {
        await safeApi.showError((res && res.error) || "Unable to cancel.");
      } else {
        setQueryStatus({ state: "error", message: "Canceled" });
      }
      if (runBtn) runBtn.disabled = false;
      if (runSelectionBtn) runSelectionBtn.disabled = false;
      if (runCurrentBtn) runCurrentBtn.disabled = false;
      if (explainBtn) explainBtn.disabled = false;
      if (explainAnalyzeBtn) explainAnalyzeBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    });
  }

  if (toggleEditorBtn) {
    toggleEditorBtn.addEventListener("click", () => {
      const isVisible = editorBody
        ? !editorBody.classList.contains("hidden")
        : true;
      setEditorVisible(!isVisible);
    });
  }

  if (saveSnippetEditorBtn) {
    saveSnippetEditorBtn.addEventListener("click", async () => {
      const sqlText = codeEditor
        ? codeEditor.getValue()
        : query
          ? query.value
          : "";
      const trimmed = String(sqlText || "").trim();
      if (!trimmed) return;
      if (!getCurrentHistoryKey()) {
        if (safeApi.showError)
          await safeApi.showError("Connect to save snippets.");
        return;
      }
      const suggestion = trimmed.split("\n")[0].slice(0, 40);
      if (
        snippetsManager &&
        typeof snippetsManager.openSnippetModal === "function"
      ) {
        snippetsManager.openSnippetModal({ sql: trimmed, name: suggestion });
      }
    });
  }

  if (countBtn) {
    countBtn.addEventListener("click", async () => {
      const active = tableView ? tableView.getActive() : null;
      const source =
        active && (active.sourceSql || active.baseSql)
          ? active.sourceSql || active.baseSql
          : "";
      if (!source) {
        await safeApi.showError("Open a table first.");
        return;
      }
      const countSql = buildTableCountSql(source);
      if (!countSql) {
        await safeApi.showError(
          "Count works only for table query (SELECT * FROM table).",
        );
        return;
      }
      lastSort = null;
      await runSql(countSql, source);
    });
  }

  if (pagePrevBtn) {
    pagePrevBtn.addEventListener("click", async () => {
      const active = tableView ? tableView.getActive() : null;
      const pagination = normalizeSnapshotPagination(
        active && active.pagination,
      );
      if (!pagination || pagination.page <= 0) return;
      await runServerPage({
        page: pagination.page - 1,
        pageSize: pagination.pageSize,
      });
    });
  }

  if (pageNextBtn) {
    pageNextBtn.addEventListener("click", async () => {
      const active = tableView ? tableView.getActive() : null;
      const pagination = normalizeSnapshotPagination(
        active && active.pagination,
      );
      if (!pagination || !pagination.hasNext) return;
      await runServerPage({
        page: pagination.page + 1,
        pageSize: pagination.pageSize,
      });
    });
  }

  if (limitSelect) {
    limitSelect.addEventListener("change", async () => {
      const active = tableView ? tableView.getActive() : null;
      const pagination = normalizeSnapshotPagination(
        active && active.pagination,
      );
      if (!pagination) return;
      await runServerPage({
        page: 0,
        pageSize: getServerPageSizeSelection(),
      });
    });
  }

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener("click", async () => {
      await applyTableFilter();
    });
  }

  if (queryFilter) {
    queryFilter.addEventListener("input", () => {
      updateQueryFilterClearVisibility();
    });
    queryFilter.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyTableFilter();
      }
    });
  }

  if (queryFilterClear) {
    queryFilterClear.addEventListener("click", async () => {
      const hadFilter = !!(queryFilter && queryFilter.value.trim());
      if (queryFilter) {
        queryFilter.value = "";
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
    dbSelect.addEventListener("change", async () => {
      const name = dbSelect.value;
      if (!name) return;
      await changeDatabase(name);
    });
  }

  if (dbType) {
    dbType.addEventListener("change", () => {
      updateConnectionUrlPlaceholder(dbType.value);
      syncConnectionTypeFields();
    });
  }

  if (refreshSchemaBtn) {
    refreshSchemaBtn.addEventListener("click", async () => {
      if (treeView) {
        setGlobalLoading(true, "Refreshing schema...");
        const tables = await treeView.refresh();
        if (sqlAutocomplete && tables) sqlAutocomplete.setTables(tables);
        setGlobalLoading(false);
      }
    });
  }

  setScreen(false);
  setConnectSettingsTab("connection");
  updateConnectionUrlPlaceholder(dbType ? dbType.value : "mysql");
  syncConnectionTypeFields();
  setSettingsTab("general");
  initSessionTimezoneSettings();
  applyErrorHandlingToSettingsInputs(readStoredErrorHandlingSettings());
  applyConnectionTimeoutsToSettingsInputs(readStoredConnectionTimeouts());
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
    onToast: (message) => showToast(message),
  });
  codeEditor = createCodeEditor({ textarea: query });
  codeEditor.init();
  if (sqlAutocomplete) {
    codeEditor.setHintProvider({
      getHintOptions: () => sqlAutocomplete.getHintOptions(),
      prefetch: (editor) => sqlAutocomplete.prefetch(editor),
    });
  }
  if (snippetQueryInput) {
    snippetEditor = createCodeEditor({
      textarea: snippetQueryInput,
      lineWrapping: true,
    });
    snippetEditor.init();
    if (sqlAutocomplete) {
      snippetEditor.setHintProvider({
        getHintOptions: () => sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => sqlAutocomplete.prefetch(editor),
      });
    }
  }
  if (definitionQueryInput) {
    definitionEditor = createCodeEditor({ textarea: definitionQueryInput });
    definitionEditor.init();
    definitionEditor.onChange(() => {
      syncDefinitionSaveState();
    });
    if (sqlAutocomplete) {
      definitionEditor.setHintProvider({
        getHintOptions: () => sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => sqlAutocomplete.prefetch(editor),
      });
    }
  }
  syncDefinitionSaveState();
  codeEditor.setHandlers({
    run: () => handleRun(),
    runSelection: () => handleRunSelection(),
  });
  codeEditor.onSelectionChange(() => {
    updateRunAvailability();
  });
  updateRunAvailability();
  tabTablesView = createTabTables({
    tabBar,
    newTabBtn,
    queryInput: query,
    getValue: () =>
      codeEditor ? codeEditor.getValue() : query ? query.value : "",
    setValue: (value) => {
      if (codeEditor) codeEditor.setValue(value || "");
      else if (query) query.value = value || "";
      refreshEditor();
    },
    getCurrentDatabase: () =>
      dbSelect ? String(dbSelect.value || "").trim() : "",
    onInput: (handler) => {
      if (codeEditor)
        codeEditor.onChange(() => {
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
    },
  });
  if (newTabBtn) {
    newTabBtn.addEventListener("click", () => {
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
      if (codeEditor) codeEditor.setValue(sql || "");
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    setQueryValue: (sql) => {
      if (codeEditor) codeEditor.setValue(sql || "");
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    listHistory: (payload) => safeApi.listHistory(payload),
    recordHistory: (payload) => safeApi.recordHistory(payload),
    showError: safeApi.showError,
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
    getSnippetValue: () =>
      snippetEditor
        ? snippetEditor.getValue()
        : snippetQueryInput
          ? snippetQueryInput.value
          : "",
    setSnippetValue: (value) => {
      if (snippetEditor) {
        snippetEditor.setValue(value || "");
        snippetEditor.refresh();
      } else if (snippetQueryInput) {
        snippetQueryInput.value = value || "";
      }
    },
    getCurrentHistoryKey,
    setQueryValue: (sql) => {
      if (codeEditor) codeEditor.setValue(sql || "");
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    createNewQueryTab: (sql) => {
      if (!tabTablesView) return;
      tabTablesView.create();
      setEditorVisible(true);
      if (codeEditor) codeEditor.setValue(sql || "");
      if (tabTablesView) tabTablesView.syncActiveTabContent();
    },
    runSnippet: async (sql) => {
      const text = String(sql || "").trim();
      if (!text) return;
      if (codeEditor) codeEditor.setValue(text);
      if (tabTablesView) tabTablesView.syncActiveTabContent();
      lastSort = null;
      await runSql(text);
    },
    listSnippets: (payload) => safeApi.listSnippets(payload),
    saveSnippet: (payload) => safeApi.saveSnippet(payload),
    deleteSnippet: (payload) => safeApi.deleteSnippet(payload),
    showError: safeApi.showError,
  });
  const buildOrderBy = (sql, column, direction) => {
    const clean = normalizeSql(sql);
    if (!clean) return clean;
    const upper = clean.toUpperCase();
    const limitIndex = upper.lastIndexOf(" LIMIT ");
    const offsetIndex = upper.lastIndexOf(" OFFSET ");
    let cutIndex = -1;
    if (limitIndex !== -1) cutIndex = limitIndex;
    if (offsetIndex !== -1)
      cutIndex =
        cutIndex === -1 ? offsetIndex : Math.min(cutIndex, offsetIndex);

    let base = clean;
    let suffix = "";
    if (cutIndex !== -1) {
      base = clean.slice(0, cutIndex).trimEnd();
      suffix = clean.slice(cutIndex).trimStart();
    }

    const upperBase = base.toUpperCase();
    const orderIndex = upperBase.lastIndexOf(" ORDER BY ");
    if (orderIndex !== -1) {
      base = base.slice(0, orderIndex).trimEnd();
    }

    const orderSql = `${base} ORDER BY ${quoteIdentifier(column)} ${direction.toUpperCase()}`;
    return suffix ? `${orderSql} ${suffix}` : orderSql;
  };

  const rerunSortedQuery = async (column, active) => {
    const base = active && active.baseSql ? active.baseSql : "";
    if (!base) return;
    if (lastSort && lastSort.column === column) {
      if (lastSort.direction === "asc") {
        lastSort = { column, direction: "desc" };
        const orderSql = buildOrderBy(base, column, "desc");
        if (orderSql) await runSql(orderSql);
        return;
      }
      if (lastSort.direction === "desc") {
        lastSort = null;
        await runSql(base);
        return;
      }
    }
    lastSort = { column, direction: "asc" };
    const orderSql = buildOrderBy(base, column, "asc");
    if (!orderSql) return;
    await runSql(orderSql);
  };

  const openForeignKeyLookup = async ({ column, row, fkRefs } = {}) => {
    const refs = Array.isArray(fkRefs) ? fkRefs : [];
    if (refs.length === 0) return;
    const normalizedColumn = normalizeColumnName(column);
    const selectedRef =
      refs.find((ref) => {
        const fromColumns = Array.isArray(ref.fromColumns)
          ? ref.fromColumns
          : [];
        return fromColumns.some(
          (name) => normalizeColumnName(name) === normalizedColumn,
        );
      }) || refs[0];

    if (!selectedRef || !selectedRef.refTable) return;

    const activeTab = tabTablesView ? tabTablesView.getActiveTab() : null;
    const context =
      activeTab && activeTab.id ? getObjectContextForTab(activeTab.id) : null;
    const sourceSchema = context ? context.schema : "";
    const querySql = buildForeignKeyLookupSql(selectedRef, row, sourceSchema);
    if (!querySql) {
      await safeApi.showError("Unable to build query for this foreign key.");
      return;
    }

    const targetSchema = String(
      selectedRef.refSchema || sourceSchema || "",
    ).trim();
    await openTableFromNavigator(targetSchema, selectedRef.refTable, querySql, {
      execute: true,
    });
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
    onSort: rerunSortedQuery,
    onOpenForeignKey: openForeignKeyLookup,
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
    runQuery: (payload) => safeApi.runQuery(payload),
    quoteIdentifier: (value) => {
      const active = getActiveConnection();
      const type = active && active.type ? active.type : "mysql";
      return quoteDbIdentifier(value, type);
    },
    buildQualifiedTableRef: (schema, table) =>
      buildQualifiedTableRef(schema, table),
    onShowError: safeApi.showError,
    onToast: (message) => showToast(message),
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
    },
  });
  renderSavedList();
}
