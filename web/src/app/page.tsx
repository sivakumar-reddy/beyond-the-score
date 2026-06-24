"use client";
import { useState } from "react";
import data from "../data/app_data.json";
import segData from "../data/segment_by_threshold.json";

const H = data.headline;
const SWEEP = data.sweep;
const SEGS = data.segments;
const SEG_BY_T: any = segData.per_threshold;

const GRADE_LABEL: Record<string, string> = {
  "0": "A", "1": "B", "2": "C", "3": "D", "4": "E", "5": "F", "6": "G",
  A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G",
};

function fmtM(n: number) { return "$" + (n / 1e6).toFixed(1) + "M"; }
function fmt0(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }

function nearest(t: number) {
  let best = SWEEP[0]; let bd = 99;
  for (const r of SWEEP) { const d = Math.abs(r.t - t); if (d < bd) { bd = d; best = r; } }
  return best;
}
function tKey(t: number) {
  // snap to the nearest 0.01 key present in the seg data
  const k = (Math.round(t * 100) / 100).toFixed(2);
  return SEG_BY_T[k] ? k : Object.keys(SEG_BY_T)[0];
}

export default function Page() {
  const [thresh, setThresh] = useState(H.profit_opt_threshold);
  const row = nearest(thresh);
  const profit = row.profit;
  const approval = row.approval;
  const lift = profit - H.approve_all_profit;

  const segNow = SEG_BY_T[tKey(thresh)];
  const maxAbs = Math.max(...SEGS.map((s: any) => Math.abs(s.avg_profit)));

  return (
    <div className="wrap">
      <div className="kicker">Beyond the Score</div>
      <h1 className="title">A profit-optimized credit decision engine</h1>
      <p className="subtitle">
        You are the lender. Set your approval policy with the slider and watch the money,
        the approval rate, and how deep you fund into each loan grade. The accuracy-optimal
        and profit-optimal policies are marked, drag between them.
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
          <div className="panel-label">Your approval threshold (approve a loan if its predicted default risk is at or below)</div>
          <div className="slider-row">
            <span className="thresh-val green">{(thresh * 100).toFixed(0)}%</span>
            <input type="range" min={0.01} max={0.99} step={0.01} value={thresh}
              onChange={(e) => setThresh(parseFloat(e.target.value))} />
          </div>
          <div className="markers">
            <div className="marker profit" style={{ left: (H.profit_opt_threshold * 100) + "%" }}>
              <div className="tick" />Profit-optimal {(H.profit_opt_threshold * 100).toFixed(0)}%
            </div>
            <div className="marker acc" style={{ left: (H.acc_opt_threshold * 100) + "%" }}>
              <div className="tick" />Accuracy-optimal {(H.acc_opt_threshold * 100).toFixed(0)}%
            </div>
          </div>
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
                  <div className="seg-bar" style={{ width: w + "%", background: pos ? "var(--green)" : "var(--red)" }} />
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
        earns <b>{fmt0(H.lift_over_approve_all)}</b> more than funding everyone, 95% CI {fmt0(H.ci_low)} to
        {fmt0(H.ci_high)} ({H.ci_positive_pct.toFixed(0)}% of bootstrap resamples positive). Built on real
        LendingClub outcomes, calibrated (AUC {H.auc}), validated out-of-time. The board shows the model does
        not accept or reject whole grades, it funds the good loans within each grade, going deep on A-C and
        cherry-picking only the best of the high-risk grades.
      </div>
    </div>
  );
}

