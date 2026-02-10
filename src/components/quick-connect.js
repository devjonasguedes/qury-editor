// Quick connect button component

export function createQuickConnect({ onQuickConnect }) {
  const openModalBtn = document.getElementById("openConnectModalBtn");
  const quickConnectBtn = document.getElementById("quickConnectBtn");

  if (openModalBtn && onQuickConnect) {
    openModalBtn.addEventListener("click", () => {
      onQuickConnect("full");
    });
  }

  if (quickConnectBtn && onQuickConnect) {
    quickConnectBtn.addEventListener("click", () => {
      onQuickConnect("quick");
    });
  }

  return {
    setDisabled: (disabled) => {
      if (openModalBtn) openModalBtn.disabled = disabled;
      if (quickConnectBtn) quickConnectBtn.disabled = disabled;
    },
  };
}
