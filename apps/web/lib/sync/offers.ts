import type { NotificationDTO } from "@fluent/shared";
import { analyze, planOffer, type Extraction } from "../core/plan";
import { createNotification, notificationExists } from "../notifications";
import { draftAccept, draftCounter } from "./drafts";
import { recentDeals, resolveSot } from "./source";

export const today = () => new Date().toISOString().slice(0, 10);

/** Builds and stores the notification for one extracted offer. Returns null if this key was already notified. */
export async function createOfferNotification(
  userId: string,
  args: { key: string; x: Extraction; threadId?: string; subject: string; attachments?: { name: string; meta: string }[] },
): Promise<NotificationDTO | null> {
  if (await notificationExists(userId, args.key)) return null;
  const [deals, sot] = await Promise.all([recentDeals(userId), resolveSot(userId, { ask: true })]);
  const t = today();
  const a = analyze(args.x, deals, t);
  const flagged = !!(a.rate || a.conflict);
  const [acceptBody, counterBody] = await Promise.all([
    flagged ? Promise.resolve("") : draftAccept(args.x, userId),
    a.counter ? draftCounter(args.x, a.counter, a.conflict?.brand, userId) : Promise.resolve(""),
  ]);
  const plan = planOffer({ x: args.x, threadId: args.threadId, subject: args.subject, deals, today: t, sot, acceptBody, counterBody: () => counterBody, attachments: args.attachments });
  return createNotification(userId, args.key, plan, { threadId: args.threadId, agentMessage: args.x.summary });
}
