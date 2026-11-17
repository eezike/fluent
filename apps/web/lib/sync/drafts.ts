import { generateText } from "ai";
import { getModel } from "../agent/models";
import type { Extraction } from "../core/plan";
import { fmtWindow, money, shortDate } from "../core/rules";

const SYSTEM = `You write short emails for a creator, in their voice: warm, direct, professional, no filler, no exclamation overload.
Plain text only. No subject line, no markdown. Do not invent facts or commit to anything not in the facts given. End with just "Best," on its own line.`;

async function write(facts: string, fallback: string): Promise<string> {
  try {
    const { text } = await generateText({ model: getModel(), system: SYSTEM, prompt: facts });
    const t = text.trim();
    return t.length > 20 ? t : fallback;
  } catch {
    return fallback;
  }
}

const hi = (name: string | null) => (name ? `Hi ${name.split(" ")[0]},` : "Hi,");

export function draftAccept(x: Extraction) {
  const brand = x.brand ?? "your team";
  return write(
    `Write a reply to ${x.contactName ?? "the sender"} at ${brand} saying the creator is interested, has read the brief, and will confirm details shortly. Facts: ${x.summary} Fee: ${x.fee ? money(x.fee, x.currency) : "not stated"}. Do not accept or negotiate terms yet.`,
    `${hi(x.contactName)}\n\nThanks for reaching out about ${brand}. I've read through the details and I'm interested. I'll confirm the specifics shortly.\n\nBest,`,
  );
}

export function draftCounter(x: Extraction, c: { fee: number; postStart: string | null; postEnd: string | null }, conflictBrand?: string) {
  const brand = x.brand ?? "your team";
  const dates = c.postStart ? ` and move posting to ${fmtWindow(c.postStart, c.postEnd)}` : "";
  return write(
    `Write a polite counter-offer to ${x.contactName ?? "the sender"} at ${brand}. Offer: ${x.fee ? money(x.fee, x.currency) : "unspecified"} for ${x.deliverables ?? "the deliverables"}. Counter: ${money(c.fee, x.currency)}${dates}.${conflictBrand ? " Reason for the date change: an existing category commitment (do not name the other brand)." : ""} Keep it under 120 words.`,
    `${hi(x.contactName)}\n\nThanks for the offer. To make this work for me, I'd need ${money(c.fee, x.currency)}${dates}. Happy to talk it through if that helps.\n\nBest,`,
  );
}

export function draftFollowUp(brand: string, contactName: string | null, amount: number | null, currency: string, dueIso: string, daysLate: number) {
  return write(
    `Write a friendly but firm payment follow-up to ${contactName ?? "the brand's contact"} at ${brand}. Payment${amount ? " of " + money(amount, currency) : ""} was due ${shortDate(dueIso)} and is ${daysLate} days late. Ask for a payment date. Under 90 words.`,
    `${hi(contactName)}\n\nQuick follow-up on the ${brand} payment${amount ? " of " + money(amount, currency) : ""}, which was due ${shortDate(dueIso)}. Could you let me know when I can expect it?\n\nBest,`,
  );
}

export function draftRenewal(brand: string, contactName: string | null, endIso: string) {
  return write(
    `Write a short note to ${contactName ?? "the brand's contact"} at ${brand}: usage rights for the content end ${shortDate(endIso)}. Ask whether they'd like to renew or extend, and say the content will come down otherwise. Under 80 words.`,
    `${hi(contactName)}\n\nThe usage rights for our ${brand} content end on ${shortDate(endIso)}. Would you like to renew or extend? If not, I'll take the content down after that date.\n\nBest,`,
  );
}
