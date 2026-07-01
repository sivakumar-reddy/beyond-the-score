"use client";
import { useState, useMemo, useEffect } from "react";
import DATA from "../../data/policy_data.json";
import { useStore } from "../lib/store";

// ── Row type from policy_data.json (engine output on the 225,639-loan book) ──
type Row = {
  t: number; profit: number; approval: number; capital: number;
  loss_rate: number; default_rate: number; eg_share: number | null;
};
type Constraints = {
  maxLoss: number | null; minAppr: number | null;
  maxCap: number | null; maxEg: number | null;
};

const SCENARIOS = DATA.scenarios as Record<string, { label: string; mode: string; frontier: Row[] }>;
const TOTAL_CAP = DATA.book.total_capital;

// ── optimizer (identical logic to policy_builder.py) ─────────────────────────
function objVal(r: Row, obj: string, targetLoss: number) {
  if (obj === "return") return r.profit;
  if (obj === "volume") return r.capital;
  return -Math.abs(r.loss_rate - targetLoss);
}
function feasible(r: Row, c: Constraints) {
  if (c.maxLoss != null && r.loss_rate > c.maxLoss + 1e-12) return false;
  if (c.minAppr != null && r.approval < c.minAppr - 1e-12) return false;
  if (c.maxCap != null && r.capital > c.maxCap + 1e-6) return false;
  if (c.maxEg != null && r.eg_share != null && r.eg_share > c.maxEg + 1e-12) return false;
  return true;
}
function violations(r: Row, c: Constraints) {
  const v: string[] = [];
  if (c.maxLoss != null && r.loss_rate > c.maxLoss + 1e-12) v.push("maxLoss");
  if (c.minAppr != null && r.approval < c.minAppr - 1e-12) v.push("minAppr");
  if (c.maxCap != null && r.capital > c.maxCap + 1e-6) v.push("maxCap");
  if (c.maxEg != null && r.eg_share != null && r.eg_share > c.maxEg + 1e-12) v.push("maxEg");
  return v;
}
const LABELS: Record<string, string> = {
  maxLoss: "Loss-rate ceiling", minAppr: "Approval-rate floor",
  maxCap: "Capital available", maxEg: "High-risk-grade ceiling",
};
function solve(rows: Row[], obj: string, c: Constraints, tl: number): Row | null {
  const feas = rows.filter((r) => feasible(r, c));
  if (!feas.length) return null;
  let best = feas[0], bv = objVal(best, obj, tl);
  for (const r of feas) { const v = objVal(r, obj, tl); if (v > bv) { bv = v; best = r; } }
  return best;
}

type Binding = { key: string; label: string; gain: number; unit: string; relax: string };
function buildPolicy(rows: Row[], obj: string, c: Constraints, tl: number) {
  const opt = solve(rows, obj, c, tl);
  if (!opt) return { feasible: false as const };
  const objStar = objVal(opt, obj, tl);
  const tStar = opt.t;
  let free = rows[0], fv = objVal(free, obj, tl);
  for (const r of rows) { const v = objVal(r, obj, tl); if (v > fv) { fv = v; free = r; } }
  const tFree = free.t;
  const unit = obj === "volume" ? "funded volume" : "profit";
  const binding: Binding[] = [];
  if (Math.abs(tFree - tStar) > 1e-9) {
    const dir = tFree > tStar ? 1 : -1;
    const idxStar = rows.findIndex((r) => Math.abs(r.t - tStar) < 1e-9);
    const nxt = rows[idxStar + dir];
    if (nxt) {
      const gain = objVal(nxt, obj, tl) - objStar;
      for (const key of violations(nxt, c)) {
        let relax = "the next tier";
        if (key === "maxLoss") { const n = nxt.loss_rate - (c.maxLoss as number); if (n >= 0.0005) relax = `+${(n*100).toFixed(1)}pp loss headroom`; }
        else if (key === "maxCap") { const n = nxt.capital - (c.maxCap as number); if (n > 0) relax = `+$${(n/1e6).toFixed(0)}M capital ($${(gain/n).toFixed(3)} ${unit} per $1)`; }
        else if (key === "minAppr") { const n = (c.minAppr as number) - nxt.approval; if (n >= 0.0005) relax = `-${(n*100).toFixed(1)}pp approval floor`; }
        else if (key === "maxEg") { const n = nxt.eg_share! - (c.maxEg as number); if (n >= 0.0005) relax = `+${(n*100).toFixed(1)}pp high-grade headroom`; }
        binding.push({ key, label: LABELS[key], gain, unit, relax });
      }
    }
  }
  binding.sort((a, b) => b.gain - a.gain);
  return { feasible: true as const, opt, tStar, binding, unit };
}

const money = (x: number) => {
  const m = Math.abs(x);
  if (m >= 1e9) return `$${(x/1e9).toFixed(2)}B`;
  if (m >= 1e6) return `$${(x/1e6).toFixed(1)}M`;
  if (m >= 1e3) return `$${(x/1e3).toFixed(0)}K`;
  return `$${x.toFixed(0)}`;
};
const pct = (x: number) => `${(x*100).toFixed(1)}%`;

export default function BuilderPage() {
  const { outlook, setOutlook, adoptPolicy } = useStore();

  const [obj, setObj] = useState("return");
  const [scenario, setScenario] = useState<string>(outlook?.key && SCENARIOS[outlook.key] ? outlook.key : "baseline");
  const [maxLossOn, setMaxLossOn] = useState(true);
  const [maxLoss, setMaxLoss] = useState(0.12);
  const [minApprOn, setMinApprOn] = useState(false);
  const [minAppr, setMinAppr] = useState(0.8);
  const [maxCapOn, setMaxCapOn] = useState(false);
  const [maxCapPct, setMaxCapPct] = useState(0.6);
  const [maxEgOn, setMaxEgOn] = useState(false);
  const [maxEg, setMaxEg] = useState(0.05);
  const [targetLoss, setTargetLoss] = useState(0.1);
  const [adopted, setAdopted] = useState(false);

  // outlook handed in from Scenario Studio
  // sync the dropdown only when the outlook is one of the named scenarios
  useEffect(() => { if (outlook?.key && SCENARIOS[outlook.key]) setScenario(outlook.key); }, [outlook]);

  const sc = SCENARIOS[scenario] ?? SCENARIOS.baseline;
  // an outlook from Scenario Studio carries the exact composed frontier;
  // optimize on it directly so the Builder solves the same world shown there.
  const rows = (outlook?.frontier ?? sc.frontier) as Row[];
  const stressedFromStudio = !!outlook?.frontier;

  const constraints: Constraints = {
    maxLoss: maxLossOn ? maxLoss : null,
    minAppr: minApprOn ? minAppr : null,
    maxCap: maxCapOn ? maxCapPct * TOTAL_CAP : null,
    maxEg: maxEgOn ? maxEg : null,
  };
  const result = useMemo(
    () => buildPolicy(rows, obj, constraints, targetLoss),
    [rows, obj, maxLossOn, maxLoss, minApprOn, minAppr, maxCapOn, maxCapPct, maxEgOn, maxEg, targetLoss]
  );

  useEffect(() => setAdopted(false), [scenario, obj, maxLoss, maxCapPct, minAppr, maxEg, maxLossOn, minApprOn, maxCapOn, maxEgOn]);

  const doAdopt = () => {
    if (!result.feasible) return;
    const o = result.opt;
    adoptPolicy({
      objective: obj,
      constraints: {
        max_loss_rate: maxLossOn ? maxLoss : null,
        min_approval: minApprOn ? minAppr : null,
        max_capital: maxCapOn ? maxCapPct * TOTAL_CAP : null,
        max_eg_share: maxEgOn ? maxEg : null,
      },
      outlook: stressedFromStudio && outlook ? outlook.label : scenario,
      result: {
        cutline: o.t, profit: o.profit, approval: o.approval,
        loss_rate: o.loss_rate, capital: o.capital,
        binding: result.binding.map((b) => ({ label: b.label, gain: b.gain, unit: b.unit, relax: b.relax })),
      },
      rationale: "Adopted from Policy Builder.",
    });
    setAdopted(true);
  };

  const maxProfit = Math.max(...rows.map((r) => r.profit));

  return (
    <div className="pb-root">
      <style>{CSS}</style>
      <div className="pb-grid">
        <aside className="pb-rail">
          <div className="pb-rail-title">Policy Builder</div>
          {outlook?.key && (
            <div className="pb-outlook-flag">
              <span>Outlook from Scenario Studio: <strong>{outlook.label}</strong></span>
              <button className="pb-outlook-clear" onClick={() => setOutlook(null)}>clear</button>
            </div>
          )}

          <Section label="Objective" n="01">
            <div className="pb-seg">
              {[["return","Maximize return"],["volume","Maximize funded volume"],["target_loss","Hit a target loss rate"]].map(([k,l]) => (
                <button key={k} className={`pb-seg-btn ${obj===k?"on":""}`} onClick={()=>setObj(k)}>{l}</button>
              ))}
            </div>
            {obj==="target_loss" && (
              <Slider label="Target loss rate" value={targetLoss} min={0.04} max={0.2} step={0.005} display={pct(targetLoss)} onChange={setTargetLoss} />
            )}
          </Section>

          <Section label="Risk appetite & limits" n="02">
            <Toggle label="Loss-rate ceiling" on={maxLossOn} set={setMaxLossOn} />
            {maxLossOn && <Slider value={maxLoss} min={0.06} max={0.2} step={0.005} display={pct(maxLoss)} onChange={setMaxLoss} />}
            <Toggle label="Capital available" on={maxCapOn} set={setMaxCapOn} />
            {maxCapOn && <Slider value={maxCapPct} min={0.2} max={1.0} step={0.05} display={money(maxCapPct*TOTAL_CAP)} onChange={setMaxCapPct} />}
            <Toggle label="Approval-rate floor" on={minApprOn} set={setMinApprOn} />
            {minApprOn && <Slider value={minAppr} min={0.5} max={0.98} step={0.01} display={pct(minAppr)} onChange={setMinAppr} />}
            <Toggle label="High-risk-grade (E-G) ceiling" on={maxEgOn} set={setMaxEgOn} />
            {maxEgOn && <Slider value={maxEg} min={0.0} max={0.15} step={0.005} display={pct(maxEg)} onChange={setMaxEg} />}
          </Section>

          <Section label="Economic outlook" n="03">
            <select className="pb-select" value={scenario} onChange={(e)=>setScenario(e.target.value)}>
              {Object.entries(SCENARIOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {(sc.mode==="expected" || stressedFromStudio) && <div className="pb-note">Counterfactual outlook. Profit shown is expected value under stated shocks, not realized.</div>}
          </Section>
        </aside>

        <main className="pb-main">
          <div className="pb-main-head">
            <div className="pb-eyebrow">Optimal policy for your stated intent</div>
            <div className="pb-book">{DATA.book.n_loans.toLocaleString("en-US")} loans · {DATA.book.window}</div>
          </div>

          {!result.feasible ? (
            <div className="pb-empty">No policy satisfies every limit at once. Loosen one constraint to open the feasible set.</div>
          ) : (
            <>
              <div className="pb-result">
                <div className="pb-result-primary">
                  <div className="pb-metric-label">Approve if predicted default ≤</div>
                  <div className="pb-cutline">{result.opt.t.toFixed(2)}</div>
                </div>
                <div className="pb-result-stats">
                  <Stat label={obj==="volume"?"Funded volume":"Portfolio profit"} value={money(obj==="volume"?result.opt.capital:result.opt.profit)} accent />
                  <Stat label="Approval rate" value={pct(result.opt.approval)} />
                  <Stat label="Loss rate" value={pct(result.opt.loss_rate)} />
                  <Stat label="Capital deployed" value={money(result.opt.capital)} />
                </div>
              </div>

              <div className="pb-shadow-zone">
                {result.binding.length === 0 ? (
                  <div className="pb-shadow-none"><span className="pb-check">✓</span> No constraint binds. This policy sits at the unconstrained optimum for your objective.</div>
                ) : (
                  result.binding.map((b, i) => (
                    <div key={b.key} className="pb-shadow" style={{animationDelay:`${i*80}ms`}}>
                      <div className="pb-shadow-tag">Binding{result.binding.length>1?` · ${i+1} of ${result.binding.length}`:""}</div>
                      <div className="pb-shadow-line">
                        Your <strong>{b.label.toLowerCase()}</strong> binds. <span className="pb-shadow-relax">{b.relax}</span> is worth{" "}
                        <span className="pb-shadow-price">{money(b.gain)}</span> <span className="pb-shadow-unit">{b.unit}</span>.
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Frontier rows={rows} tStar={result.tStar} obj={obj} />

              <div className="pb-adopt-row">
                <button className="pb-adopt" onClick={doAdopt} disabled={adopted}>
                  {adopted ? "✓ Adopted to Decision Log" : "Adopt this policy →"}
                </button>
                {adopted && <span className="pb-adopt-note">Written as a new version. Open the Decision Log to see it.</span>}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Frontier({ rows, tStar, obj }: { rows: Row[]; tStar: number; obj: string }) {
  const W = 620, H = 150, pad = 8;
  const val = (r: Row) => (obj === "volume" ? r.capital : r.profit);
  const vals = rows.map(val);
  const vmax = Math.max(...vals), vmin = Math.min(...vals);
  const x = (t: number) => pad + (t - 0.01) / 0.98 * (W - 2*pad);
  const y = (v: number) => H - pad - (v - vmin) / (vmax - vmin || 1) * (H - 2*pad);
  const path = rows.map((r,i) => `${i?"L":"M"}${x(r.t).toFixed(1)},${y(val(r)).toFixed(1)}`).join(" ");
  const optRow = rows.find((r) => Math.abs(r.t-tStar)<1e-9);
  return (
    <div className="pb-frontier">
      <div className="pb-frontier-head">
        <span>{obj==="volume"?"Funded volume":"Profit"} across the approval cutline</span>
        <span className="pb-frontier-cut">optimal cutline {tStar.toFixed(2)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pb-svg" preserveAspectRatio="none">
        <path d={path} className="pb-curve" />
        {optRow && <>
          <line x1={x(tStar)} y1={pad} x2={x(tStar)} y2={H-pad} className="pb-cutmark" />
          <circle cx={x(tStar)} cy={y(val(optRow))} r="4.5" className="pb-cutdot" />
        </>}
      </svg>
      <div className="pb-frontier-axis"><span>lenient · 0.01</span><span>0.99 · strict</span></div>
    </div>
  );
}

const Section = ({ label, n, children }: { label: string; n: string; children: React.ReactNode }) => (
  <section className="pb-section">
    <div className="pb-section-head"><span className="pb-section-n">{n}</span><h3>{label}</h3></div>
    {children}
  </section>
);
const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className={`pb-stat ${accent?"accent":""}`}><div className="pb-stat-val">{value}</div><div className="pb-stat-label">{label}</div></div>
);
const Toggle = ({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) => (
  <button className={`pb-toggle ${on?"on":""}`} onClick={()=>set(!on)}>
    <span className={`pb-toggle-box ${on?"on":""}`}>{on?"✓":""}</span>{label}
  </button>
);
const Slider = ({ label, value, min, max, step, display, onChange }: { label?: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) => (
  <div className="pb-slider">
    {label && <div className="pb-slider-label">{label}</div>}
    <div className="pb-slider-row">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(parseFloat(e.target.value))} />
      <span className="pb-slider-val">{display}</span>
    </div>
  </div>
);

const CSS = `
.pb-root{--bind:#E8743C;font-family:var(--font-space);color:var(--text);}
.pb-root *{box-sizing:border-box;}
.pb-grid{display:grid;grid-template-columns:340px 1fr;max-width:1100px;margin:0 auto;min-height:calc(100vh - 58px);border-left:1px solid var(--border);border-right:1px solid var(--border);}
.pb-rail{background:var(--ink2);border-right:1px solid var(--border);padding:24px 22px;}
.pb-rail-title{font-family:var(--font-news);font-size:22px;font-weight:500;margin-bottom:16px;}
.pb-outlook-flag{background:rgba(232,116,60,0.1);border:1px solid rgba(232,116,60,0.35);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--muted);margin-bottom:6px;line-height:1.5;}
.pb-outlook-flag{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.pb-outlook-flag strong{color:var(--bind);}
.pb-outlook-clear{background:none;border:1px solid var(--border);color:var(--muted);font-family:inherit;font-size:11px;padding:3px 9px;border-radius:12px;cursor:pointer;flex-shrink:0;}
.pb-outlook-clear:hover{color:var(--text);border-color:var(--muted);}
.pb-section{padding:18px 0;border-bottom:1px solid var(--border);}
.pb-section:last-child{border-bottom:none;}
.pb-section-head{display:flex;align-items:baseline;gap:9px;margin-bottom:13px;}
.pb-section-n{font-family:var(--font-mono);font-size:10px;color:var(--amber);letter-spacing:0.1em;}
.pb-section-head h3{margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.13em;color:var(--muted);}
.pb-seg{display:flex;flex-direction:column;gap:6px;}
.pb-seg-btn{text-align:left;background:var(--panel);border:1px solid var(--border);color:var(--text);padding:9px 12px;border-radius:7px;font-family:inherit;font-size:13px;cursor:pointer;transition:all .15s;}
.pb-seg-btn:hover{border-color:var(--muted);}
.pb-seg-btn.on{background:rgba(240,169,59,0.12);border-color:var(--amber);color:var(--amber2);font-weight:500;}
.pb-toggle{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;color:var(--text);padding:8px 0;font-family:inherit;font-size:13px;cursor:pointer;}
.pb-toggle-box{width:17px;height:17px;border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--bg);background:var(--panel);flex-shrink:0;transition:all .15s;}
.pb-toggle-box.on{background:var(--amber);border-color:var(--amber);}
.pb-slider{padding:2px 0 10px 26px;}
.pb-slider-label{font-size:11px;color:var(--muted);margin-bottom:6px;}
.pb-slider-row{display:flex;align-items:center;gap:11px;}
.pb-slider input[type=range]{flex:1;-webkit-appearance:none;height:3px;background:var(--border);border-radius:2px;outline:none;}
.pb-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:var(--amber);cursor:pointer;border:2px solid var(--ink2);}
.pb-slider input[type=range]::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--amber);cursor:pointer;border:2px solid var(--ink2);}
.pb-slider-val{font-family:var(--font-mono);font-size:12px;color:var(--amber2);min-width:64px;text-align:right;}
.pb-select{width:100%;background:var(--panel);border:1px solid var(--border);color:var(--text);padding:9px 11px;border-radius:7px;font-family:inherit;font-size:13px;cursor:pointer;}
.pb-note{font-size:11px;color:var(--muted);margin-top:9px;line-height:1.5;font-style:italic;}
.pb-main{padding:30px 34px;display:flex;flex-direction:column;gap:22px;}
.pb-main-head{display:flex;justify-content:space-between;align-items:baseline;}
.pb-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:var(--muted);}
.pb-book{font-family:var(--font-mono);font-size:11px;color:var(--muted);}
.pb-result{display:flex;gap:34px;align-items:center;background:var(--ink2);border:1px solid var(--border);border-radius:12px;padding:22px 26px;}
.pb-result-primary{border-right:1px solid var(--border);padding-right:34px;}
.pb-metric-label{font-size:11px;color:var(--muted);margin-bottom:2px;}
.pb-cutline{font-family:var(--font-news);font-size:64px;font-weight:500;line-height:0.9;color:var(--amber);letter-spacing:-0.02em;}
.pb-result-stats{display:grid;grid-template-columns:1fr 1fr;gap:16px 30px;flex:1;}
.pb-stat-val{font-family:var(--font-news);font-size:26px;font-weight:500;letter-spacing:-0.01em;}
.pb-stat.accent .pb-stat-val{color:var(--amber2);}
.pb-stat-label{font-size:11px;color:var(--muted);margin-top:1px;}
.pb-shadow-zone{min-height:56px;}
.pb-shadow{background:linear-gradient(90deg,rgba(232,116,60,0.1),transparent);border-left:2px solid var(--bind);padding:13px 18px;border-radius:0 8px 8px 0;margin-bottom:9px;animation:pbShadowIn .4s ease both;}
@keyframes pbShadowIn{from{opacity:0;transform:translateX(-8px);}to{opacity:1;transform:none;}}
.pb-shadow-tag{font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:var(--bind);margin-bottom:5px;font-weight:600;}
.pb-shadow-line{font-family:var(--font-news);font-size:20px;line-height:1.4;}
.pb-shadow-line strong{font-weight:600;color:var(--amber2);}
.pb-shadow-price{color:var(--amber);font-weight:600;}
.pb-shadow-unit{color:var(--muted);font-size:15px;}
.pb-shadow-none{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--muted);padding:16px 0;}
.pb-check{color:var(--amber);font-size:16px;}
.pb-empty{background:var(--ink2);border:1px dashed var(--border);border-radius:12px;padding:40px;text-align:center;color:var(--muted);font-size:14px;}
.pb-frontier{background:var(--ink2);border:1px solid var(--border);border-radius:12px;padding:18px 20px;}
.pb-frontier-head{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:12px;}
.pb-frontier-cut{font-family:var(--font-mono);color:var(--amber2);}
.pb-svg{width:100%;height:150px;display:block;}
.pb-curve{fill:none;stroke:var(--amber);stroke-width:1.6;opacity:0.85;}
.pb-cutmark{stroke:var(--bind);stroke-width:1;stroke-dasharray:3 3;opacity:0.7;}
.pb-cutdot{fill:var(--amber2);stroke:var(--ink2);stroke-width:2;}
.pb-frontier-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:6px;}
.pb-adopt-row{display:flex;align-items:center;gap:14px;}
.pb-adopt{background:var(--amber);border:none;color:var(--bg);padding:12px 22px;border-radius:9px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;}
.pb-adopt:hover:not(:disabled){background:var(--amber2);}
.pb-adopt:disabled{opacity:0.7;cursor:default;background:var(--pos);color:var(--bg);}
.pb-adopt-note{font-size:12px;color:var(--muted);}
@media(max-width:820px){.pb-grid{grid-template-columns:1fr;}.pb-rail{border-right:none;border-bottom:1px solid var(--border);}.pb-result{flex-direction:column;align-items:stretch;gap:20px;}.pb-result-primary{border-right:none;border-bottom:1px solid var(--border);padding-right:0;padding-bottom:18px;}}
`;
