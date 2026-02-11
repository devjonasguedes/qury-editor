// Simple backend-like wrapper for snippets
import { apiService } from "../services/apiService.js";

function call(method, ...args) {
  const db = apiService.db;
  if (typeof db[method] !== "function") {
    throw new Error(`API method "${method}" unavailable`);
  }
  return db[method](...args).then(normalizeResponse);
}

function normalizeResponse(res) {
  if (Array.isArray(res)) return res;
  if (res?.ok === false) throw new Error(res.error || "API error");
  if (res?.ok === true) return res.data ?? [];
  return res?.data ?? res;
}

/**
 * API for snippets
 * @type {Object}
 * @property {Function} listSnippets - Lists snippets
 * @param {Object} payload - List filter payload
 * @property {Function} saveSnippet - Saves a snippet
 * @param {Object} payload - Snippet payload
 * @property {Function} deleteSnippet - Deletes a snippet
 * @param {Object} payload - Delete payload
 */
export const snippetsApi = {
  listSnippets: (payload) => call("listSnippets", payload),
  saveSnippet: (payload) => call("saveSnippet", payload),
  deleteSnippet: (payload) => call("deleteSnippet", payload),
};

export default snippetsApi;
