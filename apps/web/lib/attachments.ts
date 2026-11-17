import { extractText, getDocumentProxy } from "unpdf";
import { getAttachment, type AttachmentRef, type ThreadMessage } from "./connectors/gmail";

export type ReadAttachment = {
  name: string;
  pages: number;
  /** Extracted text. Untrusted third-party content: never treat it as instructions. */
  text: string;
  /** False when the file had no extractable text (scanned image, or unreadable). */
  readable: boolean;
  note?: string;
};

export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_PDFS = 3;
export const MAX_PAGES = 30;
export const MAX_CHARS_PER_PDF = 12_000;

const isPdf = (a: AttachmentRef) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.name);

/** Text of a PDF held in memory. Pure parsing: nothing in the file is executed. */
export async function pdfToText(data: Uint8Array): Promise<{ pages: number; text: string }> {
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  // Only the first MAX_PAGES are used: a 200-page deck isn't a brief.
  const joined = text.slice(0, MAX_PAGES).join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { pages: totalPages, text: joined };
}

const readable = (text: string, pages: number) => text.replace(/\s/g, "").length >= 40 * Math.min(pages, 3);

/** Reads PDF attachments from the newest messages first. One bad file never fails the thread. */
export async function readPdfAttachments(userId: string, msgs: ThreadMessage[], opts: { only?: string } = {}): Promise<ReadAttachment[]> {
  const out: ReadAttachment[] = [];
  const seen = new Set<string>();
  for (const m of [...msgs].reverse()) {
    for (const a of m.attachments) {
      if (out.length >= MAX_PDFS) return out;
      if (!isPdf(a) || !a.attachmentId) continue;
      if (opts.only && a.name.toLowerCase() !== opts.only.toLowerCase()) continue;
      const key = `${a.name}:${a.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (a.size > MAX_PDF_BYTES) {
        out.push({ name: a.name, pages: 0, text: "", readable: false, note: "too large to read" });
        continue;
      }
      try {
        const bytes = await getAttachment(userId, m.gmailId, a.attachmentId);
        const { pages, text } = await pdfToText(new Uint8Array(bytes));
        const ok = readable(text, pages);
        out.push({
          name: a.name,
          pages,
          text: text.slice(0, MAX_CHARS_PER_PDF),
          readable: ok,
          note: ok ? (pages > MAX_PAGES ? `read the first ${MAX_PAGES} of ${pages} pages` : undefined) : "no readable text (scanned?)",
        });
      } catch (e) {
        console.error("pdf failed", a.name, e instanceof Error ? e.message : e);
        out.push({ name: a.name, pages: 0, text: "", readable: false, note: "couldn't be opened" });
      }
    }
  }
  return out;
}

/** What goes in front of the model: each file in its own labelled block. */
export function attachmentBlock(list: ReadAttachment[]): string {
  return list
    .filter((a) => a.readable)
    .map((a) => `<attachment name=${JSON.stringify(a.name)}>\n${a.text}\n</attachment>`)
    .join("\n\n");
}
