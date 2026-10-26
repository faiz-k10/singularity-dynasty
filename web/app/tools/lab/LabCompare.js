"use client";

import Link from "next/link";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { LAB_GROUPS, LAB_METRICS, formatMetric } from "@/lib/labMetrics";

// The picked players side by side on every number The Lab knows, section by section. Each value carries a bar for his percentile at HIS
// position (so a mixed group compares each player with his own peers), and the best value in a row is gold unless neither end of that
// number is better. Rows nobody has a value for are left out.
export default function LabCompare({ picked, simsAccess, onToggle }) {
  if (!picked.length) return <p className="lab-empty">Add players above to compare them side by side.</p>;
  const has = (p, k) => typeof p.m[k] === "number";

  return (
    <div className="lab-view">
      <div className="lab-table-wrap">
        <table className="lab-table lab-compare" style={{ "--n": picked.length }}>
          <thead>
            <tr>
              <th scope="col" className="lab-compare-corner">
                Percentile bars compare each player with his own position.
              </th>
              {picked.map((p) => (
                <th key={p.name} scope="col" className="lab-compare-head" style={{ "--c": p.color }}>
                  <span className="lab-compare-name">{p.name}</span>
                  <span className="lab-compare-meta">
                    <PositionBadge position={p.pos} />
                    <TeamBadge team={p.team} />
                    <span className="lab-compare-opp">{p.bye ? "Bye" : p.opp ? `${p.home ? "vs" : "@"} ${p.opp}` : ""}</span>
                  </span>
                  <button type="button" className="lab-chip-x" onClick={() => onToggle(p.name)} aria-label={`Remove ${p.name}`}>
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LAB_GROUPS.map((group) => {
              const locked = group === "Season simulation" && !simsAccess;
              const metrics = LAB_METRICS.filter((m) => m.group === group && picked.some((p) => has(p, m.key)));
              if (locked) {
                return (
                  <tr key={group} className="compare-group-row">
                    <th colSpan={picked.length + 1}>
                      {group}:{" "}
                      <Link href="/#pricing" className="lab-lock-link">
                        Singularity
                      </Link>
                    </th>
                  </tr>
                );
              }
              if (!metrics.length) return null;
              return [
                <tr key={group} className="compare-group-row">
                  <th colSpan={picked.length + 1}>{group}</th>
                </tr>,
                ...metrics.map((m) => {
                  const vals = picked.filter((p) => has(p, m.key)).map((p) => p.m[m.key]);
                  const best = !m.neutral && vals.length > 1 ? (m.lower ? Math.min(...vals) : Math.max(...vals)) : null;
                  return (
                    <tr key={m.key}>
                      <th scope="row">
                        {m.label}
                      </th>
                      {picked.map((p) => {
                        const v = p.m[m.key];
                        const pct = p.pct?.[m.key];
                        return (
                          <td key={p.name} className={best != null && v === best ? "is-best" : ""}>
                            <span className="lab-cell">
                              <span className="lab-cell-val">{formatMetric(m.key, v)}</span>
                              {typeof pct === "number" && (
                                <span className="lab-cell-pct">
                                  <span className="lab-cell-bar" style={{ width: `${pct}%`, background: p.color }} />
                                </span>
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
