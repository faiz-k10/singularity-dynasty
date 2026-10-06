// Same quoting rule the in-page CSV exporter (InteractiveScript.js) uses:
// a value containing a comma, quote or newline is wrapped in quotes with
// inner quotes doubled; null/undefined become an empty cell.
export function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// columns: [{ key, label }]; rows: objects. Header row first, "\n" between lines.
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(row[c.key])).join(","));
  return lines.join("\n");
}
