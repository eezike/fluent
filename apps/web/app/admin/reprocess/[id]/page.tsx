"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Card, Empty, Err, Stat, Title, useLoad } from "@/components/admin/kit";

const show = (v: unknown) => (v == null ? "–" : String(v));

export default function ReprocessJob() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useLoad<any>(`/api/admin/reprocess/${id}`, (d) => (d?.job?.status === "running" ? 2000 : null));
  if (!data) return <><Title title="Reprocess" /><Err error={error} /></>;
  const { job, results } = data;
  const changed = results.filter((r: any) => r.changed_fields.length);
  const errs = results.filter((r: any) => r.error);
  return (
    <>
      <Title title="Reprocess results" sub="Dry run. Nothing was changed for any user." right={<Link href="/admin/reprocess">All reprocesses</Link>} />
      <Err error={job.error} />
      <div className="ad-grid ad-g4">
        <Stat label="Emails re-read" value={job.status === "running" ? `${job.done}/${job.total}` : results.length} />
        <Stat label="Would change" value={job.changed} tone={job.changed ? "bad" : "good"} sub={job.status === "done" ? `${results.length ? Math.round((job.changed / results.length) * 100) : 0}% of emails` : undefined} />
        <Stat label="Unchanged" value={results.length - changed.length - errs.length} />
        <Stat label="Errors" value={errs.length} tone={errs.length ? "bad" : undefined} />
      </div>
      <Card title="What would change" pad={false}>
        {changed.length === 0 ? <Empty>{job.status === "running" ? "Working…" : "Nothing would change with this prompt."}</Empty> : (
          <table className="ad-t"><thead><tr><th>Email</th><th>Field</th><th>Before</th><th>After</th><th /></tr></thead><tbody>
            {changed.flatMap((r: any) => r.changed_fields.map((f: string, i: number) => (
              <tr key={r.id + f}>
                <td>{i === 0 ? <><b>{r.before?.brand ?? "Unknown brand"}</b><div className="ad-mut" style={{ fontSize: 11.5 }}>{r.before?.summary?.slice(0, 80)}</div></> : ""}</td>
                <td className="ad-mono">{f}</td>
                <td className="ad-mono" style={{ background: "#FBECE9" }}>{show(r.before?.[f])}</td>
                <td className="ad-mono" style={{ background: "#E9F4EC" }}>{show(r.after?.[f])}</td>
                <td>{i === 0 && r.source_run_id && <Link href={`/admin/runs/${r.source_run_id}`}>Run</Link>}</td>
              </tr>
            )))}
          </tbody></table>
        )}
      </Card>
      {errs.length > 0 && <Card title="Errors" pad={false}><table className="ad-t"><tbody>{errs.map((r: any) => <tr key={r.id}><td><Badge tone="bad">error</Badge></td><td>{r.error}</td></tr>)}</tbody></table></Card>}
    </>
  );
}
