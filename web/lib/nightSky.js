// The Night Sky (Nov 2026, founder): the site's habit loop, built from mockups/night-sky.html and tuned with a season simulation
// (mockups/night-sky-sim.mjs -- rerun it after changing any number here). Pure: used by the server (lib/nightSkyStore.js, which rolls every
// die, so nobody can cheat) and by the page (app/account/sky). Tested in test/nightSky.test.mjs.
//
// The loop: a useful action on the site (each counts once a day) places a star; stars fill constellations (finished ones power up the next
// find) and add mass to the core; every action has a growing chance of collapsing the core, which makes a FIND -- a catalogue object of some
// kind, colour and version. Finds, sets and Beat the Model picks earn orbit points, which climb the reward ladder.
//
// Not gambling (stated on the page): nothing is bought or staked, nothing is for sale, every collapse pays, odds are published, and every
// prize with cash value comes from effort (the ladder) or skill (Beat the Model), never from chance.

export const COLORS = { blue: "#4C7DF0", ember: "#E8643F", white: "#ECE7DC", gold: "#E9C46A" };

// The actions that place a star (each once a day), and the colour of star each tends to place.
export const ACTIONS = {
  board: { label: "Open the Game Board", tool: "My Team", color: "blue", href: "/my-team" },
  waivers: { label: "Check a league's waiver wire", tool: "My Team", color: "blue", href: "/my-team" },
  rankings: { label: "Open the weekly rankings", tool: "Rankings", color: "ember", href: "/tools/redraft-rankings" },
  compare: { label: "Compare players", tool: "Rankings", color: "ember", href: "/tools/compare-players" },
  sims: { label: "Open the season simulations", tool: "Research", color: "white", href: "/tools/player-simulations" },
  lab: { label: "Study players in The Observatory", tool: "Research", color: "white", href: "/tools/lab" },
  dynasty: { label: "Open the Dynasty Board", tool: "Research", color: "white", href: "/tools/draft-board" },
  // Founder, Nov 11 2026: a star for sharing. Counts when a share link is made by any Share button (a player card, start / sit, Receipts,
  // Smash Spots, an Observatory chart, a Night Sky find). We can't see whether the post went out, so the once-a-day rule is the guard.
  // "lucky" = a random colour with a 1-in-12 gold wildcard (1 in 4 made the limited season skin a sure thing by week 4 for daily sharers).
  // `quiet`: it places its star but does NOT heat the core or roll for a find (the simulation showed a full action a day added ~45% to a
  // regular member's season points, enough to reach the week of plan). So sharing fills constellations -- the gold wildcard helps toward The
  // Singularity and its limited skin -- without adding finds or points.
  share: { label: "Share a post from any Share button", tool: "Anywhere", color: "lucky", href: "/tools/lab", quiet: true },
};

// The four constellations (Nov 11 2026, founder). The GAME uses the four roles below -- colour, size, star count -- and every season draws
// them as a new set of REAL constellations (SKY_SETS, the same set for every member, `skyFor(season)`): 2026 is Crux, Sagitta, Cassiopeia
// and Orion, and the sets repeat after the last one. A member's sky starts empty when the NFL season turns over (rollSeason) and the old
// sky is kept in `skies`. label: [x, y, text-anchor], pinned to the corners of the sky (top labels above the shapes, bottom labels below) so every set reads the same.
export const CONSTELLATIONS = [
  { id: "huddle", name: "The Huddle", color: "blue", size: "small", n: 4, label: [-262, -284, "start"] },
  { id: "blitz", name: "The Blitz", color: "ember", size: "small", n: 4, label: [262, -284, "end"] },
  { id: "playbook", name: "The Playbook", color: "white", size: "large", n: 5, label: [-262, 270, "start"] },
  { id: "singularity", name: "The Singularity", color: "gold", size: "gold", n: 10, label: [262, 270, "end"] },
];
// Each shape: real = its name; pts = [x, y, size] in fill order (brighter stars bigger), counts 4 / 4 / 5 / 10; edges = the lines (index pairs).
// Corners: huddle top left, blitz top right, playbook bottom left, singularity bottom right (the core sits in the middle).
export const SKY_SETS = [
  { // 2026
    huddle: { real: "Crux", pts: [[-185, -248, 4], [-178, -138, 5], [-228, -200, 4.5], [-148, -182, 3.5]], edges: [[0, 1], [2, 3]] }, // Gacrux, Acrux, Mimosa, Imai
    blitz: { real: "Sagitta", pts: [[140, -150, 3.5], [162, -122, 3.5], [192, -180, 4], [245, -235, 4.5]], edges: [[0, 2], [1, 2], [2, 3]] },
    playbook: { real: "Cassiopeia", pts: [[-250, 112, 4.5], [-212, 168, 5], [-176, 126, 5], [-140, 162, 4], [-108, 104, 3.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    singularity: { real: "Orion", // Meissa, Betelgeuse, Bellatrix, Mintaka, Alnilam, Alnitak, the sword (2), Saiph, Rigel
      pts: [[178, 62, 3.5], [126, 96, 5.5], [224, 106, 4.5], [196, 164, 4], [177, 171, 4.5], [158, 178, 4], [173, 202, 3], [170, 221, 3.5], [138, 250, 4], [234, 240, 5.5]],
      edges: [[0, 1], [0, 2], [1, 5], [2, 3], [3, 4], [4, 5], [5, 8], [3, 9], [4, 6], [6, 7]] },
  },
  { // 2027
    huddle: { real: "Corvus", pts: [[-215, -240, 4], [-140, -222, 4.5], [-150, -150, 3.5], [-232, -158, 4.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] }, // Algorab, Gienah, Minkar, Kraz
    blitz: { real: "Aries", pts: [[142, -128, 3.5], [198, -172, 5], [232, -196, 4], [246, -226, 3]], edges: [[0, 1], [1, 2], [2, 3]] }, // 41 Ari, Hamal, Sheratan, Mesarthim
    playbook: { real: "Lyra", pts: [[-248, 98, 5.5], [-202, 118, 3.5], [-172, 128, 3.5], [-150, 178, 4], [-180, 172, 4]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] }, // Vega, Zeta, Delta, Sulafat, Sheliak
    singularity: { real: "Leo", // Regulus, Eta, Algieba, Adhafera, Rasalas, Epsilon, Zosma, Denebola, Chertan, Iota
      pts: [[130, 205, 5.5], [128, 168, 3.5], [138, 130, 5], [158, 104, 3.5], [184, 92, 3.5], [204, 108, 4], [222, 158, 4], [256, 198, 5], [214, 206, 4], [236, 240, 3]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8], [8, 0], [8, 9]] },
  },
  { // 2028
    huddle: { real: "Libra", pts: [[-180, -248, 4.5], [-236, -186, 4.5], [-130, -194, 3.5], [-214, -138, 3.5]], edges: [[0, 1], [0, 2], [1, 2], [1, 3]] }, // Zubeneschamali, Zubenelgenubi, Gamma, Sigma
    blitz: { real: "Pegasus, the Great Square", pts: [[148, -140, 4.5], [158, -216, 4.5], [236, -228, 5], [230, -150, 4]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] }, // Markab, Scheat, Alpheratz, Algenib
    playbook: { real: "Cygnus", pts: [[-252, 108, 5.5], [-195, 135, 4.5], [-112, 166, 4], [-186, 94, 3.5], [-206, 180, 4]], edges: [[0, 1], [1, 2], [3, 1], [1, 4]] }, // Deneb, Sadr, Albireo, Delta, Gienah
    singularity: { real: "Scorpius", // Graffias, Dschubba, Pi, Antares, Tau, Epsilon, Mu, Zeta, Eta, Shaula
      pts: [[120, 68, 4], [114, 96, 4.5], [118, 124, 3.5], [152, 116, 5.5], [168, 136, 3.5], [182, 166, 4], [186, 196, 3.5], [196, 226, 3.5], [222, 246, 3.5], [252, 228, 5]],
      edges: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]] },
  },
  { // 2029
    huddle: { real: "Hercules, the Keystone", pts: [[-222, -236, 4], [-150, -226, 4.5], [-144, -158, 4], [-226, -150, 3.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] },
    blitz: { real: "Delphinus", pts: [[168, -172, 4], [196, -202, 4], [228, -182, 4.5], [202, -150, 4.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] }, // the diamond
    playbook: { real: "Cepheus", pts: [[-230, 176, 5], [-160, 172, 4], [-154, 128, 3.5], [-195, 94, 3.5], [-236, 130, 4]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] }, // Alderamin, Alfirk, Iota, Errai, Zeta
    singularity: { real: "Gemini", // Castor, Pollux, Mebsuta, Tejat, Propus, Kappa, Wasat, Mekbuda, Alhena, Alzirr
      pts: [[130, 70, 5], [176, 62, 5.5], [140, 130, 3.5], [150, 190, 3.5], [138, 226, 3], [194, 92, 3], [190, 132, 3.5], [206, 172, 3.5], [222, 228, 5], [240, 200, 3]],
      edges: [[0, 1], [0, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [7, 8], [7, 9]] },
  },
];
export const FIRST_SKY_SEASON = 2026;
export function skyFor(season) {
  const n = SKY_SETS.length, i = ((Math.round(Number(season) || FIRST_SKY_SEASON) - FIRST_SKY_SEASON) % n + n) % n;
  return CONSTELLATIONS.map((c) => ({ ...c, ...SKY_SETS[i][c.id] }));
}
// A new NFL season: keep the old sky (for the season card and a member's past skies) and start an empty one. Returns true when it rolled.
const seasonProgressLite = (s) => { const p = seasonProgress(s); return { points: p.points, title: p.title, charted: p.sky, rungs: p.rungs, skin: p.singularity, frame: p.frame }; };
// The sky's season starts at KICKOFF (Sept 1, Eastern), not when the NFL's league year turns over in the spring: the new constellations and
// season track arrive with football, and last season's track stays open through the offseason (simulation, Nov 11 2026). day: "YYYY-MM-DD".
export const skySeasonFor = (day) => { const [y, m] = String(day).split("-").map(Number); return m >= 9 ? y : y - 1; };
export function rollSeason(s, season) {
  if (!season || s.season === season) return false;
  if (s.season && s.filled) s.skies = { ...(s.skies || {}), [s.season]: { filled: s.filled, done: s.seasonDone || {}, ...seasonProgressLite(s) } };
  if (s.season) { s.filled = freshState().filled; s.seasonDone = {}; s.seasonBase = s.points; } // a member's first season keeps what they have
  s.season = season;
  return true;
}

// The catalogue: 44 kinds x 6 colours x 4 versions = 1,056 entries.
export const FAMILIES = [
  ["Iron Asteroid", 1, "rock"], ["Stony Asteroid", 1, "rock"], ["Carbon Asteroid", 1, "rock"], ["Rubble Pile", 1, "rubble"], ["Contact Binary", 1, "twin"],
  ["Trojan Asteroid", 1, "rock"], ["Centaur", 1, "rock"], ["Kuiper Object", 1, "rock"], ["Moonlet", 1, "rock"], ["Dust Cloud", 1, "dust"],
  ["Long-Period Comet", 2, "comet"], ["Sungrazer", 2, "comet"], ["Interstellar Comet", 2, "comet"], ["Main-Belt Comet", 2, "comet"], ["Fragmenting Comet", 2, "comet"],
  ["Ice Dwarf", 2, "dwarf"], ["Plutoid", 2, "dwarf"], ["Dwarf World With A Moon", 2, "dwarf"],
  ["Ringed Giant", 3, "ringed"], ["Ice Giant", 3, "planet"], ["Lava World", 3, "lava"], ["Ocean World", 3, "planet"], ["Desert World", 3, "planet"], ["Super-Earth", 3, "planet"],
  ["Hot Jupiter", 3, "banded"], ["Rogue Planet", 3, "rogue"], ["Tidally Locked World", 3, "locked"], ["Diamond World", 3, "diamond"], ["Volcanic Moon", 3, "moon"], ["Ice Moon", 3, "moon"],
  ["Leonid Shower", 4, "shower"], ["Perseid Shower", 4, "shower"], ["Geminid Shower", 4, "shower"], ["Draconid Shower", 4, "shower"],
  ["Supernova", 5, "supernova"], ["Pulsar", 5, "pulsar"], ["Magnetar", 5, "pulsar"], ["Black Hole", 5, "blackhole"], ["Binary Black Hole", 5, "blackhole"],
  ["Kilonova", 5, "supernova"], ["Quasar", 5, "quasar"], ["Nebula", 5, "nebula"], ["Wolf-Rayet Star", 5, "star"], ["Red Giant", 5, "star"],
].map(([name, tier, shape], id) => ({ id, name, tier, shape }));
// The lore: ONE sentence for every catalogue entry (founder, Nov 17 2026: "a single sentence ... all unique and based loosely on its
// characteristics ... make them all INTERESTING"). One per kind and colour, written for that pairing; a rare version folds a short clause
// into the same sentence, so all 1,056 entries read differently (tested).
export const LORE = {
  "Iron Asteroid": {
    "silver": "A chunk of a planet's heart polished silver by four billion years of sandblasting, it would make the galaxy's most overqualified frying pan.",
    "azure": "Frost has settled into its iron pores and turned it a cold steel blue, like a sword left out on the battlefield of the early solar system.",
    "amber": "Rust has bloomed across it in amber patches, which means it once met water and has been quietly corroding with regret ever since.",
    "emerald": "Flecked with green crystals, it is the meteorite collectors dream about and the reason a few of them have stopped sleeping.",
    "crimson": "Still glowing faintly red from a collision a million years ago, it has never quite calmed down about it.",
    "violet": "Violet iron is not supposed to exist, and the asteroid seems smug about that."
  },
  "Stony Asteroid": {
    "silver": "Plain grey stone, unchanged since before the Sun lit up, the most honest object you will ever look at.",
    "azure": "Its blue sheen is sunlight on a dusting of ice crystals, as if the rock were wearing a thin coat of winter.",
    "amber": "Warm amber stone that looks like a pebble from a riverbed, if the riverbed were four hundred million miles from the nearest river.",
    "emerald": "Green with olivine, the stone jewellers call peridot, so technically you have found a jewellery box with no lid.",
    "crimson": "Burnt red by a billion years of radiation, its surface has the colour and texture of toast someone forgot about.",
    "violet": "Violet stone is so unusual that the astronomer who logged this one named it after her grandmother and refused to explain why."
  },
  "Carbon Asteroid": {
    "silver": "A thin silvery glaze over coal-black rock, it looks like burnt toast someone tried very hard to make fancy.",
    "azure": "Under the blue frost lie amino acids, so this cold little rock carries the alphabet that life spells with.",
    "amber": "Amber-tinted and full of tar, it is basically the solar system's spilled petrol, still waiting for a match.",
    "emerald": "The green comes from clays that only form in water, so this bone-dry rock remembers being wet.",
    "crimson": "A red carbon rock so dark it reflects almost no light, which makes finding one like spotting a black cat at midnight.",
    "violet": "A violet carbon asteroid is the cosmic equivalent of a four-leaf clover made of coal."
  },
  "Rubble Pile": {
    "silver": "A silver heap of boulders packed so loosely that a determined toddler could, in theory, push it apart.",
    "azure": "Blue-tinged gravel held together by its own gravity and nothing else, like a beanbag chair made of mountains.",
    "amber": "An amber pile of stones of the kind a spacecraft once poked and sank into like quicksand, to everyone's alarm.",
    "emerald": "Its green boulders roll over each other so slowly that one rockslide on it has been going since the Romans.",
    "crimson": "A red heap of wreckage from some ancient crash, still drifting together like survivors who never left the scene.",
    "violet": "Violet rubble this rare must be the leftovers of something far grander that nobody will ever get to see."
  },
  "Contact Binary": {
    "silver": "Two silver lobes joined at a narrow neck, shaped exactly like a snowman someone gave up on halfway.",
    "azure": "A pair of icy blue bodies that met at walking pace and froze together mid-hug.",
    "amber": "Two amber rocks fused into a peanut, proof that even in space some things are simply meant to be.",
    "emerald": "Green twins stuck together for so long that nobody can tell any more which one arrived first.",
    "crimson": "Two red bodies joined after a slow collision, still tumbling end over end like dancers who forgot to stop.",
    "violet": "A violet pair so perfectly matched that astronomers argued for a year about whether it was one object or two."
  },
  "Trojan Asteroid": {
    "silver": "A silver guard holding its post ahead of Jupiter, loyal to a planet that has never once noticed it.",
    "azure": "Cold and blue, it marches in Jupiter's wake like a soldier in a war that ended before Earth had a moon.",
    "amber": "Amber-skinned and patient, it has held the same spot in Jupiter's orbit for longer than the Sun has had planets.",
    "emerald": "A green Trojan named, like all of them, after a hero of a war fought on a planet it will never see.",
    "crimson": "Its red face has been baked by sunlight from the same angle for four billion years, like a lizard on a warm rock.",
    "violet": "A violet Trojan is the one that faces the other way, and nobody can explain what it is looking at."
  },
  "Centaur": {
    "silver": "Silver and indecisive, it flickers between being a rock and a comet depending on how close the Sun feels.",
    "azure": "A blue centaur shedding ice in sudden bursts, like a sneeze it has been holding in for a thousand years.",
    "amber": "Amber and moody, it wanders between the giant planets and could be flung out of the solar system on any pass.",
    "emerald": "A faint green haze switches on and off around it, as if it is shy about admitting it might be a comet.",
    "crimson": "Red as a brick and about as stubborn, it is one of the reddest objects in the solar system and seems proud of it.",
    "violet": "A violet centaur is so rare that its discoverer named it, unnamed it and then named it again."
  },
  "Kuiper Object": {
    "silver": "A silver iceball so far out that a radio message from home would take five hours to reach it.",
    "azure": "Blue nitrogen ice glitters on it at a temperature where even air freezes solid and falls like snow.",
    "amber": "Amber-tinted and never visited, it has been circling in the dark since before the planets had names.",
    "emerald": "Its green tint is methane ice that has never seen a sunrise warm enough to melt it.",
    "crimson": "Crusted in red organic gunk, it is the colour of the surface of a planet that never got started.",
    "violet": "From this violet world the Sun looks no bigger than a streetlight at the far end of the road."
  },
  "Moonlet": {
    "silver": "A silver pebble of a moon, small enough that you could throw a baseball off it and never see it again.",
    "azure": "A tiny blue moon that wobbles as it goes round, as if it is still learning how to be a moon.",
    "amber": "An amber moonlet herding a planet's ring, keeping billions of icy grains in line like a sheepdog.",
    "emerald": "So small and so green that from its surface the planet it circles would fill half the sky.",
    "crimson": "A red moonlet spiralling slowly inward, its orbit shrinking every year toward a very dramatic ending.",
    "violet": "A violet moonlet nobody would have found if it hadn't cast a shadow across its planet's rings."
  },
  "Dust Cloud": {
    "silver": "Silver dust drifting in a long glittering sheet, the confetti left over from the solar system's birthday party.",
    "azure": "A blue haze of ice dust that catches sunlight like breath on a winter morning.",
    "amber": "Amber dust thrown off by colliding asteroids, spiralling slowly toward the Sun like leaves circling a drain.",
    "emerald": "Each green grain is smaller than a blood cell, and there are more of them in this cloud than there are stars.",
    "crimson": "A red cloud from an ancient impact, still spreading out like smoke from a shot fired long ago.",
    "violet": "Some think this violet dust is the last trace of a planet that never got the chance to form."
  },
  "Long-Period Comet": {
    "silver": "A silver comet on an orbit so long that the last people to see it painted it on cave walls.",
    "azure": "Its blue gas tail stretches farther than the Earth is from the Sun, and all of it points politely away from the light.",
    "amber": "An amber comet whose dusty tail curves like a brushstroke, back for the first time in twelve thousand years.",
    "emerald": "It last came by when mammoths were alive, and its green head is back to see what we did with the place.",
    "crimson": "A red-tailed wanderer that last passed when the pyramids were new and found nobody waiting up for it.",
    "violet": "At the far end of this violet comet's orbit, the next star over is almost as close as the Sun."
  },
  "Sungrazer": {
    "silver": "A silver sungrazer skimming so close to the Sun that it boils away by the ton every second.",
    "azure": "It dives at the Sun trailing a blue tail, a moth that knows exactly what the flame is and goes in anyway.",
    "amber": "An amber comet that flew straight through the Sun's outer atmosphere and, to the astonishment of everyone watching, came out the other side.",
    "emerald": "Green with the gas it sheds, it belongs to a family of fragments all following the same doomed road.",
    "crimson": "Glowing red as its rock begins to melt, it is writing its own obituary in the brightest ink there is.",
    "violet": "The last violet sungrazer was seen by a single spacecraft and nobody else, which is lonely for something this bright."
  },
  "Interstellar Comet": {
    "silver": "A silver visitor from another star, moving too fast for the Sun to keep, gone before we could say hello properly.",
    "azure": "Its blue glow is a gas no comet from our system makes, a postcard written in a chemistry we don't speak.",
    "amber": "An amber traveller that has been crossing the dark between stars for longer than our solar system has existed.",
    "emerald": "Green and in a hurry, it is the cosmic stranger who walks through your party and leaves without a word.",
    "crimson": "Reddened under some other sun, it carries the dust of a planetary system we will never see.",
    "violet": "Finding a violet interstellar comet is like getting a letter from another galaxy in your mailbox."
  },
  "Main-Belt Comet": {
    "silver": "A silver asteroid that one year started sprouting a tail, to the visible confusion of everyone tracking it.",
    "azure": "Blue ice hidden under its rocky crust escapes in puffs, as if the asteroid were breathing for the first time.",
    "amber": "An amber rock trailing dust as if it had suddenly decided to become something more interesting.",
    "emerald": "Its green tail switches on every time it nears the Sun and off again when it leaves, as regular as a porch light.",
    "crimson": "A red asteroid with a comet's habits, the kind of object that makes astronomers rewrite their categories.",
    "violet": "Rocks like this violet one may be why Earth has oceans, which is a lot of credit for something this small."
  },
  "Fragmenting Comet": {
    "silver": "A silver comet breaking into a string of pearls, each piece following the one ahead like ducklings.",
    "azure": "Splitting into blue fragments, it brightens with every break as fresh ice meets the Sun for the first time.",
    "amber": "An amber comet coming apart at the seams, each piece lighting its own tail like fireworks in slow motion.",
    "emerald": "Green shards drifting apart along one orbit, like a band that broke up but went on separate tours.",
    "crimson": "A red comet shattering in front of an audience, a farewell show four billion years in the making.",
    "violet": "A violet comet in pieces, and somehow every piece is rarer than the whole ever was."
  },
  "Ice Dwarf": {
    "silver": "Silver ice mountains as tall as the Alps stand on it, frozen harder than granite and twice as patient.",
    "azure": "Its blue plains of nitrogen ice churn slowly like a lava lamp, warmed by heat leaking from deep inside.",
    "amber": "An amber dwarf stained by chemistry cooked in faint sunlight over billions of years, like a tea cup never washed.",
    "emerald": "Green-tinged ice cracked into enormous plates, like a frozen lake that never stopped thinking about moving.",
    "crimson": "A red ice world wearing a cap of frost that comes and goes with seasons that last for centuries.",
    "violet": "Violet ice so cold and so still that a footprint left on it would outlast every city on Earth."
  },
  "Plutoid": {
    "silver": "A silver plutoid with a heart-shaped glacier, as if it knew we would need a reason to love it.",
    "azure": "Under its blue haze sits a tiny world with mountains, glaciers and weather, which is a lot of personality for a dwarf.",
    "amber": "Demoted, debated and absolutely unbothered, this amber one was never in it for the title.",
    "emerald": "A green plutoid whose thin air freezes and falls as snow every time it drifts away from the Sun.",
    "crimson": "Painted red by sunlight on methane ice, it is blushing about something it refuses to discuss.",
    "violet": "A violet plutoid so far out that a single year there lasts longer than the whole history of the United States."
  },
  "Dwarf World With A Moon": {
    "silver": "A silver dwarf and its moon locked face to face, so neither has ever seen the other's back.",
    "azure": "The blue world and its moon circle a point between them, waltzing in a ballroom nobody else is invited to.",
    "amber": "An amber pair so close in size that it is considered rude to ask which one is the moon.",
    "emerald": "A green dwarf world whose moon is slowly stealing its atmosphere, one molecule at a time.",
    "crimson": "Its moon wears a red cap of gas pinched from the dwarf world, a souvenir of the oldest relationship in the outer dark.",
    "violet": "A violet double world turning together, like two old friends who stopped needing to talk."
  },
  "Ringed Giant": {
    "silver": "Its silver rings are younger than the dinosaurs and won't last forever, so you are catching it at its best.",
    "azure": "A blue ringed giant that, if you could find a bathtub big enough, would float.",
    "amber": "Amber bands and golden rings: a planet so pretty it looks designed by committee, and the committee was right.",
    "emerald": "Its green rings are ice chunks from grains to houses, all orbiting in a sheet thinner than a football field is long.",
    "crimson": "A red giant planet whose rings throw long shadows across its clouds, so every day there is striped.",
    "violet": "A violet ringed giant with a six-sided storm at its pole, a shape so neat it looks like a mistake."
  },
  "Ice Giant": {
    "silver": "Deep inside this silver giant it rains diamonds, and no one will ever be there to catch them.",
    "azure": "Its blue is methane, and its winds run faster than the speed of sound with nothing anywhere to slow them down.",
    "amber": "An amber ice giant tipped on its side, so each pole gets forty-two years of daylight and then forty-two of night.",
    "emerald": "Pale green and the coldest of its kind, it has lost its inner heat and nobody knows where it went.",
    "crimson": "A red ice giant with dark storms the size of Earth that appear and vanish like bruises.",
    "violet": "A violet giant whose magnetic field is tilted and off-centre, as if it was put together in a hurry."
  },
  "Lava World": {
    "silver": "Its silver seas of lava ripple under a sky full of fire, and the rocks melt every morning.",
    "azure": "On this blue-glowing world it rains molten glass, sideways, in winds of five thousand miles an hour.",
    "amber": "An amber lava world whose whole year is shorter than a Sunday afternoon, and every hour of it is hot.",
    "emerald": "Green lava flows under clouds of vaporised rock, and when it rains, it rains pebbles.",
    "crimson": "Crimson oceans of magma glow so brightly that its night side shines without any help from its star.",
    "violet": "A violet lava world that resurfaces itself every few days, so no map of it has ever been right twice."
  },
  "Ocean World": {
    "silver": "Every inch of it is silver sea, thousands of miles deep, with no shore anywhere for anything to crawl out onto.",
    "azure": "A blue ocean so deep that at the bottom the water is squeezed into a kind of ice that is hot to the touch.",
    "amber": "Its amber seas are tinted by minerals dissolved over billions of years, the colour of very strong tea.",
    "emerald": "A green ocean world, and if anything in this catalogue is hiding life, it is probably this one.",
    "crimson": "Red tides sweep its global ocean, and nobody is comfortable guessing what is turning them red.",
    "violet": "A violet sea under a violet sky, with waves the height of skyscrapers rolling forever with nowhere to break."
  },
  "Desert World": {
    "silver": "Silver dunes taller than Everest roll across it, moving very slowly toward nowhere in particular.",
    "azure": "A blue desert where the sand is glass and the wind plays it like an instrument.",
    "amber": "An amber desert planet with two suns, and every film director who ever lived would like a word.",
    "emerald": "Green sand made of olivine, like a few rare beaches in Hawaii, stretching across an entire planet.",
    "crimson": "A red desert whose dust storms swallow the whole planet for months, hiding it from its own sun.",
    "violet": "A violet desert with sunsets so strange that any painter who copied them would be accused of making them up."
  },
  "Super-Earth": {
    "silver": "Bigger, heavier and with gravity that would make every touchdown celebration a genuine feat of strength.",
    "azure": "A blue super-Earth with gravity so strong that its ocean waves would roll in slow motion.",
    "amber": "Under its amber skies mountains can't grow very tall, because the planet keeps pulling them back down.",
    "emerald": "A green super-Earth sitting at just the right distance from its star, the porridge that is finally just right.",
    "crimson": "Red and heavy, it may be the bare rocky core of a giant planet that lost all its gas long ago.",
    "violet": "A rocket leaving this violet world would need to be several times bigger than anything we have ever built."
  },
  "Hot Jupiter": {
    "silver": "A silver gas giant so close to its star that its year lasts three days and its clouds are made of metal.",
    "azure": "It glows blue because it rains glass, sideways, in winds that would strip the paint off a battleship.",
    "amber": "An amber giant that wandered far too close to its star and now circles it every few days, glowing like a coal.",
    "emerald": "Its star is boiling the green atmosphere off into space, so it drags a tail behind it like a planet-sized comet.",
    "crimson": "So hot on its day side that iron evaporates, crosses to the night side and falls there as rain.",
    "violet": "A violet hot Jupiter darker than coal, reflecting less light than fresh asphalt despite being lit by a star."
  },
  "Rogue Planet": {
    "silver": "Thrown out of its own solar system young, this silver world drifts with no sun at all, and seems to prefer it.",
    "azure": "A blue rogue whose only light comes from its own faint heat, a campfire with no camp.",
    "amber": "Amber and alone, it may still hide a warm ocean under its ice, heated from inside and lit by nothing.",
    "emerald": "A green world that has been falling between the stars for longer than Earth has existed and has never once landed.",
    "crimson": "Red as a dying ember, it glows faintly in the infrared like a coal that refuses to go out.",
    "violet": "There may be more rogue planets than stars, and this violet one is the only one you will ever get to see."
  },
  "Tidally Locked World": {
    "silver": "One silver side has never known night and the other has never seen day, and everyone who matters lives on the line between.",
    "azure": "On its blue dark side the air itself freezes and falls as snow, then drifts back into the light to thaw.",
    "amber": "An amber world where the sun never moves in the sky, so noon lasts forever and nobody can be late for it.",
    "emerald": "Its green band of twilight is the only place anything could live: a ring of endless sunset around a whole planet.",
    "crimson": "A red world with one scorched face and one frozen one, staring at its star forever like it lost a bet.",
    "violet": "One violet storm has sat under its sun for millions of years, like a lighthouse that never blinks."
  },
  "Diamond World": {
    "silver": "A silver planet pressed mostly into crystal carbon: the most valuable thing in the sky, and no way to get it home.",
    "azure": "Its blue glint is diamond plains under an open sky, which would be, to put it mildly, a shoplifting risk.",
    "amber": "An amber diamond world, and somewhere a jeweller is weeping at how far away it is.",
    "emerald": "Green diamonds are the rarest kind on Earth, and here is a whole planet of them doing nothing with its life.",
    "crimson": "A red diamond world worth more than every economy on Earth combined, several times over, and nobody can collect.",
    "violet": "A violet diamond planet, the one object in this catalogue you could, technically, propose with."
  },
  "Volcanic Moon": {
    "silver": "Squeezed by its planet on every orbit, this silver moon erupts without pause, the most restless thing for a billion miles.",
    "azure": "Its blue volcanoes throw plumes so high that they fall back as snow on the far side of the moon.",
    "amber": "An amber moon with lava lakes wider than some countries, and not one of them has ever cooled.",
    "emerald": "Green with sulphur frost around its vents, it looks like a pizza that has been in the fridge far too long.",
    "crimson": "A crimson moon repaved by lava so often that it has no craters at all.",
    "violet": "A violet moon whose eruptions shoot clean out into space and feed a glowing ring around its planet."
  },
  "Ice Moon": {
    "silver": "Under its silver shell of ice lies a dark ocean warmer than you'd think, and something about that makes people very quiet.",
    "azure": "A blue ice moon spraying geysers from cracks near its pole, salt water freezing in mid-air as it flies.",
    "amber": "Amber stains streak its ice where the ocean below has leaked up through the cracks.",
    "emerald": "A green ice moon with more water under its shell than all of Earth's oceans put together.",
    "crimson": "Its ice is scored with red lines like scratches on a car door: cracks where the ocean keeps trying to get out.",
    "violet": "If anything swims in the dark beneath this violet ice, it has never once seen a star."
  },
  "Leonid Shower": {
    "silver": "Every few decades it becomes a silver storm of thousands of meteors an hour, then spends thirty years pretending it never happened.",
    "azure": "Blue Leonids hit the air at forty-four miles a second, the fastest meteors of the year and not ashamed of it.",
    "amber": "Amber fireballs that leave glowing trails hanging in the sky for minutes, like the smoke from a sparkler.",
    "emerald": "Green Leonids get their colour from nickel, and anyone who has seen one will tell you about it, at length, for years.",
    "crimson": "In 1833 a red Leonid storm fell so thick that people woke their neighbours to watch what they thought was the end of the world.",
    "violet": "A violet Leonid is the shower showing off, which it only does when it thinks nobody important is watching."
  },
  "Perseid Shower": {
    "silver": "The warm-night favourite: the silver dust of a comet that last swung by when your grandparents were young.",
    "azure": "Blue Perseids are best seen lying on a car roof in August, with nowhere to be and nobody asking where you are.",
    "amber": "Amber Perseids are the slow, bright ones, the meteors that make strangers at a campsite say \"did you see that?\"",
    "emerald": "Green streaks of comet dust older than the dinosaurs, burning up in the time it takes to point.",
    "crimson": "Red Perseid fireballs are rare and loud, sometimes leaving a sonic boom on the ground below.",
    "violet": "A violet Perseid is the one you see while everyone else is looking the other way."
  },
  "Geminid Shower": {
    "silver": "Born from a rock instead of a comet, this silver shower is the one that technically should not exist.",
    "azure": "Blue Geminids are slow and bright, the meteors for people who never manage to catch the fast ones.",
    "amber": "Amber grit from an asteroid that cracks in the Sun's heat and sheds a trail along its road every year.",
    "emerald": "Green Geminids light up the coldest nights of December, which is very generous of them.",
    "crimson": "Red Geminids are the shower's heavy hitters, chunks big enough to leave a glowing scar across half the sky.",
    "violet": "A violet Geminid comes from a rock that sheds like a dog in spring, every single year without fail."
  },
  "Draconid Shower": {
    "silver": "Most years this silver shower barely shows up, and then one evening it fills the whole sky as if it had something to prove.",
    "azure": "Blue Draconids fall at dusk instead of dawn, the only shower polite enough to keep office hours.",
    "amber": "Amber streaks pouring from the head of the Dragon, which is exactly as dramatic as it sounds.",
    "emerald": "In some years green Draconids have poured down at ten thousand an hour, and in most years almost none at all.",
    "crimson": "A red Draconid outburst once hit so hard that satellite operators turned their spacecraft away to shelter them.",
    "violet": "A violet Draconid is the dragon breathing, and it does not do that often."
  },
  "Supernova": {
    "silver": "For a few weeks this silver star outshines its whole galaxy, then spends a million years scattering the iron that ends up in your blood.",
    "azure": "A blue supernova bright enough to see in daylight for a month, as if someone had added a second, smaller sun.",
    "amber": "An amber shockwave racing outward at a tenth of the speed of light, still growing long after the star is gone.",
    "emerald": "Its green shell glows with oxygen made inside the star, the same oxygen every breath you take once came from.",
    "crimson": "A red supernova recorded by astronomers a thousand years ago who had no idea what they were looking at.",
    "violet": "A violet supernova is the rarest kind of goodbye, a star going out so brightly it rewrites its neighbourhood."
  },
  "Pulsar": {
    "silver": "The silver heart of a dead star, spinning hundreds of times a second and keeping better time than any clock on Earth.",
    "azure": "Its blue beam sweeps by so regularly that when the first one was found, it was jokingly labelled a message from aliens.",
    "amber": "An amber pulsar the size of a city and the weight of the Sun, so a teaspoon of it would outweigh a mountain.",
    "emerald": "A green pulsar with planets around it, the strangest solar system ever found: worlds orbiting a corpse.",
    "crimson": "A red pulsar slowing by a fraction of a second every million years, the most patient countdown in the galaxy.",
    "violet": "A violet pulsar so precise that a spacecraft could steer by it across the galaxy."
  },
  "Magnetar": {
    "silver": "Its silver magnetic field could wipe every credit card on Earth from halfway to the Moon, and it has never once apologised.",
    "azure": "A blue magnetar whose starquakes have shaken Earth's upper atmosphere from fifty thousand light years away.",
    "amber": "An amber magnetar so magnetic that atoms near it are stretched into needles thinner than pencil lines.",
    "emerald": "Green flares burst from it without warning, each releasing more energy than the Sun gives off in a hundred thousand years.",
    "crimson": "A red magnetar, the strongest magnet in the known universe, and it is about twelve miles across.",
    "violet": "A violet magnetar will lose its fury within ten thousand years, so you have caught it mid-tantrum."
  },
  "Black Hole": {
    "silver": "Nothing that goes in ever comes back out: not light, not time, and not the waiver claim you swore you submitted.",
    "azure": "Its blue disk spins at nearly the speed of light, the last thing anything sees before it isn't seen again.",
    "amber": "Near this amber black hole time runs so slowly that a minute there would be years back home.",
    "emerald": "The green glow around it is gas shredded and heated to millions of degrees on its way to nowhere.",
    "crimson": "A red black hole so heavy it bends starlight around itself, so you can see the stars directly behind it.",
    "violet": "A violet black hole quietly eating a star, a meal that will take longer than humanity has existed."
  },
  "Binary Black Hole": {
    "silver": "Two silver black holes circling closer every orbit until they merge and ring the fabric of space like a struck bell.",
    "azure": "When blue twins like these merge, they shake space itself, and a detector on Earth feels it a billion years later.",
    "amber": "An amber pair dancing faster and faster, a waltz that ends in the loudest silence in the universe.",
    "emerald": "These green black holes go round each other a hundred times a second just before the end, which is soon.",
    "crimson": "A red binary that will turn three Suns' worth of mass into pure energy in the instant they become one.",
    "violet": "A violet pair so evenly matched that neither can win, so they are simply going to become something new together."
  },
  "Kilonova": {
    "silver": "When two dead stars collide they forge gold and platinum, so every silver ring began as a crash like this one.",
    "azure": "This blue flash made more gold in one second than exists on Earth, then threw it all away into the dark.",
    "amber": "An amber kilonova glowing with fresh-made metals, the universe's only goldsmith working one spectacular shift.",
    "emerald": "Its green afterglow is rare elements decaying, the same kind of atoms inside the screen you are reading this on.",
    "crimson": "A red kilonova was the first cosmic crash we both saw and felt, in light and in ripples of space.",
    "violet": "Somewhere in this violet debris is the uranium of a power plant that won't exist for a billion years."
  },
  "Quasar": {
    "silver": "A black hole feeding so fast it outshines a trillion stars: the brightest bad habit in the universe.",
    "azure": "Its blue light left before the Earth formed, so you are looking at a galaxy that may not exist any more.",
    "amber": "An amber quasar firing jets millions of light years long, longer than the galaxy it lives in.",
    "emerald": "A green quasar whose light has been travelling for twelve billion years and is, frankly, exhausted.",
    "crimson": "Stretched by the expanding universe, its light has turned crimson on the longest journey there is.",
    "violet": "Up close this violet quasar would be brighter than staring at the Sun from a foot away."
  },
  "Nebula": {
    "silver": "A silver cloud so vast that light takes years to cross it, and somewhere deep inside new stars are quietly being born.",
    "azure": "Its blue glow is starlight bouncing off dust, a cosmic fog lit from the inside.",
    "amber": "An amber nebula that looks like something different from every angle, which is why it has eleven nicknames.",
    "emerald": "Green with glowing oxygen, it is a cosmic nursery somebody left the lights on in.",
    "crimson": "A crimson nebula of glowing hydrogen, the same element that makes up most of you.",
    "violet": "A violet nebula: the shell of a dying star breathed out gently, the prettiest way a star can say goodbye."
  },
  "Wolf-Rayet Star": {
    "silver": "It has blown off its outer layers in a howling silver wind and is burning through the rest of its life at full speed, no regrets.",
    "azure": "A blue Wolf-Rayet so fierce that its wind could strip the air off a planet in an afternoon.",
    "amber": "Its amber winds are carving a bubble in space light years wide, a sculptor who only works in explosions.",
    "emerald": "A green Wolf-Rayet wrapped in a spiral of dust like a pinwheel, spinning out a new coil every few years.",
    "crimson": "A crimson star that has already shed half its weight and is about to do something even more dramatic.",
    "violet": "A violet Wolf-Rayet that will end as a supernova or a black hole, and it is not telling which."
  },
  "Red Giant": {
    "silver": "An old silver giant swollen to a hundred times its size; in five billion years our own Sun will look exactly like this.",
    "azure": "A blue-tinged giant that has already swallowed its innermost planets and is still hungry.",
    "amber": "If this amber giant took the Sun's place it would reach past Mars, and Earth would be somewhere inside it.",
    "emerald": "Green-lit by the gas it breathes out, it is seeding space with the carbon future worlds will be made of.",
    "crimson": "A crimson giant pulsing slowly like a heartbeat, brightening and dimming over months as it breathes.",
    "violet": "A violet giant near the end, about to shed its skin and leave behind a tiny white star the size of Earth."
  }
};
const VERSION_CLAUSE = {
  prismatic: "this prismatic one throws a rainbow off every edge, as if it could not choose",
  ancient: "the light from this ancient one set off before the first fossils formed",
  mythic: "a mythic one like this is the kind people swear they saw and nobody believes",
};
export function loreFor(fam, colour, version) {
  const line = LORE[FAMILIES[fam]?.name]?.[colour];
  if (!line || !VERSION_CLAUSE[version]) return line || "";
  return `${line.replace(/\.$/, "")}; ${VERSION_CLAUSE[version]}.`;
}
export const COLOURS = [
  { id: "silver", name: "Silver", w: 0.3, c: ["#D8D3C8", "#5C5850"] },
  { id: "azure", name: "Azure", w: 0.2, c: ["#7FA6F5", "#173572"] },
  { id: "amber", name: "Amber", w: 0.2, c: ["#F2B45A", "#6B3B0B"] },
  { id: "emerald", name: "Emerald", w: 0.15, c: ["#6FD9A8", "#0F4A33"] },
  { id: "crimson", name: "Crimson", w: 0.1, c: ["#F06A5A", "#5E130C"] },
  { id: "violet", name: "Violet", w: 0.05, c: ["#B48CF2", "#2E1A5A"] },
];
export const VERSIONS = [
  { id: "", name: "", p: 1 - 1 / 12 - 1 / 40 - 1 / 200, mult: 1 },
  { id: "prismatic", name: "Prismatic", p: 1 / 12, mult: 1.5 },
  { id: "ancient", name: "Ancient", p: 1 / 40, mult: 2 },
  { id: "mythic", name: "Mythic", p: 1 / 200, mult: 4 },
];
export const TIER_P = { 1: 0.4, 2: 0.3, 3: 0.2, 4: 0.08, 5: 0.02 };
export const TIER_NAME = { 1: "Small bodies", 2: "Comets and dwarf worlds", 3: "Planets and moons", 4: "Meteor showers", 5: "Stellar events" };
const PTS = { 1: 10, 2: 30, 3: 80, 4: 40, 5: 250 };
export const CATALOGUE_SIZE = FAMILIES.length * COLOURS.length * VERSIONS.length;
export const famsIn = (t) => FAMILIES.filter((f) => f.tier === t);

// Each rare version gives a power-up; sets give them too.
export const POWERUPS = {
  prismatic: { name: "Refraction", text: "your next 3 actions each place 2 extra stars." },
  ancient: { name: "Old light", text: "for 10 minutes every action places double stars, and gold stars are 3 times as common." },
  mythic: { name: "Gravity well", text: "a star lands in every unfinished constellation, the core starts half full, every action places triple stars for 30 minutes, and your core can't cool for a week." },
};

// THE LADDER: one ladder, one season long (founder, Nov 11 2026: "keep it only for 1 season"). It starts over at KICKOFF with that season's
// constellations (see skySeasonFor); what carries over is the catalogue, sets, skins and the career shelf (`s.skies`: one trophy line per past
// season). kinds: `at` = orbit points earned this season; `three` = finish The Huddle, The Blitz and The Playbook this season; `singularity`
// = finish this season's Singularity, which earns that season's limited sky skin (e.g. "Orion 2026", only available that season). `title`: the
// season title it gives; `frame`: the share-card frame. `claim`: has cash value or needs the founder to act, so the member claims it and it
// is fulfilled by hand -- ONLY the top rungs do, and every perk lasts that season only (early access ends at the next kickoff). Spaced with
// mockups/night-sky-sim-live.mjs (season points, later seasons / a first season, which runs higher): light ~4,000 / 4,500, regular (3 actions a
// day) ~10,000 / 13,000, upper regular (4 a day) ~14,000 / 17,500, engaged (6 a day) ~21,000 / 26,000, hardcore (all 7 on ~95% of days, all
// year) ~31,000 / 37,000. Founder, Nov 11 2026: the free month (30,000) is for hardcore members ONLY -- never a regular; the week of plan
// (14,000) only for the top end of regular members; early access (12,000, founder: the more active half, not most members) is automatic.
export const LADDER = [
  { at: 200, reward: "First light: a profile badge for the season", title: "Spotter" },
  { at: 500, reward: "A silver season frame on your share cards", frame: "silver" },
  { three: true, reward: "Charted: finish The Huddle, The Blitz and The Playbook this season. This season's badge on your cards", title: "Charted" },
  { at: 1000, reward: "Season title: Lookout", title: "Lookout" },
  { at: 2000, reward: "Season title: Observer", title: "Observer" },
  { at: 3500, reward: "Season title: Tracker", title: "Tracker" },
  { singularity: true, reward: "Finish this season's Singularity: its limited sky skin, only available this season" },
  { at: 6000, reward: "Season title: Surveyor", title: "Surveyor" },
  { at: 12000, reward: "A gold season frame, plus early access to new tools and features for the rest of the season (automatic)", frame: "gold", early: true },
  { at: 14000, reward: "A week of the next plan up", claim: true },
  { at: 20000, reward: "Your name on a star in this season's sky", title: "Star-namer", claim: true },
  { at: 30000, reward: "A free month of your plan (a month of Explorer if you're on the free plan)", title: "Event Horizon", claim: true },
];
export const rungLabel = (r) => (r.three ? "Charted" : r.singularity ? "Singularity" : r.at.toLocaleString());
// Skins (Nov 11 2026, founder: "aesthetic rewards, like how real games use skins"). Purely cosmetic: a backdrop for the sky and a design for
// the core, shown on the page and on share cards. Each is unlocked by something the member did (`test`, read from their state) and is kept
// for good once earned (`s.skins`, filled by unlockSkins); `s.equip` is what they chose. Nothing here can be bought.
// rarity: how hard it is to earn (shown as a tier on each skin, the way games label cosmetics); progress(s) -> [have, need] for the bar
// under a locked skin. Tiers follow the simulation's unlock times: common within weeks, rare within a season, epic a regular member's
// first season, legendary a year or more, mythic years, limited = that season only.
const stellar = (s) => Object.values(s.found).some((e) => FAMILIES[e.fam]?.tier === 5);
const mythicFind = (s) => Object.values(s.found).some((e) => e.version === "mythic");
const bestSeason = (s) => Math.max(seasonProgress(s).points, ...Object.values(s.skies || {}).map((k) => k.points || 0));
export const SKINS = {
  sky: [
    { id: "deep", name: "Deep field", how: "Yours from the start", rarity: "standard" },
    { id: "nebula", name: "Nebula", how: "Reach 200 orbit points in total", rarity: "common", test: (s) => s.points >= 200, progress: (s) => [s.points, 200] },
    { id: "aurora", name: "Pillars", how: "Chart a season: finish The Huddle, The Blitz and The Playbook in one season", rarity: "rare", test: (s) => seasonProgress(s).sky || Object.values(s.skies || {}).some((k) => k.charted), progress: (s) => [seasonProgress(s).three, 3] },
    { id: "milkyway", name: "Milky Way", how: "Reach 6,000 orbit points in total", rarity: "rare", test: (s) => s.points >= 6000, progress: (s) => [s.points, 6000] },
    { id: "eclipse", name: "Supernova", how: "Find a stellar event", rarity: "epic", test: stellar, progress: (s) => [stellar(s) ? 1 : 0, 1] },
  ],
  core: [
    { id: "classic", name: "Classic", how: "Yours from the start", rarity: "standard" },
    { id: "pulsar", name: "Pulsar", how: "Reach 1,900 orbit points in total", rarity: "common", test: (s) => s.points >= 1900, progress: (s) => [s.points, 1900] },
    { id: "ringed", name: "Ringed", how: "Complete 25 sets", rarity: "epic", test: (s) => Object.keys(s.sets).length >= 25, progress: (s) => [Object.keys(s.sets).length, 25] },
    { id: "binary", name: "Binary", how: "Earn 6,000 points in one season", rarity: "epic", test: (s) => bestSeason(s) >= 6000, progress: (s) => [bestSeason(s), 6000] },
    { id: "quasar", name: "Quasar", how: "Find a mythic version of anything (1 in 200 finds)", rarity: "legendary", test: mythicFind, progress: (s) => [mythicFind(s) ? 1 : 0, 1] },
    { id: "horizon", name: "Event Horizon", how: "Reach 65,000 orbit points in total", rarity: "mythic", test: (s) => s.points >= 65000, progress: (s) => [s.points, 65000] },
  ],
};
export const RARITY = { standard: "Standard", common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic", limited: "Limited" };
const DEFAULT_SKIN = { sky: "deep", core: "classic" };
// A season's limited sky skin: id "season-2026", named after that season's Singularity constellation.
export const seasonSkinId = (season) => `season-${season}`;
export const seasonSkinName = (season) => `${skyFor(season)[3].real} ${season}`;
// Every sky skin a member can see: the fixed ones, every season skin they own, and this season's (to earn).
export function skySkinsFor(s) {
  const years = new Set((s.skins || []).filter((k) => k.startsWith("sky:season-")).map((k) => Number(k.slice(11))));
  if (s.season) years.add(s.season);
  const seasonal = [...years].sort().map((y) => ({ id: seasonSkinId(y), name: seasonSkinName(y), season: y, rarity: "limited", how: y === s.season ? `Finish The Singularity (${skyFor(y)[3].real}) this season. Only available in the ${y} season` : `From the ${y} season`, progress: y === s.season ? (x) => [x.filled.singularity.filter(Boolean).length, 10] : null }));
  return [...SKINS.sky, ...seasonal];
}
export const hasSkin = (s, kind, id) => id === DEFAULT_SKIN[kind] || (s.skins || []).includes(`${kind}:${id}`);
// Adds every skin the member has now earned; returns the newly unlocked ones (for the log).
export function unlockSkins(s, now = 0) {
  const got = [];
  const seasonal = s.season ? [{ id: seasonSkinId(s.season), name: seasonSkinName(s.season), test: (x) => seasonProgress(x).singularity }] : [];
  for (const kind of ["sky", "core"]) for (const k of kind === "sky" ? [...SKINS.sky, ...seasonal] : SKINS.core) {
    if (!k.test || hasSkin(s, kind, k.id) || !k.test(s)) continue;
    s.skins = [...(s.skins || []), `${kind}:${k.id}`];
    got.push(k);
    log(s, `New ${kind === "sky" ? "sky" : "core"} skin unlocked: ${k.name}`, now);
  }
  return got;
}
export function equipSkin(s, kind, id) {
  const known = SKINS[kind]?.some((k) => k.id === id) || (kind === "sky" && /^season-\d{4}$/.test(id));
  if (!known || !hasSkin(s, kind, id)) return false;
  s.equip = { ...DEFAULT_SKIN, ...(s.equip || {}), [kind]: id };
  return true;
}
export const equipped = (s) => ({ ...DEFAULT_SKIN, ...(s.equip || {}) });
export function seasonProgress(s) {
  const points = Math.max(0, s.points - (s.seasonBase || 0)), d = s.seasonDone || {};
  const three = ["huddle", "blitz", "playbook"].filter((id) => (d[id] || 0) > 0).length;
  const sing = (d.singularity || 0) > 0;
  const done = LADDER.map((r) => (r.three ? three === 3 : r.singularity ? sing : points >= r.at));
  const titled = LADDER.map((r, i) => (done[i] && r.title ? r.title : null)).filter(Boolean);
  const frames = LADDER.map((r, i) => (done[i] && r.frame ? r.frame : null)).filter(Boolean);
  return { season: s.season, points, sky: three === 3, three, singularity: sing, done, rungs: done.filter(Boolean).length, title: titled.at(-1) || "Spotter", frame: frames.at(-1) || null };
}
// The title a member is wearing this season ("Spotter" until Charted / a points rung replaces it).
export const titleOf = (s) => seasonProgress(s).title;

// Systems open gradually (twelve ideas at once is too many): constellations after the first find, the catalogue and sets after 10 finds.
export const UNLOCK = { constellations: 1, catalogue: 10 };
export const SET_COUNT = FAMILIES.length * 3 + 10;
export const DAY = 86400e3;

export function freshState() {
  return {
    v: 1,
    filled: Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, Array(c.n).fill(null)])),
    season: 0, skies: {}, seasonDone: {}, seasonBase: 0, skins: [], equip: {},
    mass: 0, points: 0, actions: 0, findsTotal: 0, lastActionAt: 0,
    daily: { day: "", done: [] },
    pending: [], found: {}, sets: {}, claimed: {},
    boosts: { extra: 0, doubleUntil: 0, goldUntil: 0, tripleUntil: 0, noCoolUntil: 0 },
    shower: 0, strains: 0, log: [],
    picks: {}, btm: [0, 0],
  };
}
export function normalize(s) {
  const base = freshState();
  const out = { ...base, ...(s && typeof s === "object" ? s : {}) };
  out.filled = { ...base.filled, ...(out.filled || {}) };
  out.boosts = { ...base.boosts, ...(out.boosts || {}) };
  out.daily = out.daily?.day != null ? out.daily : base.daily;
  // saved names follow the catalogue's current spelling (Nov 17 2026: every word capitalised, "Lava world" -> "Lava World")
  const rename = (e) => (e && FAMILIES[e.fam] && COLOURS.some((c) => c.id === e.colour) ? { ...e, name: findOf(e.fam, e.colour, e.version || "").name } : e);
  if (out.found) out.found = Object.fromEntries(Object.entries(out.found).map(([k, e]) => [k, rename(e)]));
  if (Array.isArray(out.pending)) out.pending = out.pending.map(rename);
  return out;
}

const pickW = (list, rnd) => { let r = rnd(), a = 0; for (const x of list) { a += x.w ?? x.p; if (r < a) return x; } return list[list.length - 1]; };
export function findOf(famId, colourId, versionId) {
  const fam = FAMILIES[famId], colour = COLOURS.find((c) => c.id === colourId), version = VERSIONS.find((v) => v.id === versionId);
  const oneIn = Math.round(1 / ((TIER_P[fam.tier] / famsIn(fam.tier).length) * colour.w * version.p));
  const name = [version.name, colour.name, fam.name].filter(Boolean).join(" ");
  return { key: `${famId}|${colourId}|${versionId}`, fam: famId, colour: colourId, version: versionId, tier: fam.tier, name, oneIn, mult: version.mult };
}
function log(s, text, now) { s.log.unshift({ t: now, text }); s.log = s.log.slice(0, 40); }
const full = (s, id) => s.filled[id].every(Boolean);
function fill(s, id, color, rnd) {
  const f = s.filled[id];
  const empty = f.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return false;
  f[empty[Math.floor(rnd() * empty.length)]] = color;
  if (empty.length === 1) s.seasonDone = { ...(s.seasonDone || {}), [id]: ((s.seasonDone || {})[id] || 0) + 1 }; // finished this season
  return true;
}
// one star: mostly the action's own colour, sometimes another, rarely gold (a wildcard that also lights The Singularity)
function placeStar(s, color, ctx, rnd) {
  let c = color;
  const r = rnd();
  const goldChance = (ctx.event === "aurora" ? 0.045 : 0.015) * (s.boosts.goldUntil > ctx.now ? 3 : 1);
  if (color === "gold") c = r < 0.25 ? "gold" : ["blue", "ember", "white"][Math.floor(rnd() * 3)];
  else if (color === "lucky") c = r < 0.08 ? "gold" : ["blue", "ember", "white"][Math.floor(rnd() * 3)]; // a share: any colour, 1 in 12 gold
  else if (r < goldChance) c = "gold";
  else if (r < goldChance + 0.17) c = ["blue", "ember", "white"].filter((x) => x !== color)[Math.floor(rnd() * 2)];
  if (c === "gold") {
    const target = CONSTELLATIONS.filter((k) => k.size !== "gold" && !full(s, k.id)).sort((a, b) => s.filled[a.id].filter((x) => !x).length - s.filled[b.id].filter((x) => !x).length)[0];
    if (target) fill(s, target.id, "gold", rnd);
    fill(s, "singularity", "gold", rnd);
    return "gold";
  }
  fill(s, CONSTELLATIONS.find((k) => k.color === c).id, c, rnd);
  return c;
}
export function litTier(s, event) {
  if (full(s, "singularity")) return 5;
  let t = 1;
  if (full(s, "huddle") || full(s, "blitz")) t = 2;
  if (full(s, "playbook")) t = 3;
  if (event === "eclipse") t = Math.min(3, t + 1);
  return t;
}
function spend(s, tier) {
  const id = tier === 5 ? "singularity" : tier === 3 && full(s, "playbook") ? "playbook" : tier >= 2 && tier <= 3 ? (full(s, "huddle") ? "huddle" : full(s, "blitz") ? "blitz" : null) : null;
  if (id) s.filled[id] = s.filled[id].map(() => null);
}
function applyPowerup(s, version, ctx, rnd) {
  const b = s.boosts, now = ctx.now;
  if (version === "prismatic") b.extra += 3;
  if (version === "ancient") { b.doubleUntil = Math.max(b.doubleUntil, now + 10 * 60e3); b.goldUntil = Math.max(b.goldUntil, now + 10 * 60e3); }
  if (version === "mythic") {
    for (const k of CONSTELLATIONS) if (!full(s, k.id)) fill(s, k.id, k.color, rnd);
    s.mass = Math.max(s.mass, 6);
    b.tripleUntil = Math.max(b.tripleUntil, now + 30 * 60e3);
    b.noCoolUntil = now + 7 * DAY;
  }
}
// Sets: Trio = 3 colours of a kind (44), Spectrum = all 6 (44), Quartet = 4 kinds in a tier (5), Survey = every kind in a tier (5),
// Legend = all 4 versions of a kind (44): 142 goals, each paying points and a power-up.
function checkSets(s, f, ctx, rnd) {
  const got = Object.values(s.found), fam = FAMILIES[f.fam], done = [];
  const mark = (key, label, power, pts) => { if (s.sets[key]) return; s.sets[key] = true; s.points += pts; applyPowerup(s, power, ctx, rnd); done.push({ label, power, pts }); };
  const cols = new Set(got.filter((e) => e.fam === f.fam).map((e) => e.colour)).size;
  const kinds = famsIn(fam.tier).filter((k) => got.some((e) => e.fam === k.id)).length;
  if (cols >= 3) mark(`trio:${f.fam}`, `Trio: 3 colours of ${fam.name}`, "prismatic", 40);
  if (cols === 6) mark(`spectrum:${f.fam}`, `Spectrum: every colour of ${fam.name}`, "ancient", 100);
  if (VERSIONS.every((v) => got.some((e) => e.fam === f.fam && e.version === v.id))) mark(`legend:${f.fam}`, `Legend: every version of ${fam.name}`, "mythic", 500);
  if (kinds >= 4) mark(`quartet:${fam.tier}`, `Quartet: 4 kinds of ${TIER_NAME[fam.tier].toLowerCase()}`, "prismatic", 60);
  if (kinds === famsIn(fam.tier).length) mark(`survey:${fam.tier}`, `Survey: every kind of ${TIER_NAME[fam.tier].toLowerCase()}`, fam.tier <= 2 ? "ancient" : "mythic", 250);
  return done;
}
export function setProgress(s) {
  const got = Object.values(s.found), out = [];
  for (const fam of FAMILIES) {
    const cols = new Set(got.filter((e) => e.fam === fam.id).map((e) => e.colour)).size;
    const vers = new Set(got.filter((e) => e.fam === fam.id).map((e) => e.version)).size;
    if (!s.sets[`trio:${fam.id}`] && cols) out.push({ kind: "trio", fam: fam.id, label: `Trio · ${fam.name}`, have: cols, of: 3, power: "Refraction" });
    else if (!s.sets[`spectrum:${fam.id}`] && cols) out.push({ kind: "spectrum", fam: fam.id, label: `Spectrum · ${fam.name}`, have: cols, of: 6, power: "Old light" });
    if (!s.sets[`legend:${fam.id}`] && vers > 1) out.push({ kind: "legend", fam: fam.id, label: `Legend · ${fam.name}`, have: vers, of: 4, power: "Gravity well" });
  }
  for (const t of [1, 2, 3, 4, 5]) {
    const all = famsIn(t).length, have = famsIn(t).filter((k) => got.some((e) => e.fam === k.id)).length;
    if (!s.sets[`quartet:${t}`] && have && all > 4) out.push({ kind: "quartet", tier: t, label: `Quartet · ${TIER_NAME[t]}`, have, of: 4, power: "Refraction" });
    else if (!s.sets[`survey:${t}`] && have) out.push({ kind: "survey", tier: t, label: `Survey · ${TIER_NAME[t]}`, have, of: all, power: t <= 2 ? "Old light" : "Gravity well" });
  }
  return out.sort((a, b) => a.of - a.have - (b.of - b.have) || b.have / b.of - a.have / a.of).slice(0, 5);
}

// The core collapses: the find is drawn (fairly, here, before anyone sees it), recorded, scored and queued for the telescope.
function collapse(s, ctx, rnd) {
  const lit = litTier(s, ctx.event);
  const r = rnd();
  const drawn = lit === 5 ? 5 : r < 0.4 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : r < 0.98 ? 4 : 5;
  let tier = drawn, miss = null;
  if ((drawn === 2 || drawn === 3) && drawn > lit) { tier = lit; miss = drawn; }
  if (drawn === 4) s.shower = Math.max(s.shower, ctx.now + 10 * 60e3);
  spend(s, tier);
  const fams = famsIn(tier);
  const f = findOf(fams[Math.floor(rnd() * fams.length)].id, pickW(COLOURS, rnd).id, pickW(VERSIONS, rnd).id);
  const had = s.found[f.key];
  s.found[f.key] = { n: (had?.n || 0) + 1, name: f.name, oneIn: f.oneIn, fam: f.fam, colour: f.colour, version: f.version, at: had?.at || ctx.now };
  s.findsTotal += 1;
  if (f.version) applyPowerup(s, f.version, ctx, rnd);
  const sets = checkSets(s, f, ctx, rnd);
  const pts = Math.round(PTS[tier] * f.mult) + (had ? 0 : 15);
  s.points += pts;
  s.mass = 0;
  const id = `SD-${String(new Date(ctx.now).getUTCFullYear()).slice(2)}-${Math.floor(rnd() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
  s.pending.push({ id, ...f, pts, first: !had, miss, shower: drawn === 4, sets, at: ctx.now });
  s.pending = s.pending.slice(-20);
  log(s, `Found: ${f.name} (1 in ${f.oneIn.toLocaleString()})`, ctx.now);
}

// One action. ctx = { now, day ("YYYY-MM-DD", Eastern), event: "tnf" | "eclipse" | "aurora" | null }. Returns what happened; `s` is changed in place.
export function award(s, action, ctx, rnd = Math.random) {
  const a = ACTIONS[action];
  if (!a) return { awarded: false };
  rollSeason(s, ctx.skySeason ?? ctx.season);
  if (s.daily.day !== ctx.day) s.daily = { day: ctx.day, done: [] };
  if (s.daily.done.includes(action)) return { awarded: false };
  s.daily.done.push(action);
  const now = ctx.now, b = s.boosts;
  if (a.quiet) { // one lucky star, no heat, no find (see ACTIONS.share)
    placeStar(s, a.color, ctx, rnd);
    log(s, `${a.label}: 1 star`, now);
    return { awarded: true, stars: 1 };
  }
  // the core cools when it's left alone for three days (unless a Gravity well holds it)
  if (s.lastActionAt && now - s.lastActionAt >= 3 * DAY && b.noCoolUntil < now && s.mass > 0) {
    const lost = Math.ceil(s.mass / 2);
    s.mass -= lost;
    log(s, `The core cooled while you were away (-${lost})`, now);
  }
  s.lastActionAt = now;
  s.actions += 1;
  let n = b.tripleUntil > now ? 3 : s.shower > now || ctx.event === "tnf" || b.doubleUntil > now ? 2 : 1;
  if (b.extra > 0) { n += 2; b.extra -= 1; }
  for (let i = 0; i < n; i++) placeStar(s, a.color, ctx, rnd);
  s.mass += n;
  log(s, `${a.label}: ${n} star${n === 1 ? "" : "s"}`, now);
  // a find about every 3 actions; a new member's first find comes by their second action
  const p = !s.findsTotal && s.actions >= 2 ? 1 : Math.min(0.7, 0.12 + 0.06 * s.mass);
  const r = rnd();
  if (r < p) { collapse(s, ctx, rnd); return { awarded: true, stars: n, collapsed: true }; }
  if (r < p + 0.14) { s.strains += 1; log(s, "The core strained … and held.", now); return { awarded: true, stars: n, strained: true }; }
  return { awarded: true, stars: n };
}

// ---- Beat the Model ----
// This week's three head-to-heads: neighbours in the weekly rankings at one position (RB, WR, TE), from the top 36 at it, picked the same way
// for everyone (seeded by the week). rows: [{ player_name, position, projection, rank }].
export function pickPairs(rows, season, week) {
  let seed = season * 100 + week;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (const pos of ["RB", "WR", "TE"]) {
    const pool = rows.filter((r) => r.position === pos && r.projection > 0).sort((a, b) => b.projection - a.projection).slice(0, 36);
    if (pool.length < 2) continue;
    const i = Math.floor(rnd() * (pool.length - 1));
    const [a, b] = rnd() < 0.5 ? [pool[i], pool[i + 1]] : [pool[i + 1], pool[i]];
    out.push({ a: a.player_name, b: b.player_name, pos, model: a.projection >= b.projection ? 0 : 1, gap: Math.round(Math.abs(a.projection - b.projection) * 10) / 10 });
  }
  return out;
}
// Grade a finished week: right picks light a star each (a gold star a quarter of the time) and earn 20 orbit points. points: name -> points.
export function gradePicks(s, key, points, ctx, rnd = Math.random) {
  const wk = s.picks[key];
  if (!wk || wk.graded) return 0;
  let right = 0, made = 0;
  wk.pairs.forEach((p, i) => {
    const c = wk.choice[i];
    if (c == null) return;
    const pa = points[p.a], pb = points[p.b];
    if (pa == null || pb == null || pa === pb) return; // a player without a game, or a tie: no decision
    made++;
    if ((c === 0 ? pa > pb : pb > pa)) { right++; placeStar(s, "gold", ctx, rnd); s.points += 20; }
  });
  wk.graded = true;
  wk.right = right;
  wk.made = made;
  s.btm = [s.btm[0] + right, s.btm[1] + made - right];
  if (made) log(s, `Beat the Model: ${right} of ${made} right`, ctx.now);
  return right;
}

// The NFL calendar's events. week: Sleeper's display week; date: the Eastern date.
export function eventFor(date, week) {
  const m = date.getUTCMonth(), d = date.getUTCDate(), dow = date.getUTCDay();
  if (m === 3 && d >= 22 && d <= 30) return "aurora"; // draft week (late April)
  if (week >= 15 && week <= 17) return "eclipse"; // the fantasy playoffs
  if (dow === 4 && week >= 1 && week <= 18) return "tnf"; // Thursday Night Football
  return null;
}
export const EVENT_TEXT = {
  tnf: "Thursday Night meteor shower: every action places two stars today.",
  eclipse: "Playoff eclipse: every find is powered one step up during the fantasy playoffs.",
  aurora: "Draft-week aurora: gold stars are three times as common.",
};
