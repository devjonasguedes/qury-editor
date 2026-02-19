import { createConnectModal } from "./components/connect-modal.js";
import { createCredentialModal } from "./components/credential-modal.js";
import { createPolicyApprovalModal } from "./components/policy-approval-modal.js";
import { POLICY_APPROVAL_TOKEN } from "./constants/policyApproval.js";
import { createQuickConnect } from "./components/quick-connect.js";
import { createSavedConnections } from "./components/saved-connections.js";
import { createSqlEditor } from "./components/sql-editor.js";
import { createSettingsModal } from "./components/settings-modal.js";
import { createSidebarMenu } from "./components/sidebar-menu.js";
import { createToast } from "./components/toast.js";
import { createCodeEditor } from "./modules/codeEditor.js";
import { format as formatSql } from "sql-formatter";
import {
  connectionTitle,
  getConnectionScopeKey,
  getEntryPolicyMode,
  getEntrySshConfig,
  isEntryReadOnly,
  isEntrySsh,
} from "./modules/connectionUtils.js";
import { createQueryHistory } from "./modules/queryHistory.js";
import { createSnippetsManager } from "./modules/snippets.js";
import { createSqlHelp } from "./modules/sqlHelp.js";
import { createSqlAutocomplete } from "./modules/sqlAutocomplete.js";
import { storageApi } from "./api/index.js";
import { createTabConnections } from "./components/tab-connections.js";
import { createTableObjectTabs } from "./modules/tableObjectTabs.js";
import { createTableView } from "./modules/tableView.js";
import { createTabTables } from "./components/tab-tables.js";
import { createTreeView } from "./components/tree-view.js";
import {
  dialogsApi,
  historyApi,
  settingsApi,
  snippetsApi,
  toastApi,
} from "./api/index.js";
import {
  SESSION_TIMEZONE_ITEMS,
  SESSION_TIMEZONE_ITEM_BY_ID,
  SESSION_TIMEZONE_VALUES,
} from "./constants/sessionTimezones.js";
import {
  CONNECTION_TIMEOUT_DEFAULTS,
  DEFAULT_SESSION_TIMEZONE,
  ERROR_HANDLING_DEFAULTS,
  QUERY_DEFAULTS,
  QUERY_PROGRESS_SHOW_DELAY_MS,
  SERVER_PAGE_SIZE_DEFAULT,
  SERVER_PAGE_SIZE_MAX,
  SESSION_TIMEZONE_SYSTEM,
  SESSION_TIMEZONE_SYSTEM_LABEL,
  STORAGE_KEYS,
} from "./constants/appDefaults.js";
import {
  ENVIRONMENT_POLICY_DEFAULTS,
  POLICY_MODE_DEV,
  POLICY_MODE_PROD,
  POLICY_MODE_STAGING,
  classifyStatementByPolicy,
  cloneEnvironmentPolicyRules,
  normalizeEnvironmentPolicyRules,
  resolveEnvironmentPoliciesPayload,
} from "./services/policyManager.js";
import { createThemeManager } from "./services/themeManager.js";
import {
  firstDmlKeyword,
  insertWhere,
  isDangerousStatement,
  splitStatements,
  stripLeadingComments,
} from "./sql.js";

export function initHome({ api }) {
  const byId = (id) => document.getElementById(id);

  const dbType = byId("dbType");
  const saveName = byId("saveName");
  const savedPolicyFilters = byId("savedPolicyFilters");
  const mainScreen = byId("mainScreen");
  const welcomeScreen = byId("welcomeScreen");
  const tabConnections = byId("tabConnections");
  const heroCreditLink = document.querySelector(".hero-credit a");
  const homeBtn = byId("homeBtn");
  const openSettingsBtn = byId("openSettingsBtn");
  const historyList = byId("historyList");
  const editorPanel = mainScreen ? mainScreen.querySelector(".editor") : null;
  const editorBody = mainScreen
    ? mainScreen.querySelector(".editor-body")
    : null;
  const resultsPanel = byId("resultsPanel");
  const editorResizer = byId("editorResizer");
  const workspace = mainScreen ? mainScreen.querySelector(".workspace") : null;
  const sidebarShell = byId("sidebarShell");
  const sidebarResizer = byId("sidebarResizer");
  const dbSelectWrap = byId("dbSelectWrap");
  const dbSelect = byId("dbSelect");
  const tableList = byId("tableList");
  const tableSearch = byId("tableSearch");
  const tableSearchModeBtn = byId("tableSearchModeBtn");
  const tableSearchClear = byId("tableSearchClear");
  const query = byId("query");
  const limitSelect = byId("limitSelect");
  const timeoutSelect = byId("timeoutSelect");
  const queryStatus = byId("queryStatus");
  const snippetQueryInput = byId("snippetQueryInput");
  const definitionQueryInput = byId("definitionQueryInput");
  const sqlHelpBtn = byId("sqlHelpBtn");
  const sqlHelpPanel = byId("sqlHelpPanel");
  const sqlHelpCloseBtn = byId("sqlHelpCloseBtn");
  const sqlHelpList = byId("sqlHelpList");
  const resultsTableWrap = byId("resultsTableWrap") ||
    (resultsPanel ? resultsPanel.querySelector(".results-table") : null);
  const tableActionsBar = byId("tableActionsBar");
  const queryFilter = byId("queryFilter");
  const queryFilterClear = byId("queryFilterClear");
  const objectDetailsPanel = byId("objectDetailsPanel");
  const sidebar =
    byId("sidebar") || (mainScreen ? mainScreen.querySelector(".tables") : null);
  const mainLayout = byId("mainLayout");
  const toast = byId("toast");
  const tabBar = byId("tabBar");
  const newTabBtn = byId("newTabBtn");
  const tableObjectTabs = byId("tableObjectTabs");
  const resultsTable = byId("resultsTable");
  const resultsEmptyState = byId("resultsEmptyState");
  const tablePagination = byId("tablePagination");
  const pagePrevBtn = byId("pagePrevBtn");
  const pageNextBtn = byId("pageNextBtn");
  const pageInfo = byId("pageInfo");
  const countBtn = byId("countBtn");
  const tableRefreshBtn = byId("tableRefreshBtn");
  const applyEditsBtn = byId("applyEditsBtn");
  const revertEditsBtn = byId("revertEditsBtn");
  const deleteRowBtn = byId("deleteRowBtn");
  const refreshSchemaBtn = byId("refreshSchemaBtn");
  const applyFilterBtn = byId("applyFilterBtn");
  const queryOutputBtn = byId("queryOutputBtn");
  const queryOutputPreview = byId("queryOutputPreview");
  const outputModal = byId("outputModal");
  const outputModalSubtitle = byId("outputModalSubtitle");
  const outputLogBody = byId("outputLogBody");
  const outputCloseBtn = byId("outputCloseBtn");
  const outputCloseBtnBottom = byId("outputCloseBtnBottom");
  const outputModalBackdrop = byId("outputModalBackdrop");
  const outputCopyBtn = byId("outputCopyBtn");
  const editChangesModal = byId("editChangesModal");
  const editChangesModalBackdrop = byId("editChangesModalBackdrop");
  const editChangesSubtitle = byId("editChangesSubtitle");
  const editChangesSqlInput = byId("editChangesSqlInput");
  const editChangesPkWarning = byId("editChangesPkWarning");
  const editChangesCloseBtn = byId("editChangesCloseBtn");
  const editChangesCancelBtn = byId("editChangesCancelBtn");
  const editChangesRevertBtn = byId("editChangesRevertBtn");
  const editChangesRunBtn = byId("editChangesRunBtn");
  const definitionModal = byId("definitionModal");
  const definitionTitle = byId("definitionTitle");
  const definitionSubtitle = byId("definitionSubtitle");
  const definitionCloseBtn = byId("definitionCloseBtn");
  const definitionModalBackdrop = byId("definitionModalBackdrop");
  const definitionFormatBtn = byId("definitionFormatBtn");
  const definitionCopyBtn = byId("definitionCopyBtn");
  const definitionSaveBtn = byId("definitionSaveBtn");
  const settingsDefaultLimit = byId("settingsDefaultLimit");
  const settingsDefaultTimeout = byId("settingsDefaultTimeout");
  const settingsSessionTimezoneCombobox = byId(
    "settingsSessionTimezoneCombobox",
  );
  const snippetsList = byId("snippetsList");
  const addSnippetBtn = byId("addSnippetBtn");
  const snippetModal = byId("snippetModal");
  const snippetModalBackdrop = byId("snippetModalBackdrop");
  const snippetCloseBtn = byId("snippetCloseBtn");
  const snippetCancelBtn = byId("snippetCancelBtn");
  const snippetSaveBtn = byId("snippetSaveBtn");
  const snippetNameInput = byId("snippetNameInput");
  const stopBtn = byId("stopBtn");
  const explainAnalyzeBtn = byId("explainAnalyzeBtn");
  const editorSqlState = {
    historyManager: null,
    snippetsManager: null,
    sqlAutocomplete: null,
    codeEditor: null,
    snippetEditor: null,
    definitionEditor: null,
    editChangesEditor: null,
    treeView: null,
    tabTablesView: null,
    tabConnectionsView: null,
    tableObjectTabsView: null,
    tableView: null,
    activeDefinitionTarget: null,
    isSavingDefinition: false,
    isConnecting: false,
    queryProgressTimer: null,
    queryProgressRevealTimer: null,
    queryProgressStartedAt: 0,
    currentOutput: null,
    globalLoading: null,
    isEditingConnection: false,
    editingConnectionSeed: null,
    resultsByTabId: new Map(),
    outputByTabId: new Map(),
    tableFilterByTabId: new Map(),
    objectContextByTabId: new Map(),
    columnKeyMetaByTableKey: new Map(),
    columnKeyMetaRequestSeq: 0,
    pendingEditsByTabId: new Map(),
    selectedResultRowIndex: null,
    selectedResultRow: null,
    editCapabilityCache: {
      tabId: null,
      rowsRef: null,
      metaRef: null,
      contextKey: "",
      value: null,
    },
    isApplyingEdits: false,
    lastSort: null,
    environmentPolicyRules: null,
    settingsModalComponent: null,
    connectModalComponent: null,
    sidebarMenuComponent: null,
    activeConnectSettingsTab: "connection",
    activeConnectMode: "full",
    sessionTimezoneOptionItems: [],
    sessionTimezoneVisibleItems: [],
    sessionTimezoneHighlightedIndex: -1,
    sessionTimezoneMenuOpen: false,
    showToast: () => {},
  };

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
          if (dialogsApi && typeof dialogsApi.showError === "function") {
            return async (message) => {
              try {
                return await dialogsApi.showError(message);
              } catch (err) {
                console.error("API unavailable:", err);
                if (message) editorSqlState.showToast(message, 1600, "error");
              }
            };
          }
          if (electronApi && typeof electronApi.showError === "function")
            return electronApi.showError;
          if (dbApi && typeof dbApi.showError === "function")
            return dbApi.showError;
          return async (message) => {
            console.error("API unavailable:", message);
            if (message) editorSqlState.showToast(message, 1600, "error");
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
        if (electronApi && typeof electronApi[prop] !== "undefined") {
          return electronApi[prop];
        }
        return async () => ({ ok: false, error: "API unavailable." });
      },
    },
  );

  const ensureGlobalLoading = () => {
    if (editorSqlState.globalLoading) return editorSqlState.globalLoading;
    const overlay = document.createElement("div");
    overlay.id = "editorSqlState.globalLoading";
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
    editorSqlState.globalLoading = overlay;
    return overlay;
  };

  const toastComponent = createToast({ element: toast });
  toastApi.setHandler(toastComponent.show);
  editorSqlState.showToast = (message, duration = 1600, type) =>
    toastApi.show(message, duration, type);

  const setGlobalLoading = (loading, labelText) => {
    const overlay = ensureGlobalLoading();
    if (overlay) {
      const label = overlay.querySelector("span:last-child");
      if (label && labelText) label.textContent = labelText;
      overlay.classList.toggle("hidden", !loading);
    }
  };

  // applyTheme, updateThemeUi, setThemeMode, setThemeMenuOpen, loadThemeMode, and theme management now in themeManager

  const setEnvironmentPolicyRules = (rules) => {
    editorSqlState.environmentPolicyRules = normalizeEnvironmentPolicyRules(
      resolveEnvironmentPoliciesPayload(rules),
    );
    return editorSqlState.environmentPolicyRules;
  };

  const getEnvironmentPolicyRules = () => {
    if (!editorSqlState.environmentPolicyRules) {
      editorSqlState.environmentPolicyRules = cloneEnvironmentPolicyRules(
        ENVIRONMENT_POLICY_DEFAULTS,
      );
    }
    return editorSqlState.environmentPolicyRules;
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
    editorSqlState.sessionTimezoneMenuOpen = nextOpen;
    if (editorSqlState.settingsModalComponent) {
      editorSqlState.settingsModalComponent.setSessionTimezoneMenuOpen(
        nextOpen,
      );
    }
    if (!nextOpen) editorSqlState.sessionTimezoneHighlightedIndex = -1;
  };

  const renderSessionTimezoneMenu = () => {
    if (!editorSqlState.settingsModalComponent) return;
    editorSqlState.settingsModalComponent.renderSessionTimezoneMenu({
      items: editorSqlState.sessionTimezoneVisibleItems,
      highlightedIndex: editorSqlState.sessionTimezoneHighlightedIndex,
      onSelect: (timezone) => {
        applySessionTimezoneToSettingsInput(timezone);
        setSessionTimezoneMenuOpen(false);
        if (editorSqlState.settingsModalComponent)
          editorSqlState.settingsModalComponent.focusSessionTimezone();
      },
    });
  };

  const setSessionTimezoneHighlightedIndex = (index) => {
    if (!editorSqlState.sessionTimezoneVisibleItems.length) {
      editorSqlState.sessionTimezoneHighlightedIndex = -1;
      renderSessionTimezoneMenu();
      return;
    }
    const next = Math.max(
      0,
      Math.min(
        editorSqlState.sessionTimezoneVisibleItems.length - 1,
        Number(index) || 0,
      ),
    );
    editorSqlState.sessionTimezoneHighlightedIndex = next;
    renderSessionTimezoneMenu();
  };

  const filterSessionTimezoneMenu = (query) => {
    const token = extractSessionTimezoneToken(query).toLowerCase();
    if (!token) {
      editorSqlState.sessionTimezoneVisibleItems = [
        ...editorSqlState.sessionTimezoneOptionItems,
      ];
    } else {
      editorSqlState.sessionTimezoneVisibleItems =
        editorSqlState.sessionTimezoneOptionItems.filter((item) =>
          item.search.includes(token),
        );
    }
    if (!editorSqlState.sessionTimezoneVisibleItems.length) {
      editorSqlState.sessionTimezoneHighlightedIndex = -1;
    } else if (
      editorSqlState.sessionTimezoneHighlightedIndex < 0 ||
      editorSqlState.sessionTimezoneHighlightedIndex >=
        editorSqlState.sessionTimezoneVisibleItems.length
    ) {
      editorSqlState.sessionTimezoneHighlightedIndex = 0;
    }
    renderSessionTimezoneMenu();
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
    editorSqlState.sessionTimezoneOptionItems = items.map((item) => {
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
    const selectedIndex = editorSqlState.sessionTimezoneOptionItems.findIndex(
      (item) => item.timezone === normalized,
    );
    editorSqlState.sessionTimezoneHighlightedIndex =
      selectedIndex >= 0 ? selectedIndex : -1;
    filterSessionTimezoneMenu("");
  };

  const applySessionTimezoneToSettingsInput = (value) => {
    const timezone = normalizeSessionTimezone(value);
    renderSessionTimezoneOptions(timezone);
    if (editorSqlState.settingsModalComponent)
      editorSqlState.settingsModalComponent.setSessionTimezoneValue(
        buildSessionTimezoneDisplay(timezone),
      );
    setSessionTimezoneMenuOpen(false);
    return timezone;
  };

  const persistSessionTimezone = (value) => {
    const next = normalizeSessionTimezone(value);
    localStorage.setItem(STORAGE_KEYS.SESSION_TIMEZONE_KEY, next);
    return next;
  };

  const readStoredSessionTimezone = () =>
    normalizeSessionTimezone(
      localStorage.getItem(STORAGE_KEYS.SESSION_TIMEZONE_KEY),
    );

  const resolveEffectiveSessionTimezone = (value) => {
    const normalized = normalizeSessionTimezone(value);
    if (normalized === SESSION_TIMEZONE_SYSTEM)
      return resolveSystemSessionTimezone();
    return normalized;
  };

  const readSessionTimezoneInput = () =>
    normalizeSessionTimezone(
      editorSqlState.settingsModalComponent
        ? editorSqlState.settingsModalComponent.getSessionTimezoneValue()
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
      openMs: localStorage.getItem(STORAGE_KEYS.CONNECTION_OPEN_TIMEOUT_KEY),
      closeMs: localStorage.getItem(STORAGE_KEYS.CONNECTION_CLOSE_TIMEOUT_KEY),
      validationMs: localStorage.getItem(
        STORAGE_KEYS.CONNECTION_VALIDATION_TIMEOUT_KEY,
      ),
    });

  const applyConnectionTimeoutsToSettingsInputs = (input) => {
    const next = normalizeConnectionTimeouts(input);
    if (editorSqlState.settingsModalComponent) {
      editorSqlState.settingsModalComponent.setConnectionTimeoutValues(next);
    }
    return next;
  };

  const readConnectionTimeoutsInputs = () =>
    normalizeConnectionTimeouts({
      ...(editorSqlState.settingsModalComponent
        ? editorSqlState.settingsModalComponent.getConnectionTimeoutValues()
        : {}),
    });

  const persistConnectionTimeouts = (input) => {
    const next = normalizeConnectionTimeouts(input);
    localStorage.setItem(STORAGE_KEYS.CONNECTION_OPEN_TIMEOUT_KEY, next.openMs);
    localStorage.setItem(
      STORAGE_KEYS.CONNECTION_CLOSE_TIMEOUT_KEY,
      next.closeMs,
    );
    localStorage.setItem(
      STORAGE_KEYS.CONNECTION_VALIDATION_TIMEOUT_KEY,
      next.validationMs,
    );
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
      stopOnFirstError: localStorage.getItem(
        STORAGE_KEYS.ERROR_STOP_ON_FIRST_KEY,
      ),
      continueOnError: localStorage.getItem(
        STORAGE_KEYS.ERROR_CONTINUE_ON_ERROR_KEY,
      ),
      autoOpenOutputOnError: localStorage.getItem(
        STORAGE_KEYS.ERROR_AUTO_OPEN_OUTPUT_KEY,
      ),
      showDetailedDbErrorCode: localStorage.getItem(
        STORAGE_KEYS.ERROR_SHOW_DETAILED_CODE_KEY,
      ),
      hideSensitiveValuesInErrors: localStorage.getItem(
        STORAGE_KEYS.ERROR_HIDE_SENSITIVE_KEY,
      ),
      retryTransientSelectErrors: localStorage.getItem(
        STORAGE_KEYS.ERROR_RETRY_TRANSIENT_KEY,
      ),
    });

  const applyErrorHandlingToSettingsInputs = (input) => {
    const next = normalizeErrorHandlingSettings(input);
    if (editorSqlState.settingsModalComponent) {
      editorSqlState.settingsModalComponent.setErrorHandlingValues(next);
    }
    return normalizeErrorHandlingSettings({
      ...(editorSqlState.settingsModalComponent
        ? editorSqlState.settingsModalComponent.getErrorHandlingValues()
        : next),
    });
  };

  const readErrorHandlingSettingsInputs = () =>
    normalizeErrorHandlingSettings({
      ...(editorSqlState.settingsModalComponent
        ? editorSqlState.settingsModalComponent.getErrorHandlingValues()
        : ERROR_HANDLING_DEFAULTS),
    });

  const persistErrorHandlingSettings = (input) => {
    const next = normalizeErrorHandlingSettings(input);
    localStorage.setItem(
      STORAGE_KEYS.ERROR_STOP_ON_FIRST_KEY,
      next.stopOnFirstError ? "1" : "0",
    );
    localStorage.setItem(
      STORAGE_KEYS.ERROR_CONTINUE_ON_ERROR_KEY,
      next.continueOnError ? "1" : "0",
    );
    localStorage.setItem(
      STORAGE_KEYS.ERROR_AUTO_OPEN_OUTPUT_KEY,
      next.autoOpenOutputOnError ? "1" : "0",
    );
    localStorage.setItem(
      STORAGE_KEYS.ERROR_SHOW_DETAILED_CODE_KEY,
      next.showDetailedDbErrorCode ? "1" : "0",
    );
    localStorage.setItem(
      STORAGE_KEYS.ERROR_HIDE_SENSITIVE_KEY,
      next.hideSensitiveValuesInErrors ? "1" : "0",
    );
    localStorage.setItem(
      STORAGE_KEYS.ERROR_RETRY_TRANSIENT_KEY,
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
      limit: localStorage.getItem(STORAGE_KEYS.QUERY_DEFAULT_LIMIT_KEY),
      timeoutMs: localStorage.getItem(STORAGE_KEYS.QUERY_DEFAULT_TIMEOUT_KEY),
    });

  let lastTimeoutSelection = null;

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
    if (editorSqlState.settingsModalComponent) {
      editorSqlState.settingsModalComponent.setQueryDefaultsValues({
        limit: normalizeSelectValue(
          settingsDefaultLimit,
          next.limit,
          QUERY_DEFAULTS.limit,
        ),
        timeoutMs: normalizeSelectValue(
          settingsDefaultTimeout,
          next.timeoutMs,
          QUERY_DEFAULTS.timeoutMs,
        ),
      });
    }
    return next;
  };

  const readQueryDefaultsInputs = () =>
    normalizeQueryDefaults({
      ...(editorSqlState.settingsModalComponent
        ? editorSqlState.settingsModalComponent.getQueryDefaultsValues()
        : {}),
    });

  const persistQueryDefaults = (input) => {
    const next = normalizeQueryDefaults(input);
    localStorage.setItem(STORAGE_KEYS.QUERY_DEFAULT_LIMIT_KEY, next.limit);
    localStorage.setItem(
      STORAGE_KEYS.QUERY_DEFAULT_TIMEOUT_KEY,
      next.timeoutMs,
    );
    return next;
  };

  const applyEnvironmentPolicyInputs = (rules) => {
    const nextRules = normalizeEnvironmentPolicyRules(rules);
    if (editorSqlState.settingsModalComponent) {
      editorSqlState.settingsModalComponent.setEnvironmentPolicyValues({
        dev: nextRules[POLICY_MODE_DEV],
        staging: nextRules[POLICY_MODE_STAGING],
        prod: nextRules[POLICY_MODE_PROD],
      });
    }
  };

  const readEnvironmentPolicyInputs = () => {
    const inputs = editorSqlState.settingsModalComponent
      ? editorSqlState.settingsModalComponent.getEnvironmentPolicyValues()
      : {};
    const next = {};
    [POLICY_MODE_DEV, POLICY_MODE_STAGING, POLICY_MODE_PROD].forEach((mode) => {
      const defaults = ENVIRONMENT_POLICY_DEFAULTS[mode];
      const fields = inputs[mode] || {};
      next[mode] = {
        allowWrite:
          fields.allowWrite !== undefined
            ? !!fields.allowWrite
            : !!defaults.allowWrite,
        allowDdlAdmin:
          fields.allowDdlAdmin !== undefined
            ? !!fields.allowDdlAdmin
            : !!defaults.allowDdlAdmin,
        requireApproval:
          fields.requireApproval !== undefined
            ? !!fields.requireApproval
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
      const res = await settingsApi.getPolicySettings();
      const next = setEnvironmentPolicyRules(
        res && res.policies ? res.policies : res,
      );
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
    try {
      const res = await settingsApi.savePolicySettings({ policies: next });
      const saved = setEnvironmentPolicyRules(
        res && res.policies ? res.policies : next,
      );
      applyEnvironmentPolicyInputs(saved);
      return { ok: true, saved: true };
    } catch (err) {
      if (safeApi.showError) {
        await safeApi.showError(
          err && err.message ? err.message : "Failed to save policy settings.",
        );
      }
      return { ok: false };
    }
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
    editorSqlState.isEditingConnection = enabled;
    if (!enabled) {
      editorSqlState.editingConnectionSeed = null;
      if (saveName) delete saveName.dataset.originalName;
    }
    if (editorSqlState.connectModalComponent)
      editorSqlState.connectModalComponent.setEditMode(enabled);
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

  // promptConnectionSecrets, closeCredentialPrompt, promptPolicyApproval, closePolicyApprovalPrompt
  // now defined after component initialization

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

  const resetConnectionForm = () => {
    if (editorSqlState.connectModalComponent) {
      editorSqlState.connectModalComponent.setFormData({
        type: "mysql",
        connectionUrl: "",
        host: "localhost",
        port: "",
        user: "",
        password: "",
        database: "",
        name: "",
        rememberPassword: false,
        readOnly: false,
        policyMode: "dev",
        filePath: "",
        sqliteMode: "create",
        ssh: { enabled: false },
      });
      editorSqlState.connectModalComponent.setActiveTab("direct");
      editorSqlState.connectModalComponent.setSettingsTab("connection");
    }
    updateConnectionUrlPlaceholder("mysql");
    if (saveName) delete saveName.dataset.originalName;
  };

  const normalizeTypeForForm = (value) => {
    const type = String(value || "")
      .trim()
      .toLowerCase();
    if (!type) return "mysql";
    if (type === "postgresql") return "postgres";
    if (type === "sqlite3") return "sqlite";
    if (
      type === "postgres" ||
      type === "mysql" ||
      type === "sqlite"
    )
      return type;
    return "mysql";
  };

  const syncConnectionTypeFields = () => {
    if (editorSqlState.connectModalComponent)
      editorSqlState.connectModalComponent.syncTypeFields();
  };

  const resolveConnectionUrlPlaceholder = (typeValue) => {
    const type = normalizeTypeForForm(typeValue);
    if (type === "postgres")
      return "postgresql://user:password@localhost:5432/database";
    if (type === "sqlite") return "sqlite:///path/to/database.sqlite";
    return "mysql://user:password@localhost:3306/database";
  };

  const updateConnectionUrlPlaceholder = (typeValue) => {
    if (!editorSqlState.connectModalComponent) return;
    editorSqlState.connectModalComponent.setConnectionUrlPlaceholder(
      resolveConnectionUrlPlaceholder(
        typeValue || (dbType ? dbType.value : "mysql"),
      ),
    );
  };

  const normalizeConnectSettingsTab = (tab) => {
    if (tab === "access") return tab;
    return "connection";
  };

  const setConnectSettingsTab = (tab) => {
    const requested = normalizeConnectSettingsTab(tab);
    const next = requested;
    editorSqlState.activeConnectSettingsTab = next;
    if (editorSqlState.connectModalComponent)
      editorSqlState.connectModalComponent.setSettingsTab(next);
  };

  const setScreen = (connected) => {
    if (mainScreen) mainScreen.classList.remove("hidden");
    if (welcomeScreen) welcomeScreen.classList.toggle("hidden", connected);
    if (sidebarShell) sidebarShell.classList.toggle("hidden", !connected);
    if (dbSelectWrap) dbSelectWrap.classList.toggle("hidden", !connected);
    if (sidebarResizer) sidebarResizer.classList.toggle("hidden", !connected);
    if (editorResizer) editorResizer.classList.toggle("hidden", !connected);
    if (editorPanel) editorPanel.classList.toggle("hidden", !connected);
    if (resultsPanel) resultsPanel.classList.toggle("hidden", !connected);
    if (!connected) closeConnectModal();
    if (!connected) setOutputDisplay(null);
    if (!connected) stopQueryProgress();
    if (!connected) {
      editorSqlState.objectContextByTabId = new Map();
      editorSqlState.pendingEditsByTabId = new Map();
      applyResultsPanelState({ snapshot: null, objectContext: null });
    }
    if (homeBtn) {
      homeBtn.classList.toggle(
        "hidden",
        !editorSqlState.tabConnectionsView ||
          editorSqlState.tabConnectionsView.size() === 0,
      );
    }
    if (connected) {
      setSidebarView("tree");
      refreshEditor();
    }
    applySqliteUi();
  };

  const setSidebarView = (view) => {
    if (editorSqlState.sidebarMenuComponent)
      editorSqlState.sidebarMenuComponent.setView(view);
  };

  const renderConnectionTabs = () => {
    if (!editorSqlState.tabConnectionsView) return;
    editorSqlState.tabConnectionsView.render();
    if (homeBtn) {
      homeBtn.classList.toggle(
        "hidden",
        editorSqlState.tabConnectionsView.size() === 0,
      );
    }
  };

  const upsertConnectionTab = (entry) => {
    if (!entry || !editorSqlState.tabConnectionsView) return;
    const key = getTabKey(entry);
    editorSqlState.tabConnectionsView.upsert(key, entry);
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
    if (!editorSqlState.tabConnectionsView) return null;
    const key = editorSqlState.tabConnectionsView.getActiveKey();
    return key ? editorSqlState.tabConnectionsView.getEntry(key) : null;
  };

  const applyTimeoutSupport = () => {
    if (!timeoutSelect) return;
    const active = getActiveConnection();
    const type = active && active.type ? String(active.type).toLowerCase() : "";
    const isSqlite = type === "sqlite";
    if (isSqlite) {
      if (!timeoutSelect.disabled) {
        lastTimeoutSelection = timeoutSelect.value;
      }
      if (hasSelectOption(timeoutSelect, "none")) {
        timeoutSelect.value = "none";
      }
      timeoutSelect.disabled = true;
      timeoutSelect.title = "Timeout not supported for SQLite";
      return;
    }
    if (timeoutSelect.disabled) {
      timeoutSelect.disabled = false;
      if (lastTimeoutSelection && hasSelectOption(timeoutSelect, lastTimeoutSelection)) {
        timeoutSelect.value = lastTimeoutSelection;
      }
    }
    timeoutSelect.title = "Query timeout";
  };

  const applySqliteUi = () => {
    const active = getActiveConnection();
    const type = active && active.type ? String(active.type).toLowerCase() : "";
    const isSqlite = type === "sqlite";
    const hideForSqlite = !active || isSqlite;

    if (stopBtn) stopBtn.classList.toggle("hidden", hideForSqlite);
    if (timeoutSelect) timeoutSelect.classList.toggle("hidden", hideForSqlite);
    if (explainAnalyzeBtn)
      explainAnalyzeBtn.classList.toggle("hidden", hideForSqlite);
    if (dbSelectWrap) dbSelectWrap.classList.toggle("hidden", hideForSqlite);

    const timeoutField = settingsDefaultTimeout
      ? settingsDefaultTimeout.closest(".field")
      : null;
    if (timeoutField) timeoutField.classList.toggle("hidden", isSqlite);

    const timezoneSection = settingsSessionTimezoneCombobox
      ? settingsSessionTimezoneCombobox.closest(".settings-section")
      : null;
    if (timezoneSection) timezoneSection.classList.toggle("hidden", isSqlite);

    applyTimeoutSupport();
  };

  editorSqlState.sqlAutocomplete = createSqlAutocomplete({
    api: safeApi,
    getActiveConnection,
  });

  const getCurrentHistoryKey = () => {
    if (!editorSqlState.tabConnectionsView) return null;
    return editorSqlState.tabConnectionsView.getActiveKey();
  };

  const tabsStorageKey = (key) => (key ? `sqlEditor.tabs:${key}` : null);
  const editorCollapsedStorageKey = (key) =>
    key ? `${STORAGE_KEYS.EDITOR_COLLAPSED_KEY_PREFIX}:${key}` : null;

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
    if (!key || !editorSqlState.tabTablesView) return;
    storageApi.writeJson(
      tabsStorageKey(key),
      editorSqlState.tabTablesView.getState(),
    );
  };

  const saveTabsForActive = () => {
    if (!editorSqlState.tabConnectionsView) return;
    const key = editorSqlState.tabConnectionsView.getActiveKey();
    if (key) {
      saveTabsForKey(key);
    }
  };

  const loadTabsForKey = (key) => {
    if (!key || !editorSqlState.tabTablesView) return;
    const tabsState = storageApi.readJson(tabsStorageKey(key), null);
    if (tabsState && Array.isArray(tabsState.tabs)) {
      editorSqlState.tabTablesView.setState(tabsState);
      if (tabsState.tabs.length === 0) editorSqlState.tabTablesView.ensureOne();
      refreshEditor();
      return;
    }
    editorSqlState.tabTablesView.setState({
      tabs: [],
      activeTabId: null,
      tabCounter: 1,
    });
    editorSqlState.tabTablesView.ensureOne();
    refreshEditor();
  };

  const applyEntryToForm = (entry) => {
    if (!entry) return;
    const type = normalizeTypeForForm(entry.type);
    if (editorSqlState.connectModalComponent) {
      editorSqlState.connectModalComponent.setFormData({
        ...entry,
        type,
        rememberPassword: entryRemembersSecrets(entry),
        readOnly: isEntryReadOnly(entry),
        policyMode: getEntryPolicyMode(entry),
        ssh: getEntrySshConfig(entry),
      });
    }
    updateConnectionUrlPlaceholder(type);
  };

  const loadSidebarWidth = () => {
    if (!sidebar) return;
    const raw = localStorage.getItem(STORAGE_KEYS.SIDEBAR_KEY);
    const width = Number(raw);
    if (Number.isFinite(width) && width >= 200 && width <= 520) {
      sidebar.style.width = `${width}px`;
    }
  };

  const initSidebarResizer = () => {
    if (!sidebarResizer || !sidebar) return;
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
        localStorage.setItem(
          STORAGE_KEYS.SIDEBAR_KEY,
          String(Math.round(width)),
        );
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
        if (editorSqlState.tabTablesView)
          editorSqlState.tabTablesView.closeActive();
      } else if (!event.shiftKey && key === "t") {
        event.preventDefault();
        if (editorSqlState.tabTablesView) {
          editorSqlState.tabTablesView.syncActiveTabContent();
          editorSqlState.tabTablesView.create();
          setEditorVisible(true);
        }
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        if (editorSqlState.codeEditor)
          editorSqlState.codeEditor.adjustFontSize(1);
      } else if (key === "-" || key === "_") {
        event.preventDefault();
        if (editorSqlState.codeEditor)
          editorSqlState.codeEditor.adjustFontSize(-1);
      } else if (!event.shiftKey && key === "0") {
        event.preventDefault();
        if (editorSqlState.codeEditor)
          editorSqlState.codeEditor.resetFontSize();
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
    if (editorSqlState.codeEditor) {
      editorSqlState.codeEditor.setSize("100%", next);
    }
    if (save) {
      localStorage.setItem(STORAGE_KEYS.EDITOR_HEIGHT_KEY, String(next));
    }
  };

  const loadEditorHeight = () => {
    const raw = Number(localStorage.getItem(STORAGE_KEYS.EDITOR_HEIGHT_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return;
    applyEditorBodyHeight(raw, { save: false });
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
    if (!editorSqlState.codeEditor) return;
    editorSqlState.codeEditor.refresh();
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
  const OUTPUT_SQL_MAX = 220;

  const normalizePreview = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();

  const truncatePreview = (text) => {
    const preview = normalizePreview(text);
    if (preview.length <= OUTPUT_PREVIEW_MAX) return preview;
    return `${preview.slice(0, OUTPUT_PREVIEW_MAX - 1)}…`;
  };

  const truncateOutputSql = (text) => {
    const preview = normalizePreview(text);
    if (preview.length <= OUTPUT_SQL_MAX) return preview;
    return `${preview.slice(0, OUTPUT_SQL_MAX - 1)}…`;
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
    startedAt,
    endedAt,
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
    const startTime = startedAt
      ? formatTime(new Date(startedAt))
      : formatTime(new Date());
    const endTime = endedAt ? formatTime(new Date(endedAt)) : startTime;
    return {
      id: 0,
      time: endTime,
      startTime,
      endTime,
      action: buildAction(sql),
      response,
      durationMs: Number.isFinite(duration) ? Math.round(duration) : 0,
      fullResponse: response,
      ok: !!ok,
      sql: String(sql || ""),
    };
  };

  const ensureOutputState = (tabId) => {
    if (!tabId) return null;
    if (!editorSqlState.outputByTabId.has(tabId)) {
      editorSqlState.outputByTabId.set(tabId, {
        seq: 0,
        items: [],
        subtitle: "Latest result",
      });
    }
    return editorSqlState.outputByTabId.get(tabId);
  };

  const appendOutputEntry = (tabId, entry) => {
    const outputState = ensureOutputState(tabId);
    if (!outputState || !entry) return;
    outputState.seq += 1;
    const next = { ...entry, id: outputState.seq };
    outputState.items.push(next);
    if (outputState.items.length > 200) {
      outputState.items.shift();
    }
  };

  const setOutputDisplay = (payload) => {
    editorSqlState.currentOutput = payload || null;
    if (queryOutputPreview) {
      if (payload && payload.items && payload.items.length) {
        const last = payload.items[payload.items.length - 1];
        const preview = `${last.action} • ${last.response}`;
        queryOutputPreview.textContent = truncatePreview(preview);
      } else {
        queryOutputPreview.textContent = "Run a query to see output.";
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
    if (
      !outputModal ||
      !editorSqlState.currentOutput ||
      !editorSqlState.currentOutput.items
    )
      return;
    if (outputModalSubtitle) {
      outputModalSubtitle.textContent =
        editorSqlState.currentOutput.subtitle || "Latest result";
    }
    if (outputLogBody) {
      outputLogBody.innerHTML = "";
      editorSqlState.currentOutput.items.forEach((entry) => {
        const wrapper = document.createElement("div");
        wrapper.className = "output-entry";

        const header = document.createElement("div");
        header.className = "output-line is-neutral";

        const time = document.createElement("span");
        time.className = "output-time";
        time.textContent = entry.startTime || entry.time || "";

        const sep = document.createElement("span");
        sep.textContent = "-";

        const sql = document.createElement("span");
        sql.className = "output-sql-line";
        const fullSql = entry.sql || entry.action || "";
        sql.textContent = truncateOutputSql(fullSql);

        header.appendChild(time);
        header.appendChild(sep);
        header.appendChild(sql);
        wrapper.appendChild(header);

        const running = document.createElement("div");
        running.className = "output-line is-neutral";
        running.textContent = "Running Query...";
        wrapper.appendChild(running);

        const footer = document.createElement("div");
        footer.className = `output-line output-meta ${entry.ok ? "is-success" : "is-error"}`;

        const footerTime = document.createElement("span");
        footerTime.className = "output-time";
        footerTime.textContent = entry.endTime || entry.time || "";

        const footerSep = document.createElement("span");
        footerSep.textContent = "-";

        const meta = document.createElement("span");
        const metaParts = [];
        if (entry.response) metaParts.push(entry.response);
        if (entry.durationMs) metaParts.push(`${entry.durationMs}ms`);
        meta.textContent = metaParts.join(" - ");

        footer.appendChild(footerTime);
        footer.appendChild(footerSep);
        footer.appendChild(meta);
        wrapper.appendChild(footer);

        outputLogBody.appendChild(wrapper);
      });
    }
    outputModal.classList.remove("hidden");
  };

  const closeOutputModal = () => {
    if (outputModal) outputModal.classList.add("hidden");
  };

  const getDefinitionSql = () => {
    if (editorSqlState.definitionEditor)
      return editorSqlState.definitionEditor.getValue();
    return definitionQueryInput ? definitionQueryInput.value : "";
  };

  const syncDefinitionSaveState = () => {
    if (!definitionSaveBtn) return;
    const hasTarget = !!(
      editorSqlState.activeDefinitionTarget &&
      editorSqlState.activeDefinitionTarget.kind === "view" &&
      editorSqlState.activeDefinitionTarget.name
    );
    const hasSql = !!String(getDefinitionSql() || "").trim();
    definitionSaveBtn.disabled =
      editorSqlState.isSavingDefinition || !hasTarget || !hasSql;
  };

  const openDefinitionModal = ({ title, subtitle, sql, target } = {}) => {
    if (!definitionModal) return;
    editorSqlState.activeDefinitionTarget = target || null;
    editorSqlState.isSavingDefinition = false;
    if (definitionTitle) definitionTitle.textContent = title || "Definition";
    if (definitionSubtitle) definitionSubtitle.textContent = subtitle || "";
    if (editorSqlState.definitionEditor)
      editorSqlState.definitionEditor.setValue(sql || "");
    else if (definitionQueryInput) definitionQueryInput.value = sql || "";
    syncDefinitionSaveState();
    definitionModal.classList.remove("hidden");
    if (editorSqlState.definitionEditor)
      editorSqlState.definitionEditor.refresh();
  };

  const closeDefinitionModal = () => {
    editorSqlState.activeDefinitionTarget = null;
    editorSqlState.isSavingDefinition = false;
    syncDefinitionSaveState();
    if (definitionModal) definitionModal.classList.add("hidden");
  };

  const updateOutputForActiveTab = () => {
    if (!editorSqlState.tabTablesView) {
      setOutputDisplay(null);
      return;
    }
    const tab = editorSqlState.tabTablesView.getActiveTab();
    if (!tab || !tab.id) {
      setOutputDisplay(null);
      return;
    }
    const payload = editorSqlState.outputByTabId.get(tab.id) || null;
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
    return normalizeObjectContext(
      editorSqlState.objectContextByTabId.get(tabId),
    );
  };

  const setObjectContextForTab = (tabId, context) => {
    if (!tabId) return;
    const normalized = normalizeObjectContext(context);
    if (normalized) {
      editorSqlState.objectContextByTabId.set(tabId, normalized);
      return;
    }
    editorSqlState.objectContextByTabId.delete(tabId);
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
      const columns =
        constraint && Array.isArray(constraint.columns)
          ? constraint.columns
          : [];

      if (type.includes("PRIMARY")) {
        columns.forEach((columnName) => mark(columnName, "pk"));
      }

      if (type.includes("FOREIGN")) {
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
      }
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
    if (editorSqlState.columnKeyMetaByTableKey.has(cacheKey)) {
      return editorSqlState.columnKeyMetaByTableKey.get(cacheKey);
    }

    try {
      const res = await safeApi.listTableInfo({
        schema: String(context.schema || ""),
        table: String(context.table || ""),
      });
      if (!res || !res.ok) return null;
      const meta = buildColumnKeyMeta(res);
      editorSqlState.columnKeyMetaByTableKey.set(cacheKey, meta);
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
    const requestSeq = ++editorSqlState.columnKeyMetaRequestSeq;

    if (editorSqlState.tableView) {
      if (hasSnapshot) editorSqlState.tableView.setResults(snapshot);
      else editorSqlState.tableView.clearUi();
    }
    updatePaginationControls(hasSnapshot ? snapshot : null);

    if (hasSnapshot && normalizedContext && editorSqlState.tableView) {
      void (async () => {
        const columnKeyMeta = await loadColumnKeyMeta(normalizedContext);
        if (!columnKeyMeta) return;
        if (requestSeq !== editorSqlState.columnKeyMetaRequestSeq) return;
        if (!editorSqlState.tableView) return;
        editorSqlState.tableView.setResults({
          ...snapshot,
          columnKeyMeta,
        });
        updateApplyEditsButton();
      })();
    }

    if (editorSqlState.tableObjectTabsView) {
      if (normalizedContext) {
        editorSqlState.tableObjectTabsView.openTable({
          schema: normalizedContext.schema,
          table: normalizedContext.table,
          active: nextObjectTab,
        });
      } else {
        editorSqlState.tableObjectTabsView.clear();
      }
      if (nextObjectTab === "data") {
        editorSqlState.tableObjectTabsView.activateData();
      }
      editorSqlState.tableObjectTabsView.setDataToolbarVisible(hasSnapshot);
    }
    updateApplyEditsButton();
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
    if (editorSqlState.tabTablesView) {
      const tab = editorSqlState.tabTablesView.getActiveTab();
      if (tab && tab.id) {
        editorSqlState.resultsByTabId.set(tab.id, snapshot);
        resetPendingEditsForTab(tab.id, rows || []);
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
    let baseSql = normalizeSql(selectSql);
    if (!baseSql) return "";
    const active = getActiveConnection();
    const type = active && active.type ? String(active.type).toLowerCase() : "";
    if (type === "mysql" && baseSql.includes('"')) {
      baseSql = baseSql.replace(
        /\b(from|join|update|into|delete\s+from)\s+("([^"]+)"(?:\s*\.\s*"[^"]+")?)/gi,
        (match, keyword, ref) => {
          const quoted = ref.replace(/"([^"]+)"/g, (_, name) => {
            const safe = String(name).replace(/`/g, "``");
            return `\`${safe}\``;
          });
          return `${keyword} ${quoted}`;
        },
      );
    }
    const safePage = Number.isFinite(Number(page))
      ? Math.max(0, Math.floor(Number(page)))
      : 0;
    const safePageSize = resolveServerPageSize(pageSize);
    const fetchLimit = safePageSize + 1;
    const fetchOffset = safePage * safePageSize;
    return `SELECT * FROM (${baseSql}) AS __qury_page LIMIT ${fetchLimit} OFFSET ${fetchOffset}`;
  };

  const hasExplicitLimit = (sql) => {
    const clean = normalizeSql(stripLeadingComments(sql));
    if (!clean) return false;
    return /\blimit\b/i.test(clean);
  };

  const applyLimit = (sql) => {
    const limitValue = limitSelect ? limitSelect.value : "none";
    if (!limitValue || limitValue === "none") return sql;
    const clean = normalizeSql(sql);
    if (!clean) return clean;
    if (hasExplicitLimit(clean)) return clean;
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
    if (editorSqlState.queryProgressRevealTimer) {
      clearTimeout(editorSqlState.queryProgressRevealTimer);
      editorSqlState.queryProgressRevealTimer = null;
    }
    if (editorSqlState.queryProgressTimer) {
      clearInterval(editorSqlState.queryProgressTimer);
      editorSqlState.queryProgressTimer = null;
    }
    editorSqlState.queryProgressStartedAt = 0;
    setProgressBar(-1);
  };

  const startQueryProgress = (timeoutMs) => {
    stopQueryProgress();
    editorSqlState.queryProgressStartedAt = Date.now();
    const safeTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(safeTimeout) && safeTimeout > 0;
    const tick = () => {
      if (!editorSqlState.queryProgressStartedAt) return;
      if (!hasTimeout) {
        setProgressBar(2);
        return;
      }
      const elapsed = Date.now() - editorSqlState.queryProgressStartedAt;
      const progress = Math.min(elapsed / safeTimeout, 0.99);
      setProgressBar(progress);
    };
    editorSqlState.queryProgressRevealTimer = setTimeout(() => {
      editorSqlState.queryProgressRevealTimer = null;
      if (!editorSqlState.queryProgressStartedAt) return;
      tick();
      if (hasTimeout) {
        editorSqlState.queryProgressTimer = setInterval(tick, 180);
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
    if (editorSqlState.tabTablesView) {
      const tab = editorSqlState.tabTablesView.getActiveTab();
      const tabId = tab && tab.id ? tab.id : "";
      const snapshot = tabId
        ? editorSqlState.resultsByTabId.get(tabId) || null
        : null;
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
    let firstDangerousAction = "";
    let executedStatements = 0;
    let errorCount = 0;
    let lastErrorMessage = "";
    let hasOutputErrorEntry = false;
    let lastPagination = null;
    let needsSchemaRefresh = false;

    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      if (!firstDangerousAction && isDangerousStatement(stmt)) {
        const keyword = firstDmlKeyword(stmt);
        firstDangerousAction = keyword
          ? `${keyword.toUpperCase()} without WHERE`
          : "dangerous statement";
      }
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

    if (firstDangerousAction) {
      const confirmation = await promptPolicyApproval({
        policyLabel: "Safety check",
        actionLabel: firstDangerousAction,
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

    const overallStart = Date.now();
    if (
      editorSqlState.codeEditor &&
      typeof editorSqlState.codeEditor.setRunning === "function"
    ) {
      editorSqlState.codeEditor.setRunning(true);
    }
    startQueryProgress(timeoutMs);
    try {
      for (let i = 0; i < statements.length; i += 1) {
        const stmt = normalizeSql(statements[i]);
        if (!stmt) continue;
        const classification = classifyStatementByPolicy(stmt);
        const keyword = firstDmlKeyword(stmt);
        const isExplain = isExplainStatement(stmt);
        const explicitLimit = hasExplicitLimit(stmt);
        const canPaginateSelect =
          keyword === "select" &&
          !(classification && classification.kind === "write");
        const serverPaginationConfig =
          options && options.serverPagination !== undefined
            ? options.serverPagination
            : null;
        const useServerPagination =
          canPaginateSelect && !explicitLimit && serverPaginationConfig !== false;
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
        let sql =
          applyDefaultLimit && !explicitLimit ? applyLimitIfSelect(stmt) : stmt;
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
          if (editorSqlState.tabTablesView) {
            const tab = editorSqlState.tabTablesView.getActiveTab();
            if (tab && tab.id) {
            appendOutputEntry(
              tab.id,
              buildOutputEntry({
                sql: displayStmt,
                ok: false,
                error: formattedError,
                duration: Date.now() - startedAt,
                startedAt,
                endedAt: Date.now(),
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
        if (editorSqlState.historyManager)
          await editorSqlState.historyManager.recordHistory(displayStmt);
        if (editorSqlState.tabTablesView) {
          const tab = editorSqlState.tabTablesView.getActiveTab();
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
                startedAt,
                endedAt: Date.now(),
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
            editorSqlState.showToast(`${action}: ${affected} row(s)`);
          } else if (changed !== null) {
            editorSqlState.showToast(`${action}: ${changed} row(s)`);
          } else {
            editorSqlState.showToast(action);
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
      if (needsSchemaRefresh && editorSqlState.treeView) {
        const tables = await editorSqlState.treeView.refresh();
        if (editorSqlState.sqlAutocomplete && tables)
          editorSqlState.sqlAutocomplete.setTables(tables);
      }
      return executedStatements > 0;
    } finally {
      stopQueryProgress();
      if (
        editorSqlState.codeEditor &&
        typeof editorSqlState.codeEditor.setRunning === "function"
      ) {
        editorSqlState.codeEditor.setRunning(false);
      }
    }
  };

  const updateRunAvailability = () => {
    if (
      editorSqlState.codeEditor &&
      typeof editorSqlState.codeEditor.updateAvailability === "function"
    ) {
      editorSqlState.codeEditor.updateAvailability();
    }
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
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    const activeTab = editorSqlState.tabTablesView
      ? editorSqlState.tabTablesView.getActiveTab()
      : null;
    const activeContext =
      activeTab && activeTab.id ? getObjectContextForTab(activeTab.id) : null;
    const base =
      active && (active.sourceSql || active.baseSql)
        ? active.sourceSql || active.baseSql
        : editorSqlState.codeEditor
          ? editorSqlState.codeEditor.getValue()
          : query
            ? query.value
            : "";
    if (!base || !base.trim()) {
      await safeApi.showError("Empty query.");
      return;
    }
    persistActiveTableFilter(filter);
    if (!filter) {
      if (activeContext && activeContext.table) {
        const selectAll = buildSelectAllSql(
          activeContext.schema,
          activeContext.table,
        );
        editorSqlState.lastSort = null;
        await runSql(selectAll, selectAll);
        return;
      }
      editorSqlState.lastSort = null;
      await runSql(base, base);
      return;
    }
    const sql = insertWhere(base, filter);
    if (!sql || !sql.trim()) return;
    editorSqlState.lastSort = null;
    await runSql(sql, base);
  };

  const refreshActiveTable = async () => {
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    const pagination = normalizeSnapshotPagination(active && active.pagination);
    if (pagination) {
      await runServerPage({
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
      return;
    }
    const base =
      active && (active.sourceSql || active.baseSql)
        ? active.sourceSql || active.baseSql
        : "";
    if (!base) {
      await safeApi.showError("Open a table first.");
      return;
    }
    editorSqlState.lastSort = null;
    await runSql(base, base);
  };

  const updateQueryFilterClearVisibility = () => {
    if (!queryFilterClear) return;
    const hasValue = !!(queryFilter && queryFilter.value);
    queryFilterClear.classList.toggle("hidden", !hasValue);
  };

  const getActiveFilterTabId = () => {
    const activeTab = editorSqlState.tabTablesView
      ? editorSqlState.tabTablesView.getActiveTab()
      : null;
    return activeTab && activeTab.id ? activeTab.id : null;
  };

  const readActiveTableFilter = () => {
    const key = getActiveFilterTabId();
    if (!key) return "";
    return editorSqlState.tableFilterByTabId.get(key) || "";
  };

  const persistActiveTableFilter = (value) => {
    const key = getActiveFilterTabId();
    if (!key) return;
    editorSqlState.tableFilterByTabId.set(key, String(value || ""));
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

  const getActiveTabId = () => {
    const activeTab = editorSqlState.tabTablesView
      ? editorSqlState.tabTablesView.getActiveTab()
      : null;
    return activeTab && activeTab.id ? activeTab.id : null;
  };

  const cloneRow = (row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    return { ...row };
  };

  const createPendingEditsState = (rows) => ({
    baselineRows: Array.isArray(rows) ? rows.map(cloneRow) : [],
    changesByRow: new Map(),
    deletedRows: new Set(),
  });

  const resetPendingEditsForTab = (tabId, rows = []) => {
    if (!tabId) return;
    editorSqlState.pendingEditsByTabId.set(
      tabId,
      createPendingEditsState(rows),
    );
  };

  const ensurePendingEditsForTab = (tabId, rows = []) => {
    if (!tabId) return null;
    const existing = editorSqlState.pendingEditsByTabId.get(tabId);
    if (existing && existing.baselineRows.length === rows.length) return existing;
    const next = createPendingEditsState(rows);
    editorSqlState.pendingEditsByTabId.set(tabId, next);
    return next;
  };

  const getPendingEditCount = (tabId) => {
    const state = editorSqlState.pendingEditsByTabId.get(tabId);
    if (!state) return 0;
    let count = 0;
    for (const changeSet of state.changesByRow.values()) {
      if (changeSet) count += changeSet.size;
    }
    if (state.deletedRows) count += state.deletedRows.size;
    return count;
  };

  const getPendingCellState = (tabId, rowIndex, column) => {
    const state = editorSqlState.pendingEditsByTabId.get(tabId);
    if (!state) return false;
    if (state.deletedRows && state.deletedRows.has(rowIndex)) return false;
    const rowChanges = state.changesByRow.get(rowIndex);
    if (!rowChanges) return false;
    return rowChanges.has(String(column));
  };

  const valuesEqual = (a, b) => {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    return false;
  };

  const coerceEditedValue = (rawValue, originalValue) => {
    if (rawValue === null || rawValue === undefined) return rawValue;
    const text = String(rawValue);
    if (text.trim() === "") {
      if (originalValue === null || originalValue === undefined) return null;
      if (typeof originalValue === "number") return null;
      if (typeof originalValue === "boolean") return null;
      return "";
    }
    if (typeof originalValue === "number") {
      const parsed = Number(text.trim());
      if (!Number.isNaN(parsed)) return parsed;
      return text;
    }
    if (typeof originalValue === "bigint") {
      try {
        return BigInt(text.trim());
      } catch (_) {
        return text;
      }
    }
    if (typeof originalValue === "boolean") {
      const normalized = text.trim().toLowerCase();
      if (["true", "t", "1", "yes", "y"].includes(normalized)) return true;
      if (["false", "f", "0", "no", "n"].includes(normalized)) return false;
      return text;
    }
    return text;
  };

  const getEditCapability = () => {
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    const tabId = getActiveTabId();
    const context = tabId ? getObjectContextForTab(tabId) : null;
    const rowsRef = active ? active.rows : null;
    const metaRef = active ? active.columnKeyMeta : null;
    const contextKey = context ? `${context.schema}.${context.table}` : "";
    const cache = editorSqlState.editCapabilityCache;
    if (
      cache &&
      cache.tabId === tabId &&
      cache.rowsRef === rowsRef &&
      cache.metaRef === metaRef &&
      cache.contextKey === contextKey
    ) {
      return cache.value || { ok: false };
    }

    let result = { ok: false, reason: "Open a table first." };
    const activeConnection = getActiveConnection();
    if (activeConnection && isEntryReadOnly(activeConnection)) {
      result = { ok: false, reason: "Connection is read-only." };
    } else if (!tabId || !context || !context.table) {
      result = { ok: false, reason: "Open a table first." };
    } else if (!active || !Array.isArray(active.rows) || active.rows.length === 0) {
      result = { ok: false, reason: "No rows to edit." };
    } else {
      const sampleRow = active.rows[0];
      if (!sampleRow || typeof sampleRow !== "object") {
        result = { ok: false, reason: "No editable rows." };
      } else {
        const rowColumns = Object.keys(sampleRow);
        const pkColumns = rowColumns.filter((col) => {
          const meta =
            active.columnKeyMeta &&
            active.columnKeyMeta[normalizeColumnName(col)];
          return meta && meta.pk;
        });
        const keyColumns = pkColumns.length > 0 ? pkColumns : rowColumns;
        if (keyColumns.length === 0) {
          result = { ok: false, reason: "No columns available to identify rows." };
        } else {
          result = {
            ok: true,
            keyColumns,
            context,
            hasPrimaryKey: pkColumns.length > 0,
          };
        }
      }
    }

    editorSqlState.editCapabilityCache = {
      tabId,
      rowsRef,
      metaRef,
      contextKey,
      value: result,
    };
    return result;
  };

  const updateApplyEditsButton = () => {
    if (!applyEditsBtn && !revertEditsBtn && !deleteRowBtn) return;
    const tabId = getActiveTabId();
    const pendingCount = tabId ? getPendingEditCount(tabId) : 0;
    const capability = getEditCapability();
    const hasPending = pendingCount > 0;
    const applyEnabled = capability.ok && hasPending;
    if (applyEditsBtn) {
      applyEditsBtn.disabled = !applyEnabled;
      applyEditsBtn.classList.toggle("has-pending", hasPending);
      if (capability.ok) {
        applyEditsBtn.title = hasPending
          ? `Apply ${pendingCount} edit(s)`
          : "No pending edits";
      } else {
        applyEditsBtn.title = capability.reason || "Edits unavailable";
      }
    }
    if (revertEditsBtn) {
      revertEditsBtn.disabled = !hasPending;
      revertEditsBtn.title = hasPending
        ? `Revert ${pendingCount} edit(s)`
        : "No pending edits";
    }
    updateDeleteButton();
  };

  const clearPendingEditsUi = () => {
    if (!resultsTable) return;
    resultsTable
      .querySelectorAll("td.pending-edit")
      .forEach((cell) => cell.classList.remove("pending-edit"));
  };

  const setRowDeletedFlag = (row, value) => {
    if (!row || typeof row !== "object") return;
    if (Object.prototype.hasOwnProperty.call(row, "__deleted")) {
      row.__deleted = value;
      return;
    }
    Object.defineProperty(row, "__deleted", {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  };

  const updateDeleteButton = () => {
    if (!deleteRowBtn) return;
    const capability = getEditCapability();
    const hasSelection =
      Number.isFinite(editorSqlState.selectedResultRowIndex) &&
      !!editorSqlState.selectedResultRow;
    deleteRowBtn.disabled = !(capability.ok && hasSelection);
    if (!capability.ok) {
      deleteRowBtn.title = capability.reason || "Edits unavailable";
    } else if (hasSelection) {
      deleteRowBtn.title = "Delete row";
    } else {
      deleteRowBtn.title = "Select a row to delete";
    }
  };

  const setSelectedResultRow = (payload) => {
    if (!payload || !Number.isFinite(payload.rowIndex)) {
      editorSqlState.selectedResultRowIndex = null;
      editorSqlState.selectedResultRow = null;
      updateDeleteButton();
      return;
    }
    editorSqlState.selectedResultRowIndex = payload.rowIndex;
    editorSqlState.selectedResultRow = payload.row || null;
    updateDeleteButton();
  };

  const revertPendingEdits = (tabId) => {
    if (!tabId) return false;
    const state = editorSqlState.pendingEditsByTabId.get(tabId);
    if (!state) return false;
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    if (!active || !Array.isArray(active.rows)) return false;
    const nextRows = state.baselineRows.map(cloneRow);
    resetPendingEditsForTab(tabId, nextRows);
    if (editorSqlState.tableView) {
      editorSqlState.tableView.setResults({
        ...active,
        rows: nextRows,
      });
    }
    const snapshot = editorSqlState.resultsByTabId.get(tabId);
    if (snapshot) {
      editorSqlState.resultsByTabId.set(tabId, {
        ...snapshot,
        rows: nextRows,
      });
    }
    updateApplyEditsButton();
    return true;
  };

  const markRowForDelete = (tabId, rowIndex, row) => {
    if (!tabId || !Number.isFinite(rowIndex) || !row) return false;
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    if (!active || !Array.isArray(active.rows)) return false;
    const state = ensurePendingEditsForTab(tabId, active.rows);
    if (!state) return false;
    if (state.deletedRows.has(rowIndex)) return false;
    state.deletedRows.add(rowIndex);
    state.changesByRow.delete(rowIndex);
    setRowDeletedFlag(row, true);
    if (editorSqlState.tableView) {
      editorSqlState.tableView.setResults(active);
    }
    setSelectedResultRow(null);
    updateApplyEditsButton();
    return true;
  };

  const buildPendingUpdateStatements = (tabId) => {
    const state = editorSqlState.pendingEditsByTabId.get(tabId);
    if (!state) return { statements: [], skipped: 0 };
    const capability = getEditCapability();
    if (!capability.ok)
      return { statements: [], skipped: 0, error: capability.reason };
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    if (!active || !Array.isArray(active.rows))
      return { statements: [], skipped: 0 };
    const { context, keyColumns } = capability;
    const tableRef = buildQualifiedTableRef(
      context.schema || "",
      context.table || "",
    );
    const statements = [];
    let skipped = 0;
    const deletedRows = state.deletedRows || new Set();

    const deletedIndexes = Array.from(deletedRows).sort((a, b) => a - b);
    deletedIndexes.forEach((rowIndex) => {
      const baseRow = state.baselineRows[rowIndex];
      if (!baseRow) {
        skipped += 1;
        return;
      }
      const conditions = [];
      let missingKey = false;
      keyColumns.forEach((col) => {
        const pkValue = getRowValueForColumn(baseRow, col);
        if (pkValue === undefined) {
          missingKey = true;
          return;
        }
        if (pkValue === null) {
          conditions.push(`${quoteIdentifier(col)} IS NULL`);
        } else {
          conditions.push(
            `${quoteIdentifier(col)} = ${toSqlLiteral(pkValue)}`,
          );
        }
      });
      if (missingKey || conditions.length === 0) {
        skipped += 1;
        return;
      }
      statements.push(
        `DELETE FROM ${tableRef} WHERE ${conditions.join(" AND ")};`,
      );
    });

    const sortedRows = Array.from(state.changesByRow.keys()).sort(
      (a, b) => a - b,
    );
    sortedRows.forEach((rowIndex) => {
      if (deletedRows.has(rowIndex)) return;
      const changeSet = state.changesByRow.get(rowIndex);
      if (!changeSet || changeSet.size === 0) return;
      const baseRow = state.baselineRows[rowIndex];
      const currentRow = active.rows[rowIndex];
      if (!baseRow || !currentRow) {
        skipped += 1;
        return;
      }
      const conditions = [];
      let missingKey = false;
      keyColumns.forEach((col) => {
        const pkValue = getRowValueForColumn(baseRow, col);
        if (pkValue === undefined) {
          missingKey = true;
          return;
        }
        if (pkValue === null) {
          conditions.push(`${quoteIdentifier(col)} IS NULL`);
        } else {
          conditions.push(
            `${quoteIdentifier(col)} = ${toSqlLiteral(pkValue)}`,
          );
        }
      });
      if (missingKey || conditions.length === 0) {
        skipped += 1;
        return;
      }
      const sets = [];
      for (const col of changeSet.keys()) {
        const nextValue = getRowValueForColumn(currentRow, col);
        sets.push(`${quoteIdentifier(col)} = ${toSqlLiteral(nextValue)}`);
      }
      if (sets.length === 0) return;
      statements.push(
        `UPDATE ${tableRef} SET ${sets.join(", ")} WHERE ${conditions.join(" AND ")};`,
      );
    });

    return { statements, skipped };
  };

  const openEditChangesModal = ({ statements = [], skipped = 0 } = {}) => {
    if (!editChangesModal) return;
    const sqlText = statements.join("\n");
    if (editorSqlState.editChangesEditor) {
      editorSqlState.editChangesEditor.setValue(sqlText);
    } else if (editChangesSqlInput) {
      editChangesSqlInput.value = sqlText;
    }
    if (editChangesPkWarning) {
      const capability = getEditCapability();
      const showWarning =
        capability && capability.ok && capability.hasPrimaryKey === false;
      editChangesPkWarning.classList.toggle("hidden", !showWarning);
    }
    if (editChangesSubtitle) {
      const count = statements.length;
      const skippedLabel = skipped > 0 ? ` • ${skipped} skipped` : "";
      editChangesSubtitle.textContent = `${count} update(s) ready${skippedLabel}`;
    }
    editChangesModal.classList.remove("hidden");
    if (editorSqlState.editChangesEditor) {
      editorSqlState.editChangesEditor.refresh(false);
    }
  };

  const closeEditChangesModal = () => {
    if (editChangesModal) editChangesModal.classList.add("hidden");
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
    if (editorSqlState.tabTablesView) {
      const defaultDb = dbSelect ? String(dbSelect.value || "").trim() : "";
      openedTab = editorSqlState.tabTablesView.createWithQuery(
        table,
        querySql,
        {
          database: schema || defaultDb,
        },
      );
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
    if (editorSqlState.codeEditor) editorSqlState.codeEditor.focus();
    editorSqlState.lastSort = null;
    if (options && options.execute) {
      await runSql(querySql);
    }
  };

  const updateToggleEditorButtonState = (visible) => {
    if (
      editorSqlState.codeEditor &&
      typeof editorSqlState.codeEditor.setToggleState === "function"
    ) {
      editorSqlState.codeEditor.setToggleState(visible);
    }
  };

  const resolveEditorVisibility = () => {
    const key = editorSqlState.tabConnectionsView
      ? editorSqlState.tabConnectionsView.getActiveKey()
      : null;
    const persisted = readEditorVisibilityForConnection(key);
    if (typeof persisted === "boolean") return persisted;
    const tab = editorSqlState.tabTablesView
      ? editorSqlState.tabTablesView.getActiveTab()
      : null;
    return tab ? tab.editorVisible !== false : true;
  };

  const setEditorVisible = (visible, { persist = true } = {}) => {
    const nextVisible = !!visible;
    if (editorBody) editorBody.classList.toggle("hidden", !nextVisible);
    updateToggleEditorButtonState(nextVisible);
    if (persist && editorSqlState.tabTablesView) {
      const tab = editorSqlState.tabTablesView.getActiveTab();
      if (tab) tab.editorVisible = nextVisible;
    }
    if (persist) {
      const key = editorSqlState.tabConnectionsView
        ? editorSqlState.tabConnectionsView.getActiveKey()
        : null;
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
      const stored = Number(
        localStorage.getItem(STORAGE_KEYS.EDITOR_HEIGHT_KEY),
      );
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
    if (editorSqlState.tabTablesView) editorSqlState.tabTablesView.render();
    if (targetDb && res.current !== targetDb) {
      const useRes = await safeApi.useDatabase(targetDb);
      if (!useRes || !useRes.ok) {
        await safeApi.showError(
          (useRes && useRes.error) || "Failed to select database.",
        );
        return;
      }
      if (active) {
        const key = editorSqlState.tabConnectionsView
          ? editorSqlState.tabConnectionsView.getActiveKey()
          : null;
        active.database = targetDb;
        if (editorSqlState.tabConnectionsView && key) {
          editorSqlState.tabConnectionsView.upsert(key, active);
          renderConnectionTabs();
        }
      }
      if (editorSqlState.treeView)
        editorSqlState.treeView.setActiveSchema(targetDb);
      if (editorSqlState.sqlAutocomplete)
        editorSqlState.sqlAutocomplete.setActiveSchema(targetDb);
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
    const target = editorSqlState.activeDefinitionTarget;
    if (!target || target.kind !== "view" || !target.name) {
      await safeApi.showError("Save unavailable for this definition.");
      return;
    }
    const sql = String(getDefinitionSql() || "").trim();
    if (!sql) {
      await safeApi.showError("Empty definition.");
      return;
    }
    editorSqlState.isSavingDefinition = true;
    syncDefinitionSaveState();
    setGlobalLoading(true, "Saving view...");
    try {
      const ok = await runSql(sql, sql, { applyDefaultLimit: false });
      if (!ok) return;
      if (editorSqlState.treeView) {
        const tables = await editorSqlState.treeView.refresh();
        if (editorSqlState.sqlAutocomplete && tables)
          editorSqlState.sqlAutocomplete.setTables(tables);
      }
      editorSqlState.showToast("View saved");
    } finally {
      editorSqlState.isSavingDefinition = false;
      syncDefinitionSaveState();
      setGlobalLoading(false);
    }
  };

  const resetConnectionScopedUi = () => {
    editorSqlState.resultsByTabId = new Map();
    editorSqlState.objectContextByTabId = new Map();
    editorSqlState.columnKeyMetaByTableKey = new Map();
    editorSqlState.columnKeyMetaRequestSeq += 1;
    editorSqlState.outputByTabId = new Map();
    editorSqlState.tableFilterByTabId = new Map();
    editorSqlState.pendingEditsByTabId = new Map();
    setOutputDisplay(null);
    if (editorSqlState.tableObjectTabsView) {
      editorSqlState.tableObjectTabsView.resetScopeCache();
    }
    applyResultsPanelState({ snapshot: null, objectContext: null });
  };

  const syncActiveDatabaseAndTree = async (entry, key) => {
    const selectedDb = dbSelect ? String(dbSelect.value || "") : "";
    if (selectedDb) {
      if (editorSqlState.treeView)
        editorSqlState.treeView.setActiveSchema(selectedDb);
      if (editorSqlState.sqlAutocomplete)
        editorSqlState.sqlAutocomplete.setActiveSchema(selectedDb);
      if (entry) entry.database = selectedDb;
      if (entry && editorSqlState.tabConnectionsView && key) {
        editorSqlState.tabConnectionsView.upsert(key, entry);
      }
    } else {
      const fallbackDb = entry && entry.database ? String(entry.database) : "";
      if (editorSqlState.treeView)
        editorSqlState.treeView.setActiveSchema(fallbackDb);
      if (editorSqlState.sqlAutocomplete)
        editorSqlState.sqlAutocomplete.setActiveSchema(fallbackDb);
    }
    const tables = editorSqlState.treeView
      ? await editorSqlState.treeView.refresh()
      : null;
    if (editorSqlState.sqlAutocomplete && tables)
      editorSqlState.sqlAutocomplete.setTables(tables);
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
        const key = editorSqlState.tabConnectionsView
          ? editorSqlState.tabConnectionsView.getActiveKey()
          : null;
        active.database = targetDb;
        if (editorSqlState.tabConnectionsView && key) {
          editorSqlState.tabConnectionsView.upsert(key, active);
          renderConnectionTabs();
        }
      }
      if (editorSqlState.treeView)
        editorSqlState.treeView.setActiveSchema(targetDb);
      if (editorSqlState.sqlAutocomplete)
        editorSqlState.sqlAutocomplete.setActiveSchema(targetDb);
      const tables = editorSqlState.treeView
        ? await editorSqlState.treeView.refresh()
        : null;
      if (editorSqlState.sqlAutocomplete && tables)
        editorSqlState.sqlAutocomplete.setTables(tables);
      updateDbSelectUsageHint(targetDb);
      if (editorSqlState.tabTablesView) editorSqlState.tabTablesView.render();
      editorSqlState.showToast(`Using database: ${targetDb}`, 1600, "info");
    } finally {
      setGlobalLoading(false);
    }
  };

  const activateConnection = async (entry, previousKey = null) => {
    const resolvedEntry = await resolveConnectEntry(entry);
    const config = await buildConnectionConfigFromEntry(resolvedEntry);
    if (!config) {
      if (editorSqlState.tabConnectionsView && previousKey)
        editorSqlState.tabConnectionsView.setActive(previousKey);
      return false;
    }
    const key = getTabKey(entry);
    if (previousKey) saveTabsForKey(previousKey);
    setScreen(true);
    if (editorSqlState.tabConnectionsView)
      editorSqlState.tabConnectionsView.setActive(key);
    if (
      editorSqlState.treeView &&
      typeof editorSqlState.treeView.clear === "function"
    )
      editorSqlState.treeView.clear();

    const res = await connectWithLoading(config);
    if (!res.ok) {
      await safeApi.showError(res.error || "Failed to connect.");
      if (
        editorSqlState.treeView &&
        typeof editorSqlState.treeView.clear === "function"
      )
        editorSqlState.treeView.clear();
      if (editorSqlState.tabConnectionsView)
        editorSqlState.tabConnectionsView.clearActive();
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
    applySqliteUi();
    if (editorSqlState.tabTablesView) loadTabsForKey(key);
    return true;
  };

  const tryActivateExistingConnection = async (entry) => {
    if (!entry) return false;
    const key = getTabKey(entry);
    if (
      !editorSqlState.tabConnectionsView ||
      !editorSqlState.tabConnectionsView.has(key)
    )
      return false;
    const previousKey = editorSqlState.tabConnectionsView.getActiveKey();
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
    showToast: editorSqlState.showToast,
    showError: safeApi.showError,
  });

  editorSqlState.connectModalComponent = createConnectModal({
    onConnectSuccess: async (data, { shouldSave }) => {
      let config = {
        ...data,
        port: data.port || undefined,
        sessionTimezone: getSessionTimezoneSetting(),
        ...getConnectionTimeoutSettings(),
      };

      if (await tryActivateExistingConnection(config)) {
        editorSqlState.connectModalComponent.close();
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
      editorSqlState.connectModalComponent.close();
    },
    onSaveSuccess: async () => {
      setEditMode(false);
      await savedComponent.renderSavedList();
    },
    onTestSuccess: () => {
      editorSqlState.showToast("Connection successful");
    },
    onTestError: (message) => {
      editorSqlState.showToast(message, 1600, "error");
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
      editorSqlState.connectModalComponent.open({ mode, keepForm: false });
    },
  });

  // Credential modal
  const credentialModalComponent = createCredentialModal();

  // Settings modal
  editorSqlState.settingsModalComponent = createSettingsModal({
    onOpen: async () => {
      setThemeMenuOpen(false);
      applySessionTimezoneToSettingsInput(readStoredSessionTimezone());
      applyErrorHandlingToSettingsInputs(readStoredErrorHandlingSettings());
      applyConnectionTimeoutsToSettingsInputs(readStoredConnectionTimeouts());
      applyQueryDefaultsToSettingsInputs(readStoredQueryDefaults());
      await loadEnvironmentPolicySettings({ silent: false });
    },
    onSave: async () => {
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

      editorSqlState.showToast("Settings saved");
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
    onTimezoneToggle: () => {
      if (editorSqlState.sessionTimezoneMenuOpen) {
        setSessionTimezoneMenuOpen(false);
      } else {
        filterSessionTimezoneMenu("");
        setSessionTimezoneMenuOpen(true);
        if (editorSqlState.settingsModalComponent)
          editorSqlState.settingsModalComponent.focusSessionTimezone();
      }
    },
    onTimezoneFocus: () => {
      filterSessionTimezoneMenu("");
      setSessionTimezoneMenuOpen(true);
    },
    onTimezoneInput: (value) => {
      filterSessionTimezoneMenu(value);
      setSessionTimezoneMenuOpen(true);
    },
    onTimezoneKeydown: (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!editorSqlState.sessionTimezoneMenuOpen)
          setSessionTimezoneMenuOpen(true);
        if (editorSqlState.sessionTimezoneHighlightedIndex < 0) {
          setSessionTimezoneHighlightedIndex(0);
        } else {
          setSessionTimezoneHighlightedIndex(
            editorSqlState.sessionTimezoneHighlightedIndex + 1,
          );
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!editorSqlState.sessionTimezoneMenuOpen)
          setSessionTimezoneMenuOpen(true);
        if (editorSqlState.sessionTimezoneHighlightedIndex < 0) {
          setSessionTimezoneHighlightedIndex(
            editorSqlState.sessionTimezoneVisibleItems.length - 1,
          );
        } else {
          setSessionTimezoneHighlightedIndex(
            editorSqlState.sessionTimezoneHighlightedIndex - 1,
          );
        }
        return;
      }
      if (event.key === "Enter") {
        if (!editorSqlState.sessionTimezoneMenuOpen) return;
        event.preventDefault();
        const target =
          editorSqlState.sessionTimezoneVisibleItems[
            editorSqlState.sessionTimezoneHighlightedIndex
          ];
        if (target) {
          applySessionTimezoneToSettingsInput(target.timezone);
        } else {
          applySessionTimezoneToSettingsInput(
            editorSqlState.settingsModalComponent
              ? editorSqlState.settingsModalComponent.getSessionTimezoneValue()
              : "",
          );
        }
        return;
      }
      if (event.key === "Escape") {
        if (!editorSqlState.sessionTimezoneMenuOpen) return;
        event.preventDefault();
        setSessionTimezoneMenuOpen(false);
      }
    },
    onOutsideClick: (event) => {
      if (
        editorSqlState.sessionTimezoneMenuOpen &&
        settingsSessionTimezoneCombobox &&
        !(
          event.target &&
          event.target.closest("#settingsSessionTimezoneCombobox")
        )
      ) {
        setSessionTimezoneMenuOpen(false);
      }
    },
  });

  // Policy approval modal
  const policyApprovalModalComponent = createPolicyApprovalModal();

  // Theme manager
  const themeManagerComponent = createThemeManager({
    api: safeApi,
    onThemeChange: () => {
      // Theme changed callback if needed
    },
  });

  // Sidebar menu
  editorSqlState.sidebarMenuComponent = createSidebarMenu({
    onShowHistory: () => {
      if (editorSqlState.historyManager)
        void editorSqlState.historyManager.renderHistoryList();
    },
    onShowSnippets: () => {
      if (editorSqlState.snippetsManager)
        void editorSqlState.snippetsManager.renderSnippetsList();
    },
  });

  // Initialize theme (async init)
  void themeManagerComponent.init();

  // Wrap existing functions to use components
  const promptConnectionSecrets = (entry) => {
    return credentialModalComponent.prompt(entry);
  };

  const openSettingsModal = async () => {
    await editorSqlState.settingsModalComponent.open();
  };

  const closeSettingsModal = () => {
    editorSqlState.settingsModalComponent.close();
  };

  const setSettingsTab = (tab) => {
    editorSqlState.settingsModalComponent.setTab(tab);
  };

  const promptPolicyApproval = ({ policyLabel, actionLabel } = {}) => {
    return policyApprovalModalComponent.prompt({ policyLabel, actionLabel });
  };

  const closePolicyApprovalPrompt = (result = "") => {
    policyApprovalModalComponent.close(result);
  };

  const setThemeMenuOpen = (open) => {
    themeManagerComponent.setMenuOpen(open);
  };

  // Wrap existing functions to use component
  const openConnectModal = ({ keepForm = false, mode = "full" } = {}) => {
    if (!keepForm) {
      resetConnectionForm();
      setEditMode(false);
    }
    editorSqlState.activeConnectMode = mode === "quick" ? "quick" : "full";
    if (editorSqlState.connectModalComponent)
      editorSqlState.connectModalComponent.open({ mode, keepForm });
  };

  const closeConnectModal = () => {
    editorSqlState.connectModalComponent.close();
    setEditMode(false);
  };

  const setConnecting = (loading) => {
    editorSqlState.isConnecting = loading;
    if (editorSqlState.connectModalComponent)
      editorSqlState.connectModalComponent.setLoading(loading);
    if (savedComponent && typeof savedComponent.setLoading === "function") {
      savedComponent.setLoading(loading);
    }
    if (quickConnectComponent) quickConnectComponent.setDisabled(loading);
  };

  const connectWithLoading = async (config) => {
    if (editorSqlState.isConnecting)
      return { ok: false, error: "Connection in progress." };
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
    if (editorSqlState.isConnecting) return;
    await connectEntryFromList(entry);
  });

  document.addEventListener("saved:edit", (ev) => {
    const entry = ev && ev.detail ? ev.detail : null;
    editorSqlState.editingConnectionSeed = entry
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

  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      if (editorSqlState.tabConnectionsView) {
        const key = editorSqlState.tabConnectionsView.getActiveKey();
        if (key) saveTabsForKey(key);
      }
      setScreen(false);
      if (editorSqlState.tabConnectionsView)
        editorSqlState.tabConnectionsView.clearActive();
      renderConnectionTabs();
      renderSavedList();
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

  // Credential modal and policy approval modal event listeners now in components

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

  if (editChangesModalBackdrop) {
    editChangesModalBackdrop.addEventListener("click", () =>
      closeEditChangesModal(),
    );
  }

  if (editChangesCloseBtn) {
    editChangesCloseBtn.addEventListener("click", () =>
      closeEditChangesModal(),
    );
  }

  if (editChangesCancelBtn) {
    editChangesCancelBtn.addEventListener("click", () =>
      closeEditChangesModal(),
    );
  }

  if (editChangesRevertBtn) {
    editChangesRevertBtn.addEventListener("click", () => {
      const tabId = getActiveTabId();
      if (!tabId) return;
      const ok = revertPendingEdits(tabId);
      if (ok) {
        closeEditChangesModal();
        editorSqlState.showToast("Edits reverted");
      }
    });
  }

  if (editChangesRunBtn) {
    editChangesRunBtn.addEventListener("click", async () => {
      if (editorSqlState.isApplyingEdits) return;
      const tabId = getActiveTabId();
      if (!tabId) return;
      const { statements, error } = buildPendingUpdateStatements(tabId);
      if (error) {
        await safeApi.showError(error);
        return;
      }
      if (!statements || statements.length === 0) {
        editorSqlState.showToast("No pending edits.");
        return;
      }
      editorSqlState.isApplyingEdits = true;
      editChangesRunBtn.disabled = true;
      if (editChangesCancelBtn) editChangesCancelBtn.disabled = true;
      if (editChangesRevertBtn) editChangesRevertBtn.disabled = true;
      const sql = statements.join("\n");
      const ok = await runSql(sql, sql, { applyDefaultLimit: false });
      editorSqlState.isApplyingEdits = false;
      editChangesRunBtn.disabled = false;
      if (editChangesCancelBtn) editChangesCancelBtn.disabled = false;
      if (editChangesRevertBtn) editChangesRevertBtn.disabled = false;
      if (ok) {
        const active = editorSqlState.tableView
          ? editorSqlState.tableView.getActive()
          : null;
        if (active && Array.isArray(active.rows)) {
          const nextRows = active.rows
            .filter((row) => !(row && row.__deleted))
            .map((row) => {
              if (row && Object.prototype.hasOwnProperty.call(row, "__deleted")) {
                delete row.__deleted;
              }
              return row;
            });
          if (editorSqlState.tableView) {
            editorSqlState.tableView.setResults({
              ...active,
              rows: nextRows,
              totalRows: nextRows.length,
            });
          }
          const snapshot = editorSqlState.resultsByTabId.get(tabId);
          if (snapshot) {
            editorSqlState.resultsByTabId.set(tabId, {
              ...snapshot,
              rows: nextRows,
              totalRows: nextRows.length,
            });
          }
          resetPendingEditsForTab(tabId, nextRows);
        }
        clearPendingEditsUi();
        updateApplyEditsButton();
        closeEditChangesModal();
      }
    });
  }

  if (outputCopyBtn) {
    outputCopyBtn.addEventListener("click", async () => {
      if (
        !editorSqlState.currentOutput ||
        !editorSqlState.currentOutput.items ||
        editorSqlState.currentOutput.items.length === 0
      )
        return;
      try {
        const lines = editorSqlState.currentOutput.items.flatMap((entry) => {
          const metaParts = [];
          if (entry.response) metaParts.push(entry.response);
          if (entry.durationMs) metaParts.push(`${entry.durationMs}ms`);
          const startTime = entry.startTime || entry.time || "";
          const endTime = entry.endTime || entry.time || "";
          return [
            `${startTime} - ${entry.sql || entry.action || ""}`,
            "Running Query...",
            `${endTime} - ${metaParts.join(" - ")}`,
            "",
          ];
        });
        await navigator.clipboard.writeText(lines.join("\n"));
        editorSqlState.showToast("Output copied");
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
      if (editorSqlState.definitionEditor)
        editorSqlState.definitionEditor.setValue(formatted);
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
        editorSqlState.showToast("SQL copied");
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

  // connectBtn, saveBtn, testBtn are now handled by editorSqlState.connectModalComponent
  // openConnectModalBtn and quickConnectBtn are now handled by quickConnectComponent

  // sqliteModeCreate, sqliteModeExisting, clearFormBtn, cancelEditBtn are now handled by editorSqlState.connectModalComponent

  // Theme toggle and menu event listeners now in themeManager

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", () => {
      void openSettingsModal();
    });
  }
  // Settings modal event listeners (tabs, close, cancel, backdrop, resetDefaults, save) now in component
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsModal();
      closePolicyApprovalPrompt("");
      closeEditChangesModal();
    }
  });

  // Native theme listener now handled by themeManager

  // Sidebar menu event listeners now in sidebarMenu component

  const runServerPage = async ({ page, pageSize } = {}) => {
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
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

  if (countBtn) {
    countBtn.addEventListener("click", async () => {
      const active = editorSqlState.tableView
        ? editorSqlState.tableView.getActive()
        : null;
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
      editorSqlState.lastSort = null;
      await runSql(countSql, source);
    });
  }

  if (applyEditsBtn) {
    applyEditsBtn.addEventListener("click", async () => {
      const tabId = getActiveTabId();
      if (!tabId) return;
      const { statements, skipped, error } =
        buildPendingUpdateStatements(tabId);
      if (error) {
        await safeApi.showError(error);
        return;
      }
      if (!statements || statements.length === 0) {
        editorSqlState.showToast("No pending edits.");
        return;
      }
      openEditChangesModal({ statements, skipped });
    });
  }

  if (revertEditsBtn) {
    revertEditsBtn.addEventListener("click", () => {
      const tabId = getActiveTabId();
      if (!tabId) return;
      const ok = revertPendingEdits(tabId);
      if (ok) editorSqlState.showToast("Edits reverted");
    });
  }

  if (deleteRowBtn) {
    deleteRowBtn.addEventListener("click", () => {
      const tabId = getActiveTabId();
      if (!tabId) return;
      const rowIndex = editorSqlState.selectedResultRowIndex;
      const row = editorSqlState.selectedResultRow;
      if (!Number.isFinite(rowIndex) || !row) {
        editorSqlState.showToast("Select a row to delete.");
        return;
      }
      const ok = markRowForDelete(tabId, rowIndex, row);
      if (ok) editorSqlState.showToast("Row marked for deletion");
    });
  }

  if (tableRefreshBtn) {
    tableRefreshBtn.addEventListener("click", async () => {
      await refreshActiveTable();
    });
  }

  if (pagePrevBtn) {
    pagePrevBtn.addEventListener("click", async () => {
      const active = editorSqlState.tableView
        ? editorSqlState.tableView.getActive()
        : null;
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
      const active = editorSqlState.tableView
        ? editorSqlState.tableView.getActive()
        : null;
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
      // Intentionally no auto-run; user will apply manually.
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
      persistActiveTableFilter(queryFilter.value || "");
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
      persistActiveTableFilter("");
      if (hadFilter) {
        editorSqlState.lastSort = null;
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

  if (refreshSchemaBtn) {
    refreshSchemaBtn.addEventListener("click", async () => {
      if (editorSqlState.treeView) {
        setGlobalLoading(true, "Refreshing schema...");
        const tables = await editorSqlState.treeView.refresh();
        if (editorSqlState.sqlAutocomplete && tables)
          editorSqlState.sqlAutocomplete.setTables(tables);
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
  // Theme loading now handled by themeManager.init()
  loadSidebarWidth();
  loadEditorHeight();
  initSidebarResizer();
  initEditorResizer();
  bindTabShortcuts();
  editorSqlState.treeView = createTreeView({
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
    onToast: (message, duration, type) =>
      editorSqlState.showToast(message, duration, type),
  });
  editorSqlState.codeEditor = createSqlEditor({
    textarea: query,
    api: safeApi,
    runSql,
    getActiveConnection,
    getCurrentHistoryKey,
    openSnippetModal: (payload) => {
      if (
        editorSqlState.snippetsManager &&
        typeof editorSqlState.snippetsManager.openSnippetModal === "function"
      ) {
        editorSqlState.snippetsManager.openSnippetModal(payload);
      }
    },
    stopQueryProgress,
    setQueryStatus,
    onBeforeExecute: () => {
      editorSqlState.lastSort = null;
    },
    onToggleEditor: (nextVisible) => {
      setEditorVisible(nextVisible);
    },
  });
  editorSqlState.codeEditor.init();
  themeManagerComponent.registerCodeEditor(editorSqlState.codeEditor);
  updateToggleEditorButtonState(true);
  createSqlHelp({
    sqlHelpBtn,
    sqlHelpPanel,
    sqlHelpCloseBtn,
    sqlHelpList,
    showToast: editorSqlState.showToast,
  });
  if (editorSqlState.sqlAutocomplete) {
    editorSqlState.codeEditor.setHintProvider({
      getHintOptions: () => editorSqlState.sqlAutocomplete.getHintOptions(),
      prefetch: (editor) => editorSqlState.sqlAutocomplete.prefetch(editor),
    });
  }
  if (snippetQueryInput) {
    editorSqlState.snippetEditor = createCodeEditor({
      textarea: snippetQueryInput,
      lineWrapping: true,
    });
    editorSqlState.snippetEditor.init();
    themeManagerComponent.registerCodeEditor(editorSqlState.snippetEditor);
    if (editorSqlState.sqlAutocomplete) {
      editorSqlState.snippetEditor.setHintProvider({
        getHintOptions: () => editorSqlState.sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => editorSqlState.sqlAutocomplete.prefetch(editor),
      });
    }
  }
  if (definitionQueryInput) {
    editorSqlState.definitionEditor = createCodeEditor({
      textarea: definitionQueryInput,
    });
    editorSqlState.definitionEditor.init();
    themeManagerComponent.registerCodeEditor(editorSqlState.definitionEditor);
    editorSqlState.definitionEditor.onChange(() => {
      syncDefinitionSaveState();
    });
    if (editorSqlState.sqlAutocomplete) {
      editorSqlState.definitionEditor.setHintProvider({
        getHintOptions: () => editorSqlState.sqlAutocomplete.getHintOptions(),
        prefetch: (editor) => editorSqlState.sqlAutocomplete.prefetch(editor),
      });
    }
  }
  if (editChangesSqlInput) {
    editorSqlState.editChangesEditor = createCodeEditor({
      textarea: editChangesSqlInput,
      lineWrapping: true,
      readOnly: true,
      enableCompletion: false,
      autoFocus: false,
    });
    editorSqlState.editChangesEditor.init();
    themeManagerComponent.registerCodeEditor(editorSqlState.editChangesEditor);
  }
  syncDefinitionSaveState();
  updateRunAvailability();
  editorSqlState.tabTablesView = createTabTables({
    tabBar,
    newTabBtn,
    queryInput: query,
    getValue: () =>
      editorSqlState.codeEditor
        ? editorSqlState.codeEditor.getValue()
        : query
          ? query.value
          : "",
    setValue: (value) => {
      if (editorSqlState.codeEditor)
        editorSqlState.codeEditor.setValue(value || "");
      else if (query) query.value = value || "";
      refreshEditor();
    },
    getCurrentDatabase: () =>
      dbSelect ? String(dbSelect.value || "").trim() : "",
    onInput: (handler) => {
      if (editorSqlState.codeEditor)
        editorSqlState.codeEditor.onChange(() => {
          handler();
          updateRunAvailability();
        });
    },
    onChange: () => {
      if (!editorSqlState.tabConnectionsView) return;
      const key = editorSqlState.tabConnectionsView.getActiveKey();
      if (key) saveTabsForKey(key);
      if (editorSqlState.tabTablesView) {
        const tabsState = editorSqlState.tabTablesView.getState();
        const ids = new Set((tabsState.tabs || []).map((t) => t.id));
        for (const id of editorSqlState.resultsByTabId.keys()) {
          if (!ids.has(id)) editorSqlState.resultsByTabId.delete(id);
        }
        for (const id of editorSqlState.outputByTabId.keys()) {
          if (!ids.has(id)) editorSqlState.outputByTabId.delete(id);
        }
        for (const id of editorSqlState.tableFilterByTabId.keys()) {
          if (!ids.has(id)) editorSqlState.tableFilterByTabId.delete(id);
        }
        for (const id of editorSqlState.objectContextByTabId.keys()) {
          if (!ids.has(id)) editorSqlState.objectContextByTabId.delete(id);
        }
        for (const id of editorSqlState.pendingEditsByTabId.keys()) {
          if (!ids.has(id)) editorSqlState.pendingEditsByTabId.delete(id);
        }
      }
    },
    onActiveChange: (id) => {
      if (!id) {
        applyResultsPanelState({ snapshot: null, objectContext: null });
        setOutputDisplay(null);
        if (queryFilter) queryFilter.value = "";
        updateQueryFilterClearVisibility();
        return;
      }
      const activeTab = editorSqlState.tabTablesView
        ? editorSqlState.tabTablesView.getActiveTab()
        : null;
      if (activeTab) {
        const visible = resolveEditorVisibility();
        activeTab.editorVisible = visible;
        setEditorVisible(visible, { persist: false });
      } else {
        setEditorVisible(true, { persist: false });
      }
      const snapshot = editorSqlState.resultsByTabId.get(id) || null;
      const objectContext = getObjectContextForTab(id);
      applyResultsPanelState({ snapshot, objectContext });
      if (queryFilter) queryFilter.value = readActiveTableFilter();
      updateQueryFilterClearVisibility();
      updateRunAvailability();
      updateOutputForActiveTab();
    },
  });
  if (newTabBtn) {
    newTabBtn.addEventListener("click", () => {
      setEditorVisible(true);
    });
  }
  editorSqlState.historyManager = createQueryHistory({
    historyList,
    getCurrentHistoryKey,
    getActiveTab: () =>
      editorSqlState.tabTablesView
        ? editorSqlState.tabTablesView.getActiveTab()
        : null,
    isTableTab: () => false,
    isTableEditor: () => true,
    createNewQueryTab: (sql) => {
      if (!editorSqlState.tabTablesView) return;
      editorSqlState.tabTablesView.create();
      setEditorVisible(true);
      if (editorSqlState.codeEditor)
        editorSqlState.codeEditor.setValue(sql || "");
      if (editorSqlState.tabTablesView)
        editorSqlState.tabTablesView.syncActiveTabContent();
    },
    setQueryValue: (sql) => {
      if (editorSqlState.codeEditor)
        editorSqlState.codeEditor.setValue(sql || "");
      if (editorSqlState.tabTablesView)
        editorSqlState.tabTablesView.syncActiveTabContent();
    },
    listHistory: (payload) => historyApi.listHistory(payload),
    recordHistory: (payload) => historyApi.recordHistory(payload),
    showError: safeApi.showError,
  });
  editorSqlState.snippetsManager = createSnippetsManager({
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
      editorSqlState.snippetEditor
        ? editorSqlState.snippetEditor.getValue()
        : snippetQueryInput
          ? snippetQueryInput.value
          : "",
    setSnippetValue: (value) => {
      if (editorSqlState.snippetEditor) {
        editorSqlState.snippetEditor.setValue(value || "");
        editorSqlState.snippetEditor.refresh();
      } else if (snippetQueryInput) {
        snippetQueryInput.value = value || "";
      }
    },
    getCurrentHistoryKey,
    setQueryValue: (sql) => {
      if (editorSqlState.codeEditor)
        editorSqlState.codeEditor.setValue(sql || "");
      if (editorSqlState.tabTablesView)
        editorSqlState.tabTablesView.syncActiveTabContent();
    },
    createNewQueryTab: (sql) => {
      if (!editorSqlState.tabTablesView) return;
      editorSqlState.tabTablesView.create();
      setEditorVisible(true);
      if (editorSqlState.codeEditor)
        editorSqlState.codeEditor.setValue(sql || "");
      if (editorSqlState.tabTablesView)
        editorSqlState.tabTablesView.syncActiveTabContent();
    },
    runSnippet: async (sql) => {
      const text = String(sql || "").trim();
      if (!text) return;
      if (editorSqlState.codeEditor) editorSqlState.codeEditor.setValue(text);
      if (editorSqlState.tabTablesView)
        editorSqlState.tabTablesView.syncActiveTabContent();
      editorSqlState.lastSort = null;
      await runSql(text);
    },
    listSnippets: (payload) => snippetsApi.listSnippets(payload),
    saveSnippet: (payload) => snippetsApi.saveSnippet(payload),
    deleteSnippet: (payload) => snippetsApi.deleteSnippet(payload),
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
    if (editorSqlState.lastSort && editorSqlState.lastSort.column === column) {
      if (editorSqlState.lastSort.direction === "asc") {
        editorSqlState.lastSort = { column, direction: "desc" };
        const orderSql = buildOrderBy(base, column, "desc");
        if (orderSql) await runSql(orderSql);
        return;
      }
      if (editorSqlState.lastSort.direction === "desc") {
        editorSqlState.lastSort = null;
        await runSql(base);
        return;
      }
    }
    editorSqlState.lastSort = { column, direction: "asc" };
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

    const activeTab = editorSqlState.tabTablesView
      ? editorSqlState.tabTablesView.getActiveTab()
      : null;
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

  const canEditResultCell = () => {
    const capability = getEditCapability();
    if (!capability.ok) {
      return { ok: false, reason: capability.reason || "Edits unavailable" };
    }
    return { ok: true };
  };

  const handleResultCellEdit = ({
    rowIndex,
    column,
    rawValue,
    row,
    previousValue,
  }) => {
    const tabId = getActiveTabId();
    if (!tabId) {
      return { ok: false, message: "Open a table first." };
    }
    const capability = getEditCapability();
    if (!capability.ok) {
      return { ok: false, message: capability.reason || "Edits unavailable." };
    }
    const active = editorSqlState.tableView
      ? editorSqlState.tableView.getActive()
      : null;
    if (!active || !Array.isArray(active.rows)) {
      return { ok: false, message: "No rows to edit." };
    }
    const editState = ensurePendingEditsForTab(tabId, active.rows);
    if (!editState) {
      return { ok: false, message: "Unable to track edits." };
    }
    const baseRow = editState.baselineRows[rowIndex];
    if (!baseRow || !row) {
      return { ok: false, message: "Row not available." };
    }
    const originalValue = getRowValueForColumn(baseRow, column);
    const nextValue = coerceEditedValue(rawValue, originalValue);
    const changed = !valuesEqual(originalValue, nextValue);

    if (changed) {
      row[column] = nextValue;
      let rowChanges = editState.changesByRow.get(rowIndex);
      if (!rowChanges) {
        rowChanges = new Map();
        editState.changesByRow.set(rowIndex, rowChanges);
      }
      rowChanges.set(String(column), {
        from: originalValue,
        to: nextValue,
      });
    } else {
      row[column] = originalValue;
      const rowChanges = editState.changesByRow.get(rowIndex);
      if (rowChanges) {
        rowChanges.delete(String(column));
        if (rowChanges.size === 0) editState.changesByRow.delete(rowIndex);
      }
    }

    updateApplyEditsButton();
    return {
      ok: true,
      displayValue:
        row[column] === null || row[column] === undefined
          ? ""
          : String(row[column]),
      previousValue,
    };
  };

  const getResultCellEditState = (rowIndex, column) => {
    const tabId = getActiveTabId();
    if (!tabId) return false;
    return getPendingCellState(tabId, rowIndex, column);
  };

  const handleResultsSelectionChange = (payload) => {
    setSelectedResultRow(payload);
  };

  editorSqlState.tableView = createTableView({
    resultsTable,
    resultsEmptyState,
    tableActionsBar,
    copyCellBtn,
    copyRowBtn,
    exportToggle,
    exportMenu,
    exportCsvBtn,
    exportJsonBtn,
    onShowError: safeApi.showError,
    onToast: (message) => editorSqlState.showToast(message),
    onSort: rerunSortedQuery,
    onOpenForeignKey: openForeignKeyLookup,
    canEditCell: canEditResultCell,
    onCellEdit: handleResultCellEdit,
    getCellEditState: getResultCellEditState,
    onSelectionChange: handleResultsSelectionChange,
  });
  updateApplyEditsButton();
  editorSqlState.tableObjectTabsView = createTableObjectTabs({
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
    onToast: (message) => editorSqlState.showToast(message),
  });
  editorSqlState.tabConnectionsView = createTabConnections({
    container: tabConnections,
    getTitle: (entry) => connectionTitle(entry),
    onSelect: (_key, entry, previousKey) => {
      activateConnection(entry, previousKey);
    },
    onClose: async (key) => {
      if (!editorSqlState.tabConnectionsView) return;
      const wasActive =
        editorSqlState.tabConnectionsView.getActiveKey() === key;
      editorSqlState.tabConnectionsView.remove(key);
      renderConnectionTabs();
      if (editorSqlState.tabConnectionsView.size() === 0) {
        try {
          await safeApi.disconnect();
        } catch (_) {}
        setScreen(false);
        updateToggleEditorButtonState(true);
        return;
      }
      if (wasActive) {
        const next = editorSqlState.tabConnectionsView.getFirstEntry();
        if (next) {
          await activateConnection(next);
        }
      }
    },
  });
  renderSavedList();
}
