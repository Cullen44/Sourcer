import type { Browser } from "playwright";
import { describeShape, parseAds, reportedResultCount, type ParsedAd } from "./parse";

export type RunStatus = "ok" | "empty" | "blocked" | "error";

export interface PageResult {
  status: RunStatus;
  ads: ParsedAd[];
  /**
   * True only when the run provably saw every active ad: the Page has no more
   * active ads than the first page of results holds. For bigger advertisers
   * only the first page is seen, so new ads are recorded but stops are not.
   */
  complete: boolean;
  /** The total the Ad Library reports ("~500 results"), when shown. */
  reported: number | null;
  detail: string;
  shape: ReturnType<typeof describeShape>;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export function adLibraryUrl(pageId: string): string {
  const q = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "US",
    is_targeted_country: "false",
    media_type: "all",
    search_type: "page",
    view_all_page_id: pageId,
  });
  return `https://www.facebook.com/ads/library/?${q}`;
}

/** Whether the ads seen account for (nearly) all of the reported results. */
export function isComplete(ads: ParsedAd[], reported: number | null): boolean {
  if (reported === null) return false;
  if (reported === 0) return true;
  // Meta's count is approximate ("~120") and may count grouped versions individually.
  const seen = Math.max(ads.length, ads.reduce((n, a) => n + a.collationCount, 0));
  return seen >= reported * 0.9;
}

/**
 * Load one Page's active US ads in the public Ad Library: the first page of
 * results (about 30 ads) plus the total the Library reports. Reads the JSON
 * behind the page (initial HTML plus GraphQL responses), not the layout.
 */
export async function collectPage(browser: Browser, pageId: string, debug?: (msg: string) => void): Promise<PageResult> {
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US", timezoneId: "America/New_York", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/graphql")) {
      try {
        bodies.push(await r.text());
      } catch {
        /* response gone */
      }
    }
  });

  try {
    await page.goto(adLibraryUrl(pageId), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(6_000);
    for (const label of [/allow all cookies/i, /decline optional cookies/i, /only allow essential cookies/i]) {
      const btn = page.getByRole("button", { name: label }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(1_500);
        break;
      }
    }

    const bodyText = async () => (await page.locator("body").innerText().catch(() => "")) ?? "";
    const reported = reportedResultCount(await bodyText());
    const current = async () => parseAds([await page.content(), ...bodies]).filter((a) => !a.pageId || a.pageId === pageId);

    // Only the first page of results is collected: further pages are
    // rate-limited for logged-out visitors ("Rate limit exceeded"), and asking
    // anyway risks the first page too. See isComplete for what that implies.
    const ads = await current();
    if (debug) {
      const starts = ads.map((a) => a.startedAt?.getTime() ?? 0);
      const newestFirst = starts.every((t, i) => i === 0 || t <= starts[i - 1]!);
      const day = (t: number) => (t ? new Date(t).toISOString().slice(0, 10) : "?");
      debug(`  start dates in page order: first ${day(starts[0] ?? 0)}, last ${day(starts.at(-1) ?? 0)}, ` +
        `newest ${day(Math.max(...starts))}, oldest ${day(Math.min(...starts.filter(Boolean)))}, newest-first: ${newestFirst}`);
    }

    const html = await page.content();
    const shape = describeShape([html, ...bodies]);
    const url = page.url();
    const complete = isComplete(ads, reported);
    const detail = `reported ${reported ?? "?"}, collected ${ads.length} (${ads.reduce((n, a) => n + a.collationCount, 0)} incl. grouped)`;

    if (/\/login|\/checkpoint/.test(url) || (ads.length === 0 && /login_form|You must log in|Log into Facebook/i.test(html))) {
      return { status: "blocked", ads: [], complete: false, reported: null, detail: `login wall (${url.slice(0, 80)})`, shape };
    }
    if (ads.length > 0) return { status: "ok", ads, complete, reported, detail, shape };
    return { status: "empty", ads: [], complete: reported === 0, reported, detail: reported === 0 ? "Ad Library shows no active ads" : `no ads parsed; ${detail}`, shape };
  } catch (err) {
    return { status: "error", ads: [], complete: false, reported: null, detail: String(err instanceof Error ? err.message : err).slice(0, 500), shape: describeShape(bodies) };
  } finally {
    await ctx.close();
  }
}

