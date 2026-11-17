"use client";
import { useEffect, useRef, useState } from "react";
import { renderMarkdownLite, type PendingAction, type UiItem } from "@fluent/shared";
import { Approval } from "./Approval";
import { PlusIcon, SendIcon, StopIcon } from "./Icons";

export type ChatState = {
  items: UiItem[];
  actions: Record<string, PendingAction>;
  busy: boolean;
  status: { label: string; step: number } | null;
  error: string | null;
};

const SUGGESTIONS = [
  "What needs my attention today?",
  "Check my inbox for new brand deals",
  "Which deals are waiting on a reply?",
];

export function Chat({
  state,
  onSend,
  onStop,
  onAction,
  onOpenConnectors,
}: {
  state: ChatState;
  onSend: (text: string) => void;
  onStop: () => void;
  onAction: (a: PendingAction) => void;
  onOpenConnectors: () => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.items, state.status]);

  function submit() {
    const t = text.trim();
    if (!t || state.busy) return;
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    onSend(t);
  }

  const empty = state.items.length === 0;

  return (
    <>
      <div className="scroll">
        <div className="col">
          {empty && (
            <div className="hello">
              <h1>What should we work on?<br /><span>Ask me about a deal, or paste an offer.</span></h1>
              <div className="suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => onSend(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {state.items.map((it, i) => {
            if (it.kind === "user") return <div className="msg-user" key={i}>{it.text}</div>;
            if (it.kind === "text")
              return <div className="msg-ai" key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownLite(it.text) }} />;
            if (it.kind === "tool") {
              const prev = state.items[i - 1];
              if (prev && prev.kind === "tool") return null; // grouped with the first tool chip in a run
              const run: Extract<UiItem, { kind: "tool" }>[] = [];
              for (let j = i; j < state.items.length && state.items[j].kind === "tool"; j++) run.push(state.items[j] as Extract<UiItem, { kind: "tool" }>);
              return (
                <div className="tools" key={i}>
                  {run.map((t) => (
                    <span key={t.id} className={`chip ${t.ok === true ? "ok" : t.ok === false ? "bad" : ""}`}>
                      {t.ok === null ? <span className="pulse" /> : t.ok ? "✓" : "!"} {t.label}
                    </span>
                  ))}
                </div>
              );
            }
            const action = state.actions[it.actionId];
            return action ? <Approval key={it.actionId} action={action} onChange={onAction} /> : null;
          })}
          <div ref={endRef} />
        </div>
      </div>

      <div className="dock">
        <div className="dock-in">
          {state.busy && (
            <div className="status" role="status" aria-live="polite">
              <span className="dots" aria-hidden><i /><i /><i /></span>
              <b style={{ fontWeight: 500 }}>{state.status?.label ?? "Thinking"}</b>
              {state.status && state.status.step > 0 && <small>step {state.status.step}</small>}
            </div>
          )}
          {state.error && <div className="err" role="alert">{state.error}</div>}
          <div className="composer">
            <button className="round soft" aria-label="Add a connector" onClick={onOpenConnectors}><PlusIcon /></button>
            <label htmlFor="msg" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Message Fluent</label>
            <textarea
              id="msg"
              ref={taRef}
              rows={1}
              value={text}
              placeholder="Message Fluent"
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {state.busy ? (
              <button className="round dark" aria-label="Stop" onClick={onStop}><StopIcon /></button>
            ) : (
              <button className="round dark" aria-label="Send" disabled={!text.trim()} onClick={submit}><SendIcon /></button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
