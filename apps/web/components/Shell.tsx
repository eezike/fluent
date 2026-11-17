"use client";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { FluentApp, SignIn } from "@fluent/ui";
import { api, supabase } from "@/lib/supabase-browser";
import { ConnectorsSheet } from "./ConnectorsSheet";

export function Shell() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [conn, setConn] = useState(false);
  const [wide, setWide] = useState(false);
  const [rev, setRev] = useState(0);

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

  // Back from Google OAuth: reopen the sheet so the user sees it connected.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("google")) {
      setConn(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

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

  return (
    <div className="shell">
      <FluentApp
        key={rev}
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
