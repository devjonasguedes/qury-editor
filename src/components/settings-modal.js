// Settings modal component - manages general settings, error handling, and environment policies

import { SETTINGS_MODAL_TABS } from '../constants/settingsModal.js';

export function createSettingsModal({
  onOpen,
  onSave,
  onResetDefaults,
  onClose,
  onTimezoneToggle,
  onTimezoneInput,
  onTimezoneFocus,
  onTimezoneKeydown,
  onOutsideClick,
  onErrorModeChange,
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

  const settingsSessionTimezoneCombobox = document.getElementById(
    'settingsSessionTimezoneCombobox',
  );
  const settingsSessionTimezone = document.getElementById(
    'settingsSessionTimezone',
  );
  const settingsSessionTimezoneToggle = document.getElementById(
    'settingsSessionTimezoneToggle',
  );
  const settingsSessionTimezoneMenu = document.getElementById(
    'settingsSessionTimezoneMenu',
  );
  const settingsSessionTimezoneOptions = document.getElementById(
    'settingsSessionTimezoneOptions',
  );

  const settingsConnectionOpenTimeout = document.getElementById(
    'settingsConnectionOpenTimeout',
  );
  const settingsConnectionCloseTimeout = document.getElementById(
    'settingsConnectionCloseTimeout',
  );
  const settingsConnectionValidationTimeout = document.getElementById(
    'settingsConnectionValidationTimeout',
  );

  const settingsErrorStopOnFirst = document.getElementById(
    'settingsErrorStopOnFirst',
  );
  const settingsErrorContinueOnError = document.getElementById(
    'settingsErrorContinueOnError',
  );
  const settingsErrorAutoOpenOutput = document.getElementById(
    'settingsErrorAutoOpenOutput',
  );
  const settingsErrorShowDetailedCode = document.getElementById(
    'settingsErrorShowDetailedCode',
  );
  const settingsErrorHideSensitive = document.getElementById(
    'settingsErrorHideSensitive',
  );
  const settingsErrorRetryTransient = document.getElementById(
    'settingsErrorRetryTransient',
  );

  const settingsDefaultLimit = document.getElementById('settingsDefaultLimit');
  const settingsDefaultTimeout = document.getElementById(
    'settingsDefaultTimeout',
  );

  const envPolicyDevAllowWrite = document.getElementById(
    'envPolicyDevAllowWrite',
  );
  const envPolicyDevAllowDdl = document.getElementById('envPolicyDevAllowDdl');
  const envPolicyDevRequireApproval = document.getElementById(
    'envPolicyDevRequireApproval',
  );
  const envPolicyStagingAllowWrite = document.getElementById(
    'envPolicyStagingAllowWrite',
  );
  const envPolicyStagingAllowDdl = document.getElementById(
    'envPolicyStagingAllowDdl',
  );
  const envPolicyStagingRequireApproval = document.getElementById(
    'envPolicyStagingRequireApproval',
  );
  const envPolicyProdAllowWrite = document.getElementById(
    'envPolicyProdAllowWrite',
  );
  const envPolicyProdAllowDdl = document.getElementById(
    'envPolicyProdAllowDdl',
  );
  const envPolicyProdRequireApproval = document.getElementById(
    'envPolicyProdRequireApproval',
  );

  let activeTab = 'general';

  const setTab = (tab) => {
    activeTab = SETTINGS_MODAL_TABS.includes(tab) ? tab : 'general';

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

  const setSessionTimezoneMenuOpen = (open) => {
    const nextOpen = !!open;
    if (settingsSessionTimezoneMenu)
      settingsSessionTimezoneMenu.classList.toggle('hidden', !nextOpen);
    if (settingsSessionTimezoneCombobox)
      settingsSessionTimezoneCombobox.classList.toggle('open', nextOpen);
    if (settingsSessionTimezone)
      settingsSessionTimezone.setAttribute(
        'aria-expanded',
        nextOpen ? 'true' : 'false',
      );
    if (settingsSessionTimezoneToggle)
      settingsSessionTimezoneToggle.setAttribute(
        'aria-expanded',
        nextOpen ? 'true' : 'false',
      );
  };

  const renderSessionTimezoneMenu = ({ items = [], highlightedIndex = -1, onSelect } = {}) => {
    if (!settingsSessionTimezoneOptions) return;
    settingsSessionTimezoneOptions.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'timezone-empty';
      empty.textContent = 'No timezones found';
      settingsSessionTimezoneOptions.appendChild(empty);
      return;
    }
    items.forEach((item, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'timezone-option';
      option.setAttribute('role', 'option');
      option.textContent = item.display;
      if (index === highlightedIndex) option.classList.add('active');
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      option.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(item.timezone);
      });
      settingsSessionTimezoneOptions.appendChild(option);
    });
    const active = settingsSessionTimezoneOptions.querySelector(
      '.timezone-option.active',
    );
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  };

  const setSessionTimezoneValue = (value) => {
    if (settingsSessionTimezone) settingsSessionTimezone.value = value || '';
  };

  const getSessionTimezoneValue = () =>
    settingsSessionTimezone ? settingsSessionTimezone.value : '';

  const focusSessionTimezone = () => {
    if (settingsSessionTimezone) settingsSessionTimezone.focus();
  };

  const syncErrorModeInputs = (source = '') => {
    if (!settingsErrorStopOnFirst || !settingsErrorContinueOnError) return;
    if (source === 'stop') {
      settingsErrorContinueOnError.checked = !settingsErrorStopOnFirst.checked;
      return;
    }
    if (source === 'continue') {
      settingsErrorStopOnFirst.checked = !settingsErrorContinueOnError.checked;
      return;
    }
    if (
      settingsErrorStopOnFirst.checked === settingsErrorContinueOnError.checked
    ) {
      settingsErrorContinueOnError.checked = !settingsErrorStopOnFirst.checked;
    }
  };

  const setErrorHandlingValues = (values) => {
    if (!values) return;
    if (settingsErrorStopOnFirst)
      settingsErrorStopOnFirst.checked = !!values.stopOnFirstError;
    if (settingsErrorContinueOnError)
      settingsErrorContinueOnError.checked = !!values.continueOnError;
    if (settingsErrorAutoOpenOutput)
      settingsErrorAutoOpenOutput.checked = !!values.autoOpenOutputOnError;
    if (settingsErrorShowDetailedCode)
      settingsErrorShowDetailedCode.checked = !!values.showDetailedDbErrorCode;
    if (settingsErrorHideSensitive)
      settingsErrorHideSensitive.checked = !!values.hideSensitiveValuesInErrors;
    if (settingsErrorRetryTransient)
      settingsErrorRetryTransient.checked = !!values.retryTransientSelectErrors;
    syncErrorModeInputs();
  };

  const getErrorHandlingValues = () => ({
    stopOnFirstError: settingsErrorStopOnFirst
      ? settingsErrorStopOnFirst.checked
      : false,
    continueOnError: settingsErrorContinueOnError
      ? settingsErrorContinueOnError.checked
      : false,
    autoOpenOutputOnError: settingsErrorAutoOpenOutput
      ? settingsErrorAutoOpenOutput.checked
      : false,
    showDetailedDbErrorCode: settingsErrorShowDetailedCode
      ? settingsErrorShowDetailedCode.checked
      : false,
    hideSensitiveValuesInErrors: settingsErrorHideSensitive
      ? settingsErrorHideSensitive.checked
      : false,
    retryTransientSelectErrors: settingsErrorRetryTransient
      ? settingsErrorRetryTransient.checked
      : false,
  });

  const setConnectionTimeoutValues = (values) => {
    if (!values) return;
    if (settingsConnectionOpenTimeout)
      settingsConnectionOpenTimeout.value = values.openMs ?? '';
    if (settingsConnectionCloseTimeout)
      settingsConnectionCloseTimeout.value = values.closeMs ?? '';
    if (settingsConnectionValidationTimeout)
      settingsConnectionValidationTimeout.value = values.validationMs ?? '';
  };

  const getConnectionTimeoutValues = () => ({
    openMs: settingsConnectionOpenTimeout
      ? settingsConnectionOpenTimeout.value
      : '',
    closeMs: settingsConnectionCloseTimeout
      ? settingsConnectionCloseTimeout.value
      : '',
    validationMs: settingsConnectionValidationTimeout
      ? settingsConnectionValidationTimeout.value
      : '',
  });

  const setQueryDefaultsValues = (values) => {
    if (!values) return;
    if (settingsDefaultLimit) settingsDefaultLimit.value = values.limit ?? '';
    if (settingsDefaultTimeout)
      settingsDefaultTimeout.value = values.timeoutMs ?? '';
  };

  const getQueryDefaultsValues = () => ({
    limit: settingsDefaultLimit ? settingsDefaultLimit.value : '',
    timeoutMs: settingsDefaultTimeout ? settingsDefaultTimeout.value : '',
  });

  const setEnvironmentPolicyValues = (rules) => {
    if (!rules) return;
    const dev = rules.dev || {};
    const staging = rules.staging || {};
    const prod = rules.prod || {};
    if (envPolicyDevAllowWrite)
      envPolicyDevAllowWrite.checked = !!dev.allowWrite;
    if (envPolicyDevAllowDdl)
      envPolicyDevAllowDdl.checked = !!dev.allowDdlAdmin;
    if (envPolicyDevRequireApproval)
      envPolicyDevRequireApproval.checked = !!dev.requireApproval;
    if (envPolicyStagingAllowWrite)
      envPolicyStagingAllowWrite.checked = !!staging.allowWrite;
    if (envPolicyStagingAllowDdl)
      envPolicyStagingAllowDdl.checked = !!staging.allowDdlAdmin;
    if (envPolicyStagingRequireApproval)
      envPolicyStagingRequireApproval.checked = !!staging.requireApproval;
    if (envPolicyProdAllowWrite)
      envPolicyProdAllowWrite.checked = !!prod.allowWrite;
    if (envPolicyProdAllowDdl)
      envPolicyProdAllowDdl.checked = !!prod.allowDdlAdmin;
    if (envPolicyProdRequireApproval)
      envPolicyProdRequireApproval.checked = !!prod.requireApproval;
  };

  const getEnvironmentPolicyValues = () => ({
    dev: {
      allowWrite: !!(envPolicyDevAllowWrite && envPolicyDevAllowWrite.checked),
      allowDdlAdmin: !!(envPolicyDevAllowDdl && envPolicyDevAllowDdl.checked),
      requireApproval: !!(
        envPolicyDevRequireApproval && envPolicyDevRequireApproval.checked
      ),
    },
    staging: {
      allowWrite: !!(
        envPolicyStagingAllowWrite && envPolicyStagingAllowWrite.checked
      ),
      allowDdlAdmin: !!(
        envPolicyStagingAllowDdl && envPolicyStagingAllowDdl.checked
      ),
      requireApproval: !!(
        envPolicyStagingRequireApproval &&
          envPolicyStagingRequireApproval.checked
      ),
    },
    prod: {
      allowWrite: !!(envPolicyProdAllowWrite && envPolicyProdAllowWrite.checked),
      allowDdlAdmin: !!(envPolicyProdAllowDdl && envPolicyProdAllowDdl.checked),
      requireApproval: !!(
        envPolicyProdRequireApproval && envPolicyProdRequireApproval.checked
      ),
    },
  });

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

  if (settingsErrorStopOnFirst) {
    settingsErrorStopOnFirst.addEventListener('change', () => {
      syncErrorModeInputs('stop');
      if (onErrorModeChange) onErrorModeChange('stop');
    });
  }

  if (settingsErrorContinueOnError) {
    settingsErrorContinueOnError.addEventListener('change', () => {
      syncErrorModeInputs('continue');
      if (onErrorModeChange) onErrorModeChange('continue');
    });
  }

  if (settingsSessionTimezoneToggle) {
    settingsSessionTimezoneToggle.addEventListener('click', () => {
      if (onTimezoneToggle) onTimezoneToggle();
    });
  }

  if (settingsSessionTimezone) {
    settingsSessionTimezone.addEventListener('focus', () => {
      if (onTimezoneFocus) onTimezoneFocus();
    });
    settingsSessionTimezone.addEventListener('input', () => {
      if (onTimezoneInput) onTimezoneInput(settingsSessionTimezone.value);
    });
    settingsSessionTimezone.addEventListener('keydown', (event) => {
      if (onTimezoneKeydown) onTimezoneKeydown(event);
    });
  }

  document.addEventListener('click', (event) => {
    if (onOutsideClick) onOutsideClick(event);
  });

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
    setSessionTimezoneMenuOpen,
    renderSessionTimezoneMenu,
    setSessionTimezoneValue,
    getSessionTimezoneValue,
    focusSessionTimezone,
    setErrorHandlingValues,
    getErrorHandlingValues,
    setConnectionTimeoutValues,
    getConnectionTimeoutValues,
    setQueryDefaultsValues,
    getQueryDefaultsValues,
    setEnvironmentPolicyValues,
    getEnvironmentPolicyValues,
  };
}
