import { requireEnv } from "../env.js";

const HELIX = "https://api.twitch.tv/helix";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HelixStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
}

export interface HelixGame {
  id: string;
  name: string;
}

interface Page<T> {
  data: T[];
  pagination?: { cursor?: string };
}

/**
 * Minimal Twitch Helix client using an app access token (client credentials).
 * Fetches a fresh token per process rather than storing one; jobs are short-lived.
 */
export class TwitchClient {
  private token: string | null = null;
  /** Count of Helix requests made, for logging/run stats. */
  requests = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  static fromEnv(): TwitchClient {
    return new TwitchClient(requireEnv("TWITCH_CLIENT_ID"), requireEnv("TWITCH_CLIENT_SECRET"));
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
    });
    const res = await this.fetchImpl(TOKEN_URL, { method: "POST", body });
    if (!res.ok) throw new Error(`Twitch token request failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string };
    this.token = json.access_token;
    return this.token;
  }

  async get<T>(path: string, params: Record<string, string | string[]>): Promise<Page<T>> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
    }
    const url = `${HELIX}${path}?${qs}`;

    for (let attempt = 0; attempt < 4; attempt++) {
      this.requests++;
      const res = await this.fetchImpl(url, {
        headers: { "Client-Id": this.clientId, Authorization: `Bearer ${await this.getToken()}` },
      });
      if (res.ok) return (await res.json()) as Page<T>;
      if (res.status === 401 && attempt === 0) {
        this.token = null; // expired or revoked; fetch a new one and retry
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const reset = Number(res.headers.get("Ratelimit-Reset"));
        const waitMs = reset ? Math.max(0, reset * 1000 - Date.now()) + 250 : 1000 * 2 ** attempt;
        await sleep(Math.min(waitMs, 60_000));
        continue;
      }
      throw new Error(`Twitch ${path} failed: ${res.status} ${await res.text()}`);
    }
    throw new Error(`Twitch ${path} failed after retries`);
  }

  /**
   * Live streams for one category, highest viewers first. Stops paginating
   * once viewer counts fall below the floor instead of walking the whole list.
   */
  async streamsForGame(gameId: string, floor: number): Promise<HelixStream[]> {
    const out: HelixStream[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<HelixStream>("/streams", {
        game_id: gameId,
        first: "100",
        ...(cursor ? { after: cursor } : {}),
      });
      for (const s of page.data) if (s.viewer_count >= floor) out.push(s);
      const last = page.data.at(-1);
      if (!last || last.viewer_count < floor) break;
      cursor = page.pagination?.cursor;
    } while (cursor);
    return out;
  }

  /** Live streams for up to 100 specific users per request, any category. */
  async streamsForUsers(userIds: string[]): Promise<HelixStream[]> {
    const out: HelixStream[] = [];
    for (let i = 0; i < userIds.length; i += 100) {
      const page = await this.get<HelixStream>("/streams", {
        user_id: userIds.slice(i, i + 100),
        first: "100",
      });
      out.push(...page.data);
    }
    return out;
  }

  async searchCategories(query: string): Promise<HelixGame[]> {
    const out: HelixGame[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<HelixGame>("/search/categories", {
        query,
        first: "100",
        ...(cursor ? { after: cursor } : {}),
      });
      out.push(...page.data);
      cursor = page.data.length ? page.pagination?.cursor : undefined;
    } while (cursor && out.length < 300);
    return out;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
