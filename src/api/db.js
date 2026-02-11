// Simple backend-like wrapper for database actions
import { apiService } from "../services/apiService.js";

function call(method, ...args) {
  const db = apiService.db;
  if (typeof db[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return db[method](...args).then(normalizeResponse);
}

function callRaw(method, ...args) {
  const db = apiService.db;
  if (typeof db[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return db[method](...args);
}

function normalizeResponse(res) {
  if (res?.ok === false) throw new Error(res.error || "API error");
  if (res?.ok === true) return res.data ?? res;
  return res?.data ?? res;
}

/**
 * API for database operations
 * @type {Object}
 * @property {Function} connect - Connects to a database
 * @param {Object} config - Connection configuration
 * @property {Function} disconnect - Disconnects from the database
 * @property {Function} testConnection - Tests a connection configuration
 * @param {Object} config - Connection configuration
 * @property {Function} runQuery - Runs a query
 * @param {Object} payload - Query payload
 * @property {Function} cancelQuery - Cancels a running query
 * @property {Function} listTables - Lists tables
 * @property {Function} listRoutines - Lists routines
 * @property {Function} listColumns - Lists columns
 * @param {Object} payload - Table payload
 * @property {Function} listTableInfo - Lists table info
 * @param {Object} payload - Table payload
 * @property {Function} getViewDefinition - Gets a view definition
 * @param {Object} payload - View payload
 * @property {Function} getTableDefinition - Gets a table definition
 * @param {Object} payload - Table payload
 * @property {Function} listDatabases - Lists databases
 * @property {Function} useDatabase - Switches database
 * @param {string} name - Database name
 * @property {Function} setSessionTimezone - Sets session timezone
 * @param {Object} payload - Timezone payload
 * @property {Function} openSqliteFile - Opens a SQLite file dialog
 * @property {Function} saveSqliteFile - Opens a SQLite save dialog
 */
export const dbApi = {
  connect: (config) => call("connect", config),
  disconnect: () => call("disconnect"),
  testConnection: (config) => call("testConnection", config),
  runQuery: (payload) => call("runQuery", payload),
  cancelQuery: () => call("cancelQuery"),
  listTables: () => call("listTables"),
  listRoutines: () => call("listRoutines"),
  listColumns: (payload) => call("listColumns", payload),
  listTableInfo: (payload) => call("listTableInfo", payload),
  getViewDefinition: (payload) => call("getViewDefinition", payload),
  getTableDefinition: (payload) => call("getTableDefinition", payload),
  listDatabases: () => call("listDatabases"),
  useDatabase: (name) => call("useDatabase", name),
  setSessionTimezone: (payload) => call("setSessionTimezone", payload),
  openSqliteFile: () => callRaw("openSqliteFile"),
  saveSqliteFile: () => callRaw("saveSqliteFile"),
};

export default dbApi;
