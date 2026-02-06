export function getField(row, candidates) {
  for (const key of candidates) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  const lower = Object.keys(row || {}).reduce((acc, k) => {
    acc[k.toLowerCase()] = row[k];
    return acc;
  }, {});
  for (const key of candidates) {
    const val = lower[key.toLowerCase()];
    if (val !== undefined) return val;
  }
  return undefined;
}

export function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}
