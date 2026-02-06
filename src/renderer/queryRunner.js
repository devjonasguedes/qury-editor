export function createQueryRunner({
  safeApi,
  splitStatements,
  stripLeadingComments,
  firstDmlKeyword,
  hasMultipleStatementsWithSelect,
  insertWhere,
  isDangerousStatement,
  applyLimit,
  buildOrderBy,
  getTimeoutMs,
  getQueryValue,
  getWhereFilter,
  getActiveTab,
  ensureActiveTab,
  ensureConnected,
  isReadOnly,
  isTableTab,
  isTableEditor,
  isLoading,
  setLoading,
  setQueryStatus,
  showError,
  getResultsSnapshot,
  restoreResultsSnapshot,
  onResults,
  onEmptyResults,
  onHistory
}) {
  function confirmDangerous(statements) {
    const risky = statements.filter((stmt) => isDangerousStatement(stmt));
    if (risky.length === 0) return true;
    const summary = risky
      .map((stmt) => stripLeadingComments(stmt).trim().split('\n')[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('\n');
    return confirm(
      `Atenção: você está executando ${risky.length} comando(s) perigoso(s) (DELETE/DROP sem WHERE).\nDeseja continuar?\n\n${summary}`
    );
  }

  function isReadOnlyViolation(sqlText) {
    if (!isReadOnly()) return false;
    const statements = splitStatements(sqlText || '');
    if (statements.length === 0) return false;
    return statements.some((stmt) => {
      const cleaned = stripLeadingComments(stmt).trim();
      if (!cleaned) return false;
      const key = firstDmlKeyword(cleaned);
      if (key) return key !== 'select';
      const upper = cleaned.toUpperCase();
      if (upper.startsWith('SELECT')) return false;
      if (upper.startsWith('WITH')) {
        const withKey = firstDmlKeyword(cleaned);
        return withKey && withKey !== 'select';
      }
      if (upper.startsWith('SHOW')) return false;
      if (upper.startsWith('DESCRIBE')) return false;
      if (upper.startsWith('EXPLAIN')) return false;
      return true;
    });
  }

  function applyQueryModifiers(sqlText) {
    const tab = getActiveTab();
    if (isTableTab(tab) && !isTableEditor(tab)) {
      const withWhere = insertWhere(sqlText, getWhereFilter());
      return applyLimit(withWhere);
    }
    return applyLimit(sqlText);
  }

  function buildTableSql(tab) {
    if (!tab) return '';
    const base = tab.baseQuery || tab.query || '';
    const filter = tab.filter || '';
    let sql = insertWhere(base, filter);
    if (tab.sort && tab.sort.column) {
      sql = buildOrderBy(sql, tab.sort.column, tab.sort.direction || 'asc');
    }
    return applyLimit(sql);
  }

  function buildCountSql(tab) {
    if (!tab) return '';
    const base = (tab.baseQuery || tab.query || '').trim();
    if (!base) return '';
    const clean = base.replace(/;$/, '');
    const upper = clean.toUpperCase();
    const fromIndex = upper.indexOf(' FROM ');
    if (fromIndex === -1) return '';
    const fromClause = clean.slice(fromIndex);
    const countBase = `SELECT COUNT(*) AS total${fromClause}`;
    return insertWhere(countBase, tab.filter || '');
  }

  function hasNonSelect(statements) {
    return statements.some((stmt) => {
      const key = firstDmlKeyword(stmt);
      return key && key !== 'select';
    });
  }

  async function runTableTabQuery(tab) {
    if (!tab) return;
    tab.filter = getWhereFilter();
    const sql = buildTableSql(tab);
    await runQuery(sql, { storeQuery: false });
  }

  async function runQuery(sql, options = {}) {
    if (isLoading()) return;
    const tab = ensureActiveTab();
    if (!tab) {
      await showError('Conecte para executar queries.');
      return;
    }
    const ok = await ensureConnected();
    if (!ok) return;
    const storeQuery = options.storeQuery !== false;
    if (tab) {
      if (storeQuery && !isTableTab(tab)) {
        tab.query = sql;
      } else if (isTableTab(tab)) {
        tab.lastQuery = sql;
      }
    }
    const snapshot = getResultsSnapshot ? getResultsSnapshot() : null;
    const start = performance.now();
    setLoading(true);
    let res;
    try {
      res = await safeApi.runQuery({ sql, timeoutMs: getTimeoutMs() });
    } finally {
      setLoading(false);
    }
    if (!res || !res.ok) {
      if (snapshot && restoreResultsSnapshot) restoreResultsSnapshot(snapshot);
      const duration = performance.now() - start;
      if (setQueryStatus) {
        setQueryStatus({ state: 'error', message: (res && res.error) || 'Erro ao executar query.', duration });
      }
      await showError((res && res.error) || 'Erro ao executar query.');
      return;
    }
    tab.rows = res.rows;
    if (onResults) onResults(res.rows, res.totalRows, tab);
    if (onHistory) onHistory(sql);
    const duration = performance.now() - start;
    if (setQueryStatus) {
      setQueryStatus({ state: 'success', duration });
    }
  }

  async function runQueriesSequential(sqlText) {
    if (isReadOnlyViolation(sqlText)) {
      await showError('Conexão em modo somente leitura. Comandos de escrita estão bloqueados.');
      return false;
    }
    const statements = splitStatements(sqlText);
    if (statements.length === 0) {
      await showError('Query vazia.');
      return false;
    }
    if (!confirmDangerous(statements)) {
      return false;
    }
    if (statements.length === 1) {
      const tab = ensureActiveTab();
      if (!tab) {
        await showError('Conecte para executar queries.');
        return false;
      }
      await runQuery(applyQueryModifiers(statements[0]), {
        storeQuery: tab ? !isTableTab(tab) : true
      });
      return true;
    }

    if (isLoading()) return false;
    const tab = ensureActiveTab();
    if (!tab) {
      await showError('Conecte para executar queries.');
      return false;
    }
    if (tab && !isTableTab(tab)) tab.query = sqlText;

    const snapshot = getResultsSnapshot ? getResultsSnapshot() : null;
    const start = performance.now();
    setLoading(true);
    let lastRows = null;
    let lastTotalRows = 0;
    try {
      for (const stmt of statements) {
        const res = await safeApi.runQuery({ sql: applyQueryModifiers(stmt), timeoutMs: getTimeoutMs() });
        if (!res || !res.ok) {
          throw new Error((res && res.error) || 'Erro ao executar query.');
        }
        lastRows = res.rows;
        lastTotalRows = res.totalRows || 0;
      }
    } catch (err) {
      if (snapshot && restoreResultsSnapshot) restoreResultsSnapshot(snapshot);
      const duration = performance.now() - start;
      if (setQueryStatus) {
        setQueryStatus({ state: 'error', message: err && err.message ? err.message : 'Erro ao executar query.', duration });
      }
      await showError(err && err.message ? err.message : 'Erro ao executar query.');
      return false;
    } finally {
      setLoading(false);
    }

    if (lastRows) {
      tab.rows = lastRows;
      if (onResults) onResults(lastRows, lastTotalRows, tab);
    } else if (onEmptyResults) {
      onEmptyResults();
    }
    const duration = performance.now() - start;
    if (setQueryStatus) {
      setQueryStatus({ state: 'success', duration });
    }
    return true;
  }

  async function safeRunQueries(sqlText) {
    try {
      return await runQueriesSequential(sqlText);
    } catch (err) {
      await showError(err && err.message ? err.message : 'Erro ao executar query.');
      return false;
    }
  }

  return {
    isReadOnlyViolation,
    hasNonSelect,
    hasMultipleStatementsWithSelect,
    buildTableSql,
    buildCountSql,
    applyQueryModifiers,
    runQuery,
    runQueriesSequential,
    safeRunQueries,
    runTableTabQuery
  };
}
