import { getField, normalizeName } from '../utils.js';

export function createSqlAutocomplete({ api, getActiveConnection }) {
  let activeSchema = '';
  let tableRows = [];
  let tableIndex = new Map();
  let columnsByKey = new Map();
  let pendingColumns = new Map();
  let hintTables = {};

  const buildKey = (schema, table) => `${schema || ''}.${table || ''}`.toLowerCase();

  const rebuild = () => {
    tableIndex = new Map();
    hintTables = {};
    (tableRows || []).forEach((row) => {
      const schema = getField(row, ['table_schema', 'schema', 'table_schema_name']) || '';
      const name = getField(row, ['table_name', 'name', 'table']) || '';
      if (!name) return;
      const key = buildKey(schema, name);
      const columns = columnsByKey.get(key) || [];
      const qualified = schema ? `${schema}.${name}` : name;

      hintTables[qualified] = columns;
      if (!schema || schema === activeSchema) {
        hintTables[name] = columns;
      }

      tableIndex.set(normalizeName(qualified), { schema, table: name });
      if (!schema || schema === activeSchema) {
        tableIndex.set(normalizeName(name), { schema, table: name });
      }
    });
  };

  const setActiveSchema = (schema) => {
    activeSchema = schema || '';
    rebuild();
  };

  const setTables = (rows) => {
    tableRows = Array.isArray(rows) ? rows : [];
    columnsByKey = new Map();
    pendingColumns = new Map();
    rebuild();
  };

  const refresh = async () => {
    if (!api || !api.listTables) return { ok: false };
    const res = await api.listTables();
    if (!res || !res.ok) return res;
    setTables(res.rows || []);
    return res;
  };

  const normalizeIdentifier = (value) => String(value || '').replace(/[`"]/g, '');

  const getLineBeforeCursor = (editor) => {
    if (!editor) return null;
    if (editor.state && editor.state.doc && editor.state.selection) {
      const pos = editor.state.selection.main.head;
      const line = editor.state.doc.lineAt(pos);
      return line.text.slice(0, pos - line.from);
    }
    if (typeof editor.getCursor === 'function' && typeof editor.getLine === 'function') {
      const cursor = editor.getCursor();
      return editor.getLine(cursor.line).slice(0, cursor.ch);
    }
    return null;
  };

  const extractTableToken = (editor) => {
    const line = getLineBeforeCursor(editor);
    if (line === null) return null;
    const match = line.match(/([A-Za-z0-9_$."`]+)\.$/);
    if (!match) return null;
    return normalizeIdentifier(match[1]);
  };

  const resolveTableInfo = (token) => {
    if (!token) return null;
    const normalized = normalizeName(token);
    if (tableIndex.has(normalized)) return tableIndex.get(normalized);
    const parts = token.split('.');
    if (parts.length > 1) {
      const schema = parts.slice(0, -1).join('.');
      const table = parts[parts.length - 1];
      const normalizedQualified = normalizeName(`${schema}.${table}`);
      return tableIndex.get(normalizedQualified) || { schema, table };
    }
    return null;
  };

  const ensureColumns = async (info) => {
    if (!info || !info.table || !api || !api.listColumns) return;
    const key = buildKey(info.schema, info.table);
    if (columnsByKey.has(key)) return;
    if (pendingColumns.has(key)) return pendingColumns.get(key);

    const promise = (async () => {
      const res = await api.listColumns({ schema: info.schema || activeSchema, table: info.table });
      if (!res || !res.ok) return;
      const cols = (res.columns || []).map((col) => getField(col, ['column_name', 'name']) || '').filter(Boolean);
      columnsByKey.set(key, cols);
      rebuild();
    })();

    pendingColumns.set(key, promise);
    try {
      await promise;
    } finally {
      pendingColumns.delete(key);
    }
  };

  const prefetch = async (editor) => {
    const token = extractTableToken(editor);
    if (!token) return;
    const info = resolveTableInfo(token);
    if (!info) return;
    await ensureColumns(info);
  };

  const getHintOptions = () => {
    const active = typeof getActiveConnection === 'function' ? getActiveConnection() : null;
    const type = active && active.type ? active.type : '';
    const normalizedType = String(type || '').toLowerCase();
    const dialect =
      normalizedType === 'postgres' || normalizedType === 'postgresql'
        ? 'postgresql'
        : (normalizedType || 'mysql');
    return {
      tables: hintTables,
      dialect,
      upperCaseKeywords: true
    };
  };

  const onConnected = () => {
    const active = typeof getActiveConnection === 'function' ? getActiveConnection() : null;
    setActiveSchema(active && active.database ? active.database : '');
  };

  return {
    refresh,
    setTables,
    setActiveSchema,
    prefetch,
    getHintOptions,
    onConnected
  };
}
