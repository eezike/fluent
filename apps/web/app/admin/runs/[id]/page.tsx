"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Btn, Card, Err, Json, Stat, Title, ms, post, usd, useLoad } from "@/components/admin/kit";

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const { data, error } = useLoad<any>(`/api/admin/runs/${id}`);
  const suites = useLoad<any>("/api/admin/evals/suites");
  const [suite, setSuite] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = data?.run;
  if (!run) return <><Title title="Run" /><Err error={error} /></>;
  const email = run.input?.email;
  const save = async () => {
    setErr(null);
    try {
      const c = await post<{ id: string }>(`/api/admin/runs/${id}/to-case`, { suiteId: suite });
      r.push(`/admin/evals/cases/${c.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <>
      <Title title={`${run.kind} run`} sub={new Date(run.created_at).toLocaleString()} right={run.error ? <Badge tone="bad">error</Badge> : <Badge tone="good">ok</Badge>} />
      <div className="ad-grid ad-g4">
        <Stat label="Prompt" value={run.prompt_key ?? "–"} sub={run.prompt_key ? (run.prompt_version == null ? "default in code" : `version ${run.prompt_version}`) : undefined} />
        <Stat label="Model" value={<span style={{ fontSize: 15 }}>{run.model}</span>} />
        <Stat label="Latency" value={ms(run.latency_ms)} sub={run.input_tokens != null ? `${run.input_tokens} in · ${run.output_tokens} out` : undefined} />
        <Stat label="Cost" value={usd(run.cost_usd)} />
      </div>
      {run.error && <Card title="Error"><Json v={run.error} /></Card>}
      <div className="ad-grid ad-g2">
        <Card title="Input"><Json v={run.input} /></Card>
        <Card title="Output"><Json v={run.output ?? "(none)"} /></Card>
      </div>
      {run.kind === "classify" && email && (
        <Card title="Turn into an eval case">
          <p className="ad-mut" style={{ marginTop: 0 }}>Copies this email into a suite with names, emails, phone numbers and links redacted. The checks start from what the agent said, so correct them before you trust them.</p>
          <Err error={err} />
          <div className="ad-row">
            <select className="ad-sel" value={suite} onChange={(e) => setSuite(e.target.value)}>
              <option value="">Choose a suite</option>
              {(suites.data?.suites ?? []).filter((s: any) => s.type !== "plan").map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Btn kind="k" disabled={!suite} onClick={save}>Save as eval case</Btn>
          </div>
        </Card>
      )}
    </>
  );
}
