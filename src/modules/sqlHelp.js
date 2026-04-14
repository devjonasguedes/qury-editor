const DEFAULT_SQL_HELP_ENTRIES = [
  {
    id: "select-basic",
    name: "SELECT",
    description: "Basic query with filter and limit",
    sql: `SELECT
  column1,
  column2
FROM table_name
WHERE condition
ORDER BY column1 DESC
LIMIT 100;`,
  },
  {
    id: "select-join",
    name: "SELECT with JOIN",
    description: "Join two tables",
    sql: `SELECT
  a.column1,
  b.column2
FROM table_a a
JOIN table_b b ON b.a_id = a.id
WHERE condition
ORDER BY a.column1 DESC
LIMIT 100;`,
  },
  {
    id: "select-group",
    name: "SELECT with GROUP BY",
    description: "Aggregate with HAVING",
    sql: `SELECT
  column1,
  COUNT(*) AS total
FROM table_name
WHERE condition
GROUP BY column1
HAVING COUNT(*) > 1
ORDER BY total DESC;`,
  },
  {
    id: "select-distinct",
    name: "SELECT DISTINCT",
    description: "Distinct values",
    sql: `SELECT DISTINCT column1
FROM table_name
WHERE condition
ORDER BY column1;`,
  },
  {
    id: "select-cte",
    name: "CTE (WITH)",
    description: "Common table expression",
    sql: `WITH recent AS (
  SELECT *
  FROM table_name
  WHERE created_at >= now() - interval '7 days'
)
SELECT *
FROM recent
ORDER BY created_at DESC;`,
    dialect: "Postgres",
  },
  {
    id: "insert-single",
    name: "INSERT",
    description: "Insert a single row",
    sql: `INSERT INTO table_name (column1, column2)
VALUES (value1, value2);`,
  },
  {
    id: "insert-multi",
    name: "INSERT (multiple rows)",
    description: "Insert multiple rows at once",
    sql: `INSERT INTO table_name (column1, column2)
VALUES
  (value1, value2),
  (value3, value4);`,
  },
  {
    id: "update",
    name: "UPDATE",
    description: "Update existing rows",
    sql: `UPDATE table_name
SET column1 = value1,
    column2 = value2
WHERE condition;`,
  },
  {
    id: "delete",
    name: "DELETE",
    description: "Delete rows that match a filter",
    sql: `DELETE FROM table_name
WHERE condition;`,
  },
  {
    id: "upsert-postgres",
    name: "UPSERT",
    description: "Insert or update on conflict",
    sql: `INSERT INTO table_name (id, column1, column2)
VALUES (id_value, value1, value2)
ON CONFLICT (id)
DO UPDATE SET
  column1 = EXCLUDED.column1,
  column2 = EXCLUDED.column2;`,
    dialect: "Postgres",
  },
  {
    id: "upsert-mysql",
    name: "UPSERT",
    description: "Insert or update on duplicate key",
    sql: `INSERT INTO table_name (id, column1, column2)
VALUES (id_value, value1, value2)
ON DUPLICATE KEY UPDATE
  column1 = VALUES(column1),
  column2 = VALUES(column2);`,
    dialect: "MySQL",
  },
  {
    id: "create-table",
    name: "CREATE TABLE",
    description: "Create a new table",
    sql: `CREATE TABLE table_name (
  id INTEGER PRIMARY KEY,
  column1 TEXT NOT NULL,
  column2 INTEGER,
  created_at TIMESTAMP
);`,
  },
  {
    id: "alter-table-add",
    name: "ALTER TABLE",
    description: "Add a new column",
    sql: `ALTER TABLE table_name
ADD COLUMN new_column TEXT;`,
  },
  {
    id: "create-index",
    name: "CREATE INDEX",
    description: "Add an index to speed up queries",
    sql: `CREATE INDEX idx_table_name_column1
ON table_name (column1);`,
  },
  {
    id: "transaction",
    name: "TRANSACTION",
    description: "Begin, commit, or rollback",
    sql: `BEGIN;
-- your statements here
COMMIT;
-- or ROLLBACK;`,
  },
  {
    id: "explain-postgres",
    name: "EXPLAIN ANALYZE",
    description: "Query plan with runtime",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM table_name
WHERE condition;`,
    dialect: "Postgres",
  },
  {
    id: "explain-mysql",
    name: "EXPLAIN",
    description: "Query plan",
    sql: `EXPLAIN
SELECT *
FROM table_name
WHERE condition;`,
    dialect: "MySQL",
  },
  {
    id: "explain-sqlite",
    name: "EXPLAIN QUERY PLAN",
    description: "Query plan",
    sql: `EXPLAIN QUERY PLAN
SELECT *
FROM table_name
WHERE condition;`,
    dialect: "SQLite",
  },
  {
    id: "list-tables-postgres",
    name: "List Tables",
    description: "List tables in all schemas",
    sql: `SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;`,
    dialect: "Postgres",
  },
  {
    id: "list-tables-mysql",
    name: "List Tables",
    description: "List tables in all schemas",
    sql: `SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY table_schema, table_name;`,
    dialect: "MySQL",
  },
  {
    id: "list-tables-sqlite",
    name: "List Tables",
    description: "List user tables",
    sql: `SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;`,
    dialect: "SQLite",
  },
  {
    id: "describe-table-info-schema",
    name: "Describe Table",
    description: "Columns and types (information_schema)",
    sql: `SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'table_name'
ORDER BY ordinal_position;`,
    dialect: "Postgres",
  },
  {
    id: "describe-table-mysql",
    name: "Describe Table",
    description: "Columns and types (information_schema)",
    sql: `SELECT column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'database_name'
  AND table_name = 'table_name'
ORDER BY ordinal_position;`,
    dialect: "MySQL",
  },
  {
    id: "describe-table-sqlite",
    name: "Describe Table",
    description: "Columns and types",
    sql: `PRAGMA table_info(table_name);`,
    dialect: "SQLite",
  },
];

const copyToClipboard = async (text) => {
  const value = String(text || "");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const temp = document.createElement("textarea");
  temp.value = value;
  temp.setAttribute("readonly", "true");
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.select();
  const success = document.execCommand("copy");
  document.body.removeChild(temp);
  return success;
};

export function createSqlHelp({
  sqlHelpBtn,
  sqlHelpPanel,
  sqlHelpCloseBtn,
  sqlHelpList,
  showToast,
  entries = DEFAULT_SQL_HELP_ENTRIES,
} = {}) {
  if (!sqlHelpList) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      render: () => {},
    };
  }

  const hasToggleControls = !!(sqlHelpBtn && sqlHelpPanel);

  const open = () => {
    if (!hasToggleControls) return;
    sqlHelpPanel.classList.remove("hidden");
    sqlHelpBtn.classList.add("active");
    sqlHelpBtn.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    if (!hasToggleControls) return;
    sqlHelpPanel.classList.add("hidden");
    sqlHelpBtn.classList.remove("active");
    sqlHelpBtn.setAttribute("aria-expanded", "false");
  };

  const toggle = () => {
    if (sqlHelpPanel.classList.contains("hidden")) {
      open();
    } else {
      close();
    }
  };

  const handleCopy = async (entry) => {
    try {
      const copied = await copyToClipboard(entry.sql);
      if (copied && typeof showToast === "function") {
        showToast(`Copied ${entry.name} template.`, 1400, "success");
      }
    } catch (_) {
      if (typeof showToast === "function") {
        showToast("Clipboard unavailable.", 1600, "error");
      }
    }
  };

  const render = () => {
    sqlHelpList.innerHTML = "";
    entries.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "sql-help-item";

      const header = document.createElement("div");
      header.className = "sql-help-item-header";

      const info = document.createElement("div");
      info.className = "sql-help-item-info";

      const titleRow = document.createElement("div");
      titleRow.className = "sql-help-item-title-row";

      const title = document.createElement("div");
      title.className = "sql-help-item-title";
      title.textContent = entry.name;

      titleRow.appendChild(title);

      if (entry.dialect) {
        const badge = document.createElement("span");
        badge.className = "sql-help-badge";
        badge.textContent = entry.dialect;
        titleRow.appendChild(badge);
      }

      const desc = document.createElement("div");
      desc.className = "sql-help-item-desc";
      desc.textContent = entry.description || "";

      info.appendChild(titleRow);
      if (entry.description) info.appendChild(desc);

      const actions = document.createElement("div");
      actions.className = "sql-help-actions";

      const copyBtn = document.createElement("button");
      copyBtn.className = "icon-btn mini";
      copyBtn.title = `Copy ${entry.name}`;
      copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
      copyBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await handleCopy(entry);
      });

      actions.appendChild(copyBtn);

      header.appendChild(info);
      header.appendChild(actions);

      const code = document.createElement("pre");
      code.className = "sql-help-code";
      code.textContent = entry.sql || "";

      item.appendChild(header);
      item.appendChild(code);
      sqlHelpList.appendChild(item);
    });
  };

  if (hasToggleControls) {
    sqlHelpBtn.addEventListener("click", (event) => {
      event.preventDefault();
      toggle();
    });
  }

  if (hasToggleControls && sqlHelpCloseBtn) {
    sqlHelpCloseBtn.addEventListener("click", () => {
      close();
    });
  }

  if (hasToggleControls) {
    document.addEventListener("click", (event) => {
      if (sqlHelpPanel.classList.contains("hidden")) return;
      if (sqlHelpPanel.contains(event.target)) return;
      if (sqlHelpBtn.contains(event.target)) return;
      close();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && hasToggleControls) close();
  });

  render();

  return {
    open,
    close,
    toggle,
    render,
  };
}
