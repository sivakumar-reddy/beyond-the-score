"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import data from "../data/app_data.json";
import segData from "../data/segment_by_threshold.json";
import marginalData from "../data/marginal_data.json";
import { useStore } from "./lib/store";

const H = data.headline;
const SWEEP = data.sweep;
const SEGS = data.segments;
const SEG_BY_T: any = (segData as any).per_threshold;
const MARGINAL: any = marginalData;

const GRADE_LABEL: Record<string, string> = {
  "0": "A", "1": "B", "2": "C", "3": "D", "4": "E", "5": "F", "6": "G",
  A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G",
};
const GRADES = ["A", "B", "C", "D", "E", "F", "G"];
const GRADE_COLOR: Record<string, string> = {
  A: "#5FBF8F", B: "#8FCF7F", C: "#F0C24B", D: "#F0A93B", E: "#E8743C", F: "#E5563E", G: "#C23B3B",
};

const OUTLOOK_LABEL: Record<string, string> = {
  baseline: "Baseline", recession_mild: "Recession · mild",
  recession_moderate: "Recession · moderate", recession_severe: "Recession · severe",
  rate_shock: "Rate shock", severe_combined: "Severe combined",
};
const outlookLabel = (k: string) => OUTLOOK_LABEL[k] ?? k;

function fmtM(n: number) { return "$" + (n / 1e6).toFixed(1) + "M"; }
function fmt0(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
const moneyM = (m: number) => {
  const a = Math.abs(m), s = m < 0 ? "−" : "";
  return `${s}$${a.toFixed(1)}M`;
};
const num = (n: number) => n.toLocaleString("en-US");

function nearest(t: number) {
  let best = SWEEP[0]; let bd = 99;
  for (const r of SWEEP) { const d = Math.abs(r.t - t); if (d < bd) { bd = d; best = r; } }
  return best;
}
function tKey(t: number) {
  const k = (Math.round(t * 100) / 100).toFixed(2);
  return SEG_BY_T[k] ? k : Object.keys(SEG_BY_T)[0];
}
// snap a threshold to the nearest marginal slice (slices run 0.10-0.48 step 0.02)
function marginalKey(t: number) {
  const clamped = Math.min(0.48, Math.max(0.10, t));
  const snapped = Math.round((clamped - 0.10) / 0.02) * 0.02 + 0.10;
  return snapped.toFixed(2);
}

export default function Page() {
  const { policies, policiesReady } = useStore();
  const committed = policies.length ? policies[policies.length - 1] : undefined;

  const [thresh, setThresh] = useState(H.profit_opt_threshold);
  const touched = useRef(false);

  // once the committed policy loads, start the slider there (unless the user moved it)
  useEffect(() => {
    if (policiesReady && committed && !touched.current) setThresh(committed.result.cutline);
  }, [policiesReady, committed]);

  const row = nearest(thresh);
  const profit = row.profit;
  const approval = row.approval;
  const lift = profit - H.approve_all_profit;

  const segNow = SEG_BY_T[tKey(thresh)];
  const maxAbs = Math.max(...SEGS.map((s: any) => Math.abs(s.avg_profit)));

  const mk = marginalKey(thresh);
  const slice = MARGINAL.slices[mk];
  const marg = slice?.marginal;
  const admitPositive = marg ? marg.profit_musd >= 0 : true;
  const stripKeys = Object.keys(MARGINAL.slices).sort();
  const stripMax = Math.max(...stripKeys.map((k) => Math.abs(MARGINAL.slices[k].marginal.profit_musd)));

  const coreMix = MARGINAL.approved_core_grade_mix_at_029;
  const margMix = MARGINAL.marginal_grade_mix_at_029;

  return (
    <div className="wrap">
      <style>{CSS}</style>

      {/* Committed position banner — live from the Decision Log */}
      <div className="pc-committed">
        {policiesReady && committed ? (
          <>
            <div className="pc-com-left">
              <div className="pc-com-eyebrow">Committed policy · v{committed.version}</div>
              <div className="pc-com-row">
                <span className="pc-com-cut">{committed.result.cutline.toFixed(2)}</span>
                <div className="pc-com-stats">
                  <span className="pc-com-profit">{fmtM(committed.result.profit)}</span>
                  <span className="pc-com-sub">{(committed.result.approval * 100).toFixed(1)}% approval · {(committed.result.loss_rate * 100).toFixed(1)}% loss</span>
                </div>
                <span className={`pc-com-badge ${committed.outlook !== "baseline" ? "stress" : ""}`}>{outlookLabel(committed.outlook)}</span>
              </div>
            </div>
            <div className="pc-com-actions">
              <Link href="/builder" className="pc-btn primary">Re-decide →</Link>
              <Link href="/log" className="pc-btn">Decision Log</Link>
            </div>
          </>
        ) : (
          <div className="pc-com-empty">
            <span>No committed policy yet.</span>
            <Link href="/builder" className="pc-btn primary">Set policy in the Builder →</Link>
          </div>
        )}
      </div>

      <div className="kicker">Beyond the Score</div>
      <h1 className="title">Credit decision intelligence</h1>
      <p className="subtitle">
        You are the lender. Drag the cutline to explore the book: the money, the approval
        rate, and the loans your policy decides at the boundary. The profit-optimal,
        accuracy-optimal, and committed policies are marked.
      </p>

      <div className="grid">
        <div className="panel">
          <div className="panel-label">Portfolio profit (out-of-time test set)</div>
          <div className="big-num green">{fmtM(profit)}</div>
          <div className="sub-num">Approving {(approval * 100).toFixed(1)}% of applicants</div>
        </div>

        <div className="panel">
          <div className="panel-label">Lift over approve-everyone</div>
          <div className={"big-num " + (lift >= 0 ? "green" : "red")}>{fmtM(lift)}</div>
          <div className="sub-num">Naive baseline: {fmtM(H.approve_all_profit)}</div>
        </div>

        <div className="panel slider-panel">
          <div className="panel-label">Your approval cutline (approve a loan if its predicted default risk is at or below)</div>
          <div className="slider-row">
            <span className="thresh-val green">{(thresh * 100).toFixed(0)}%</span>
            <input type="range" min={0.01} max={0.99} step={0.01} value={thresh}
              onChange={(e) => { touched.current = true; setThresh(parseFloat(e.target.value)); }} />
          </div>
          <div className="markers">
            <div className="marker profit" style={{ left: (H.profit_opt_threshold * 100) + "%" }}>
              <div className="tick" />Profit-optimal {(H.profit_opt_threshold * 100).toFixed(0)}%
            </div>
            <div className="marker acc" style={{ left: (H.acc_opt_threshold * 100) + "%" }}>
              <div className="tick" />Accuracy-optimal {(H.acc_opt_threshold * 100).toFixed(0)}%
            </div>
            {policiesReady && committed && (
              <div className="marker committed" style={{ left: (committed.result.cutline * 100) + "%", top: "22px" }}>
                <div className="tick" />Committed {(committed.result.cutline * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>

        {/* Marginal cohort — the decision edge at the current cutline */}
        <div className="panel pc-marginal">
          <div className="panel-label">The decision edge · loans between {mk} and {(parseFloat(mk) + 0.02).toFixed(2)}, admitted if you loosen one step</div>
          {marg ? (
            <>
              <div className="pc-mg-grid">
                <div className="pc-mg-stat"><span className="pc-mg-v">{num(marg.n)}</span><span className="pc-mg-l">loans at the edge</span></div>
                <div className="pc-mg-stat"><span className="pc-mg-v">{(marg.avg_pd * 100).toFixed(0)}%</span><span className="pc-mg-l">avg predicted default</span></div>
                <div className="pc-mg-stat"><span className="pc-mg-v">{marg.avg_fico.toFixed(0)} · {marg.avg_dti}%</span><span className="pc-mg-l">avg FICO · DTI</span></div>
                <div className="pc-mg-stat"><span className={`pc-mg-v ${admitPositive ? "pos" : "neg"}`}>{moneyM(marg.profit_musd)}</span><span className="pc-mg-l">profit if admitted</span></div>
              </div>
              <div className={`pc-verdict ${admitPositive ? "pos" : "neg"}`}>
                Admitting this slice brings <strong>{num(marg.defaults)}</strong> defaults costing <strong>{moneyM(marg.loss_musd)}</strong>.{" "}
                {admitPositive ? "It still pays for itself. Room to loosen." : "It destroys value. The boundary is behind you."}
              </div>
              <div className="pc-strip">
                {stripKeys.map((k) => {
                  const p = MARGINAL.slices[k].marginal.profit_musd;
                  const h = Math.abs(p) / (stripMax || 1) * 100;
                  return (
                    <div key={k} className={`pc-bar-slot ${k === mk ? "cur" : ""}`}
                      title={`${k}: ${moneyM(p)}`}
                      onClick={() => { touched.current = true; setThresh(parseFloat(k)); }}>
                      <div className="pc-bar-area">
                        <div className={`pc-bar ${p >= 0 ? "pos" : "neg"}`}
                          style={p >= 0 ? { height: `${h}%`, bottom: "50%" } : { height: `${h}%`, top: "50%" }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pc-zero" />
              </div>
              <div className="pc-strip-axis"><span>0.10</span><span>profit of each marginal slice · green pays, orange loses</span><span>0.48</span></div>
              <div className="pc-mix">
                <MixBar label="Approved core (at 0.29)" mix={coreMix} />
                <MixBar label="Marginal cohort" mix={margMix} />
                <div className="pc-mix-note">The core is 60% A-B. The edge is 84% C-D, where loans stop paying for their risk.</div>
              </div>
            </>
          ) : (
            <div className="sub-num">Drag the cutline between 0.10 and 0.48 to drill the marginal cohort.</div>
          )}
        </div>

        <div className="panel segboard">
          <div className="panel-label">How deep are you funding into each grade?</div>
          <div className="seg-row head">
            <div>Grade</div><div>Avg profit / loan</div>
            <div className="hide-sm">Default rate</div>
            <div className="hide-sm">% funded</div>
            <div>Funded</div>
          </div>
          {SEGS.map((s: any) => {
            const g = String(s.grade);
            const live = segNow[g] ?? { approved_frac: 0, profit: 0 };
            const fundedPct = live.approved_frac * 100;
            const w = (Math.abs(s.avg_profit) / maxAbs) * 100;
            const pos = s.avg_profit >= 0;
            const dim = fundedPct < 5;
            return (
              <div className={"seg-row" + (dim ? " seg-off" : "")} key={g}>
                <div className="seg-grade">{GRADE_LABEL[g] ?? g}</div>
                <div className="seg-bar-wrap">
                  <div className="seg-bar" style={{ width: w + "%", background: pos ? "var(--amber)" : "var(--neg, #E5563E)" }} />
                </div>
                <div className={"hide-sm " + (s.default_rate > 0.3 ? "amber" : "muted")}>
                  {(s.default_rate * 100).toFixed(1)}%
                </div>
                <div className={"hide-sm " + (fundedPct > 50 ? "green" : "muted")}>
                  {fundedPct.toFixed(0)}%
                </div>
                <div>
                  <span className={"pill " + (fundedPct >= 50 ? "on" : "off")}>
                    {fundedPct >= 50 ? "MOSTLY" : fundedPct >= 5 ? "PARTIAL" : "SKIPPED"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="foot">
        <b>The finding:</b> chasing accuracy says approve {(H.acc_opt_approval * 100).toFixed(0)}% of loans;
        chasing profit says approve {(H.profit_opt_approval * 100).toFixed(0)}%. The profit-optimal policy
        earns <b>{fmt0(H.lift_over_approve_all)}</b> more than funding everyone, 95% CI {fmt0(H.ci_low)} to {fmt0(H.ci_high)} ({H.ci_positive_pct.toFixed(0)}% of bootstrap resamples positive). Built on real
        LendingClub outcomes, calibrated (AUC {H.auc}), validated out-of-time. Stress-test this policy in
        the <Link href="/scenarios" className="pc-inline-link">Scenario Studio</Link>, set it under
        constraints in the <Link href="/builder" className="pc-inline-link">Policy Builder</Link>, and
        govern it in the <Link href="/log" className="pc-inline-link">Decision Log</Link>.
      </div>
    </div>
  );
}

const MixBar = ({ label, mix }: { label: string; mix: Record<string, number> }) => (
  <div className="pc-mixbar">
    <div className="pc-mixbar-label">{label}</div>
    <div className="pc-mixbar-track">
      {GRADES.map((g) => (mix[g] > 0 ?
        <div key={g} className="pc-mixseg" style={{ width: `${mix[g] * 100}%`, background: GRADE_COLOR[g] }} title={`${g}: ${(mix[g] * 100).toFixed(0)}%`}>{mix[g] >= 0.08 ? g : ""}</div>
        : null))}
    </div>
  </div>
);

const CSS = `
.pc-committed{display:flex;justify-content:space-between;align-items:center;gap:18px;background:var(--ink2);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:26px;flex-wrap:wrap;}
.pc-com-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:0.13em;color:var(--muted);margin-bottom:6px;}
.pc-com-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.pc-com-cut{font-family:var(--font-news);font-size:40px;font-weight:500;line-height:1;color:var(--amber);}
.pc-com-profit{font-family:var(--font-news);font-size:20px;color:var(--amber2);display:block;}
.pc-com-sub{font-size:11px;color:var(--muted);}
.pc-com-badge{font-size:10px;padding:3px 9px;border-radius:12px;background:var(--border);color:var(--muted);}
.pc-com-badge.stress{background:rgba(232,116,60,0.16);color:#E8743C;}
.pc-com-actions{display:flex;gap:9px;}
.pc-com-empty{display:flex;align-items:center;gap:16px;color:var(--muted);font-size:13px;width:100%;justify-content:space-between;flex-wrap:wrap;}
.pc-btn{text-decoration:none;font-size:12px;padding:9px 15px;border-radius:7px;border:1px solid var(--border);color:var(--text);transition:all .15s;}
.pc-btn:hover{border-color:var(--muted);}
.pc-btn.primary{background:var(--amber);border-color:var(--amber);color:var(--bg);font-weight:600;}
.pc-btn.primary:hover{background:var(--amber2);}
.marker.committed{color:var(--amber2);font-weight:600;}
.pc-marginal{grid-column:1 / -1;}
.pc-mg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px;}
.pc-mg-v{font-family:var(--font-news);font-size:24px;font-weight:500;display:block;}
.pc-mg-v.pos{color:#5FBF8F;}
.pc-mg-v.neg{color:#E5563E;}
.pc-mg-l{font-size:10px;color:var(--muted);}
.pc-verdict{font-family:var(--font-news);font-size:16px;line-height:1.5;padding:12px 16px;border-radius:9px;border:1px solid;margin-bottom:16px;}
.pc-verdict.pos{background:rgba(95,191,143,0.07);border-color:rgba(95,191,143,0.35);}
.pc-verdict.neg{background:rgba(232,116,60,0.08);border-color:rgba(232,116,60,0.4);}
.pc-verdict strong{color:var(--amber2);}
.pc-strip{display:flex;gap:3px;height:64px;position:relative;margin-bottom:6px;}
.pc-bar-slot{flex:1;cursor:pointer;position:relative;}
.pc-bar-area{position:relative;height:100%;}
.pc-bar{position:absolute;left:18%;right:18%;border-radius:2px;opacity:0.75;}
.pc-bar.pos{background:#5FBF8F;}
.pc-bar.neg{background:#E8743C;}
.pc-bar-slot.cur .pc-bar{opacity:1;outline:1px solid var(--amber2);}
.pc-bar-slot:hover .pc-bar{opacity:1;}
.pc-zero{position:absolute;left:0;right:0;top:50%;height:1px;background:var(--muted);opacity:0.45;}
.pc-strip-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9px;color:var(--muted);margin-bottom:16px;}
.pc-mixbar{margin-bottom:9px;}
.pc-mixbar-label{font-size:10px;color:var(--muted);margin-bottom:4px;}
.pc-mixbar-track{display:flex;height:22px;border-radius:5px;overflow:hidden;background:var(--panel-2);}
.pc-mixseg{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#0A1D22;min-width:2px;}
.pc-mix-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5;}
.pc-inline-link{color:var(--amber2);text-decoration:none;border-bottom:1px solid rgba(246,200,119,0.35);}
.pc-inline-link:hover{border-bottom-color:var(--amber2);}
@media(max-width:720px){.pc-mg-grid{grid-template-columns:repeat(2,1fr);}.pc-committed{flex-direction:column;align-items:stretch;}}
`;
