import { createHash } from "node:crypto";
import type { PageSuggestion } from "@fluent/shared";
import { classifyEmail } from "./classify";
import { createOfferNotification, today } from "./offers";
import { admin } from "../supabase-admin";
import { rowToDTO } from "../notifications";
import { HttpError } from "../http";

const HINTS = /\b(partnership|sponsor\w*|collaborat\w*|campaign|brand|offer|rate|deliverables?|usage|exclusiv\w*|reels?|stories|invoice|contract)\b/gi;
type Page = { url: string; title: string; text: string };
const clean = (p: Page) => ({ url: String(p.url ?? "").slice(0, 500), title: String(p.title ?? "").slice(0, 200), text: String(p.text ?? "").slice(0, 16000) });
const pageKey = (url: string) => `page:${createHash("sha1").update(url.split("#")[0] + (url.split("#")[1] ?? "")).digest("hex").slice(0, 16)}`;

/** Cheap check first (keywords), then the model, so ordinary pages never cost anything. */
export async function suggestForPage(raw: Page): Promise<PageSuggestion> {
  const p = clean(raw);
  if (p.text.length < 200 || (p.text.match(HINTS)?.length ?? 0) < 3) return null;
  const x = await classifyEmail({ from: "", subject: p.title, text: p.text, today: today() });
  if ((x.kind !== "brand_offer" && x.kind !== "contract") || x.confidence < 0.6 || !x.brand) return null;
  return { kind: x.kind, brand: x.brand, message: x.kind === "contract" ? `This looks like a contract from ${x.brand}. Process this deal?` : `This email looks like a brand offer from ${x.brand}. Process this deal?` };
}

export async function processPage(userId: string, raw: Page) {
  const p = clean(raw);
  const key = pageKey(p.url);
  const { data: existing } = await admin().from("notifications").select("*").eq("user_id", userId).eq("dedupe_key", key).maybeSingle();
  if (existing) return rowToDTO(existing);
  const x = await classifyEmail({ from: "", subject: p.title, text: p.text, today: today() });
  if (!x.brand || (x.kind !== "brand_offer" && x.kind !== "contract")) throw new HttpError(422, "I couldn't find a brand offer on this page.");
  const n = await createOfferNotification(userId, { key, x, subject: p.title || `${x.brand} partnership`, hasAttachment: false });
  if (!n) throw new HttpError(409, "Already processed.");
  return n;
}
