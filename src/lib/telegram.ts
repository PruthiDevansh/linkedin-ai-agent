import { env } from "./config";
import type { Draft } from "./store";
import { CATEGORIES } from "./topics";

type InlineButton = { text: string; callback_data: string };

export type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: { file_id: string; width: number; height: number }[]; // smallest to largest
  };
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

function draftButtons(draft: Draft): InlineButton[][] {
  const id = draft.id;
  const hasImage = draft.image && draft.image !== "none";
  return [
    [
      { text: "✅ Post to LinkedIn", callback_data: `post:${id}` },
      { text: "✏️ Edit", callback_data: `edit:${id}` },
    ],
    hasImage
      ? [
          { text: "🖼 Change image", callback_data: `img:${id}` },
          { text: "🚫 No image", callback_data: `noimg:${id}` },
        ]
      : [{ text: "🖼 Add image", callback_data: `img:${id}` }],
    [
      { text: "🔄 New draft", callback_data: `regen:${id}` },
      { text: "❌ Skip today", callback_data: `skip:${id}` },
    ],
    [{ text: "💡 Write from my idea", callback_data: `idea:${id}` }],
  ];
}

const IMAGE_LABEL: Record<string, string> = {
  card: "key takeaways card",
  flowchart: "flowchart",
  photo: "your photo",
  none: "none",
};

// Sends the image above the draft. Bytes for drawn images, a file id for your photo.
export async function sendPhoto(photo: ArrayBuffer | string, caption: string): Promise<number> {
  if (typeof photo === "string") {
    return (await call<{ message_id: number }>("sendPhoto", { chat_id: env.telegramChatId, photo, caption })).message_id;
  }
  const form = new FormData();
  form.append("chat_id", env.telegramChatId);
  form.append("caption", caption);
  form.append("photo", new Blob([photo], { type: "image/png" }), "post.png");
  const res = await fetch(`https://api.telegram.org/bot${env.telegramToken}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as { ok: boolean; result: { message_id: number }; description?: string };
  if (!data.ok) throw new Error(`Telegram sendPhoto failed: ${data.description ?? res.status}`);
  return data.result.message_id;
}

export async function deleteMessage(messageId: number) {
  try {
    await call("deleteMessage", { chat_id: env.telegramChatId, message_id: messageId });
  } catch {
    // Already gone or too old (Telegram only allows deleting for 48 hours).
  }
}

// Downloads a photo you sent, so it can be uploaded to LinkedIn.
export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const file = await call<{ file_path: string }>("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${env.telegramToken}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Could not download your photo from Telegram (HTTP ${res.status}).`);
  return res.arrayBuffer();
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
    .concat(
      `🖼 Image: ${IMAGE_LABEL[draft.image ?? "none"]} (send a photo here to use your own)`,
      "━━━━━━━━━━",
    )
    .join("\n");

  const msg = await call<{ message_id: number }>("sendMessage", {
    chat_id: env.telegramChatId,
    text: `${header}\n\n${draft.text}`,
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: draftButtons(draft) },
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
