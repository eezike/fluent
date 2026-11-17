import { generateText, stepCountIs } from "ai";
import type { Idea } from "@fluent/shared";
import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getConnection } from "@/lib/connections";
import { getModel } from "@/lib/agent/models";
import { buildTools } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 90;
export const OPTIONS = options;

const cache = new Map<string, { at: number; ideas: Idea[] }>();

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const hit = cache.get(user.id);
  if (!fresh && hit && Date.now() - hit.at < 10 * 60_000) return json({ ideas: hit.ideas });

  const [g, a] = await Promise.all([getConnection(user.id, "google"), getConnection(user.id, "airtable")]);
  if (!g && !a) {
    return json({
      ideas: [
        { title: "Connect Gmail and Sheets", detail: "Fluent reads brand emails and checks offers against your rate card.", action: "Connect", prompt: "__connectors__" },
        { title: "Connect Airtable", detail: "Fluent keeps one record per deal and moves it through your stages.", action: "Connect", prompt: "__connectors__" },
      ] satisfies Idea[],
    });
  }

  const all = buildTools({ userId: user.id, conversationId: "ideas" });
  const readOnly = {
    search_gmail: all.search_gmail,
    read_gmail_thread: all.read_gmail_thread,
    read_rate_card: all.read_rate_card,
    airtable_get_schema: all.airtable_get_schema,
    airtable_list_deals: all.airtable_list_deals,
  };

  let ideas: Idea[] = [];
  try {
    const { text } = await generateText({
      model: getModel(),
      system:
        "You are Fluent, an assistant for a creator's brand deals. Use the read-only tools to find at most 4 things that need the user's attention today: new inbound brand emails not yet in Airtable, replies waiting on the user, overdue invoices, deals waiting on a brand for several days, usage rights ending soon. Only report things you actually found. Reply with ONLY a JSON array, no prose. Each item: {\"title\": short sentence, \"detail\": one sentence with specifics, \"action\": 2-3 word button label, \"prompt\": the message the user would send to Fluent to handle it}.",
      prompt: "What needs my attention today?",
      tools: readOnly,
      stopWhen: stepCountIs(8),
      abortSignal: req.signal,
    });
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      ideas = (Array.isArray(parsed) ? parsed : [])
        .filter((i) => i && typeof i.title === "string" && typeof i.prompt === "string")
        .slice(0, 4)
        .map((i) => ({ title: i.title, detail: String(i.detail ?? ""), action: String(i.action ?? "Open"), prompt: i.prompt }));
    }
  } catch (e) {
    console.error("ideas failed", e);
  }
  cache.set(user.id, { at: Date.now(), ideas });
  return json({ ideas });
});
