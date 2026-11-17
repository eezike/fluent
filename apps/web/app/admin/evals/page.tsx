"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Btn, Card, Empty, Err, Title, ago, pct, post, useLoad, usd } from "@/components/admin/kit";

const KEYS = ["classify"]; // plan cases are pure code, so only the classify prompt changes extraction results

export default function Evals() {
  const suites = useLoad<any>("/api/admin/evals/suites");
  const runs = useLoad<any>("/api/admin/evals/runs", (d) => (d?.runs?.some((r: any) => r.status === "running") ? 2500 : null));
  const prompts = useLoad<any>("/api/admin/prompts");
  const r = useRouter();
  const [pick, setPick] = useState<Record<string, string>>({});
  const [suiteId, setSuiteId] = useState("");
  const [repeats, setRepeats] = useState(1);
  const [model, setModel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("extraction");

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const prompts: Record<string, string | number> = {};
      for (const k of KEYS) if (pick[k]) prompts[k] = /^\d+$/.test(pick[k]) ? Number(pick[k]) : pick[k];
      const { id } = await post<{ id: string }>("/api/admin/evals/runs", { suiteId: suiteId || null, prompts, repeats, model: model.trim() || null });
      r.push(`/admin/evals/runs/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };
  const wrap = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await suites.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  const list = suites.data?.suites ?? [];
  return (
    <>
      <Title title="Evals" sub="Check the agent against cases with known answers. Every check is exact. No model grades another model." right={list.length === 0 ? <Btn kind="k" onClick={() => wrap(() => post("/api/admin/evals/suites", { action: "seed" }))}>Load starter suites</Btn> : undefined} />
      <Err error={err || suites.error} />
      {list.length === 0 && suites.data && <Card><Empty>No suites yet. Load the starter suites (brand offers, contracts, offer logic and safety) to begin, then add cases from real runs.</Empty></Card>}
      <div className="ad-grid ad-g2">
        {list.map((s: any) => (
          <Card key={s.id} title={s.name} right={<Badge tone={s.type === "safety" ? "warn" : "blue"}>{s.type}</Badge>}>
            <div className="ad-row" style={{ gap: 18 }}>
              <div><span className="ad-lbl">Cases</span><b>{s.cases.length}</b></div>
              <div><span className="ad-lbl">Last pass rate</span>{s.last ? <b className={s.last.rate === 1 ? "ad-good" : "ad-bad"}>{pct(s.last.rate)}</b> : <span className="ad-mut">Not run</span>}</div>
              {s.last?.flaky > 0 && <Badge tone="warn">{s.last.flaky} flaky</Badge>}
              <span style={{ marginLeft: "auto" }} className="ad-row">
                <Link className="ad-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }} href={`/admin/evals/cases/new?suite=${s.id}&type=${s.type}`}>Add case</Link>
              </span>
            </div>
            <table className="ad-t" style={{ marginTop: 10 }}><tbody>
              {s.cases.map((c: any) => (
                <tr key={c.id}><td><Link href={`/admin/evals/cases/${c.id}`}>{c.name}</Link></td><td className="ad-mut" style={{ textAlign: "right" }}>{c.checks.length} checks</td></tr>
              ))}
            </tbody></table>
          </Card>
        ))}
      </div>
      {list.length > 0 && (
        <Card title="Run evals">
          <div className="ad-row" style={{ alignItems: "flex-end" }}>
            <div><span className="ad-lbl">Suite</span><select className="ad-sel" value={suiteId} onChange={(e) => setSuiteId(e.target.value)}><option value="">All suites</option>{list.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><span className="ad-lbl">Classify prompt</span>
              <select className="ad-sel" value={pick.classify ?? ""} onChange={(e) => setPick({ ...pick, classify: e.target.value })}>
                <option value="">Default in code</option><option value="active">What users have now</option>
                {(prompts.data?.prompts.find((p: any) => p.key === "classify")?.versions ?? []).map((v: any) => <option key={v.version} value={String(v.version)}>v{v.version}{v.note ? ` · ${v.note}` : ""}</option>)}
              </select>
            </div>
            <div><span className="ad-lbl">Model (optional)</span><input className="ad-in" style={{ width: 230 }} placeholder="anthropic:claude-sonnet-5-5" value={model} onChange={(e) => setModel(e.target.value)} /></div>
            <div><span className="ad-lbl">Repeats</span><select className="ad-sel" value={repeats} onChange={(e) => setRepeats(Number(e.target.value))}><option value={1}>1×</option><option value={3}>3× (finds flaky cases)</option></select></div>
            <Btn kind="k" disabled={busy} onClick={run}>{busy ? "Starting…" : "Run"}</Btn>
          </div>
        </Card>
      )}
      <Card title="Recent runs" pad={false}>
        {!runs.data || runs.data.runs.length === 0 ? <Empty>No runs yet.</Empty> : (
          <table className="ad-t">
            <thead><tr><th>Started</th><th>Suite</th><th>Prompts</th><th>Result</th><th>Cost</th></tr></thead>
            <tbody>
              {runs.data.runs.map((x: any) => {
                const cases = x.total / (x.repeats || 1);
                return (
                  <tr key={x.id} className="ad-click" onClick={() => r.push(`/admin/evals/runs/${x.id}`)}>
                    <td>{ago(x.started_at)}</td>
                    <td>{x.suite_id ? list.find((s: any) => s.id === x.suite_id)?.name ?? "Suite" : "All suites"} {x.repeats > 1 && <Badge>{x.repeats}×</Badge>}</td>
                    <td className="ad-mut">{Object.keys(x.prompts ?? {}).length ? Object.entries(x.prompts).map(([k, v]) => `${k}: ${/^\d+$/.test(String(v)) ? "v" + v : v}`).join(", ") : "default"}{x.model ? ` · ${x.model}` : ""}</td>
                    <td>{x.status === "running" ? <Badge tone="blue">{x.done}/{x.total}</Badge> : x.status === "failed" ? <Badge tone="bad">failed</Badge> : <><b className={x.passed === cases ? "ad-good" : "ad-bad"}>{x.passed}/{cases}</b> {x.flaky > 0 && <Badge tone="warn">{x.flaky} flaky</Badge>}</>}</td>
                    <td className="ad-mut">{usd(x.cost_usd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="New suite">
        <div className="ad-row"><input className="ad-in" style={{ width: 260 }} placeholder="Suite name" value={name} onChange={(e) => setName(e.target.value)} /><select className="ad-sel" value={type} onChange={(e) => setType(e.target.value)}><option value="extraction">Extraction</option><option value="plan">Plan</option><option value="safety">Safety</option></select><Btn disabled={!name.trim()} onClick={() => wrap(async () => { await post("/api/admin/evals/suites", { action: "create", name, type }); setName(""); })}>Create</Btn></div>
      </Card>
    </>
  );
}
