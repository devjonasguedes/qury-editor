// Simple toast helper for renderer
let toastHandler = null;

/**
 * API for toast notifications
 * @type {Object}
 * @property {Function} show - Shows a toast message
 * @param {string} message - Message to display
 * @param {number} duration - Duration in ms
 */
export const toastApi = {
  setHandler: (handler) => {
    toastHandler = typeof handler === "function" ? handler : null;
  },
  show: (message, options, type) => {
    if (!toastHandler) return;
    if (typeof options === "number") {
      return toastHandler(message, { duration: options, type });
    }
    if (typeof options === "string") {
      return toastHandler(message, { duration: 1600, type: options });
    }
    return toastHandler(message, options);
  },
};

export default toastApi;
