"use client";
import { useEffect, useState } from "react";
import { apiGet, type Idea } from "@fluent/shared";
import { api } from "@/lib/supabase-browser";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Ideas({ name, onPick }: { name?: string; onPick: (prompt: string) => void }) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiGet<{ ideas: Idea[] }>(api, "/api/ideas")
      .then((r) => live && setIdeas(r.ideas))
      .catch((e) => live && (setErr(e.message), setIdeas([])));
    return () => {
      live = false;
    };
  }, []);

  const who = name ? `${greeting()}, ${name}.` : `${greeting()}.`;
  return (
    <div className="scroll">
      <div className="col" style={{ gap: 32 }}>
        <div className="hello">
          <span className="avatar lg" aria-hidden>F</span>
          <h1>
            {who}
            <br />
            <span>{ideas === null ? "Looking through your inbox and deals." : ideas.length ? `${ideas.length === 1 ? "One thing" : `${ideas.length} things`} to look at.` : "Nothing urgent right now."}</span>
          </h1>
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        {ideas === null && <div className="help" aria-live="polite">This takes a few seconds.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ideas?.map((idea, i) => (
            <div className="idea" key={i}>
              <div>
                <b>{idea.title}</b>
                <span>{idea.detail}</span>
              </div>
              <button className={`btn ${i === 0 ? "dark" : ""}`} onClick={() => onPick(idea.prompt)}>{idea.action}</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">Or ask for something</div>
          <div className="suggest">
            {["What did I earn from brands this quarter?", "Which deals are missing a contract?", "Summarize my open deals"].map((s) => (
              <button key={s} onClick={() => onPick(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
