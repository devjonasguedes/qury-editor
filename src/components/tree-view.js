import { dbApi } from "../api/db.js";
import { dialogsApi } from "../api/dialogs.js";
import { renderTableTree, resetTreeDataCache } from "../tree.js";

export function createTreeView({
  tableList,
  tableSearch,
  tableSearchModeBtn,
  tableSearchClear,
  getActiveConnectionKey,
  getActiveConnection,
  onOpenTable,
  onOpenView,
  onToast,
}) {
  let tableCache = [];
  let routineCache = [];
  let treeExpanded = {};
  let activeSchema = "";
  const searchByConnection = new Map();
  const searchModeByConnection = new Map();
  let objectSearchCache = new Map();
  let objectSearchPending = new Map();
  let searchDebounceTimer = null;
  let objectSearchSeq = 0;
  const DEFAULT_SEARCH_KEY = "__default__";
  const SEARCH_MODE_NAME = "name";
  const SEARCH_MODE_OBJECTS = "objects";
  const OBJECT_SEARCH_DEBOUNCE_MS = 220;
  const OBJECT_SEARCH_MAX_MATCHES = 200;
  const OBJECT_SEARCH_CONCURRENCY = 4;

  const activeSearchKey = () => {
    if (typeof getActiveConnectionKey === "function") {
      const key = getActiveConnectionKey();
      if (key) return String(key);
    }
    return DEFAULT_SEARCH_KEY;
  };

  const normalizeSchemaName = (value) => String(value || "").trim().toLowerCase();

  const showError = async (message) => {
    try {
      await dialogsApi.showError(message);
    } catch (err) {
      console.error("API unavailable:", err);
      if (message && onToast) onToast(message, 1600, "error");
    }
  };

  const getSearchFilter = () => {
    const key = activeSearchKey();
    return searchByConnection.has(key)
      ? String(searchByConnection.get(key) || "")
      : "";
  };

  const setSearchFilter = (value) => {
    const key = activeSearchKey();
    searchByConnection.set(key, String(value || ""));
  };

  const getSearchMode = () => {
    const key = activeSearchKey();
    return searchModeByConnection.get(key) || SEARCH_MODE_NAME;
  };

  const setSearchMode = (mode) => {
    const key = activeSearchKey();
    const next = mode === SEARCH_MODE_OBJECTS ? SEARCH_MODE_OBJECTS : SEARCH_MODE_NAME;
    searchModeByConnection.set(key, next);
  };

  const updateSearchClearState = () => {
    if (!tableSearchClear) return;
    const hasValue = !!(tableSearch && tableSearch.value && tableSearch.value.trim());
    tableSearchClear.classList.toggle("visible", hasValue);
  };

  const syncSearchModeUi = () => {
    const objectMode = getSearchMode() === SEARCH_MODE_OBJECTS;
    if (tableSearch) {
      tableSearch.placeholder = objectMode
        ? "Type text to search objects..."
        : "Search tables...";
    }
    if (tableSearchModeBtn) {
      tableSearchModeBtn.classList.toggle("active", objectMode);
      tableSearchModeBtn.title = objectMode
        ? "Search mode: objects"
        : "Search mode: names";
      const icon = tableSearchModeBtn.querySelector("i");
      if (icon) {
        icon.className = objectMode ? "bi bi-boxes" : "bi bi-funnel";
      }
    }
  };

  const syncSearchInput = () => {
    const filter = getSearchFilter();
    if (tableSearch && tableSearch.value !== filter) {
      tableSearch.value = filter;
    }
    updateSearchClearState();
    syncSearchModeUi();
    return filter;
  };

  const rowField = (row, fields) => {
    if (!row || typeof row !== "object") return "";
    for (const field of fields) {
      const value = row[field];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  };

  const normalizeSearchText = (value) => String(value || "").toLowerCase();
  const tokenizeSearchText = (value) =>
    normalizeSearchText(value).split(/\s+/).filter(Boolean);
  const matchesSearchTokens = (text, tokens) => {
    if (!Array.isArray(tokens) || tokens.length === 0) return true;
    const normalized = normalizeSearchText(text);
    return tokens.every((token) => normalized.includes(token));
  };

  const getTableSchema = (row) =>
    rowField(row, ["table_schema", "schema", "table_schema_name"]) ||
    activeSchema ||
    "";
  const getTableName = (row) => rowField(row, ["table_name", "name", "table"]) || "";
  const getRoutineName = (row) => rowField(row, ["routine_name", "name", "routine"]) || "";
  const getTableKey = (schema, table) =>
    `${String(schema || "").toLowerCase()}.${String(table || "").toLowerCase()}`;

  const emptyTableInfo = () => ({ indexes: [], constraints: [], triggers: [] });

  const collectTableTokens = (schema, table, columns, info) => {
    const tokens = [schema, table];
    (columns || []).forEach((col) => {
      tokens.push(
        rowField(col, ["column_name", "name"]),
        rowField(col, ["data_type", "type"]),
      );
    });
    const indexes = Array.isArray(info && info.indexes) ? info.indexes : [];
    indexes.forEach((idx) => {
      tokens.push(idx.name, idx.method);
      (idx.columns || []).forEach((col) => tokens.push(col));
    });
    const constraints = Array.isArray(info && info.constraints) ? info.constraints : [];
    constraints.forEach((constraint) => {
      tokens.push(constraint.name, constraint.type, constraint.definition);
      (constraint.columns || []).forEach((col) => tokens.push(col));
      const ref = constraint.ref || {};
      tokens.push(ref.schema, ref.table);
      (ref.columns || []).forEach((col) => tokens.push(col));
    });
    const triggers = Array.isArray(info && info.triggers) ? info.triggers : [];
    triggers.forEach((trigger) => {
      tokens.push(trigger.name, trigger.timing, trigger.event);
    });
    return normalizeSearchText(tokens.filter(Boolean).join(" "));
  };

  const loadTableSearchText = async (row, queryTokens = []) => {
    const schema = getTableSchema(row);
    const table = getTableName(row);
    if (!table) return "";
    const key = getTableKey(schema, table);
    const tokens = Array.isArray(queryTokens)
      ? queryTokens
      : tokenizeSearchText(queryTokens);
    const cached = objectSearchCache.get(key);
    if (cached && cached.complete) return cached.text;
    if (cached && matchesSearchTokens(cached.text, tokens)) return cached.text;
    if (objectSearchPending.has(key)) {
      const pending = await objectSearchPending.get(key);
      const pendingCached = objectSearchCache.get(key);
      if (
        pendingCached &&
        (pendingCached.complete || matchesSearchTokens(pendingCached.text, tokens))
      ) {
        return pendingCached.text;
      }
      if (tokens.length === 0) return pending;
    }
    const loader = (async () => {
      const columnsRes = await dbApi.listColumnsRaw({ schema, table });
      const columns = columnsRes && columnsRes.ok ? columnsRes.columns || [] : [];
      const partialText = collectTableTokens(schema, table, columns, emptyTableInfo());
      objectSearchCache.set(key, { text: partialText, complete: false });
      if (matchesSearchTokens(partialText, tokens)) return partialText;

      const infoRes = await dbApi.listTableInfoRaw({ schema, table });
      const info = infoRes && infoRes.ok ? infoRes : emptyTableInfo();
      const fullText = collectTableTokens(schema, table, columns, info);
      objectSearchCache.set(key, { text: fullText, complete: true });
      return fullText;
    })()
      .catch(() => {
        const fallback = normalizeSearchText([schema, table].filter(Boolean).join(" "));
        objectSearchCache.set(key, { text: fallback, complete: false });
        return fallback;
      })
      .finally(() => {
        objectSearchPending.delete(key);
      });
    objectSearchPending.set(key, loader);
    return loader;
  };

  const cancelObjectSearch = () => {
    objectSearchSeq += 1;
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
  };

  const quoteIdentifier = (name, type) => {
    if (!name) return name;
    const parts = String(name).split(".");
    if (type === "postgres" || type === "postgresql") {
      return parts
        .map((p) => (p.startsWith("\"") ? p : `"${p.replace(/"/g, '""')}"`))
        .join(".");
    }
    return parts
      .map((p) => (p.startsWith("`") ? p : `\`${p.replace(/`/g, "``")}\``))
      .join(".");
  };

  const buildQualified = (schema, name, type) => {
    if (!schema) return quoteIdentifier(name, type);
    return `${quoteIdentifier(schema, type)}.${quoteIdentifier(name, type)}`;
  };

  const runOpenTable = async (schema, name, options = {}) => {
    if (onOpenTable) {
      const conn =
        typeof getActiveConnection === "function" ? getActiveConnection() : null;
      const type = conn && conn.type ? conn.type : "mysql";
      const qualified = buildQualified(schema, name, type);
      const sql = `SELECT * FROM ${qualified};`;
      onOpenTable(schema, name, sql, options);
    }
  };

  const runOpenView = async (schema, name) => {
    if (onOpenView) {
      await onOpenView(schema, name);
      return;
    }
    await runOpenTable(schema, name);
  };

  const runOpenRoutine = async (schema, name, routineType, options = {}) => {
    if (onOpenTable) {
      const conn =
        typeof getActiveConnection === "function" ? getActiveConnection() : null;
      const type = conn && conn.type ? conn.type : "mysql";
      const qualified = buildQualified(schema, name, type);
      const isProcedure = String(routineType || "").toUpperCase() === "PROCEDURE";
      const sql = isProcedure ? `CALL ${qualified}();` : `SELECT ${qualified}();`;
      onOpenTable(schema, name, sql, options);
    }
  };

  const render = (filterText = "", options = {}) => {
    const {
      tableRows = tableCache,
      routineRows = routineCache,
      skipNameFilter = false,
      highlightText = "",
    } = options;
    renderTableTree({
      tableList,
      tableCache: tableRows,
      routineCache: routineRows,
      filterText,
      highlightText: highlightText || filterText,
      skipNameFilter,
      activeSchema,
      onOpenTable: runOpenTable,
      onOpenView: runOpenView,
      onOpenRoutine: runOpenRoutine,
      listColumns: (payload) => dbApi.listColumnsRaw(payload),
      listTableInfo: (payload) => dbApi.listTableInfoRaw(payload),
      onShowError: showError,
      expandedState: treeExpanded,
      onToggleExpand: (key, expanded) => {
        treeExpanded[key] = expanded;
      },
      onCopyName: async (name) => {
        if (!name) return;
        try {
          await navigator.clipboard.writeText(name);
          if (onToast) onToast("Copied name");
        } catch (_) {
          await showError("Unable to copy.");
        }
      },
      onCopyQualified: async (schema, name) => {
        if (!name) return;
        const conn =
          typeof getActiveConnection === "function" ? getActiveConnection() : null;
        const type = conn && conn.type ? conn.type : "mysql";
        const qualified = buildQualified(schema, name, type);
        try {
          await navigator.clipboard.writeText(qualified);
          if (onToast) onToast("Copied qualified name");
        } catch (_) {
          await showError("Unable to copy.");
        }
      },
    });
  };

  const runObjectSearch = async (filterText) => {
    const tokens = tokenizeSearchText(filterText);
    if (tokens.length === 0) {
      render("");
      return;
    }
    const seq = ++objectSearchSeq;
    const routines = (routineCache || []).filter((row) =>
      matchesSearchTokens(getRoutineName(row), tokens),
    );
    const tables = Array.isArray(tableCache) ? tableCache : [];
    const matched = [];
    const matchedKeys = new Set();

    tables.forEach((row) => {
      if (matched.length >= OBJECT_SEARCH_MAX_MATCHES) return;
      const schema = getTableSchema(row);
      const table = getTableName(row);
      if (!table) return;
      const key = getTableKey(schema, table);
      if (matchesSearchTokens(table, tokens)) {
        matched.push(row);
        matchedKeys.add(key);
      }
    });

    let cursor = 0;
    const nextCandidate = () => {
      while (cursor < tables.length) {
        const row = tables[cursor++];
        const schema = getTableSchema(row);
        const table = getTableName(row);
        const key = getTableKey(schema, table);
        if (!table || matchedKeys.has(key)) continue;
        return row;
      }
      return null;
    };

    const worker = async () => {
      while (matched.length < OBJECT_SEARCH_MAX_MATCHES) {
        if (seq !== objectSearchSeq) return;
        const row = nextCandidate();
        if (!row) return;
        const schema = getTableSchema(row);
        const table = getTableName(row);
        const key = getTableKey(schema, table);
        const searchText = await loadTableSearchText(row, tokens);
        if (seq !== objectSearchSeq) return;
        if (matchesSearchTokens(searchText, tokens)) {
          matched.push(row);
          matchedKeys.add(key);
        }
      }
    };

    const workers = [];
    const workerCount = Math.min(
      OBJECT_SEARCH_CONCURRENCY,
      Math.max(1, tables.length),
    );
    for (let i = 0; i < workerCount; i += 1) workers.push(worker());
    await Promise.all(workers);
    if (seq !== objectSearchSeq) return;
    render(filterText, {
      tableRows: matched,
      routineRows: routines,
      skipNameFilter: true,
      highlightText: filterText,
    });
  };

  const scheduleObjectSearch = (filterText) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      runObjectSearch(filterText);
    }, OBJECT_SEARCH_DEBOUNCE_MS);
  };

  const runSearch = async (filterText) => {
    const objectMode = getSearchMode() === SEARCH_MODE_OBJECTS;
    if (!objectMode) {
      cancelObjectSearch();
      render(filterText);
      return;
    }
    if (!String(filterText || "").trim()) {
      cancelObjectSearch();
      render("");
      return;
    }
    scheduleObjectSearch(filterText);
  };

  const refresh = async () => {
    if (!tableList) return;
    const resTables = await dbApi.listTablesRaw();
    if (!resTables || !resTables.ok) {
      tableCache = [];
      await showError((resTables && resTables.error) || "Failed to list tables.");
    } else {
      tableCache = resTables.rows || [];
    }

    const resRoutines = await dbApi.listRoutinesRaw();
    if (resRoutines && resRoutines.ok) {
      routineCache = resRoutines.rows || [];
    } else {
      routineCache = [];
      if (!resRoutines || !resRoutines.ok) {
        await showError((resRoutines && resRoutines.error) || "Failed to list routines.");
      }
    }

    resetTreeDataCache();
    objectSearchCache = new Map();
    objectSearchPending = new Map();
    const filter = syncSearchInput();
    await runSearch(filter);
    return tableCache;
  };

  const setActiveSchema = (schema) => {
    activeSchema = schema || "";
    const normalizedActive = normalizeSchemaName(activeSchema);
    const nextExpanded = {};
    Object.keys(treeExpanded || {}).forEach((key) => {
      if (!key.startsWith("db:")) {
        nextExpanded[key] = treeExpanded[key];
        return;
      }
      const schemaName = key.slice(3);
      nextExpanded[key] =
        !!normalizedActive && normalizeSchemaName(schemaName) === normalizedActive;
    });
    if (normalizedActive) {
      const hasActiveKey = Object.keys(nextExpanded).some(
        (key) => key.startsWith("db:") && nextExpanded[key],
      );
      if (!hasActiveKey) {
        const fallbackKey = Object.keys(treeExpanded || {}).find(
          (key) =>
            key.startsWith("db:") &&
            normalizeSchemaName(key.slice(3)) === normalizedActive,
        );
        if (fallbackKey) nextExpanded[fallbackKey] = true;
      }
    }
    treeExpanded = nextExpanded;
    const filter = syncSearchInput();
    runSearch(filter);
  };

  const clear = () => {
    cancelObjectSearch();
    tableCache = [];
    routineCache = [];
    treeExpanded = {};
    objectSearchCache = new Map();
    objectSearchPending = new Map();
    render("", {
      tableRows: [],
      routineRows: [],
      skipNameFilter: true,
      highlightText: "",
    });
  };

  const bindSearch = () => {
    if (tableSearch) {
      tableSearch.addEventListener("input", () => {
        setSearchFilter(tableSearch.value);
        updateSearchClearState();
        runSearch(tableSearch.value);
      });
    }

    if (tableSearchModeBtn) {
      tableSearchModeBtn.addEventListener("click", () => {
        const current = getSearchMode();
        const next = current === SEARCH_MODE_OBJECTS ? SEARCH_MODE_NAME : SEARCH_MODE_OBJECTS;
        setSearchMode(next);
        syncSearchModeUi();
        const filter = tableSearch ? tableSearch.value : getSearchFilter();
        runSearch(filter);
      });
    }

    if (tableSearchClear) {
      tableSearchClear.addEventListener("click", () => {
        setSearchFilter("");
        if (tableSearch) tableSearch.value = "";
        updateSearchClearState();
        runSearch("");
      });
    }
  };

  bindSearch();
  syncSearchInput();

  return {
    refresh,
    render,
    setActiveSchema,
    clear,
  };
}
