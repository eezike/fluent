"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, type ConnectorStatus } from "@fluent/shared";
import { api } from "@/lib/supabase-browser";
import { CloseIcon } from "./Icons";

export function ConnectorsSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [st, setSt] = useState<ConnectorStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState("");
  const [range, setRange] = useState("");
  const [token, setToken] = useState("");
  const [base, setBase] = useState("");
  const [table, setTable] = useState("");

  const load = useCallback(async () => {
    const s = await apiGet<ConnectorStatus>(api, "/api/connectors");
    setSt(s);
    setSheet(s.google.rateCardSheetId ?? "");
    setRange(s.google.rateCardRange ?? "");
    setBase(s.airtable.baseId ?? "");
    setTable(s.airtable.table ?? "");
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load, onClose]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      onChanged();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function connectGoogle() {
    setBusy(true);
    try {
      const { url } = await apiSend<{ url: string }>(api, "/api/connectors/google/start", "POST", { returnTo: "/" });
      window.location.href = url;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't start Google sign-in");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="conn-title">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 id="conn-title">Connectors</h2>
            <p className="help">Fluent reads freely and asks before it sends. It never deletes.</p>
          </div>
          <button className="round soft" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        {!st && <p className="help">Loading…</p>}

        {st && (
          <>
            <section className="conn">
              <div className="conn-head">
                <div className="mark" aria-hidden>G</div>
                <div>
                  <b>Gmail and Google Sheets</b>
                  <p className="help">{st.google.connected ? st.google.email ?? "Connected" : "Read mail, save drafts, send with approval, read your rate card."}</p>
                </div>
                <span className={`badge ${st.google.connected ? "" : "off"}`}>{st.google.connected ? "On" : "Off"}</span>
              </div>
              {!st.google.connected ? (
                <button className="btn dark" disabled={busy} onClick={connectGoogle}>Connect Google</button>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="sheet">Rate card sheet (link or ID)</label>
                    <input id="sheet" className="input" value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
                  </div>
                  <div className="field">
                    <label htmlFor="range">Range to read</label>
                    <input id="range" className="input" value={range} onChange={(e) => setRange(e.target.value)} placeholder="Rates!A1:H60" />
                  </div>
                  <div className="row">
                    <button className="btn primary" disabled={busy} onClick={() => run(() => apiSend(api, "/api/connectors/google", "PUT", { rateCardSheetId: sheet, rateCardRange: range }), "Saved.")}>Save</button>
                    <button className="btn ghost" disabled={busy} onClick={() => run(() => apiSend(api, "/api/connectors/google", "DELETE"))}>Disconnect</button>
                  </div>
                </>
              )}
            </section>

            <section className="conn">
              <div className="conn-head">
                <div className="mark" aria-hidden>A</div>
                <div>
                  <b>Airtable</b>
                  <p className="help">{st.airtable.connected ? `Base ${st.airtable.baseId}, table ${st.airtable.table}` : "Your deal tracker. Fluent can create and update records."}</p>
                </div>
                <span className={`badge ${st.airtable.connected ? "" : "off"}`}>{st.airtable.connected ? "On" : "Off"}</span>
              </div>
              <div className="field">
                <label htmlFor="at-token">Personal access token{st.airtable.connected ? " (leave blank to keep)" : ""}</label>
                <input id="at-token" className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="pat…" />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="at-base">Base ID</label>
                  <input id="at-base" className="input" value={base} onChange={(e) => setBase(e.target.value)} placeholder="appXXXXXXXXXXXXXX" />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="at-table">Table name</label>
                  <input id="at-table" className="input" value={table} onChange={(e) => setTable(e.target.value)} placeholder="Brand Deals" />
                </div>
              </div>
              <p className="help">Create the token at airtable.com/create/tokens with data.records:read, data.records:write and schema.bases:read for this base.</p>
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => run(async () => { await apiSend(api, "/api/connectors/airtable", "PUT", { token, baseId: base, table }); setToken(""); }, "Airtable connected.")}>
                  {st.airtable.connected ? "Save" : "Connect Airtable"}
                </button>
                {st.airtable.connected && (
                  <button className="btn ghost" disabled={busy} onClick={() => run(() => apiSend(api, "/api/connectors/airtable", "DELETE"))}>Disconnect</button>
                )}
              </div>
            </section>
          </>
        )}
        {msg && <div className={/saved|connected/i.test(msg) ? "note-ok" : "note-bad"} role="status">{msg}</div>}
      </div>
    </div>
  );
}
