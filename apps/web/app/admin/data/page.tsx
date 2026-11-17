"use client";
import { useMemo, useState } from "react";
import { SHEET_COLUMNS, dealToAirtableFields, dealToSheetRow, pickKey, type DealFields } from "@/lib/core/mapping";
import { dealRowFromExtraction, type Extraction } from "@/lib/core/plan";
import { Badge, Card, Empty, Err, Title, adminFetch, useLoad } from "@/components/admin/kit";

const SAMPLE: Extraction = {
  kind: "brand_offer", brand: "New Balance", contactName: "Sam Ortiz", contactEmail: "sam@newbalance.example", category: "athletic footwear", fee: 14000, currency: "USD",
  deliverables: "2 Reels, 3 Stories", usageRights: "6 months paid usage", usageMonths: 6, exclusivity: null, exclusivityCategory: null, exclusivityUntil: null, contentDue: "2027-03-03",
  postStart: "2027-03-10", postEnd: "2027-03-21", paymentTerms: "Net 45", paymentNetDays: 45, summary: "", terms: [],
};
const FIELDS: { key: keyof DealFields; label: string }[] = [
  { key: "brand", label: "Brand" }, { key: "fee", label: "Fee" }, { key: "deliverables", label: "Deliverables" }, { key: "usage_rights", label: "Usage rights" }, { key: "usage_rights_end", label: "Usage rights end" },
  { key: "exclusivity_until", label: "Exclusivity until" }, { key: "post_start", label: "Post start" }, { key: "post_end", label: "Post end" }, { key: "payment_terms", label: "Payment terms" }, { key: "payment_due", label: "Payment due" }, { key: "status", label: "Status" },
];

export default function Data() {
  const runs = useLoad<any>("/api/admin/runs?kind=classify&source=live");
  const [json, setJson] = useState(JSON.stringify(SAMPLE, null, 2));
  const [names, setNames] = useState("Brand, Fee, Deliverables, Usage Rights, Exclusivity Until, Post Start, Post End, Payment Terms, Payment Due, Status");
  const [status, setStatus] = useState<DealFields["status"]>("active");
  const [err, setErr] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      return { x: JSON.parse(json) as Extraction, e: null as string | null };
    } catch {
      return { x: null, e: "That isn't valid JSON." };
    }
  }, [json]);
  const fieldNames = names.split(",").map((s) => s.trim()).filter(Boolean);
  const deal = parsed.x ? dealRowFromExtraction(parsed.x, status) : null;
  const at = deal ? dealToAirtableFields(fieldNames, deal) : {};
  const row = deal ? dealToSheetRow(deal) : [];
  const load = async (id: string) => {
    setErr(null);
    try {
      const { run } = await adminFetch<any>(`/api/admin/runs/${id}`);
      setJson(JSON.stringify({ ...SAMPLE, ...run.output }, null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <>
      <Title title="Data" sub="See exactly how an extracted deal is saved: to Fluent, to an Airtable table, and to a Sheets row. Change the field names to test other layouts." />
      <Err error={err || parsed.e} />
      <div className="ad-grid ad-g2">
        <Card title="Extraction">
          <div className="ad-row" style={{ marginBottom: 10 }}>
            <select className="ad-sel" defaultValue="" onChange={(e) => e.target.value && load(e.target.value)}>
              <option value="">Load from a recent run…</option>
              {(runs.data?.runs ?? []).filter((r: any) => !r.error).slice(0, 20).map((r: any) => <option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString()}</option>)}
            </select>
            <select className="ad-sel" value={status} onChange={(e) => setStatus(e.target.value as DealFields["status"])}><option value="offer">Saved as: offer</option><option value="active">Saved as: active</option></select>
          </div>
          <textarea className="ad-ta" style={{ minHeight: 360 }} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        </Card>
        <Card title="Your Airtable fields">
          <p className="ad-mut" style={{ marginTop: 0 }}>Comma-separated field names, as in the table you'd connect. Fluent matches its fields to yours by name.</p>
          <textarea className="ad-ta" style={{ minHeight: 90 }} value={names} onChange={(e) => setNames(e.target.value)} />
        </Card>
      </div>
      <Card title="How it would be saved" pad={false}>
        {!deal ? <Empty>Fix the JSON to see the result.</Empty> : (
          <table className="ad-t">
            <thead><tr><th>Fluent field</th><th>Value</th><th>Airtable field it lands in</th><th>Sheet column</th></tr></thead>
            <tbody>
              {FIELDS.map((f) => {
                const v = (deal as any)[f.key];
                const k = pickKey(fieldNames, f.key);
                const col = SHEET_COLUMNS.findIndex((c) => c.toLowerCase().replace(/ /g, "") === f.label.toLowerCase().replace(/ /g, ""));
                return (
                  <tr key={f.key}>
                    <td><b>{f.label}</b></td>
                    <td className="ad-mono">{v == null || v === "" ? <span className="ad-mut">empty</span> : String(v)}</td>
                    <td>{k ? <><Badge tone={v == null || v === "" ? "n" : "good"}>{k}</Badge></> : <Badge tone={v == null || v === "" ? "n" : "warn"}>{v == null || v === "" ? "no field" : "no matching field, not saved"}</Badge>}</td>
                    <td className="ad-mut">{col >= 0 ? SHEET_COLUMNS[col] : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {deal && (
        <div className="ad-grid ad-g2">
          <Card title="Airtable record that would be created"><pre className="ad-json">{JSON.stringify(at, null, 2)}</pre></Card>
          <Card title="Sheet row that would be appended"><pre className="ad-json">{SHEET_COLUMNS.map((c, i) => `${c}: ${row[i] === "" ? "(empty)" : row[i]}`).join("\n")}</pre></Card>
        </div>
      )}
      <p className="ad-mut">This runs Fluent's real mapping code in your browser. Nothing is written anywhere.</p>
    </>
  );
}
