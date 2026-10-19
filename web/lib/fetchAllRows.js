// Supabase's project-level API "max rows" setting hard-caps a single
// request at 1000 regardless of an explicit .limit() asking for more --
// verified directly against this project (a .limit(5000) on a query over
// a 1078-row table still only returned 1000 rows). Pages through
// .range() in 1000-row batches for any table that can plausibly exceed
// that cap. `queryFn` applies filters/ordering to the base query
// (everything except .range(), which this owns).
//
// THE ORDERING MUST BE UNIQUE (end it with a key column, e.g. .order("week").order("player_name")). Rows that tie on the ordering
// can come back in a different order for each page's request, so a row can appear twice and another not at all -- Jaylen Warren's
// Week 3 showed twice and his Week 4 vanished (Oct 19 2026) when the game log was paged by week alone.
//
// The first page also asks for the exact row count, and every remaining page is then fetched IN PARALLEL (it used to walk the
// pages one after another -- a 7,500-row table was eight round trips in a row on every cold cache). Pages are the same
// 1000-row windows of the same ordered query, so the result is identical to the sequential walk.
export async function fetchAllRows(client, table, select, queryFn) {
  const PAGE = 1000;
  const first = await queryFn(client.from(table).select(select, { count: "exact" })).range(0, PAGE - 1);
  if (first.error) throw first.error;
  const head = first.data || [];
  const total = typeof first.count === "number" ? first.count : null;
  if (head.length < PAGE) return head;
  if (total == null) {
    // Count unavailable (should not happen): fall back to walking the pages one at a time.
    let rows = head;
    for (let from = PAGE; ; from += PAGE) {
      const { data, error } = await queryFn(client.from(table).select(select)).range(from, from + PAGE - 1);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }
  const starts = [];
  for (let from = PAGE; from < total; from += PAGE) starts.push(from);
  const rest = await Promise.all(
    starts.map(async (from) => {
      const { data, error } = await queryFn(client.from(table).select(select)).range(from, from + PAGE - 1);
      if (error) throw error;
      return data || [];
    })
  );
  return head.concat(...rest);
}
