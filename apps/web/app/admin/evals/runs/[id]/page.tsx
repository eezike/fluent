"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Card, Err, Json, Stat, Title, ago, ms, pct, useLoad, usd } from "@/components/admin/kit";

export default function EvalRun() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useLoad<any>(`/api/admin/evals/runs/${id}`, (d) => (d?.run?.status === "running" ? 2000 : null));
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <><Title title="Eval run" /><Err error={error} /></>;
  const { run, results } = data;
  const cases = Math.round(run.total / (run.repeats || 1));
  const byCase = new Map<string, any[]>();
  for (const r of results) byCase.set(r.case_name, [...(byCase.get(r.case_name) ?? []), r]);
  const rows = [...byCase.entries()].map(([name, rs]) => ({ name, rs, pass: rs.every((x) => x.pass), flaky: rs.some((x) => x.pass) && !rs.every((x) => x.pass) }));
  rows.sort((a, b) => Number(a.pass) - Number(b.pass));
  return (
    <>
      <Title title="Eval run" sub={`${ago(run.started_at)} · ${Object.keys(run.prompts ?? {}).length ? Object.entries(run.prompts).map(([k, v]) => `${k}: ${/^\d+$/.test(String(v)) ? "v" + v : v}`).join(", ") : "default prompts"}${run.model ? " · " + run.model : ""}`} right={<Link href="/admin/evals">All evals</Link>} />
      <Err error={run.error} />
      <div className="ad-grid ad-g4">
        <Stat label="Pass rate" value={run.status === "running" ? "…" : pct(cases ? run.passed / cases : 0)} tone={run.status === "done" ? (run.passed === cases ? "good" : "bad") : undefined} sub={run.status === "running" ? `${run.done} of ${run.total} done` : `${run.passed} of ${cases} cases`} />
        <Stat label="Flaky" value={run.flaky} sub={run.repeats > 1 ? `differed across ${run.repeats} repeats` : "Run 3× to detect"} tone={run.flaky ? "bad" : undefined} />
        <Stat label="Cost" value={usd(run.cost_usd)} />
        <Stat label="Status" value={<span style={{ fontSize: 16 }}>{run.status}</span>} />
      </div>
      <Card pad={false}>
        <table className="ad-t">
          <thead><tr><th>Case</th><th>Result</th><th>Latency</th></tr></thead>
          <tbody>
            {rows.flatMap((c) => {
              const worst = c.rs.find((x) => !x.pass) ?? c.rs[0];
              return [
                <tr key={c.name} className="ad-click" onClick={() => setOpen(open === c.name ? null : c.name)}>
                  <td><b>{c.name}</b></td>
                  <td>{c.flaky ? <Badge tone="warn">flaky · {c.rs.filter((x) => x.pass).length}/{c.rs.length}</Badge> : c.pass ? <Badge tone="good">pass</Badge> : <Badge tone="bad">fail</Badge>}</td>
                  <td className="ad-mut">{ms(Math.round(c.rs.reduce((a, x) => a + (x.latency_ms ?? 0), 0) / c.rs.length))}</td>
                </tr>,
                open === c.name && (
                  <tr key={c.name + "-d"}><td colSpan={3} style={{ background: "#FCFBF8" }}>
                    {worst.error && <div className="ad-err">{worst.error}</div>}
                    <table className="ad-t"><thead><tr><th>Field</th><th>Check</th><th>Expected</th><th>Got</th><th /></tr></thead><tbody>
                      {(worst.checks ?? []).map((k: any, i: number) => (
                        <tr key={i}><td className="ad-mono">{k.field}</td><td>{k.type}</td><td className="ad-mono">{JSON.stringify(k.expected ?? null)}</td><td className="ad-mono">{JSON.stringify(k.actual)}{k.note && <div className="ad-no">{k.note}</div>}</td><td>{k.pass ? <span className="ad-ok">✓</span> : <span className="ad-no">✗</span>}</td></tr>
                      ))}
                    </tbody></table>
                    <details style={{ marginTop: 10 }}><summary className="ad-mut">Full output</summary><Json v={worst.output} /></details>
                  </td></tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
