"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Btn, Card, Empty, Err, Title, ago, post, useLoad } from "@/components/admin/kit";

export default function Reprocess() {
  const jobs = useLoad<any>("/api/admin/reprocess", (d) => (d?.jobs?.some((j: any) => j.status === "running") ? 2500 : null));
  const prompts = useLoad<any>("/api/admin/prompts");
  const r = useRouter();
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(30);
  const [pick, setPick] = useState("default");
  const [text, setText] = useState("");
  const [custom, setCustom] = useState(false);
  const [model, setModel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const versions = prompts.data?.prompts.find((p: any) => p.key === "classify")?.versions ?? [];
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { id } = await post<{ id: string }>("/api/admin/reprocess", { days, limit, ...(custom ? { text } : { pick: /^\d+$/.test(pick) ? Number(pick) : pick }), model: model.trim() || null });
      r.push(`/admin/reprocess/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };
  return (
    <>
      <Title title="Reprocess" sub="Re-read past emails with a different prompt and see what would change. This is a dry run: no notifications, drafts or records are touched." />
      <Err error={err} />
      <Card title="New reprocess">
        <div className="ad-row" style={{ alignItems: "flex-end" }}>
          <div><span className="ad-lbl">Emails from the last</span><select className="ad-sel" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select></div>
          <div><span className="ad-lbl">At most</span><select className="ad-sel" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[10, 30, 60, 100].map((d) => <option key={d} value={d}>{d} emails</option>)}</select></div>
          <div><span className="ad-lbl">Classify prompt</span>
            <select className="ad-sel" value={custom ? "__text" : pick} onChange={(e) => (e.target.value === "__text" ? setCustom(true) : (setCustom(false), setPick(e.target.value)))}>
              <option value="default">Default in code</option><option value="active">What users have now</option>
              {versions.map((v: any) => <option key={v.version} value={String(v.version)}>v{v.version}{v.note ? ` · ${v.note}` : ""}</option>)}
              <option value="__text">Try new text (not saved)…</option>
            </select>
          </div>
          <div><span className="ad-lbl">Model (optional)</span><input className="ad-in" style={{ width: 220 }} value={model} onChange={(e) => setModel(e.target.value)} placeholder="anthropic:claude-sonnet-5-5" /></div>
          <Btn kind="k" disabled={busy || (custom && text.trim().length < 40)} onClick={go}>{busy ? "Starting…" : "Reprocess"}</Btn>
        </div>
        {custom && <div style={{ marginTop: 12 }}><span className="ad-lbl">Prompt text to try</span><textarea className="ad-ta" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} /></div>}
        <p className="ad-mut" style={{ marginBottom: 0 }}>It compares the new answer with what Fluent extracted at the time: kind, brand, fee, dates, usage and payment terms. Each re-read is a model call and costs money.</p>
      </Card>
      <Card title="Past reprocesses" pad={false}>
        {!jobs.data || jobs.data.jobs.length === 0 ? <Empty>None yet.</Empty> : (
          <table className="ad-t"><thead><tr><th>Started</th><th>Prompt</th><th>Window</th><th>Result</th></tr></thead><tbody>
            {jobs.data.jobs.map((j: any) => (
              <tr key={j.id} className="ad-click" onClick={() => r.push(`/admin/reprocess/${j.id}`)}>
                <td>{ago(j.started_at)}</td>
                <td className="ad-mut">{j.prompt.text ? "custom text" : j.prompt.pick == null || j.prompt.pick === "default" ? "default" : /^\d+$/.test(String(j.prompt.pick)) ? `v${j.prompt.pick}` : j.prompt.pick}{j.model ? ` · ${j.model}` : ""}</td>
                <td className="ad-mut">{j.days}d · {j.total} emails</td>
                <td>{j.status === "running" ? <Badge tone="blue">{j.done}/{j.total}</Badge> : j.status === "failed" ? <Badge tone="bad">failed</Badge> : <><b className={j.changed ? "ad-bad" : "ad-good"}>{j.changed}</b> <span className="ad-mut">of {j.total} changed</span></>}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
