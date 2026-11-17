"use client";
import { useState } from "react";
import { Badge, Btn, Card, Empty, Err, Title, ago, post, adminFetch, useLoad } from "@/components/admin/kit";

const tone = { ok: "good", warn: "warn", bad: "bad", idle: "n" } as const;

export default function Users() {
  const { data, error, reload } = useLoad<any>("/api/admin/users", 15000);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, action: string, label: string) => {
    setBusy(id + action);
    setErr(null);
    setNote(null);
    try {
      const r = await post<any>(`/api/admin/users/${id}`, { action });
      setNote(action === "sync" ? `Sync finished: ${r.result.skipped ? "skipped" : `${r.result.created} new`}${r.result.errors?.length ? ` · ${r.result.errors.join("; ")}` : ""}` : `${label} done.`);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };
  const look = async (id: string) => {
    setErr(null);
    try {
      setView(await adminFetch(`/api/admin/users/${id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <>
      <Title title="Users" sub="Is Fluent keeping up with each person's inbox? Anyone with a problem is listed first." />
      <Err error={err || error} />
      {note && <div className="ad-banner" style={{ background: "#E9F4EC", color: "#2f6342" }}>{note}</div>}
      {data && !data.pushConfigured && <div className="ad-banner">Gmail push isn’t configured (GMAIL_PUBSUB_TOPIC is empty), so mail is only checked by the cron and when an app opens.</div>}
      <Card pad={false}>
        {!data ? null : data.users.length === 0 ? <Empty>No users yet.</Empty> : (
          <table className="ad-t">
            <thead><tr><th>User</th><th>Health</th><th>Last sync</th><th>Last push</th><th>Watch expires</th><th>Open</th><th>Errors 24h</th><th style={{ textAlign: "right" }}>Fix</th></tr></thead>
            <tbody>
              {data.users.map((u: any) => (
                <tr key={u.id}>
                  <td><b>{u.email}</b><div className="ad-mut" style={{ fontSize: 11.5 }}>{u.connections.join(" · ") || "no connectors"}{!u.onboarded && " · onboarding"}{u.sourceOfTruth && ` · ${u.sourceOfTruth}`}</div></td>
                  <td><Badge tone={tone[u.health.level as keyof typeof tone]}>{u.health.label}</Badge></td>
                  <td className="ad-mut">{u.lastSyncAt ? ago(u.lastSyncAt) : "–"}</td>
                  <td className="ad-mut">{u.lastPushAt ? ago(u.lastPushAt) : "–"}</td>
                  <td className="ad-mut">{u.watchExpiresAt ? new Date(u.watchExpiresAt).toLocaleDateString() : "–"}</td>
                  <td>{u.open}</td>
                  <td>{u.errors24h ? <b className="ad-bad">{u.errors24h}</b> : <span className="ad-mut">0</span>}</td>
                  <td>
                    <div className="ad-row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <Btn disabled={!!busy || !u.connections.includes("google")} onClick={() => act(u.id, "sync", "Sync")}>{busy === u.id + "sync" ? "Syncing…" : "Sync now"}</Btn>
                      <Btn disabled={!!busy || !u.connections.includes("google") || !data.pushConfigured} onClick={() => act(u.id, "renew_watch", "Watch renewal")}>Renew watch</Btn>
                      <Btn disabled={!!busy} onClick={() => act(u.id, u.paused ? "resume" : "pause", u.paused ? "Resume" : "Pause")}>{u.paused ? "Resume" : "Pause"}</Btn>
                      <Btn onClick={() => look(u.id)}>View</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {view && (
        <Card title={`What ${view.email} sees (read-only, logged)`} right={<Btn onClick={() => setView(null)}>Close</Btn>} pad={false}>
          <table className="ad-t"><thead><tr><th>Card</th><th>Type</th><th>Status</th><th>When</th></tr></thead><tbody>
            {view.notifications.map((n: any) => <tr key={n.id}><td>{n.title}{n.error && <div className="ad-no">{n.error}</div>}</td><td className="ad-mut">{n.type}</td><td><Badge tone={n.status === "open" ? "blue" : n.status === "running" ? "warn" : "n"}>{n.status}</Badge></td><td className="ad-mut">{ago(n.created_at)}</td></tr>)}
            {view.notifications.length === 0 && <tr><td colSpan={4} className="ad-mut">No cards.</td></tr>}
          </tbody></table>
          {view.todos.length > 0 && <div style={{ padding: 16, borderTop: "1px solid #F0EEE7" }}><span className="ad-lbl">To do</span>{view.todos.map((t: any) => <div key={t.id}>{t.title} <span className="ad-mut">· {t.status}</span></div>)}</div>}
        </Card>
      )}
      <p className="ad-mut">Viewing shows titles and statuses only, never email text, and is recorded in the audit log.</p>
    </>
  );
}
