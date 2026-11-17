// Pure business rules. No I/O, so they are easy to test.

export type DealLite = {
  brand: string;
  category?: string | null;
  fee?: number | null;
  status: string;
  exclusivity_category?: string | null;
  exclusivity_until?: string | null;
};

export const RATE_FLAG_THRESHOLD = 0.85; // flag offers more than 15% below the recent average

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function money(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Average fee of the user's recent paid or active deals. Needs at least two to be meaningful. */
export function recentAverage(deals: DealLite[], limit = 6): { avg: number; n: number } | null {
  const fees = deals
    .filter((d) => (d.status === "active" || d.status === "paid") && typeof d.fee === "number" && d.fee! > 0)
    .slice(0, limit)
    .map((d) => d.fee as number);
  if (fees.length < 2) return null;
  return { avg: fees.reduce((a, b) => a + b, 0) / fees.length, n: fees.length };
}

export function rateFlag(fee: number | null | undefined, deals: DealLite[]) {
  if (typeof fee !== "number" || fee <= 0) return null;
  const r = recentAverage(deals);
  if (!r || fee >= r.avg * RATE_FLAG_THRESHOLD) return null;
  return { avg: Math.round(r.avg), n: r.n, pctBelow: Math.round((1 - fee / r.avg) * 100) };
}

const stem = (w: string) => w.replace(/(ing|es|s)$/, "");
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3)
      .map(stem),
  );
}

/** "footwear" overlaps "athletic footwear"; "skincare" does not overlap "footwear". */
export function categoriesOverlap(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ta = tokens(a);
  for (const t of tokens(b)) if (ta.has(t)) return true;
  return false;
}

export type OfferLite = { brand: string; category?: string | null; postStart?: string | null; postEnd?: string | null };

export function exclusivityConflict(offer: OfferLite, deals: DealLite[], today: string) {
  const start = offer.postStart && isIsoDate(offer.postStart) ? offer.postStart : today;
  for (const d of deals) {
    if (d.status === "declined" || d.status === "offer") continue;
    if (d.brand.trim().toLowerCase() === offer.brand.trim().toLowerCase()) continue;
    if (!d.exclusivity_until || !isIsoDate(d.exclusivity_until)) continue;
    if (!categoriesOverlap(offer.category, d.exclusivity_category)) continue;
    if (start <= d.exclusivity_until) return { brand: d.brand, until: d.exclusivity_until, category: d.exclusivity_category ?? "" };
  }
  return null;
}

/** A counter above the recent average, with posting dates pushed past any exclusivity window. */
export function counterTerms(
  offer: { fee?: number | null; postStart?: string | null; postEnd?: string | null },
  avg: number | null,
  conflictUntil: string | null,
) {
  const base = Math.max(offer.fee ?? 0, avg ? Math.ceil((avg * 1.1) / 500) * 500 : (offer.fee ?? 0));
  let postStart = offer.postStart ?? null;
  let postEnd = offer.postEnd ?? null;
  if (conflictUntil && postStart && postStart <= conflictUntil) {
    const shift = daysBetween(postStart, addDays(conflictUntil, 4));
    postStart = addDays(postStart, shift);
    if (postEnd) postEnd = addDays(postEnd, shift);
  }
  return { fee: base, postStart, postEnd };
}

export function paymentDue(postEnd?: string | null, netDays?: number | null): string | null {
  if (!postEnd || !isIsoDate(postEnd) || typeof netDays !== "number") return null;
  return addDays(postEnd, netDays);
}

export function fmtWindow(start?: string | null, end?: string | null): string {
  if (start && end) return `${shortDate(start)} to ${shortDate(end)}`;
  if (start) return `from ${shortDate(start)}`;
  return "dates not stated";
}
