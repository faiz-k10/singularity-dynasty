"use client";

import { createContext, useContext } from "react";

// The best role players at each position ({ QB: [{ name, avg }], ... }, redraft-rankings/data.js getRoleLeaders), handed from a page to the opened
// player's stats panel (WeeklyDetailRow.js) without passing it through every table component in between.
const RoleLeadersContext = createContext(null);
export const RoleLeadersProvider = ({ value, children }) => <RoleLeadersContext.Provider value={value}>{children}</RoleLeadersContext.Provider>;
export const useRoleLeaders = () => useContext(RoleLeadersContext);
