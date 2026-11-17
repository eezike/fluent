import { useState, type ReactNode } from "react";
import type { Change, NotificationDTO, Source, Term } from "@fluent/shared";
import { Icon } from "./icons";
import { ago, cx, doneNote, eyebrow, look, opensDetail, pill, urgentWhen } from "./util";

export function Header({ inProgress, toReview }: { inProgress: number; toReview: number }) {
  return (
    <div className={cx("hdr")}>
      <span className={cx("logo")} aria-hidden="true">F</span>
      <div>
        <div className={cx("hn")}>Fluent</div>
        <div className={cx("hs")}><span className={cx("dot")} />{inProgress} in progress · {toReview} to review</div>
      </div>
    </div>
  );
}

export function Tabs({ tab, active, onTab }: { tab: "active" | "done"; active: number; onTab: (t: "active" | "done") => void }) {
  return (
    <div className={cx("tabs")} role="tablist" aria-label="Fluent sections">
      <button role="tab" aria-selected={tab === "active"} className={cx("tab", tab === "active" && "on")} onClick={() => onTab("active")}>Active {active}</button>
      <button role="tab" aria-selected={tab === "done"} className={cx("tab", tab === "done" && "on")} onClick={() => onTab("done")}>Done</button>
    </div>
  );
}

type CardOps = { primary: () => void; secondary: () => void };

export function Card({ n, selected, ops, busy, onOpen }: { n: NotificationDTO; selected?: boolean; ops: CardOps; busy: boolean; onOpen: () => void }) {
  const { icon, accent } = look(n);
  const eb = eyebrow(n);
  const showUrgent = n.urgency === "urgent" && n.status === "open";
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onOpen();
  };
  const isDone = n.status === "done" || n.status === "dismissed";
  const right = isDone ? "" : n.status === "running" ? "now" : ago(n.createdAt) === "now" ? "now" : ago(n.createdAt);
  return (
    <div className={cx("card")} role="button" tabIndex={0} style={selected ? { borderColor: "#191919", boxShadow: "0 0 0 1px #191919" } : undefined} onClick={open} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(e))}>
      <div className={cx("in")}>
        <span className={cx("tile")} style={{ color: accent }}><Icon name={icon} color={accent} /></span>
        <div className={cx("cb")}>
          {showUrgent && <div className={cx("urg")}><i />Urgent · {urgentWhen(n)}</div>}
          {eb && !showUrgent && <div className={cx("eb")}>{eb}</div>}
          <div className={cx("tl")}><b>{n.title}</b><span>{right}</span></div>
          <div className={cx("note")}>{isDone ? doneNote(n) : n.status === "running" ? (n.steps.find((s) => s.state === "todo")?.label ?? n.body) : n.body}</div>
          {n.status === "running" && <div className={cx("prog")}><i style={{ width: `${n.progress ?? 10}%` }} /></div>}
          {n.status === "running" && <div className={cx("row")}><button className={cx("btn", "k")} onClick={onOpen}>View details</button></div>}
          {n.status === "open" && n.primaryLabel && (
            <div className={cx("row")}>
              <button className={cx("btn", "k")} disabled={busy} onClick={ops.primary}>{n.primaryLabel}</button>
              {n.secondaryLabel && <button className={cx("btn")} disabled={busy} onClick={ops.secondary}>{n.secondaryLabel}</button>}
            </div>
          )}
          {isDone && n.resultTag && (
            <div className={cx("res")}><Icon name="check" size={13} sw={2.5} color="#5AB570" />{n.resultTag}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Banner({ message, onDo, onDismiss, busy }: { message: string; onDo: () => void; onDismiss: () => void; busy: boolean }) {
  return (
    <div className={cx("banner")}>
      <div className={cx("t")}><Icon name="target" size={13} />On this page</div>
      <div className={cx("m")}>{message}</div>
      <div className={cx("row")} style={{ marginTop: 10 }}>
        <button className={cx("btn", "k", "sm")} disabled={busy} onClick={onDo}>{busy ? "Reading…" : "Do it"}</button>
        <button className={cx("btn", "sm")} onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

export function AskBar({ value, onChange, onAnswer, onTask, busy }: { value: string; onChange: (v: string) => void; onAnswer: () => void; onTask: () => void; busy: boolean }) {
  const [focus, setFocus] = useState(false);
  const expanded = focus || value.length > 0;
  return (
    <div className={cx("ask", expanded && "f")}>
      <div className={cx("in")}>
        <input
          value={value}
          aria-label="Ask a question, or give a task"
          placeholder="Ask a question, or give a task…"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 160)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onTask()}
        />
        {expanded && (
          <>
            <button className={cx("btn")} disabled={busy || !value.trim()} onMouseDown={(e) => e.preventDefault()} onClick={onAnswer}>Answer</button>
            <button className={cx("btn", "k")} disabled={busy || !value.trim()} onMouseDown={(e) => e.preventDefault()} onClick={onTask}>Do it</button>
          </>
        )}
      </div>
    </div>
  );
}

export function Reply({ placeholder, onSend, disabled }: { placeholder: string; onSend: (t: string) => void; disabled?: boolean }) {
  const [v, setV] = useState("");
  const send = () => {
    if (!v.trim() || disabled) return;
    onSend(v.trim());
    setV("");
  };
  return (
    <div className={cx("cmp")}>
      <input value={v} aria-label="Reply" placeholder={placeholder} disabled={disabled} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
      <button className={cx("go")} aria-label="Send" disabled={disabled || !v.trim()} onClick={send}><Icon name="send" size={15} /></button>
    </div>
  );
}

function Collapsible({ title, open, onToggle, extra, children }: { title: string; open: boolean; onToggle: () => void; extra?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx("sec")}>
      <div className={cx("sh")}>
        <button onClick={onToggle} aria-expanded={open}>
          <span style={{ display: "flex", transform: `rotate(${open ? 0 : -90}deg)`, transition: "transform .15s" }}><Icon name="chev" size={12} sw={2.5} color="#A8A8A8" /></span>
          <span className={cx("l")}>{title}</span>
        </button>
        {open && extra}
      </div>
      {open && children}
    </div>
  );
}

export function ChangesBlock({ changes, note, open, onToggle, onFull, canExpand }: { changes: Change[]; note?: string; open: boolean; onToggle: () => void; onFull: () => void; canExpand: boolean }) {
  return (
    <Collapsible title="Changes" open={open} onToggle={onToggle} extra={canExpand ? <button className={cx("v")} onClick={onFull}>View full ↗</button> : undefined}>
      <div className={cx("diff")}>
        {changes.map((c, i) => (
          <div key={i} className={cx(c.kind === "old" ? "dr" : "dg")}>
            <b>{c.kind === "old" ? "–" : "+"}</b>
            <span>{c.text}</span>
          </div>
        ))}
      </div>
      {note && <div className={cx("dn")}>{note}</div>}
    </Collapsible>
  );
}

const GLYPH: Record<Source["app"], string> = { gmail: "G", sheets: "S", airtable: "A", calendar: "C", fluent: "F" };

export function SourcesBlock({ sources, title }: { sources: Source[]; title?: string }) {
  const [open, setOpen] = useState(title === "Based on");
  if (!sources.length) return null;
  return (
    <Collapsible title={title ? title : `Sources used · ${sources.length}`} open={open} onToggle={() => setOpen(!open)}>
      {sources.map((s, i) => (
        <div key={i} className={cx("src")}>
          <span className={cx("sg")}>{GLYPH[s.app]}</span>
          <div><div className={cx("sn")}>{s.name}</div><div className={cx("sm2")}>{s.meta}</div></div>
          <span className={cx("x")}>↗</span>
        </div>
      ))}
    </Collapsible>
  );
}

export function TermsBlock({ terms }: { terms: Term[] }) {
  const [open, setOpen] = useState(false);
  if (!terms.length) return null;
  return (
    <Collapsible title={`Terms found · ${terms.length}`} open={open} onToggle={() => setOpen(!open)}>
      <div className={cx("terms")}>
        {terms.map((t, i) => (
          <div key={i}>
            <div className={cx("k")}><span>{t.label}</span><span>{t.value}</span></div>
            {t.quote ? <i>“{t.quote.replace(/^["“”]|["“”]$/g, "")}”</i> : <i>Not quoted in the email</i>}
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

export function StepsBlock({ steps }: { steps: NotificationDTO["steps"] }) {
  if (!steps.length) return null;
  return (
    <div className={cx("steps")}>
      <div className={cx("t")}>Steps</div>
      {steps.map((s, i) => (
        <div key={i} className={cx("st", s.state !== "done" && "td")}>
          {s.state === "done" ? <span className={cx("ok")}><Icon name="check" size={9} sw={3.5} color="#fff" /></span> : <span className={cx("em")} />}
          <span className={cx("x")}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Thread({ items }: { items: NotificationDTO["thread"] }) {
  return (
    <>
      {items.map((m, i) => (
        <div key={i} className={cx("bub", m.role === "user" && "me")}><div>{m.text}</div></div>
      ))}
    </>
  );
}

export { pill, opensDetail };
