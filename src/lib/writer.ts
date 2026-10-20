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

async function callGemini(system: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${data.error?.message ?? "unknown"}`);
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

  try {
    return parseContent(await callGemini(system, prompt), candidates);
  } catch (err) {
    // One retry covers the occasional malformed JSON answer.
    console.warn("First draft attempt failed, retrying:", err instanceof Error ? err.message : err);
    return parseContent(await callGemini(system, prompt), candidates);
  }
}
