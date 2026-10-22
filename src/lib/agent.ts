import { randomUUID } from "node:crypto";
import { env } from "./config";
import { renderImage } from "./image";
import { LinkedInAuthError, publishPost } from "./linkedin";
import { fetchTrendingSearches, findCandidates } from "./sources";
import {
  getDraft,
  getLastPendingDraft,
  getLinkedInToken,
  getUsedLinks,
  lockDraft,
  markLinkUsed,
  saveDraft,
  unlockDraft,
  type Draft,
} from "./store";
import { deleteMessage, downloadFile, removeButtons, sendDraft, sendPhoto, sendText } from "./telegram";
import { categoryForToday, type CategoryId } from "./topics";
import { nextImageKind } from "./visual";
import { writeFromIdea, writePost } from "./writer";

const RECONNECT_WARNING_DAYS = 7;

export function linkedInConnectUrl() {
  return `${env.appUrl}/api/linkedin/auth?key=${encodeURIComponent(env.adminSecret)}`;
}

// The PNG/JPEG bytes for the draft's image, or null for a text-only post.
async function imageBytes(draft: Draft): Promise<ArrayBuffer | null> {
  if (draft.image === "photo" && draft.photoFileId) return downloadFile(draft.photoFileId);
  if ((draft.image === "card" || draft.image === "flowchart") && draft.visual) {
    return renderImage(draft.image, draft.visual);
  }
  return null;
}

// Send (or re-send) a draft to Telegram: image first, then the text with buttons.
async function showDraft(draft: Draft) {
  if (draft.imageMessageId) await deleteMessage(draft.imageMessageId);
  if (draft.telegramMessageId) await removeButtons(draft.telegramMessageId);
  draft.imageMessageId = undefined;

  try {
    const photo = draft.image === "photo" ? draft.photoFileId : await imageBytes(draft);
    if (photo) draft.imageMessageId = await sendPhoto(photo, "🖼 Image for the draft below");
  } catch (err) {
    // A broken image should never block the post itself.
    console.error("Image failed:", err);
    draft.image = "none";
  }
  draft.telegramMessageId = await sendDraft(draft);
  await saveDraft(draft);
}

function newDraft(fields: Omit<Draft, "id" | "status" | "createdAt">): Draft {
  return { id: randomUUID().slice(0, 8), status: "pending", createdAt: new Date().toISOString(), ...fields };
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
  const draft = newDraft({
    category,
    topic: content.topic,
    sourceTitle: content.sourceTitle,
    sourceUrl: content.sourceUrl,
    text: content.post,
    visual: content.visual,
    image: content.visual.suggested,
  });
  await markLinkUsed(draft.sourceUrl);
  await showDraft(draft);
  return draft;
}

// Turn your own short idea into a post. Attach your photo if you sent one.
export async function createDraftFromIdea(idea: string, photoFileId?: string): Promise<Draft> {
  const { post, visual } = await writeFromIdea(idea);
  const draft = newDraft({
    category: "idea",
    idea,
    topic: idea.slice(0, 80),
    sourceTitle: "",
    sourceUrl: "",
    text: post,
    visual,
    image: photoFileId ? "photo" : visual.suggested,
    photoFileId,
  });
  await showDraft(draft);
  return draft;
}

// Re-show a draft (for example after you edit it) with fresh buttons.
export async function resendDraft(draft: Draft) {
  await showDraft(draft);
}

// 🖼 button: card -> flowchart -> no image -> card ...
export async function changeImage(id: string) {
  const draft = await getDraft(id);
  if (!draft || draft.status !== "pending") return;
  draft.image = nextImageKind(draft.image ?? "none", draft.visual);
  if (draft.image === "none" && !draft.visual) {
    return sendText("This draft was made before images existed. Send /draft for a new one with an image.");
  }
  await showDraft(draft);
}

export async function removeImage(id: string) {
  const draft = await getDraft(id);
  if (!draft || draft.status !== "pending") return;
  draft.image = "none";
  await showDraft(draft);
}

// A photo you send: with a caption it becomes a new post, without one it
// replaces the image of your latest draft.
export async function handlePhoto(fileId: string, caption: string) {
  if (caption.length >= 15) {
    await sendText("✍️ Writing a post from your idea and photo…");
    return createDraftFromIdea(caption.slice(0, 1500), fileId);
  }
  const draft = await getLastPendingDraft();
  if (!draft) {
    return sendText("📷 Got your photo! Send it again with a caption (your idea), and I'll write a post around it.");
  }
  draft.image = "photo";
  draft.photoFileId = fileId;
  await showDraft(draft);
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
    const bytes = await imageBytes(draft);
    const image = bytes ? { bytes, altText: draft.visual?.title ?? draft.topic } : undefined;
    const postUrl = await publishPost(token, draft.text, image);
    draft.status = "posted";
    draft.postUrl = postUrl;
    await saveDraft(draft);
    if (draft.telegramMessageId) await removeButtons(draft.telegramMessageId);
    await sendText(`✅ Posted on LinkedIn${image ? " with the image" : ""}!\n${postUrl}`);
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
