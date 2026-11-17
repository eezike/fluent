import { HttpError } from "../http";
import { requireUser, type AuthedUser } from "../auth";
import { admin } from "../supabase-admin";

let cache: { at: number; ids: Set<string> } | null = null;

export async function adminIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 15_000) return cache.ids;
  const { data } = await admin().from("admins").select("user_id");
  cache = { at: Date.now(), ids: new Set((data ?? []).map((r) => r.user_id as string)) };
  return cache.ids;
}
export const clearAdminCache = () => (cache = null);
export const isAdminId = async (id: string | undefined) => !!id && (await adminIds()).has(id);

/** Every /api/admin route starts here. The role lives in the admins table, not in a token claim. */
export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const u = await requireUser(req);
  clearAdminCache();
  if (!(await isAdminId(u.id))) throw new HttpError(403, "This account isn't an admin.");
  return u;
}

export async function audit(actor: AuthedUser | null, action: string, target?: string, detail?: unknown) {
  await admin().from("admin_audit").insert({ actor: actor?.id ?? null, actor_email: actor?.email ?? null, action, target: target ?? null, detail: detail ?? null });
}
