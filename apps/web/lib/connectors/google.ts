import { appUrl, env } from "../env";
import { signState } from "../crypto";
import { getConnection } from "../connections";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export function redirectUri(): string {
  return `${appUrl()}/api/connectors/google/callback`;
}

export function googleAuthUrl(userId: string, returnTo: string): string {
  const state = signState({ uid: userId, exp: Date.now() + 10 * 60_000, returnTo });
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<{ refresh_token?: string; id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description ?? "Google sign-in failed");
  return j;
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function googleAccessToken(userId: string): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const conn = await getConnection(userId, "google");
  if (!conn) throw new Error("Google isn't connected.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: conn.secret,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Google access was revoked. Reconnect Google in Connectors.");
  tokenCache.set(userId, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

export async function gfetch(userId: string, url: string, init: RequestInit = {}): Promise<any> {
  const token = await googleAccessToken(userId);
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error?.message ?? `Google API error (${res.status})`);
  return body;
}
