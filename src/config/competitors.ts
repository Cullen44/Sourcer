/**
 * Sponsor-watch list. Priority 1 = direct comps (regulatory/positioning or
 * closest audience). fbPageId comes from each brand's Facebook Page →
 * Page Transparency panel; fill in as they are collected.
 */
export interface CompetitorSeed {
  name: string;
  priority: 1 | 2;
  fbPageId: string | null;
  domains: string[];
  knownCodes: string[];
}

export const COMPETITORS: CompetitorSeed[] = [
  { name: "Kalshi", priority: 1, fbPageId: null, domains: ["kalshi.com"], knownCodes: ["2KSIGNUP"] },
  { name: "Polymarket", priority: 1, fbPageId: null, domains: ["polymarket.com", "poly2016.com"], knownCodes: ["2016"] },
  { name: "Underdog Fantasy", priority: 1, fbPageId: null, domains: ["underdogfantasy.com"], knownCodes: [] },
  { name: "PrizePicks", priority: 2, fbPageId: null, domains: ["prizepicks.com"], knownCodes: [] },
  { name: "DraftKings", priority: 2, fbPageId: null, domains: ["draftkings.com"], knownCodes: [] },
  { name: "FanDuel", priority: 2, fbPageId: null, domains: ["fanduel.com"], knownCodes: [] },
];
