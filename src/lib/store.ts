import { Redis } from "@upstash/redis";
import type { CategoryId } from "./topics";
import type { ImageKind, Visual } from "./visual";

export type DraftStatus = "pending" | "posted" | "skipped";

export type Draft = {
  id: string;
  category: CategoryId | "idea";
  // Set when the post was written from your own idea instead of the news.
  idea?: string;
  topic: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
  status: DraftStatus;
  createdAt: string;
  telegramMessageId?: number;
  postUrl?: string;
  // Image shown with the post. Older drafts have none of these fields.
  visual?: Visual;
  image?: ImageKind;
  photoFileId?: string; // your own photo, sent on Telegram
  imageMessageId?: number;
};

export type LinkedInToken = {
  accessToken: string;
  expiresAt: number; // ms since epoch
  personUrn: string;
  name?: string;
};

const WEEK_SECONDS = 7 * 24 * 60 * 60;

let client: Redis | undefined;

function redis(): Redis {
  // Upstash directly uses UPSTASH_*; the Vercel Marketplace integration uses KV_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. See SETUP.md.");
  }
  client ??= new Redis({ url, token });
  return client;
}

export async function saveDraft(draft: Draft): Promise<void> {
  await redis().set(`draft:${draft.id}`, draft, { ex: WEEK_SECONDS });
  if (draft.status === "pending") await redis().set("last_draft", draft.id, { ex: WEEK_SECONDS });
}

// The newest pending draft, so a photo you send can be attached to it.
export async function getLastPendingDraft(): Promise<Draft | null> {
  const id = await redis().get<string>("last_draft");
  const draft = id ? await getDraft(id) : null;
  return draft?.status === "pending" ? draft : null;
}

export async function getDraft(id: string): Promise<Draft | null> {
  return redis().get<Draft>(`draft:${id}`);
}

// Returns true only for the first caller, so a double tap can't post twice.
export async function lockDraft(id: string): Promise<boolean> {
  return (await redis().set(`lock:${id}`, 1, { nx: true, ex: 120 })) === "OK";
}

export async function unlockDraft(id: string): Promise<void> {
  await redis().del(`lock:${id}`);
}

export async function setPendingEdit(id: string | null): Promise<void> {
  if (id) await redis().set("pending_edit", id, { ex: 60 * 60 });
  else await redis().del("pending_edit");
}

export async function getPendingEdit(): Promise<string | null> {
  return redis().get<string>("pending_edit");
}

// After you tap 💡 My idea, your next message is the idea.
export async function setAwaitingIdea(waiting: boolean): Promise<void> {
  if (waiting) await redis().set("awaiting_idea", 1, { ex: 60 * 60 });
  else await redis().del("awaiting_idea");
}

export async function isAwaitingIdea(): Promise<boolean> {
  return (await redis().get("awaiting_idea")) !== null;
}

export async function getUsedLinks(): Promise<Set<string>> {
  return new Set(await redis().smembers<string[]>("used_links"));
}

export async function markLinkUsed(url: string): Promise<void> {
  await redis().sadd("used_links", url);
}

export async function saveLinkedInToken(token: LinkedInToken): Promise<void> {
  await redis().set("linkedin:token", token);
}

export async function getLinkedInToken(): Promise<LinkedInToken | null> {
  return redis().get<LinkedInToken>("linkedin:token");
}

export async function saveOAuthState(state: string): Promise<void> {
  await redis().set(`oauth_state:${state}`, 1, { ex: 10 * 60 });
}

// One-time use: deleting returns 1 only if the state existed.
export async function consumeOAuthState(state: string): Promise<boolean> {
  return (await redis().del(`oauth_state:${state}`)) === 1;
}
