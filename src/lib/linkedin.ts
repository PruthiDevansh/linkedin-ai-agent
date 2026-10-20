import { env } from "./config";
import type { LinkedInToken } from "./store";

const SCOPES = ["openid", "profile", "w_member_social"];

export function redirectUri() {
  return `${env.appUrl}/api/linkedin/callback`;
}

export function authorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.linkedinClientId,
    redirect_uri: redirectUri(),
    state,
    scope: SCOPES.join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export async function exchangeCode(code: string): Promise<LinkedInToken> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: env.linkedinClientId,
      client_secret: env.linkedinClientSecret,
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`LinkedIn login failed: ${data.error_description ?? res.status}`);
  }

  const me = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = (await me.json()) as { sub?: string; name?: string };
  if (!me.ok || !profile.sub) throw new Error(`Could not read LinkedIn profile (HTTP ${me.status}).`);

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 60 * 24 * 60 * 60) * 1000,
    personUrn: `urn:li:person:${profile.sub}`,
    name: profile.name,
  };
}

// LinkedIn API versions (YYYYMM) retire after about a year, so default to
// two months ago: always recent, always already released.
function apiVersion(): string {
  if (process.env.LINKEDIN_VERSION) return process.env.LINKEDIN_VERSION;
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// LinkedIn post text uses "little text" format: these characters must be
// escaped or the post gets cut off. Hashtags need a special template.
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
const HASHTAG = /^#[\p{L}\p{N}]+$/u;

export function toLittleText(text: string): string {
  return text
    .split(/(#[\p{L}\p{N}]+)/u)
    .map((part) =>
      HASHTAG.test(part) ? `{hashtag|\\#|${part.slice(1)}}` : part.replace(RESERVED, (c) => `\\${c}`),
    )
    .join("");
}

export class LinkedInAuthError extends Error {}

export async function publishPost(token: LinkedInToken, text: string): Promise<string> {
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": apiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: token.personUrn,
      commentary: toLittleText(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (res.status === 401) throw new LinkedInAuthError("LinkedIn login expired.");
  if (!res.ok) {
    throw new Error(`LinkedIn post failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const urn = res.headers.get("x-restli-id");
  return urn ? `https://www.linkedin.com/feed/update/${urn}/` : "https://www.linkedin.com/in/me/recent-activity/all/";
}
