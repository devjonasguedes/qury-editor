// Settings modal component - manages general settings, error handling, and environment policies

export function createSettingsModal({
  onOpen,
  onSave,
  onResetDefaults,
  onClose,
}) {
  const modal = document.getElementById('settingsModal');
  const backdrop = document.getElementById('settingsModalBackdrop');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const cancelBtn = document.getElementById('settingsCancelBtn');
  const saveBtn = document.getElementById('settingsSaveBtn');
  const resetDefaultsBtn = document.getElementById('settingsResetDefaultsBtn');
  const tabs = document.getElementById('settingsTabs');
  
  // Panels
  const panelGeneral = document.getElementById('settingsPanelGeneral');
  const panelErrorsTimeouts = document.getElementById('settingsPanelErrorsTimeouts');
  const panelEnvironments = document.getElementById('settingsPanelEnvironments');

  let activeTab = 'general';

  const setTab = (tab) => {
    const validTabs = ['general', 'errors-timeouts', 'environments'];
    activeTab = validTabs.includes(tab) ? tab : 'general';

    // Update tab buttons
    if (tabs) {
      const items = tabs.querySelectorAll('[data-settings-tab]');
      items.forEach((item) => {
        const isActive = item.getAttribute('data-settings-tab') === activeTab;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    // Update panels
    if (panelGeneral) panelGeneral.classList.toggle('hidden', activeTab !== 'general');
    if (panelErrorsTimeouts) panelErrorsTimeouts.classList.toggle('hidden', activeTab !== 'errors-timeouts');
    if (panelEnvironments) panelEnvironments.classList.toggle('hidden', activeTab !== 'environments');
  };

  const open = async () => {
    if (!modal) return;
    
    if (onOpen) {
      await onOpen();
    }
    
    setTab(activeTab);
    modal.classList.remove('hidden');
  };

  const close = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    if (onClose) onClose();
  };

  const save = async () => {
    if (!saveBtn) return;
    
    saveBtn.disabled = true;
    try {
      if (onSave) {
        const result = await onSave(activeTab);
        if (result?.shouldClose !== false) {
          close();
        }
      }
    } finally {
      saveBtn.disabled = false;
    }
  };

  const resetDefaults = () => {
    if (onResetDefaults) {
      onResetDefaults(activeTab);
    }
  };

  // Event listeners
  if (tabs) {
    tabs.addEventListener('click', (event) => {
      const item = event.target.closest('[data-settings-tab]');
      if (!item) return;
      const tab = item.getAttribute('data-settings-tab');
      setTab(tab);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', close);
  }

  if (backdrop) {
    backdrop.addEventListener('click', close);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', save);
  }

  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener('click', resetDefaults);
  }

  // Keyboard shortcuts
  if (modal) {
    modal.addEventListener('keydown', async (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      // Ctrl/Cmd + S to save
      const primaryKey = event.metaKey || event.ctrlKey;
      if (primaryKey && !event.shiftKey && !event.altKey && event.key === 's') {
        event.preventDefault();
        await save();
      }
    });
  }

  return {
    open,
    close,
    save,
    resetDefaults,
    setTab,
    getActiveTab: () => activeTab,
  };
}
