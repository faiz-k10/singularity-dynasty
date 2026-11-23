"use client";

import { createContext, useContext } from "react";

// The viewer's plan, for small pieces deep in My Team that only change what they SHOW (the start / sit teaser in LineupAdvice.js).
// Anything that gates data is decided on the server; this only picks between a full view and its locked preview.
const TierContext = createContext("stargazer");
export function TierProvider({ tier, children }) {
  return <TierContext.Provider value={tier}>{children}</TierContext.Provider>;
}
export const useTier = () => useContext(TierContext);
