import { useEffect, useState, type ReactNode } from "react";
import { apiGet, apiSend, type ApiOptions, type NotificationList, type SetupStatus } from "@fluent/shared";
import { Icon } from "./icons";
import { cx } from "./util";

export type SourceChoice = "airtable" | "sheets" | "none";
export type OnboardingProps = {
  api: ApiOptions;
  status: SetupStatus;
  start?: "welcome" | "source";
  onConnectGoogle: () => Promise<void>;
  onChooseSource: (c: SourceChoice) => Promise<void>;
  onOpenConnectors: () => void;
  onDemo?: () => void;
  onFinish: () => Promise<void>;
};

const STEPS = ["welcome", "google", "source", "tour1", "tour2", "tour3", "first"] as const;
type Step = (typeof STEPS)[number];

const Shell = ({ step, children, onBack }: { step: Step; children: ReactNode; onBack?: () => void }) => (
  <div className={cx("root", "ob")}>
    <div className={cx("ob-top")}>
      {onBack ? <button className={cx("back")} onClick={onBack}><Icon name="left" size={15} />Back</button> : <span />}
      <div className={cx("ob-dots")} aria-label={`Step ${STEPS.indexOf(step) + 1} of ${STEPS.length}`}>
        {STEPS.map((s) => <i key={s} className={cx(s === step && "on", STEPS.indexOf(s) < STEPS.indexOf(step) && "dn")} />)}
      </div>
      <span />
    </div>
    <div className={cx("ob-c")}><div className={cx("ob-box")}>{children}</div></div>
  </div>
);

const Logo = () => <span className={cx("logo")} style={{ width: 44, height: 44, fontSize: 22, borderRadius: 12, marginBottom: 20 }} aria-hidden="true">F</span>;
const Row = ({ icon, t, s }: { icon: "msg" | "file" | "zap" | "check" | "alert" | "money"; t: string; s: string }) => (
  <div className={cx("ob-row")}><span className={cx("ob-ic")}><Icon name={icon} size={16} /></span><div><b>{t}</b><span>{s}</span></div></div>
);

export function Onboarding(p: OnboardingProps) {
  const [step, setStep] = useState<Step>(p.start ?? "welcome");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<SourceChoice | null>(p.status.sourceOfTruth);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)]);
  const back = STEPS.indexOf(step) > 0 ? () => setStep(STEPS[STEPS.indexOf(step) - 1]) : undefined;
  const run = async (fn: () => Promise<void>, then?: () => void) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      then?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (step === "welcome")
    return (
      <Shell step={step}>
        <Logo />
        <h1>Welcome to Fluent</h1>
        <p className={cx("ob-sub")}>Fluent watches your inbox for brand deals, does the busywork, and asks before it acts. It takes about two minutes to set up.</p>
        <Row icon="msg" t="Finds offers and late payments" s="From your Gmail, without you opening anything." />
        <Row icon="file" t="Prepares the work" s="Calendar entries, deal records and reply drafts, ready to approve." />
        <Row icon="check" t="Waits for you" s="Nothing is sent until you approve it." />
        <div className={cx("ob-act")}>
          <button className={cx("btn", "k", "ob-big")} onClick={next}>Get started</button>
          {p.onDemo && <button className={cx("btn", "ob-big")} onClick={p.onDemo}>See a 60-second demo</button>}
        </div>
      </Shell>
    );

  if (step === "google")
    return (
      <Shell step={step} onBack={back}>
        <h1>Connect Google</h1>
        <p className={cx("ob-sub")}>One connection covers the three Google tools Fluent uses.</p>
        <Row icon="msg" t="Gmail" s="Reads your inbox. Saves drafts. Sends only what you approve." />
        <Row icon="zap" t="Calendar" s="Adds content dates and payment reminders you approve." />
        <Row icon="file" t="Sheets" s="Reads your rate card, and your deals if you keep them there." />
        <div className={cx("ob-never")}>
          <b>What Fluent will never do</b>
          <span>Send email without your approval · Delete anything · Follow instructions hidden in an email</span>
        </div>
        {err && <div className={cx("err")} role="alert">{err}</div>}
        <div className={cx("ob-act")}>
          {p.status.googleConnected ? (
            <button className={cx("btn", "k", "ob-big")} onClick={next}>Google is connected. Continue</button>
          ) : (
            <>
              <button className={cx("btn", "k", "ob-big")} disabled={busy} onClick={() => run(p.onConnectGoogle)}>{busy ? "Opening Google…" : "Connect Google"}</button>
              <button className={cx("btn", "ob-big")} onClick={next}>Skip for now</button>
            </>
          )}
        </div>
      </Shell>
    );

  if (step === "source") {
    const opts: { id: SourceChoice; t: string; s: string; tag?: string; on?: boolean }[] = [
      { id: "airtable", t: "Airtable", s: "Best for dates and payment tracking.", tag: "Recommended", on: p.status.available.airtable },
      { id: "sheets", t: "Google Sheets", s: "Keep deals in a spreadsheet tab.", on: p.status.available.sheets },
      { id: "none", t: "I don’t track them yet", s: "Fluent keeps a simple record for you." },
    ];
    return (
      <Shell step={step} onBack={back}>
        <h1>Where do your deals live?</h1>
        <p className={cx("ob-sub")}>Fluent adds new deals there and reads it to spot late payments and ending usage rights. You can change this later.</p>
        {opts.map((o) => (
          <button key={o.id} className={cx("ob-opt", picked === o.id && "on")} disabled={busy} onClick={() => run(async () => {
            if (o.id !== "none" && !o.on) {
              setPicked(o.id);
              p.onOpenConnectors();
              return;
            }
            setPicked(o.id);
            await p.onChooseSource(o.id);
          })}>
            <span className={cx("ob-radio")} />
            <div><b>{o.t}{o.tag && <em>{o.tag}</em>}</b><span>{o.s}</span></div>
            {o.id !== "none" && <small className={o.on ? cx("ob-ok") : undefined}>{o.on ? "Connected" : "Connect"}</small>}
          </button>
        ))}
        {err && <div className={cx("err")} role="alert">{err}</div>}
        <div className={cx("ob-act")}>
          <button className={cx("btn", "k", "ob-big")} onClick={next}>{picked ? "Continue" : "I’ll decide later"}</button>
        </div>
      </Shell>
    );
  }

  if (step === "tour1" || step === "tour2" || step === "tour3") {
    const t = {
      tour1: { h: "It finds things for you", s: "New offers, late payments and questions show up as cards in Active. Urgent ones go to the top.", rows: [["alert", "Adidas offer is 38% below your rate", "Needs review"], ["money", "Payment overdue: Tern Audio", "Approve & send"]] },
      tour2: { h: "Open one to see its work", s: "Changes shows exactly what will happen. Sources shows where Fluent looked. Steps shows what it did and what’s left.", rows: [["check", "Changes", "3 changes · nothing sent until you approve"], ["file", "Sources", "Email, PDF brief, your recent deals"], ["zap", "Steps", "Read, compared, drafted, waiting for you"]] },
      tour3: { h: "Ask, or hand it off", s: "Use the bar at the bottom. Answer reads your data and replies. Do it starts a task you can follow. Your To do tab is for everything else.", rows: [["msg", "Answer", "“Which payments are late?”"], ["zap", "Do it", "“Draft a follow-up to Tern.”"]] },
    }[step];
    return (
      <Shell step={step} onBack={back}>
        <h1>{t.h}</h1>
        <p className={cx("ob-sub")}>{t.s}</p>
        <div className={cx("ob-demo")}>
          {t.rows.map(([i, a, b]) => <Row key={a} icon={i as "msg"} t={a} s={b} />)}
        </div>
        <div className={cx("ob-act")}><button className={cx("btn", "k", "ob-big")} onClick={next}>{step === "tour3" ? "Show me what Fluent found" : "Next"}</button></div>
      </Shell>
    );
  }

  return <FirstLook {...p} onBack={back} />;
}

function FirstLook(p: OnboardingProps & { onBack?: () => void }) {
  const [state, setState] = useState<{ phase: "looking" | "done"; list?: NotificationList; note?: string }>({ phase: "looking" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!p.status.googleConnected) return alive && setState({ phase: "done", note: "Connect Google anytime and Fluent will start looking." });
      try {
        await apiSend(p.api, "/api/sync", "POST", {});
        const list = await apiGet<NotificationList>(p.api, "/api/notifications?tab=active");
        if (alive) setState({ phase: "done", list });
      } catch {
        if (alive) setState({ phase: "done", note: "I couldn’t check your inbox just now. It will keep trying in the background." });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const l = state.list;
  const need = l ? l.counts.toReview : 0;
  return (
    <Shell step="first" onBack={p.onBack}>
      {state.phase === "looking" ? (
        <>
          <span style={{ display: "inline-flex", marginBottom: 20 }}><Icon name="loader" size={30} /></span>
          <h1>Taking a first look</h1>
          <p className={cx("ob-sub")}>Reading your recent mail. This can take a few seconds.</p>
        </>
      ) : (
        <>
          <h1>{l ? (need > 0 ? `${need} thing${need === 1 ? "" : "s"} need${need === 1 ? "s" : ""} you` : "You’re all caught up") : "You’re all set"}</h1>
          <p className={cx("ob-sub")}>{state.note ?? (need > 0 ? "Here’s what Fluent found in your recent mail. Nothing has been done yet." : "Nothing needs you right now. New offers will appear as they arrive.")}</p>
          {l?.items.slice(0, 3).map((n) => <Row key={n.id} icon={n.category === "money" ? "money" : n.category === "attention" ? "alert" : "file"} t={n.title} s={n.body} />)}
          <div className={cx("ob-act")}>
            <button className={cx("btn", "k", "ob-big")} disabled={busy} onClick={async () => { setBusy(true); try { await p.onFinish(); } finally { setBusy(false); } }}>{need > 0 ? "Review them" : "Open Fluent"}</button>
          </div>
        </>
      )}
    </Shell>
  );
}
