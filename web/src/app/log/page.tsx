"use client";
import { useState, useEffect } from "react";
import { useStore, AdoptedPolicy } from "../lib/store";

const OUTLOOK_LABEL: Record<string, string> = {
  baseline: "Baseline", recession_mild: "Recession · mild",
  recession_moderate: "Recession · moderate", recession_severe: "Recession · severe",
  rate_shock: "Rate shock", severe_combined: "Severe combined",
};
const outlookLabel = (k: string) => OUTLOOK_LABEL[k] ?? k; // Studio handoffs carry a human label already

const CONSTRAINT_LABEL: Record<string, string> = {
  max_loss_rate: "Loss-rate ceiling", min_approval: "Approval floor",
  max_capital: "Capital cap", max_eg_share: "High-grade ceiling",
};

const money = (x: number) => {
  const m = Math.abs(x), s = x < 0 ? "−" : "";
  if (m >= 1e9) return `${s}$${(m / 1e9).toFixed(2)}B`;
  if (m >= 1e6) return `${s}$${(m / 1e6).toFixed(1)}M`;
  if (m >= 1e3) return `${s}$${(m / 1e3).toFixed(0)}K`;
  return `${s}$${m.toFixed(0)}`;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtConstraint = (k: string, v: number | null) => {
  if (v == null) return null;
  if (k === "max_capital") return `${CONSTRAINT_LABEL[k]} ${money(v)}`;
  return `${CONSTRAINT_LABEL[k]} ${pct(v)}`;
};

type DiffRow = { field: string; from: string | null; to: string; delta?: number; outcome?: boolean };
function diffEntries(cur: AdoptedPolicy, prev: AdoptedPolicy | undefined): DiffRow[] {
  if (!prev) return [{ field: "Created", from: null, to: "initial policy" }];
  const d: DiffRow[] = [];
  if (cur.objective !== prev.objective) d.push({ field: "Objective", from: prev.objective, to: cur.objective });
  if (cur.outlook !== prev.outlook)
    d.push({ field: "Outlook", from: outlookLabel(prev.outlook), to: outlookLabel(cur.outlook) });
  for (const k of ["max_loss_rate", "min_approval", "max_capital", "max_eg_share"]) {
    const a = prev.constraints[k] ?? null, b = cur.constraints[k] ?? null;
    if (a == null && b == null) continue;
    const fa = a != null ? (fmtConstraint(k, a) as string).split(" ").slice(-1)[0] : null;
    const fb = b != null ? (fmtConstraint(k, b) as string).split(" ").slice(-1)[0] : null;
    if (a == null && b != null) d.push({ field: CONSTRAINT_LABEL[k], from: "off", to: fb as string });
    else if (a != null && b == null) d.push({ field: CONSTRAINT_LABEL[k], from: fa, to: "removed" });
    else if (a != null && b != null && Math.abs(a - b) > 1e-9) d.push({ field: CONSTRAINT_LABEL[k], from: fa, to: fb as string });
  }
  const dc = cur.result.cutline - prev.result.cutline;
  const dp = cur.result.profit - prev.result.profit;
  if (Math.abs(dc) > 1e-9) d.push({ field: "Cutline", from: prev.result.cutline.toFixed(2), to: cur.result.cutline.toFixed(2), outcome: true });
  if (Math.abs(dp) > 1) d.push({ field: "Profit", from: money(prev.result.profit), to: money(cur.result.profit), delta: dp, outcome: true });
  if (d.length === 0) d.push({ field: "No changes", from: null, to: "identical to prior version" });
  return d;
}

export default function LogPage() {
  const { policies, policiesReady, restorePolicy, resetPolicies } = useStore();
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (policiesReady && policies.length && selected == null)
      setSelected(policies[policies.length - 1].version);
  }, [policiesReady, policies, selected]);

  const sorted = [...policies].sort((a, b) => b.version - a.version);
  const cur = policies.find((e) => e.version === selected);
  const prev = cur ? policies.find((e) => e.version === cur.version - 1) : undefined;
  const diff = cur ? diffEntries(cur, prev) : [];

  return (
    <div className="dl-root">
      <style>{CSS}</style>
      <div className="dl-grid">
        <aside className="dl-list">
          <div className="dl-list-title">Decision Log</div>
          <div className="dl-list-head">
            <span>{policies.length} versions</span>
            <button className="dl-reset" onClick={() => { resetPolicies(); setSelected(null); }}>reset to seed</button>
          </div>
          <div className="dl-timeline">
            {!policiesReady ? <div className="dl-muted">Loading…</div> : sorted.map((e) => (
              <button key={e.version} className={`dl-entry ${selected === e.version ? "on" : ""}`} onClick={() => setSelected(e.version)}>
                <div className="dl-entry-top">
                  <span className="dl-ver">v{e.version}</span>
                  <span className="dl-cut">cutline {e.result.cutline.toFixed(2)}</span>
                </div>
                <div className="dl-entry-mid">{money(e.result.profit)} · {pct(e.result.approval)} approve</div>
                <div className="dl-entry-badges">
                  <span className={`dl-badge ${e.outlook !== "baseline" ? "stress" : ""}`}>{outlookLabel(e.outlook)}</span>
                  {e.restoredFrom && <span className="dl-badge restore">← v{e.restoredFrom}</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="dl-detail">
          {!cur ? <div className="dl-muted">Select a version.</div> : (
            <>
              <div className="dl-detail-head">
                <div>
                  <div className="dl-eyebrow">Version {cur.version}{cur.restoredFrom ? ` · restored from v${cur.restoredFrom}` : ""}</div>
                  <div className="dl-timestamp">{new Date(cur.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
                <button className="dl-restore" onClick={() => { restorePolicy(cur.version); setSelected(null); }}>Restore as draft →</button>
              </div>

              <div className="dl-policy">
                <div className="dl-policy-primary">
                  <div className="dl-policy-label">Approve if predicted default ≤</div>
                  <div className="dl-policy-cut">{cur.result.cutline.toFixed(2)}</div>
                </div>
                <div className="dl-policy-stats">
                  <div><div className="dl-ps-val">{money(cur.result.profit)}</div><div className="dl-ps-l">{cur.objective === "volume" ? "funded volume basis" : "portfolio profit"}</div></div>
                  <div><div className="dl-ps-val">{pct(cur.result.approval)}</div><div className="dl-ps-l">approval rate</div></div>
                  <div><div className="dl-ps-val">{pct(cur.result.loss_rate)}</div><div className="dl-ps-l">loss rate</div></div>
                  <div><div className="dl-ps-val">{money(cur.result.capital)}</div><div className="dl-ps-l">capital deployed</div></div>
                </div>
              </div>

              <div className="dl-meta">
                <div className="dl-meta-row">
                  <span className="dl-meta-k">Objective</span>
                  <span className="dl-meta-v">{cur.objective === "return" ? "Maximize return" : cur.objective === "volume" ? "Maximize funded volume" : "Hit a target loss rate"}</span>
                </div>
                <div className="dl-meta-row">
                  <span className="dl-meta-k">Outlook</span>
                  <span className={`dl-meta-v ${cur.outlook !== "baseline" ? "stress" : ""}`}>{outlookLabel(cur.outlook)}</span>
                </div>
                <div className="dl-meta-row">
                  <span className="dl-meta-k">Constraints</span>
                  <span className="dl-meta-v">
                    {Object.entries(cur.constraints).map(([k, v]) => fmtConstraint(k, v)).filter(Boolean).join(" · ") || "none"}
                  </span>
                </div>
                {cur.result.binding && cur.result.binding.length > 0 && (
                  <div className="dl-meta-row">
                    <span className="dl-meta-k">Binding</span>
                    <span className="dl-meta-v bind">{cur.result.binding.map((b) => `${b.label}: ${b.relax} worth ${money(b.gain)} ${b.unit}`).join(" · ")}</span>
                  </div>
                )}
              </div>

              <div className="dl-rationale">
                <div className="dl-section-label">Rationale</div>
                <p>{cur.rationale}</p>
              </div>

              <div className="dl-diff">
                <div className="dl-section-label">{prev ? `Diff against v${prev.version}` : "Change record"}</div>
                <div className="dl-diff-rows">
                  {diff.map((d, i) => (
                    <div key={i} className={`dl-diff-row ${d.outcome ? "outcome" : ""}`}>
                      <span className="dl-diff-field">{d.field}</span>
                      {d.from != null ? (
                        <span className="dl-diff-change">
                          <span className="dl-from">{d.from}</span>
                          <span className="dl-arrow">→</span>
                          <span className="dl-to">{d.to}</span>
                          {d.delta != null && <span className={`dl-delta ${d.delta < 0 ? "neg" : "pos"}`}>{d.delta < 0 ? "−" : "+"}{money(Math.abs(d.delta)).replace("−", "")}</span>}
                        </span>
                      ) : <span className="dl-to">{d.to}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const CSS = `
.dl-root{--bind:#E8743C;--neg:#E5563E;--pos:#5FBF8F;font-family:var(--font-space);color:var(--text);}
.dl-root *{box-sizing:border-box;}
.dl-grid{display:grid;grid-template-columns:310px 1fr;max-width:1100px;margin:0 auto;min-height:calc(100vh - 58px);border-left:1px solid var(--border);border-right:1px solid var(--border);}
.dl-list{background:var(--ink2);border-right:1px solid var(--border);padding:22px 16px;display:flex;flex-direction:column;}
.dl-list-title{font-family:var(--font-news);font-size:22px;font-weight:500;margin-bottom:12px;padding:0 2px;}
.dl-list-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin:2px 2px 10px;}
.dl-reset{background:none;border:none;color:var(--muted);font-size:10px;cursor:pointer;text-transform:uppercase;letter-spacing:0.08em;text-decoration:underline;font-family:inherit;}
.dl-reset:hover{color:var(--text);}
.dl-timeline{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:7px;}
.dl-entry{text-align:left;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:11px 12px;cursor:pointer;transition:all .13s;font-family:inherit;color:var(--text);}
.dl-entry:hover{border-color:var(--muted);}
.dl-entry.on{border-color:var(--amber);background:rgba(240,169,59,0.08);}
.dl-entry-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}
.dl-ver{font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--amber2);}
.dl-cut{font-family:var(--font-mono);font-size:11px;color:var(--muted);}
.dl-entry-mid{font-size:12px;margin-bottom:7px;}
.dl-entry-badges{display:flex;gap:5px;flex-wrap:wrap;}
.dl-badge{font-size:10px;padding:2px 7px;border-radius:10px;background:var(--border);color:var(--muted);}
.dl-badge.stress{background:rgba(232,116,60,0.16);color:var(--bind);}
.dl-badge.restore{background:rgba(240,169,59,0.14);color:var(--amber2);}
.dl-detail{padding:26px 32px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;}
.dl-detail-head{display:flex;justify-content:space-between;align-items:flex-start;}
.dl-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:var(--muted);}
.dl-timestamp{font-family:var(--font-mono);font-size:12px;color:var(--muted);margin-top:4px;}
.dl-restore{background:none;border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:7px;font-family:inherit;font-size:12px;cursor:pointer;transition:all .15s;}
.dl-restore:hover{border-color:var(--amber);color:var(--amber2);}
.dl-policy{display:flex;gap:28px;align-items:center;background:var(--ink2);border:1px solid var(--border);border-radius:12px;padding:18px 22px;}
.dl-policy-primary{border-right:1px solid var(--border);padding-right:28px;}
.dl-policy-label{font-size:10px;color:var(--muted);}
.dl-policy-cut{font-family:var(--font-news);font-size:52px;font-weight:500;line-height:0.9;color:var(--amber);}
.dl-policy-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px 26px;flex:1;}
.dl-ps-val{font-family:var(--font-news);font-size:22px;font-weight:500;}
.dl-ps-l{font-size:10px;color:var(--muted);}
.dl-meta{display:flex;flex-direction:column;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.dl-meta-row{display:grid;grid-template-columns:110px 1fr;gap:14px;background:var(--ink2);padding:11px 16px;font-size:13px;}
.dl-meta-k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;align-self:center;}
.dl-meta-v.stress{color:var(--bind);}
.dl-meta-v.bind{color:var(--amber2);font-family:var(--font-mono);font-size:11px;}
.dl-section-label{font-size:11px;text-transform:uppercase;letter-spacing:0.13em;color:var(--muted);margin-bottom:9px;}
.dl-rationale p{margin:0;font-family:var(--font-news);font-size:16px;line-height:1.55;}
.dl-diff-rows{display:flex;flex-direction:column;gap:1px;background:var(--border);border-radius:8px;overflow:hidden;border:1px solid var(--border);}
.dl-diff-row{display:grid;grid-template-columns:130px 1fr;gap:14px;background:var(--ink2);padding:9px 15px;font-size:13px;align-items:center;}
.dl-diff-row.outcome{background:var(--panel);}
.dl-diff-field{color:var(--muted);font-size:12px;}
.dl-diff-change{display:flex;align-items:center;gap:9px;font-family:var(--font-mono);font-size:12px;flex-wrap:wrap;}
.dl-from{color:var(--muted);text-decoration:line-through;opacity:0.7;}
.dl-arrow{color:var(--muted);}
.dl-to{color:var(--amber2);}
.dl-delta{margin-left:4px;font-weight:600;}
.dl-delta.pos{color:var(--pos);}
.dl-delta.neg{color:var(--neg);}
.dl-muted{color:var(--muted);font-size:13px;padding:12px;}
@media(max-width:820px){.dl-grid{grid-template-columns:1fr;}.dl-list{border-right:none;border-bottom:1px solid var(--border);}.dl-policy{flex-direction:column;align-items:stretch;gap:16px;}.dl-policy-primary{border-right:none;border-bottom:1px solid var(--border);padding-right:0;padding-bottom:14px;}}
`;
