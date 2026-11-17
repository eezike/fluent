"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";

export function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase();
    const { error, data } =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { data: { name: name.trim() || undefined } } });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up" && !data.session) setMsg("Check your email to confirm, then sign in.");
  }

  return (
    <main className="auth">
      <div className="avatar" style={{ width: 48, height: 48, fontSize: 29 }} aria-hidden>F</div>
      <h1>Fluent</h1>
      <p className="help" style={{ fontSize: 16 }}>An agent for your brand deals.</p>
      <form onSubmit={submit}>
        {mode === "up" && (
          <div className="field">
            <label htmlFor="name">First name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </div>
        {msg && <div className="err" role="alert">{msg}</div>}
        <button className="btn dark" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="btn ghost" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
