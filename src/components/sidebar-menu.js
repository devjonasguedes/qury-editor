// Sidebar menu component - handles Tree/History/Snippets icons

export function createSidebarMenu({
  onChange,
  onShowHistory,
  onShowSnippets,
  initialView = "tree",
  panels = {},
} = {}) {
  const treeBtn = document.getElementById("sidebarTreeBtn");
  const historyBtn = document.getElementById("sidebarHistoryBtn");
  const snippetsBtn = document.getElementById("sidebarSnippetsBtn");
  const tablePanel = panels.tablePanel || document.getElementById("tablePanel");
  const historyPanel =
    panels.historyPanel || document.getElementById("historyPanel");
  const snippetsPanel =
    panels.snippetsPanel || document.getElementById("snippetsPanel");

  const normalizeView = (view) =>
    view === "history" ? "history" : view === "snippets" ? "snippets" : "tree";

  let activeView = normalizeView(initialView);

  const setActive = (view) => {
    activeView = normalizeView(view);
    if (treeBtn) treeBtn.classList.toggle("active", activeView === "tree");
    if (historyBtn)
      historyBtn.classList.toggle("active", activeView === "history");
    if (snippetsBtn)
      snippetsBtn.classList.toggle("active", activeView === "snippets");
    return activeView;
  };

  const setView = (view, { notify = true } = {}) => {
    const next = setActive(view);
    if (tablePanel) tablePanel.classList.toggle("hidden", next !== "tree");
    if (historyPanel) historyPanel.classList.toggle("hidden", next !== "history");
    if (snippetsPanel)
      snippetsPanel.classList.toggle("hidden", next !== "snippets");
    if (next === "history" && onShowHistory) onShowHistory();
    if (next === "snippets" && onShowSnippets) onShowSnippets();
    if (notify && onChange) onChange(next);
    return next;
  };

  if (treeBtn) {
    treeBtn.addEventListener("click", () => setView("tree"));
  }

  if (historyBtn) {
    historyBtn.addEventListener("click", () => setView("history"));
  }

  if (snippetsBtn) {
    snippetsBtn.addEventListener("click", () => setView("snippets"));
  }

  setView(activeView, { notify: false });

  return {
    setView,
    setActive,
    getActive: () => activeView,
  };
}
