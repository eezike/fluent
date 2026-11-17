"use client";
import Link from "next/link";
import { useState } from "react";
import { lineDiff } from "@/lib/admin/diff";
import { Badge, Card, Empty, Err, Title, ago, pct, useLoad } from "@/components/admin/kit";

const NAMES: Record<string, string> = { new_offer: "New offer", offer_flagged: "Flagged offer", payment_overdue: "Overdue payment", usage_ending: "Usage rights ending", ask_source_of_truth: "Source question", answer: "Answer", task: "Task" };

export default function Feedback() {
  const [days, setDays] = useState(30);
  const { data, error } = useLoad<any>(`/api/admin/feedback?days=${days}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Title title="Feedback" sub="What people actually do with Fluent's cards. A prompt that gets dismissed or edited a lot needs work." right={<select className="ad-sel" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>} />
      <Err error={error} />
      <Card title="By card type" pad={false}>
        {!data || data.summary.length === 0 ? <Empty>No decisions yet. Approvals, dismissals and edits appear here as people use Fluent.</Empty> : (
          <table className="ad-t">
            <thead><tr><th>Card</th><th>Approved</th><th>Dismissed</th><th>Approve rate</th><th>Edited before approving</th><th>Asked for changes</th></tr></thead>
            <tbody>
              {data.summary.map((s: any) => (
                <tr key={s.type}>
                  <td><b>{NAMES[s.type] ?? s.type}</b></td><td>{s.approved}</td><td>{s.dismissed}</td>
                  <td>{s.approveRate == null ? "–" : <b className={s.approveRate >= 0.7 ? "ad-good" : "ad-bad"}>{pct(s.approveRate)}</b>}</td>
                  <td>{s.editRate == null ? "–" : <>{s.edited} <span className="ad-mut">({pct(s.editRate)})</span></>}</td><td>{s.refined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Dismissed, refined and edited" pad={false}>
        {!data || data.recent.length === 0 ? <Empty>Nothing to review.</Empty> : (
          <table className="ad-t">
            <thead><tr><th>What</th><th>Card</th><th>When</th><th /></tr></thead>
            <tbody>
              {data.recent.flatMap((r: any) => [
                <tr key={r.id} className="ad-click" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td>{r.detail?.title ?? "–"}</td>
                  <td><Badge tone={r.event === "dismissed" ? "bad" : r.event === "refined" ? "blue" : "warn"}>{r.event === "approved" ? "edited" : r.event}</Badge> <span className="ad-mut">{NAMES[r.notif_type] ?? r.notif_type}</span></td>
                  <td className="ad-mut">{ago(r.created_at)}</td>
                  <td style={{ textAlign: "right" }}>{r.run_id && <Link href={`/admin/runs/${r.run_id}`} onClick={(e) => e.stopPropagation()}>Open run</Link>}</td>
                </tr>,
                open === r.id && (
                  <tr key={r.id + "d"}><td colSpan={4} style={{ background: "#FCFBF8" }}>
                    {r.detail?.message && <p style={{ margin: "0 0 8px" }}><span className="ad-mut">They asked: </span>“{r.detail.message}”</p>}
                    {(r.detail?.diffs ?? []).map((d: any, i: number) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <span className="ad-lbl">{d.actionKind} · {d.field}</span>
                        <div className="ad-diff">{lineDiff(d.before, d.after).map((l, j) => <div key={j} className={l.kind === "same" ? "" : l.kind}>{l.kind === "add" ? "+ " : l.kind === "del" ? "– " : "  "}{l.text || " "}</div>)}</div>
                      </div>
                    ))}
                    {!r.detail?.message && !(r.detail?.diffs ?? []).length && <span className="ad-mut">Dismissed without a reason. Open the run to see what Fluent extracted, and turn it into an eval case if it was wrong.</span>}
                  </td></tr>
                ),
              ])}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
