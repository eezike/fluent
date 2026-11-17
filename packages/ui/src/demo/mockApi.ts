import type { NotificationCounts, NotificationDTO, NotificationList, TodoDTO } from "@fluent/shared";
import { adidas, nb, seedActive, seedDone } from "./data";

type Json = Record<string, unknown>;
type Result = { status: number; body: Json };

const ANSWERS: { test: RegExp; answer: string; sources: NotificationDTO["sources"] }[] = [
  {
    test: /late|overdue|unpaid|owe|payment/i,
    answer: "One payment is overdue: Tern Audio, $3,200, 14 days past its Nov 3 due date. Halcyon’s $6,500 isn’t due until Dec 1. I already drafted a reminder to Tern for you to approve.",
    sources: [{ app: "airtable", name: "Deals", meta: "Airtable · 4 deals" }, { app: "gmail", name: "Tern Audio thread", meta: "Gmail" }],
  },
  {
    test: /rate|charge|price|reel|quote|worth/i,
    answer: "Your last 4 deals average about $15,000 for a package like 2 Reels and 3 Stories (Nike $16,000, Brooks $14,500). I’d quote $16,500 and settle at no less than $14,000.",
    sources: [{ app: "airtable", name: "Your recent deals", meta: "Airtable · last 4 deals" }, { app: "sheets", name: "Your rate card", meta: "Google Sheets" }],
  },
];
const FALLBACK = "In the demo I can only answer a few questions. In the real app, Fluent answers this from your inbox, calendar and deal tracker. Try “Which payments are late?”";

const parseAmount = (msg: string): number | null => {
  const k = msg.match(/\$?\s?(\d{1,3})\s?k\b/i);
  if (k) return Number(k[1]) * 1000;
  const n = msg.match(/\$?\s?(\d{1,3}(?:,\d{3})+|\d{4,6})/);
  return n ? Number(n[1].replace(/,/g, "")) : null;
};
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** A tiny in-memory stand-in for the Fluent API, so the demo runs with no account and no network. */
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const seedTodos = (): TodoDTO[] => [
  { id: "td-1", title: "Send signed Halcyon agreement", source: "user", status: "open", dueDate: day(3), createdAt: new Date().toISOString() },
  { id: "td-2", title: "Post New Balance content", note: "Posting window opens Mar 10.", source: "agent", status: "suggested", dueDate: day(6), createdAt: new Date().toISOString() },
  { id: "td-3", title: "Check Tern payment arrived", note: "Payment is overdue by 14 days.", source: "agent", status: "suggested", dueDate: day(1), createdAt: new Date().toISOString() },
];

export class DemoStore {
  items = new Map<string, NotificationDTO>();
  todos = new Map<string, TodoDTO>();
  /** Milliseconds each step of a job takes. Zero finishes jobs on the next tick. */
  stepMs: number;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private seq = 0;

  constructor(stepMs = 1100) {
    this.stepMs = stepMs;
    this.reset();
  }

  reset() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.items.clear();
    this.todos.clear();
    [...seedActive(), ...seedDone()].forEach((n) => this.items.set(n.id, n));
    seedTodos().forEach((t) => this.todos.set(t.id, t));
  }

  /** The New Balance offer shows up, as if it had just landed in the inbox. */
  arrive(): NotificationDTO {
    const n = nb();
    this.items.set(n.id, n);
    return n;
  }

  get(id: string) {
    return this.items.get(id);
  }

  list(tab: "active" | "done"): NotificationList {
    const all = [...this.items.values()];
    const rank = (n: NotificationDTO) => (n.status === "open" ? (n.urgency === "urgent" ? 0 : 1) : 2);
    const active = all.filter((n) => n.status === "open" || n.status === "running").sort((a, b) => rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const done = all.filter((n) => n.status === "done" || n.status === "dismissed").sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const counts: NotificationCounts = {
      active: active.length,
      done: done.length,
      toReview: active.filter((n) => n.status === "open").length,
      inProgress: active.filter((n) => n.status === "running").length,
      urgent: active.filter((n) => n.status === "open" && n.urgency === "urgent").length,
    };
    return { items: tab === "done" ? done : active, counts };
  }

  private touch(n: NotificationDTO, patch: Partial<NotificationDTO>) {
    const next = { ...n, ...patch, updatedAt: new Date().toISOString() };
    this.items.set(n.id, next);
    return next;
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  act(id: string, body: Json): Result {
    const n = this.items.get(id);
    if (!n) return { status: 404, body: { error: "Not found" } };
    switch (body.action) {
      case "dismiss":
        return ok(this.touch(n, { status: "dismissed" }));
      case "snooze":
        return ok(this.touch(n, { status: "dismissed" }));
      case "answer": {
        const label = body.choice === "sheets" ? "Google Sheets" : "Airtable";
        return ok(this.touch(n, { status: "done", resultTag: `Using ${label}`, steps: n.steps.map((s) => ({ ...s, state: "done" as const })) }));
      }
      case "approve":
        return ok(this.run(n));
      case "convert":
        return ok(this.touch(n, { type: "task", status: "running", progress: 20 }));
      default:
        return { status: 400, body: { error: "Unknown action" } };
    }
  }

  /** Runs the planned actions one at a time, ticking the Steps list as it goes. */
  private run(n: NotificationDTO): NotificationDTO {
    const finished = n.steps.filter((s) => s.state === "done").slice(0, n.steps.findIndex((s) => s.state === "todo") === -1 ? n.steps.length : n.steps.findIndex((s) => s.state === "todo"));
    const total = n.actions.length;
    const build = (k: number): NotificationDTO["steps"] => [
      ...finished,
      { label: "You approved it", state: "done" },
      ...n.actions.map((a, i) => ({ label: i < k ? String(a.params.done) : String(a.params.doing), state: (i < k ? "done" : i === k ? "active" : "todo") as "done" | "active" | "todo" })),
      { label: "Then mark it done and tell you", state: "todo" as const },
    ];
    const started = this.touch(n, { status: "running", progress: 8, steps: build(0), actions: n.actions.map((a, i) => ({ ...a, status: i === 0 ? "running" : "planned" })) });
    const step = (k: number) => {
      this.later(this.stepMs, () => {
        const cur = this.items.get(n.id);
        if (!cur) return;
        if (k >= total) {
          this.touch(cur, {
            status: "done",
            progress: undefined,
            steps: [...finished, { label: "You approved it", state: "done" }, ...n.actions.map((a) => ({ label: String(a.params.done), state: "done" as const })), { label: "Marked it done", state: "done" }],
            actions: cur.actions.map((a) => ({ ...a, status: "done" as const })),
            thread: [...cur.thread, { role: "agent", text: "All set. Everything is in the Done tab with a record of what changed." }],
          });
          return;
        }
        this.touch(cur, { progress: Math.round(((k + 1) / (total + 1)) * 100), steps: build(k + 1), actions: cur.actions.map((a, i) => ({ ...a, status: i <= k ? ("done" as const) : i === k + 1 ? ("running" as const) : a.status })) });
        step(k + 1);
      });
    };
    step(0);
    return started;
  }

  refine(id: string, message: string): Result {
    const n = this.items.get(id);
    if (!n) return { status: 404, body: { error: "Not found" } };
    const amount = parseAmount(message);
    const user = { role: "user" as const, text: message };
    if (n.id === adidas().id && amount) {
      const offered = 9300;
      const changes = n.changes.map((c) => (c.kind === "new" ? { ...c, text: `Fee ${usd(amount)} · posts May 4 to 18, after Nike’s window` } : c));
      const actions = n.actions.map((a) =>
        a.kind === "gmail.draft" ? { ...a, params: { ...a.params, body: String(a.params.body).replace(/\$[\d,]+/, usd(amount)) } } : a,
      );
      const diff = amount - offered;
      return ok(
        this.touch(n, {
          changes,
          actions,
          changeNote: `2 terms changed · ${usd(Math.abs(diff))} ${diff >= 0 ? "above" : "below"} the offer`,
          thread: [...n.thread, user, { role: "agent", text: `Done. The fee is now ${usd(amount)}, still above your recent average. I updated the draft too.` }],
        }),
      );
    }
    return ok(this.touch(n, { thread: [...n.thread, user, { role: "agent", text: "Got it. I updated the draft. In the full app you can edit the email directly too." }] }));
  }

  ask(message: string, mode: string): Result {
    const id = `demo-ask-${++this.seq}`;
    const now = new Date().toISOString();
    if (mode === "task") {
      const n: NotificationDTO = {
        id, category: "info", type: "task", title: message.slice(0, 90), body: "Working on it…", urgency: "normal", status: "running", progress: 25,
        createdAt: now, updatedAt: now, flags: [], terms: [], sources: [], changes: [], actions: [], thread: [],
        steps: [{ label: "Read your request", state: "done" }, { label: "Looking through your inbox and deals", state: "active" }, { label: "Summarize what I found", state: "todo" }],
      };
      this.items.set(id, n);
      this.later(this.stepMs * 2, () => {
        const cur = this.items.get(id);
        if (cur) this.touch(cur, { status: "done", progress: undefined, body: "Done.", resultTag: "Task finished", steps: cur.steps.map((s) => ({ ...s, state: "done" as const })) });
      });
      return ok(n);
    }
    const hit = ANSWERS.find((a) => a.test.test(message));
    const n: NotificationDTO = {
      id, category: "info", type: "answer", title: message.slice(0, 90), body: "", urgency: "normal", status: "done",
      createdAt: now, updatedAt: now, flags: [], terms: [], steps: [], changes: [], actions: [], thread: [],
      sources: hit?.sources ?? [], answer: hit?.answer ?? FALLBACK,
    };
    this.items.set(id, n);
    return ok(n);
  }

  listTodos() {
    const all = [...this.todos.values()];
    const byDue = (a: TodoDTO, b: TodoDTO) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    return { open: all.filter((t) => t.status === "open").sort(byDue), suggested: all.filter((t) => t.status === "suggested").sort(byDue) };
  }

  todoAct(id: string, action: string): Result {
    const t = this.todos.get(id);
    if (!t) return { status: 404, body: { error: "Not found" } };
    const set = (patch: Partial<TodoDTO>) => {
      const n = { ...t, ...patch };
      this.todos.set(id, n);
      return n;
    };
    switch (action) {
      case "done": return { status: 200, body: { todo: set({ status: "done" }) } };
      case "dismiss": return { status: 200, body: { todo: set({ status: "dismissed" }) } };
      case "accept": return { status: 200, body: { todo: set({ status: "open" }) } };
      case "reopen": return { status: 200, body: { todo: set({ status: "open" }) } };
      case "delegate": {
        const r = this.ask([t.title, t.note].filter(Boolean).join(". "), "task");
        const n = r.body.notification as unknown as NotificationDTO;
        return { status: 200, body: { todo: set({ status: "open", notificationId: n.id }), notification: n } as unknown as Json };
      }
      default: return { status: 400, body: { error: "Unknown action" } };
    }
  }

  handle(path: string, method: string, body: Json): Result {
    const url = new URL(path, "http://demo.local");
    const p = url.pathname;
    if (method === "GET" && p === "/api/notifications") return { status: 200, body: this.list(url.searchParams.get("tab") === "done" ? "done" : "active") as unknown as Json };
    let m = p.match(/^\/api\/notifications\/([^/]+)$/);
    if (m && method === "GET") {
      const n = this.items.get(m[1]);
      return n ? ok(n) : { status: 404, body: { error: "Not found" } };
    }
    m = p.match(/^\/api\/notifications\/([^/]+)\/act$/);
    if (m && method === "POST") return this.act(m[1], body);
    m = p.match(/^\/api\/notifications\/([^/]+)\/refine$/);
    if (m && method === "POST") return this.refine(m[1], String(body.message ?? ""));
    if (method === "GET" && p === "/api/todos") return { status: 200, body: this.listTodos() as unknown as Json };
    if (method === "POST" && p === "/api/todos") {
      const id = `td-new-${++this.seq}`;
      const t: TodoDTO = { id, title: String(body.title ?? "").slice(0, 200), dueDate: (body.dueDate as string) || undefined, source: "user", status: "open", createdAt: new Date().toISOString() };
      this.todos.set(id, t);
      return { status: 200, body: { todo: t } as unknown as Json };
    }
    const tm = p.match(/^\/api\/todos\/([^/]+)$/);
    if (tm && method === "POST") return this.todoAct(tm[1], String(body.action));
    if (method === "POST" && p === "/api/ask") return this.ask(String(body.message ?? ""), String(body.mode ?? "answer"));
    if (method === "POST" && p === "/api/sync") return { status: 200, body: { created: 0, errors: [], skipped: true } };
    return { status: 404, body: { error: "Not available in the demo" } };
  }
}

const ok = (n: NotificationDTO): Result => ({ status: 200, body: { notification: n } as unknown as Json });

/** A fetch that answers from the store. Pass it as ApiOptions.fetchImpl. */
export function createDemoFetch(store: DemoStore): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    let body: Json = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const r = store.handle(url, method, body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
