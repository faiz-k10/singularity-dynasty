// TEMPORARY diagnostic endpoint for app/NavTiming.js: writes one "[nav]" line per link click to the runtime logs. Numbers and short paths only,
// size-capped; nothing is stored. Remove with NavTiming.js.
export async function POST(request) {
  try {
    const text = (await request.text()).slice(0, 2000);
    const d = JSON.parse(text);
    const clean = {
      from: String(d.from || "").slice(0, 60),
      to: String(d.to || "").slice(0, 60),
      skelMs: Number.isFinite(d.skelMs) ? d.skelMs : null,
      pageMs: Number.isFinite(d.pageMs) ? d.pageMs : null,
      res: Array.isArray(d.res) ? d.res.slice(0, 8).map((r) => ({ u: String(r.u || "").slice(0, 40), wait: +r.wait || 0, dl: +r.dl || 0, kb: +r.kb || 0, raw: +r.raw || 0, at: +r.at || 0 })) : [],
    };
    console.log(`[nav] ${JSON.stringify(clean)}`);
  } catch {}
  return new Response(null, { status: 204 });
}
