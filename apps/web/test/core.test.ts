import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, categoriesOverlap, counterTerms, exclusivityConflict, paymentDue, rateFlag, recentAverage } from "../lib/core/rules";
import { dealToAirtableFields, parseDate, parseMoney, rowToDeal } from "../lib/core/mapping";
import { planOffer, planOverdue, type Extraction } from "../lib/core/plan";

const deals = [
  { brand: "Nike", category: "footwear", fee: 16000, status: "active", exclusivity_category: "athletic footwear", exclusivity_until: "2027-04-30" },
  { brand: "Peloton", category: "fitness", fee: 14000, status: "paid" },
  { brand: "Aesop", category: "skincare", fee: 15000, status: "paid" },
];
const base: Extraction = {
  kind: "brand_offer", brand: "Adidas", contactName: "Sam", contactEmail: "sam@adidas.com", category: "footwear", fee: 9300, currency: "USD",
  deliverables: "2 reels", usageRights: "6 months", usageMonths: 6, exclusivity: null, exclusivityCategory: null, exclusivityUntil: null,
  contentDue: null, postStart: "2027-03-10", postEnd: "2027-03-24", paymentTerms: "Net 45", paymentNetDays: 45, summary: "", terms: [],
};
const opts = { threadId: "t1", subject: "Partnership", deals, today: "2027-02-01", sot: "airtable" as const, acceptBody: "Yes!", counterBody: () => "Counter", hasAttachment: false };

test("dates", () => {
  assert.equal(addDays("2027-03-24", 45), "2027-05-08");
  assert.equal(paymentDue("2027-03-24", 45), "2027-05-08");
  assert.equal(paymentDue(null, 45), null);
});
test("recent average needs two deals and ignores declined", () => {
  assert.equal(recentAverage([deals[0]]), null);
  assert.equal(recentAverage([...deals, { brand: "X", fee: 1, status: "declined" }])?.n, 3);
});
test("rate flag", () => {
  assert.equal(rateFlag(9300, deals)?.pctBelow, 38);
  assert.equal(rateFlag(14000, deals), null);
  assert.equal(rateFlag(null, deals), null);
});
test("category overlap", () => {
  assert.ok(categoriesOverlap("footwear", "athletic footwear"));
  assert.ok(!categoriesOverlap("skincare", "athletic footwear"));
  assert.ok(!categoriesOverlap(null, "footwear"));
});
test("exclusivity conflict by date and category, not by same brand", () => {
  const c = exclusivityConflict({ brand: "Adidas", category: "footwear", postStart: "2027-03-10" }, deals, "2027-02-01");
  assert.equal(c?.brand, "Nike");
  assert.equal(exclusivityConflict({ brand: "Adidas", category: "footwear", postStart: "2027-05-10" }, deals, "2027-02-01"), null);
  assert.equal(exclusivityConflict({ brand: "Nike", category: "footwear", postStart: "2027-03-10" }, deals, "2027-02-01"), null);
});
test("counter pushes dates past the window and lifts fee above average", () => {
  const c = counterTerms(base, 15000, "2027-04-30");
  assert.equal(c.fee, 16500);
  assert.equal(c.postStart, "2027-05-04");
  assert.equal(c.postEnd, "2027-05-18");
});
test("flagged offer plan: one attention notification with both flags and a draft, never a send", () => {
  const p = planOffer({ x: base, ...opts });
  assert.equal(p.category, "attention");
  assert.equal(p.urgency, "urgent");
  assert.equal(p.flags.length, 2);
  assert.ok(p.title.includes("38%"));
  assert.ok(p.actions.every((a) => a.kind !== "gmail.send"));
  assert.ok(p.actions.some((a) => a.kind === "gmail.draft"));
  assert.equal(p.changes[0].kind, "old");
  assert.equal(p.changes[1].kind, "new");
});
test("clean offer plan: calendar, row, draft; steps end with todos", () => {
  const x = { ...base, brand: "Halcyon", category: "skincare", fee: 15000, contentDue: "2027-03-03" };
  const p = planOffer({ x, ...opts });
  assert.equal(p.category, "opportunity");
  const kinds = p.actions.map((a) => a.kind);
  assert.deepEqual(kinds, ["deal.upsert", "calendar.event", "source.append", "gmail.draft"]);
  assert.equal(p.actions.filter((a) => !a.hidden).length, 3);
  assert.equal(p.steps.at(-1)?.state, "todo");
  assert.match(p.changes[0].text, /^Calendar:/);
});
test("overdue plan sends only with a contact email", () => {
  const d = { id: "1", brand: "Tern", fee: 3200, currency: "USD", payment_due: "2027-01-18", usage_rights_end: null, contact_email: "a@tern.com", thread_id: null };
  const p = planOverdue(d, "2027-02-01", "airtable", "hi");
  assert.equal(p.actions[0].kind, "gmail.send");
  assert.match(p.body, /14 days late/);
  assert.equal(planOverdue({ ...d, contact_email: null }, "2027-02-01", "airtable", "hi").actions.length, 0);
});
test("row mapping handles messy headers and dates", () => {
  assert.equal(parseMoney("$14,000"), 14000);
  assert.equal(parseDate("3/10/2027"), "2027-03-10");
  assert.equal(parseDate("Mar 10 2027"), "2027-03-10");
  const d = rowToDeal({ Brand: "Tern Audio", "Fee ($)": "$3,200", "Payment due": "1/18/2027", Status: "Active", "Exclusivity until": "2027-06-01" });
  assert.equal(d?.brand, "Tern Audio");
  assert.equal(d?.fee, 3200);
  assert.equal(d?.payment_due, "2027-01-18");
  assert.equal(d?.exclusivity_until, "2027-06-01");
  assert.equal(rowToDeal({ Note: "x" }), null);
  assert.equal(rowToDeal({ Brand: "X", "Date paid": "2/1/2027" })?.status, "paid");
});
test("airtable fields use the table's own names", () => {
  const f = dealToAirtableFields(["Brand", "Rate", "Payment Due", "Status"], { brand: "A", fee: 5, payment_due: "2027-01-01", status: "active", deliverables: "x" });
  assert.deepEqual(f, { Brand: "A", Rate: 5, "Payment Due": "2027-01-01", Status: "Active" });
});

import { verifyQuote, parseFrom } from "../lib/core/quotes";
import { applyEdits, resultTag, runActions } from "../lib/core/runner";
import type { PlannedAction } from "@fluent/shared";

test("quotes must really appear in the email", () => {
  const text = "We can offer a flat fee of $14,000, usage included.\nNet 45 from the final post.";
  assert.equal(verifyQuote(text, "“a flat fee of $14,000, usage included”"), "“a flat fee of $14,000, usage included”");
  assert.equal(verifyQuote(text, "a flat fee of $20,000"), undefined);
  assert.equal(verifyQuote(text, "net  45 from the final post"), "net  45 from the final post");
  assert.equal(verifyQuote(text, null), undefined);
});
test("parseFrom", () => {
  assert.deepEqual(parseFrom('Dana Whitfield <dana@nb.com>'), { name: "Dana Whitfield", email: "dana@nb.com" });
  assert.deepEqual(parseFrom("dana@nb.com"), { name: null, email: "dana@nb.com" });
});

const mk = (id: string, kind: PlannedAction["kind"], extra: Partial<PlannedAction> = {}): PlannedAction => ({ id, kind, summary: id, params: {}, status: "planned", ...extra });

test("runner runs in order, records progress, and tags results", async () => {
  const seen: string[] = [];
  const updates: number[] = [];
  const r = await runActions([mk("d", "deal.upsert", { hidden: true }), mk("c", "calendar.event", { params: { events: [1, 2, 3] } }), mk("g", "gmail.draft")], async (a) => { seen.push(a.id); return { label: a.id }; }, async (_a, steps) => { updates.push(steps.length); });
  assert.deepEqual(seen, ["d", "c", "g"]);
  assert.equal(r.ok, true);
  assert.equal(resultTag(r.actions), "Calendar · Gmail draft");
  assert.equal(r.steps.at(-1)?.state, "done");
  assert.equal(r.steps.length, 3); // approval + 2 visible actions; hidden has no step
});
test("runner stops at first failure and a retry skips what already ran", async () => {
  const sent: string[] = [];
  let fail = true;
  const acts = [mk("c", "calendar.event"), mk("s", "gmail.send")];
  const exec = async (a: PlannedAction) => { if (a.id === "s" && fail) throw new Error("boom"); sent.push(a.id); return {}; };
  const r1 = await runActions(acts, exec, async () => {});
  assert.equal(r1.ok, false);
  assert.equal(r1.error, "boom");
  assert.equal(r1.actions[0].status, "done");
  assert.equal(r1.actions[1].status, "failed");
  fail = false;
  const r2 = await runActions(r1.actions, exec, async () => {});
  assert.equal(r2.ok, true);
  assert.deepEqual(sent, ["c", "s"]); // calendar not repeated
});
test("edits are limited to email fields", () => {
  const a = [mk("g", "gmail.draft", { params: { to: "a@b.com", subject: "s", body: "old" } }), mk("c", "calendar.event", { params: { events: [] } })];
  const out = applyEdits(a, { g: { body: "new", threadId: "evil" }, c: { events: "x" } });
  assert.equal(out[0].params.body, "new");
  assert.equal(out[0].params.threadId, undefined);
  assert.deepEqual(out[1].params.events, []);
});
