function buildIndexes(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const name = row.index_name || row.indexname || row.name;
    if (!name) return;
    let entry = map.get(name);
    if (!entry) {
      entry = {
        name,
        unique: row.is_unique !== undefined ? !!row.is_unique : row.non_unique !== undefined ? Number(row.non_unique) === 0 : false,
        primary: row.is_primary !== undefined ? !!row.is_primary : name === 'PRIMARY',
        method: row.index_method || row.index_type || row.method || '',
        columns: []
      };
      map.set(name, entry);
    }
    if (Array.isArray(row.columns) && row.columns.length) {
      entry.columns = row.columns.slice();
      return;
    }
    const col = row.column_name;
    if (col) entry.columns.push(col);
  });
  const indexes = Array.from(map.values());
  indexes.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return indexes;
}

function buildConstraints(rows, checkRows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const name = row.constraint_name;
    if (!name) return;
    let entry = map.get(name);
    if (!entry) {
      entry = {
        name,
        type: row.constraint_type || '',
        columns: [],
        ref: null,
        definition: null
      };
      map.set(name, entry);
    }
    const col = row.column_name;
    if (col && !entry.columns.includes(col)) entry.columns.push(col);
    const refTable = row.referenced_table_name;
    if (refTable) {
      if (!entry.ref) {
        entry.ref = {
          schema: row.referenced_table_schema || '',
          table: refTable,
          columns: []
        };
      }
      const refCol = row.referenced_column_name;
      if (refCol) entry.ref.columns.push(refCol);
    }
  });
  (checkRows || []).forEach((row) => {
    const name = row.constraint_name;
    if (!name) return;
    let entry = map.get(name);
    if (!entry) {
      entry = {
        name,
        type: 'CHECK',
        columns: [],
        ref: null,
        definition: null
      };
      map.set(name, entry);
    }
    entry.definition = row.check_clause;
  });
  const constraints = Array.from(map.values());
  constraints.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return constraints;
}

function buildTriggers(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const name = row.trigger_name || row.Trigger || row.name;
    if (!name) return;
    let entry = map.get(name);
    if (!entry) {
      entry = {
        name,
        timing: row.action_timing || row.Timing || row.timing || '',
        events: new Set(),
        statement: row.action_statement || row.Statement || row.statement || ''
      };
      map.set(name, entry);
    }
    const event = row.event_manipulation || row.Event || row.event || '';
    if (event) entry.events.add(String(event).toUpperCase());
    if (!entry.timing && row.action_timing) entry.timing = row.action_timing;
    if (!entry.statement && row.action_statement) entry.statement = row.action_statement;
  });
  const triggers = Array.from(map.values()).map((item) => ({
    name: item.name,
    timing: item.timing || '',
    event: Array.from(item.events).join(', '),
    statement: item.statement || ''
  }));
  triggers.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return triggers;
}

module.exports = {
  buildIndexes,
  buildConstraints,
  buildTriggers
};
