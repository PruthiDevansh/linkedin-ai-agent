import Parser from "rss-parser";
import { CATEGORIES, type CategoryId } from "./topics";

export type Candidate = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt?: string;
  points?: number;
};

const USER_AGENT = "linkedin-ai-agent/1.0 (+https://github.com/PruthiDevansh/linkedin-ai-agent)";
const DAY_MS = 24 * 60 * 60 * 1000;

const parser = new Parser({ timeout: 10_000, headers: { "User-Agent": USER_AGENT } });

async function fromFeed(feedUrl: string, sinceMs: number): Promise<Candidate[]> {
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items ?? [])
      .filter((item) => item.link && item.title)
      .filter((item) => {
        const time = item.isoDate ? Date.parse(item.isoDate) : NaN;
        return Number.isNaN(time) || time >= sinceMs;
      })
      .slice(0, 8)
      .map((item) => ({
        title: item.title!.trim(),
        url: item.link!,
        source: feed.title?.trim() || new URL(feedUrl).hostname,
        snippet: (item.contentSnippet ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
        publishedAt: item.isoDate,
      }));
  } catch (err) {
    console.warn(`Feed failed: ${feedUrl}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

type HnHit = { title: string; url: string | null; points: number; objectID: string; created_at: string };

async function fromHackerNews(query: string, sinceMs: number): Promise<Candidate[]> {
  const since = Math.floor(sinceMs / 1000);
  const url =
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
    `&tags=story&numericFilters=created_at_i>${since},points>20&hitsPerPage=10` +
    // Exact title matches only; typo matching turns "backend" into "hacked".
    `&typoTolerance=false&restrictSearchableAttributes=title`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { hits: HnHit[] };
    return data.hits.map((hit) => ({
      title: hit.title,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: "Hacker News",
      snippet: `${hit.points} points on Hacker News`,
      points: hit.points,
      publishedAt: hit.created_at,
    }));
  } catch (err) {
    console.warn(`Hacker News search failed for "${query}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

function newestFirst(a: Candidate, b: Candidate) {
  return Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0");
}

// Fresh headlines for a category, most "viral" first. Skips links already used.
export async function findCandidates(category: CategoryId, exclude: Set<string>): Promise<Candidate[]> {
  const cat = CATEGORIES[category];
  let found: Candidate[] = [];

  // Prefer the last 3 days; widen to a week on slow news days.
  for (const days of [3, 7]) {
    const since = Date.now() - days * DAY_MS;
    const [feedItems, hnItems] = await Promise.all([
      Promise.all(cat.feeds.map((f) => fromFeed(f, since))).then((r) => r.flat()),
      Promise.all(cat.hnQueries.map((q) => fromHackerNews(q, since))).then((r) => r.flat()),
    ]);

    const seen = new Set<string>();
    const fresh = (c: Candidate) => {
      const key = c.title.toLowerCase();
      if (exclude.has(c.url) || seen.has(c.url) || seen.has(key)) return false;
      seen.add(c.url);
      seen.add(key);
      return true;
    };

    const hot = hnItems.sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).filter(fresh).slice(0, 8);
    const recent = feedItems.sort(newestFirst).filter(fresh).slice(0, 14);
    found = [...hot, ...recent];
    if (found.length >= 5) break;
  }
  return found;
}

// Today's top Google searches in India, as a hint for what people care about.
export async function fetchTrendingSearches(): Promise<string[]> {
  try {
    const feed = await parser.parseURL("https://trends.google.com/trending/rss?geo=IN");
    return (feed.items ?? []).map((i) => i.title?.trim() ?? "").filter(Boolean).slice(0, 15);
  } catch (err) {
    console.warn("Google Trends failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
