import { describe, expect, it } from "vitest";
import { TwitchClient, type FetchLike, type HelixStream } from "../src/twitch/client.js";

function stream(id: string, viewers: number): HelixStream {
  return {
    id, user_id: `u${id}`, user_login: `user${id}`, user_name: `User${id}`, game_id: "g1", game_name: "Tekken 8",
    type: "live", title: `stream ${id}`, viewer_count: viewers, started_at: "2026-10-01T00:00:00Z",
    language: "en", thumbnail_url: "",
  };
}

function fakeFetch(handler: (url: URL, calls: number) => Response): { fetch: FetchLike; urls: URL[] } {
  const urls: URL[] = [];
  return {
    urls,
    fetch: async (raw) => {
      const url = new URL(raw);
      if (url.hostname === "id.twitch.tv") return Response.json({ access_token: "tok", expires_in: 5_000_000 });
      urls.push(url);
      return handler(url, urls.length);
    },
  };
}

describe("TwitchClient.streamsForGame", () => {
  it("stops paginating once viewer counts drop below the floor", async () => {
    const pages: Record<string, { data: HelixStream[]; pagination: { cursor?: string } }> = {
      "": { data: [stream("1", 500), stream("2", 100)], pagination: { cursor: "c1" } },
      c1: { data: [stream("3", 40), stream("4", 10)], pagination: { cursor: "c2" } },
      c2: { data: [stream("5", 5)], pagination: {} },
    };
    const f = fakeFetch((url) => Response.json(pages[url.searchParams.get("after") ?? ""]));
    const result = await new TwitchClient("id", "secret", f.fetch).streamsForGame("g1", 20);

    expect(result.map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(f.urls).toHaveLength(2); // never fetched page c2
  });

  it("refreshes the token once on 401", async () => {
    const f = fakeFetch((_url, n) =>
      n === 1 ? new Response("expired", { status: 401 }) : Response.json({ data: [stream("1", 50)], pagination: {} }),
    );
    const result = await new TwitchClient("id", "secret", f.fetch).streamsForGame("g1", 20);
    expect(result).toHaveLength(1);
  });
});

describe("TwitchClient.streamsForUsers", () => {
  it("batches user ids 100 per request", async () => {
    const f = fakeFetch(() => Response.json({ data: [], pagination: {} }));
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    await new TwitchClient("id", "secret", f.fetch).streamsForUsers(ids);
    expect(f.urls.map((u) => u.searchParams.getAll("user_id").length)).toEqual([100, 100, 50]);
  });
});
