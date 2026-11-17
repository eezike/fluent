import { after } from "next/server";
import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { answerQuestion, runTask, startTask } from "@/lib/ask";

export const runtime = "nodejs";
export const maxDuration = 120;
export const OPTIONS = options;

/** mode "answer": read-only reply that lands in Done. mode "task": a tracked task that runs in the background. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { message, mode } = await req.json();
  if (typeof message !== "string" || !message.trim()) throw new HttpError(400, "Type a question or a task.");
  if (mode !== "answer" && mode !== "task") throw new HttpError(400, "Invalid mode");
  const text = message.trim().slice(0, 2000);
  if (mode === "answer") return json({ notification: await answerQuestion(user.id, text) });
  const n = await startTask(user.id, text);
  after(() => runTask(user.id, n.id, text));
  return json({ notification: n });
});
