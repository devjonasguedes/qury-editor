export function createTabConnections({ container, getTitle, onSelect, onClose }) {
  const entries = new Map();
  const order = [];
  let activeKey = null;

  const render = () => {
    if (!container) return;
    container.innerHTML = '';
    container.classList.toggle('hidden', entries.size === 0);
    if (entries.size === 0) return;

    order.forEach((key) => {
      const entry = entries.get(key);
      if (!entry) return;
      const tab = document.createElement('div');
      tab.className = 'conn-tab';
      if (key === activeKey) tab.classList.add('active');

      const label = document.createElement('span');
      label.textContent = getTitle ? getTitle(entry) : String(key);
      label.addEventListener('click', () => {
        const previousKey = activeKey;
        activeKey = key;
        render();
        if (onSelect) onSelect(key, entry, previousKey);
      });

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'conn-tab-close';
      closeBtn.innerHTML = '<i class="bi bi-x"></i>';
      closeBtn.title = 'Close connection';
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (onClose) onClose(key, entry);
      });

      tab.appendChild(label);
      tab.appendChild(closeBtn);
      container.appendChild(tab);
    });
  };

  const upsert = (key, entry) => {
    if (!key) return;
    if (!entries.has(key)) {
      order.push(key);
    }
    entries.set(key, entry);
    activeKey = key;
    render();
  };

  const remove = (key) => {
    if (!entries.has(key)) return;
    entries.delete(key);
    const idx = order.indexOf(key);
    if (idx >= 0) order.splice(idx, 1);
    if (activeKey === key) activeKey = null;
    render();
  };

  const has = (key) => entries.has(key);
  const size = () => entries.size;
  const getActiveKey = () => activeKey;
  const setActive = (key) => {
    activeKey = key || null;
    render();
  };
  const clearActive = () => setActive(null);
  const getEntry = (key) => entries.get(key) || null;
  const getFirstEntry = () => {
    if (order.length === 0) return null;
    return entries.get(order[0]) || null;
  };

  return {
    render,
    upsert,
    remove,
    has,
    size,
    getActiveKey,
    setActive,
    clearActive,
    getEntry,
    getFirstEntry
  };
}
