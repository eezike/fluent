const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Keeps a quote only if it really appears in the email text, so evidence can't be invented. */
export function verifyQuote(text: string, quote: string | null | undefined): string | undefined {
  if (!quote) return undefined;
  const q = norm(quote).replace(/^["']|["']$/g, "");
  if (q.length < 6) return undefined;
  return norm(text).includes(q) ? quote.trim() : undefined;
}

export function parseFrom(from: string): { name: string | null; email: string | null } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  const e = from.match(/[^\s<>@]+@[^\s<>@]+/);
  return { name: null, email: e ? e[0] : null };
}
