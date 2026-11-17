"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, Empty, Err, Stat, Title, pct, usd, useLoad } from "@/components/admin/kit";

const short = (m: string) => m.split(":")[1] ?? m;

export default function Cost() {
  const [days, setDays] = useState(14);
  const { data, error } = useLoad<any>(`/api/admin/cost?days=${days}`);
  if (!data) return <><Title title="Cost" /><Err error={error} /></>;
  const max = Math.max(0.0001, ...data.days.map((d: any) => d.live + d.other));
  const table = (rows: Record<string, any>, first: string) => (
    <table className="ad-t"><thead><tr><th>{first}</th><th>Runs</th><th>Tokens (in / out)</th><th>Cost</th></tr></thead><tbody>
      {Object.entries(rows).sort((a: any, b: any) => b[1].cost - a[1].cost).map(([k, v]: any) => <tr key={k}><td>{k}</td><td>{v.runs}</td><td className="ad-mut">{v.inTok.toLocaleString()} / {v.outTok.toLocaleString()}</td><td>{data.pricesSet ? usd(v.cost) : "–"}</td></tr>)}
    </tbody></table>
  );
  return (
    <>
      <Title title="Cost" sub="Model spend from the run log" right={<select className="ad-sel" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select>} />
      <Err error={error} />
      {!data.pricesSet && <div className="ad-banner">No model prices are set, so cost can’t be calculated. Add them in <Link href="/admin/controls">Controls</Link>. Token counts below are still accurate.</div>}
      {data.pricesSet && data.unpriced > 0 && <div className="ad-banner">{data.unpriced} runs used a model with no price and aren’t counted.</div>}
      <div className="ad-grid ad-g4">
        <Stat label={`Total, ${days} days`} value={usd(data.total)} />
        <Stat label="Today (live)" value={usd(data.todayLive)} sub={data.budget ? `of ${usd(data.budget)} daily budget` : "no daily budget"} tone={data.budget && data.todayLive >= data.budget ? "bad" : undefined} />
        <Stat label="Runs" value={Object.values(data.byKind as Record<string, any>).reduce((a, v: any) => a + v.runs, 0)} />
        <Stat label="Budget" value={data.budget ? usd(data.budget) : "Off"} sub={<Link href="/admin/controls">Change</Link> as any} />
      </div>
      <Card title="By day">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
          {data.days.map((d: any) => (
            <div key={d.day} title={`${d.day}: live ${usd(d.live)}, evals and reprocess ${usd(d.other)}`} style={{ flex: 1, display: "flex", flexDirection: "column-reverse", height: "100%" }}>
              <div style={{ height: `${(d.live / max) * 100}%`, background: "#191919", minHeight: d.live ? 2 : 0 }} />
              <div style={{ height: `${(d.other / max) * 100}%`, background: "#B9C8E8", minHeight: d.other ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="ad-row ad-mut" style={{ marginTop: 8, fontSize: 11.5 }}><span><i style={{ display: "inline-block", width: 9, height: 9, background: "#191919", marginRight: 5 }} />Live</span><span><i style={{ display: "inline-block", width: 9, height: 9, background: "#B9C8E8", marginRight: 5 }} />Evals and reprocess</span></div>
      </Card>
      <div className="ad-grid ad-g2">
        <Card title="By model" pad={false}>{Object.keys(data.byModel).length ? table(Object.fromEntries(Object.entries(data.byModel).map(([k, v]) => [short(k), v])), "Model") : <Empty>No runs.</Empty>}</Card>
        <Card title="By kind" pad={false}>{Object.keys(data.byKind).length ? table(data.byKind, "Kind") : <Empty>No runs.</Empty>}</Card>
      </div>
      <Card title="By prompt version" pad={false}>{Object.keys(data.byPrompt).length ? table(data.byPrompt, "Prompt") : <Empty>No runs.</Empty>}</Card>
      <Card title="Model comparison, from eval runs" pad={false}>
        {data.modelCompare.length === 0 ? <Empty>Run evals with different models (Evals › Model) to compare pass rate and cost here.</Empty> : (
          <table className="ad-t"><thead><tr><th>Model</th><th>Eval runs</th><th>Avg pass rate</th><th>Avg cost per run</th></tr></thead><tbody>
            {data.modelCompare.map((m: any) => <tr key={m.model}><td>{m.model}</td><td>{m.runs}</td><td><b>{pct(m.avgPassRate)}</b></td><td>{data.pricesSet ? usd(m.avgCost) : "–"}</td></tr>)}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
