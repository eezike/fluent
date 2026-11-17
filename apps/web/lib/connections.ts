import { decrypt, encrypt } from "./crypto";
import { admin } from "./supabase-admin";

export type Provider = "google" | "airtable";
export type Connection = { secret: string; meta: Record<string, unknown> };

export async function getConnection(userId: string, provider: Provider): Promise<Connection | null> {
  const { data } = await admin()
    .from("connections")
    .select("secret_enc, meta")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  return { secret: decrypt(data.secret_enc), meta: (data.meta ?? {}) as Record<string, unknown> };
}

export async function saveConnection(
  userId: string,
  provider: Provider,
  secret: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin()
    .from("connections")
    .upsert({ user_id: userId, provider, secret_enc: encrypt(secret), meta, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function updateMeta(userId: string, provider: Provider, patch: Record<string, unknown>): Promise<void> {
  const existing = await getConnection(userId, provider);
  if (!existing) throw new Error(`${provider} is not connected`);
  await saveConnection(userId, provider, existing.secret, { ...existing.meta, ...patch });
}

export async function deleteConnection(userId: string, provider: Provider): Promise<void> {
  await admin().from("connections").delete().eq("user_id", userId).eq("provider", provider);
}
