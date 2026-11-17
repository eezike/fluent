"use client";
import Link from "next/link";
import { Badge, Card, Empty, Err, Stat, Title, ago, ms, pct, usd, useLoad } from "@/components/admin/kit";

export default function Overview() {
  const { data, error } = useLoad<any>("/api/admin/overview", 10000);
  if (!data) return <><Title title="Overview" /><Err error={error} /></>;
  const l = data.last24h;
  const errRate = l.runs ? l.errors / l.runs : null;
  const e = data.lastEval;
  const f = data.flags;
  const on = [f.pause_agent && "Agent paused", f.pause_sending && "Sending paused", f.dry_run_all && "Dry run for everyone"].filter(Boolean);
  return (
    <>
      <Title title="Overview" sub="Live agent activity from the last 24 hours" right={<Link href="/admin/evals" className="ad-btn ad-k" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Run evals</Link>} />
      {on.length > 0 && <div className="ad-banner">{on.join(" · ")}<Link href="/admin/controls">Open controls</Link></div>}
      <div className="ad-grid ad-g4">
        <Stat label="Agent runs" value={l.runs} sub={Object.entries(l.byKind as Record<string, any>).map(([k, v]) => `${v.n} ${k}`).join(" · ") || "none yet"} />
        <Stat label="Error rate" value={pct(errRate)} tone={errRate != null && errRate > 0.05 ? "bad" : undefined} sub={`${l.errors} failed`} />
        <Stat label="Latency" value={ms(l.p50Ms)} sub={`p95 ${ms(l.p95Ms)}`} />
        <Stat label="Cost" value={usd(l.costUsd)} sub={l.costUsd == null ? "Set model prices in Controls" : "last 24h"} />
      </div>
      <div className="ad-grid ad-g2">
        <Card title="Latest eval" right={<Link href="/admin/evals">All evals</Link>}>
          {e ? (
            <div className="ad-row" style={{ gap: 22 }}>
              <Stat label="Pass rate" value={pct(e.cases ? e.passed / e.cases : 0)} tone={e.passed === e.cases ? "good" : "bad"} sub={`${e.passed} of ${e.cases} cases · ${ago(e.started_at)}`} />
              {e.flaky > 0 && <Badge tone="warn">{e.flaky} flaky</Badge>}
              <Link href={`/admin/evals/runs/${e.id}`}>Open run</Link>
            </div>
          ) : (
            <Empty>No eval runs yet. Load the starter suites on the Evals page.</Empty>
          )}
        </Card>
        <Card title="Recent runs" right={<Link href="/admin/runs">All runs</Link>} pad={false}>
          {data.recent.length === 0 ? (
            <Empty>No live runs yet.</Empty>
          ) : (
            <table className="ad-t"><tbody>
              {data.recent.map((r: any) => (
                <tr key={r.id}><td><Link href={`/admin/runs/${r.id}`}>{r.kind}</Link></td><td>{r.error ? <Badge tone="bad">error</Badge> : <Badge tone="good">ok</Badge>}</td><td className="ad-mut">{ms(r.latency_ms)}</td><td className="ad-mut" style={{ textAlign: "right" }}>{ago(r.created_at)}</td></tr>
              ))}
            </tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
