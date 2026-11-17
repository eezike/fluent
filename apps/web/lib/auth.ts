import { HttpError } from "./http";
import { admin } from "./supabase-admin";

export type AuthedUser = { id: string; email?: string };

/** Verifies the Supabase access token sent as a Bearer token. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Not signed in");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session expired. Sign in again.");
  return { id: data.user.id, email: data.user.email ?? undefined };
}
