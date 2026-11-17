import { stepCountIs, streamText, type ModelMessage } from "ai";
import { toolLabel, type ChatEvent, type ChatRequest } from "@fluent/shared";
import { handle, HttpError, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";
import { getModel } from "@/lib/agent/models";
import { buildTools } from "@/lib/agent/tools";
import { systemPrompt } from "@/lib/agent/prompt";
import { rowToAction } from "@/lib/actions";

export const runtime = "nodejs";
export const maxDuration = 120;
export const OPTIONS = options;

function userContent(body: ChatRequest): string {
  const c = body.context;
  if (!c) return body.message;
  const clean = (s: string) => s.replace(/<\/?page_context[^>]*>/gi, "");
  const sel = c.selection ? `\nSelected text: ${clean(c.selection).slice(0, 2000)}` : "";
  return `<page_context url="${clean(c.url).slice(0, 500)}" title="${clean(c.title).replace(/"/g, "'").slice(0, 200)}">\n${clean(c.text).slice(0, 14000)}${sel}\n</page_context>\n\n${body.message}`;
}

/** Keeps the replayed history short without splitting a tool call from its result. */
function trim(history: ModelMessage[]): ModelMessage[] {
  let h = history.slice(-60);
  while (h.length && h[0].role !== "user") h = h.slice(1);
  return h;
}

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const body = (await req.json()) as ChatRequest;
  if (!body?.message?.trim()) throw new HttpError(400, "Say something first.");
  const model = getModel();
  const db = admin();

  let conversationId = body.conversationId;
  if (conversationId) {
    const { data } = await db.from("conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!data) throw new HttpError(404, "Conversation not found");
  } else {
    const { data, error } = await db
      .from("conversations")
      .insert({ user_id: user.id, title: body.message.trim().slice(0, 60) })
      .select("id")
      .single();
    if (error) throw new HttpError(500, error.message);
    conversationId = data.id as string;
  }
  const convId = conversationId;

  const { data: rows } = await db.from("messages").select("message").eq("conversation_id", convId).order("id", { ascending: true });
  const history = trim((rows ?? []).map((r) => r.message as ModelMessage));

  const userMessage: ModelMessage = { role: "user", content: userContent(body) };
  await db.from("messages").insert({ conversation_id: convId, user_id: user.id, message: userMessage, display: body.message });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      send({ type: "conversation", conversationId: convId });
      try {
        const result = streamText({
          model,
          system: systemPrompt({ now: new Date(), email: user.email, hasPageContext: !!body.context }),
          messages: [...history, userMessage],
          tools: buildTools({ userId: user.id, conversationId: convId }),
          stopWhen: stepCountIs(12),
          abortSignal: req.signal,
        });

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") send({ type: "text", delta: part.text });
          else if (part.type === "tool-call")
            send({ type: "tool_start", id: part.toolCallId, name: part.toolName, label: toolLabel(part.toolName) });
          else if (part.type === "tool-result") {
            const out = part.output as any;
            send({ type: "tool_end", id: part.toolCallId, ok: !(out && typeof out === "object" && "error" in out) });
            if (out && typeof out === "object" && out.actionId) {
              const { data } = await db.from("pending_actions").select("*").eq("id", out.actionId).single();
              if (data) send({ type: "pending", action: rowToAction(data) });
            }
          } else if (part.type === "tool-error") send({ type: "tool_end", id: part.toolCallId, ok: false });
          else if (part.type === "error")
            send({ type: "error", message: part.error instanceof Error ? part.error.message : "The model failed. Try again." });
        }

        // responseMessages spans every step (tool calls, tool results, final text).
        const generated = await result.responseMessages;
        if (generated.length) {
          await db
            .from("messages")
            .insert(generated.map((m) => ({ conversation_id: convId, user_id: user.id, message: m })));
        }
        await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
});
