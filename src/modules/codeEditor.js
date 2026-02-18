import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { sql, schemaCompletionSource, keywordCompletionSource, MySQL, PostgreSQL, StandardSQL } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export function createCodeEditor({
  textarea,
  lineWrapping = false,
  readOnly = false,
  enableCompletion = true,
  autoFocus = true
}) {
  let view = null;
  let onRun = null;
  let onRunSelection = null;
  let hintOptionsProvider = null;
  let hintPrefetch = null;
  const changeHandlers = new Set();
  const selectionHandlers = new Set();
  const themeCompartment = new Compartment();

  const highlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: 'var(--token-keyword)' },
    { tag: t.string, color: 'var(--token-string)' },
    { tag: t.number, color: 'var(--token-number)' },
    { tag: t.comment, color: 'var(--token-comment)', fontStyle: 'italic' },
    { tag: t.typeName, color: 'var(--token-type)' },
    { tag: t.bool, color: 'var(--token-number)' },
    { tag: t.null, color: 'var(--token-number)' },
    { tag: t.operator, color: 'var(--text)' },
    { tag: t.variableName, color: 'var(--text)' },
    { tag: t.propertyName, color: 'var(--text)' },
    { tag: t.invalid, color: 'var(--token-error)' }
  ]);

  const editorThemeRules = {
    '&': {
      color: 'var(--text)',
      backgroundColor: 'var(--code-bg)'
    },
    '.cm-content': {
      caretColor: 'var(--code-cursor)'
    },
    '.cm-scroller': {
      fontFamily: 'inherit'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--code-gutter-bg)',
      color: 'var(--text-muted-2)',
      borderRight: '1px solid var(--surface-5)'
    },
    '.cm-gutterElement': {
      padding: '0 6px'
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--code-cursor)'
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--code-cursor)'
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--selection)'
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--selection)'
    },
    '.cm-activeLine': {
      backgroundColor: 'var(surface-4)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--code-active-line-gutter)'
    }
  };

  const darkTheme = EditorView.theme(editorThemeRules, { dark: true });
  const lightTheme = EditorView.theme(editorThemeRules, { dark: false });
  const resolveTheme = () =>
    document.body.classList.contains('theme-light') ? lightTheme : darkTheme;

  const resolveHintOptions = async () => {
    if (typeof hintOptionsProvider !== 'function') return {};
    const value = hintOptionsProvider();
    if (value && typeof value.then === 'function') return await value;
    return value || {};
  };

  const resolveDialect = (options) => {
    if (!options) return StandardSQL;
    if (options.dialect && typeof options.dialect === 'object' && options.dialect.language) {
      return options.dialect;
    }
    const name = String(options.dialect || '').toLowerCase();
    if (name === 'postgres' || name === 'postgresql') return PostgreSQL;
    if (name === 'mysql' || name === 'mariadb') return MySQL;
    return StandardSQL;
  };

  const completionSource = async (context) => {
    if (typeof hintPrefetch === 'function' && view) {
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
      options && options.keywordCompletion
    )(context);
  };

  const runKeymap = Prec.high(keymap.of([
    {
      key: 'Mod-Enter',
      run: () => {
        if (typeof onRun === 'function') onRun();
        return true;
      }
    },
    {
      key: 'Shift-Enter',
      run: () => {
        if (typeof onRunSelection === 'function') onRunSelection();
        return true;
      }
    }
  ]));

  const init = () => {
    if (!textarea || view) return view;
    const host = document.createElement('div');
    host.className = 'cm-editor-host';
    textarea.style.display = 'none';
    textarea.insertAdjacentElement('afterend', host);

    const extensions = [
      basicSetup,
      EditorState.tabSize.of(2),
      sql(),
      lineWrapping ? EditorView.lineWrapping : [],
      themeCompartment.of(resolveTheme()),
      syntaxHighlighting(highlightStyle),
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
      })
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
    }

    if (enableCompletion) {
      extensions.push(autocompletion({ override: [completionSource, keywordSource] }));
    }

    const state = EditorState.create({
      doc: textarea.value || '',
      extensions
    });

    view = new EditorView({ state, parent: host });
    if (autoFocus) view.focus();
    return view;
  };

  const getValue = () => (view ? view.state.doc.toString() : (textarea ? textarea.value : ''));
  const setValue = (value) => {
    if (view) {
      const next = value || '';
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    } else if (textarea) {
      textarea.value = value || '';
    }
  };
  const getSelection = () => {
    if (!view) return '';
    const selection = view.state.selection.main;
    if (selection.empty) return '';
    return view.state.sliceDoc(selection.from, selection.to);
  };
  const getCursorOffset = () => {
    if (view) {
      const selection = view.state.selection.main;
      return Number(selection && selection.head) || 0;
    }
    if (textarea && Number.isFinite(textarea.selectionStart)) {
      return Number(textarea.selectionStart) || 0;
    }
    return 0;
  };
  const onChange = (handler) => {
    if (typeof handler === 'function') changeHandlers.add(handler);
  };
  const onSelectionChange = (handler) => {
    if (typeof handler === 'function') selectionHandlers.add(handler);
  };
  const refresh = (shouldFocus = true) => {
    if (!view) return;
    view.requestMeasure();
    if (shouldFocus) view.focus();
  };
  const focus = () => {
    if (view) view.focus();
  };
  const setTheme = () => {
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(resolveTheme()) });
  };
  const setSize = (width, height) => {
    if (!view) return;
    if (width) view.dom.style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) view.dom.style.height = typeof height === 'number' ? `${height}px` : height;
  };

  const setHandlers = ({ run, runSelection } = {}) => {
    onRun = run || null;
    onRunSelection = runSelection || null;
  };

  const setHintProvider = ({ getHintOptions, prefetch } = {}) => {
    hintOptionsProvider = typeof getHintOptions === 'function' ? getHintOptions : null;
    hintPrefetch = typeof prefetch === 'function' ? prefetch : null;
  };

  return {
    init,
    getValue,
    setValue,
    getSelection,
    getCursorOffset,
    onChange,
    onSelectionChange,
    refresh,
    focus,
    setTheme,
    setSize,
    setHandlers,
    setHintProvider
  };
}
