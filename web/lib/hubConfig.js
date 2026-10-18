// What the landing page's data hub shows. Edit this file (or ask for a change) to adjust it -- nothing else needs to move.
//
//   defaultTab   "auto" picks "inseason" during the NFL season (September through January, once this season's
//                projections are published) and "offseason" otherwise. Set "inseason" or "offseason" to force one.
//   tabs         the tab bar, in order; each tab lists its modules in the order they appear.
//   modules      { id, enabled, limit }. `limit` is how many rows the module shows. Set enabled:false to hide one.
//
// Module ids (see app/hub/HubClient.js):
//   in season:  movers, ceilings, matchups, hotcold, simLeaders
//   offseason:  stageMap, ageCurve, assets, roleMap, boards
//
// Depth rule (keeps the paid tools worth paying for): the hub only ever carries free-depth data -- the top 50 of the
// weekly rankings, the top 10 of the season simulations, and aggregate counts. Don't widen the pools in hubData.js
// without checking the tier gates on the tool pages.
export const HUB_CONFIG = {
  defaultTab: "auto",
  tabs: [
    {
      id: "inseason",
      label: "This week",
      blurb: "What moved, who has the highest ceiling, and where the matchups are",
      modules: [
        { id: "movers", enabled: true, limit: 3 },
        { id: "ceilings", enabled: true, limit: 3 },
        { id: "matchups", enabled: true, limit: 6 },
        { id: "hotcold", enabled: true, limit: 3 },
        { id: "simLeaders", enabled: true, limit: 6 },
      ],
    },
    {
      id: "offseason",
      label: "Dynasty & offseason",
      blurb: "Age, career stage and role across the league -- built for long-term value",
      modules: [
        { id: "stageMap", enabled: true },
        { id: "roleMap", enabled: true },
        { id: "ageCurve", enabled: true },
        { id: "assets", enabled: true, limit: 5 },
        { id: "boards", enabled: true, limit: 5 },
      ],
    },
  ],
};
