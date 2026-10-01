/**
 * Sponsor-watch list. Priority 1 = direct comps (regulatory/positioning or
 * closest audience). fbPageIds are the Facebook Pages whose ads are collected
 * from the Meta Ad Library: in the Ad Library, pick the advertiser from the
 * search dropdown and copy view_all_page_id from the URL. A brand can run
 * ads from several Pages (sportsbook, casino, fantasy); list each one.
 */
export interface CompetitorSeed {
  name: string;
  priority: 1 | 2;
  fbPageIds: string[];
  domains: string[];
  knownCodes: string[];
}

export const COMPETITORS: CompetitorSeed[] = [
  { name: "Kalshi", priority: 1, fbPageIds: ["108107432370909"], domains: ["kalshi.com"], knownCodes: ["2KSIGNUP"] },
  { name: "Polymarket", priority: 1, fbPageIds: ["101309195074880"], domains: ["polymarket.com", "poly2016.com"], knownCodes: ["2016"] },
  { name: "Underdog Fantasy", priority: 1, fbPageIds: ["100653998267239"], domains: ["underdogfantasy.com"], knownCodes: [] },
  { name: "PrizePicks", priority: 2, fbPageIds: ["2026200897655629"], domains: ["prizepicks.com"], knownCodes: [] },
  { name: "DraftKings", priority: 2, fbPageIds: [], domains: ["draftkings.com"], knownCodes: [] },
  { name: "FanDuel", priority: 2, fbPageIds: [], domains: ["fanduel.com"], knownCodes: [] },
];
