import { timingSafeEqual } from "node:crypto";

function required(name: string): string {
  // Trim: pasted keys often carry a stray space or newline.
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}. See SETUP.md.`);
  return value;
}

export const env = {
  get geminiKey() {
    return required("GEMINI_API_KEY");
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  },
  // Lighter model used when the main one is overloaded.
  get geminiFallbackModel() {
    return process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-flash-lite-latest";
  },
  get telegramToken() {
    return required("TELEGRAM_BOT_TOKEN");
  },
  get telegramChatId() {
    return process.env.TELEGRAM_CHAT_ID ?? "";
  },
  get telegramWebhookSecret() {
    return required("TELEGRAM_WEBHOOK_SECRET");
  },
  get linkedinClientId() {
    return required("LINKEDIN_CLIENT_ID");
  },
  get linkedinClientSecret() {
    return required("LINKEDIN_CLIENT_SECRET");
  },
  get adminSecret() {
    return required("ADMIN_SECRET");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get appUrl() {
    const url =
      process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "");
    if (!url) throw new Error("Missing environment variable APP_URL. See SETUP.md.");
    return url.replace(/\/$/, "");
  },
};

// Constant-time compare so secrets can't be guessed by timing.
export function secretMatches(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
