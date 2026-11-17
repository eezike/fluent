"use client";
import { useState } from "react";
import { Btn, Card, Err, Title, ago, post, useLoad } from "@/components/admin/kit";

export default function Team() {
  const { data, error, reload } = useLoad<any>("/api/admin/team");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <>
      <Title title="Team" sub="Who can open this portal, and what they've changed" />
      <Err error={err || error} />
      <Card title="Admins" pad={false}>
        <table className="ad-t"><tbody>
          {(data?.admins ?? []).map((a: any) => (
            <tr key={a.user_id}><td>{a.email}</td><td className="ad-mut">since {ago(a.created_at)}</td><td style={{ textAlign: "right" }}><Btn className="ad-d" onClick={() => confirm(`Remove ${a.email}?`) && run(() => post("/api/admin/team", { userId: a.user_id }, "DELETE"))}>Remove</Btn></td></tr>
          ))}
        </tbody></table>
        <div className="ad-row" style={{ padding: 16, borderTop: "1px solid #F0EEE7" }}>
          <input className="ad-in" style={{ width: 280 }} placeholder="Add by email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Btn kind="k" disabled={!email.trim()} onClick={() => run(async () => { await post("/api/admin/team", { email }); setEmail(""); })}>Add admin</Btn>
          <span className="ad-mut">They need to have signed in to Fluent once.</span>
        </div>
      </Card>
      <Card title="Audit log" pad={false}>
        <table className="ad-t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>
          {(data?.audit ?? []).map((l: any) => (
            <tr key={l.id}><td className="ad-mut">{ago(l.created_at)}</td><td>{l.actor_email ?? "system"}</td><td><b>{l.action}</b></td><td className="ad-mono">{l.target}</td><td className="ad-mono ad-mut" style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.detail ? JSON.stringify(l.detail) : ""}</td></tr>
          ))}
          {data && data.audit.length === 0 && <tr><td colSpan={5} className="ad-mut">Nothing yet.</td></tr>}
        </tbody></table>
      </Card>
    </>
  );
}
