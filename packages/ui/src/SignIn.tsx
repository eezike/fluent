import { useState } from "react";

export function SignIn({ onSignIn, hint, onDemo }: { onSignIn: (email: string, password: string) => Promise<string | null>; hint?: string; onDemo?: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(await onSignIn(email, pw));
    setBusy(false);
  };
  return (
    <form className="fl-auth" onSubmit={submit}>
      <span className="fl-logo" aria-hidden="true" style={{ width: 44, height: 44, fontSize: 22 }}>F</span>
      <h1>Fluent</h1>
      <p>{hint ?? "Sign in to see what needs you."}</p>
      <div className="fl-field"><label htmlFor="fl-em">Email</label><input id="fl-em" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="fl-field"><label htmlFor="fl-pw">Password</label><input id="fl-pw" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      {msg && <div className="fl-err" role="alert">{msg}</div>}
      <button className="fl-btn fl-k" disabled={busy}>Sign in</button>
      {onDemo && <button type="button" className="fl-btn" onClick={onDemo}>Try it with sample data</button>}
    </form>
  );
}
