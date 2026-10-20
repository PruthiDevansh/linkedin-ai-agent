import { env, secretMatches } from "../../../../src/lib/config";
import { registerWebhook } from "../../../../src/lib/telegram";

export const dynamic = "force-dynamic";

// Open /api/telegram/setup?key=ADMIN_SECRET once after deploying.
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!secretMatches(key, env.adminSecret)) return new Response("Unauthorized", { status: 401 });

  const url = await registerWebhook();
  return new Response(`Telegram bot connected to ${url}. Now send /start to your bot.`);
}
