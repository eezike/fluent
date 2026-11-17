import { admin } from "../supabase-admin";
import { DEFAULT_PROMPTS, PROMPT_KEYS, type PromptKey } from "./defaults";
import { isAdminId } from "./auth";
import { pickVersion, type Rollout } from "./rollout";

let cache: { at: number; rollouts: Map<string, Rollout>; bodies: Map<string, string> } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 15_000) return cache;
  const [r, v] = await Promise.all([admin().from("prompt_rollout").select("*"), admin().from("prompt_versions").select("key,version,body")]);
  cache = {
    at: Date.now(),
    rollouts: new Map((r.data ?? []).map((x) => [x.key as string, x as Rollout])),
    bodies: new Map((v.data ?? []).map((x) => [`${x.key}:${x.version}`, x.body as string])),
  };
  return cache;
}
export const clearPromptCache = () => (cache = null);

export type Resolved = { text: string; version: number | null };

/** The prompt a given user gets right now: their rollout bucket's version, else the default in code. */
export async function resolvePrompt(key: PromptKey, opts: { userId?: string; override?: string } = {}): Promise<Resolved> {
  if (opts.override != null) return { text: opts.override, version: null };
  try {
    const c = await load();
    const v = pickVersion(c.rollouts.get(key), opts.userId, await isAdminId(opts.userId));
    const body = v != null ? c.bodies.get(`${key}:${v}`) : undefined;
    if (v != null && body) return { text: body, version: v };
  } catch (e) {
    console.error("prompt lookup failed, using the default", e instanceof Error ? e.message : e);
  }
  return { text: DEFAULT_PROMPTS[key], version: null };
}

/** For evals: "default", "active" (what everyone gets) or a specific version number. */
export async function promptForEval(key: PromptKey, pick: string | number | undefined): Promise<Resolved> {
  if (pick == null || pick === "default") return { text: DEFAULT_PROMPTS[key], version: null };
  const c = await load();
  if (pick === "active") {
    const v = c.rollouts.get(key)?.active_version ?? null;
    const body = v != null ? c.bodies.get(`${key}:${v}`) : undefined;
    return v != null && body ? { text: body, version: v } : { text: DEFAULT_PROMPTS[key], version: null };
  }
  const body = c.bodies.get(`${key}:${pick}`);
  if (!body) throw new Error(`No version ${pick} of "${key}".`);
  return { text: body, version: Number(pick) };
}

export { PROMPT_KEYS };
