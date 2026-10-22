import {
  approveAndPublish,
  changeImage,
  createAndSendDraft,
  createDraftFromIdea,
  handlePhoto,
  removeImage,
  linkedInConnectUrl,
  linkedInStatus,
  resendDraft,
  skipDraft,
} from "../../../../src/lib/agent";
import { env, secretMatches } from "../../../../src/lib/config";
import {
  getDraft,
  getPendingEdit,
  isAwaitingIdea,
  setAwaitingIdea,
  setPendingEdit,
} from "../../../../src/lib/store";
import {
  answerCallback,
  askForEditedText,
  askForIdea,
  sendText,
  type TelegramUpdate,
} from "../../../../src/lib/telegram";
import { CATEGORIES, CATEGORY_IDS, isCategoryId } from "../../../../src/lib/topics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP = [
  "🤖 I find trending news every morning, write a LinkedIn post, and send it here.",
  "Nothing is posted until you tap ✅ Post.",
  "",
  "/draft — make a draft now (today's topic)",
  "/draft fintech — make a draft on a topic",
  "/write your idea — turn your own idea into a post",
  "Or just send me any idea as a message 💡",
  "📷 Send a photo with a caption to post about it, or a photo alone to use it on your latest draft",
  "🖼 Drafts come with a card or flowchart image; use the buttons to change or remove it",
  "/topics — list topics",
  "/status — LinkedIn connection",
].join("\n");

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), env.telegramWebhookSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  // Before setup is finished, tell the person their chat id and nothing else.
  if (!env.telegramChatId) {
    if (chatId) await sendText(`Your chat id is ${chatId}. Put it in TELEGRAM_CHAT_ID (see SETUP.md).`, chatId);
    return Response.json({ ok: true });
  }
  // Only you can control the bot.
  if (String(chatId) !== env.telegramChatId) return Response.json({ ok: true });

  try {
    const photo = update.message?.photo?.at(-1); // largest size
    if (update.callback_query) await handleButton(update.callback_query.id, update.callback_query.data ?? "");
    else if (photo) await handlePhoto(photo.file_id, update.message?.caption?.trim() ?? "");
    else if (update.message?.text) await handleText(update.message.text.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", message);
    await sendText(`⚠️ Something went wrong: ${message}`).catch(() => {});
  }
  // Always 200, so Telegram doesn't resend the same update again and again.
  return Response.json({ ok: true });
}

async function handleButton(callbackId: string, data: string) {
  const [action, id] = data.split(":");
  const labels: Record<string, string> = {
    post: "Posting…",
    edit: "Waiting for your text",
    regen: "Writing a new draft…",
    skip: "Skipped",
    idea: "Waiting for your idea",
    img: "Changing image…",
    noimg: "Image removed",
  };
  await answerCallback(callbackId, labels[action]);

  if (action === "post") return approveAndPublish(id);
  if (action === "img") return changeImage(id);
  if (action === "noimg") return removeImage(id);
  if (action === "skip") return skipDraft(id);
  if (action === "edit") {
    await setAwaitingIdea(false);
    await setPendingEdit(id);
    return askForEditedText();
  }
  if (action === "idea") {
    await setPendingEdit(null);
    await setAwaitingIdea(true);
    return askForIdea();
  }
  if (action === "regen") {
    const old = await getDraft(id);
    await skipDraft(id);
    if (old?.category === "idea" && old.idea) return createDraftFromIdea(old.idea);
    return createAndSendDraft(old && old.category !== "idea" ? old.category : undefined);
  }
}

async function writeIdea(idea: string) {
  await setAwaitingIdea(false);
  await sendText("✍️ Writing a post from your idea…");
  return createDraftFromIdea(idea.slice(0, 1500));
}

async function handleText(text: string) {
  const [command, arg] = text.split(/\s+/, 2);

  if (command === "/start" || command === "/help") return sendText(HELP);
  if (command === "/topics") {
    return sendText(CATEGORY_IDS.map((id) => `${id} — ${CATEGORIES[id].label}`).join("\n"));
  }
  if (command === "/status") {
    const status = await linkedInStatus();
    return sendText(status.needsReconnect ? `${status.text}\nConnect: ${linkedInConnectUrl()}` : status.text);
  }
  if (command === "/draft") {
    if (arg && !isCategoryId(arg)) return sendText(`Unknown topic "${arg}". Send /topics to see the list.`);
    await sendText("🔎 Finding today's trending news…");
    return createAndSendDraft(arg && isCategoryId(arg) ? arg : undefined);
  }

  if (command === "/write") {
    const idea = text.slice(command.length).trim();
    if (idea) return writeIdea(idea);
    await setPendingEdit(null);
    await setAwaitingIdea(true);
    return askForIdea();
  }
  if (command.startsWith("/")) return sendText(HELP);

  // Any other text is your edited post if you tapped ✏️ Edit, otherwise an idea.
  const editId = await getPendingEdit();
  if (!editId) {
    if (!(await isAwaitingIdea()) && text.length < 15) return sendText(HELP);
    return writeIdea(text);
  }
  const draft = await getDraft(editId);
  await setPendingEdit(null);
  if (!draft || draft.status !== "pending") return sendText("That draft is no longer pending.");
  draft.text = text.slice(0, 2800);
  await resendDraft(draft);
}
