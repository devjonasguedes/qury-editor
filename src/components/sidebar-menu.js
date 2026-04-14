// Sidebar menu component - handles Tree/History/Snippets icons

export function createSidebarMenu({
  onChange,
  onShowHistory,
  onShowSnippets,
  onShowSqlHelp,
  initialView = "tree",
  panels = {},
} = {}) {
  const treeBtn = document.getElementById("sidebarTreeBtn");
  const historyBtn = document.getElementById("sidebarHistoryBtn");
  const snippetsBtn = document.getElementById("sidebarSnippetsBtn");
  const sqlHelpBtn = document.getElementById("sidebarSqlHelpBtn");
  const sidebar =
    panels.sidebar ||
    document.getElementById("sidebar") ||
    document.querySelector(".tables");
  const sidebarResizer =
    panels.sidebarResizer || document.getElementById("sidebarResizer");
  const tablePanel = panels.tablePanel || document.getElementById("tablePanel");
  const historyPanel =
    panels.historyPanel || document.getElementById("historyPanel");
  const snippetsPanel =
    panels.snippetsPanel || document.getElementById("snippetsPanel");
  const sqlHelpPanel = panels.sqlHelpPanel || document.getElementById("sqlHelpPanel");

  const normalizeView = (view) =>
    view === "history"
      ? "history"
      : view === "snippets"
        ? "snippets"
        : view === "sqlhelp"
          ? "sqlhelp"
          : "tree";

  let activeView = normalizeView(initialView);
  let isCollapsed = false;

  const setActiveButtons = () => {
    if (treeBtn) treeBtn.classList.toggle("active", !isCollapsed && activeView === "tree");
    if (historyBtn)
      historyBtn.classList.toggle("active", !isCollapsed && activeView === "history");
    if (snippetsBtn)
      snippetsBtn.classList.toggle("active", !isCollapsed && activeView === "snippets");
    if (sqlHelpBtn)
      sqlHelpBtn.classList.toggle("active", !isCollapsed && activeView === "sqlhelp");
  };

  const applyPanels = () => {
    if (tablePanel) tablePanel.classList.toggle("hidden", isCollapsed || activeView !== "tree");
    if (historyPanel)
      historyPanel.classList.toggle("hidden", isCollapsed || activeView !== "history");
    if (snippetsPanel)
      snippetsPanel.classList.toggle("hidden", isCollapsed || activeView !== "snippets");
    if (sqlHelpPanel)
      sqlHelpPanel.classList.toggle("hidden", isCollapsed || activeView !== "sqlhelp");
    if (sidebar) sidebar.classList.toggle("hidden", isCollapsed);
    if (sidebarResizer) sidebarResizer.classList.toggle("hidden", isCollapsed);
  };

  const setCollapsed = (next, { notify = true } = {}) => {
    isCollapsed = !!next;
    setActiveButtons();
    applyPanels();
    if (notify && onChange) onChange(isCollapsed ? null : activeView);
  };

  const setView = (view, { notify = true } = {}) => {
    activeView = normalizeView(view);
    isCollapsed = false;
    setActiveButtons();
    applyPanels();
    if (activeView === "history" && onShowHistory) onShowHistory();
    if (activeView === "snippets" && onShowSnippets) onShowSnippets();
    if (activeView === "sqlhelp" && onShowSqlHelp) onShowSqlHelp();
    if (notify && onChange) onChange(activeView);
    return activeView;
  };

  const toggleView = (view) => {
    const next = normalizeView(view);
    if (!isCollapsed && activeView === next) {
      setCollapsed(true);
      return null;
    }
    return setView(next);
  };

  if (treeBtn) {
    treeBtn.addEventListener("click", () => toggleView("tree"));
  }

  if (historyBtn) {
    historyBtn.addEventListener("click", () => toggleView("history"));
  }

  if (snippetsBtn) {
    snippetsBtn.addEventListener("click", () => toggleView("snippets"));
  }

  if (sqlHelpBtn) {
    sqlHelpBtn.addEventListener("click", () => toggleView("sqlhelp"));
  }

  setView(activeView, { notify: false });

  return {
    setView,
    setCollapsed,
    getActive: () => activeView,
  };
}
