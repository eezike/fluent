import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "../agent/models";
import { resolvePrompt } from "../admin/prompts";
import { logRun, modelId, type RunSource } from "../admin/runlog";
import { isIsoDate } from "../core/rules";
import { verifyQuote } from "../core/quotes";
import type { Extraction } from "../core/plan";

const iso = z.string().nullable().describe("ISO date YYYY-MM-DD, or null if not stated");

const Schema = z.object({
  kind: z.enum(["brand_offer", "contract", "payment_update", "other"]),
  confidence: z.number().min(0).max(1),
  brand: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  category: z.string().nullable().describe("Product category of the brand, such as 'athletic footwear' or 'skincare'"),
  fee: z.number().nullable().describe("Total fee as a plain number, no currency symbol"),
  currency: z.string(),
  deliverables: z.string().nullable(),
  usageRights: z.string().nullable(),
  usageMonths: z.number().nullable(),
  exclusivity: z.string().nullable(),
  exclusivityCategory: z.string().nullable(),
  exclusivityUntil: iso,
  contentDue: iso,
  postStart: iso,
  postEnd: iso,
  paymentTerms: z.string().nullable().describe("For example 'Net 45'"),
  paymentNetDays: z.number().nullable(),
  summary: z.string().describe("One or two plain sentences on what the brand is offering. No hype."),
  terms: z
    .array(z.object({ label: z.string(), value: z.string(), quote: z.string().nullable().describe("Exact words from the email, under 25 words") }))
    .max(8),
});

const cleanDate = (v: string | null) => (v && isIsoDate(v) ? v : null);

export type ClassifyOpts = {
  userId?: string;
  source?: RunSource;
  /** Test a different prompt text without publishing it (evals, reprocess). */
  system?: string;
  promptVersion?: number | null;
  model?: string;
  report?: (r: { costUsd: number | null; runId: string | null }) => void;
};

export async function classifyEmail(input: { from: string; subject: string; text: string; attachments?: string; today: string }, opts: ClassifyOpts = {}): Promise<Extraction & { confidence: number }> {
  const p = opts.system != null ? { text: opts.system, version: opts.promptVersion ?? null } : await resolvePrompt("classify", { userId: opts.userId });
  const model = opts.model ?? modelId();
  const prompt = `Today is ${input.today}.\nFrom: ${input.from}\nSubject: ${input.subject}\n\n<email>\n${input.text.slice(0, 14000)}\n</email>${input.attachments ? `\n\n${input.attachments.slice(0, 30000)}` : ""}`;
  const startedAt = Date.now();
  let object: z.infer<typeof Schema>;
  try {
    const r = await generateObject({ model: getModel(model), schema: Schema, system: p.text, prompt });
    object = r.object;
    const l = await logRun({ userId: opts.userId, kind: "classify", source: opts.source, promptKey: "classify", promptVersion: p.version, model, input: { email: { from: input.from, subject: input.subject, text: input.text.slice(0, 14000), attachments: input.attachments?.slice(0, 30000), today: input.today }, systemOverride: opts.system != null }, output: object, usage: r.usage as never, startedAt });
    opts.report?.({ costUsd: l.costUsd, runId: l.id });
  } catch (e) {
    await logRun({ userId: opts.userId, kind: "classify", source: opts.source, promptKey: "classify", promptVersion: p.version, model, input: { email: { from: input.from, subject: input.subject, text: input.text.slice(0, 14000), attachments: input.attachments?.slice(0, 30000), today: input.today } }, error: e instanceof Error ? e.message : "failed", startedAt });
    throw e;
  }
  let { postStart, postEnd } = { postStart: cleanDate(object.postStart), postEnd: cleanDate(object.postEnd) };
  if (postStart && postEnd && postEnd < postStart) [postStart, postEnd] = [postEnd, postStart];
  return {
    kind: object.kind,
    confidence: object.confidence,
    brand: object.brand?.trim() || null,
    contactName: object.contactName,
    contactEmail: object.contactEmail,
    category: object.category,
    fee: object.fee && object.fee > 0 ? object.fee : null,
    currency: (object.currency || "USD").toUpperCase().slice(0, 3),
    deliverables: object.deliverables,
    usageRights: object.usageRights,
    usageMonths: object.usageMonths,
    exclusivity: object.exclusivity,
    exclusivityCategory: object.exclusivityCategory,
    exclusivityUntil: cleanDate(object.exclusivityUntil),
    contentDue: cleanDate(object.contentDue),
    postStart,
    postEnd,
    paymentTerms: object.paymentTerms,
    paymentNetDays: object.paymentNetDays,
    summary: object.summary,
    terms: object.terms.map((t) => ({ label: t.label, value: t.value, quote: verifyQuote(`${input.text}\n${input.attachments ?? ""}`, t.quote) })),
  };
}
