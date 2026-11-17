"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { lineDiff } from "@/lib/admin/diff";
import { Badge, Btn, Card, Empty, Err, Title, ago, pct, post, useLoad } from "@/components/admin/kit";

const label = (v: number | null) => (v == null ? "Default" : `v${v}`);

export default function Prompts() {
  const { data, error, reload } = useLoad<any>("/api/admin/prompts");
  const r = useRouter();
  const [key, setKey] = useState("classify");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [cmp, setCmp] = useState<number | "default" | null>(null);
  const [percent, setPercent] = useState(10);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = useMemo(() => data?.prompts.find((x: any) => x.key === key), [data, key]);

  const base = (): string => {
    if (!p) return "";
    const a = p.rollout.active_version;
    return p.versions.find((v: any) => v.version === (p.versions[0]?.version ?? a))?.body ?? p.default;
  };
  useEffect(() => {
    if (p) {
      setText(base());
      setNote("");
      setCmp(null);
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data?.prompts?.length]);

  if (!data || !p) return <><Title title="Prompts" /><Err error={error} /></>;
  const active: number | null = p.rollout.active_version;
  const activeText = (active != null ? p.versions.find((v: any) => v.version === active)?.body : null) ?? p.default;
  const cmpText = cmp === "default" ? p.default : cmp != null ? p.versions.find((v: any) => v.version === cmp)?.body ?? "" : null;
  const act = async (body: Record<string, unknown>, then?: () => void) => {
    setBusy(true);
    setErr(null);
    try {
      await post(`/api/admin/prompts/${key}`, body);
      await reload();
      then?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const testIt = async (version: number | null) => {
    setBusy(true);
    try {
      const run = await post<{ id: string }>("/api/admin/evals/runs", { prompts: { [key]: version ?? "default" }, repeats: 1 });
      r.push(`/admin/evals/runs/${run.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };
  const cand: number | null = p.rollout.candidate_version;

  return (
    <>
      <Title title="Prompts" sub="Edit, test and roll out the instructions the agent runs on. Saving never changes what users get." />
      <div className="ad-row" style={{ marginBottom: 16 }}>
        {data.prompts.map((x: any) => (
          <Btn key={x.key} kind={x.key === key ? "k" : undefined} onClick={() => setKey(x.key)}>{x.label}</Btn>
        ))}
      </div>
      <Err error={err} />
      <div className="ad-grid ad-g3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Card title={p.label} right={<span className="ad-mut">{p.used}</span>}>
          <textarea className="ad-ta" style={{ minHeight: 320 }} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <div className="ad-row" style={{ marginTop: 12 }}>
            <input className="ad-in" style={{ flex: 1 }} placeholder="What changed? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Btn kind="k" disabled={busy || text.trim() === base().trim()} onClick={() => act({ action: "save", body: text, note }, () => setNote(""))}>Save as new version</Btn>
            <Btn onClick={() => setText(p.default)}>Reset to default</Btn>
          </div>
        </Card>
        <div>
          <Card title="Who gets what">
            <div className="ad-col">
              <div><span className="ad-lbl">Everyone gets</span><Badge tone="good">{label(active)}</Badge></div>
              <div><span className="ad-lbl">Candidate</span>{cand == null ? <span className="ad-mut">none</span> : <Badge tone="blue">{label(cand)} · {p.rollout.mode === "admins" ? "admins only" : `${p.rollout.percent}% of users`}</Badge>}</div>
              <div><span className="ad-lbl">Eval gate</span><span className="ad-mut">{pct(data.gate)} pass rate on all suites</span></div>
              {active != null && <Btn className="ad-d" disabled={busy} onClick={() => confirm("Go back to the default prompt for everyone?") && act({ action: "rollback", version: null })}>Roll back to default</Btn>}
            </div>
          </Card>
        </div>
      </div>
      <Card title="Versions" pad={false}>
        <table className="ad-t">
          <thead><tr><th>Version</th><th>Note</th><th>Evals (all suites)</th><th>Saved</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            <tr>
              <td><b>Default</b> <Badge>in code</Badge>{active == null && <> <Badge tone="good">live</Badge></>}</td><td className="ad-mut">Ships with the app</td>
              <td>{p.defaultEval ? <Rate e={p.defaultEval} /> : <span className="ad-mut">Not tested</span>}</td><td />
              <td style={{ textAlign: "right" }}><Btn disabled={busy} onClick={() => testIt(null)}>Run evals</Btn> <Btn onClick={() => setCmp("default")}>Diff vs live</Btn></td>
            </tr>
            {p.versions.map((v: any) => (
              <tr key={v.version}>
                <td><b>v{v.version}</b>{active === v.version && <> <Badge tone="good">live</Badge></>}{cand === v.version && <> <Badge tone="blue">candidate</Badge></>}</td>
                <td>{v.note || <span className="ad-mut">–</span>}</td>
                <td>{v.eval ? <Rate e={v.eval} /> : <span className="ad-mut">Not tested</span>}</td>
                <td className="ad-mut">{ago(v.created_at)}</td>
                <td style={{ textAlign: "right" }}>
                  <div className="ad-row" style={{ justifyContent: "flex-end" }}>
                    <Btn onClick={() => setText(v.body)}>Load</Btn>
                    <Btn onClick={() => setCmp(v.version)}>Diff vs live</Btn>
                    <Btn disabled={busy} onClick={() => testIt(v.version)}>Run evals</Btn>
                    {active !== v.version && (
                      <>
                        <Btn disabled={busy} onClick={() => act({ action: "rollout", version: v.version, mode: "admins" })}>Admins only</Btn>
                        <span className="ad-row" style={{ gap: 4 }}>
                          <input className="ad-in" style={{ width: 54 }} type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
                          <Btn disabled={busy} onClick={() => act({ action: "rollout", version: v.version, mode: "percent", percent })}>% of users</Btn>
                        </span>
                        <Btn kind="k" disabled={busy} onClick={() => confirm(`Make v${v.version} live for everyone?`) && act({ action: "promote", version: v.version })}>Make live</Btn>
                      </>
                    )}
                    {cand === v.version && <Btn disabled={busy} onClick={() => act({ action: "rollout", version: v.version, mode: "off" })}>Stop rollout</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {cmpText != null && (
        <Card title={`Diff: ${cmp === "default" ? "Default" : "v" + cmp} compared with what's live (${label(active)})`} right={<Btn onClick={() => setCmp(null)}>Close</Btn>}>
          {cmpText === activeText ? <Empty>Same text as the live prompt.</Empty> : <div className="ad-diff">{lineDiff(activeText, cmpText).map((l, i) => <div key={i} className={l.kind === "same" ? "" : l.kind}>{l.kind === "add" ? "+ " : l.kind === "del" ? "– " : "  "}{l.text || " "}</div>)}</div>}
        </Card>
      )}
      <p className="ad-mut">To make a version live for everyone it has to pass the gate: run all evals on that exact version first. Admins only has no gate, so you can try it on yourselves.</p>
    </>
  );
}

function Rate({ e }: { e: { rate: number } }) {
  return <span className="ad-row" style={{ gap: 8 }}><span className="ad-bar" style={{ width: 70 }}><i style={{ width: `${e.rate * 100}%`, background: e.rate >= 0.9 ? "#3E7A52" : "#D49A3C" }} /></span>{pct(e.rate)}</span>;
}
