"use client";
import { useState } from "react";
import { decideAction, type PendingAction } from "@fluent/shared";
import { api } from "@/lib/supabase-browser";

export function Approval({ action, onChange }: { action: PendingAction; onChange: (a: PendingAction) => void }) {
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(action.payload.to);
  const [subject, setSubject] = useState(action.payload.subject);
  const [body, setBody] = useState(action.payload.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      const next = await decideAction(api, action.id, decision, decision === "approve" ? { ...action.payload, to, subject, body } : undefined);
      onChange(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  const done = action.status !== "pending";
  return (
    <div className="card" role="group" aria-label="Email waiting for your approval">
      <div className="card-head">
        <span>Draft to {to}</span>
        <span>Gmail</span>
      </div>
      {editing && !done ? (
        <>
          <div className="field"><label htmlFor={`to-${action.id}`}>To</label><input id={`to-${action.id}`} className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="field"><label htmlFor={`sub-${action.id}`}>Subject</label><input id={`sub-${action.id}`} className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field"><label htmlFor={`body-${action.id}`}>Message</label><textarea id={`body-${action.id}`} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} /></div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600 }}>{subject}</div>
          <div className="draft">{body}</div>
        </>
      )}
      {action.status === "executed" && <div className="note-ok">Sent.</div>}
      {action.status === "rejected" && <div className="help">Dismissed. Nothing was sent.</div>}
      {action.status === "failed" && <div className="note-bad" role="alert">Couldn&apos;t send: {action.error ?? "unknown error"}</div>}
      {err && <div className="note-bad" role="alert">{err}</div>}
      {!done && (
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => decide("approve")}>Send it</button>
          <button className="btn" disabled={busy} onClick={() => setEditing((v) => !v)}>{editing ? "Done editing" : "Edit"}</button>
          <button className="btn ghost" disabled={busy} onClick={() => decide("reject")}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
