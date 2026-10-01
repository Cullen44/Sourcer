import type { Browser } from "playwright";
import { describeShape, parseAds, type ParsedAd } from "./parse";

export type RunStatus = "ok" | "empty" | "blocked" | "error";

export interface PageResult {
  status: RunStatus;
  ads: ParsedAd[];
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

/**
 * Load one Page's active US ads in the public Ad Library and scroll until no
 * new ads load. Reads the JSON behind the page (initial HTML plus GraphQL
 * responses), not the rendered layout.
 */
export async function collectPage(browser: Browser, pageId: string, maxScrolls = 40): Promise<PageResult> {
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

    const count = async () => parseAds([await page.content(), ...bodies]).length;
    let last = await count();
    let still = 0;
    for (let i = 0; i < maxScrolls && still < 3; i++) {
      await page.mouse.wheel(0, 5_000);
      await page.waitForTimeout(2_500);
      const n = await count();
      still = n === last ? still + 1 : 0;
      last = n;
    }

    const html = await page.content();
    const all = [html, ...bodies];
    // The page-view should only hold this Page's ads; drop anything else it embeds.
    const ads = parseAds(all).filter((a) => !a.pageId || a.pageId === pageId);
    const shape = describeShape(all);
    const url = page.url();

    if (/\/login|\/checkpoint/.test(url) || (ads.length === 0 && /login_form|You must log in|Log into Facebook/i.test(html))) {
      return { status: "blocked", ads: [], detail: `login wall (${url.slice(0, 80)})`, shape };
    }
    if (ads.length > 0) return { status: "ok", ads, detail: `${bodies.length} graphql responses`, shape };
    const noResults = /No ads match|~?0 results/i.test(html);
    return {
      status: "empty",
      ads: [],
      detail: noResults ? "Ad Library shows no active ads" : `no ads parsed (${bodies.length} graphql responses, ${html.length} bytes html)`,
      shape,
    };
  } catch (err) {
    return { status: "error", ads: [], detail: String(err instanceof Error ? err.message : err).slice(0, 500), shape: describeShape(bodies) };
  } finally {
    await ctx.close();
  }
}
