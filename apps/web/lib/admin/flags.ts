import { HttpError } from "../http";
import { admin } from "../supabase-admin";
import type { Prices } from "./cost";

export type Flags = { pause_sending: boolean; pause_agent: boolean; dry_run_all: boolean; auto_pause_errors: number; promote_gate: number; model_prices: Prices; daily_budget_usd: number };
export const FLAG_DEFAULTS: Flags = { pause_sending: false, pause_agent: false, dry_run_all: false, auto_pause_errors: 0, promote_gate: 0.9, model_prices: {}, daily_budget_usd: 0 };

let cache: { at: number; v: Flags } | null = null;

export async function getFlags(fresh = false): Promise<Flags> {
  if (!fresh && cache && Date.now() - cache.at < 5_000) return cache.v;
  const { data } = await admin().from("system_flags").select("key,value");
  const v: Flags = { ...FLAG_DEFAULTS };
  for (const r of data ?? []) if (r.key in v) (v as Record<string, unknown>)[r.key] = r.value;
  cache = { at: Date.now(), v };
  return v;
}

export async function setFlag<K extends keyof Flags>(key: K, value: Flags[K], by?: string) {
  const { error } = await admin().from("system_flags").upsert({ key, value, updated_by: by ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  cache = null;
}

/** Stops agent work (reading mail, drafting, answering) when an admin has paused everything or this user. */
export async function assertAgentActive(userId: string) {
  const f = await getFlags();
  if (f.pause_agent) throw new HttpError(503, "Fluent is paused for maintenance. Try again in a bit.");
  const { data } = await admin().from("settings").select("paused").eq("user_id", userId).maybeSingle();
  if (data?.paused) throw new HttpError(503, "Fluent is paused on your account. Contact support.");
}

export async function agentActive(userId: string): Promise<boolean> {
  try {
    await assertAgentActive(userId);
    return true;
  } catch {
    return false;
  }
}
