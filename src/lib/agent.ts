import { randomUUID } from "node:crypto";
import { env } from "./config";
import { LinkedInAuthError, publishPost } from "./linkedin";
import { fetchTrendingSearches, findCandidates } from "./sources";
import {
  getDraft,
  getLinkedInToken,
  getUsedLinks,
  lockDraft,
  markLinkUsed,
  saveDraft,
  unlockDraft,
  type Draft,
} from "./store";
import { removeButtons, sendDraft, sendText } from "./telegram";
import { categoryForToday, type CategoryId } from "./topics";
import { writePost } from "./writer";

const RECONNECT_WARNING_DAYS = 7;

export function linkedInConnectUrl() {
  return `${env.appUrl}/api/linkedin/auth?key=${encodeURIComponent(env.adminSecret)}`;
}

// Find news, write a post, and send it to Telegram for approval.
export async function createAndSendDraft(category: CategoryId = categoryForToday()): Promise<Draft | null> {
  const [used, trending] = await Promise.all([getUsedLinks(), fetchTrendingSearches()]);
  const candidates = await findCandidates(category, used);
  if (!candidates.length) {
    await sendText(`😴 No fresh news found for "${category}" this week. Try /draft with another topic.`);
    return null;
  }

  const content = await writePost(category, candidates, trending);
  const draft: Draft = {
    id: randomUUID().slice(0, 8),
    category,
    topic: content.topic,
    sourceTitle: content.sourceTitle,
    sourceUrl: content.sourceUrl,
    text: content.post,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await markLinkUsed(draft.sourceUrl);
  draft.telegramMessageId = await sendDraft(draft);
  await saveDraft(draft);
  return draft;
}

// Re-show a draft (for example after you edit it) with fresh buttons.
export async function resendDraft(draft: Draft) {
  if (draft.telegramMessageId) await removeButtons(draft.telegramMessageId);
  draft.telegramMessageId = await sendDraft(draft);
  await saveDraft(draft);
}

export async function approveAndPublish(id: string) {
  const draft = await getDraft(id);
  if (!draft) return sendText("This draft has expired. Send /draft for a new one.");
  if (draft.status !== "pending") return sendText(`This draft is already ${draft.status}.`);
  if (!(await lockDraft(id))) return; // a post for this draft is already in progress

  try {
    const token = await getLinkedInToken();
    if (!token) {
      return sendText(`🔗 Connect LinkedIn first, then tap Post again:\n${linkedInConnectUrl()}`);
    }
    const postUrl = await publishPost(token, draft.text);
    draft.status = "posted";
    draft.postUrl = postUrl;
    await saveDraft(draft);
    if (draft.telegramMessageId) await removeButtons(draft.telegramMessageId);
    await sendText(`✅ Posted on LinkedIn!\n${postUrl}`);
  } catch (err) {
    if (err instanceof LinkedInAuthError) {
      return sendText(`🔗 Your LinkedIn login expired. Reconnect, then tap Post again:\n${linkedInConnectUrl()}`);
    }
    throw err;
  } finally {
    await unlockDraft(id);
  }
}

export async function skipDraft(id: string) {
  const draft = await getDraft(id);
  if (!draft || draft.status !== "pending") return;
  draft.status = "skipped";
  await saveDraft(draft);
  if (draft.telegramMessageId) await removeButtons(draft.telegramMessageId);
}

// LinkedIn logins last about 60 days. Warn a week before.
export async function linkedInStatus(): Promise<{ text: string; needsReconnect: boolean }> {
  const token = await getLinkedInToken();
  if (!token) return { text: "LinkedIn: not connected.", needsReconnect: true };
  const daysLeft = Math.floor((token.expiresAt - Date.now()) / 86_400_000);
  if (daysLeft <= 0) return { text: "LinkedIn: login expired.", needsReconnect: true };
  return {
    text: `LinkedIn: connected${token.name ? ` as ${token.name}` : ""}, ${daysLeft} days left before you need to log in again.`,
    needsReconnect: daysLeft <= RECONNECT_WARNING_DAYS,
  };
}
