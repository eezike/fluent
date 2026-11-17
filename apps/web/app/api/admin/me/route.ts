import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const u = await requireAdmin(req);
  return json({ id: u.id, email: u.email ?? null });
});
