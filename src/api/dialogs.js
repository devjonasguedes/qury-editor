// Simple backend-like wrapper for dialog actions
import { apiService } from "../services/apiService.js";

function callDbRaw(method, ...args) {
  const db = apiService.db;
  if (typeof db[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return db[method](...args);
}

function callElectron(method, ...args) {
  const electron = apiService.electron;
  if (typeof electron[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return electron[method](...args);
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
  openSqliteFile: () => callDbRaw("openSqliteFile"),
  saveSqliteFile: () => callDbRaw("saveSqliteFile"),
  showError: (message) => callElectron("showError", message),
};

export default dialogsApi;
