"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, type ConnectorStatus } from "@fluent/shared";
import { api } from "@/lib/supabase-browser";

type Settings = { sourceOfTruth: "airtable" | "sheets" | null; available: { airtable: boolean; sheets: boolean } };

export function ConnectorsSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [st, setSt] = useState<ConnectorStatus | null>(null);
  const [set, setSet] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState("");
  const [range, setRange] = useState("");
  const [deals, setDeals] = useState("");
  const [token, setToken] = useState("");
  const [base, setBase] = useState("");
  const [table, setTable] = useState("");

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([apiGet<ConnectorStatus>(api, "/api/connectors"), apiGet<Settings>(api, "/api/settings")]);
    setSt(s);
    setSet(c);
    setSheet(s.google.rateCardSheetId ?? "");
    setRange(s.google.rateCardRange ?? "");
    setDeals(s.google.dealsSheetId ?? "");
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

  const both = set?.available.airtable && set?.available.sheets;

  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sh2" role="dialog" aria-modal="true" aria-labelledby="conn-title">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 id="conn-title">Connectors</h2>
            <p className="hp">Fluent reads freely, drafts freely, and sends only after you approve. It never deletes.</p>
          </div>
          <button className="b2" onClick={onClose}>Close</button>
        </div>

        {!st && <p className="hp">Loading…</p>}

        {st && (
          <>
            <section className="cn">
              <div className="cn-h">
                <div className="mk" aria-hidden>G</div>
                <div>
                  <b>Gmail, Calendar and Sheets</b>
                  <p className="hp">{st.google.connected ? st.google.email ?? "Connected" : "Watch your inbox, draft replies, add calendar holds, read and update sheets."}</p>
                </div>
                <span className={`bd ${st.google.connected ? "" : "off"}`}>{st.google.connected ? "On" : "Off"}</span>
              </div>
              {!st.google.connected ? (
                <button className="b2 k" disabled={busy} onClick={connectGoogle}>Connect Google</button>
              ) : (
                <>
                  <div className="fd">
                    <label htmlFor="sheet">Rate card sheet (link or ID)</label>
                    <input id="sheet" className="in2" value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
                  </div>
                  <div className="fd">
                    <label htmlFor="range">Rate card range</label>
                    <input id="range" className="in2" value={range} onChange={(e) => setRange(e.target.value)} placeholder="Rates!A1:H60" />
                  </div>
                  <div className="fd">
                    <label htmlFor="deals">Deals sheet (link or ID)</label>
                    <input id="deals" className="in2" value={deals} onChange={(e) => setDeals(e.target.value)} placeholder="Tab named “Deals” with a header row" />
                  </div>
                  <div className="rw">
                    <button className="b2 k" disabled={busy} onClick={() => run(() => apiSend(api, "/api/connectors/google", "PUT", { rateCardSheetId: sheet, rateCardRange: range, dealsSheetId: deals }), "Saved.")}>Save</button>
                    <button className="b2" disabled={busy} onClick={() => run(() => apiSend(api, "/api/connectors/google", "DELETE"))}>Disconnect</button>
                  </div>
                  <p className="hp">If you connected Google before Calendar and Sheets editing were added, disconnect and connect again so Fluent gets the new permissions.</p>
                </>
              )}
            </section>

            <section className="cn">
              <div className="cn-h">
                <div className="mk" aria-hidden>A</div>
                <div>
                  <b>Airtable</b>
                  <p className="hp">{st.airtable.connected ? `Base ${st.airtable.baseId}, table ${st.airtable.table}` : "Your deal tracker. Fluent can add and update records."}</p>
                </div>
                <span className={`bd ${st.airtable.connected ? "" : "off"}`}>{st.airtable.connected ? "On" : "Off"}</span>
              </div>
              <div className="fd">
                <label htmlFor="at-token">Personal access token{st.airtable.connected ? " (leave blank to keep)" : ""}</label>
                <input id="at-token" className="in2" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="pat…" />
              </div>
              <div className="rw">
                <div className="fd" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="at-base">Base ID</label>
                  <input id="at-base" className="in2" value={base} onChange={(e) => setBase(e.target.value)} placeholder="appXXXXXXXXXXXXXX" />
                </div>
                <div className="fd" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="at-table">Table name</label>
                  <input id="at-table" className="in2" value={table} onChange={(e) => setTable(e.target.value)} placeholder="Brand Deals" />
                </div>
              </div>
              <p className="hp">Token scopes: data.records:read, data.records:write, schema.bases:read.</p>
              <div className="rw">
                <button className="b2 k" disabled={busy} onClick={() => run(async () => { await apiSend(api, "/api/connectors/airtable", "PUT", { token, baseId: base, table }); setToken(""); }, "Airtable connected.")}>
                  {st.airtable.connected ? "Save" : "Connect Airtable"}
                </button>
                {st.airtable.connected && <button className="b2" disabled={busy} onClick={() => run(() => apiSend(api, "/api/connectors/airtable", "DELETE"))}>Disconnect</button>}
              </div>
            </section>

            {(both || set?.sourceOfTruth) && (
              <section className="cn">
                <b style={{ fontSize: 13.5 }}>Source of truth</b>
                <p className="hp">Where your deals live. Fluent reads dates and fees from here and writes new deals back to it. Airtable is the safer pick when you rely on typed dates.</p>
                <div className="seg">
                  {(["airtable", "sheets"] as const).map((k) => (
                    <button key={k} className={`b2 ${set?.sourceOfTruth === k ? "on" : ""}`} disabled={busy || !set?.available[k]} onClick={() => run(() => apiSend(api, "/api/settings", "PUT", { sourceOfTruth: k }), `Using ${k === "sheets" ? "Sheets" : "Airtable"}.`)}>
                      {k === "sheets" ? "Google Sheets" : "Airtable"}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        {msg && <div className={/saved|connected|using/i.test(msg) ? "ok2" : "bad2"} role="status">{msg}</div>}
      </div>
    </div>
  );
}
