import { createScopedStorage } from './storage.js';

const SNIPPETS_KEY = 'sqlEditor.snippets';

export function createSnippetsManager({
  snippetsList,
  addSnippetBtn,
  snippetModal,
  snippetModalBackdrop,
  snippetCloseBtn,
  snippetCancelBtn,
  snippetSaveBtn,
  snippetNameInput,
  snippetQueryInput,
  getSnippetValue,
  setSnippetValue,
  getCurrentHistoryKey,
  setQueryValue,
  createNewQueryTab,
  runSnippet,
  showError
}) {
  let pendingSnippetSql = '';
  let editingSnippetId = null;

  const snippetsStore = createScopedStorage(SNIPPETS_KEY, getCurrentHistoryKey);

  const readSnippets = () => snippetsStore.readList([]);
  const writeSnippets = (list) => snippetsStore.writeList(list);

  const renderSnippetsList = () => {
    if (!snippetsList) return;
    if (!getCurrentHistoryKey()) {
      snippetsList.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Connect to view snippets.';
      snippetsList.appendChild(empty);
      return;
    }
    const list = readSnippets();
    snippetsList.innerHTML = '';
    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'No saved snippets.';
      snippetsList.appendChild(empty);
      return;
    }
    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'snippet-item';

      const info = document.createElement('div');
      info.className = 'snippet-info';

      const title = document.createElement('div');
      title.className = 'snippet-title';
      title.textContent = entry.name || 'Snippet';

      const sql = document.createElement('div');
      sql.className = 'snippet-sql';
      sql.textContent = (entry.sql || '').split('\n')[0] || '';

      info.appendChild(title);
      info.appendChild(sql);

      const actions = document.createElement('div');
      actions.className = 'snippet-actions';

      const runSnippetBtn = document.createElement('button');
      runSnippetBtn.className = 'icon-btn mini';
      runSnippetBtn.title = 'Run snippet';
      runSnippetBtn.innerHTML = '<i class="bi bi-lightning-charge"></i>';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn mini';
      editBtn.title = 'Edit snippet';
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn mini';
      deleteBtn.title = 'Delete snippet';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

      actions.appendChild(runSnippetBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      info.addEventListener('click', () => {
        const sqlText = entry.sql || '';
        if (!sqlText) return;
        if (createNewQueryTab) createNewQueryTab(sqlText);
        if (setQueryValue) setQueryValue(sqlText);
      });

      runSnippetBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (runSnippet) await runSnippet(entry.sql || '');
      });

      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openSnippetModal({
          id: entry.id || null,
          name: entry.name || '',
          sql: entry.sql || ''
        });
      });

      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const confirmed = confirm(`Remove snippet "${entry.name || 'Snippet'}"?`);
        if (!confirmed) return;
        const next = list.filter((item) => {
          if (!item) return false;
          if (entry.id) return item.id !== entry.id;
          return !(item.name === entry.name && item.sql === entry.sql);
        });
        writeSnippets(next);
        renderSnippetsList();
      });

      item.appendChild(info);
      item.appendChild(actions);
      snippetsList.appendChild(item);
    });
  };

  const openSnippetModal = ({ sql = '', name = '', id = null } = {}) => {
    if (!snippetModal) return;
    pendingSnippetSql = sql;
    editingSnippetId = id;
    snippetModal.classList.remove('hidden');
    if (snippetNameInput) {
      snippetNameInput.value = name;
      setTimeout(() => {
        snippetNameInput.focus();
        snippetNameInput.select();
      }, 0);
    }
    requestAnimationFrame(() => {
      if (setSnippetValue) {
        setSnippetValue(sql || '');
      } else if (snippetQueryInput) {
        snippetQueryInput.value = sql || '';
      }
    });
  };

  const closeSnippetModal = () => {
    if (!snippetModal) return;
    snippetModal.classList.add('hidden');
    pendingSnippetSql = '';
    editingSnippetId = null;
  };

  const saveSnippetFromModal = async () => {
    if (!getCurrentHistoryKey()) return;
    const name = snippetNameInput ? snippetNameInput.value.trim() : '';
    if (!name) {
      if (showError) await showError('Enter a name for the snippet.');
      return;
    }
    const sqlSource = getSnippetValue
      ? getSnippetValue()
      : (snippetQueryInput ? snippetQueryInput.value : pendingSnippetSql);
    const sql = String(sqlSource || '').trim();
    if (!sql) {
      if (showError) await showError('Snippet has no query.');
      return;
    }
    const list = readSnippets();
    const existingIndex = list.findIndex((item) => item && item.name === name);
    const isEditing = !!editingSnippetId;
    const editingIndex = isEditing
      ? list.findIndex((item) => item && item.id === editingSnippetId)
      : -1;
    if (isEditing && editingIndex >= 0) {
      const existing = list[editingIndex];
      list.splice(editingIndex, 1);
      const updated = {
        id: existing.id,
        name,
        sql,
        ts: Date.now()
      };
      if (existingIndex >= 0 && existingIndex !== editingIndex) {
        const overwrite = confirm(`A snippet named "${name}" already exists. Replace it?`);
        if (!overwrite) {
          list.splice(editingIndex, 0, existing);
          return;
        }
        list.splice(existingIndex, 1);
      }
      list.unshift(updated);
      writeSnippets(list.slice(0, 100));
      renderSnippetsList();
      closeSnippetModal();
      return;
    }
    if (existingIndex >= 0) {
      const overwrite = confirm(`A snippet named "${name}" already exists. Replace it?`);
      if (!overwrite) return;
      list.splice(existingIndex, 1);
    }
    list.unshift({
      id: `snip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      sql,
      ts: Date.now()
    });
    writeSnippets(list.slice(0, 100));
    renderSnippetsList();
    closeSnippetModal();
  };

  const bindEvents = () => {
    if (addSnippetBtn) {
      addSnippetBtn.addEventListener('click', async () => {
        if (!getCurrentHistoryKey()) {
          if (showError) await showError('Connect to save snippets.');
          return;
        }
        openSnippetModal();
      });
    }

    if (snippetSaveBtn) {
      snippetSaveBtn.addEventListener('click', () => {
        saveSnippetFromModal();
      });
    }

    if (snippetCancelBtn) {
      snippetCancelBtn.addEventListener('click', () => {
        closeSnippetModal();
      });
    }

    if (snippetCloseBtn) {
      snippetCloseBtn.addEventListener('click', () => {
        closeSnippetModal();
      });
    }

    if (snippetModalBackdrop) {
      snippetModalBackdrop.addEventListener('click', () => {
        closeSnippetModal();
      });
    }

    if (snippetNameInput) {
      snippetNameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveSnippetFromModal();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSnippetModal();
        }
      });
    }
  };

  bindEvents();

  return {
    renderSnippetsList,
    openSnippetModal,
    closeSnippetModal
  };
}
