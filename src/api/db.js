// Simple backend-like wrapper for database actions
import { apiService } from "../services/apiService.js";

function invoke(method, options, ...args) {
  const db = apiService.db;
  if (typeof db[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  const res = db[method](...args);
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
  connect: call("connect"),
  disconnect: call("disconnect"),
  testConnection: call("testConnection"),
  runQuery: call("runQuery"),
  cancelQuery: call("cancelQuery"),
  listTables: call("listTables"),
  listTablesRaw: call("listTables", { raw: true }),
  listRoutines: call("listRoutines"),
  listRoutinesRaw: call("listRoutines", { raw: true }),
  listColumns: call("listColumns"),
  listColumnsRaw: call("listColumns", { raw: true }),
  listTableInfo: call("listTableInfo"),
  listTableInfoRaw: call("listTableInfo", { raw: true }),
  getViewDefinition: call("getViewDefinition"),
  getTableDefinition: call("getTableDefinition"),
  listDatabases: call("listDatabases"),
  useDatabase: call("useDatabase"),
  setSessionTimezone: call("setSessionTimezone"),
  openSqliteFile: call("openSqliteFile", { raw: true }),
  saveSqliteFile: call("saveSqliteFile", { raw: true }),
};

export default dbApi;
