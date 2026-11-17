import type { DemoStore } from "./mockApi";

export type Ctx = {
  store: DemoStore;
  /** True while replaying earlier steps to get back to a chapter. Skips delays and typing. */
  instant: boolean;
  alive: () => boolean;
  click: (sel: string) => void;
  has: (sel: string) => boolean;
  type: (sel: string, text: string) => Promise<void>;
  waitFor: (sel: string, ms?: number) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
};

export type Step = {
  chapter: number;
  title: string;
  body: string;
  /** CSS selector of what to spotlight. */
  target?: string;
  /** How long auto-play stays on this step. */
  dwell: number;
  enter?: (c: Ctx) => Promise<void>;
};

export const CHAPTERS = [
  { name: "Offer arrives", long: "An offer arrives", secs: 10 },
  { name: "Review", long: "Review before it acts", secs: 20 },
  { name: "Approve", long: "Approve and watch it work", secs: 15 },
  { name: "Bad offer", long: "A bad offer, caught", secs: 25 },
  { name: "Ask", long: "Ask anything", secs: 15 },
];

const NB = '[data-demo="card-demo-nb"]';
const AD = '[data-demo="card-demo-adidas"]';

export const STEPS: Step[] = [
  {
    chapter: 1,
    title: "Fluent found an offer in the inbox",
    body: "It read the email and the attached brief, and checked the offer against your past deals. You didn’t have to open anything.",
    target: NB,
    dwell: 4800,
    enter: async (c) => {
      c.store.arrive();
      await c.waitFor(NB, 4000);
    },
  },
  {
    chapter: 2,
    title: "Open it, and Fluent shows its work",
    body: "Not just a verdict. You get exactly what it found and what it wants to do.",
    target: '[data-demo="detail-head"]',
    dwell: 3800,
    enter: async (c) => {
      await c.sleep(c.instant ? 0 : 600);
      c.click(`${NB} [data-demo="card-primary"]`);
      await c.waitFor('[data-demo="changes"]');
    },
  },
  {
    chapter: 2,
    title: "Changes show exactly what will happen",
    body: "A calendar entry, a deal row and a reply draft. Nothing is sent until you approve.",
    target: '[data-demo="changes"]',
    dwell: 5200,
  },
  {
    chapter: 2,
    title: "Steps show what it did, and what’s left",
    body: "Every term links back to the exact words in the email. Sources show where Fluent looked.",
    target: '[data-demo="steps"]',
    dwell: 5200,
    enter: async (c) => {
      document.querySelector('[data-demo="steps"]')?.scrollIntoView({ block: "center" });
      await c.sleep(c.instant ? 0 : 200);
    },
  },
  {
    chapter: 3,
    title: "You stay in charge",
    body: "One tap approves all three actions. Or edit the draft first, or dismiss it.",
    target: '[data-demo="approve"]',
    dwell: 3500,
  },
  {
    chapter: 3,
    title: "Approved. It does the work",
    body: "Each step ticks off live. When it’s finished, it moves to Done with a record of what changed.",
    target: '[data-demo="steps"]',
    dwell: 7000,
    enter: async (c) => {
      await c.sleep(c.instant ? 0 : 900);
      c.click('[data-demo="approve"]');
      await c.sleep(c.instant ? 200 : 300);
    },
  },
  {
    chapter: 4,
    title: "It caught a bad offer",
    body: "38% below your recent rate, and it clashes with your Nike exclusivity. Fluent drafted a counter instead of saying yes.",
    target: '[data-demo="changes"]',
    dwell: 6000,
    enter: async (c) => {
      if (c.has('[data-demo="back"]')) {
        c.click('[data-demo="back"]');
        await c.sleep(250);
      }
      await c.sleep(c.instant ? 0 : 500);
      c.click(`${AD} [data-demo="card-primary"]`);
      await c.sleep(c.instant ? 150 : 350);
      await c.waitFor('[data-demo="changes"]');
    },
  },
  {
    chapter: 4,
    title: "Tell it what to change",
    body: "Ask in plain words and the draft updates. Nothing leaves your Gmail until you send it.",
    target: '[data-demo="changes"]',
    dwell: 6500,
    enter: async (c) => {
      await c.sleep(c.instant ? 0 : 700);
      await c.type('[data-demo="reply"] input', "Can we go to $18,000 instead?");
      await c.sleep(c.instant ? 0 : 300);
      c.click('[data-demo="reply"] button');
      await c.sleep(c.instant ? 200 : 500);
    },
  },
  {
    chapter: 5,
    title: "Ask anything about your deals",
    body: "Answer reads your data and replies, with its sources. Nothing changes. “Do it” would start a task you can approve.",
    target: '[data-demo="answer"]',
    dwell: 6500,
    enter: async (c) => {
      if (c.has('[data-demo="back"]')) {
        c.click('[data-demo="back"]');
        await c.sleep(250);
      }
      await c.sleep(c.instant ? 0 : 400);
      await c.type('[data-demo="ask"] input', "Which payments are late?");
      await c.sleep(c.instant ? 0 : 400);
      c.click('[data-demo="ask-answer"]');
      await c.waitFor('[data-demo="answer"]');
    },
  },
];

export const firstStepOf = (chapter: number) => STEPS.findIndex((s) => s.chapter === chapter);
