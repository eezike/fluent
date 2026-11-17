import type { PlannedAction, Step } from "@fluent/shared";

export type ExecResult = { label?: string; url?: string };
export type Exec = (a: PlannedAction) => Promise<ExecResult>;

const DOING: Record<string, (a: PlannedAction) => string> = {
  "calendar.event": (a) => `Adding ${(a.params.events ?? []).length || ""} event${(a.params.events ?? []).length === 1 ? "" : "s"} to Google Calendar…`.replace("Adding  ", "Adding "),
  "source.append": (a) => `Adding a row to ${a.params.target === "sheets" ? "Google Sheets" : "Airtable"}…`,
  "gmail.draft": () => "Saving the Gmail draft…",
  "gmail.send": () => "Sending the email…",
  "deal.upsert": () => "Recording the deal…",
};
const DONE: Record<string, (a: PlannedAction) => string> = {
  "calendar.event": (a) => `Added ${(a.params.events ?? []).length || ""} event${(a.params.events ?? []).length === 1 ? "" : "s"} to Google Calendar`.replace("Added  ", "Added "),
  "source.append": (a) => `Added a row to ${a.params.target === "sheets" ? "Google Sheets" : "Airtable"}`,
  "gmail.draft": () => "Saved the Gmail draft",
  "gmail.send": () => "Sent the email",
  "deal.upsert": () => "Recorded the deal",
};
export const RESULT_TAG: Record<string, (a: PlannedAction) => string> = {
  "calendar.event": () => "Calendar",
  "source.append": (a) => (a.params.target === "sheets" ? "Sheet row" : "Airtable row"),
  "gmail.draft": () => "Gmail draft",
  "gmail.send": () => "Sent",
};

export function stepsFor(actions: PlannedAction[], failed?: { id: string; error: string }): Step[] {
  const steps: Step[] = [{ label: "Picked up your approval", state: "done" }];
  for (const a of actions.filter((x) => !x.hidden)) {
    if (a.status === "done") steps.push({ label: DONE[a.kind](a), state: "done" });
    else if (failed && failed.id === a.id) steps.push({ label: `Couldn’t finish: ${failed.error}`, state: "todo" });
    else steps.push({ label: DOING[a.kind](a), state: "todo" });
  }
  return steps;
}

export function resultTag(actions: PlannedAction[]): string {
  return actions
    .filter((a) => a.status === "done" && !a.hidden && RESULT_TAG[a.kind])
    .map((a) => RESULT_TAG[a.kind](a))
    .join(" · ");
}

/**
 * Runs actions in order, skipping any already done (so a retry never repeats a send or a calendar event).
 * Stops at the first failure. onUpdate persists progress after every action.
 */
export async function runActions(
  actions: PlannedAction[],
  exec: Exec,
  onUpdate: (actions: PlannedAction[], steps: Step[], error?: string) => Promise<void>,
): Promise<{ ok: boolean; error?: string; actions: PlannedAction[]; steps: Step[] }> {
  const list = actions.map((a) => ({ ...a }));
  await onUpdate(list, stepsFor(list));
  for (const a of list) {
    if (a.status === "done") continue;
    a.status = "running";
    try {
      const r = await exec(a);
      a.status = "done";
      a.result = r;
      await onUpdate(list, stepsFor(list));
    } catch (e) {
      const error = e instanceof Error ? e.message : "Action failed";
      a.status = "failed";
      a.result = { error };
      const steps = stepsFor(list, { id: a.id, error });
      await onUpdate(list, steps, error);
      return { ok: false, error, actions: list, steps };
    }
  }
  const steps = stepsFor(list);
  return { ok: true, actions: list, steps };
}

/** Only these fields may be edited by the user before approving. Everything else is ignored. */
export const EDITABLE: Partial<Record<PlannedAction["kind"], string[]>> = {
  "gmail.draft": ["to", "subject", "body"],
  "gmail.send": ["to", "subject", "body"],
};

export function applyEdits(actions: PlannedAction[], edits?: Record<string, Record<string, unknown>>): PlannedAction[] {
  if (!edits) return actions;
  return actions.map((a) => {
    const e = edits[a.id];
    const allowed = EDITABLE[a.kind];
    if (!e || !allowed) return a;
    const params = { ...a.params };
    for (const k of allowed) if (typeof e[k] === "string") params[k] = (e[k] as string).slice(0, 8000);
    return { ...a, params };
  });
}
