import { exchangeCode } from "../../../../src/lib/linkedin";
import { consumeOAuthState, saveLinkedInToken } from "../../../../src/lib/store";
import { sendText } from "../../../../src/lib/telegram";

export const dynamic = "force-dynamic";

function page(message: string, status = 200) {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>LinkedIn AI Agent</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><p>${message}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");

  if (params.get("error")) return page("LinkedIn login was cancelled. You can close this tab.", 400);
  if (!code || !state || !(await consumeOAuthState(state))) {
    return page("This login link is invalid or expired. Start again from Telegram with /status.", 400);
  }

  try {
    const token = await exchangeCode(code);
    await saveLinkedInToken(token);
    const days = Math.floor((token.expiresAt - Date.now()) / 86_400_000);
    await sendText(`🔗 LinkedIn connected${token.name ? ` as ${token.name}` : ""}. Valid for ${days} days.`).catch(() => {});
    return page("✅ LinkedIn connected. You can close this tab and go back to Telegram.");
  } catch (err) {
    console.error("LinkedIn callback failed:", err);
    // LinkedIn's error text never contains secrets, and it's what you need to fix the setup.
    const reason = (err instanceof Error ? err.message : String(err)).replace(/[<>&]/g, "");
    return page(`LinkedIn login failed: ${reason}<br><br>Check the app settings in SETUP.md and try again.`, 500);
  }
}
