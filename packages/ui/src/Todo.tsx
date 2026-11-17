import { useState } from "react";
import type { TodoDTO } from "@fluent/shared";
import { Icon } from "./icons";
import { cx } from "./util";

const dueLabel = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  const text = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days < 0) return { text: `${text} · overdue`, late: true };
  if (days === 0) return { text: "Today", late: false };
  if (days === 1) return { text: "Tomorrow", late: false };
  return { text, late: false };
};

type Props = {
  open: TodoDTO[];
  suggested: TodoDTO[];
  loaded: boolean;
  busy: boolean;
  onAdd: (title: string, dueDate?: string) => void;
  onDone: (t: TodoDTO) => void;
  onAccept: (t: TodoDTO) => void;
  onNotNow: (t: TodoDTO) => void;
  onDelegate: (t: TodoDTO) => void;
  onOpenTask: (id: string) => void;
};

export function TodoView(p: Props) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    p.onAdd(text.trim(), due || undefined);
    setText("");
    setDue("");
  };
  return (
    <div className={cx("scr")} data-demo="todo">
      <div className={cx("td-add")}>
        <input value={text} aria-label="Add a to do" placeholder="Add a to do" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className={cx("btn", "k")} disabled={!text.trim() || p.busy} onClick={submit}>Add</button>
      </div>

      {p.suggested.length > 0 && (
        <div className={cx("td-sug")} data-demo="todo-suggested">
          <div className={cx("td-h")}><Icon name="zap" size={13} /> Fluent suggests</div>
          {p.suggested.map((t) => {
            const d = dueLabel(t.dueDate);
            return (
              <div key={t.id} className={cx("td-item")}>
                <div className={cx("td-m")}>
                  <b>{t.title}</b>
                  <span>{t.note}{d && !t.note?.includes(d.text) ? ` ${d.text}` : ""}</span>
                </div>
                <div className={cx("td-b")}>
                  <button className={cx("btn", "k")} disabled={p.busy} onClick={() => p.onAccept(t)}>Add to my list</button>
                  <button className={cx("btn")} disabled={p.busy} onClick={() => p.onNotNow(t)}>Not now</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {p.open.map((t) => {
        const d = dueLabel(t.dueDate);
        return (
          <div key={t.id} className={cx("td-item", "td-row")}>
            <button className={cx("td-ck")} aria-label={`Mark "${t.title}" done`} onClick={() => p.onDone(t)} />
            <div className={cx("td-m")}>
              <b>{t.title}</b>
              {(t.note || d) && <span className={d?.late ? cx("td-late") : undefined}>{[t.note, d?.text].filter(Boolean).join(" · ")}</span>}
              {t.source === "agent" && <em>Suggested by Fluent</em>}
            </div>
            {t.notificationId ? (
              <button className={cx("btn")} onClick={() => p.onOpenTask(t.notificationId!)}>Fluent is on it</button>
            ) : (
              <button className={cx("btn")} disabled={p.busy} onClick={() => p.onDelegate(t)}>Have Fluent do it</button>
            )}
          </div>
        );
      })}

      {p.loaded && p.open.length === 0 && p.suggested.length === 0 && (
        <div className={cx("hint")}><b>Nothing on your list</b>Add things you need to do. Fluent will suggest others as dates come up.</div>
      )}
    </div>
  );
}
