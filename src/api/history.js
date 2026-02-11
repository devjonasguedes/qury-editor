// Simple backend-like wrapper for query history
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
 * API for query history
 * @type {Object}
 * @property {Function} listHistory - Lists history entries
 * @param {Object} payload - List filter payload
 * @property {Function} recordHistory - Records a history entry
 * @param {Object} payload - History payload
 */
export const historyApi = {
  listHistory: call("listHistory"),
  recordHistory: call("recordHistory"),
};

export default historyApi;
