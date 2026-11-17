import { useEffect, useState } from "react";
import type { NotificationDTO, PlannedAction } from "@fluent/shared";
import { Icon } from "./icons";
import { ChangesBlock, Reply, SourcesBlock, StepsBlock, TermsBlock, Thread } from "./parts";
import { cx, look, pill } from "./util";

type Edits = Record<string, Record<string, string>>;

export type DetailProps = {
  n: NotificationDTO;
  busy: boolean;
  error: string | null;
  onBack?: () => void;
  onApprove: (edits: Edits) => void;
  onDismiss: () => void;
  onAnswer: (choice: string) => void;
  onRefine: (text: string) => void;
  onConvert: () => void;
};

const isMail = (a: PlannedAction) => a.kind === "gmail.draft" || a.kind === "gmail.send";

export function Detail(p: DetailProps) {
  const { n } = p;
  const [changesOpen, setChangesOpen] = useState(true);
  const [full, setFull] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const { icon, accent } = look(n);
  const pl = pill(n);
  const mails = n.actions.filter(isMail);
  const open = n.status === "open";

  // A different notification, or the server rewriting a draft after "refine", resets local edits.
  useEffect(() => {
    setEdits({});
    setFull(false);
  }, [n.id]);
  useEffect(() => {
    setEdits({});
  }, [n.thread.length]);

  const field = (a: PlannedAction, k: "to" | "subject" | "body") => edits[a.id]?.[k] ?? String(a.params[k] ?? "");
  const setField = (a: PlannedAction, k: string, v: string) => setEdits((e) => ({ ...e, [a.id]: { ...e[a.id], [k]: v } }));

  const isAnswer = n.type === "answer";
  const placeholder = isAnswer ? "Ask a follow-up…" : "Reply or refine this task…";
  const canReply = isAnswer || open;

  return (
    <>
      {p.onBack && (
        <button className={cx("back")} onClick={p.onBack}><Icon name="left" size={15} />Back</button>
      )}
      <div className={cx("det")}>
        <div className={cx("dh")}>
          <span className={cx("tile")} style={{ color: accent }}><Icon name={icon} color={accent} /></span>
          <div style={{ flex: 1 }}>
            <div className={cx("dt")}>{n.title}</div>
            <span className={cx("pill", pl.cls)}>{pl.text}</span>
          </div>
        </div>

        {isAnswer ? (
          <>
            <div className={cx("ans")}>{n.answer}</div>
            <div style={{ marginTop: 12 }}><SourcesBlock sources={n.sources} title="Based on" /></div>
            <div className={cx("tip")}>I answered from your data, so nothing changed and there’s no task to track. Want me to act on it?</div>
            <button className={cx("btn", "wide")} disabled={p.busy} onClick={p.onConvert}>Turn this into a task</button>
          </>
        ) : (
          <>
            {n.error && <div className={cx("err")} role="alert">{n.error}</div>}
            {n.changes.length > 0 && (
              <ChangesBlock changes={n.changes} note={n.changeNote} open={changesOpen} onToggle={() => setChangesOpen(!changesOpen)} canExpand={open && mails.length > 0} onFull={() => { setChangesOpen(true); setFull((f) => !f); }} />
            )}
            {full && open && mails.map((a) => (
              <div key={a.id} className={cx("edit")}>
                <label htmlFor={`to-${a.id}`}>To</label>
                <input id={`to-${a.id}`} value={field(a, "to")} onChange={(e) => setField(a, "to", e.target.value)} />
                <label htmlFor={`su-${a.id}`}>Subject</label>
                <input id={`su-${a.id}`} value={field(a, "subject")} onChange={(e) => setField(a, "subject", e.target.value)} />
                <label htmlFor={`bo-${a.id}`}>Message</label>
                <textarea id={`bo-${a.id}`} value={field(a, "body")} onChange={(e) => setField(a, "body", e.target.value)} />
              </div>
            ))}
            <SourcesBlock sources={n.sources} />
            <TermsBlock terms={n.terms} />
            <StepsBlock steps={n.steps} />
            <Thread items={n.thread} />
          </>
        )}
        {p.error && <div className={cx("err")} role="alert">{p.error}</div>}
      </div>

      <div className={cx("bot")}>
        {open && !isAnswer && (
          <div className={cx("acts")}>
            {n.options ? (
              n.options.map((o, i) => (
                <button key={o.value} className={cx("btn", i === 0 && "k")} disabled={p.busy} onClick={() => p.onAnswer(o.value)}>{o.label}</button>
              ))
            ) : (
              <>
                <button className={cx("btn", "k")} disabled={p.busy} onClick={() => p.onApprove(edits)}>{n.detailPrimaryLabel ?? "Approve"}</button>
                <button className={cx("btn")} disabled={p.busy} onClick={p.onDismiss}>Dismiss</button>
              </>
            )}
          </div>
        )}
        <Reply placeholder={placeholder} onSend={p.onRefine} disabled={!canReply || p.busy} />
      </div>
    </>
  );
}
