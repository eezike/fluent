// Maps free-form spreadsheet headers / Airtable field names to Fluent's deal fields, and back.
import { isIsoDate } from "./rules";

export type DealFields = {
  brand: string;
  fee: number | null;
  currency: string;
  category: string | null;
  deliverables: string | null;
  usage_rights: string | null;
  usage_rights_end: string | null;
  exclusivity_category: string | null;
  exclusivity_until: string | null;
  post_start: string | null;
  post_end: string | null;
  payment_terms: string | null;
  payment_due: string | null;
  paid_at: string | null;
  status: "offer" | "active" | "paid" | "declined";
};

const MATCHERS: [keyof DealFields | "paid_flag", RegExp][] = [
  ["brand", /^(brand|company|client|partner|deal|name)\b/i],
  ["fee", /(fee|rate|amount|value|price|compensation|payout)/i],
  ["deliverables", /deliverable|scope|content/i],
  ["usage_rights_end", /usage.*(end|expir|until|through)|rights.*(end|expir|until)/i],
  ["usage_rights", /usage|rights/i],
  ["exclusivity_until", /exclusiv.*(end|until|through|expir|date)/i],
  ["exclusivity_category", /exclusiv|category/i],
  ["post_start", /(post|live|go.?live|publish).*(start|date|from)|start.*date|posting/i],
  ["post_end", /(post|live|publish).*(end|until|to)|end.*date/i],
  ["payment_due", /(payment|invoice|pay).*(due|date|expected)|due.*date|due/i],
  ["paid_at", /(paid|received).*(on|date|at)?$|date.*paid/i],
  ["payment_terms", /terms|net\b/i],
  ["status", /status|stage/i],
];

export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Accepts ISO dates and the common US formats (3/10/2026, Mar 10 2026). */
export function parseDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim();
  if (isIsoDate(t.slice(0, 10))) return t.slice(0, 10);
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const ms = Date.parse(`${t} UTC`);
  if (!Number.isNaN(ms) && /[a-z]{3}/i.test(t) && /\d{4}/.test(t)) return new Date(ms).toISOString().slice(0, 10);
  return null;
}

export function normalizeStatus(v: unknown): DealFields["status"] {
  const s = String(v ?? "").toLowerCase();
  if (/paid|complete|closed/.test(s)) return "paid";
  if (/declin|reject|pass|cancel|lost/.test(s)) return "declined";
  if (/offer|pitch|negotiat|prospect|new|inbound/.test(s)) return "offer";
  return "active";
}

export function pickKey(keys: string[], field: keyof DealFields): string | undefined {
  const used = new Set<string>();
  for (const [f, re] of MATCHERS) {
    const hit = keys.find((k) => !used.has(k) && re.test(k));
    if (hit) {
      used.add(hit);
      if (f === field) return hit;
    }
  }
  return undefined;
}

/** Turns one row (header -> cell) into deal fields. Returns null when it has no brand. */
export function rowToDeal(row: Record<string, unknown>): DealFields | null {
  const keys = Object.keys(row);
  const get = (f: keyof DealFields) => {
    const k = pickKey(keys, f);
    return k === undefined ? undefined : row[k];
  };
  const brand = String(get("brand") ?? "").trim();
  if (!brand) return null;
  const str = (f: keyof DealFields) => {
    const v = get(f);
    return v === undefined || v === "" ? null : String(Array.isArray(v) ? v.join(", ") : v);
  };
  const paid = parseDate(get("paid_at"));
  const status = get("status") !== undefined ? normalizeStatus(get("status")) : paid ? "paid" : "active";
  return {
    brand,
    fee: parseMoney(get("fee")),
    currency: "USD",
    category: str("exclusivity_category"),
    deliverables: str("deliverables"),
    usage_rights: str("usage_rights"),
    usage_rights_end: parseDate(get("usage_rights_end")),
    exclusivity_category: str("exclusivity_category"),
    exclusivity_until: parseDate(get("exclusivity_until")),
    post_start: parseDate(get("post_start")),
    post_end: parseDate(get("post_end")),
    payment_terms: str("payment_terms"),
    payment_due: parseDate(get("payment_due")),
    paid_at: paid,
    status: paid ? "paid" : status,
  };
}

/** Builds an Airtable fields object using the table's own field names (never invented ones). */
export function dealToAirtableFields(fieldNames: string[], d: Partial<DealFields>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (f: keyof DealFields, value: unknown) => {
    const k = pickKey(fieldNames, f);
    if (k && value !== null && value !== undefined && value !== "") out[k] = value;
  };
  set("brand", d.brand);
  set("fee", d.fee);
  set("deliverables", d.deliverables);
  set("usage_rights", d.usage_rights);
  set("exclusivity_until", d.exclusivity_until);
  set("post_start", d.post_start);
  set("post_end", d.post_end);
  set("payment_terms", d.payment_terms);
  set("payment_due", d.payment_due);
  set("status", d.status === "active" ? "Active" : d.status);
  return out;
}

/** One sheet row in a fixed column order, for the "Deals" tab. */
export const SHEET_COLUMNS = ["Brand", "Fee", "Deliverables", "Usage rights", "Post start", "Post end", "Payment terms", "Payment due", "Status"] as const;
export function dealToSheetRow(d: Partial<DealFields>): (string | number)[] {
  return [d.brand ?? "", d.fee ?? "", d.deliverables ?? "", d.usage_rights ?? "", d.post_start ?? "", d.post_end ?? "", d.payment_terms ?? "", d.payment_due ?? "", d.status === "active" ? "Active" : (d.status ?? "")];
}
