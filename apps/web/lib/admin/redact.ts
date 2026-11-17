// Strips personal details before a real email becomes an eval case. It's a safety net, not a guarantee: admins still review the text.
export function redact(text: string, names: string[] = []): string {
  let t = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => `contact@${m.split("@")[1].toLowerCase()}`)
    .replace(/(\+?\d[\d\s().-]{8,}\d)/g, "[phone]")
    .replace(/\b\d{12,19}\b/g, "[number]")
    .replace(/https?:\/\/\S+/g, "[link]");
  for (const n of names.filter((n) => n && n.length > 2)) t = t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[name]");
  return t;
}
