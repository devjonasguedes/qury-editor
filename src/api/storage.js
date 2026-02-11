// Simple wrapper for local storage helpers
function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function readJson(key, fallback) {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return safeJsonParse(raw, fallback);
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

function removeKeysByPrefix(prefix, { exclude = [] } = {}) {
  const removed = [];
  if (!prefix) return removed;
  const excludeSet = new Set(exclude);
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith(prefix)) continue;
    if (excludeSet.has(key)) continue;
    removed.push(key);
  }
  removed.forEach((key) => localStorage.removeItem(key));
  return removed;
}

function createScopedStorage(prefix, getScopeKey) {
  const buildKey = () => {
    const scope = typeof getScopeKey === "function" ? getScopeKey() : null;
    if (!scope) return null;
    return `${prefix}:${scope}`;
  };

  const readList = (fallback = []) => {
    const key = buildKey();
    if (!key) return fallback;
    const data = readJson(key, fallback);
    return Array.isArray(data) ? data : fallback;
  };

  const writeList = (list) => {
    const key = buildKey();
    if (!key) return false;
    return writeJson(key, list);
  };

  return {
    buildKey,
    readList,
    writeList,
  };
}

/**
 * API for local storage helpers
 * @type {Object}
 * @property {Function} safeJsonParse - Parses JSON safely
 * @param {string} raw - Raw JSON string
 * @param {any} fallback - Fallback value
 * @property {Function} readJson - Reads JSON from localStorage
 * @param {string} key - Storage key
 * @param {any} fallback - Fallback value
 * @property {Function} writeJson - Writes JSON to localStorage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @property {Function} removeKeysByPrefix - Removes keys by prefix
 * @param {string} prefix - Key prefix
 * @param {Object} options - Options
 * @property {Function} createScopedStorage - Creates scoped storage helpers
 * @param {string} prefix - Key prefix
 * @param {Function} getScopeKey - Scope resolver
 */
export const storageApi = {
  safeJsonParse,
  readJson,
  writeJson,
  removeKeysByPrefix,
  createScopedStorage,
};

export default storageApi;
