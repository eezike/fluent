import type { NotificationDTO } from "@fluent/shared";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

type Seed = Omit<NotificationDTO, "createdAt" | "updatedAt"> & { minutesAgo: number };
const make = (s: Seed): NotificationDTO => {
  const { minutesAgo, ...rest } = s;
  return { ...rest, createdAt: ago(minutesAgo), updatedAt: ago(minutesAgo) };
};

/** Fictional brands and a fictional creator. Nothing here is real. */
export const nb = (): NotificationDTO =>
  make({
    id: "demo-nb",
    category: "opportunity",
    type: "new_offer",
    title: "New deal offer from New Balance",
    body: "2 Reels, 3 Stories, $14,000. In line with your recent deals. Ready to set up.",
    urgency: "normal",
    status: "open",
    minutesAgo: 0,
    flags: [],
    terms: [
      { label: "Deliverables", value: "2 Reels, 3 Stories", quote: "2 Instagram Reels and 3 Stories" },
      { label: "Fee", value: "$14,000", quote: "Fee: $14,000" },
      { label: "Usage rights", value: "6 months, paid", quote: "6 months paid usage on brand channels" },
      { label: "Exclusivity", value: "None stated" },
      { label: "Payment", value: "Net 45", quote: "Net 45 payment terms" },
    ],
    steps: [
      { label: "Read the email and attached brief", state: "done" },
      { label: "Pulled out 5 terms, each linked to its quote", state: "done" },
      { label: "Compared with your last 4 deals: in range", state: "done" },
      { label: "Prepared 3 actions", state: "done" },
      { label: "Approve, and I’ll run all 3", state: "todo" },
      { label: "Then mark the deal active", state: "todo" },
    ],
    sources: [
      { app: "gmail", name: "Offer email from Sam Ortiz", meta: "Gmail" },
      { app: "gmail", name: "Summer Run brief.pdf", meta: "PDF · 2 pages" },
      { app: "airtable", name: "Your recent deals", meta: "Airtable · last 4 deals" },
    ],
    changes: [
      { kind: "new", text: "Calendar: content due Mar 3 · window opens Mar 10 · first payment expected May 1" },
      { kind: "new", text: "Airtable: new row in Deals — New Balance · $14,000 · Net 45" },
      { kind: "new", text: "Gmail: draft reply to Sam Ortiz (not sent)" },
    ],
    changeNote: "3 changes · nothing is sent until you approve",
    primaryLabel: "Process deal",
    detailPrimaryLabel: "Approve 3 actions",
    secondaryLabel: "Dismiss",
    actions: [
      { id: "a1", kind: "calendar.event", summary: "Calendar: add the dates", params: { doing: "Adding the dates to your Calendar", done: "Added the dates to your Calendar" }, status: "planned" },
      { id: "a2", kind: "source.append", summary: "Airtable: add the deal", params: { doing: "Adding the deal to Airtable", done: "Added the deal to Airtable" }, status: "planned" },
      { id: "a3", kind: "gmail.draft", summary: "Gmail: draft reply", params: { to: "sam@newbalance.example", subject: "Re: Summer Run partnership", body: "Hi Sam,\n\nThanks for the offer. The Summer Run campaign sounds great and the terms work for me. I’ll send the signed agreement this week.\n\nBest,\nTaylor", doing: "Saving the reply draft in Gmail", done: "Saved the reply draft in Gmail (not sent)" }, status: "planned" },
    ],
    thread: [{ role: "agent", text: "2 Reels and 3 Stories for $14,000, with 6 months of usage and Net 45. It’s in line with your recent deals. Approve and I’ll set it all up." }],
    resultTag: "Calendar · Airtable row · Gmail draft",
  });

export const adidas = (): NotificationDTO =>
  make({
    id: "demo-adidas",
    category: "attention",
    type: "offer_flagged",
    title: "Adidas offer is 38% below your recent rate",
    body: "It also conflicts with Nike exclusivity until Apr 30. I drafted a counter for you to review.",
    urgency: "urgent",
    status: "open",
    minutesAgo: 14,
    flags: [
      { title: "38% below your recent rate", detail: "$9,300 offered against a $15,000 average across your last 4 deals." },
      { title: "Conflicts with Nike exclusivity", detail: "Posts Mar 10 to 24. Nike bars athletic footwear until Apr 30." },
    ],
    terms: [
      { label: "Fee", value: "$9,300", quote: "a flat fee of $9,300" },
      { label: "Posting window", value: "Mar 10 to Mar 24", quote: "posting between March 10 and March 24" },
    ],
    steps: [
      { label: "Read the Adidas offer", state: "done" },
      { label: "Compared with your rate card: 38% below", state: "done" },
      { label: "Found the Nike exclusivity overlap", state: "done" },
      { label: "Drafted a counter with later dates", state: "done" },
      { label: "Save the draft, and I’ll leave sending to you", state: "todo" },
    ],
    sources: [
      { app: "gmail", name: "Offer email from Jo Park", meta: "Gmail" },
      { app: "sheets", name: "Your rate card", meta: "Google Sheets" },
      { app: "airtable", name: "Nike deal", meta: "Airtable · exclusive to Apr 30" },
    ],
    changes: [
      { kind: "old", text: "Fee $9,300 · posts Mar 10 to 24" },
      { kind: "new", text: "Fee $20,000 · posts May 4 to 18, after Nike’s window" },
    ],
    changeNote: "2 terms changed · $10,700 above the offer",
    primaryLabel: "Review",
    detailPrimaryLabel: "Save draft",
    secondaryLabel: "Snooze",
    actions: [
      { id: "b1", kind: "gmail.draft", summary: "Gmail: save a counter draft to Jo Park (not sent)", params: { to: "jo@adidas.example", subject: "Re: Spring partnership", body: "Hi Jo,\n\nThanks for thinking of me. For this scope my rate is $20,000, and I’d need to shift the posting window to May 4 to 18 to avoid an existing exclusivity.\n\nWould that work?\n\nBest,\nTaylor", doing: "Saving the counter draft in Gmail", done: "Saved the counter draft in Gmail (not sent)" }, status: "planned" },
    ],
    thread: [{ role: "agent", text: "Below your rate and overlapping Nike through Apr 30. I drafted a counter at $20,000 with later dates. Ask me to change anything." }],
    resultTag: "Gmail draft",
  });

export const tern = (): NotificationDTO =>
  make({
    id: "demo-tern",
    category: "money",
    type: "payment_overdue",
    title: "Payment overdue: Tern Audio",
    body: "14 days late, $3,200. Follow-up drafted in your tone. Approve to send.",
    urgency: "normal",
    status: "open",
    minutesAgo: 62,
    flags: [],
    terms: [],
    steps: [
      { label: "Checked Airtable for unpaid deals past their due date", state: "done" },
      { label: "Tern Audio is 14 days past Net 30", state: "done" },
      { label: "Drafted a friendly reminder", state: "done" },
      { label: "Approve, and I’ll send it", state: "todo" },
    ],
    sources: [{ app: "airtable", name: "Tern Audio deal", meta: "Airtable · due Nov 3" }, { app: "gmail", name: "Original deal thread", meta: "Gmail" }],
    changes: [{ kind: "new", text: "Gmail: send a reminder to billing@tern.example" }],
    changeNote: "1 change · nothing is sent until you approve",
    primaryLabel: "Approve & send",
    detailPrimaryLabel: "Approve & send",
    secondaryLabel: "Refine",
    actions: [{ id: "c1", kind: "gmail.send", summary: "Gmail: send a reminder", params: { to: "billing@tern.example", subject: "Invoice 0412, past due", body: "Hi,\n\nA quick note that invoice 0412 for $3,200 was due Nov 3. Could you let me know when to expect payment?\n\nThanks,\nTaylor", doing: "Sending the reminder", done: "Sent the reminder" }, status: "planned" }],
    thread: [],
    resultTag: "Reminder sent",
  });

export const sot = (): NotificationDTO =>
  make({
    id: "demo-sot",
    category: "info",
    type: "ask_source_of_truth",
    title: "Where do you track deals?",
    body: "I’ll use it for overdue payments and usage-rights alerts. Airtable is more reliable for dates.",
    urgency: "normal",
    status: "open",
    minutesAgo: 180,
    flags: [],
    terms: [],
    steps: [
      { label: "Found both Airtable and Google Sheets connected", state: "done" },
      { label: "Compared them: Airtable has typed date fields", state: "done" },
      { label: "Waiting for your choice", state: "todo" },
    ],
    sources: [],
    changes: [],
    primaryLabel: "Use Airtable",
    secondaryLabel: "Use Sheets",
    options: [{ value: "airtable", label: "Use Airtable" }, { value: "sheets", label: "Use Google Sheets" }],
    actions: [],
    thread: [],
  });

export const halcyon = (): NotificationDTO =>
  make({
    id: "demo-halcyon",
    category: "opportunity",
    type: "task",
    title: "Reading the Halcyon contract",
    body: "Page 3 of 4. Pulling dates and usage terms.",
    urgency: "normal",
    status: "running",
    progress: 62,
    minutesAgo: 3,
    flags: [],
    terms: [],
    steps: [
      { label: "Noticed a contract from Halcyon in your inbox", state: "done" },
      { label: "Opened the 4-page PDF", state: "done" },
      { label: "Pulled payment terms and usage rights", state: "done" },
      { label: "Read pages 3 and 4 for dates", state: "active" },
      { label: "Then show you the terms to review", state: "todo" },
    ],
    sources: [{ app: "gmail", name: "Halcyon contract.pdf", meta: "Gmail attachment · 4 pages" }],
    changes: [],
    actions: [],
    thread: [{ role: "agent", text: "I’ll finish the contract and show the terms here for your review. Nothing changes in your calendar or Airtable until you approve." }],
  });

export const brooks = (): NotificationDTO =>
  ({ ...make({
    id: "demo-brooks",
    category: "opportunity",
    type: "new_offer",
    title: "Brooks offer accepted",
    body: "",
    urgency: "normal",
    status: "done",
    minutesAgo: 60 * 26,
    flags: [], terms: [], steps: [{ label: "Calendar hold, Airtable row and Gmail draft done", state: "done" }],
    sources: [], changes: [], actions: [], thread: [],
    resultTag: "Calendar · Airtable row · Gmail draft",
  }) });

export const seedActive = (): NotificationDTO[] => [adidas(), tern(), sot(), halcyon()];
export const seedDone = (): NotificationDTO[] => [brooks()];
