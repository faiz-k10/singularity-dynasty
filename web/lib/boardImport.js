import { parseCsv } from "./csv.js";

// /admin's "upload a board": a CSV (exported from a spreadsheet) -> rows for prospect_rankings (migration 0007) or
// draft_board (0005). Pure, tested in test/boardImport.test.mjs. Headers are matched case-insensitively with a few common
// spellings; every problem is reported by line so nothing half-valid is published. Returns { rows, errors }.
const MAX_ROWS = 1000;

const ALIASES = {
  rank: ["rank", "rk", "#"],
  player_name: ["player_name", "player", "name", "player name"],
  position: ["position", "pos"],
  school: ["school", "college"],
  comp: ["comp", "comparison", "player comp"],
  notes: ["notes", "note"],
  round: ["round", "rd"],
  pick: ["pick", "pk", "overall"],
  team: ["team", "nfl team", "tm"],
  is_stack: ["is_stack", "stack"],
  stack_note: ["stack_note", "stack note"],
};

function columns(header, wanted) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const at = {};
  for (const key of wanted) at[key] = norm.findIndex((h) => ALIASES[key].includes(h));
  return at;
}

function table(text, required, optional) {
  const all = parseCsv(text);
  if (!all.length) return { errors: ["The file is empty."] };
  const at = columns(all[0], [...required, ...optional]);
  const missing = required.filter((k) => at[k] < 0);
  if (missing.length) return { errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")} (first line must be the headers).`] };
  const body = all.slice(1);
  if (body.length > MAX_ROWS) return { errors: [`Too many rows (${body.length}); the limit is ${MAX_ROWS}.`] };
  return { body: body.map((cells, i) => ({ line: i + 2, get: (k) => (at[k] >= 0 ? String(cells[at[k]] ?? "").trim() : "") })) };
}

const posInt = (v) => (/^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);
const opt = (v, n = 300) => (v ? v.slice(0, n) : null);

export function parseProspects(text) {
  const t = table(text, ["rank", "player_name", "position"], ["school", "comp", "notes"]);
  if (t.errors) return { rows: [], errors: t.errors };
  const rows = [];
  const errors = [];
  const seen = new Set();
  for (const r of t.body) {
    const rank = posInt(r.get("rank"));
    const name = r.get("player_name");
    const position = r.get("position").toUpperCase();
    if (!rank) errors.push(`Line ${r.line}: rank must be a whole number above 0.`);
    if (!name) errors.push(`Line ${r.line}: player name is empty.`);
    if (!["WR", "QB"].includes(position)) errors.push(`Line ${r.line}: position must be WR or QB (got "${r.get("position")}").`);
    const key = `${position}|${rank}`;
    if (rank && seen.has(key)) errors.push(`Line ${r.line}: ${position} rank ${rank} appears twice.`);
    seen.add(key);
    rows.push({ rank, player_name: name.slice(0, 120), position, school: opt(r.get("school"), 120), comp: opt(r.get("comp")), notes: opt(r.get("notes")) });
  }
  if (!rows.length) errors.push("No player rows under the header line.");
  return errors.length ? { rows: [], errors } : { rows, errors: [] };
}

export function parseDraftBoard(text) {
  const t = table(text, ["round", "pick", "player_name", "position"], ["team", "is_stack", "stack_note"]);
  if (t.errors) return { rows: [], errors: t.errors };
  const rows = [];
  const errors = [];
  const seen = new Set();
  for (const r of t.body) {
    const round = posInt(r.get("round"));
    const pick = posInt(r.get("pick"));
    const name = r.get("player_name");
    const position = r.get("position").toUpperCase();
    if (!round) errors.push(`Line ${r.line}: round must be a whole number above 0.`);
    if (!pick) errors.push(`Line ${r.line}: pick must be a whole number above 0.`);
    if (!name) errors.push(`Line ${r.line}: player name is empty.`);
    if (!position) errors.push(`Line ${r.line}: position is empty.`);
    const key = `${round}|${pick}`;
    if (round && pick && seen.has(key)) errors.push(`Line ${r.line}: round ${round} pick ${pick} appears twice.`);
    seen.add(key);
    rows.push({
      round,
      pick,
      player_name: name.slice(0, 120),
      position: position.slice(0, 6),
      team: opt(r.get("team").toUpperCase(), 4),
      is_stack: /^(true|yes|y|1|x)$/i.test(r.get("is_stack")),
      stack_note: opt(r.get("stack_note")),
    });
  }
  if (!rows.length) errors.push("No player rows under the header line.");
  return errors.length ? { rows: [], errors } : { rows, errors: [] };
}
