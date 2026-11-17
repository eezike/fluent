"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-browser";

export async function adminFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await supabase().auth.getSession()).data.session?.access_token;
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as T;
}
export const post = <T = any,>(path: string, body: unknown, method = "POST") => adminFetch<T>(path, { method, body: JSON.stringify(body) });

/** Loads a path and (optionally) keeps polling it. */
export function useLoad<T = any>(path: string | null, every?: number | ((d: T | null) => number | null)) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(true);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await adminFetch<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      if (live.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    live.current = true;
    setLoading(true);
    void reload();
    return () => void (live.current = false);
  }, [reload]);
  useEffect(() => {
    if (!every) return;
    const t = setInterval(() => {
      const ms = typeof every === "function" ? every(data) : every;
      if (ms) void reload();
    }, typeof every === "number" ? every : 2500);
    return () => clearInterval(t);
  }, [every, reload, data]);
  return { data, error, loading, reload };
}

export const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
export const ms = (n: number | null | undefined) => (n == null ? "–" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);
export const usd = (n: number | null | undefined) => (n == null ? "–" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
export const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

export function Title({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="ad-title">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="ad-right">{right}</div>
    </div>
  );
}
export const Card = ({ children, title, right, pad = true }: { children: ReactNode; title?: string; right?: ReactNode; pad?: boolean }) => (
  <section className="ad-card">
    {(title || right) && <header><b>{title}</b><span>{right}</span></header>}
    <div style={pad ? { padding: 16 } : undefined}>{children}</div>
  </section>
);
export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "good" | "bad" }) => (
  <div className="ad-stat"><span>{label}</span><b className={tone ? `ad-${tone}` : ""}>{value}</b>{sub && <em>{sub}</em>}</div>
);
export const Badge = ({ children, tone = "n" }: { children: ReactNode; tone?: "n" | "good" | "bad" | "warn" | "blue" }) => <span className={`ad-b ad-b-${tone}`}>{children}</span>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="ad-empty">{children}</div>;
export const Err = ({ error }: { error: string | null }) => (error ? <div className="ad-err" role="alert">{error}</div> : null);
export const Btn = ({ kind, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "k" | "d" }) => <button {...p} className={`ad-btn ${kind ? "ad-" + kind : ""} ${p.className ?? ""}`} />;
export const Json = ({ v }: { v: unknown }) => <pre className="ad-json">{typeof v === "string" ? v : JSON.stringify(v, null, 2)}</pre>;
