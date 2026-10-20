import { createAndSendDraft, linkedInConnectUrl, linkedInStatus } from "../../../../src/lib/agent";
import { env, secretMatches } from "../../../../src/lib/config";
import { sendText } from "../../../../src/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls this every morning (see vercel.json) with CRON_SECRET.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secretMatches(auth, env.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const status = await linkedInStatus();
    if (status.needsReconnect) {
      await sendText(`⚠️ ${status.text}\nTap to connect LinkedIn:\n${linkedInConnectUrl()}`);
    }
    const draft = await createAndSendDraft();
    return Response.json({ ok: true, draft: draft?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Daily run failed:", message);
    await sendText(`⚠️ Today's draft failed: ${message}`).catch(() => {});
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
