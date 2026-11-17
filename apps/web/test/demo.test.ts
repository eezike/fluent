import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoStore, createDemoFetch } from "../../../packages/ui/src/demo/mockApi";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("demo list ranks urgent first and counts correctly", () => {
  const s = new DemoStore(0);
  const l = s.list("active");
  assert.equal(l.items[0].id, "demo-adidas");
  assert.equal(l.counts.inProgress, 1);
  assert.ok(l.counts.toReview >= 3);
  assert.equal(s.list("done").items[0].id, "demo-brooks");
});

test("arrive adds the New Balance offer on top of the open items", () => {
  const s = new DemoStore(0);
  s.arrive();
  assert.ok(s.list("active").items.some((n) => n.id === "demo-nb"));
});

test("approving runs the actions in order and finishes in Done", async () => {
  const s = new DemoStore(5);
  s.arrive();
  const r = s.act("demo-nb", { action: "approve" });
  assert.equal((r.body.notification as any).status, "running");
  await sleep(60);
  const n = s.get("demo-nb")!;
  assert.equal(n.status, "done");
  assert.ok(n.steps.every((x) => x.state === "done"));
  assert.ok(n.actions.every((a) => a.status === "done"));
  assert.ok(s.list("done").items.some((x) => x.id === "demo-nb"));
});

test("refine updates the Adidas counter to the amount typed", () => {
  const s = new DemoStore(0);
  const r = s.refine("demo-adidas", "Can we go to $18,000 instead?");
  const n = r.body.notification as any;
  assert.match(n.changes.find((c: any) => c.kind === "new").text, /\$18,000/);
  assert.match(n.actions[0].params.body, /\$18,000/);
  assert.equal(n.thread.length, 3);
  assert.match(n.changeNote, /\$8,700 above/);
});

test("ask answers late payments from the demo data and is honest about the rest", () => {
  const s = new DemoStore(0);
  const a = (s.ask("Which payments are late?", "answer").body.notification as any);
  assert.match(a.answer, /Tern Audio/);
  assert.equal(a.type, "answer");
  const b = (s.ask("What is the weather?", "answer").body.notification as any);
  assert.match(b.answer, /In the demo/);
});

test("the fetch wrapper speaks the same shapes as the real API", async () => {
  const s = new DemoStore(0);
  const f = createDemoFetch(s);
  const list = await (await f("/api/notifications?tab=active")).json();
  assert.ok(Array.isArray(list.items) && list.counts.active === list.items.length);
  const one = await (await f("/api/notifications/demo-tern")).json();
  assert.equal(one.notification.id, "demo-tern");
  const missing = await f("/api/notifications/nope");
  assert.equal(missing.status, 404);
  const act = await f("/api/notifications/demo-tern/act", { method: "POST", body: JSON.stringify({ action: "dismiss" }) });
  assert.equal((await act.json()).notification.status, "dismissed");
});

test("demo to do list: add, accept a suggestion, hand one to Fluent, check one off", async () => {
  const s = new DemoStore(0);
  const f = createDemoFetch(s);
  const post = (u: string, b: object) => f(u, { method: "POST", body: JSON.stringify(b) }).then((r) => r.json());
  let l = await (await f("/api/todos")).json();
  assert.equal(l.open.length, 1);
  assert.equal(l.suggested.length, 2);
  await post("/api/todos", { title: "Call Sam" });
  await post("/api/todos/td-2", { action: "accept" });
  await post("/api/todos/td-3", { action: "dismiss" });
  l = await (await f("/api/todos")).json();
  assert.equal(l.open.length, 3);
  assert.equal(l.suggested.length, 0);
  const d = await post("/api/todos/td-1", { action: "delegate" });
  assert.equal(d.notification.status, "running");
  assert.equal(d.todo.notificationId, d.notification.id);
  await post("/api/todos/td-2", { action: "done" });
  l = await (await f("/api/todos")).json();
  assert.ok(!l.open.some((t: any) => t.id === "td-2"));
});
