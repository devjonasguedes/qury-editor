// Simple backend-like wrapper for saved connections
import { apiService } from "../services/apiService.js";

function invoke(method, ...args) {
  const db = apiService.db;
  if (typeof db[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return db[method](...args).then(normalizeResponse);
}

const call = (method) => (...args) => invoke(method, ...args);

function normalizeResponse(res) {
  if (Array.isArray(res)) return res;
  if (res?.ok === false) throw new Error(res.error || "API error");
  if (res?.ok === true) return res.data ?? [];
  return res?.data ?? res;
}

/**
 * API for managing database connections
 * @type {Object}
 * @property {Function} getConnections - Retrieves all saved connections
 * @property {Function} saveConnection - Saves a new connection entry
 * @param {Object} entry - The connection entry to save
 * @property {Function} deleteConnection - Deletes a connection by name
 * @param {string} name - The name of the connection to delete
 * @property {Function} touchConnection - Updates the last accessed time of a connection
 * @param {string} name - The name of the connection to touch
 * @property {Function} exportConnections - Exports all saved connections
 * @property {Function} importConnections - Imports connections from a source
 */
export const connectionsApi = {
  getConnections: call("listSavedConnections"),
  saveConnection: call("saveConnection"),
  deleteConnection: call("deleteConnection"),
  touchConnection: call("touchConnection"),
  exportConnections: call("exportSavedConnections"),
  importConnections: call("importSavedConnections"),
};

export default connectionsApi;
