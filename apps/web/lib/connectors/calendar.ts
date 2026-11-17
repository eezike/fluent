import { addDays } from "../core/rules";
import { gfetch } from "./google";

/** Creates an all-day event on the primary calendar. */
export async function createAllDayEvent(userId: string, e: { title: string; date: string; description?: string }) {
  const r = await gfetch(userId, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify({
      summary: e.title,
      description: e.description ?? "Added by Fluent",
      start: { date: e.date },
      end: { date: addDays(e.date, 1) },
    }),
  });
  return { id: r.id as string, url: r.htmlLink as string };
}
