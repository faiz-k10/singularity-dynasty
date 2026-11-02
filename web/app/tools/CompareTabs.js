"use client";

import { useState } from "react";
import PanelTabs from "../PanelTabs";

// Two (or more) views of one comparison behind a tab switch: tabs = [{ key, label, node }]. Only the open tab is mounted. `extra` sits at the
// left of the switch's row (the start / sit Share button).
export default function CompareTabs({ tabs, extra = null }) {
  const [key, setKey] = useState(tabs[0].key);
  const open = tabs.find((t) => t.key === key) || tabs[0];
  return (
    <>
      <div className="compare-tabs">
        {extra}
        <PanelTabs tabs={tabs.map((t) => [t.key, t.label])} value={open.key} onChange={setKey} label="Comparison view" />
      </div>
      {open.node}
    </>
  );
}
