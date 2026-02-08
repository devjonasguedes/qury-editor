function parseStatements(sql) {
  const source = String(sql || '');
  const statements = [];
  let segmentStart = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  const pushStatement = (start, end) => {
    const raw = source.slice(start, end);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const leadingWs = raw.length - raw.trimStart().length;
    const trailingWs = raw.length - raw.trimEnd().length;
    const stmtStart = start + leadingWs;
    const stmtEnd = end - trailingWs;
    if (stmtEnd <= stmtStart) return;
    statements.push({
      text: trimmed,
      start: stmtStart,
      end: stmtEnd
    });
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (!inDouble && !inBacktick && ch === "'") {
      if (inSingle && next === "'") {
        i++;
        continue;
      }
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && !inBacktick && ch === '"') {
      if (inDouble && next === '"') {
        i++;
        continue;
      }
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && ch === ';') {
      pushStatement(segmentStart, i);
      segmentStart = i + 1;
      continue;
    }
  }

  pushStatement(segmentStart, source.length);
  return statements;
}

export function splitStatements(sql) {
  return parseStatements(sql).map((item) => item.text);
}

export function splitStatementsWithRanges(sql) {
  return parseStatements(sql).map((item) => ({
    text: item.text,
    start: item.start,
    end: item.end
  }));
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
  if (upper.startsWith('TRUNCATE ')) return true;
  if (upper.startsWith('DELETE')) {
    return !/\bWHERE\b/.test(upper);
  }
  if (upper.startsWith('UPDATE')) {
    return !/\bWHERE\b/.test(upper);
  }
  return false;
}
