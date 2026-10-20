import { randomBytes } from "node:crypto";
import { env, secretMatches } from "../../../../src/lib/config";
import { authorizationUrl } from "../../../../src/lib/linkedin";
import { saveOAuthState } from "../../../../src/lib/store";

export const dynamic = "force-dynamic";

// Starts "Log in with LinkedIn". Protected so only you can connect an account.
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!secretMatches(key, env.adminSecret)) return new Response("Unauthorized", { status: 401 });

  const state = randomBytes(16).toString("hex");
  await saveOAuthState(state);
  return Response.redirect(authorizationUrl(state), 302);
}
