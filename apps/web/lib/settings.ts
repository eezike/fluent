import { admin } from "./supabase-admin";

export type Settings = {
  user_id: string;
  source_of_truth: "sheets" | "airtable" | null;
  gmail_email: string | null;
  gmail_history_id: string | null;
  gmail_watch_expires_at: string | null;
  last_sync_at: string | null;
  last_import_at: string | null;
};

export async function getSettings(userId: string): Promise<Settings> {
  const { data } = await admin().from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as Settings;
  await admin().from("settings").upsert({ user_id: userId }, { onConflict: "user_id" });
  return { user_id: userId, source_of_truth: null, gmail_email: null, gmail_history_id: null, gmail_watch_expires_at: null, last_sync_at: null, last_import_at: null };
}

export async function updateSettings(userId: string, patch: Partial<Omit<Settings, "user_id">>): Promise<void> {
  const { error } = await admin().from("settings").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}
