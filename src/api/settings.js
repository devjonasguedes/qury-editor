// Simple backend-like wrapper for settings
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
  if (res?.ok === false) throw new Error(res.error || "API error");
  if (res?.ok === true) return res.data ?? res;
  return res?.data ?? res;
}

/**
 * API for settings
 * @type {Object}
 * @property {Function} getPolicySettings - Gets policy settings
 * @property {Function} savePolicySettings - Saves policy settings
 * @param {Object} payload - Policy payload
 */
export const settingsApi = {
  getPolicySettings: call("getPolicySettings"),
  savePolicySettings: call("savePolicySettings"),
};

export default settingsApi;
