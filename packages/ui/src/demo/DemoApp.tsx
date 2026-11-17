import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiOptions } from "@fluent/shared";
import { FluentApp } from "../FluentApp";
import { Icon } from "../icons";
import { cx } from "../util";
import { DemoStore, createDemoFetch } from "./mockApi";
import { CHAPTERS, STEPS, firstStepOf, type Ctx } from "./script";

type Phase = "launch" | "run" | "end";
type Mode = "guided" | "free" | "auto";
type Rect = { x: number; y: number; w: number; h: number };

const CAP_W = 330;
const CAP_H = 172;

function place(rect: Rect | null, W: number, H: number): { left: number; top: number } {
  const maxTop = Math.max(12, H - CAP_H - 84);
  const clampTop = (t: number) => Math.min(Math.max(12, t), maxTop);
  if (!rect) return { left: Math.max(12, (W - CAP_W) / 2), top: clampTop(H * 0.28) };
  if (rect.x + rect.w + 16 + CAP_W <= W - 12) return { left: rect.x + rect.w + 16, top: clampTop(rect.y) };
  if (rect.x - 16 - CAP_W >= 12) return { left: rect.x - 16 - CAP_W, top: clampTop(rect.y) };
  const below = rect.y + rect.h + 14;
  const left = Math.min(Math.max(12, rect.x), Math.max(12, W - CAP_W - 12));
  if (below <= maxTop) return { left, top: below };
  return { left, top: clampTop(rect.y - CAP_H - 14) };
}

export type DemoAppProps = {
  onExit: () => void;
  /** The end card's main button. Defaults to onExit. */
  onStartOwn?: () => void;
};

export function DemoApp({ onExit, onStartOwn }: DemoAppProps) {
  const store = useRef(new DemoStore()).current;
  const api = useMemo<ApiOptions>(() => ({ baseUrl: "", getToken: async () => null, fetchImpl: createDemoFetch(store) }), [store]);
  const [phase, setPhase] = useState<Phase>("launch");
  const [mode, setMode] = useState<Mode>("guided");
  const [idx, setIdx] = useState(0);
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const [wide, setWide] = useState(true);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const stage = useRef<HTMLDivElement>(null);
  const token = useRef(0);

  useEffect(() => {
    const f = () => setWide(window.innerWidth >= 900);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const makeCtx = useCallback(
    (instant: boolean, mine: number): Ctx => {
      const alive = () => token.current === mine;
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, instant ? Math.min(ms, 40) : ms));
      return {
        store,
        instant,
        alive,
        has: (sel) => !!document.querySelector(sel),
        click: (sel) => (document.querySelector(sel) as HTMLElement | null)?.click(),
        sleep,
        waitFor: async (sel, ms = 3000) => {
          const end = Date.now() + ms;
          while (Date.now() < end && alive()) {
            if (document.querySelector(sel)) return true;
            await new Promise((r) => setTimeout(r, 50));
          }
          return !!document.querySelector(sel);
        },
        type: async (sel, text) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) return;
          const set = (v: string) => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
          };
          el.focus();
          if (instant) return set(text);
          for (let i = 1; i <= text.length && alive(); i++) {
            set(text.slice(0, i));
            await new Promise((r) => setTimeout(r, 32));
          }
        },
      };
    },
    [store],
  );

  /** Jump anywhere by starting fresh and quietly replaying the steps before it. */
  const goTo = useCallback(
    async (i: number) => {
      const mine = ++token.current;
      setBusy(true);
      store.reset();
      store.stepMs = 0;
      setRunId((r) => r + 1);
      await new Promise((r) => setTimeout(r, 220));
      const c = makeCtx(true, mine);
      for (let k = 0; k < i && c.alive(); k++) await STEPS[k].enter?.(c);
      if (!c.alive()) return;
      store.stepMs = 1100;
      setBusy(false);
      setIdx(i);
      setReady(false);
      await STEPS[i].enter?.(makeCtx(false, mine));
      if (token.current === mine) setReady(true);
    },
    [makeCtx, store],
  );

  const next = useCallback(async () => {
    if (busy) return;
    if (idx >= STEPS.length - 1) {
      token.current++;
      setPlaying(false);
      setPhase("end");
      return;
    }
    const mine = ++token.current;
    setIdx(idx + 1);
    setReady(false);
    await STEPS[idx + 1].enter?.(makeCtx(false, mine));
    if (token.current === mine) setReady(true);
  }, [busy, idx, makeCtx]);

  const back = useCallback(() => {
    if (busy || idx === 0) return;
    setPlaying(false);
    void goTo(idx - 1);
  }, [busy, idx, goTo]);

  const start = useCallback(
    (m: Mode) => {
      setMode(m);
      setPhase("run");
      setPlaying(m === "auto");
      if (m === "free") {
        token.current++;
        store.reset();
        store.arrive();
        setBusy(false);
        setRunId((r) => r + 1);
      } else void goTo(0);
    },
    [goTo, store],
  );

  // Auto-play: wait on each step, then move on.
  useEffect(() => {
    if (phase !== "run" || !playing || busy || !ready || mode === "free") return;
    const t = setTimeout(() => void next(), STEPS[idx].dwell);
    return () => clearTimeout(t);
  }, [phase, playing, busy, ready, mode, idx, next]);

  // Follow the spotlight target as the layout changes.
  const target = phase === "run" && mode !== "free" && !busy ? STEPS[idx]?.target : undefined;
  useEffect(() => {
    if (!target) return setRect(null);
    let scrolled = false;
    const tick = () => {
      const st = stage.current;
      const el = document.querySelector(target) as HTMLElement | null;
      if (!st) return;
      const s = st.getBoundingClientRect();
      setSize((o) => (o.w === s.width && o.h === s.height ? o : { w: s.width, h: s.height }));
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      if (!scrolled && (r.top < s.top || r.bottom > s.bottom)) {
        scrolled = true;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      const next: Rect = { x: Math.round(r.left - s.left), y: Math.round(r.top - s.top), w: Math.round(r.width), h: Math.round(r.height) };
      setRect((o) => (o && o.x === next.x && o.y === next.y && o.w === next.w && o.h === next.h ? o : next));
    };
    tick();
    const t = setInterval(tick, 120);
    return () => clearInterval(t);
  }, [target, idx, runId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (e.key === "Escape") onExit();
      if (phase !== "run" || mode === "free" || typing) return;
      if (e.key === "ArrowRight") void next();
      if (e.key === "ArrowLeft") back();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, mode, next, back, onExit]);

  useEffect(() => () => void token.current++, []);

  const strip = (
    <div className={cx("dm-strip")}>
      <b>DEMO</b>
      Sample data · nothing is connected or sent
      <button className={cx("dm-ex")} onClick={onExit}>Esc to exit</button>
    </div>
  );

  if (phase === "launch")
    return (
      <div className={cx("root", "dm")}>
        {strip}
        <div className={cx("dm-center")}>
          <div className={cx("dm-box")}>
            <span className={cx("logo")} style={{ width: 44, height: 44, fontSize: 22, borderRadius: 12, marginBottom: 20 }} aria-hidden="true">F</span>
            <h1>See Fluent work</h1>
            <p className={cx("dm-sub")}>A 90-second walkthrough on sample data. Fluent finds a deal, prepares the work, and waits for your approval.</p>
            <div className={cx("dm-chaps")}>
              {CHAPTERS.map((c, i) => (
                <div key={c.name} className={cx("dm-chap")}>
                  <span className={cx("dm-num")}>{i + 1}</span>
                  <b>{c.long}</b>
                  <span className={cx("dm-t")}>{c.secs}s</span>
                </div>
              ))}
            </div>
            <div className={cx("dm-row")}>
              <button className={cx("btn", "k", "dm-big")} style={{ flex: 1 }} onClick={() => start("guided")}>Start guided demo</button>
              <button className={cx("btn", "dm-big")} onClick={() => start("free")}>Free play</button>
              <button className={cx("btn", "dm-big")} onClick={() => start("auto")}>Auto-play</button>
            </div>
            <p className={cx("dm-fine")}>Guided: you click Next. Auto-play: hands-free, with captions. Free play: no captions.</p>
          </div>
        </div>
      </div>
    );

  if (phase === "end")
    return (
      <div className={cx("root", "dm")}>
        {strip}
        <div className={cx("dm-center")}>
          <div className={cx("dm-box")} style={{ textAlign: "center" }}>
            <span className={cx("logo")} style={{ width: 44, height: 44, fontSize: 22, borderRadius: 12, margin: "0 auto 20px" }} aria-hidden="true">F</span>
            <h1>That’s Fluent</h1>
            <p className={cx("dm-sub")}>It found the deal, checked it against your history, prepared the work, and waited for your approval.</p>
            <div className={cx("dm-recap")}>
              {["Spotted offers and late payments", "Caught a low rate and an exclusivity clash", "Prepared drafts, calendar entries and records", "Sent nothing without your approval"].map((t) => (
                <div key={t} className={cx("dm-chap")}>
                  <span className={cx("ok")}><Icon name="check" size={9} sw={3.5} color="#fff" /></span>
                  <b>{t}</b>
                </div>
              ))}
            </div>
            <div className={cx("dm-row")} style={{ justifyContent: "center" }}>
              <button className={cx("btn", "k", "dm-big")} onClick={onStartOwn ?? onExit}>Start with your own inbox</button>
              <button className={cx("btn", "dm-big")} onClick={() => start("guided")}>Replay</button>
              <button className={cx("btn", "dm-big")} onClick={onExit}>Exit demo</button>
            </div>
          </div>
        </div>
      </div>
    );

  const step = STEPS[idx];
  const guided = mode !== "free";
  const cap = guided && !busy ? place(rect, size.w, size.h) : null;

  return (
    <div className={cx("root", "dm")}>
      {strip}
      <div className={cx("dm-stage")} ref={stage}>
        <FluentApp key={runId} api={api} layout={wide ? "split" : "panel"} autoSelect={false} pollMs={{ idle: 700, busy: 400 }} />
        {guided && <div className={cx("dm-block")} />}
        {guided && !busy && rect && <div className={cx("dm-spot")} style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />}
        {guided && !busy && cap && (
          <div className={cx("dm-cap")} style={{ left: cap.left, top: cap.top }} role="status" aria-live="polite">
            <div className={cx("dm-n")}>{idx + 1} of {STEPS.length}</div>
            <b>{step.title}</b>
            <p>{step.body}</p>
            <div className={cx("dm-r")}>
              <button className={cx("btn")} onClick={back} disabled={idx === 0}>Back</button>
              <button className={cx("btn", "k")} onClick={() => void next()}>{idx === STEPS.length - 1 ? "Finish" : "Next"}</button>
              <button className={cx("dm-sk")} onClick={() => void goTo(firstStepOf(Math.min(step.chapter + 1, CHAPTERS.length)))} disabled={step.chapter === CHAPTERS.length}>Skip chapter</button>
            </div>
          </div>
        )}
        <div className={cx("dm-bar")}>
          {guided ? (
            <>
              <button className={cx("dm-ic")} aria-label="Back" onClick={back}><Icon name="left" size={16} /></button>
              <button className={cx("dm-ic")} aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
                {playing ? <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z" /></svg>}
              </button>
              <button className={cx("dm-ic")} aria-label="Next" onClick={() => void next()}><Icon name="send" size={16} /></button>
              <span className={cx("dm-sep")} />
              {CHAPTERS.map((c, i) => (
                <button key={c.name} className={cx("dm-c", step.chapter === i + 1 && "on", step.chapter > i + 1 && "dn")} onClick={() => void goTo(firstStepOf(i + 1))}>{i + 1} {c.name}</button>
              ))}
              <span className={cx("dm-sep")} />
            </>
          ) : (
            <button className={cx("dm-c")} onClick={() => start("free")}>Restart</button>
          )}
          <button className={cx("dm-c")} onClick={onExit}>Exit</button>
        </div>
      </div>
    </div>
  );
}
