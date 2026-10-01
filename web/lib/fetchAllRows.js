// Supabase's project-level API "max rows" setting hard-caps a single
// request at 1000 regardless of an explicit .limit() asking for more --
// verified directly against this project (a .limit(5000) on a query over
// a 1078-row table still only returned 1000 rows). Pages through
// .range() in 1000-row batches until a batch comes back short, for any
// table that can plausibly exceed that cap. `queryFn` applies
// filters/ordering to the base query (everything except .range(), which
// this owns).
export async function fetchAllRows(client, table, select, queryFn) {
  const PAGE = 1000;
  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(client.from(table).select(select)).range(from, from + PAGE - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}
