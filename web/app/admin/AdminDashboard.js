import { PostForm, ProspectUpload, DraftBoardUpload } from "./AdminForms";
import { deletePost } from "./actions";
import ShareCardButton from "../ShareCardButton";
import { money } from "@/lib/format";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "—");

function Panel({ n, title, children, error }) {
  return (
    <section className="adm-panel glass-panel" aria-labelledby={`adm-${n}`}>
      <h2 id={`adm-${n}`} className="adm-title">
        <span className="adm-n mono">{String(n).padStart(2, "0")}</span> {title}
      </h2>
      {error ? <p className="auth-error mono">{error}</p> : children}
    </section>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div className={`adm-stat${tone ? ` is-${tone}` : ""}`}>
      <div className="adm-stat-value">{value}</div>
      <div className="adm-stat-label mono">{label}</div>
    </div>
  );
}

// The control room's body (app/admin/page.js checks the founder and loads `d` from lib/adminData.js).
export default function AdminDashboard({ d }) {
  const h = d.health.value;
  const m = d.members.value;
  const r = d.revenue.value;
  const c = d.content.value;

  return (
      <main id="main-content" className="wrap tool-wrap adm">
        <div className="eyebrow">Founder</div>
        <h1>Control Room</h1>

        <Panel n={1} title="Site health" error={d.health.error}>
          {h && (
            <>
              <p className={`adm-banner mono ${h.ok ? "is-ok" : "is-bad"}`} role="status">
                {h.ok ? "All checks passing." : "Something needs attention. The hourly uptime check emails you about it."}
                {h.inSeason ? "" : " (Off season: data freshness isn't checked.)"}
              </p>
              <ul className="adm-checks">
                {h.checks.map((c) => (
                  <li key={c.name} className={c.ok ? "is-ok" : "is-bad"}>
                    <span className="adm-dot" aria-hidden="true" />
                    <strong>{c.name}</strong> <span className="mono">{c.detail}</span>
                    <span className="sr-only">{c.ok ? "passing" : "failing"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel n={2} title="Members and revenue" error={d.members.error}>
          {m && (
            <div className="adm-stats">
              <Stat value={m.total} label="Accounts" />
              <Stat value={m.byTier.explorer} label="Explorer" />
              <Stat value={m.byTier.singularity} label="Singularity" />
              <Stat value={m.last7} label="New, 7 days" />
              <Stat value={m.last30} label="New, 30 days" />
              {r && <Stat value={money(r.mrrCents)} label={`Monthly revenue${r.live ? "" : " (test mode)"}`} tone="brand" />}
              {r && <Stat value={r.pastDue} label="Payment failing" tone={r.pastDue ? "bad" : null} />}
              {r && <Stat value={r.cancelling} label="Cancelling at period end" />}
            </div>
          )}
          {d.revenue.error && <p className="auth-error mono">Stripe: {d.revenue.error}</p>}
          {m && (
            <div className="rankings-table-wrap adm-table">
              <table className="rankings-table">
                <caption className="adm-caption mono">Newest accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recent.map((p) => (
                    <tr key={p.email + p.created_at}>
                      <td>{p.email}</td>
                      <td className="mono">{p.tier}</td>
                      <td className="mono">{when(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel n={3} title="Growth: email list and referrals" error={d.growth.error}>
          {d.growth.value && (
            <>
              <div className="adm-stats">
                <Stat value={d.growth.value.subs} label="On the email list" tone="brand" />
                <Stat value={d.growth.value.subs7} label="Joined, 7 days" />
                <Stat value={d.growth.value.unsubs} label="Unsubscribed" />
                <Stat value={d.growth.value.joined} label="Referred sign-ups" />
                <Stat value={d.growth.value.rewarded} label="Referred subscribers" />
                <Stat value={money(d.growth.value.creditCents)} label="Referral credit given" />
              </div>
              <a className="btn-ghost" href="/api/admin/subscribers" download>
                Download the email list (CSV)
              </a>
              <p className="adm-help" style={{ marginTop: 10 }}>
                Import it into your email tool. Each row has that person&apos;s unsubscribe link: put it in every email you send.
              </p>
            </>
          )}
          <h3 className="adm-sub">This week&apos;s share cards</h3>
          <p className="adm-help">
            Made automatically from the published numbers. Post Receipts on Tuesday (last week graded) and Smash Spots midweek. Every player card,
            dynasty card and start / sit card is one Share button away on the tools themselves.
          </p>
          <div className="adm-share">
            <a className="btn-ghost" href="/receipts" target="_blank" rel="noopener">
              Open Receipts
            </a>
            <ShareCardButton card={{ kind: "receipts" }} caption="Last week's receipts: how our ranges and Smash Spots held up." file="singularity-receipts" label="Share Receipts" className="btn-ghost" />
            <a className="btn-ghost" href="/smash" target="_blank" rel="noopener">
              Open Smash Spots
            </a>
            <ShareCardButton card={{ kind: "smash" }} caption="This week's Smash Spots and Tough Spots." file="singularity-smash" label="Share Smash Spots" className="btn-ghost" />
          </div>
        </Panel>

        <Panel n={4} title="Paywalls, last 30 days" error={d.walls.error}>
          {d.walls.value &&
            (d.walls.value.walls.length ? (
              <div className="rankings-table-wrap adm-table">
                <table className="rankings-table">
                  <caption className="adm-caption mono">{d.walls.value.events} events. Upgraded = signed-in clickers on a paid plan now.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Wall</th>
                      <th scope="col">Views</th>
                      <th scope="col">Clicks</th>
                      <th scope="col">Click rate</th>
                      <th scope="col">Signed-in clickers</th>
                      <th scope="col">Upgraded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.walls.value.walls.map((w) => (
                      <tr key={w.wall}>
                        <td className="mono">{w.wall}</td>
                        <td className="mono">{w.views}</td>
                        <td className="mono">{w.clicks}</td>
                        <td className="mono">{w.clickPct == null ? "—" : `${w.clickPct.toFixed(1)}%`}</td>
                        <td className="mono">{w.clickers}</td>
                        <td className="mono">{w.upgraded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adm-help">No paywall views or clicks in the last 30 days.</p>
            ))}
        </Panel>

        <Panel n={5} title="Recent errors" error={d.errors.error}>
          {d.errors.value &&
            (d.errors.value.length ? (
              <div className="rankings-table-wrap adm-table">
                <table className="rankings-table">
                  <caption className="adm-caption mono">Newest 25. The reference on a visitor&apos;s error page is the digest.</caption>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Where</th>
                      <th scope="col">Message</th>
                      <th scope="col">Digest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.errors.value.map((e, i) => (
                      <tr key={i}>
                        <td className="mono">{when(e.created_at)}</td>
                        <td className="mono">{e.source} · {e.path || e.route}</td>
                        <td className="adm-msg">{e.message}</td>
                        <td className="mono">{e.digest || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adm-help">No errors recorded.</p>
            ))}
        </Panel>

        <Panel n={6} title="Publish" error={d.content.error}>
          <div className="adm-grid">
            <div>
              <h3 className="adm-sub mono">Post a drop</h3>
              <p className="adm-help">Shows in the home page&apos;s Recent Drops, newest first.</p>
              <PostForm />
              {c?.posts?.length > 0 && (
                <ul className="adm-posts">
                  {c.posts.map((p) => (
                    <li key={p.id}>
                      <span>
                        {p.title} <span className="mono adm-dim">{when(p.published_at)}</span>
                      </span>
                      <form action={deletePost}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="adm-link mono" aria-label={`Remove the drop "${p.title}"`}>Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="adm-sub mono">Prospect rankings</h3>
              <p className="adm-help">
                Live now: {c?.prospects.draftClass ? `${c.prospects.draftClass} class, ${c.prospects.rows} prospects` : "nothing published"}.
              </p>
              <ProspectUpload />
            </div>
            <div>
              <h3 className="adm-sub mono">Draft board</h3>
              <p className="adm-help">
                Live now: {c?.board.season ? `${c.board.season}: startup ${c.board.startup} picks, rookie ${c.board.rookie} picks` : "nothing published"}.
              </p>
              <DraftBoardUpload />
            </div>
          </div>
        </Panel>
      </main>
  );
}
