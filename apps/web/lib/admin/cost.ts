export type Prices = Record<string, { in: number; out: number }>; // USD per 1M tokens

export function costOf(model: string | null | undefined, inTok: number | null | undefined, outTok: number | null | undefined, prices: Prices): number | null {
  const p = model ? prices[model] : undefined;
  if (!p || inTok == null || outTok == null) return null;
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}
