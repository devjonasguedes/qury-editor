// Centralized access to namespaced preload APIs
// Import this service in any module that needs access to window.api.*

export const apiService = {
  get db() {
    if (typeof window === 'undefined' || !window.api?.db) {
      throw new Error('Preload API `window.api.db` is not available.');
    }
    return window.api.db;
  },

  get electron() {
    if (typeof window === 'undefined' || !window.api?.electron) {
      throw new Error('Preload API `window.api.electron` is not available.');
    }
    return window.api.electron;
  }
};

export default apiService;
