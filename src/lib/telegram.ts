import { env } from "./config";
import type { Draft } from "./store";
import { CATEGORIES } from "./topics";

type InlineButton = { text: string; callback_data: string };

export type TelegramUpdate = {
  message?: { message_id: number; chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.telegramToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result;
}

export async function sendText(text: string, chatId: string | number = env.telegramChatId) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  });
}

export async function askForEditedText() {
  return call("sendMessage", {
    chat_id: env.telegramChatId,
    text: "✏️ Send me the full new text for this post. I'll show it again before anything is posted.",
    reply_markup: { force_reply: true },
  });
}

function draftButtons(id: string): InlineButton[][] {
  return [
    [
      { text: "✅ Post to LinkedIn", callback_data: `post:${id}` },
      { text: "✏️ Edit", callback_data: `edit:${id}` },
    ],
    [
      { text: "🔄 New draft", callback_data: `regen:${id}` },
      { text: "❌ Skip today", callback_data: `skip:${id}` },
    ],
    [{ text: "💡 Write from my idea", callback_data: `idea:${id}` }],
  ];
}

export async function askForIdea() {
  return call("sendMessage", {
    chat_id: env.telegramChatId,
    text: "💡 Send me your idea in a line or two (an opinion, a lesson, something you built or saw). I'll turn it into a post.",
    reply_markup: { force_reply: true },
  });
}

export async function sendDraft(draft: Draft): Promise<number> {
  const header = (
    draft.category === "idea"
      ? [`📝 Your idea, as a post`, `Idea: ${draft.idea}`]
      : [
          `📝 Today's draft · ${CATEGORIES[draft.category].label}`,
          `Source: ${draft.sourceTitle}`,
          draft.sourceUrl,
          "Check the facts in the source before posting.",
        ]
  )
    .concat("━━━━━━━━━━")
    .join("\n");

  const msg = await call<{ message_id: number }>("sendMessage", {
    chat_id: env.telegramChatId,
    text: `${header}\n\n${draft.text}`,
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: draftButtons(draft.id) },
  });
  return msg.message_id;
}

export async function removeButtons(messageId: number) {
  try {
    await call("editMessageReplyMarkup", {
      chat_id: env.telegramChatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // Message too old or already edited; nothing to do.
  }
}

export async function answerCallback(callbackId: string, text?: string) {
  await call("answerCallbackQuery", { callback_query_id: callbackId, text });
}

export async function registerWebhook() {
  const url = `${env.appUrl}/api/telegram/webhook`;
  await call("setWebhook", {
    url,
    secret_token: env.telegramWebhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await call("setMyCommands", {
    commands: [
      { command: "draft", description: "Make a draft now (optional: topic)" },
      { command: "write", description: "Turn your own idea into a post" },
      { command: "topics", description: "List topics" },
      { command: "status", description: "LinkedIn connection status" },
      { command: "help", description: "How this bot works" },
    ],
  });
  return url;
}
