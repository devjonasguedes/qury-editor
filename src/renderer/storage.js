export function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function readJson(key, fallback) {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return safeJsonParse(raw, fallback);
  } catch (_) {
    return fallback;
  }
}

export function writeJson(key, value) {
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export function removeKeysByPrefix(prefix, { exclude = [] } = {}) {
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

export function createScopedStorage(prefix, getScopeKey) {
  const buildKey = () => {
    const scope = typeof getScopeKey === 'function' ? getScopeKey() : null;
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
    writeList
  };
}
