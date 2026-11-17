import { getConnection } from "../connections";
import { getSettings, updateSettings } from "../settings";
import { getProfile, newInboxThreads, readThread, searchThreads } from "../connectors/gmail";
import { notificationExists } from "../notifications";
import { parseFrom } from "../core/quotes";
import { classifyEmail } from "./classify";
import { createOfferNotification, today } from "./offers";
import { attachmentBlock, readPdfAttachments, type ReadAttachment } from "../attachments";

const MAX_THREADS_PER_RUN = 8;

/** Reads one thread and, if it is a brand offer or contract, creates its notification. */
export async function processThread(userId: string, threadId: string, myEmail: string | null): Promise<boolean> {
  const key = `thread:${threadId}`;
  if (await notificationExists(userId, key)) return false;
  const th = await readThread(userId, threadId);
  const msgs = th.messages;
  if (!msgs.length) return false;
  const last = msgs[msgs.length - 1];
  const from = parseFrom(last.from);
  if (myEmail && from.email?.toLowerCase() === myEmail.toLowerCase()) return false; // the user spoke last
  const text = msgs
    .slice(-3)
    .map((m) => `From: ${m.from}\nDate: ${m.date}\n${m.body}`)
    .join("\n\n---\n\n");
  // Briefs and contracts often arrive as PDFs with a one-line email. A failure here must not lose the offer.
  let files: ReadAttachment[] = [];
  try {
    files = await readPdfAttachments(userId, msgs);
  } catch (e) {
    console.error("attachments failed", threadId, e instanceof Error ? e.message : e);
  }
  const x = await classifyEmail({ from: last.from, subject: msgs[0].subject, text, attachments: attachmentBlock(files), today: today() }, { userId });
  if ((x.kind !== "brand_offer" && x.kind !== "contract") || x.confidence < 0.6 || !x.brand) return false;
  x.contactEmail ??= from.email;
  x.contactName ??= from.name;
  const n = await createOfferNotification(userId, {
    key,
    x,
    threadId,
    subject: msgs[0].subject || `${x.brand} partnership`,
    attachments: [
      ...files.map((f) => ({ name: f.name, meta: f.readable ? `PDF · ${f.pages} page${f.pages === 1 ? "" : "s"}${f.note ? ` · ${f.note}` : ""}` : `PDF · ${f.note ?? "not read"}. Check it yourself` })),
      ...msgs.flatMap((m) => m.attachments).filter((a) => !/pdf/i.test(a.mimeType) && !/\.pdf$/i.test(a.name)).slice(0, 3).map((a) => ({ name: a.name, meta: "Attachment · not read" })),
    ],
  });
  return !!n;
}

export async function syncInbox(userId: string): Promise<number> {
  if (!(await getConnection(userId, "google"))) return 0;
  const s = await getSettings(userId);
  let myEmail = s.gmail_email;
  let threadIds: string[] = [];
  let historyId = s.gmail_history_id;

  if (!historyId || !myEmail) {
    const p = await getProfile(userId);
    myEmail = p.emailAddress;
    historyId = p.historyId;
    // First run: look back a few days so the inbox isn't empty on day one.
    const found = await searchThreads(userId, "in:inbox newer_than:3d -category:promotions -category:social -category:forums", 10);
    threadIds = found.map((t) => t.threadId);
  } else {
    const r = await newInboxThreads(userId, historyId);
    threadIds = r.threadIds;
    historyId = r.historyId;
  }

  let created = 0;
  for (const id of threadIds.slice(0, MAX_THREADS_PER_RUN)) {
    try {
      if (await processThread(userId, id, myEmail)) created++;
    } catch (e) {
      console.error("thread failed", id, e instanceof Error ? e.message : e);
    }
  }
  await updateSettings(userId, { gmail_email: myEmail, gmail_history_id: historyId });
  return created;
}
