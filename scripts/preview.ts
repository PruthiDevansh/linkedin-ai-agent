// Try the agent on your computer without Telegram, LinkedIn or a database.
//   npm run preview            -> today's topic
//   npm run preview -- fintech -> a specific topic
// Shows the headlines found; also writes a post if GEMINI_API_KEY is in .env.local.

import { fetchTrendingSearches, findCandidates } from "../src/lib/sources";
import { CATEGORIES, CATEGORY_IDS, categoryForToday, isCategoryId } from "../src/lib/topics";
import { writePost } from "../src/lib/writer";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local yet; headlines still work.
}

const arg = process.argv[2];
if (arg && !isCategoryId(arg)) {
  console.error(`Unknown topic "${arg}". Use one of: ${CATEGORY_IDS.join(", ")}`);
  process.exit(1);
}
const category = arg && isCategoryId(arg) ? arg : categoryForToday();

async function main() {
  console.log(`\nTopic: ${CATEGORIES[category].label}\n`);
  const [candidates, trending] = await Promise.all([findCandidates(category, new Set()), fetchTrendingSearches()]);

  console.log(`Found ${candidates.length} headlines:`);
  for (const c of candidates) {
    console.log(`- ${c.title}  [${c.source}${c.points ? `, ${c.points} pts` : ""}]`);
  }
  console.log(`\nGoogle Trends India today: ${trending.slice(0, 8).join(", ") || "(none)"}\n`);

  if (!process.env.GEMINI_API_KEY) {
    console.log("Add GEMINI_API_KEY to .env.local to also see the written post.");
  } else if (candidates.length) {
    const content = await writePost(category, candidates, trending);
    console.log(`Source: ${content.sourceTitle}\n${content.sourceUrl}\n`);
    console.log("──────── LinkedIn post ────────\n");
    console.log(content.post);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
