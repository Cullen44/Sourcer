import { requireEnv } from "../env";
import type { FetchLike } from "../twitch/client";

const API = "https://www.googleapis.com/youtube/v3";

/** Quota cost per call, from the YouTube Data API v3 docs. */
export const QUOTA_COST = { search: 100, channels: 1, videos: 1, playlistItems: 1 } as const;

export interface SearchItem {
  id: { videoId?: string };
  snippet: { channelId: string; channelTitle: string; title: string; description: string; publishedAt: string };
}

export interface VideoItem {
  id: string;
  snippet: { channelId: string; channelTitle: string; title: string; description: string; publishedAt: string };
  statistics?: { viewCount?: string };
}

export interface ChannelItem {
  id: string;
  snippet: { title: string; customUrl?: string };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

/**
 * YouTube Data API v3 client with an API key. Tracks quota units spent so
 * jobs can budget against the 10,000/day limit (resets midnight Pacific).
 */
export class YouTubeClient {
  unitsUsed = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  static fromEnv(): YouTubeClient {
    return new YouTubeClient(requireEnv("YOUTUBE_API_KEY"));
  }

  private async get<T>(resource: keyof typeof QUOTA_COST, params: Record<string, string>): Promise<T[]> {
    const qs = new URLSearchParams({ ...params, key: this.apiKey });
    this.unitsUsed += QUOTA_COST[resource];
    const res = await this.fetchImpl(`${API}/${resource}?${qs}`);
    if (!res.ok) {
      // Error bodies carry a reason (quotaExceeded, keyInvalid, ...) but never the key.
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
      const reason = body?.error?.errors?.[0]?.reason ?? "unknown";
      throw new Error(`YouTube ${resource} failed: ${res.status} ${reason}: ${body?.error?.message ?? ""}`);
    }
    return ((await res.json()) as { items?: T[] }).items ?? [];
  }

  /** 100 units. Use sparingly: brand mentions and promo codes only. */
  search(query: string, opts: { publishedAfter?: Date; maxResults?: number } = {}): Promise<SearchItem[]> {
    return this.get<SearchItem>("search", {
      part: "snippet",
      type: "video",
      q: query,
      order: "date",
      maxResults: String(opts.maxResults ?? 25),
      ...(opts.publishedAfter ? { publishedAfter: opts.publishedAfter.toISOString() } : {}),
    });
  }

  /** 1 unit per call, up to 50 ids. */
  videos(ids: string[]): Promise<VideoItem[]> {
    return this.get<VideoItem>("videos", { part: "snippet,statistics", id: ids.slice(0, 50).join(",") });
  }

  /** 1 unit per call, up to 50 ids. */
  channels(ids: string[]): Promise<ChannelItem[]> {
    return this.get<ChannelItem>("channels", {
      part: "snippet,statistics,contentDetails",
      id: ids.slice(0, 50).join(","),
    });
  }
}
