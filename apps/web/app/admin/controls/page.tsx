"use client";
import { useEffect, useState } from "react";
import { Btn, Card, Err, Title, post, useLoad } from "@/components/admin/kit";

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={on} className={`ad-sw ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export default function Controls() {
  const { data, error, reload } = useLoad<any>("/api/admin/controls");
  const paused = useLoad<any>("/api/admin/controls/user");
  const [err, setErr] = useState<string | null>(null);
  const [prices, setPrices] = useState("{}");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [auto, setAuto] = useState(0);
  const [gate, setGate] = useState(90);
  const [budget, setBudget] = useState(0);
  useEffect(() => {
    if (data) {
      setPrices(JSON.stringify(data.flags.model_prices, null, 2));
      setAuto(data.flags.auto_pause_errors);
      setGate(Math.round(data.flags.promote_gate * 100));
      setBudget(data.flags.daily_budget_usd ?? 0);
    }
  }, [data]);
  const put = async (patch: Record<string, unknown>) => {
    setErr(null);
    try {
      await post("/api/admin/controls", patch, "PUT");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  const userPause = async (e: string, p: boolean) => {
    setErr(null);
    try {
      await post("/api/admin/controls/user", { email: e, paused: p, note });
      setEmail("");
      await paused.reload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  };
  if (!data) return <><Title title="Controls" /><Err error={error} /></>;
  const f = data.flags;
  return (
    <>
      <Title title="Controls" sub="Switches that take effect within seconds. Every change is logged on the Team page." />
      <Err error={err || error} />
      <Card title="Emergency" pad={false}>
        <div className="ad-ctl"><div><b>Pause sending</b><small>Nothing leaves anyone’s Gmail. Approved sends fail with a clear message and can be retried later.</small></div><Switch on={f.pause_sending} onChange={(v) => put({ pause_sending: v })} /></div>
        <div className="ad-ctl"><div><b>Pause the agent</b><small>Stops reading email, drafting, answering and refining for everyone. Approved jobs that are already running finish.</small></div><Switch on={f.pause_agent} onChange={(v) => put({ pause_agent: v })} /></div>
        <div className="ad-ctl"><div><b>Dry run for everyone</b><small>Approving works, but nothing is written to Calendar, Airtable, Sheets or Gmail. Each step says "Dry run".</small></div><Switch on={f.dry_run_all} onChange={(v) => put({ dry_run_all: v })} /></div>
      </Card>
      <div className="ad-grid ad-g2">
        <Card title="Auto-pause">
          <p className="ad-mut" style={{ marginTop: 0 }}>Pause the agent by itself if this many live runs fail within 10 minutes. 0 turns it off.</p>
          <div className="ad-row"><input className="ad-in" type="number" min={0} max={1000} style={{ width: 90 }} value={auto} onChange={(e) => setAuto(Number(e.target.value))} /><Btn onClick={() => put({ auto_pause_errors: auto })}>Save</Btn></div>
        </Card>
        <Card title="Eval gate">
          <p className="ad-mut" style={{ marginTop: 0 }}>A prompt version needs this pass rate on all suites before it can go to a percentage of users or to everyone.</p>
          <div className="ad-row"><input className="ad-in" type="number" min={0} max={100} style={{ width: 90 }} value={gate} onChange={(e) => setGate(Number(e.target.value))} />%<Btn onClick={() => put({ promote_gate: gate / 100 })}>Save</Btn></div>
        </Card>
      </div>
      <Card title="Daily budget">
        <p className="ad-mut" style={{ marginTop: 0 }}>Pause the agent for the rest of the day if live spend passes this many dollars. Needs model prices below, since cost is unknown without them. 0 means no limit.</p>
        <div className="ad-row">$<input className="ad-in" type="number" min={0} style={{ width: 110 }} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /><Btn onClick={() => put({ daily_budget_usd: budget })}>Save</Btn></div>
      </Card>
      <Card title="Pause one user">
        <div className="ad-row"><input className="ad-in" style={{ width: 260 }} placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} /><input className="ad-in" style={{ width: 260 }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Btn kind="k" disabled={!email.trim()} onClick={() => userPause(email, true)}>Pause</Btn></div>
        {(paused.data?.paused ?? []).length > 0 && (
          <table className="ad-t" style={{ marginTop: 10 }}><tbody>
            {paused.data.paused.map((u: any) => <tr key={u.user_id}><td>{u.gmail_email ?? u.user_id}</td><td className="ad-mut">{u.paused_note}</td><td style={{ textAlign: "right" }}><Btn onClick={() => userPause(u.gmail_email, false)} disabled={!u.gmail_email}>Resume</Btn></td></tr>)}
          </tbody></table>
        )}
      </Card>
      <Card title="Model prices">
        <p className="ad-mut" style={{ marginTop: 0 }}>US dollars per million tokens, keyed by the exact model id. Cost shows as "–" for any model without a price here. Check your provider's pricing page; Fluent doesn't guess.</p>
        <textarea className="ad-ta" style={{ minHeight: 120 }} value={prices} onChange={(e) => setPrices(e.target.value)} spellCheck={false} />
        <div style={{ marginTop: 10 }}><Btn kind="k" onClick={() => { try { void put({ model_prices: JSON.parse(prices) }); } catch { setErr("That isn't valid JSON."); } }}>Save prices</Btn></div>
      </Card>
    </>
  );
}
