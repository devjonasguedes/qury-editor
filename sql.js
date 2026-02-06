export function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-') {
        inLineComment = true;
        current += ch + next;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        current += ch + next;
        i++;
        continue;
      }
    }

    if (!inDouble && !inBacktick && ch === "'") {
      if (inSingle && next === "'") {
        current += ch + next;
        i++;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inSingle && !inBacktick && ch === '"') {
      if (inDouble && next === '"') {
        current += ch + next;
        i++;
        continue;
      }
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export function stripLeadingComments(sql) {
  let s = sql;
  let changed = true;
  while (changed) {
    changed = false;
    s = s.trimStart();
    if (s.startsWith('--')) {
      const idx = s.indexOf('\n');
      s = idx === -1 ? '' : s.slice(idx + 1);
      changed = true;
      continue;
    }
    if (s.startsWith('/*')) {
      const idx = s.indexOf('*/');
      s = idx === -1 ? '' : s.slice(idx + 2);
      changed = true;
    }
  }
  return s.trimStart();
}

export function firstDmlKeyword(sql) {
  const s = stripLeadingComments(sql).toLowerCase();
  if (!s) return '';
  if (s.startsWith('with')) {
    const match = s.match(/\b(select|update|insert|delete)\b/);
    return match ? match[1] : '';
  }
  const match = s.match(/^(select|update|insert|delete)\b/);
  return match ? match[1] : '';
}

export function hasMultipleStatementsWithSelect(sqlText) {
  const statements = splitStatements(sqlText);
  if (statements.length <= 1) return false;
  return statements.some((stmt) => firstDmlKeyword(stmt) === 'select');
}

export function insertWhere(sqlText, filter) {
  if (!filter) return sqlText;
  if (firstDmlKeyword(sqlText) !== 'select') return sqlText;

  const clean = sqlText.trim().replace(/;$/, '');
  const upper = clean.toUpperCase();
  const whereIndex = upper.lastIndexOf(' WHERE ');
  const orderIndex = upper.lastIndexOf(' ORDER BY ');
  const limitIndex = upper.lastIndexOf(' LIMIT ');
  const offsetIndex = upper.lastIndexOf(' OFFSET ');
  let cutIndex = -1;
  [orderIndex, limitIndex, offsetIndex].forEach((idx) => {
    if (idx !== -1) {
      cutIndex = cutIndex === -1 ? idx : Math.min(cutIndex, idx);
    }
  });

  let base = clean;
  let suffix = '';
  if (cutIndex !== -1) {
    base = clean.slice(0, cutIndex).trimEnd();
    suffix = clean.slice(cutIndex).trimStart();
  }

  if (whereIndex !== -1) {
    return `${base} AND (${filter}) ${suffix}`.trim() + ';';
  }
  return `${base} WHERE ${filter} ${suffix}`.trim() + ';';
}

export function isDangerousStatement(sqlText) {
  const cleaned = stripLeadingComments(sqlText).trim();
  if (!cleaned) return false;
  const upper = cleaned.toUpperCase();
  if (upper.startsWith('DROP ')) return true;
  if (upper.startsWith('DELETE')) {
    return !/\bWHERE\b/.test(upper);
  }
  return false;
}
