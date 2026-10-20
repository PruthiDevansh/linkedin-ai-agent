// What the agent posts about. Each day of the week gets one category,
// so your feed stays varied. Edit freely.

export type CategoryId =
  | "dotnet"
  | "ai-models"
  | "ai-usecases"
  | "fintech"
  | "startups"
  | "career";

export type Category = {
  label: string;
  // How the post should approach the news.
  angle: string;
  // RSS/Atom feeds to read headlines from.
  feeds: string[];
  // Hacker News searches. Points on HN are our "is this going viral?" signal.
  hnQueries: string[];
};

export const CATEGORIES: Record<CategoryId, Category> = {
  dotnet: {
    label: ".NET & backend",
    angle:
      "Explain what changed and whether a backend developer should care. Give one practical tip or code-level takeaway.",
    feeds: [
      "https://devblogs.microsoft.com/dotnet/feed/",
      "https://andrewlock.net/rss.xml",
    ],
    hnQueries: [".NET", "C#", "backend", "Postgres"],
  },
  "ai-models": {
    label: "New AI models: best or not?",
    angle:
      "Say what is new, who it is good for, and give an honest verdict: is it really better, or is it hype? Compare with models people already use.",
    feeds: [
      "https://simonwillison.net/atom/everything/",
      "https://huggingface.co/blog/feed.xml",
      "https://techcrunch.com/category/artificial-intelligence/feed/",
    ],
    hnQueries: ["LLM", "model release", "open weights"],
  },
  "ai-usecases": {
    label: "Real AI use cases",
    angle:
      "Describe one concrete use case, how it works in simple words, and how a developer could build something similar.",
    feeds: [
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "https://simonwillison.net/atom/everything/",
    ],
    hnQueries: ["AI agent", "built with AI"],
  },
  fintech: {
    label: "What's happening in fintech",
    angle:
      "Explain the news and what it means for users and developers, especially in India (UPI, RBI, payments, lending).",
    feeds: [
      "https://techcrunch.com/category/fintech/feed/",
      "https://www.finextra.com/rss/headlines.aspx",
      "https://inc42.com/feed/",
    ],
    hnQueries: ["fintech", "payments", "Stripe", "banks"],
  },
  startups: {
    label: "Startups & fundraising",
    angle:
      "Who raised money or launched, why it matters, and one lesson for builders and founders.",
    feeds: [
      "https://techcrunch.com/category/startups/feed/",
      "https://inc42.com/feed/",
      "https://yourstory.com/feed",
    ],
    hnQueries: ["raises", "Show HN"],
  },
  career: {
    label: "Career tips",
    angle:
      "Give one actionable career tip for software developers, connected to today's news (hiring, layoffs, skills in demand, interviews).",
    feeds: ["https://newsletter.pragmaticengineer.com/feed"],
    hnQueries: ["career", "hiring", "layoffs"],
  },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

// Sunday = 0 ... Saturday = 6, in India time.
const WEEKLY_PLAN: CategoryId[] = [
  "career", // Sun
  "dotnet", // Mon
  "ai-models", // Tue
  "fintech", // Wed
  "ai-usecases", // Thu
  "startups", // Fri
  "career", // Sat
];

export function categoryForToday(now = new Date()): CategoryId {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return WEEKLY_PLAN[index] ?? "ai-models";
}

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as string[]).includes(value);
}
