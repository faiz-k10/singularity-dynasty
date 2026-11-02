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

// Parses CSV text (the inverse of toCsv): quoted fields with doubled quotes, commas and newlines inside quotes, \r\n or \n line ends,
// a UTF-8 BOM. Returns an array of row arrays; blank lines are skipped. Used by /admin's board upload.
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}
