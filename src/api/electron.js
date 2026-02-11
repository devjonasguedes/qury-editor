// Simple backend-like wrapper for Electron app/system actions
import { apiService } from "../services/apiService.js";

function invoke(method, options, ...args) {
  const electron = apiService.electron;
  if (typeof electron[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  const res = electron[method](...args);
  if (options && options.raw) return res;
  return res.then(normalizeResponse);
}

const call = (method, options) => (...args) => invoke(method, options, ...args);

function normalizeResponse(res) {
  if (res?.ok === false) throw new Error(res.error || "API error");
  if (res?.ok === true) return res.data ?? res;
  return res?.data ?? res;
}

/**
 * API for Electron app/system operations
 * @type {Object}
 * @property {Function} setProgressBar - Sets the window progress bar
 * @param {number} value - Progress value
 * @property {Function} getNativeTheme - Gets native theme snapshot
 * @property {Function} onNativeThemeUpdated - Subscribes to theme updates
 * @param {Function} handler - Theme update handler
 * @property {Function} openExternal - Opens an external URL
 * @param {string} url - URL to open
 * @property {Function} showError - Shows an error dialog
 * @param {string} message - Error message
 */
export const electronApi = {
  setProgressBar: call("setProgressBar"),
  getNativeTheme: call("getNativeTheme"),
  onNativeThemeUpdated: call("onNativeThemeUpdated", { raw: true }),
  openExternal: call("openExternal"),
  showError: call("showError"),
};

export default electronApi;
