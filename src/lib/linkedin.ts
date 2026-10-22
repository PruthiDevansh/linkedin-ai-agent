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
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`token exchange failed (HTTP ${res.status}): ${data.error ?? ""} ${data.error_description ?? ""}`.trim());
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

function apiHeaders(token: LinkedInToken) {
  return {
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": apiVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Images API: ask for an upload slot, upload the bytes, wait until LinkedIn
// has processed it. Returns the image URN to attach to the post.
async function uploadImage(token: LinkedInToken, bytes: ArrayBuffer): Promise<string> {
  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: token.personUrn } }),
  });
  if (init.status === 401) throw new LinkedInAuthError("LinkedIn login expired.");
  if (!init.ok) throw new Error(`LinkedIn image upload failed to start (HTTP ${init.status}): ${(await init.text()).slice(0, 300)}`);
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };

  const put = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`LinkedIn image upload failed (HTTP ${put.status}).`);

  // Processing usually takes a second or two.
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`https://api.linkedin.com/rest/images/${encodeURIComponent(value.image)}`, {
      headers: apiHeaders(token),
    });
    if (res.ok) {
      const { status } = (await res.json()) as { status?: string };
      if (status === "AVAILABLE") break;
      if (status === "PROCESSING_FAILED") throw new Error("LinkedIn could not process the image.");
    }
    await sleep(1_000);
  }
  return value.image;
}

export async function publishPost(
  token: LinkedInToken,
  text: string,
  image?: { bytes: ArrayBuffer; altText: string },
): Promise<string> {
  const imageUrn = image ? await uploadImage(token, image.bytes) : undefined;
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify({
      author: token.personUrn,
      commentary: toLittleText(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(imageUrn ? { content: { media: { id: imageUrn, altText: image!.altText.slice(0, 300) } } } : {}),
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
