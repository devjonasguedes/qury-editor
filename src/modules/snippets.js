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
  listSnippets,
  saveSnippet,
  deleteSnippet,
  showError
}) {
  let pendingSnippetSql = '';
  let editingSnippetId = null;

  const resolveScope = () => {
    if (typeof getCurrentHistoryKey !== 'function') return null;
    return getCurrentHistoryKey();
  };

  const readSnippets = async () => {
    const scope = resolveScope();
    if (!scope || typeof listSnippets !== 'function') return [];
    try {
      const list = await listSnippets({ connectionId: scope, limit: 100 });
      return Array.isArray(list) ? list : [];
    } catch (_) {
      if (showError) await showError('Failed to load snippets.');
      return [];
    }
  };

  const renderSnippetsList = async () => {
    if (!snippetsList) return;
    if (!resolveScope()) {
      snippetsList.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Connect to view snippets.';
      snippetsList.appendChild(empty);
      return;
    }
    const list = await readSnippets();
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
        const scope = resolveScope();
        if (!scope || typeof deleteSnippet !== 'function') return;
        await deleteSnippet({ connectionId: scope, id: entry.id, name: entry.name || '' });
        await renderSnippetsList();
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
    const scope = resolveScope();
    if (!scope) return;
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
    if (typeof saveSnippet !== 'function') return;

    const list = await readSnippets();
    const existingIndex = list.findIndex((item) => item && item.name === name);
    const isEditing = !!editingSnippetId;
    const editingIndex = isEditing
      ? list.findIndex((item) => item && item.id === editingSnippetId)
      : -1;

    if (isEditing && editingIndex >= 0) {
      const existing = list[editingIndex];
      if (existingIndex >= 0 && existingIndex !== editingIndex) {
        const overwrite = confirm(`A snippet named "${name}" already exists. Replace it?`);
        if (!overwrite) return;
      }
      await saveSnippet({ connectionId: scope, id: existing.id, name, sql });
      await renderSnippetsList();
      closeSnippetModal();
      return;
    }

    if (existingIndex >= 0) {
      const overwrite = confirm(`A snippet named "${name}" already exists. Replace it?`);
      if (!overwrite) return;
    }
    await saveSnippet({ connectionId: scope, id: editingSnippetId, name, sql });
    await renderSnippetsList();
    closeSnippetModal();
  };

  const bindEvents = () => {
    if (addSnippetBtn) {
      addSnippetBtn.addEventListener('click', async () => {
        if (!resolveScope()) {
          if (showError) await showError('Connect to save snippets.');
          return;
        }
        openSnippetModal();
      });
    }

    if (snippetSaveBtn) {
      snippetSaveBtn.addEventListener('click', () => {
        void saveSnippetFromModal();
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
          void saveSnippetFromModal();
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