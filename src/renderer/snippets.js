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
  getSnippetEditor,
  getCurrentHistoryKey,
  getQueryValue,
  getActiveTab,
  isTableTab,
  isTableEditor,
  createNewQueryTab,
  setQueryValue,
  updateRunAvailability,
  scheduleSaveTabs,
  enableQueryFilter,
  safeRunQueries,
  runTableTabQuery,
  isReadOnlyViolation,
  hasMultipleStatementsWithSelect,
  hasNonSelect,
  splitStatements,
  showError
}) {
  let pendingSnippetSql = '';
  let editingSnippetId = null;

  const snippetsStore = createScopedStorage(SNIPPETS_KEY, getCurrentHistoryKey);

  function readSnippets() {
    return snippetsStore.readList([]);
  }

  function writeSnippets(list) {
    snippetsStore.writeList(list);
  }

  function loadSnippetSql(sqlText) {
    const trimmed = String(sqlText || '').trim();
    if (!trimmed) return;
    let tab = getActiveTab();
    if (!tab || (isTableTab(tab) && !isTableEditor(tab))) {
      tab = createNewQueryTab(trimmed);
      setQueryValue(trimmed);
      return;
    }
    setQueryValue(trimmed);
    if (tab) tab.query = trimmed;
    updateRunAvailability();
    scheduleSaveTabs();
  }

  async function runSnippetSql(sqlText) {
    const trimmed = String(sqlText || '').trim();
    if (!trimmed) return;
    let tab = getActiveTab();
    if (!tab || (isTableTab(tab) && !isTableEditor(tab))) {
      tab = createNewQueryTab(trimmed);
    }
    setQueryValue(trimmed);
    if (tab) tab.query = trimmed;
    updateRunAvailability();
    scheduleSaveTabs();
    if (isReadOnlyViolation(trimmed)) {
      await showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
      return;
    }
    if (hasMultipleStatementsWithSelect(trimmed)) {
      await showError('Há múltiplos SELECTs. Use execução por seleção/instrução.');
      return;
    }
    const ok = await safeRunQueries(trimmed);
    if (ok) enableQueryFilter(tab, trimmed);
    if (ok && isTableEditor(tab) && hasNonSelect(splitStatements(trimmed))) {
      await runTableTabQuery(tab);
    }
  }

  function renderSnippetsList() {
    if (!snippetsList) return;
    if (!getCurrentHistoryKey()) {
      snippetsList.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Conecte para ver os snippets.';
      snippetsList.appendChild(empty);
      return;
    }
    const list = readSnippets();
    snippetsList.innerHTML = '';
    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Nenhum snippet salvo.';
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
      runSnippetBtn.title = 'Executar snippet';
      runSnippetBtn.innerHTML = '<i class="bi bi-lightning-charge"></i>';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn mini';
      editBtn.title = 'Editar snippet';
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn mini';
      deleteBtn.title = 'Excluir snippet';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

      actions.appendChild(runSnippetBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      info.addEventListener('click', () => {
        loadSnippetSql(entry.sql || '');
      });

      runSnippetBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await runSnippetSql(entry.sql || '');
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
        const confirmed = confirm(`Remover o snippet "${entry.name || 'Snippet'}"?`);
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
  }

  function openSnippetModal({ sql = '', name = '', id = null } = {}) {
    if (!snippetModal) return;
    pendingSnippetSql = sql;
    editingSnippetId = id;
    if (snippetNameInput) {
      snippetNameInput.value = name;
      setTimeout(() => {
        snippetNameInput.focus();
        snippetNameInput.select();
      }, 0);
    }
    const editor = getSnippetEditor();
    if (editor) {
      editor.setValue(sql || '');
      setTimeout(() => editor.refresh(), 0);
    } else if (snippetQueryInput) {
      snippetQueryInput.value = sql || '';
    }
    snippetModal.classList.remove('hidden');
  }

  function closeSnippetModal() {
    if (!snippetModal) return;
    snippetModal.classList.add('hidden');
    pendingSnippetSql = '';
    editingSnippetId = null;
  }

  function saveSnippetFromModal() {
    if (!getCurrentHistoryKey()) return;
    const name = snippetNameInput ? snippetNameInput.value.trim() : '';
    if (!name) {
      showError('Informe um nome para o snippet.');
      return;
    }
    const editor = getSnippetEditor();
    const sqlSource = editor
      ? editor.getValue()
      : snippetQueryInput
        ? snippetQueryInput.value
        : pendingSnippetSql;
    const sql = String(sqlSource || '').trim();
    if (!sql) {
      showError('Snippet sem query.');
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
        const overwrite = confirm(`Já existe um snippet "${name}". Deseja substituir?`);
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
      const overwrite = confirm(`Já existe um snippet "${name}". Deseja substituir?`);
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
  }

  function bindEvents() {
    if (addSnippetBtn) {
      addSnippetBtn.addEventListener('click', async () => {
        if (!getCurrentHistoryKey()) {
          await showError('Conecte para salvar snippets.');
          return;
        }
        const sqlText = getQueryValue();
        const trimmed = String(sqlText || '').trim();
        if (!trimmed) {
          await showError('Digite uma query para salvar como snippet.');
          return;
        }
        const suggestion = trimmed.split('\n')[0].slice(0, 40);
        openSnippetModal({ sql: trimmed, name: suggestion });
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
  }

  return {
    renderSnippetsList,
    bindEvents,
    saveSnippetFromModal,
    closeSnippetModal
  };
}
