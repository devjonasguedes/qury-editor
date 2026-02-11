export const STORAGE_KEYS = Object.freeze({
  SIDEBAR_KEY: "sqlEditor.sidebarWidth",
  EDITOR_HEIGHT_KEY: "sqlEditor.editorHeight",
  EDITOR_FONT_SIZE_KEY: "sqlEditor.editorFontSize",
  EDITOR_COLLAPSED_KEY_PREFIX: "sqlEditor.editorCollapsed",
  QUERY_DEFAULT_LIMIT_KEY: "sqlEditor.defaultLimit",
  QUERY_DEFAULT_TIMEOUT_KEY: "sqlEditor.defaultTimeout",
  SESSION_TIMEZONE_KEY: "sqlEditor.sessionTimezone",
  CONNECTION_OPEN_TIMEOUT_KEY: "sqlEditor.connectionOpenTimeoutMs",
  CONNECTION_CLOSE_TIMEOUT_KEY: "sqlEditor.connectionCloseTimeoutMs",
  CONNECTION_VALIDATION_TIMEOUT_KEY: "sqlEditor.connectionValidationTimeoutMs",
  ERROR_STOP_ON_FIRST_KEY: "sqlEditor.errorStopOnFirst",
  ERROR_CONTINUE_ON_ERROR_KEY: "sqlEditor.errorContinueOnError",
  ERROR_AUTO_OPEN_OUTPUT_KEY: "sqlEditor.errorAutoOpenOutput",
  ERROR_SHOW_DETAILED_CODE_KEY: "sqlEditor.errorShowDetailedCode",
  ERROR_HIDE_SENSITIVE_KEY: "sqlEditor.errorHideSensitive",
  ERROR_RETRY_TRANSIENT_KEY: "sqlEditor.errorRetryTransient",
});

export const QUERY_DEFAULTS = Object.freeze({
  limit: "100",
  timeoutMs: "30000",
});

export const CONNECTION_TIMEOUT_DEFAULTS = Object.freeze({
  openMs: "10000",
  closeMs: "5000",
  validationMs: "10000",
});

export const ERROR_HANDLING_DEFAULTS = Object.freeze({
  stopOnFirstError: true,
  continueOnError: false,
  autoOpenOutputOnError: true,
  showDetailedDbErrorCode: true,
  hideSensitiveValuesInErrors: true,
  retryTransientSelectErrors: false,
});

export const DEFAULT_SESSION_TIMEZONE = "UTC";
export const SESSION_TIMEZONE_SYSTEM = "SYSTEM";
export const SESSION_TIMEZONE_SYSTEM_LABEL = "Use system timezone";

export const QUERY_PROGRESS_SHOW_DELAY_MS = 5000;
export const SERVER_PAGE_SIZE_DEFAULT = 100;
export const SERVER_PAGE_SIZE_MAX = 1000;

export const EDITOR_FONT_SIZE_DEFAULTS = Object.freeze({
  DEFAULT: 14,
  MIN: 12,
  MAX: 16,
});
