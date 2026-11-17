import { admin } from "../supabase-admin";

/** Finds an auth user by email. Scans up to 5,000 accounts, which is plenty at this stage. */
export async function findUserByEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === e);
    if (hit) return { id: hit.id, email: hit.email ?? null };
    if (data.users.length < 1000) break;
  }
  return null;
}
