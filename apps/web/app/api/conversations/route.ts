import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { data } = await admin()
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);
  return json({ conversations: data ?? [] });
});
