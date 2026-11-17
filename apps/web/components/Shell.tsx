"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiGet, apiSend, type SetupStatus } from "@fluent/shared";
import { FluentApp, Onboarding, SignIn, type SetupProps } from "@fluent/ui";
import { api, supabase } from "@/lib/supabase-browser";
import { ConnectorsSheet } from "./ConnectorsSheet";

export function Shell() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [conn, setConn] = useState(false);
  const [wide, setWide] = useState(false);
  const [rev, setRev] = useState(0);
  const [setupSt, setSetupSt] = useState<SetupStatus | null>(null);
  const [googleReturn, setGoogleReturn] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const f = () => setWide(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  // Back from Google OAuth: during onboarding, continue at the next step; otherwise reopen the sheet.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("google")) {
      setGoogleReturn(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const loadSetup = useCallback(async () => {
    try {
      setSetupSt(await apiGet<SetupStatus>(api, "/api/settings"));
    } catch {
      // Without it we just skip onboarding and the checklist.
    }
  }, []);
  useEffect(() => {
    if (session) void loadSetup();
  }, [session, rev, loadSetup]);
  useEffect(() => {
    if (googleReturn && setupSt?.onboarded) {
      setConn(true);
      setGoogleReturn(false);
    }
  }, [googleReturn, setupSt]);

  const connectGoogle = useCallback(async () => {
    const { url } = await apiSend<{ url: string }>(api, "/api/connectors/google/start", "POST", { returnTo: "/" });
    window.location.href = url;
  }, []);

  const setup = useMemo<SetupProps | null>(() => {
    if (!setupSt || !setupSt.onboarded || setupSt.checklistDismissed) return null;
    return {
      items: [
        { id: "google", label: "Connect Google", done: setupSt.googleConnected, cta: "Connect" },
        { id: "source", label: "Choose where your deals live", done: !!setupSt.sourceOfTruth, cta: "Choose" },
        { id: "ask", label: "Ask Fluent a question", done: setupSt.hasAsked },
        { id: "approve", label: "Approve your first action", done: setupSt.hasApproved },
      ],
      onAction: (id) => (id === "google" ? void connectGoogle().catch(() => setConn(true)) : setConn(true)),
      onDismiss: () => {
        setSetupSt((x) => (x ? { ...x, checklistDismissed: true } : x));
        void apiSend(api, "/api/settings", "PUT", { checklistDismissed: true }).catch(() => {});
      },
    };
  }, [setupSt, connectGoogle]);

  const topRight = useMemo(() => (
    <>
      <button className="gear" onClick={() => setConn(true)}>Connectors</button>
      <button className="gear" onClick={() => supabase().auth.signOut()}>Sign out</button>
    </>
  ), []);

  if (session === undefined) return null;
  if (!session)
    return (
      <div className="shell" style={{ display: "flex", alignItems: "center" }}>
        <SignIn
          onDemo={() => { window.location.href = "/demo"; }}
          onSignIn={async (email, password) => {
            const sb = supabase();
            const r = await sb.auth.signInWithPassword({ email, password });
            if (!r.error) return null;
            if (/invalid login/i.test(r.error.message)) {
              const s = await sb.auth.signUp({ email, password });
              if (s.error) return s.error.message;
              return s.data.session ? null : "Check your email to confirm, then sign in.";
            }
            return r.error.message;
          }}
        />
      </div>
    );

  if (setupSt && !setupSt.onboarded)
    return (
      <div className="shell">
        <Onboarding
          api={api}
          status={setupSt}
          start={googleReturn ? "source" : "welcome"}
          onConnectGoogle={connectGoogle}
          onChooseSource={async (c) => {
            await apiSend(api, "/api/settings", "PUT", { sourceOfTruth: c });
            await loadSetup();
          }}
          onOpenConnectors={() => setConn(true)}
          onDemo={() => { window.location.href = "/demo"; }}
          onFinish={async () => {
            await apiSend(api, "/api/settings", "PUT", { onboarded: true });
            setSetupSt({ ...setupSt, onboarded: true });
          }}
        />
        {conn && <ConnectorsSheet onClose={() => setConn(false)} onChanged={() => { setRev((r) => r + 1); void loadSetup(); }} />}
      </div>
    );

  return (
    <div className="shell">
      <FluentApp
        key={rev}
        setup={setup}
        api={api}
        layout={wide ? "split" : "panel"}
        topRight={wide ? topRight : undefined}
      />
      {!wide && (
        <button className="gear" style={{ position: "fixed", top: 12, right: 12 }} onClick={() => setConn(true)}>Connectors</button>
      )}
      {conn && <ConnectorsSheet onClose={() => setConn(false)} onChanged={() => setRev((r) => r + 1)} />}
    </div>
  );
}
