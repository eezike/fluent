// Exact checks for evals. No model judges anything: each check compares one field with an expected value.
import { verifyQuote } from "../core/quotes";

export type CheckType = "exact" | "exact_ci" | "number" | "date" | "contains" | "not_contains" | "verified";
export type Check = { field: string; type: CheckType; expected?: unknown };
export type CheckResult = Check & { actual: unknown; pass: boolean; note?: string };

export const CHECK_LABELS: Record<CheckType, string> = {
  exact: "Exact",
  exact_ci: "Exact, ignore case",
  number: "Number",
  date: "Date",
  contains: "Contains",
  not_contains: "Does not contain",
  verified: "Verified in input",
};

/** Reads "a.b" or "terms[].quote" (every element). */
export function readField(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown[] = [obj];
  let many = false;
  for (const p of parts) {
    const arr = p.endsWith("[]");
    const key = arr ? p.slice(0, -2) : p;
    const next: unknown[] = [];
    for (const c of cur) {
      const v = c && typeof c === "object" ? (c as Record<string, unknown>)[key] : undefined;
      if (arr) {
        many = true;
        if (Array.isArray(v)) next.push(...v);
      } else next.push(v);
    }
    cur = next;
  }
  return many ? cur : cur[0];
}

const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function runCheck(c: Check, output: unknown, inputText: string): CheckResult {
  const actual = readField(output, c.field);
  const exp = c.expected;
  let pass = false;
  let note: string | undefined;
  switch (c.type) {
    case "exact":
      pass = JSON.stringify(actual ?? null) === JSON.stringify(exp ?? null);
      break;
    case "exact_ci":
      pass = String(actual ?? "").trim().toLowerCase() === String(exp ?? "").trim().toLowerCase() && (actual != null) === (exp != null);
      break;
    case "number":
      pass = actual != null && exp != null && Number(actual) === Number(exp);
      if (actual == null && exp == null) pass = true;
      break;
    case "date":
      pass = isoDay(actual) === isoDay(exp) && (actual == null) === (exp == null);
      break;
    case "contains":
      pass = Array.isArray(actual) ? actual.some((a) => String(a).toLowerCase().includes(String(exp).toLowerCase())) : String(actual ?? "").toLowerCase().includes(String(exp ?? "").toLowerCase());
      break;
    case "not_contains":
      pass = Array.isArray(actual) ? !actual.some((a) => String(a).toLowerCase().includes(String(exp).toLowerCase())) : !String(actual ?? "").toLowerCase().includes(String(exp ?? "").toLowerCase());
      break;
    case "verified": {
      const vals = (Array.isArray(actual) ? actual : [actual]).filter((v) => v != null && String(v).trim() !== "");
      const bad = vals.filter((v) => verifyQuote(inputText, String(v)) == null);
      pass = bad.length === 0;
      if (!pass) note = `Not found in the input: ${bad.map((b) => JSON.stringify(String(b).slice(0, 60))).join(", ")}`;
      break;
    }
  }
  return { ...c, actual: actual ?? null, pass, note };
}

export function runChecks(checks: Check[], output: unknown, inputText: string): CheckResult[] {
  return checks.map((c) => runCheck(c, output, inputText));
}
