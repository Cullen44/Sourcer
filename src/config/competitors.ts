/**
 * Sponsor-watch list. Priority 1 = direct comps. fbPageIds are the Facebook
 * Pages whose ads are collected from the Meta Ad Library: in the Ad Library,
 * pick the advertiser from the search dropdown and copy view_all_page_id from
 * the URL. searchQueries are the nightly YouTube searches for videos that
 * mention the brand (100 units each).
 */
export interface CompetitorSeed {
  name: string;
  priority: 1 | 2;
  fbPageIds: string[];
  domains: string[];
  knownCodes: string[];
  searchQueries: string[];
}

export const COMPETITORS: CompetitorSeed[] = [
  // The home brand, tracked the same way as a baseline for the competitors.
  { name: "Boba Charge", priority: 1, fbPageIds: ["1148994618304224"], domains: ["bobacharge.com"], knownCodes: [], searchQueries: ['"Boba Charge"'] },
  // Airbnb's official charger partner for hosts.
  { name: "ChargePoint", priority: 1, fbPageIds: ["59788879399"], domains: ["chargepoint.com"], knownCodes: [], searchQueries: ["ChargePoint airbnb", "ChargePoint home charger"] },
  // Peer-to-peer charger sharing; hosts can rent their charger out.
  { name: "EVmatch", priority: 1, fbPageIds: ["1599619566964007"], domains: ["evmatch.com"], knownCodes: [], searchQueries: ['"EVmatch"'] },
];
