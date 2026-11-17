import { createClient } from "@supabase/supabase-js";
import {
  decideAction,
  renderMarkdownLite,
  streamChat,
  type ApiOptions,
  type ChatEvent,
  type PageContext,
  type PendingAction,
} from "@fluent/shared";

// Keep the Supabase session in chrome.storage so it survives the panel closing.
const storage = {
  getItem: async (k: string): Promise<string | null> => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: (k: string, v: string) => chrome.storage.local.set({ [k]: v }),
  removeItem: (k: string) => chrome.storage.local.remove(k),
};
const sb = createClient(__SUPABASE_URL__ || "http://invalid.local", __SUPABASE_ANON_KEY__ || "x", {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const api: ApiOptions = {
  baseUrl: __API_URL__,
  getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const root = document.getElementById("root")!;

type Item =
  | { k: "user"; text: string }
  | { k: "text"; text: string }
  | { k: "tool"; id: string; label: string; ok: boolean | null }
  | { k: "pending"; id: string };

const state = {
  items: [] as Item[],
  actions: new Map<string, PendingAction>(),
  drafts: new Map<string, { to: string; subject: string; body: string; editing: boolean }>(),
  busy: false,
  statusLabel: "",
  error: "",
  conversationId: undefined as string | undefined,
  includePage: true,
  tab: { title: "", url: "" },
};

// ---------- auth ----------
function renderAuth(message = "") {
  root.innerHTML = `
    <div class="auth">
      <div class="avatar" style="width:44px;height:44px;font-size:27px">F</div>
      <h1>Fluent</h1>
      <p class="muted">Sign in to chat about the deal on this page.</p>
      <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email"></div>
      <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password"></div>
      <div class="bad-t" role="alert">${esc(message)}</div>
      <button class="btn dark" id="go">Sign in</button>
      <p class="muted">No account yet? Create one in the Fluent web app, then sign in here.</p>
    </div>`;
  const go = async () => {
    const email = (document.getElementById("em") as HTMLInputElement).value;
    const password = (document.getElementById("pw") as HTMLInputElement).value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) renderAuth(error.message);
    else renderApp();
  };
  document.getElementById("go")!.addEventListener("click", go);
  document.getElementById("pw")!.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && go());
}

// ---------- page context ----------
async function readTab(): Promise<PageContext | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return null;
  state.tab = { title: tab.title ?? tab.url, url: tab.url };
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        title: document.title,
        text: (document.body?.innerText ?? "").slice(0, 20000),
        selection: String(getSelection() ?? "").slice(0, 2000),
      }),
    });
    return (res?.result as PageContext) ?? null;
  } catch {
    return null; // no activeTab access yet on this tab
  }
}

// ---------- rendering ----------
function renderLog() {
  const log = document.getElementById("log");
  if (!log) return;
  const parts: string[] = [];
  if (!state.items.length) {
    parts.push(`<div class="a"><p><b>What should we work on?</b></p><p class="muted">I can read this page, check your rate card and log the deal in Airtable.</p></div>
      <div class="chips"><button data-q="Is this a brand deal? Pull out the terms.">Pull out the terms</button><button data-q="Compare this offer to my rate card.">Check my rate card</button><button data-q="Draft a reply to this.">Draft a reply</button></div>`);
  }
  state.items.forEach((it, i) => {
    if (it.k === "user") parts.push(`<div class="u">${esc(it.text)}</div>`);
    else if (it.k === "text") parts.push(`<div class="a">${renderMarkdownLite(it.text)}</div>`);
    else if (it.k === "tool") {
      if (state.items[i - 1]?.k === "tool") return;
      let chips = "";
      for (let j = i; j < state.items.length && state.items[j].k === "tool"; j++) {
        const t = state.items[j] as Extract<Item, { k: "tool" }>;
        chips += `<span class="chip ${t.ok === true ? "ok" : t.ok === false ? "bad" : ""}">${t.ok === null ? "…" : t.ok ? "✓" : "!"} ${esc(t.label)}</span>`;
      }
      parts.push(`<div class="tools">${chips}</div>`);
    } else parts.push(renderApproval(it.id));
  });
  log.innerHTML = parts.join("");
  log.scrollTop = log.scrollHeight;
  log.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => b.addEventListener("click", () => send(b.dataset.q!)));
  log.querySelectorAll<HTMLElement>("[data-act]").forEach((b) => b.addEventListener("click", () => onAct(b.dataset.act!, b.dataset.id!)));
  log.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-edit]").forEach((el) =>
    el.addEventListener("input", () => {
      const d = state.drafts.get(el.dataset.id!);
      if (d) (d as any)[el.dataset.edit!] = el.value;
    }),
  );
}

function renderApproval(id: string): string {
  const a = state.actions.get(id);
  if (!a) return "";
  const d = state.drafts.get(id) ?? { ...a.payload, editing: false };
  state.drafts.set(id, d);
  const done = a.status !== "pending";
  const body = d.editing && !done
    ? `<div class="field"><label>To</label><input type="text" data-edit="to" data-id="${id}" value="${esc(d.to)}"></div>
       <div class="field"><label>Subject</label><input type="text" data-edit="subject" data-id="${id}" value="${esc(d.subject)}"></div>
       <div class="field"><label>Message</label><textarea data-edit="body" data-id="${id}">${esc(d.body)}</textarea></div>`
    : `<b>${esc(d.subject)}</b><div class="draft">${esc(d.body)}</div>`;
  const note =
    a.status === "executed" ? `<div class="ok-t">Sent.</div>`
    : a.status === "rejected" ? `<div class="muted">Dismissed. Nothing was sent.</div>`
    : a.status === "failed" ? `<div class="bad-t" role="alert">Couldn't send: ${esc(a.error ?? "unknown error")}</div>` : "";
  const buttons = done ? "" : `<div class="row">
      <button class="btn primary" data-act="approve" data-id="${id}">Send it</button>
      <button class="btn" data-act="edit" data-id="${id}">${d.editing ? "Done editing" : "Edit"}</button>
      <button class="btn ghost" data-act="reject" data-id="${id}">Dismiss</button></div>`;
  return `<div class="card"><div class="head"><span>Draft to ${esc(d.to)}</span><span>Gmail</span></div>${body}${note}${buttons}</div>`;
}

async function onAct(act: string, id: string) {
  const d = state.drafts.get(id);
  if (!d) return;
  if (act === "edit") {
    d.editing = !d.editing;
    renderLog();
    return;
  }
  try {
    const next = await decideAction(api, id, act === "approve" ? "approve" : "reject", act === "approve" ? { to: d.to, subject: d.subject, body: d.body } : undefined);
    state.actions.set(id, next);
  } catch (e) {
    state.error = e instanceof Error ? e.message : "Couldn't do that";
    renderStatus();
  }
  renderLog();
}

function renderStatus() {
  const el = document.getElementById("status");
  if (!el) return;
  el.innerHTML =
    (state.busy ? `<div class="status" role="status" aria-live="polite"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(state.statusLabel || "Thinking")}</span></div>` : "") +
    (state.error ? `<div class="bad-t" role="alert">${esc(state.error)}</div>` : "");
  const send = document.getElementById("send") as HTMLButtonElement | null;
  if (send) {
    send.innerHTML = state.busy ? "■" : "↑";
    send.setAttribute("aria-label", state.busy ? "Stop" : "Send");
  }
}

function renderCtx() {
  const el = document.getElementById("ctx");
  if (!el) return;
  el.className = `ctx ${state.includePage ? "" : "off"}`;
  el.innerHTML = `<span>${state.includePage ? "Reading: " : "Not reading: "}${esc(state.tab.title || "this tab")}</span>
    <label><input type="checkbox" id="inc" ${state.includePage ? "checked" : ""}> Include</label>`;
  document.getElementById("inc")!.addEventListener("change", (e) => {
    state.includePage = (e.target as HTMLInputElement).checked;
    renderCtx();
  });
}

// ---------- chat ----------
let abort: AbortController | null = null;
let step = 0;

function onEvent(e: ChatEvent) {
  if (e.type === "conversation") state.conversationId = e.conversationId;
  else if (e.type === "text") {
    const last = state.items[state.items.length - 1];
    if (last?.k === "text") last.text += e.delta;
    else state.items.push({ k: "text", text: e.delta });
    state.statusLabel = "";
  } else if (e.type === "tool_start") {
    step++;
    state.items.push({ k: "tool", id: e.id, label: e.label, ok: null });
    state.statusLabel = `${e.label} · step ${step}`;
  } else if (e.type === "tool_end") {
    const t = state.items.find((i) => i.k === "tool" && i.id === e.id) as Extract<Item, { k: "tool" }> | undefined;
    if (t) t.ok = e.ok;
    state.statusLabel = "";
  } else if (e.type === "pending") {
    state.actions.set(e.action.id, e.action);
    state.items.push({ k: "pending", id: e.action.id });
  } else if (e.type === "error") state.error = e.message;
  renderLog();
  renderStatus();
}

async function send(text: string) {
  if (state.busy || !text.trim()) return;
  state.busy = true;
  state.error = "";
  step = 0;
  state.items.push({ k: "user", text });
  renderLog();
  renderStatus();
  const context = state.includePage ? await readTab() : null;
  if (state.includePage && !context) state.error = "I can't read this tab yet. Click the Fluent icon on the page, or turn off Include.";
  abort = new AbortController();
  try {
    await streamChat(api, { conversationId: state.conversationId, message: text, ...(context ? { context } : {}) }, onEvent, abort.signal);
  } catch (e) {
    if ((e as Error).name !== "AbortError") state.error = "Connection lost. Try again.";
  } finally {
    abort = null;
    state.busy = false;
    renderStatus();
  }
}

async function renderApp() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return renderAuth();
  root.innerHTML = `
    <header>
      <div class="avatar" aria-hidden="true">F</div><b>Fluent</b>
      <button class="link" id="open">Open full chat</button>
      <button class="link" id="out">Sign out</button>
    </header>
    <div id="ctx" class="ctx"></div>
    <div id="log" aria-live="polite"></div>
    <footer>
      <div id="status"></div>
      <div class="composer">
        <label for="msg" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Message Fluent</label>
        <textarea id="msg" rows="1" placeholder="Ask about this page"></textarea>
        <button class="round" id="send" aria-label="Send">↑</button>
      </div>
    </footer>`;
  document.getElementById("open")!.addEventListener("click", () => chrome.tabs.create({ url: __API_URL__ }));
  document.getElementById("out")!.addEventListener("click", async () => {
    await sb.auth.signOut();
    Object.assign(state, { items: [], conversationId: undefined });
    state.actions.clear();
    renderAuth();
  });
  const ta = document.getElementById("msg") as HTMLTextAreaElement;
  const submit = () => {
    if (state.busy) return abort?.abort();
    const t = ta.value;
    ta.value = "";
    ta.style.height = "auto";
    send(t);
  };
  document.getElementById("send")!.addEventListener("click", submit);
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!state.busy) submit();
    }
  });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = { title: tabs[0]?.title ?? "", url: tabs[0]?.url ?? "" };
  chrome.tabs.onActivated.addListener(async () => {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = { title: t?.title ?? "", url: t?.url ?? "" };
    renderCtx();
  });
  chrome.tabs.onUpdated.addListener((_id, info, t) => {
    if (info.title && t.active) {
      state.tab = { title: t.title ?? "", url: t.url ?? "" };
      renderCtx();
    }
  });
  renderCtx();
  renderLog();
  renderStatus();
}

renderApp();
