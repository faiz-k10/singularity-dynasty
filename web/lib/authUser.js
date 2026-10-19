// Who is signed in, for READ paths (page loads, live polls): the identity comes from the session's own JWT, verified
// locally against Supabase's published signing keys (getClaims; this project uses asymmetric ES256 keys, so there is no
// network call). `supabase.auth.getUser()` asks Supabase's Auth server every time, and a signed-in page load used to make
// that call 3-4 times in a row (proxy, header, page, tier). Anything that CHANGES data or money (saving / deleting a team,
// checkout, billing) still uses getUser(), which also catches a revoked session immediately; a JWT is valid for an hour.
// Returns { id, email } or null.
export async function getAuthUser(supabase) {
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: c.email || null } : null;
}
