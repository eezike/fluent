// Turns an extracted offer / a due date into a notification plan. Pure: all I/O happens elsewhere.
import type { Change, Flag, NotificationCategory, PlannedAction, Source, Step, Term } from "@fluent/shared";
import { type DealLite, addDays, counterTerms, daysBetween, exclusivityConflict, fmtWindow, money, paymentDue, rateFlag, recentAverage, shortDate } from "./rules";
import type { DealFields } from "./mapping";

export type Sot = "airtable" | "sheets" | null;

export type Extraction = {
  kind: "brand_offer" | "contract" | "payment_update" | "other";
  brand: string | null;
  contactName: string | null;
  contactEmail: string | null;
  category: string | null;
  fee: number | null;
  currency: string;
  deliverables: string | null;
  usageRights: string | null;
  usageMonths: number | null;
  exclusivity: string | null;
  exclusivityCategory: string | null;
  exclusivityUntil: string | null;
  contentDue: string | null;
  postStart: string | null;
  postEnd: string | null;
  paymentTerms: string | null;
  paymentNetDays: number | null;
  summary: string;
  terms: Term[];
};

export type Plan = {
  category: NotificationCategory;
  type: string;
  urgency: "normal" | "urgent";
  title: string;
  body: string;
  flags: Flag[];
  terms: Term[];
  steps: Step[];
  sources: Source[];
  changes: Change[];
  changeNote: string;
  primaryLabel: string;
  detailPrimaryLabel: string;
  secondaryLabel: string;
  actions: PlannedAction[];
};

const sotName = (s: Sot) => (s === "airtable" ? "Airtable" : s === "sheets" ? "Google Sheets" : "Fluent");
const sotApp = (s: Sot): Source["app"] => (s === "airtable" ? "airtable" : s === "sheets" ? "sheets" : "fluent");
const done = (label: string): Step => ({ label, state: "done" });
const todo = (label: string): Step => ({ label, state: "todo" });
let seq = 0;
const aid = (kind: string) => `${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function dealRowFromExtraction(x: Extraction, status: DealFields["status"]): Partial<DealFields> & { brand: string } {
  const due = paymentDue(x.postEnd, x.paymentNetDays);
  return {
    brand: x.brand ?? "Unknown brand",
    fee: x.fee,
    currency: x.currency || "USD",
    category: x.category,
    deliverables: x.deliverables,
    usage_rights: x.usageRights,
    usage_rights_end: x.postEnd && x.usageMonths ? addDays(x.postEnd, x.usageMonths * 30) : null,
    exclusivity_category: x.exclusivityCategory ?? (x.exclusivity ? x.category : null),
    exclusivity_until: x.exclusivityUntil,
    post_start: x.postStart,
    post_end: x.postEnd,
    payment_terms: x.paymentTerms,
    payment_due: due,
    status,
  };
}

export type OfferInput = {
  x: Extraction;
  threadId?: string;
  subject: string;
  deals: DealLite[];
  today: string;
  sot: Sot;
  acceptBody: string;
  counterBody: (c: { fee: number; postStart: string | null; postEnd: string | null }) => string;
  /** Attachments Fluent looked at. `meta` is shown under Sources, e.g. "PDF · 4 pages". */
  attachments?: { name: string; meta: string }[];
};

export function analyze(x: Extraction, deals: DealLite[], today: string) {
  const brand = x.brand ?? "A brand";
  const avg = recentAverage(deals);
  const rate = rateFlag(x.fee, deals);
  const conflict = exclusivityConflict({ brand, category: x.category, postStart: x.postStart, postEnd: x.postEnd }, deals, today);
  const counter = rate || conflict ? counterTerms(x, avg?.avg ?? null, conflict?.until ?? null) : null;
  return { avg, rate, conflict, counter };
}

export function planOffer(i: OfferInput): Plan {
  const { x } = i;
  const brand = x.brand ?? "A brand";
  const contact = x.contactName || x.contactEmail || "the sender";
  const { avg, rate, conflict } = analyze(x, i.deals, i.today);
  const baseSources: Source[] = [{ app: "gmail", name: `Offer email from ${contact}`, meta: "Gmail" }];
  for (const a of i.attachments ?? []) baseSources.push({ app: "gmail", name: a.name, meta: a.meta });
  const terms = x.terms;

  if (rate || conflict) {
    const flags: Flag[] = [];
    if (rate) flags.push({ title: `${rate.pctBelow}% below your recent rate`, detail: `${money(x.fee!, x.currency)} offered against a ${money(rate.avg)} average across your last ${rate.n} deals.` });
    if (conflict) flags.push({ title: `Conflicts with ${conflict.brand} exclusivity`, detail: `Posts ${fmtWindow(x.postStart, x.postEnd)}. ${conflict.brand} bars ${conflict.category || "competing work"} until ${shortDate(conflict.until)}.` });
    const c = counterTerms(x, avg?.avg ?? null, conflict?.until ?? null);
    const oldTxt = `Fee ${x.fee ? money(x.fee, x.currency) : "not stated"} · posts ${fmtWindow(x.postStart, x.postEnd)}`;
    const newTxt = `Fee ${money(c.fee, x.currency)} · posts ${fmtWindow(c.postStart, c.postEnd)}${conflict ? ", after " + conflict.brand + "’s window" : ""}`;
    const changed = (c.fee !== (x.fee ?? 0) ? 1 : 0) + (c.postStart !== x.postStart ? 1 : 0);
    const title = rate
      ? `${brand} offer is ${rate.pctBelow}% below your recent rate`
      : `${brand} offer conflicts with ${conflict!.brand} exclusivity`;
    const body = [conflict ? `It also conflicts with ${conflict.brand} exclusivity until ${shortDate(conflict.until)}.` : rate ? "" : "", "I drafted a counter for you to review."].filter(Boolean).join(" ");
    const sources: Source[] = [...baseSources];
    if (conflict) sources.push({ app: sotApp(i.sot), name: `${conflict.brand} deal`, meta: `${sotName(i.sot)} · exclusive to ${shortDate(conflict.until)}` });
    if (rate) sources.push({ app: sotApp(i.sot), name: "Your recent deals", meta: `${sotName(i.sot)} · average ${money(rate.avg)}` });
    const to = x.contactEmail ?? "";
    const actions: PlannedAction[] = [
      { id: aid("deal"), kind: "deal.upsert", hidden: true, summary: "Record the offer", params: { deal: dealRowFromExtraction(x, "offer"), threadId: i.threadId, contactEmail: x.contactEmail }, status: "planned" },
      { id: aid("draft"), kind: "gmail.draft", summary: `Gmail: save a counter draft to ${contact} (not sent)`, params: { to, subject: i.subject.toLowerCase().startsWith("re:") ? i.subject : `Re: ${i.subject}`, body: i.counterBody(c), threadId: i.threadId }, status: "planned" },
    ];
    return {
      category: "attention",
      type: "offer_flagged",
      urgency: conflict ? "urgent" : "normal",
      title,
      body,
      flags,
      terms,
      steps: [
        { label: `Read the ${brand} offer${i.attachments?.length ? (i.attachments.length === 1 ? " and its attachment" : ` and ${i.attachments.length} attachments`) : ""}`, state: "done" },
        done(rate ? `Compared with your recent deals: ${rate.pctBelow}% below` : "Compared with your recent deals"),
        ...(conflict ? [done(`Found the ${conflict.brand} exclusivity overlap`)] : []),
        done("Drafted a counter" + (conflict ? " with later dates" : "")),
        todo("Save the draft, and I’ll leave sending to you"),
      ],
      sources,
      changes: [{ kind: "old", text: oldTxt }, { kind: "new", text: newTxt }],
      changeNote: `${changed || 1} term${changed > 1 ? "s" : ""} changed${c.fee > (x.fee ?? 0) ? ` · ${money(c.fee - (x.fee ?? 0), x.currency)} above the offer` : ""}`,
      primaryLabel: "Review",
      detailPrimaryLabel: "Save draft",
      secondaryLabel: "Dismiss",
      actions,
    };
  }

  // A normal offer: set everything up once the user approves.
  const events: { title: string; date: string }[] = [];
  const due = paymentDue(x.postEnd, x.paymentNetDays);
  if (x.contentDue) events.push({ title: `Content due: ${brand}`, date: x.contentDue });
  if (x.postStart) events.push({ title: `Posting window opens: ${brand}`, date: x.postStart });
  if (due) events.push({ title: `Payment expected: ${brand}`, date: due });
  const row = dealRowFromExtraction(x, "active");
  const actions: PlannedAction[] = [{ id: aid("deal"), kind: "deal.upsert", hidden: true, summary: "Record the deal", params: { deal: row, threadId: i.threadId, contactEmail: x.contactEmail }, status: "planned" }];
  const changes: Change[] = [];
  if (events.length) {
    const label = (e: { title: string; date: string }) => `${shortDate(e.date)} ${e.title.split(":")[0].replace("Posting window opens", "window opens").replace("Content due", "content due").replace("Payment expected", "payment expected").toLowerCase()}`;
    const summary = `Calendar: ${events.map(label).join(" · ")}`;
    actions.push({ id: aid("cal"), kind: "calendar.event", summary, params: { events }, status: "planned" });
    changes.push({ kind: "new", text: summary });
  }
  if (i.sot) {
    const summary = `${sotName(i.sot)}: new row in Deals — ${brand}${x.fee ? ` · ${money(x.fee, x.currency)}` : ""}${x.paymentTerms ? ` · ${x.paymentTerms}` : ""}`;
    actions.push({ id: aid("src"), kind: "source.append", summary, params: { target: i.sot, deal: row }, status: "planned" });
    changes.push({ kind: "new", text: summary });
  }
  if (x.contactEmail) {
    const summary = `Gmail: draft reply to ${contact} (not sent)`;
    actions.push({ id: aid("draft"), kind: "gmail.draft", summary, params: { to: x.contactEmail, subject: i.subject.toLowerCase().startsWith("re:") ? i.subject : `Re: ${i.subject}`, body: i.acceptBody, threadId: i.threadId }, status: "planned" });
    changes.push({ kind: "new", text: summary });
  }
  const visible = actions.filter((a) => !a.hidden).length;
  const inRange = avg && x.fee ? (x.fee >= avg.avg * 0.85 && x.fee <= avg.avg * 1.25 ? "in range" : x.fee > avg.avg * 1.25 ? "above your usual" : "") : "";
  const sources = [...baseSources];
  if (avg) sources.push({ app: sotApp(i.sot), name: "Your recent deals", meta: `${sotName(i.sot)} · last ${avg.n} deals` });
  return {
    category: "opportunity",
    type: "new_offer",
    urgency: "normal",
    title: `New deal offer from ${brand}`,
    body: `${x.deliverables ?? "Details are in the email"}${x.fee ? `, ${money(x.fee, x.currency)}` : ""}. ${inRange === "in range" ? "In line with your recent deals. " : ""}Ready to set up.`,
    flags: [],
    terms,
    steps: [
      done(i.attachments?.length ? `Read the email and ${i.attachments.length === 1 ? "its attachment" : `${i.attachments.length} attachments`}` : "Read the email"),
      done(`Pulled out ${terms.length} term${terms.length === 1 ? "" : "s"}, each linked to its quote`),
      ...(avg ? [done(`Compared with your last ${avg.n} deals${inRange ? `: ${inRange}` : ""}`)] : []),
      done(`Prepared ${visible} action${visible === 1 ? "" : "s"}`),
      todo(`Approve, and I’ll run ${visible === 1 ? "it" : `all ${visible}`}`),
      todo("Then mark the deal active"),
    ],
    sources,
    changes,
    changeNote: `${visible} change${visible === 1 ? "" : "s"} · nothing is sent until you approve`,
    primaryLabel: "Process deal",
    detailPrimaryLabel: `Approve ${visible} action${visible === 1 ? "" : "s"}`,
    secondaryLabel: "Dismiss",
    actions,
  };
}

export type DueDeal = {
  id: string;
  brand: string;
  fee: number | null;
  currency: string;
  payment_due: string | null;
  usage_rights_end: string | null;
  contact_email: string | null;
  thread_id: string | null;
};

export function planOverdue(d: DueDeal, today: string, sot: Sot, body: string): Plan {
  const late = daysBetween(d.payment_due!, today);
  const amount = d.fee ? money(d.fee, d.currency) : "an unpaid invoice";
  const actions: PlannedAction[] = d.contact_email
    ? [{ id: aid("send"), kind: "gmail.send", summary: `Gmail: send a follow-up to ${d.contact_email} (${late} days late)`, params: { to: d.contact_email, subject: `Following up on ${d.brand} payment`, body, threadId: d.thread_id ?? undefined }, status: "planned" }]
    : [];
  return {
    category: "money",
    type: "payment_overdue",
    urgency: late > 30 ? "urgent" : "normal",
    title: `Payment overdue: ${d.brand}`,
    body: `${late} day${late === 1 ? "" : "s"} late, ${amount}. ${d.contact_email ? "Follow-up drafted in your tone. Approve to send." : "I don’t have a contact email for this deal."}`,
    flags: [{ title: `${late} days past due`, detail: `Due ${shortDate(d.payment_due!)}, not marked paid in ${sotName(sot)}.` }],
    terms: [],
    steps: [
      done(`Checked ${sotName(sot)} for unpaid deals`),
      done(`Found ${d.brand} is ${late} days past due`),
      ...(d.contact_email ? [done("Drafted a follow-up in your tone"), todo("Approve, and I’ll send it"), todo("Then log the follow-up")] : [todo("Add a contact email to the deal, then ask me again")]),
    ],
    sources: [{ app: sotApp(sot), name: `${d.brand} deal`, meta: `${sotName(sot)} · due ${shortDate(d.payment_due!)}` }, ...(d.thread_id ? [{ app: "gmail" as const, name: "Original deal thread", meta: "Gmail" }] : [])],
    changes: actions.length ? [{ kind: "new", text: actions[0].summary }] : [],
    changeNote: actions.length ? "1 change · nothing is sent until you approve" : "",
    primaryLabel: d.contact_email ? "Approve & send" : "Dismiss",
    detailPrimaryLabel: d.contact_email ? "Approve & send" : "Dismiss",
    secondaryLabel: "Refine",
    actions,
  };
}

export function planUsageEnding(d: DueDeal, today: string, sot: Sot, body: string): Plan {
  const left = daysBetween(today, d.usage_rights_end!);
  const actions: PlannedAction[] = d.contact_email
    ? [{ id: aid("draft"), kind: "gmail.draft", summary: `Gmail: draft a renewal question to ${d.contact_email} (not sent)`, params: { to: d.contact_email, subject: `${d.brand} usage rights`, body, threadId: d.thread_id ?? undefined }, status: "planned" }]
    : [];
  return {
    category: "attention",
    type: "usage_ending",
    urgency: left <= 3 ? "urgent" : "normal",
    title: `Usage rights ending soon: ${d.brand}`,
    body: `Rights end ${shortDate(d.usage_rights_end!)} (${left} day${left === 1 ? "" : "s"}). ${d.contact_email ? "I drafted a note asking about renewal." : "Content should come down or be renewed."}`,
    flags: [{ title: `Ends in ${left} days`, detail: `Usage rights for ${d.brand} end ${shortDate(d.usage_rights_end!)}.` }],
    terms: [],
    steps: [done(`Checked ${sotName(sot)} for upcoming usage-rights end dates`), done(`${d.brand} ends in ${left} days`), ...(actions.length ? [done("Drafted a renewal question"), todo("Save the draft, and I’ll leave sending to you")] : [])],
    sources: [{ app: sotApp(sot), name: `${d.brand} deal`, meta: `${sotName(sot)} · usage to ${shortDate(d.usage_rights_end!)}` }],
    changes: actions.length ? [{ kind: "new", text: actions[0].summary }] : [],
    changeNote: actions.length ? "1 change · nothing is sent" : "",
    primaryLabel: actions.length ? "Save draft" : "Dismiss",
    detailPrimaryLabel: actions.length ? "Save draft" : "Dismiss",
    secondaryLabel: "Dismiss",
    actions,
  };
}

export function planAskSource(both: { airtable: string; sheets: string }): Plan {
  return {
    category: "info",
    type: "ask_source_of_truth",
    urgency: "normal",
    title: "Where do you track deals?",
    body: "I’ll use it for overdue payments and usage-rights alerts. Airtable is more reliable for dates.",
    flags: [],
    terms: [],
    steps: [done("Found both Airtable and Google Sheets connected"), done("Compared them: Airtable has typed date fields, sheets often mix date formats"), todo("Waiting for your choice")],
    sources: [{ app: "airtable", name: both.airtable, meta: "Airtable" }, { app: "sheets", name: both.sheets, meta: "Google Sheets" }],
    changes: [],
    changeNote: "",
    primaryLabel: "Use Airtable",
    detailPrimaryLabel: "Use Airtable",
    secondaryLabel: "Use Sheets",
    actions: [],
  };
}
