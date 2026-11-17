// Small authenticated fetch helpers shared by the web app and the extension.

export type ApiOptions = {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  /** Swap the network for something else. The in-app demo uses this to run on sample data. */
  fetchImpl?: typeof fetch;
};

async function headers(opts: ApiOptions): Promise<Record<string, string>> {
  const token = await opts.getToken();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiGet<T>(opts: ApiOptions, path: string): Promise<T> {
  const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}${path}`, { headers: await headers(opts) });
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
  const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}${path}`, {
    method,
    headers: await headers(opts),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
  return j as T;
}
