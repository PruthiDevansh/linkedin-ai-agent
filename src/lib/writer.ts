import { env } from "./config";
import { PROFILE } from "./profile";
import type { Candidate } from "./sources";
import { CATEGORIES, type CategoryId } from "./topics";

export type PostContent = {
  topic: string;
  sourceTitle: string;
  sourceUrl: string;
  post: string;
};

const MAX_POST_CHARS = 2800; // LinkedIn allows 3000

function systemPrompt(category: CategoryId): string {
  const cat = CATEGORIES[category];
  return [
    `You write LinkedIn posts for ${PROFILE.name}. About them: ${PROFILE.about}`,
    `Audience: ${PROFILE.audience}.`,
    `Today's theme: ${cat.label}. ${cat.angle}`,
    "",
    "Writing style:",
    ...PROFILE.voice.map((v) => `- ${v}`),
    "",
    "How to write a post that spreads on LinkedIn:",
    "- First line is a hook under 12 words that makes people click 'see more'. No clickbait lies.",
    "- 120 to 220 words. Short lines with blank lines between them.",
    "- One clear opinion or lesson, not a news summary.",
    "- End with a simple question that invites comments.",
    "- Add 3 to 5 relevant hashtags on the last line, like #dotnet #AI.",
    "- Do not put any links in the post.",
    "",
    "Facts:",
    "- Use only facts that appear in the headlines and snippets you are given. Never invent numbers, names, quotes or dates.",
    "- If a detail is unclear, write it as your opinion or as a question instead.",
  ].join("\n");
}

function userPrompt(candidates: Candidate[], trending: string[]): string {
  const list = candidates
    .map((c, i) =>
      [
        `${i + 1}. ${c.title}`,
        `   source: ${c.source}${c.points ? ` (${c.points} points on Hacker News)` : ""}`,
        `   url: ${c.url}`,
        c.snippet ? `   snippet: ${c.snippet}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return [
    "Here are today's fresh headlines for this theme:",
    list,
    "",
    trending.length
      ? `Top Google searches in India today (use only if truly related): ${trending.join(", ")}`
      : "",
    "",
    "Pick the ONE headline most likely to get engagement from this audience and write the post about it.",
    'Reply with JSON only: {"topic": string, "sourceTitle": string, "sourceUrl": string, "post": string}',
    "sourceTitle and sourceUrl must be copied exactly from the headline you chose.",
  ].join("\n");
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// 503 = overloaded, 429 = rate limit, 0 = timeout/network. All usually pass quickly.
const isBusy = (err: unknown) => err instanceof GeminiError && [0, 429, 500, 503].includes(err.status);

// The free tier gets busy at peak times: retry once, then switch to the lighter model.
async function callGemini(system: string, prompt: string): Promise<string> {
  const plan = [env.geminiModel, env.geminiModel, env.geminiFallbackModel];
  let lastError: unknown;
  for (const [i, model] of plan.entries()) {
    try {
      return await callGeminiModel(model, system, prompt);
    } catch (err) {
      if (!isBusy(err)) throw err;
      lastError = err;
      console.warn(`Gemini ${model} busy (try ${i + 1}/${plan.length}):`, (err as Error).message);
      if (i === 0) await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  throw lastError;
}

async function callGeminiModel(model: string, system: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(18_000),
  }).catch((err) => {
    throw new GeminiError(`Gemini did not answer in time (${err instanceof Error ? err.message : err})`, 0);
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    throw new GeminiError(`Gemini error ${res.status}: ${data.error?.message ?? "unknown"}`, res.status);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty answer.");
  return text;
}

function parseContent(raw: string, candidates: Candidate[]): PostContent {
  const json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Partial<PostContent>;
  const post = json.post?.trim();
  if (!post) throw new Error("Gemini answer had no post text.");

  // Make sure the source really is one of our headlines, so you can verify it.
  const chosen =
    candidates.find((c) => c.url === json.sourceUrl) ??
    candidates.find((c) => c.title === json.sourceTitle) ??
    candidates[0];

  return {
    topic: json.topic?.trim() || chosen.title,
    sourceTitle: chosen.title,
    sourceUrl: chosen.url,
    post: post.slice(0, MAX_POST_CHARS),
  };
}

export async function writePost(
  category: CategoryId,
  candidates: Candidate[],
  trending: string[],
): Promise<PostContent> {
  if (!candidates.length) throw new Error("No headlines to write about.");
  const system = systemPrompt(category);
  const prompt = userPrompt(candidates, trending);

  const raw = await callGemini(system, prompt);
  try {
    return parseContent(raw, candidates);
  } catch (err) {
    // One retry covers the occasional malformed JSON answer.
    console.warn("Draft answer was malformed, retrying:", err instanceof Error ? err.message : err);
    return parseContent(await callGemini(system, prompt), candidates);
  }
}
