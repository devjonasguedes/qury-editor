import 'codemirror/lib/codemirror.css';
import CodeMirror from 'codemirror';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/addon/hint/sql-hint.js';

export function createCodeEditor({ textarea }) {
  let editor = null;
  let onRun = null;
  let onRunSelection = null;

  const init = () => {
    if (!textarea || editor) return editor;
    editor = CodeMirror.fromTextArea(textarea, {
      mode: 'text/x-sql',
      lineNumbers: true,
      indentWithTabs: true,
      tabSize: 2,
      indentUnit: 2,
      lineWrapping: false,
      autofocus: true,
      styleSelectedText: true,
      extraKeys: {
        'Ctrl-Enter': () => {
          if (typeof onRun === 'function') onRun();
        },
        'Cmd-Enter': () => {
          if (typeof onRun === 'function') onRun();
        },
        'Shift-Enter': () => {
          if (typeof onRunSelection === 'function') onRunSelection();
        },
        'Ctrl-Space': () => {
          if (editor && typeof editor.showHint === 'function') {
            editor.showHint({ hint: CodeMirror.hint.sql, completeSingle: false });
          }
        },
        'Cmd-Space': () => {
          if (editor && typeof editor.showHint === 'function') {
            editor.showHint({ hint: CodeMirror.hint.sql, completeSingle: false });
          }
        }
      }
    });
    editor.on('inputRead', (_cm, change) => {
      if (!change || !change.text || !change.text[0]) return;
      const ch = change.text[0];
      if (!/[A-Za-z0-9_.]/.test(ch)) return;
      if (typeof editor.showHint === 'function') {
        editor.showHint({ hint: CodeMirror.hint.sql, completeSingle: false });
      }
    });
    return editor;
  };

  const getValue = () => (editor ? editor.getValue() : (textarea ? textarea.value : ''));
  const setValue = (value) => {
    if (editor) editor.setValue(value || '');
    else if (textarea) textarea.value = value || '';
  };
  const getSelection = () => (editor ? editor.getSelection() : '');
  const onChange = (handler) => {
    if (editor) editor.on('change', handler);
  };
  const refresh = () => {
    if (!editor) return;
    setTimeout(() => {
      editor.refresh();
      editor.focus();
    }, 0);
  };
  const focus = () => {
    if (editor) editor.focus();
  };
  const setSize = (width, height) => {
    if (editor) editor.setSize(width, height);
  };

  const setHandlers = ({ run, runSelection } = {}) => {
    onRun = run || null;
    onRunSelection = runSelection || null;
  };

  return {
    init,
    getValue,
    setValue,
    getSelection,
    onChange,
    refresh,
    focus,
    setSize,
    setHandlers
  };
}
