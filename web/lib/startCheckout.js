// Starts a Stripe checkout for a plan from the browser (one place for every pricing button: the classic pricing ladder via
// InteractiveScript.js and the Event Horizon landing page). Stargazer is free: it goes to sign-up, then My Team's onboarding.
// Leaves the page on success; throws with a message the caller can show.
export async function startCheckout(plan, billing) {
  if (plan === "stargazer") {
    // a full load of the sign-in page (callers outside React have no router)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login?next=%2Fmy-team%3Fwelcome%3D1";
    return;
  }
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, billing }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.login) {
    window.location.href = data.login;
    return;
  }
  if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
  window.location.href = data.url;
}
