"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORE_KEY = "myteam.board.v1";

// How many columns the expanded panels share. Side-by-side (default): 1 panel
// fills the board, 2-4 split it into two columns, 5-6 into three. Stacked
// (landscape): up to 3 panels are full-width rows, 4+ go two per row; when the count doesn't divide
// evenly the LAST panel stretches across the leftover cells, so the board is
// always completely filled (3 panels = two on top, one full-width below).
function columnsFor(n, orientation) {
  if (orientation === "stack") return n <= 3 ? 1 : 2; // landscape: panels stacked top-to-bottom
  return n <= 1 ? 1 : n <= 4 ? 2 : 3; // portrait: panels side by side
}

// A customizable dashboard of collapsible, draggable panels.
//   panels: [{ id, title, node, defaultOpen, sub, actions }]  (sub: headline
//   stats beside the title; actions: controls at the right -- both live in
//   the header bar, which stays pinned while the panel body scrolls)
// Expanded panels share the board's height/width by the rule above;
// collapsed ones dock as chips above it. Drag any panel header (or dock
// chip) onto another to reorder. Layout is remembered per browser
// (localStorage) -- a convenience, so every read/write is try/caught.
export default function PanelBoard({ panels, headerExtra }) {
  const ids = panels.map((p) => p.id);
  const idKey = ids.join("|");
  const [order, setOrder] = useState(ids);
  const [open, setOpen] = useState(() =>
    Object.fromEntries(panels.map((p) => [p.id, p.defaultOpen !== false]))
  );
  const [orientation, setOrientation] = useState("side"); // "side" | "stack"
  const [focusId, setFocusId] = useState(null); // transient "maximized" panel; layout state below is untouched
  const [dragOver, setDragOver] = useState(null);
  const dragId = useRef(null);
  const loaded = useRef(false);

  // Restore the saved layout after mount (post-hydration, so server and
  // client first render agree).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (saved?.order) setOrder(saved.order);
        if (saved?.orientation === "stack") setOrientation("stack");
        if (saved?.open) setOpen((prev) => ({ ...prev, ...saved.open }));
      } catch {}
      loaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ order, open, orientation }));
    } catch {}
  }, [order, open, orientation]);

  // Panels come and go (e.g. Player Exposure needs 2+ saved teams): keep
  // the stored order for known ids, append any new ones.
  const ordered = useMemo(() => {
    const byId = Object.fromEntries(panels.map((p) => [p.id, p]));
    const seen = new Set();
    const out = [];
    for (const id of order) if (byId[id] && !seen.has(id)) { out.push(byId[id]); seen.add(id); }
    for (const p of panels) if (!seen.has(p.id)) out.push(p);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, idKey, panels]);

  const isOpen = (p) => open[p.id] ?? p.defaultOpen !== false;
  const allExpanded = ordered.filter(isOpen);
  const docked = ordered.filter((p) => !isOpen(p));
  // Focus mode shows just one panel full-board; order/open/orientation are
  // never modified, so leaving focus restores the layout exactly as it was.
  const focused = focusId ? allExpanded.find((p) => p.id === focusId) : null;
  const expanded = focused ? [focused] : allExpanded;
  const cols = columnsFor(expanded.length, orientation);
  const leftover = expanded.length % cols;
  const lastSpan = leftover === 0 ? 1 : cols - leftover + 1;

  useEffect(() => {
    if (!focusId) return;
    const onKey = (e) => { if (e.key === "Escape") setFocusId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId]);

  const toggle = (id) => {
    if (id === focusId) setFocusId(null);
    setOpen((o) => {
      const p = panels.find((x) => x.id === id);
      return { ...o, [id]: !(o[id] ?? p?.defaultOpen !== false) };
    });
  };

  function drop(targetId) {
    const from = dragId.current;
    dragId.current = null;
    setDragOver(null);
    if (!from || from === targetId) return;
    const base = ordered.map((p) => p.id).filter((id) => id !== from);
    const at = base.indexOf(targetId);
    base.splice(at < 0 ? base.length : at, 0, from);
    setOrder(base);
  }

  const dragProps = (id) => ({
    draggable: true,
    onDragStart: (e) => {
      dragId.current = id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id); // Firefox needs data to start a drag
    },
    onDragEnd: () => { dragId.current = null; setDragOver(null); },
  });
  const dropProps = (id) => ({
    onDragOver: (e) => { if (dragId.current) { e.preventDefault(); setDragOver(id); } },
    onDragLeave: () => setDragOver((cur) => (cur === id ? null : cur)),
    onDrop: (e) => { e.preventDefault(); drop(id); },
  });

  function reset() {
    setOrder(ids);
    setOrientation("side");
    setOpen(Object.fromEntries(panels.map((p) => [p.id, p.defaultOpen !== false])));
  }

  return (
    <div className="board">
      <div className="board-dock">
        {docked.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`board-chip${dragOver === p.id ? " board-drop" : ""}`}
            onClick={() => toggle(p.id)}
            {...dragProps(p.id)}
            {...dropProps(p.id)}
            title="Click to expand · drag to reorder"
          >
            <span aria-hidden="true">+</span> {p.title}
          </button>
        ))}
        <span className="board-dock-spacer" />
        {headerExtra}
        <div className="board-orient" role="group" aria-label="Panel arrangement">
          <button type="button" aria-pressed={orientation === "side"} onClick={() => setOrientation("side")} title="Side by side">
            <span className="board-orient-icon board-orient-side" aria-hidden="true" /> Side by side
          </button>
          <button type="button" aria-pressed={orientation === "stack"} onClick={() => setOrientation("stack")} title="Stacked top to bottom">
            <span className="board-orient-icon board-orient-stack" aria-hidden="true" /> Stacked
          </button>
        </div>
        <button type="button" className="board-reset" onClick={reset}>Reset layout</button>
      </div>

      {expanded.length > 0 && (
        <div className="board-grid" style={{ "--board-cols": cols }}>
          {expanded.map((p, i) => (
            <section
              key={p.id}
              className={`board-panel glass-panel${dragOver === p.id ? " board-drop" : ""}`}
              style={i === expanded.length - 1 && lastSpan > 1 ? { "--board-span": lastSpan } : undefined}
              {...dropProps(p.id)}
            >
              <header className="board-panel-head" {...dragProps(p.id)}>
                <span className="board-grip" aria-hidden="true">⠿</span>
                <h2 className="board-panel-title">{p.title}</h2>
                {p.sub && <div className="board-panel-sub">{p.sub}</div>}
                <span className="board-spacer" />
                {p.actions && <div className="board-panel-actions">{p.actions}</div>}
                <button
                  type="button"
                  className="board-collapse"
                  aria-pressed={focusId === p.id}
                  aria-label={focusId === p.id ? `Restore ${p.title} to the layout` : `Expand ${p.title} to fill the board`}
                  title={focusId === p.id ? "Restore layout (Esc)" : "Expand to fill the board"}
                  onClick={() => setFocusId((cur) => (cur === p.id ? null : p.id))}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {focusId === p.id ? (
                      <path d="M6 2v4H2M10 14v-4h4M6 6 2 2M10 10l4 4" />
                    ) : (
                      <path d="M10 2h4v4M6 14H2v-4M14 2l-4 4M2 14l4-4" />
                    )}
                  </svg>
                </button>
                <button
                  type="button"
                  className="board-collapse"
                  aria-expanded="true"
                  aria-label={`Collapse ${p.title}`}
                  onClick={() => toggle(p.id)}
                >
                  –
                </button>
              </header>
              <div className="board-panel-body">{p.node}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
