// Simple backend-like wrapper for dialog actions
import { apiService } from "../services/apiService.js";

function invoke(target, method, ...args) {
  const api = apiService[target];
  if (!api || typeof api[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return api[method](...args);
}

/**
 * API for dialog operations
 * @type {Object}
 * @property {Function} openSqliteFile - Opens a SQLite file dialog
 * @property {Function} saveSqliteFile - Opens a SQLite save dialog
 * @property {Function} showError - Shows an error dialog
 * @param {string} message - Error message
 */
export const dialogsApi = {
  openSqliteFile: () => invoke("db", "openSqliteFile"),
  saveSqliteFile: () => invoke("db", "saveSqliteFile"),
  showError: (message) => invoke("electron", "showError", message),
};

export default dialogsApi;
