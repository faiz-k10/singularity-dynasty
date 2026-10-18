import { HUB_CONFIG } from "@/lib/hubConfig";
import { pickDefaultTab } from "@/lib/hubCalc";
import { getHubData } from "./hubData";
import HubClient from "./HubClient";

// Server wrapper for the landing page's data hub: loads the (cached) free-depth data, picks the default tab for the time
// of year (lib/hubConfig.js), and hands both to the client component. Renders nothing if there is no data at all.
export default async function LandingHub() {
  const data = await getHubData();
  const hasAnything = data.players.length || data.sims.length || data.leans.length || Object.keys(data.stageCounts).length;
  if (!hasAnything) return null;
  const defaultTab = pickDefaultTab(HUB_CONFIG, new Date(), data.latest?.season ?? null);
  return <HubClient data={data} config={HUB_CONFIG} defaultTab={defaultTab} />;
}
