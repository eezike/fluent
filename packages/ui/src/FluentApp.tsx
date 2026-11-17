import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiGet, apiSend, type ApiOptions, type NotificationDTO, type NotificationList, type PageContext, type PageSuggestion, type TodoDTO, type TodoList } from "@fluent/shared";
import { AskBar, Banner, Card, Header, Tabs, type TabId } from "./parts";
import { TodoView } from "./Todo";
import { SetupCard, type SetupProps } from "./Setup";
import { Detail } from "./Detail";
import { cx, opensDetail } from "./util";

export type FluentAppProps = {
  api: ApiOptions;
  layout: "panel" | "split";
  /** The extension passes this so Fluent can offer to process the page you're on. */
  getPage?: () => Promise<PageContext | null>;
  topRight?: ReactNode;
  /** Pick the first item automatically on wide screens. The demo turns this off. */
  autoSelect?: boolean;
  /** How often to refresh, in ms. The demo polls faster so changes show up quickly. */
  pollMs?: { idle: number; busy: number };
  /** Web only: the "finish setting up" card at the top of Active. */
  setup?: SetupProps | null;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function FluentApp({ api, layout, getPage, topRight, autoSelect = true, pollMs = { idle: 8000, busy: 2500 }, setup }: FluentAppProps) {
  const [tab, setTab] = useState<TabId>("active");
  const [todos, setTodos] = useState<TodoList | null>(null);
  const [data, setData] = useState<NotificationList | null>(null);
  const [detail, setDetail] = useState<NotificationDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState("");
  const [toast, setToast] = useState("");
  const [sugg, setSugg] = useState<{ url: string; s: NonNullable<PageSuggestion>; page: PageContext } | null>(null);
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const checkedUrl = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((m: string) => {
    clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, td] = await Promise.all([
        apiGet<NotificationList>(api, `/api/notifications?tab=${tab === "done" ? "done" : "active"}`),
        apiGet<TodoList>(api, "/api/todos").catch(() => null),
      ]);
      setData(list);
      if (td) setTodos(td);
      setErr(null);
    } catch (e) {
      setErr(msg(e));
    }
  }, [api, tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const anyRunning = !!data?.items.some((i) => i.status === "running") || detail?.status === "running";
  useEffect(() => {
    const t = setInterval(() => {
      refresh();
      if (detail) apiGet<{ notification: NotificationDTO }>(api, `/api/notifications/${detail.id}`).then((r) => setDetail(r.notification)).catch(() => {});
    }, anyRunning ? pollMs.busy : pollMs.idle);
    return () => clearInterval(t);
  }, [refresh, anyRunning, detail?.id, api, pollMs.busy, pollMs.idle]);

  // Near-real-time: ask the server to check mail whenever the app opens or comes back into view.
  useEffect(() => {
    const run = () => apiSend(api, "/api/sync", "POST", {}).then(() => refresh()).catch(() => {});
    run();
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", run);
    };
  }, [api, refresh]);

  // "On this page" (extension only).
  useEffect(() => {
    if (!getPage) return;
    let alive = true;
    const check = async () => {
      try {
        const page = await getPage();
        if (!alive || !page) return;
        if (checkedUrl.current === page.url) return;
        checkedUrl.current = page.url;
        const r = await apiSend<{ suggestion: PageSuggestion }>(api, "/api/page/suggest", "POST", { url: page.url, title: page.title, text: page.text });
        if (alive) setSugg(r.suggestion ? { url: page.url, s: r.suggestion, page } : null);
      } catch {
        // page checks are best effort
      }
    };
    check();
    const t = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api, getPage]);

  const items = data?.items ?? [];
  const counts = data?.counts ?? { active: 0, done: 0, toReview: 0, inProgress: 0, urgent: 0 };

  // On wide screens the right pane always shows something.
  useEffect(() => {
    if (autoSelect && layout === "split" && tab !== "todo" && !detail && items.length) setDetail(items[0]);
  }, [autoSelect, layout, items, detail, tab]);

  const patch = useCallback((n: NotificationDTO) => {
    setDetail((d) => (d && d.id === n.id ? n : d));
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === n.id ? n : i)) } : d));
  }, []);

  const guarded = useCallback(async (fn: () => Promise<void>, onFail?: (m: string) => void) => {
    setBusy(true);
    setActErr(null);
    try {
      await fn();
    } catch (e) {
      (onFail ?? setActErr)(msg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const act = useCallback(
    (n: NotificationDTO, body: object, okMsg?: string) =>
      guarded(async () => {
        const r = await apiSend<{ notification: NotificationDTO }>(api, `/api/notifications/${n.id}/act`, "POST", body);
        patch(r.notification);
        if (okMsg) flash(okMsg);
        await refresh();
      }, (m) => { setActErr(m); flash(m); }),
    [api, guarded, patch, flash, refresh],
  );

  const open = useCallback((n: NotificationDTO) => {
    setActErr(null);
    setDetail(n);
  }, []);

  const ops = (n: NotificationDTO) => ({
    primary: () => {
      if (n.type === "ask_source_of_truth") return act(n, { action: "answer", choice: "airtable" }, "Using Airtable.");
      if (opensDetail(n)) return open(n);
      return act(n, { action: "approve" }, n.type === "payment_overdue" ? "Sending…" : "Running…");
    },
    secondary: () => {
      if (n.type === "ask_source_of_truth") return act(n, { action: "answer", choice: "sheets" }, "Using Sheets.");
      if (n.secondaryLabel === "Snooze") return act(n, { action: "snooze" }, "Snoozed for a day.");
      if (n.secondaryLabel === "Refine") return open(n);
      return act(n, { action: "dismiss" }, "Dismissed.");
    },
  });

  const submitAsk = (mode: "answer" | "task") =>
    guarded(async () => {
      const text = ask.trim();
      if (!text) return;
      const r = await apiSend<{ notification: NotificationDTO }>(api, "/api/ask", "POST", { message: text, mode });
      setAsk("");
      setTab(mode === "answer" ? "done" : "active");
      setDetail(r.notification);
      flash(mode === "answer" ? "Answered. No task created." : "Task started. Tracking it.");
    }, (m) => flash(m));

  const process = () =>
    guarded(async () => {
      if (!sugg) return;
      setReading(true);
      try {
        const r = await apiSend<{ notification: NotificationDTO }>(api, "/api/page/process", "POST", { url: sugg.page.url, title: sugg.page.title, text: sugg.page.text });
        setSugg(null);
        setTab("active");
        setDetail(r.notification);
        await refresh();
      } finally {
        setReading(false);
      }
    }, (m) => flash(m));

  const refine = (text: string) =>
    guarded(async () => {
      if (!detail) return;
      if (detail.type === "answer") {
        const r = await apiSend<{ notification: NotificationDTO }>(api, "/api/ask", "POST", { message: `${detail.title}\n\nFollow-up: ${text}`, mode: "answer" });
        setDetail(r.notification);
        return;
      }
      const r = await apiSend<{ notification: NotificationDTO }>(api, `/api/notifications/${detail.id}/refine`, "POST", { message: text });
      patch(r.notification);
    });

  const todoAct = (t: TodoDTO, action: string, okMsg?: string) =>
    guarded(async () => {
      const r = await apiSend<{ todo: TodoDTO; notification?: NotificationDTO }>(api, `/api/todos/${t.id}`, "POST", { action });
      if (okMsg) flash(okMsg);
      if (r.notification) {
        setTab("active");
        setDetail(r.notification);
      }
      await refresh();
    }, (m) => flash(m));

  const addTodo = (title: string, dueDate?: string) =>
    guarded(async () => {
      await apiSend(api, "/api/todos", "POST", { title, dueDate });
      await refresh();
    }, (m) => flash(m));

  const openTask = (id: string) =>
    guarded(async () => {
      const r = await apiGet<{ notification: NotificationDTO }>(api, `/api/notifications/${id}`);
      setTab(r.notification.status === "done" ? "done" : "active");
      setDetail(r.notification);
    }, (m) => flash(m));

  const showBanner = !!sugg && !dismissedUrls.has(sugg.url) && tab === "active";
  const banner = showBanner ? <Banner message={sugg!.s.message} busy={reading} onDo={process} onDismiss={() => setDismissedUrls((s) => new Set(s).add(sugg!.url))} /> : null;

  const hint = useMemo(
    () => (tab === "active" ? { t: "All clear", s: "New offers, late payments and questions will show up here." } : { t: "Nothing yet", s: "Finished work shows up here." }),
    [tab],
  );

  const listBody = (
    <div className={cx("scr")}>
      {tab === "active" && setup && <SetupCard {...setup} />}
      {banner}
      {err && <div className={cx("err")} role="alert">{err}</div>}
      {data && items.length === 0 && !banner && <div className={cx("hint")}><b>{hint.t}</b>{hint.s}</div>}
      {!data && !err && <div className={cx("hint")}>Loading…</div>}
      {items.map((n) => (
        <Card key={n.id} n={n} selected={layout === "split" && detail?.id === n.id} busy={busy} ops={ops(n)} onOpen={() => open(n)} />
      ))}
    </div>
  );

  const header = <Header inProgress={counts.inProgress} toReview={counts.toReview} />;
  const tabs = <Tabs tab={tab} active={counts.active} todo={todos?.open.length ?? 0} onTab={(t) => { setTab(t); setDetail(null); }} />;
  const toastEl = toast ? <div className={cx("toast")} role="status">{toast}</div> : null;

  const detailEl = detail ? (
    <Detail
      n={detail}
      busy={busy}
      error={actErr}
      onBack={layout === "panel" ? () => setDetail(null) : undefined}
      onApprove={(edits) => act(detail, { action: "approve", edits }, "Approved. Working on it.")}
      onDismiss={() => act(detail, { action: "dismiss" }, "Dismissed.").then(() => layout === "panel" && setDetail(null))}
      onAnswer={(choice) => act(detail, { action: "answer", choice }, "Got it.")}
      onRefine={refine}
      onConvert={() => act(detail, { action: "convert" }).then(() => setTab("active"))}
    />
  ) : null;

  const todoBody = (
    <TodoView
      open={todos?.open ?? []}
      suggested={todos?.suggested ?? []}
      loaded={!!todos}
      busy={busy}
      onAdd={addTodo}
      onDone={(t) => todoAct(t, "done", "Done. Nice.")}
      onAccept={(t) => todoAct(t, "accept", "Added to your list.")}
      onNotNow={(t) => todoAct(t, "dismiss")}
      onDelegate={(t) => todoAct(t, "delegate", "Fluent is on it.")}
      onOpenTask={openTask}
    />
  );
  const body = tab === "todo" ? todoBody : listBody;

  const composer = tab === "active" ? <AskBar value={ask} onChange={setAsk} busy={busy} onAnswer={() => submitAsk("answer")} onTask={() => submitAsk("task")} /> : null;

  if (layout === "panel") {
    return (
      <div className={cx("root")}>
        <div className={cx("pop")} style={{ display: "flex", flexDirection: "column" }}>
          {header}
          {tabs}
          {detailEl ? <div className={cx("body")}>{detailEl}</div> : <div className={cx("body")}>{body}{composer}</div>}
          {toastEl}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("root")}>
      <div className={cx("split")}>
        <div className={cx("pop")} style={{ display: "flex", flexDirection: "column" }}>
          {header}
          {tabs}
          <div className={cx("body")}>{body}{composer}</div>
        </div>
        <div className={cx("pane")}>
          <div className={cx("topbar")}>{topRight}</div>
          {detailEl ?? <div className={cx("empty-pane")}>Select something on the left.</div>}
          {toastEl}
        </div>
      </div>
    </div>
  );
}
