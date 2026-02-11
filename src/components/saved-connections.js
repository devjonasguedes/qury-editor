import { connectionsApi } from "../api/connections.js";

export function createSavedConnections({
  getEntryPolicyMode,
  isEntryReadOnly,
  isEntrySsh,
  connectionTitle,
  formatSavedPolicyFilterLabel,
  getSavedPolicyFilter,
  showToast,
  showError,
}) {
  const savedList = document.getElementById("savedList");
  const savedPolicyFilters = document.getElementById("savedPolicyFilters");
  const importConnectionsBtn = document.getElementById("importConnectionsBtn");
  const exportConnectionsBtn = document.getElementById("exportConnectionsBtn");

  const setLoading = (loading) => {
    const isLoading = !!loading;
    if (importConnectionsBtn) importConnectionsBtn.disabled = isLoading;
    if (exportConnectionsBtn) exportConnectionsBtn.disabled = isLoading;
    if (savedList) savedList.classList.toggle("is-connecting", isLoading);
  };

  const renderSavedList = async () => {
    if (!savedList) return;
    let entries = [];
    try {
      entries = await connectionsApi.getConnections();
    } catch (err) {
      console.error("Failed to list saved connections", err);
    }
    const filterMode = getSavedPolicyFilter ? getSavedPolicyFilter() : "all";
    const filtered =
      filterMode === "all"
        ? entries
        : entries.filter((entry) => getEntryPolicyMode(entry) === filterMode);
    savedList.innerHTML = "";
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "No saved connections.";
      savedList.appendChild(empty);
      return;
    }
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = `No saved connections for ${formatSavedPolicyFilterLabel(filterMode)}.`;
      savedList.appendChild(empty);
      return;
    }

    filtered.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "saved-item";

      const info = document.createElement("div");
      info.className = "saved-info";

      const title = document.createElement("div");
      title.className = "saved-title";
      title.textContent = entry.name || connectionTitle(entry);

      const meta = document.createElement("div");
      meta.className = "saved-meta";
      const metaMain = document.createElement("span");
      metaMain.className = "saved-meta-main";
      const rawType = String(entry.type || "")
        .trim()
        .toLowerCase();
      const typeLabel = rawType.toUpperCase();
      const sqlitePath = entry.filePath || entry.file_path || entry.path || "";
      const hostLabel = entry.port
        ? `${entry.host}:${entry.port}`
        : `${entry.host}`;
      const baseLabel =
        rawType === "sqlite" ? sqlitePath || "Local file" : hostLabel;
      const segments = [typeLabel, baseLabel];
      if (rawType !== "sqlite" && entry.database)
        segments.push(String(entry.database));
      metaMain.textContent = segments.filter(Boolean).join(" • ");

      const badges = document.createElement("div");
      badges.className = "saved-badges";
      const appendBadge = (text, variant = "") => {
        const badge = document.createElement("span");
        badge.className = variant ? `saved-badge ${variant}` : "saved-badge";
        badge.textContent = text;
        badges.appendChild(badge);
      };

      const policy = String(getEntryPolicyMode(entry) || "dev").toLowerCase();
      appendBadge(policy.toUpperCase(), `is-${policy}`);
      if (isEntryReadOnly(entry)) appendBadge("RO", "is-readonly");
      if (isEntrySsh(entry)) appendBadge("SSH", "is-ssh");

      meta.appendChild(metaMain);
      meta.appendChild(badges);

      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "saved-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn";
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editBtn.title = "Edit";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-btn";
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.title = "Delete";

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      info.addEventListener("click", async () => {
        document.dispatchEvent(
          new CustomEvent("saved:connect", { detail: entry }),
        );
      });

      editBtn.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("saved:edit", { detail: entry }),
        );
      });

      deleteBtn.addEventListener("click", async () => {
        const name = entry.name || connectionTitle(entry);
        const confirmed = confirm(`Remove connection "${name}"?`);
        if (!confirmed) return;
        try {
          await connectionsApi.deleteConnection(entry.name);
        } catch (err) {
          console.error("Failed to delete connection", err);
          if (showError) showError("Failed to delete saved connection.");
        }
        document.dispatchEvent(
          new CustomEvent("saved:deleted", { detail: entry }),
        );
        await renderSavedList();
      });

      savedList.appendChild(item);
    });
  };

  if (savedPolicyFilters) {
    savedPolicyFilters.addEventListener("change", (event) => {
      const target = event && event.target ? event.target : null;
      if (!target || target.name !== "savedPolicyFilter") return;
      void renderSavedList();
    });
  }

  if (exportConnectionsBtn) {
    exportConnectionsBtn.addEventListener("click", async () => {
      try {
        if (showToast) showToast("Opening save dialog...");
        const res = await connectionsApi.exportConnections();
        if (res?.canceled) return;
        if (showToast) showToast(`Exported ${res?.count || 0} connection(s)`);
      } catch (err) {
        const message = err && err.message ? err.message : "";
        console.error("Failed to export", err);
        if (
          message.includes("No handler registered for 'connections:export'")
        ) {
          if (showError)
            showError(
              "Export unavailable in this running process. Restart the app and try again.",
            );
          return;
        }
        if (showError) showError("Failed to export saved connections.");
      }
    });
  }

  if (importConnectionsBtn) {
    importConnectionsBtn.addEventListener("click", async () => {
      try {
        const confirmed = confirm(
          "Importar conexoes pode atualizar conexoes existentes com o mesmo nome ou configuracao similar. Deseja continuar?",
        );
        if (!confirmed) return;
        const res = await connectionsApi.importConnections();
        if (res?.canceled) return;
        if (showToast) {
          const added = Number(res?.added);
          const updated = Number(res?.updated);
          if (Number.isFinite(added) || Number.isFinite(updated)) {
            showToast(
              `Imported ${Number.isFinite(added) ? added : 0} new, updated ${Number.isFinite(updated) ? updated : 0}`,
            );
          } else {
            showToast(`Imported ${res?.count || 0} connection(s)`);
          }
        }
        await renderSavedList();
      } catch (err) {
        const message = err && err.message ? err.message : "";
        console.error("Failed to import", err);
        if (
          message.includes("No handler registered for 'connections:import'")
        ) {
          if (showError)
            showError(
              "Import unavailable in this running process. Restart the app and try again.",
            );
          return;
        }
        if (showError) showError("Failed to import saved connections.");
      }
    });
  }

  return {
    renderSavedList,
    setLoading,
  };
}
