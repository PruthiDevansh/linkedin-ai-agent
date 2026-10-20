import {
  approveAndPublish,
  createAndSendDraft,
  linkedInConnectUrl,
  linkedInStatus,
  resendDraft,
  skipDraft,
} from "../../../../src/lib/agent";
import { env, secretMatches } from "../../../../src/lib/config";
import { getDraft, getPendingEdit, setPendingEdit } from "../../../../src/lib/store";
import { answerCallback, askForEditedText, sendText, type TelegramUpdate } from "../../../../src/lib/telegram";
import { CATEGORIES, CATEGORY_IDS, isCategoryId } from "../../../../src/lib/topics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP = [
  "🤖 I find trending news every morning, write a LinkedIn post, and send it here.",
  "Nothing is posted until you tap ✅ Post.",
  "",
  "/draft — make a draft now (today's topic)",
  "/draft fintech — make a draft on a topic",
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
    if (update.callback_query) await handleButton(update.callback_query.id, update.callback_query.data ?? "");
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
  };
  await answerCallback(callbackId, labels[action]);

  if (action === "post") return approveAndPublish(id);
  if (action === "skip") return skipDraft(id);
  if (action === "edit") {
    await setPendingEdit(id);
    return askForEditedText();
  }
  if (action === "regen") {
    const old = await getDraft(id);
    await skipDraft(id);
    return createAndSendDraft(old?.category);
  }
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

  // Any other text is your edited post, if you tapped ✏️ Edit.
  const editId = await getPendingEdit();
  if (!editId) return sendText(HELP);
  const draft = await getDraft(editId);
  await setPendingEdit(null);
  if (!draft || draft.status !== "pending") return sendText("That draft is no longer pending.");
  draft.text = text.slice(0, 2800);
  await resendDraft(draft);
}
