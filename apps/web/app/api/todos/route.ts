import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { createTodo, listTodos } from "@/lib/todos";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json(await listTodos(user.id));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await req.json();
  return json({ todo: await createTodo(user.id, { title: b.title, note: b.note, dueDate: b.dueDate }) });
});
