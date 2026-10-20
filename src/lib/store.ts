import { Redis } from "@upstash/redis";
import type { CategoryId } from "./topics";

export type DraftStatus = "pending" | "posted" | "skipped";

export type Draft = {
  id: string;
  category: CategoryId;
  topic: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
  status: DraftStatus;
  createdAt: string;
  telegramMessageId?: number;
  postUrl?: string;
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
