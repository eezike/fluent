import { test } from "node:test";
import assert from "node:assert/strict";
import { readField, runCheck, runChecks } from "../lib/admin/checks";
import { lineDiff } from "../lib/admin/diff";
import { redact } from "../lib/admin/redact";
import { bucket, pickVersion } from "../lib/admin/rollout";
import { costOf } from "../lib/admin/cost";
import { fillPrompt, DEFAULT_PROMPTS } from "../lib/admin/defaults";

const out = { kind: "brand_offer", fee: 14000, brand: "New Balance", postStart: "2027-03-10", terms: [{ quote: "a flat fee of $14,000" }, { quote: "invented words" }], actionKinds: ["gmail.draft"] };

test("readField handles paths and arrays", () => {
  assert.equal(readField(out, "fee"), 14000);
  assert.deepEqual(readField(out, "terms[].quote"), ["a flat fee of $14,000", "invented words"]);
  assert.equal(readField(out, "nope.deeper"), undefined);
});
test("exact and number and date checks", () => {
  assert.ok(runCheck({ field: "kind", type: "exact", expected: "brand_offer" }, out, "").pass);
  assert.ok(!runCheck({ field: "kind", type: "exact", expected: "contract" }, out, "").pass);
  assert.ok(runCheck({ field: "brand", type: "exact_ci", expected: "new balance" }, out, "").pass);
  assert.ok(runCheck({ field: "fee", type: "number", expected: "14000" }, out, "").pass);
  assert.ok(!runCheck({ field: "fee", type: "number", expected: 9300 }, out, "").pass);
  assert.ok(runCheck({ field: "postStart", type: "date", expected: "2027-03-10" }, out, "").pass);
  assert.ok(runCheck({ field: "contentDue", type: "date", expected: null }, out, "").pass);
});
test("a missing value is not a match for a number", () => {
  assert.ok(!runCheck({ field: "usage", type: "number", expected: 6 }, out, "").pass);
  assert.ok(runCheck({ field: "usage", type: "number", expected: null }, out, "").pass);
});
test("contains and not_contains work on arrays", () => {
  assert.ok(runCheck({ field: "actionKinds", type: "contains", expected: "draft" }, out, "").pass);
  assert.ok(runCheck({ field: "actionKinds", type: "not_contains", expected: "gmail.send" }, out, "").pass);
  assert.ok(!runCheck({ field: "actionKinds", type: "not_contains", expected: "gmail.draft" }, out, "").pass);
});
test("verified catches quotes that are not in the input", () => {
  const r = runChecks([{ field: "terms[].quote", type: "verified" }], out, "The brand offers a flat fee of $14,000 for two reels.");
  assert.equal(r[0].pass, false);
  assert.match(r[0].note ?? "", /invented words/);
  assert.ok(runChecks([{ field: "terms[].quote", type: "verified" }], { terms: [{ quote: "a flat fee of $14,000" }] }, "a flat fee of $14,000 for two reels")[0].pass);
});
test("line diff marks added and removed lines", () => {
  const d = lineDiff("a\nb\nc", "a\nB\nc\nd");
  assert.deepEqual(d.map((l) => l.kind), ["same", "del", "add", "same", "add"]);
});
test("redact strips emails, phones, links and names", () => {
  const t = redact("Hi Sam Ortiz, mail sam.ortiz@newbalance.com or call +1 (212) 555-0188. https://x.co/a", ["Sam Ortiz"]);
  assert.ok(!/sam\.ortiz|555|https/.test(t));
  assert.match(t, /\[name\]/);
  assert.match(t, /@newbalance\.com/);
});
test("rollout: admins get the candidate, percent is stable, default when no active", () => {
  const r = { active_version: 2, candidate_version: 3, mode: "admins" as const, percent: 0 };
  assert.equal(pickVersion(r, "u1", true), 3);
  assert.equal(pickVersion(r, "u1", false), 2);
  assert.equal(pickVersion(null, "u1", true), null);
  const p = { ...r, mode: "percent" as const, percent: 10 };
  assert.equal(pickVersion(p, "u1", false), pickVersion(p, "u1", false));
  const n = Array.from({ length: 2000 }, (_, i) => bucket(`user-${i}`)).filter((b) => b < 10).length;
  assert.ok(n > 120 && n < 280, `bucket spread was ${n}/2000`);
  assert.equal(pickVersion({ ...p, percent: 100 }, "anyone", false), 3);
  assert.equal(pickVersion({ ...p, percent: 0 }, "anyone", false), 2);
});
test("cost needs a price and token counts", () => {
  assert.equal(costOf("m", 1_000_000, 500_000, { m: { in: 3, out: 15 } }), 10.5);
  assert.equal(costOf("x", 1, 1, { m: { in: 3, out: 15 } }), null);
  assert.equal(costOf("m", null, 1, { m: { in: 3, out: 15 } }), null);
});
test("fillPrompt fills known placeholders only", () => {
  assert.match(fillPrompt(DEFAULT_PROMPTS.ask_answer, { today: "2027-01-02" }), /Today is 2027-01-02/);
  assert.equal(fillPrompt("hi {{x}}", {}), "hi {{x}}");
});

import { STARTER_SUITES } from "../lib/admin/seed";
import { flattenPlan } from "../lib/admin/evals";
import { planOffer } from "../lib/core/plan";

test("starter plan cases all pass against the real planner", () => {
  const cases = STARTER_SUITES.flatMap((s) => s.cases).filter((c) => c.kind === "plan");
  assert.ok(cases.length >= 5);
  for (const c of cases) {
    const i = c.input as any;
    const out = flattenPlan(planOffer({ x: i.x, deals: i.deals, today: i.today, sot: "airtable", subject: "Partnership", acceptBody: "a", counterBody: () => "c" }));
    const res = runChecks(c.checks, out, "");
    assert.ok(res.every((r) => r.pass), `${c.name}: ${JSON.stringify(res.filter((r) => !r.pass))}`);
  }
});
test("starter suites are well-formed", () => {
  for (const s of STARTER_SUITES) for (const c of s.cases) {
    assert.ok(c.checks.length > 0, c.name);
    if (c.kind === "classify") assert.ok((c.input as any).text && (c.input as any).today, c.name);
  }
});
