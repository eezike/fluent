"use client";
import "./admin.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-browser";
import { adminFetch } from "@/components/admin/kit";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/prompts", label: "Prompts" },
  { href: "/admin/evals", label: "Evals" },
  { href: "/admin/controls", label: "Controls" },
  { href: "/admin/team", label: "Team" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [state, setState] = useState<"loading" | "out" | "denied" | "ok">("loading");
  const [me, setMe] = useState<string>("");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) return setState("out");
      try {
        const m = await adminFetch<{ email: string | null }>("/api/admin/me");
        setMe(m.email ?? "");
        setState("ok");
        const c = await adminFetch<{ flags: { pause_agent: boolean; pause_sending: boolean; dry_run_all: boolean } }>("/api/admin/controls");
        setPaused(c.flags.pause_agent || c.flags.pause_sending || c.flags.dry_run_all);
      } catch {
        setState("denied");
      }
    })();
  }, [path]);

  if (state === "loading") return null;
  if (state !== "ok")
    return (
      <div className="ad" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="ad-card" style={{ maxWidth: 420, padding: 28, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 500 }}>{state === "out" ? "Sign in first" : "Not an admin"}</h1>
          <p className="ad-mut" style={{ margin: "0 0 18px" }}>{state === "out" ? "Sign in to Fluent, then come back to /admin." : "This account doesn’t have admin access. Ask an admin to add you on the Team page."}</p>
          <Link className="ad-btn ad-k" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href="/">Go to Fluent</Link>
        </div>
      </div>
    );

  return (
    <div className="ad">
      <nav className="ad-side">
        <div className="ad-logo"><i>F</i>Fluent<small>Admin</small></div>
        {NAV.map((n) => {
          const on = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`ad-nav ${on ? "on" : ""}`}>
              {n.label}
              {n.href === "/admin/controls" && paused && <span className="ad-dot" title="A control is on" />}
            </Link>
          );
        })}
        <div className="ad-sp" />
        <Link href="/demo" className="ad-nav">Present demo</Link>
        <Link href="/" className="ad-nav">Open Fluent</Link>
        <div className="ad-me">{me}</div>
      </nav>
      <main className="ad-main">{children}</main>
    </div>
  );
}
