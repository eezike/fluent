import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { verifyState } from "@/lib/crypto";
import { exchangeCode } from "@/lib/connectors/google";
import { getConnection, saveConnection } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (msg: string) => NextResponse.redirect(`${appUrl()}/?connect_error=${encodeURIComponent(msg)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return fail("Google access was not granted.");
  if (!code || !state) return fail("Missing code from Google.");
  const s = verifyState<{ uid: string; exp: number; returnTo: string }>(state);
  if (!s || s.exp < Date.now()) return fail("That sign-in link expired. Try again.");
  try {
    const tokens = await exchangeCode(code);
    const existing = await getConnection(s.uid, "google");
    const refresh = tokens.refresh_token ?? existing?.secret;
    if (!refresh) return fail("Google didn't return offline access. Remove Fluent from your Google account permissions and retry.");
    let email: string | undefined;
    if (tokens.id_token) {
      try {
        email = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")).email;
      } catch {}
    }
    await saveConnection(s.uid, "google", refresh, { ...(existing?.meta ?? {}), email });
    const back = s.returnTo?.startsWith("/") ? s.returnTo : "/";
    return NextResponse.redirect(`${appUrl()}${back}${back.includes("?") ? "&" : "?"}connected=google`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't connect Google.");
  }
}
