export function createToast({ element, hideDelay = 200 } = {}) {
  let toastEl = element || null;
  let toastTimer = null;
  const TYPE_CLASSES = ["toast--success", "toast--info", "toast--error"];

  const normalizeOptions = (options, fallbackType = "success") => {
    if (options && typeof options === "object") {
      return {
        duration: Number.isFinite(options.duration) ? options.duration : 1600,
        type: options.type || fallbackType,
      };
    }
    if (typeof options === "string") {
      return { duration: 1600, type: options };
    }
    if (Number.isFinite(options)) {
      return { duration: options, type: fallbackType };
    }
    return { duration: 1600, type: fallbackType };
  };

  const applyType = (type) => {
    if (!toastEl) return;
    TYPE_CLASSES.forEach((cls) => toastEl.classList.remove(cls));
    const normalized = type === "error" || type === "info" ? type : "success";
    toastEl.classList.add(`toast--${normalized}`);
  };

  const show = (message, options) => {
    if (!toastEl || !message) return;
    const { duration, type } = normalizeOptions(options);
    applyType(type);
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => {
        toastEl.classList.add("hidden");
      }, hideDelay);
    }, duration);
  };

  const setElement = (next) => {
    toastEl = next || null;
  };

  return {
    show,
    setElement,
  };
}
