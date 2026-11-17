"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiGet, streamChat, type ChatEvent, type ConversationSummary, type PendingAction, type UiItem } from "@fluent/shared";
import { api, supabase } from "@/lib/supabase-browser";
import { Auth } from "./Auth";
import { Chat, type ChatState } from "./Chat";
import { Ideas } from "./Ideas";
import { ConnectorsSheet } from "./ConnectorsSheet";
import { MenuIcon, PlugIcon } from "./Icons";

const EMPTY: ChatState = { items: [], actions: {}, busy: false, status: null, error: null };

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<"chat" | "ideas">("ideas");
  const [chat, setChat] = useState<ChatState>(EMPTY);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [menu, setMenu] = useState(false);
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [connectors, setConnectors] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stepRef = useRef(0);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Return from Google OAuth.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected") === "google") {
      setNotice("Google connected.");
      setConnectors(true);
    } else if (q.get("connect_error")) setNotice(q.get("connect_error"));
    if (q.has("connected") || q.has("connect_error")) window.history.replaceState({}, "", "/");
  }, []);

  const refreshConvs = useCallback(() => {
    apiGet<{ conversations: ConversationSummary[] }>(api, "/api/conversations")
      .then((r) => setConvs(r.conversations))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (session) refreshConvs();
  }, [session, refreshConvs]);

  const onEvent = useCallback((e: ChatEvent) => {
    setChat((s) => {
      switch (e.type) {
        case "conversation":
          setConversationId(e.conversationId);
          return s;
        case "text": {
          const last = s.items[s.items.length - 1];
          const items: UiItem[] =
            last && last.kind === "text"
              ? [...s.items.slice(0, -1), { kind: "text", text: last.text + e.delta }]
              : [...s.items, { kind: "text", text: e.delta }];
          return { ...s, items, status: null };
        }
        case "tool_start":
          stepRef.current += 1;
          return {
            ...s,
            items: [...s.items, { kind: "tool", id: e.id, name: e.name, label: e.label, ok: null }],
            status: { label: e.label, step: stepRef.current },
          };
        case "tool_end":
          return {
            ...s,
            items: s.items.map((i) => (i.kind === "tool" && i.id === e.id ? { ...i, ok: e.ok } : i)),
            status: null,
          };
        case "pending":
          return {
            ...s,
            actions: { ...s.actions, [e.action.id]: e.action },
            items: [...s.items, { kind: "pending", actionId: e.action.id }],
          };
        case "error":
          return { ...s, error: e.message, status: null };
        case "done":
          return { ...s, status: null };
      }
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      setTab("chat");
      stepRef.current = 0;
      setChat((s) => ({ ...s, busy: true, error: null, items: [...s.items, { kind: "user", text }] }));
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        await streamChat(api, { conversationId, message: text }, onEvent, ctrl.signal);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setChat((s) => ({ ...s, error: "Connection lost. Try again." }));
      } finally {
        abortRef.current = null;
        setChat((s) => ({ ...s, busy: false, status: null }));
        refreshConvs();
      }
    },
    [conversationId, onEvent, refreshConvs],
  );

  async function openConversation(id: string) {
    setMenu(false);
    setTab("chat");
    setConversationId(id);
    setChat({ ...EMPTY, busy: true });
    try {
      const r = await apiGet<{ items: UiItem[]; actions: PendingAction[] }>(api, `/api/conversations/${id}`);
      setChat({ ...EMPTY, items: r.items, actions: Object.fromEntries(r.actions.map((a) => [a.id, a])) });
    } catch (e) {
      setChat({ ...EMPTY, error: e instanceof Error ? e.message : "Couldn't open that chat" });
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setConversationId(undefined);
    setChat(EMPTY);
    setTab("chat");
    setMenu(false);
  }

  if (session === undefined) return <div className="center">Loading…</div>;
  if (!session) return <Auth />;

  const name = (session.user.user_metadata?.name as string | undefined) || undefined;

  return (
    <div className="app">
      <header className="hdr">
        <button className="icon-btn" aria-label="Open menu" onClick={() => setMenu(true)}><MenuIcon /></button>
        <nav className="tabs" role="tablist" aria-label="Sections">
          <button className="tab" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>Chat</button>
          <button className="tab" role="tab" aria-selected={tab === "ideas"} onClick={() => setTab("ideas")}>Ideas</button>
        </nav>
        <button className="pill-btn" aria-label="Connectors" onClick={() => setConnectors(true)}>
          <PlugIcon /> <span className="hide-sm">Connectors</span>
        </button>
      </header>

      {notice && (
        <div className="err" style={{ textAlign: "center", color: notice.includes("connected") ? "var(--accent)" : "var(--danger)" }} role="status">
          {notice} <button className="btn ghost" style={{ minHeight: 44 }} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {tab === "ideas" ? (
        <Ideas name={name} onPick={(p) => (p === "__connectors__" ? setConnectors(true) : send(p))} />
      ) : (
        <>
          {chat.busy || chat.items.length > 0 ? (
            <div className="who" style={{ justifyContent: "center", padding: "0 16px 4px" }}>
              <span className="avatar" aria-hidden>F</span>
              <div>
                <b>Fluent</b>
                <small>{chat.busy ? <><span className="dot" />Working</> : "Ready"}</small>
              </div>
            </div>
          ) : null}
          <Chat
            state={chat}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            onAction={(a) => setChat((s) => ({ ...s, actions: { ...s.actions, [a.id]: a } }))}
            onOpenConnectors={() => setConnectors(true)}
          />
        </>
      )}

      {menu && (
        <>
          <div className="overlay" style={{ zIndex: 55 }} onClick={() => setMenu(false)} />
          <aside className="drawer" aria-label="Menu">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 28 }}>Fluent</div>
              <button className="btn" onClick={newChat}>New chat</button>
            </div>
            <div className="eyebrow">Recent</div>
            <div className="list">
              {convs.length === 0 && <p className="help">No chats yet.</p>}
              {convs.map((c) => (
                <button key={c.id} className="item" aria-current={c.id === conversationId} onClick={() => openConversation(c.id)}>{c.title}</button>
              ))}
            </div>
            <div className="help" style={{ wordBreak: "break-all" }}>{session.user.email}</div>
            <button className="btn" onClick={() => supabase().auth.signOut()}>Sign out</button>
          </aside>
        </>
      )}

      {connectors && <ConnectorsSheet onClose={() => setConnectors(false)} onChanged={() => {}} />}
    </div>
  );
}
