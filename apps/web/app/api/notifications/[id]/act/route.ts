import { after } from "next/server";
import type { ActRequest } from "@fluent/shared";
import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getRow, rowToDTO, setStatus } from "@/lib/notifications";
import { completeWithoutActions, runJob, startJob } from "@/lib/jobs/run";
import { chooseSot, importDeals } from "@/lib/sync/source";
import { runDateChecks } from "@/lib/sync/dates";
import { runTask, startTask } from "@/lib/ask";

export const runtime = "nodejs";
export const maxDuration = 120;
export const OPTIONS = options;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = (await req.json()) as ActRequest;
  const row = await getRow(user.id, id);

  switch (body?.action) {
    case "approve": {
      if (row.type === "ask_source_of_truth") throw new HttpError(400, "Choose Airtable or Sheets.");
      if (!(row.proposed?.actions ?? []).length) {
        if (row.status !== "open") throw new HttpError(409, "This has already been handled.");
        await completeWithoutActions(user.id, id);
        return json({ notification: rowToDTO(await getRow(user.id, id)) });
      }
      const { jobId, notification } = await startJob(user.id, id, body.edits);
      after(() => runJob(user.id, jobId));
      return json({ notification: rowToDTO(notification) });
    }
    case "dismiss": {
      if (row.status !== "open") throw new HttpError(409, "This has already been handled.");
      return json({ notification: rowToDTO(await setStatus(user.id, id, "dismissed", { proposed: { ...row.proposed, resultTag: "Dismissed" } })) });
    }
    case "snooze": {
      const until = new Date(Date.now() + 24 * 3600_000).toISOString();
      return json({ notification: rowToDTO(await setStatus(user.id, id, "open", { snoozed_until: until })) });
    }
    case "answer": {
      if (row.type !== "ask_source_of_truth" || row.status !== "open") throw new HttpError(400, "Nothing to answer.");
      if (body.choice !== "airtable" && body.choice !== "sheets") throw new HttpError(400, "Invalid choice.");
      await chooseSot(user.id, body.choice);
      const done = await setStatus(user.id, id, "done", { proposed: { ...row.proposed, resultTag: body.choice === "airtable" ? "Using Airtable" : "Using Sheets" }, steps: [...(row.steps ?? []).filter((s: any) => s.state === "done"), { label: `You chose ${body.choice === "airtable" ? "Airtable" : "Google Sheets"}`, state: "done" }] });
      after(async () => {
        await importDeals(user.id, { force: true });
        await runDateChecks(user.id);
      });
      return json({ notification: rowToDTO(done) });
    }
    case "convert": {
      const n = await startTask(user.id, row.title);
      after(() => runTask(user.id, n.id, row.title));
      return json({ notification: n });
    }
    default:
      throw new HttpError(400, "Unknown action");
  }
});
