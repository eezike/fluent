"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CHECK_LABELS, type CheckType } from "@/lib/admin/checks";
import { Btn, Card, Err, Title, adminFetch, post, useLoad } from "@/components/admin/kit";

type Row = { field: string; type: CheckType; expected: string };
const FIELDS = ["kind", "brand", "fee", "currency", "deliverables", "usageMonths", "exclusivity", "exclusivityCategory", "exclusivityUntil", "contentDue", "postStart", "postEnd", "paymentNetDays", "terms[].quote", "type", "urgency", "flagTitles", "actionKinds", "changeTexts"];
const show = (v: unknown) => (v === undefined ? "null" : JSON.stringify(v));
const parse = (type: CheckType, s: string): unknown => {
  const t = s.trim();
  if (t === "" && type !== "contains" && type !== "not_contains") return null;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

export default function CaseEditor() {
  const { id } = useParams<{ id: string }>();
  const q = useSearchParams();
  const r = useRouter();
  const isNew = id === "new";
  const existing = useLoad<any>(isNew ? null : `/api/admin/evals/cases/${id}`);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"classify" | "plan">(q.get("type") === "plan" ? "plan" : "classify");
  const [email, setEmail] = useState({ from: "", subject: "", text: "", attachments: "", today: new Date().toISOString().slice(0, 10) });
  const [planJson, setPlanJson] = useState('{\n  "x": { "kind": "brand_offer", "brand": "Acme", "fee": 9000, "currency": "USD", "terms": [] },\n  "deals": [],\n  "today": "2027-02-01"\n}');
  const [checks, setChecks] = useState<Row[]>([]);
  const [suiteId, setSuiteId] = useState(q.get("suite") ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const c = existing.data?.case;
    if (!c) return;
    setName(c.name);
    setKind(c.kind);
    setSuiteId(c.suite_id);
    if (c.kind === "classify") setEmail({ from: c.input.from ?? "", subject: c.input.subject ?? "", text: c.input.text ?? "", attachments: c.input.attachments ?? "", today: c.input.today ?? "" });
    else setPlanJson(JSON.stringify(c.input, null, 2));
    setChecks((c.checks ?? []).map((k: any) => ({ field: k.field, type: k.type, expected: show(k.expected) })));
  }, [existing.data]);

  const save = async () => {
    setErr(null);
    setOk(false);
    try {
      const input = kind === "classify" ? { ...email, attachments: email.attachments || undefined } : JSON.parse(planJson);
      const body = { name, kind, input, suiteId, checks: checks.filter((c) => c.field.trim()).map((c) => ({ field: c.field.trim(), type: c.type, expected: c.type === "verified" ? undefined : parse(c.type, c.expected) })) };
      if (isNew) {
        const { id: nid } = await post<{ id: string }>("/api/admin/evals/cases", body);
        r.replace(`/admin/evals/cases/${nid}`);
      } else {
        await post(`/api/admin/evals/cases/${id}`, body, "PUT");
        setOk(true);
      }
    } catch (e) {
      setErr(e instanceof SyntaxError ? "The plan input isn't valid JSON." : e instanceof Error ? e.message : "Failed");
    }
  };
  const del = async () => {
    if (!confirm("Delete this case? Past results keep its name.")) return;
    await adminFetch(`/api/admin/evals/cases/${id}`, { method: "DELETE" });
    r.push("/admin/evals");
  };
  const set = (i: number, p: Partial<Row>) => setChecks(checks.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const fromRun = existing.data?.case?.source_run_id;

  return (
    <>
      <Title title={isNew ? "New eval case" : "Eval case"} sub={fromRun ? "Created from a real run. Details are redacted; checks started from the agent's output, so confirm each one." : undefined} right={<><Btn kind="k" onClick={save} disabled={!name.trim() || !suiteId}>Save</Btn>{!isNew && <Btn className="ad-d" onClick={del}>Delete</Btn>}</>} />
      <Err error={err || existing.error} />
      {ok && <div className="ad-banner" style={{ background: "#E9F4EC", color: "#2f6342" }}>Saved.</div>}
      <div className="ad-grid ad-g2" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
        <Card title="Input">
          <div className="ad-col">
            <div><span className="ad-lbl">Name</span><input className="ad-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Offer with exclusivity clause" /></div>
            {isNew && <div><span className="ad-lbl">Kind</span><select className="ad-sel" value={kind} onChange={(e) => setKind(e.target.value as "classify" | "plan")}><option value="classify">Read an email (classify)</option><option value="plan">Plan an offer (no model)</option></select></div>}
            {kind === "classify" ? (
              <>
                <div className="ad-row"><div style={{ flex: 1 }}><span className="ad-lbl">From</span><input className="ad-in" value={email.from} onChange={(e) => setEmail({ ...email, from: e.target.value })} /></div><div style={{ flex: 1 }}><span className="ad-lbl">Subject</span><input className="ad-in" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} /></div><div><span className="ad-lbl">Today</span><input className="ad-in" style={{ width: 130 }} value={email.today} onChange={(e) => setEmail({ ...email, today: e.target.value })} /></div></div>
                <div><span className="ad-lbl">Email body</span><textarea className="ad-ta" value={email.text} onChange={(e) => setEmail({ ...email, text: e.target.value })} /></div>
                <div><span className="ad-lbl">Attachment text (optional, in &lt;attachment&gt; blocks)</span><textarea className="ad-ta" style={{ minHeight: 90 }} value={email.attachments} onChange={(e) => setEmail({ ...email, attachments: e.target.value })} /></div>
              </>
            ) : (
              <div><span className="ad-lbl">Input JSON: x (the extraction), deals, today</span><textarea className="ad-ta" style={{ minHeight: 320 }} value={planJson} onChange={(e) => setPlanJson(e.target.value)} spellCheck={false} /></div>
            )}
          </div>
        </Card>
        <Card title="Checks" right={<Btn onClick={() => setChecks([...checks, { field: "", type: "exact", expected: "" }])}>Add check</Btn>}>
          <p className="ad-mut" style={{ marginTop: 0 }}>{kind === "classify" ? "Fields of what the agent extracted." : "Fields of the plan: type, urgency, flagTitles, actionKinds, changeTexts."} Expected values are JSON (<span className="ad-mono">14000</span>, <span className="ad-mono">"brand_offer"</span>, <span className="ad-mono">null</span>) or plain text.</p>
          <datalist id="fields">{FIELDS.map((f) => <option key={f} value={f} />)}</datalist>
          <div className="ad-col">
            {checks.map((c, i) => (
              <div key={i} className="ad-row" style={{ gap: 6 }}>
                <input className="ad-in" list="fields" style={{ flex: 1.2 }} value={c.field} onChange={(e) => set(i, { field: e.target.value })} placeholder="field" />
                <select className="ad-sel" value={c.type} onChange={(e) => set(i, { type: e.target.value as CheckType })}>{(Object.keys(CHECK_LABELS) as CheckType[]).map((t) => <option key={t} value={t}>{CHECK_LABELS[t]}</option>)}</select>
                {c.type !== "verified" && <input className="ad-in" style={{ flex: 1 }} value={c.expected} onChange={(e) => set(i, { expected: e.target.value })} placeholder="expected" />}
                <Btn className="ad-d" onClick={() => setChecks(checks.filter((_, j) => j !== i))}>×</Btn>
              </div>
            ))}
            {checks.length === 0 && <span className="ad-mut">No checks yet. A case with no checks can't pass.</span>}
          </div>
        </Card>
      </div>
    </>
  );
}
