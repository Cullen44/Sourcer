import { requireEnv } from "../env";
import type { FetchLike } from "../twitch/client";

const API = "https://www.googleapis.com/youtube/v3";

/** Quota cost per call, from the YouTube Data API v3 docs. */
export const QUOTA_COST = { search: 100, channels: 1, videos: 1, playlistItems: 1 } as const;

/** Thrown before a call that would exceed the allowance set by the caller. */
export class BudgetExceeded extends Error {
  constructor(resource: string) {
    super(`YouTube budget for this stage is spent (next call: ${resource})`);
  }
}

/** Thrown when Google reports the daily quota is gone; stop all YouTube work. */
export class QuotaExhausted extends Error {}

export interface Snippet {
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: string;
  tags?: string[];
  liveBroadcastContent?: string;
}

export interface SearchItem {
  id: { videoId?: string };
  snippet: Snippet;
}

export interface VideoItem {
  id: string;
  snippet: Snippet;
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
}

export interface ChannelItem {
  id: string;
  snippet: { title: string; customUrl?: string; country?: string };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface PlaylistItem {
  contentDetails: { videoId: string; videoPublishedAt?: string };
}

export interface SearchOptions {
  publishedAfter?: Date;
  maxResults?: number;
  order?: "date" | "relevance" | "viewCount";
  live?: boolean;
  gamingOnly?: boolean;
  regionCode?: string;
  relevanceLanguage?: string;
}

/**
 * YouTube Data API v3 client with an API key. Every call is charged against
 * `allowance` first, so a job stage can never overspend its share of the
 * 10,000/day quota (resets at midnight Pacific).
 */
export class YouTubeClient {
  unitsUsed = 0;
  allowance = Infinity;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  static fromEnv(): YouTubeClient {
    return new YouTubeClient(requireEnv("YOUTUBE_API_KEY"));
  }

  private async get<T>(resource: keyof typeof QUOTA_COST, params: Record<string, string>): Promise<T[]> {
    const cost = QUOTA_COST[resource];
    if (cost > this.allowance) throw new BudgetExceeded(resource);
    this.allowance -= cost;
    this.unitsUsed += cost;

    const qs = new URLSearchParams({ ...params, key: this.apiKey });
    const res = await this.fetchImpl(`${API}/${resource}?${qs}`);
    if (!res.ok) {
      // Error bodies carry a reason (quotaExceeded, keyInvalid, ...) but never the key.
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
      const reason = body?.error?.errors?.[0]?.reason ?? "unknown";
      const msg = `YouTube ${resource} failed: ${res.status} ${reason}: ${body?.error?.message ?? ""}`;
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new QuotaExhausted(msg);
      throw new Error(msg);
    }
    return ((await res.json()) as { items?: T[] }).items ?? [];
  }

  /** 100 units. Use sparingly. */
  search(query: string, opts: SearchOptions = {}): Promise<SearchItem[]> {
    return this.get<SearchItem>("search", {
      part: "snippet",
      type: "video",
      q: query,
      order: opts.order ?? "date",
      maxResults: String(opts.maxResults ?? 25),
      ...(opts.publishedAfter ? { publishedAfter: opts.publishedAfter.toISOString() } : {}),
      ...(opts.live ? { eventType: "live" } : {}),
      ...(opts.gamingOnly ? { videoCategoryId: "20" } : {}),
      ...(opts.regionCode ? { regionCode: opts.regionCode } : {}),
      ...(opts.relevanceLanguage ? { relevanceLanguage: opts.relevanceLanguage } : {}),
    });
  }

  /** 1 unit per 50 ids. */
  async videos(ids: string[]): Promise<VideoItem[]> {
    const out: VideoItem[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      out.push(...(await this.get<VideoItem>("videos", {
        part: "snippet,statistics,contentDetails",
        id: ids.slice(i, i + 50).join(","),
      })));
    }
    return out;
  }

  /** 1 unit per 50 ids. */
  async channels(ids: string[]): Promise<ChannelItem[]> {
    const out: ChannelItem[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      out.push(...(await this.get<ChannelItem>("channels", {
        part: "snippet,statistics,contentDetails",
        id: ids.slice(i, i + 50).join(","),
      })));
    }
    return out;
  }

  /** 1 unit. Resolves an @handle to its channel. */
  async channelByHandle(handle: string): Promise<ChannelItem | null> {
    const items = await this.get<ChannelItem>("channels", {
      part: "snippet,statistics,contentDetails",
      forHandle: handle.startsWith("@") ? handle : `@${handle}`,
    });
    return items[0] ?? null;
  }

  /** 1 unit. Resolves a legacy /user/ name to its channel. */
  async channelByUsername(username: string): Promise<ChannelItem | null> {
    const items = await this.get<ChannelItem>("channels", {
      part: "snippet,statistics,contentDetails",
      forUsername: username,
    });
    return items[0] ?? null;
  }

  /** 1 unit. Most recent video ids from an uploads playlist. */
  async recentUploadIds(playlistId: string, max = 20): Promise<string[]> {
    const items = await this.get<PlaylistItem>("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: String(Math.min(max, 50)),
    });
    return items.map((i) => i.contentDetails.videoId);
  }
}

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d! * 86400 + h! * 3600 + min! * 60 + s!;
}
