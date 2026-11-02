import Link from "next/link";
import { notFound } from "next/navigation";
import ShareCardPage, { cardMetadata } from "../../ShareCardPage";
import { receiptsFor, parseWeekSlug } from "@/lib/cardData";
import { receiptsWords as words } from "@/lib/receipts";

// "Receipts": how a finished week's published ranges and Smash / Tough Spots did against the real games (lib/receipts.js). Public, made
// automatically every week -- the founder only has to post the link.
async function load(slug) {
  const wk = parseWeekSlug(slug);
  return wk ? receiptsFor(wk.season, wk.week) : null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const r = await load(slug);
  if (!r) return { title: "Receipts — Singularity Dynasty" };
  const w = words(r);
  return cardMetadata({ title: w.title, description: w.description, image: `/receipts/${slug}/image` });
}

export default async function ReceiptsPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const r = await load(slug);
  if (!r) notFound();
  const w = words(r);
  const rows = [...r.smash.best.map((p) => ({ ...p, tag: "Smash Spot" })), ...r.tough.best.map((p) => ({ ...p, tag: "Tough Spot" })), ...r.ceilingGames.map((p) => ({ ...p, tag: "Ceiling game" }))];
  return (
    <ShareCardPage
      eyebrow={`Receipts · Week ${r.week} · ${r.season}`}
      title={w.title}
      description={w.description}
      image={`/receipts/${slug}/image`}
      tool={{ href: "/how-it-works#record", label: "How we measure it" }}
      share={{ kind: "receipts", slug }}
      caption={w.caption}
      file={`singularity-receipts-${slug}`}
      refCode={typeof sp?.ref === "string" ? sp.ref : null}
    >
      {rows.length > 0 && (
        <div className="rankings-table-wrap glass-panel share-table">
          <table className="rankings-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Why it&apos;s here</th>
                <th>Floor</th>
                <th>Median</th>
                <th>Ceiling</th>
                <th>Scored</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={`${p.tag}${p.name}`}>
                  <td>{`${p.name} · ${p.pos}`}</td>
                  <td>{p.tag}</td>
                  <td className="mono">{p.floor.toFixed(1)}</td>
                  <td className="mono">{p.proj.toFixed(1)}</td>
                  <td className="mono">{p.ceiling.toFixed(1)}</td>
                  <td className="mono">{p.pts.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tool-hint">
        Every week is graded the same way, good or bad. <Link href="/receipts">The latest week</Link> is always at /receipts.
      </p>
    </ShareCardPage>
  );
}
