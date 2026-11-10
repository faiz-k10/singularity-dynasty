// "Your Players This Week" email: turns a member's feed (lib/myFeed.js buildFeed output) into a subject, an HTML body
// and a plain-text body. Pure -- no network, no database -- unit-tested. Sending lives in scripts/send-weekly-digest.mjs.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function renderDigest({ items, week, siteUrl, address = "", max = 8 }) {
  const list = (items || []).slice(0, max);
  const starters = list.filter((i) => i.starter).length;
  const subject = list.length
    ? `Week ${week}: ${list.length} of your players moved${starters ? ` (${starters} starting)` : ""}`
    : `Week ${week}: your players this week`;
  const manage = `${siteUrl}/my-team`;
  const lineText = (l) => `${l.dir === "up" ? "▲" : l.dir === "down" ? "▼" : "•"} ${l.text}`;

  const text = [
    `Your players this week (week ${week})`,
    "",
    ...(list.length
      ? list.flatMap((i) => [
          `${i.name}${i.position ? ` (${i.position})` : ""} — ${i.starter ? "starting" : "bench"} in ${i.teams.map((t) => t.label).join(", ")}`,
          ...i.lines.slice(0, 2).map((l) => `  ${lineText(l)}`),
          "",
        ])
      : ["Nothing moved enough to flag this week.", ""]),
    `Open your leagues: ${manage}`,
    `Turn this email off: ${manage} (Your Players This Week panel)`,
    ...(address ? ["", address] : []),
  ].join("\n");

  const rows = list
    .map(
      (i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #2a2a38">
      <div style="font:700 16px Georgia,serif;color:#ece7dc">${esc(i.name)}${i.position ? ` <span style="font:11px monospace;color:#a39e92">${esc(i.position)}</span>` : ""}
        <span style="font:11px monospace;color:${i.starter ? "#e8643f" : "#a39e92"}">${i.starter ? "STARTING" : "BENCH"}</span></div>
      <div style="font:12px monospace;color:#a39e92;margin:2px 0 6px">${esc(i.teams.map((t) => t.label).join(" · "))}</div>
      ${i.lines
        .slice(0, 2)
        .map((l) => `<div style="font:13px Georgia,serif;color:${l.dir === "up" ? "#e8643f" : l.dir === "down" ? "#6e9bd8" : "#ece7dc"}">${esc(lineText(l))}</div>`)
        .join("")}
    </td></tr>`
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0b;padding:24px">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#12121a;border-radius:14px;padding:24px;border:1px solid #2a2a38">
  <tr><td>
    <div style="font:700 11px monospace;letter-spacing:.12em;color:#e8643f;text-transform:uppercase">Dynasty Singularity · Week ${esc(week)}</div>
    <div style="font:700 24px Georgia,serif;color:#ece7dc;margin:6px 0 14px">Your players this week</div>
    <table role="presentation" width="100%">${rows || `<tr><td style="font:14px Georgia,serif;color:#a39e92;padding:10px 0">Nothing moved enough to flag this week.</td></tr>`}</table>
    <p style="margin:20px 0 0"><a href="${esc(manage)}" style="display:inline-block;background:#e8643f;color:#120804;font:700 14px Arial,sans-serif;padding:11px 22px;border-radius:999px;text-decoration:none">Open my leagues</a></p>
    <p style="font:11px Arial,sans-serif;color:#6b675e;margin:22px 0 0">You get this because you turned on the weekly email. <a href="${esc(manage)}" style="color:#e8643f">Turn it off</a> in the Your Players This Week panel.${address ? `<br>${esc(address)}` : ""}</p>
  </td></tr>
</table></body></html>`;

  return { subject, html, text };
}
