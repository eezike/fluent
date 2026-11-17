"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, Empty, Err, Title, ago, ms, usd, useLoad } from "@/components/admin/kit";

export default function Runs() {
  const [kind, setKind] = useState("");
  const [errors, setErrors] = useState(false);
  const [source, setSource] = useState("live");
  const r = useRouter();
  const qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(source ? { source } : {}), ...(errors ? { errors: "1" } : {}) }).toString();
  const { data, error } = useLoad<any>(`/api/admin/runs?${qs}`, 10000);
  return (
    <>
      <Title title="Runs" sub="Every model call the agent makes, with its prompt version, tokens and cost" />
      <div className="ad-row" style={{ marginBottom: 14 }}>
        <select className="ad-sel" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{["classify", "draft", "ask", "refine"].map((k) => <option key={k}>{k}</option>)}</select>
        <select className="ad-sel" value={source} onChange={(e) => setSource(e.target.value)}><option value="live">Live</option><option value="eval">Evals</option><option value="reprocess">Reprocess</option><option value="">All sources</option></select>
        <label className="ad-row" style={{ gap: 6 }}><input type="checkbox" checked={errors} onChange={(e) => setErrors(e.target.checked)} /> Errors only</label>
      </div>
      <Err error={error} />
      <Card pad={false}>
        {!data ? null : data.runs.length === 0 ? (
          <Empty>Nothing here yet. Runs appear as the agent reads email and answers questions.</Empty>
        ) : (
          <table className="ad-t">
            <thead><tr><th>Kind</th><th>Prompt</th><th>Model</th><th>Result</th><th>Latency</th><th>Tokens</th><th>Cost</th><th>When</th></tr></thead>
            <tbody>
              {data.runs.map((x: any) => (
                <tr key={x.id} className="ad-click" onClick={() => r.push(`/admin/runs/${x.id}`)}>
                  <td><b>{x.kind}</b> {x.source !== "live" && <Badge tone="blue">{x.source}</Badge>}</td>
                  <td className="ad-mut">{x.prompt_key ? `${x.prompt_key} · ${x.prompt_version == null ? "default" : "v" + x.prompt_version}` : "–"}</td>
                  <td className="ad-mono ad-mut">{x.model?.split(":")[1] ?? x.model}</td>
                  <td>{x.error ? <Badge tone="bad">error</Badge> : <Badge tone="good">ok</Badge>}</td>
                  <td>{ms(x.latency_ms)}</td>
                  <td className="ad-mut">{x.input_tokens != null ? `${x.input_tokens} in · ${x.output_tokens} out` : "–"}</td>
                  <td>{usd(x.cost_usd)}</td>
                  <td className="ad-mut">{ago(x.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {data && data.runs.length === 50 && <p className="ad-mut">Showing the latest 50. Use the filters to narrow down.</p>}
      <p className="ad-mut"><Link href="/admin/controls">Set model prices</Link> to see cost per run.</p>
    </>
  );
}
