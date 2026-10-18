// NFL divisions, using the team codes the site's data uses (LA = Rams, LAC = Chargers, LV = Raiders, WAS, JAX).
// Powers the Teams filter on Weekly Projection Rankings (RankingsToolbar.js).
export const NFL_DIVISIONS = [
  { conf: "AFC", name: "AFC East", teams: ["BUF", "MIA", "NE", "NYJ"] },
  { conf: "AFC", name: "AFC North", teams: ["BAL", "CIN", "CLE", "PIT"] },
  { conf: "AFC", name: "AFC South", teams: ["HOU", "IND", "JAX", "TEN"] },
  { conf: "AFC", name: "AFC West", teams: ["DEN", "KC", "LV", "LAC"] },
  { conf: "NFC", name: "NFC East", teams: ["DAL", "NYG", "PHI", "WAS"] },
  { conf: "NFC", name: "NFC North", teams: ["CHI", "DET", "GB", "MIN"] },
  { conf: "NFC", name: "NFC South", teams: ["ATL", "CAR", "NO", "TB"] },
  { conf: "NFC", name: "NFC West", teams: ["ARI", "LA", "SF", "SEA"] },
];

export const ALL_TEAMS = NFL_DIVISIONS.flatMap((d) => d.teams);
