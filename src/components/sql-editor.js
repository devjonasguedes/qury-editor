import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import {
  sql,
  schemaCompletionSource,
  keywordCompletionSource,
  MySQL,
  PostgreSQL,
  StandardSQL,
} from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { format as formatSql } from "sql-formatter";
import {
  firstDmlKeyword,
  splitStatements,
  splitStatementsWithRanges,
} from "../sql.js";
import { EDITOR_FONT_SIZE_DEFAULTS, STORAGE_KEYS } from "../constants/appDefaults.js";

export function createSqlEditor({
  textarea,
  toolbarRoot,
  api,
  runSql,
  getActiveConnection,
  getCurrentHistoryKey,
  openSnippetModal,
  stopQueryProgress,
  setQueryStatus,
  onBeforeExecute,
  onToggleEditor,
} = {}) {
  let view = null;
  const changeHandlers = new Set();
  const selectionHandlers = new Set();
  const themeCompartment = new Compartment();
  let hintOptionsProvider = null;
  let hintPrefetch = null;
  const DEFAULT_EDITOR_FONT_SIZE = EDITOR_FONT_SIZE_DEFAULTS.DEFAULT;
  const MIN_EDITOR_FONT_SIZE = EDITOR_FONT_SIZE_DEFAULTS.MIN;
  const MAX_EDITOR_FONT_SIZE = EDITOR_FONT_SIZE_DEFAULTS.MAX;

  const toolbarScope =
    toolbarRoot || (textarea ? textarea.closest(".editor") : null) || document;
  const getToolbarButton = (id) => {
    if (toolbarScope && typeof toolbarScope.querySelector === "function") {
      return toolbarScope.querySelector(`#${id}`);
    }
    return document.getElementById(id);
  };

  const runBtn = getToolbarButton("runBtn");
  const runSelectionBtn = getToolbarButton("runSelectionBtn");
  const runCurrentBtn = getToolbarButton("runCurrentBtn");
  const formatBtn = getToolbarButton("formatBtn");
  const explainBtn = getToolbarButton("explainBtn");
  const explainAnalyzeBtn = getToolbarButton("explainAnalyzeBtn");
  const stopBtn = getToolbarButton("stopBtn");
  const zoomOutBtn = getToolbarButton("zoomOutBtn");
  const zoomInBtn = getToolbarButton("zoomInBtn");
  const toggleEditorBtn = getToolbarButton("toggleEditorBtn");
  const saveSnippetEditorBtn = getToolbarButton("saveSnippetEditorBtn");

  const normalizeSql = (sqlText) =>
    String(sqlText || "")
      .trim()
      .replace(/;$/, "")
      .trim();

  const showError = async (message) => {
    if (api && typeof api.showError === "function") {
      await api.showError(message);
    }
  };

  const runSqlSafe = async (sqlText, sourceSql, options) => {
    if (typeof runSql !== "function") {
      await showError("Query execution is not available.");
      return false;
    }
    if (typeof onBeforeExecute === "function") onBeforeExecute();
    return runSql(sqlText, sourceSql, options);
  };

  const resolveEditorBody = () => {
    if (!textarea) return null;
    const editorPanel = textarea.closest(".editor");
    return editorPanel ? editorPanel.querySelector(".editor-body") : null;
  };

  const clampEditorFontSize = (value) => {
    const size = Number(value);
    if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
    return Math.max(
      MIN_EDITOR_FONT_SIZE,
      Math.min(MAX_EDITOR_FONT_SIZE, Math.round(size)),
    );
  };

  const applyEditorFontSize = (size, { save = true } = {}) => {
    const next = clampEditorFontSize(size);
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${next}px`,
    );
    if (save) {
      localStorage.setItem(STORAGE_KEYS.EDITOR_FONT_SIZE_KEY, String(next));
    }
  };

  const getCurrentEditorFontSize = () => {
    const cssValue = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--editor-font-size",
      ),
      10,
    );
    if (Number.isFinite(cssValue)) return cssValue;
    const saved = Number(
      localStorage.getItem(STORAGE_KEYS.EDITOR_FONT_SIZE_KEY),
    );
    return Number.isFinite(saved) ? saved : DEFAULT_EDITOR_FONT_SIZE;
  };

  const adjustFontSize = (delta) => {
    applyEditorFontSize(getCurrentEditorFontSize() + delta);
  };

  const resetFontSize = () => {
    applyEditorFontSize(DEFAULT_EDITOR_FONT_SIZE);
  };

  const loadFontSize = () => {
    const raw = Number(
      localStorage.getItem(STORAGE_KEYS.EDITOR_FONT_SIZE_KEY),
    );
    if (!Number.isFinite(raw)) {
      applyEditorFontSize(DEFAULT_EDITOR_FONT_SIZE, { save: false });
      return;
    }
    applyEditorFontSize(raw, { save: false });
  };

  const toggleEditorVisibility = () => {
    const editorBody = resolveEditorBody();
    if (!editorBody) return;
    const nextVisible = editorBody.classList.contains("hidden");
    editorBody.classList.toggle("hidden", !nextVisible);
    setToggleState(nextVisible);
    if (typeof onToggleEditor === "function") {
      onToggleEditor(nextVisible);
    }
  };

  const highlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: "var(--token-keyword)" },
    { tag: t.string, color: "var(--token-string)" },
    { tag: t.number, color: "var(--token-number)" },
    { tag: t.comment, color: "var(--token-comment)", fontStyle: "italic" },
    { tag: t.typeName, color: "var(--token-type)" },
    { tag: t.bool, color: "var(--token-number)" },
    { tag: t.null, color: "var(--token-number)" },
    { tag: t.operator, color: "var(--text)" },
    { tag: t.variableName, color: "var(--text)" },
    { tag: t.propertyName, color: "var(--text)" },
    { tag: t.invalid, color: "var(--token-error)" },
  ]);

  const editorThemeRules = {
    "&": {
      color: "var(--text)",
      backgroundColor: "var(--code-bg)",
    },
    ".cm-content": {
      caretColor: "var(--code-cursor)",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
    },
    ".cm-gutters": {
      backgroundColor: "var(--code-gutter-bg)",
      color: "var(--text-muted-2)",
      borderRight: "1px solid var(--surface-5)",
    },
    ".cm-gutterElement": {
      padding: "0 6px",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--code-cursor)",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--code-cursor)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--selection)",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--selection)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(surface-4)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--code-active-line-gutter)",
    },
  };

  const darkTheme = EditorView.theme(editorThemeRules, { dark: true });
  const lightTheme = EditorView.theme(editorThemeRules, { dark: false });

  const resolveTheme = () =>
    document.body.classList.contains("theme-light") ? lightTheme : darkTheme;

  const resolveHintOptions = async () => {
    if (typeof hintOptionsProvider !== "function") return {};
    const value = hintOptionsProvider();
    if (value && typeof value.then === "function") return await value;
    return value || {};
  };

  const resolveDialect = (options) => {
    if (!options) return StandardSQL;
    if (
      options.dialect &&
      typeof options.dialect === "object" &&
      options.dialect.language
    ) {
      return options.dialect;
    }
    const name = String(options.dialect || "").toLowerCase();
    if (name === "postgres" || name === "postgresql") return PostgreSQL;
    if (name === "mysql") return MySQL;
    return StandardSQL;
  };

  const completionSource = async (context) => {
    if (typeof hintPrefetch === "function" && view) {
      try {
        await hintPrefetch(view);
      } catch (_) {
        // ignore prefetch errors
      }
    }
    const options = await resolveHintOptions();
    const schema = options && options.tables ? options.tables : {};
    const dialect = resolveDialect(options);
    return schemaCompletionSource({ schema, dialect })(context);
  };

  const keywordSource = async (context) => {
    const options = await resolveHintOptions();
    const dialect = resolveDialect(options);
    return keywordCompletionSource(
      dialect,
      options && options.upperCaseKeywords,
      options && options.keywordCompletion,
    )(context);
  };

  const runKeymap = Prec.high(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          void handleRun();
          return true;
        },
      },
      {
        key: "Shift-Enter",
        run: () => {
          void handleRunSelection();
          return true;
        },
      },
    ]),
  );

  const readValue = () => {
    if (view) return view.state.doc.toString();
    return textarea ? textarea.value || "" : "";
  };

  const readSelection = () => {
    if (!view) {
      if (!textarea) return "";
      const start = Number(textarea.selectionStart) || 0;
      const end = Number(textarea.selectionEnd) || 0;
      if (start === end) return "";
      return String(textarea.value || "").slice(
        Math.min(start, end),
        Math.max(start, end),
      );
    }
    const selection = view.state.selection.main;
    if (selection.empty) return "";
    return view.state.sliceDoc(selection.from, selection.to);
  };

  const updateAvailability = () => {
    const sql = readValue();
    const hasText = !!(sql && sql.trim());
    const selection = readSelection();
    const hasSelection = !!(selection && selection.trim());

    if (runBtn) runBtn.disabled = !hasText;
    if (runSelectionBtn) runSelectionBtn.disabled = !hasText || !hasSelection;
    if (runCurrentBtn) runCurrentBtn.disabled = !hasText;
    if (explainBtn) explainBtn.disabled = !hasText;
    if (explainAnalyzeBtn) explainAnalyzeBtn.disabled = !hasText;
    if (runBtn) runBtn.classList.toggle("ready", hasText);
    if (saveSnippetEditorBtn) {
      saveSnippetEditorBtn.classList.toggle("hidden", !hasText);
      saveSnippetEditorBtn.disabled = !hasText;
    }
  };

  const handleRun = async () => {
    const sqlText = readValue();
    if (!sqlText || !sqlText.trim()) {
      await showError("Empty query.");
      return;
    }
    await runSqlSafe(sqlText);
  };

  const handleRunSelection = async () => {
    const selection = readSelection();
    const sqlText = selection && selection.trim() ? selection : "";
    if (!sqlText) {
      await showError("Select a query.");
      return;
    }
    await runSqlSafe(sqlText);
  };

  const resolveCursorOffset = () => {
    if (view) {
      const selection = view.state.selection.main;
      return Number(selection && selection.head) || 0;
    }
    if (textarea && Number.isFinite(textarea.selectionStart)) {
      return Number(textarea.selectionStart) || 0;
    }
    return 0;
  };

  const findStatementAtCursor = (sourceSql, cursorOffset) => {
    const source = String(sourceSql || "");
    const statements = splitStatementsWithRanges(source);
    if (!statements.length) return "";
    const safeCursor = Math.max(
      0,
      Math.min(source.length, Number(cursorOffset) || 0),
    );

    for (let i = 0; i < statements.length; i += 1) {
      const current = statements[i];
      if (safeCursor >= current.start && safeCursor <= current.end) {
        return current.text;
      }
    }

    for (let i = statements.length - 1; i >= 0; i -= 1) {
      const current = statements[i];
      if (safeCursor > current.end) return current.text;
    }

    return statements[0].text;
  };

  const handleRunCurrentStatement = async () => {
    const sqlText = readValue();
    if (!sqlText || !sqlText.trim()) {
      await showError("Empty query.");
      return;
    }
    const cursorOffset = resolveCursorOffset();
    const stmt = findStatementAtCursor(sqlText, cursorOffset);
    if (!stmt) {
      await showError("No statement found at cursor.");
      return;
    }
    await runSqlSafe(stmt);
  };

  const handleExplain = async ({ analyze = false } = {}) => {
    const explainPrefix = analyze ? "EXPLAIN ANALYZE" : "EXPLAIN";
    const explainLabel = analyze ? "EXPLAIN ANALYZE" : "EXPLAIN";
    const selection = readSelection();
    const sourceSql = selection && selection.trim() ? selection : readValue();
    if (!sourceSql || !sourceSql.trim()) {
      await showError("Empty query.");
      return;
    }

    const statements = splitStatements(sourceSql);
    const explainStatements = [];
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = normalizeSql(statements[i]);
      if (!stmt) continue;
      if (firstDmlKeyword(stmt) !== "select") {
        await showError(
          `${explainLabel} is currently available only for SELECT statements.`,
        );
        return;
      }
      explainStatements.push(`${explainPrefix} ${stmt}`);
    }

    if (!explainStatements.length) {
      await showError("Empty query.");
      return;
    }

    await runSqlSafe(explainStatements.join(";\n"), sourceSql, {
      applyDefaultLimit: false,
    });
  };

  const handleFormat = () => {
    const source = readValue();
    if (!source || !source.trim()) return;
    const active =
      typeof getActiveConnection === "function" ? getActiveConnection() : null;
    const type = active && active.type ? String(active.type).toLowerCase() : "";
    const language =
      type === "postgres" || type === "postgresql" ? "postgresql" : "mysql";
    const formatted = formatSql(source, { language });
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
      });
    } else if (textarea) {
      textarea.value = formatted;
    }
    updateAvailability();
  };

  const handleStop = async () => {
    const active =
      typeof getActiveConnection === "function" ? getActiveConnection() : null;
    const type = active && active.type ? String(active.type).toLowerCase() : "";
    if (type === "sqlite") {
      await showError("Cancel is not supported for SQLite connections.");
      setRunning(false);
      return;
    }
    if (typeof stopQueryProgress === "function") stopQueryProgress();
    let res = null;
    if (api && typeof api.cancelQuery === "function") {
      res = await api.cancelQuery();
    }
    if (!res || !res.ok) {
      await showError((res && res.error) || "Unable to cancel.");
    } else if (typeof setQueryStatus === "function") {
      setQueryStatus({ state: "error", message: "Canceled" });
    }
    setRunning(false);
  };

  const handleSaveSnippet = async () => {
    const sqlText = readValue();
    const trimmed = String(sqlText || "").trim();
    if (!trimmed) return;
    const hasHistory =
      typeof getCurrentHistoryKey === "function" && getCurrentHistoryKey();
    if (!hasHistory) {
      await showError("Connect to save snippets.");
      return;
    }
    const suggestion = trimmed.split("\n")[0].slice(0, 40);
    if (typeof openSnippetModal === "function") {
      openSnippetModal({ sql: trimmed, name: suggestion });
    }
  };

  const setRunning = (running) => {
    const active =
      typeof getActiveConnection === "function" ? getActiveConnection() : null;
    const type = active && active.type ? String(active.type).toLowerCase() : "";
    const cancelSupported = type !== "sqlite";
    if (runBtn) runBtn.disabled = !!running;
    if (runSelectionBtn) runSelectionBtn.disabled = !!running;
    if (runCurrentBtn) runCurrentBtn.disabled = !!running;
    if (explainBtn) explainBtn.disabled = !!running;
    if (explainAnalyzeBtn) explainAnalyzeBtn.disabled = !!running;
    if (stopBtn) {
      stopBtn.disabled = !running || !cancelSupported;
      stopBtn.title = cancelSupported
        ? "Stop execution"
        : "Stop not supported for SQLite";
    }
    if (!running) updateAvailability();
  };

  const setToggleState = (visible) => {
    if (!toggleEditorBtn) return;
    const nextVisible = !!visible;
    toggleEditorBtn.classList.toggle("active", nextVisible);
    toggleEditorBtn.title = nextVisible
      ? "Collapse editor"
      : "Expand editor";
    toggleEditorBtn.setAttribute(
      "aria-label",
      nextVisible ? "Collapse editor" : "Expand editor",
    );
    toggleEditorBtn.setAttribute("aria-pressed", nextVisible ? "true" : "false");
    const icon = toggleEditorBtn.querySelector("i");
    if (icon) {
      icon.className = nextVisible ? "bi bi-chevron-up" : "bi bi-chevron-down";
    }
  };

  const bindToolbar = () => {
    if (runBtn) runBtn.addEventListener("click", () => void handleRun());
    if (runSelectionBtn)
      runSelectionBtn.addEventListener("click", () =>
        void handleRunSelection(),
      );
    if (runCurrentBtn)
      runCurrentBtn.addEventListener("click", () =>
        void handleRunCurrentStatement(),
      );
    if (formatBtn)
      formatBtn.addEventListener("click", () => handleFormat());
    if (explainBtn)
      explainBtn.addEventListener("click", () => void handleExplain());
    if (explainAnalyzeBtn)
      explainAnalyzeBtn.addEventListener("click", () =>
        void handleExplain({ analyze: true }),
      );
    if (stopBtn)
      stopBtn.addEventListener("click", () => void handleStop());
    if (zoomOutBtn)
      zoomOutBtn.addEventListener("click", () => adjustFontSize(-1));
    if (zoomInBtn)
      zoomInBtn.addEventListener("click", () => adjustFontSize(1));
    if (toggleEditorBtn)
      toggleEditorBtn.addEventListener("click", () => toggleEditorVisibility());
    if (saveSnippetEditorBtn)
      saveSnippetEditorBtn.addEventListener("click", () =>
        void handleSaveSnippet(),
      );
  };

  const init = () => {
    if (view || !textarea) return view;
    loadFontSize();
    selectionHandlers.add(() => updateAvailability());
    const host = document.createElement("div");
    host.className = "cm-editor-host";
    textarea.style.display = "none";
    textarea.insertAdjacentElement("afterend", host);

    const state = EditorState.create({
      doc: textarea.value || "",
      extensions: [
        basicSetup,
        EditorState.tabSize.of(2),
        sql(),
        EditorView.lineWrapping,
        themeCompartment.of(resolveTheme()),
        syntaxHighlighting(highlightStyle),
        autocompletion({ override: [completionSource, keywordSource] }),
        keymap.of([indentWithTab]),
        runKeymap,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (textarea) textarea.value = update.state.doc.toString();
            changeHandlers.forEach((handler) => handler(update));
          }
          if (update.selectionSet) {
            selectionHandlers.forEach((handler) => handler(update));
          }
        }),
      ],
    });

    view = new EditorView({ state, parent: host });
    view.focus();
    bindToolbar();
    updateAvailability();
    return view;
  };

  return {
    init,
    getValue: () => readValue(),
    setValue: (value) => {
      if (view) {
        const next = value || "";
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
        });
      } else if (textarea) {
        textarea.value = value || "";
      }
      updateAvailability();
    },
    getSelection: () => readSelection(),
    getCursorOffset: () => {
      if (view) {
        const selection = view.state.selection.main;
        return Number(selection && selection.head) || 0;
      }
      if (textarea && Number.isFinite(textarea.selectionStart)) {
        return Number(textarea.selectionStart) || 0;
      }
      return 0;
    },
    onChange: (handler) => {
      if (typeof handler === "function") {
        changeHandlers.add(handler);
        if (view) handler({ state: view.state });
      }
    },
    onSelectionChange: (handler) => {
      if (typeof handler === "function") {
        selectionHandlers.add(handler);
        if (view) handler({ state: view.state });
      }
    },
    refresh: () => {
      if (!view) return;
      view.requestMeasure();
      view.focus();
    },
    focus: () => {
      if (view) view.focus();
    },
    setTheme: () => {
      if (!view) return;
      view.dispatch({
        effects: themeCompartment.reconfigure(resolveTheme()),
      });
    },
    setSize: (width, height) => {
      if (!view) return;
      if (width)
        view.dom.style.width =
          typeof width === "number" ? `${width}px` : width;
      if (height)
        view.dom.style.height =
          typeof height === "number" ? `${height}px` : height;
    },
    setHintProvider: ({ getHintOptions, prefetch } = {}) => {
      hintOptionsProvider =
        typeof getHintOptions === "function" ? getHintOptions : null;
      hintPrefetch = typeof prefetch === "function" ? prefetch : null;
    },
    adjustFontSize,
    resetFontSize,
    loadFontSize,
    updateAvailability,
    setRunning,
    setToggleState,
  };
}
