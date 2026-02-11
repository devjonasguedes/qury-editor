// Theme manager - manages light/dark/system theme modes

const THEME_KEY = 'sqlEditor.theme';
const THEME_MODE_SYSTEM = 'system';
const THEME_MODE_LIGHT = 'light';
const THEME_MODE_DARK = 'dark';

export function createThemeManager({ api, onThemeChange }) {
  const toggle = document.getElementById('themeToggle');
  const menu = document.getElementById('themeMenu');

  let currentMode = THEME_MODE_SYSTEM;
  let systemPrefersDark = true;
  let nativeThemeListener = null;
  let codeEditor = null;
  let snippetEditor = null;

  const normalizeMode = (value) => {
    const mode = String(value || '').toLowerCase();
    if (mode === THEME_MODE_LIGHT || mode === THEME_MODE_DARK || mode === THEME_MODE_SYSTEM) {
      return mode;
    }
    return THEME_MODE_SYSTEM;
  };

  const resolveThemeFromMode = (mode) => {
    if (mode === THEME_MODE_LIGHT) return THEME_MODE_LIGHT;
    if (mode === THEME_MODE_DARK) return THEME_MODE_DARK;
    return systemPrefersDark ? THEME_MODE_DARK : THEME_MODE_LIGHT;
  };

  const themeModeLabel = (mode) => {
    if (mode === THEME_MODE_LIGHT) return 'Light';
    if (mode === THEME_MODE_DARK) return 'Dark';
    return 'System';
  };

  const themeModeIcon = (mode) => {
    if (mode === THEME_MODE_LIGHT) return 'bi-sun';
    if (mode === THEME_MODE_DARK) return 'bi-moon-stars';
    return 'bi-circle-half';
  };

  const applyTheme = (theme) => {
    const resolved = theme === THEME_MODE_LIGHT ? THEME_MODE_LIGHT : THEME_MODE_DARK;
    document.body.classList.toggle('theme-light', resolved === THEME_MODE_LIGHT);
    
    // Update code editors
    if (codeEditor && typeof codeEditor.setTheme === 'function') {
      codeEditor.setTheme();
      codeEditor.refresh();
    }
    if (snippetEditor && typeof snippetEditor.setTheme === 'function') {
      snippetEditor.setTheme();
      snippetEditor.refresh();
    }

    if (onThemeChange) {
      onThemeChange(resolved);
    }
  };

  const updateUI = () => {
    if (toggle) {
      toggle.innerHTML = `<i class="bi ${themeModeIcon(currentMode)}"></i>`;
      toggle.title = `Theme: ${themeModeLabel(currentMode)}`;
      toggle.setAttribute('aria-label', `Theme: ${themeModeLabel(currentMode)}`);
    }

    if (menu) {
      const items = menu.querySelectorAll('[data-theme-mode]');
      items.forEach((item) => {
        const selected = item.getAttribute('data-theme-mode') === currentMode;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-checked', selected ? 'true' : 'false');
      });
    }
  };

  const setMode = (mode, { persist = true } = {}) => {
    currentMode = normalizeMode(mode);
    
    if (persist) {
      localStorage.setItem(THEME_KEY, currentMode);
    }
    
    applyTheme(resolveThemeFromMode(currentMode));
    updateUI();
  };

  const setMenuOpen = (open) => {
    if (!menu || !toggle) return;
    menu.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const handleSystemThemeChange = (payload) => {
    if (!payload || typeof payload.shouldUseDarkColors !== 'boolean') return;
    systemPrefersDark = !!payload.shouldUseDarkColors;
    
    if (currentMode === THEME_MODE_SYSTEM) {
      applyTheme(resolveThemeFromMode(THEME_MODE_SYSTEM));
      updateUI();
    }
  };

  const init = async () => {
    // Load saved mode
    currentMode = normalizeMode(localStorage.getItem(THEME_KEY));

    // Get system theme preference
    if (api?.getNativeTheme) {
      try {
        const res = await api.getNativeTheme();
        if (res?.ok && typeof res.shouldUseDarkColors === 'boolean') {
          systemPrefersDark = !!res.shouldUseDarkColors;
        }
      } catch (err) {
        console.error('Failed to get native theme', err);
      }

      // Listen for system theme changes
      if (api.onNativeThemeUpdated) {
        nativeThemeListener = api.onNativeThemeUpdated(handleSystemThemeChange);
      }
    }

    // Apply initial theme
    setMode(currentMode, { persist: false });
  };

  const dispose = () => {
    if (nativeThemeListener) {
      nativeThemeListener();
      nativeThemeListener = null;
    }
  };

  // Event listeners
  if (toggle) {
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = menu && !menu.classList.contains('hidden');
      setMenuOpen(!isOpen);
    });
  }

  if (menu) {
    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-theme-mode]');
      if (!item) return;
      
      const mode = item.getAttribute('data-theme-mode');
      setMode(mode);
      setMenuOpen(false);
    });
  }

  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    if (!menu || !toggle) return;
    if (menu.classList.contains('hidden')) return;
    if (event.target === toggle || toggle.contains(event.target)) return;
    if (event.target === menu || menu.contains(event.target)) return;
    setMenuOpen(false);
  });

  return {
    init,
    dispose,
    setMode,
    getMode: () => currentMode,
    setMenuOpen,
    registerCodeEditor: (editor) => { codeEditor = editor; },
    registerSnippetEditor: (editor) => { snippetEditor = editor; },
  };
}
