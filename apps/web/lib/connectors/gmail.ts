import { gfetch } from "./google";

const G = "https://gmail.googleapis.com/gmail/v1/users/me";

function header(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function searchThreads(userId: string, query: string, maxResults = 8) {
  const list = await gfetch(userId, `${G}/threads?${new URLSearchParams({ q: query, maxResults: String(Math.min(maxResults, 15)) })}`);
  const threads: { id: string }[] = list.threads ?? [];
  return Promise.all(
    threads.map(async (t) => {
      const th = await gfetch(
        userId,
        `${G}/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const first = th.messages?.[0];
      const last = th.messages?.[th.messages.length - 1];
      return {
        threadId: t.id as string,
        subject: header(first?.payload?.headers, "Subject"),
        from: header(last?.payload?.headers, "From"),
        date: header(last?.payload?.headers, "Date"),
        messageCount: th.messages?.length ?? 0,
        snippet: (last?.snippet ?? "") as string,
      };
    }),
  );
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: Part[];
};

function collect(part: Part, out: { plain: string[]; html: string[]; attachments: { name: string; mimeType: string; size: number }[] }) {
  if (part.filename) {
    out.attachments.push({ name: part.filename, mimeType: part.mimeType ?? "", size: part.body?.size ?? 0 });
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    out.plain.push(decodeB64Url(part.body.data));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    out.html.push(decodeB64Url(part.body.data));
  }
  part.parts?.forEach((p) => collect(p, out));
}

export type ThreadMessage = { messageId: string; from: string; to: string; date: string; subject: string; body: string; attachments: { name: string; mimeType: string; size: number }[] };

export async function readThread(userId: string, threadId: string): Promise<{ threadId: string; messages: ThreadMessage[] }> {
  const th = await gfetch(userId, `${G}/threads/${threadId}?format=full`);
  let budget = 24000;
  const messages: ThreadMessage[] = (th.messages ?? []).map((m: any): ThreadMessage => {
    const acc = { plain: [] as string[], html: [] as string[], attachments: [] as { name: string; mimeType: string; size: number }[] };
    collect(m.payload ?? {}, acc);
    let body = acc.plain.join("\n").trim() || stripHtml(acc.html.join("\n"));
    body = body.slice(0, Math.min(7000, Math.max(budget, 500)));
    budget -= body.length;
    const h = m.payload?.headers;
    return {
      messageId: header(h, "Message-ID"),
      from: header(h, "From"),
      to: header(h, "To"),
      date: header(h, "Date"),
      subject: header(h, "Subject"),
      body,
      attachments: acc.attachments,
    };
  });
  return { threadId, messages };
}

function encodeSubject(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

async function buildRaw(
  userId: string,
  { to, subject, body, threadId }: { to: string; subject: string; body: string; threadId?: string },
): Promise<string> {
  const lines = [`To: ${to}`, `Subject: ${encodeSubject(subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"'];
  if (threadId) {
    try {
      const th = await gfetch(userId, `${G}/threads/${threadId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`);
      const last = th.messages?.[th.messages.length - 1];
      const mid = header(last?.payload?.headers, "Message-ID");
      const refs = header(last?.payload?.headers, "References");
      if (mid) {
        lines.push(`In-Reply-To: ${mid}`, `References: ${refs ? `${refs} ${mid}` : mid}`);
      }
    } catch {
      // thread headers are best effort
    }
  }
  return Buffer.from(`${lines.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

export async function createDraft(
  userId: string,
  input: { to: string; subject: string; body: string; threadId?: string },
) {
  const raw = await buildRaw(userId, input);
  const d = await gfetch(userId, `${G}/drafts`, {
    method: "POST",
    body: JSON.stringify({ message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } }),
  });
  return { draftId: d.id as string };
}

export async function sendMessage(
  userId: string,
  input: { to: string; subject: string; body: string; threadId?: string },
) {
  const raw = await buildRaw(userId, input);
  const m = await gfetch(userId, `${G}/messages/send`, {
    method: "POST",
    body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }),
  });
  return { messageId: m.id as string };
}

export async function getProfile(userId: string): Promise<{ emailAddress: string; historyId: string }> {
  return gfetch(userId, `${G}/profile`);
}

const SKIP_LABELS = new Set(["SENT", "DRAFT", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS", "SPAM", "TRASH"]);

/** Threads that received a new inbox message since historyId. `reset` means Gmail no longer has that history. */
export async function newInboxThreads(
  userId: string,
  startHistoryId: string,
): Promise<{ threadIds: string[]; historyId: string; reset?: boolean }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let historyId = startHistoryId;
  try {
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", labelId: "INBOX", maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const r = await gfetch(userId, `${G}/history?${params}`);
      historyId = r.historyId ?? historyId;
      for (const h of r.history ?? [])
        for (const m of h.messagesAdded ?? []) {
          const labels: string[] = m.message?.labelIds ?? [];
          if (labels.some((l) => SKIP_LABELS.has(l))) continue;
          if (m.message?.threadId) ids.add(m.message.threadId);
        }
      pageToken = r.nextPageToken;
      if (!pageToken) break;
    }
  } catch (e) {
    if (e instanceof Error && /not found|404/i.test(e.message)) {
      const p = await getProfile(userId);
      return { threadIds: [], historyId: p.historyId, reset: true };
    }
    throw e;
  }
  return { threadIds: [...ids], historyId };
}

export async function watchInbox(userId: string, topicName: string): Promise<{ historyId: string; expiration: number }> {
  const r = await gfetch(userId, `${G}/watch`, { method: "POST", body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }) });
  return { historyId: r.historyId, expiration: Number(r.expiration) };
}
