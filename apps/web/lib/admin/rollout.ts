export type Rollout = { active_version: number | null; candidate_version: number | null; mode: "off" | "admins" | "percent"; percent: number };

/** Stable 0-99 bucket for a user, so the same person always sees the same prompt during a rollout. */
export function bucket(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

/** Which version this user gets. null = the default in code. */
export function pickVersion(r: Rollout | null | undefined, userId: string | undefined, isAdmin: boolean): number | null {
  if (!r) return null;
  if (r.candidate_version != null && r.mode === "admins" && isAdmin) return r.candidate_version;
  if (r.candidate_version != null && r.mode === "percent" && userId && bucket(userId) < r.percent) return r.candidate_version;
  return r.active_version;
}
