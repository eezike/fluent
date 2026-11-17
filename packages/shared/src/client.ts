import type { ChatEvent, ChatRequest, PendingAction } from "./protocol";

export type ApiOptions = { baseUrl: string; getToken: () => Promise<string | null> };

async function headers(opts: ApiOptions): Promise<Record<string, string>> {
  const token = await opts.getToken();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** Streams a chat turn, calling onEvent for every NDJSON event. */
export async function streamChat(
  opts: ApiOptions,
  req: ChatRequest,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${opts.baseUrl}/api/chat`, {
    method: "POST",
    headers: await headers(opts),
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {}
    onEvent({ type: "error", message });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as ChatEvent);
      } catch {
        // ignore malformed line
      }
    }
  }
}

export async function decideAction(
  opts: ApiOptions,
  id: string,
  decision: "approve" | "reject",
  payload?: PendingAction["payload"],
): Promise<PendingAction> {
  const res = await fetch(`${opts.baseUrl}/api/actions/${id}`, {
    method: "POST",
    headers: await headers(opts),
    body: JSON.stringify({ decision, payload }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
  return j.action as PendingAction;
}

export async function apiGet<T>(opts: ApiOptions, path: string): Promise<T> {
  const res = await fetch(`${opts.baseUrl}${path}`, { headers: await headers(opts) });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
  return j as T;
}

export async function apiSend<T>(
  opts: ApiOptions,
  path: string,
  method: "POST" | "DELETE" | "PUT",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${opts.baseUrl}${path}`, {
    method,
    headers: await headers(opts),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
  return j as T;
}
