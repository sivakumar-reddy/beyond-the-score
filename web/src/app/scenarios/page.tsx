"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import GRID from "../../data/scenario_grid.json";
import { useStore, FrontierRow } from "../lib/store";

const DATA = GRID as any;
const C = { t: 0, profit: 1, appr: 2, cap: 3, loss: 4, def: 5, eg: 6 };

const SHOCK_ORDER = ["recession", "rate_shock", "quality_drift"];
const SHOCK_UI: Record<string, { title: string; sub: string }> = {
  recession: { title: "Recession", sub: "unemployment up → higher default" },
  rate_shock: { title: "Funding-cost shock", sub: "cost of capital charged against interest" },
  quality_drift: { title: "Applicant-quality drift", sub: "incoming pool worsens" },
};

type Row = number[];
const opt = (rows: Row[]) => rows.reduce((a, r) => (r[C.profit] > a[C.profit] ? r : a), rows[0]);
const at = (rows: Row[], t: number) => rows.reduce((a, r) => (Math.abs(r[C.t] - t) < Math.abs(a[C.t] - t) ? r : a), rows[0]);

const money = (x: number) => {
  const m = Math.abs(x), s = x < 0 ? "−" : "";
  if (m >= 1e9) return `${s}$${(m / 1e9).toFixed(2)}B`;
  if (m >= 1e6) return `${s}$${(m / 1e6).toFixed(1)}M`;
  if (m >= 1e3) return `${s}$${(m / 1e3).toFixed(0)}K`;
  return `${s}$${m.toFixed(0)}`;
};
const signed = (x: number) => (x >= 0 ? "+" : "−") + money(Math.abs(x)).replace("−", "");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signedPct = (x: number) => (x >= 0 ? "+" : "−") + `${Math.abs(x * 100).toFixed(1)}pp`;

// grid rows (arrays) -> the object rows Policy Builder's optimizer expects
const toFrontier = (rows: Row[]): FrontierRow[] =>
  rows.map((r) => ({
    t: r[C.t], profit: r[C.profit], approval: r[C.appr], capital: r[C.cap],
    loss_rate: r[C.loss], default_rate: r[C.def], eg_share: r[C.eg],
  }));

export default function ScenariosPage() {
  const { setOutlook } = useStore();
  const router = useRouter();
  const [lvl, setLvl] = useState([0, 0, 0]); // recession, rate, quality (0=off..3=severe)

  const key = `${lvl[0]}${lvl[1]}${lvl[2]}`;
  const stressed: Row[] = DATA.grid[key].rows;
  const anyShock = key !== "000";
  const baseEv: Row[] = DATA.baseline_ev;
  const baseReal: Row[] = DATA.baseline_realized;

  const baseOpt = opt(baseEv);
  const scOpt = opt(stressed);
  const naive = at(stressed, DATA.baseline_opt_t);
  const fragility = scOpt[C.profit] - naive[C.profit];
  const naiveNegative = naive[C.profit] < 0;

  const dProfit = scOpt[C.profit] - baseOpt[C.profit];
  const dAppr = scOpt[C.appr] - baseOpt[C.appr];
  const dLoss = scOpt[C.loss] - baseOpt[C.loss];
  const dDef = scOpt[C.def] - baseOpt[C.def];
  const dCap = scOpt[C.cap] - baseOpt[C.cap];
  const dEff = scOpt[C.profit] / scOpt[C.cap] - baseOpt[C.profit] / baseOpt[C.cap];

  const activeCount = lvl.filter((l) => l > 0).length;
  const scenarioLabel = activeCount === 0
    ? "Baseline — observed 2017-2018"
    : SHOCK_ORDER.filter((_, i) => lvl[i] > 0)
        .map((sk) => `${SHOCK_UI[sk].title} ${DATA.level_label[DATA.levels[lvl[SHOCK_ORDER.indexOf(sk)]]].toLowerCase()}`)
        .join(" + ");

  const handoff = () => {
    setOutlook({ key, label: scenarioLabel, frontier: toFrontier(stressed) });
    router.push("/builder");
  };

  return (
    <div className="ss-root">
      <style>{CSS}</style>
      <div className="ss-grid">
        <aside className="ss-rail">
          <div className="ss-rail-title">Scenario Studio</div>
          <div className="ss-rail-lead">Compose an economic outlook. Every shock is a sourced
            assumption carried with a band, applied to the real book.</div>

          {SHOCK_ORDER.map((sk, i) => {
            const ui = SHOCK_UI[sk];
            const s = DATA.shocks[sk];
            const bandTxt = sk === "recession" ? `band ×${s.lo}–×${s.hi}`
              : sk === "rate_shock" ? `band +${(s.lo * 100).toFixed(0)}–${(s.hi * 100).toFixed(0)}pp`
              : `band +${s.lo}–${s.hi} logit`;
            return (
              <div className="ss-shock" key={sk}>
                <div className="ss-shock-title">{ui.title}</div>
                <div className="ss-shock-sub">{ui.sub}</div>
                <div className="ss-steps">
                  {DATA.levels.map((lv: string, li: number) => (
                    <button key={lv} className={`ss-step ${lvl[i] === li ? "on" : ""} ${li === 0 ? "off" : ""}`}
                      onClick={() => setLvl((p) => p.map((x, xi) => (xi === i ? li : x)))}>
                      {DATA.level_label[lv]}
                    </button>
                  ))}
                </div>
                <div className="ss-band">{bandTxt} · assumption pending cited source</div>
              </div>
            );
          })}
        </aside>

        <main className="ss-main">
          <div className="ss-main-head">
            <div>
              <div className="ss-eyebrow">Book re-priced under your outlook</div>
              <div className="ss-scenario-name">{scenarioLabel}</div>
            </div>
            <div className="ss-book">{DATA.book.n_loans.toLocaleString("en-US")} loans{anyShock ? " · expected value" : " · realized"}</div>
          </div>

          <div className="ss-deltas">
            <Delta label="Profit at optimum" value={anyShock ? signed(dProfit) : money(opt(baseReal)[C.profit])} neg={anyShock && dProfit < 0} big />
            <Delta label="Approval rate" value={anyShock ? signedPct(dAppr) : pct(baseOpt[C.appr])} neg={anyShock && dAppr < 0} />
            <Delta label="Loss rate" value={anyShock ? signedPct(dLoss) : pct(baseOpt[C.loss])} neg={anyShock && dLoss > 0} />
            <Delta label="Default rate" value={anyShock ? signedPct(dDef) : pct(baseOpt[C.def])} neg={anyShock && dDef > 0} />
            <Delta label="Capital deployed" value={anyShock ? signed(dCap) : money(baseOpt[C.cap])} neg={anyShock && dCap < 0} />
            <Delta label="Capital efficiency" value={anyShock ? signedPct(dEff) : pct(baseOpt[C.profit] / baseOpt[C.cap])} neg={anyShock && dEff < 0} />
          </div>

          <div className={`ss-fragility ${anyShock ? "active" : ""}`}>
            <div className="ss-frag-head">
              <span className="ss-frag-tag">Policy fragility</span>
              <span className="ss-frag-q">does the benign-window policy survive this world?</span>
            </div>
            {!anyShock ? (
              <div className="ss-frag-dormant">Compose a shock to stress-test the baseline
                profit-optimal policy against a re-optimized one.</div>
            ) : (
              <>
                <FragilityChart stressed={stressed} naive={naive} aware={scOpt} baseT={DATA.baseline_opt_t} />
                <div className="ss-frag-line">
                  Holding your baseline <strong>{DATA.baseline_opt_t.toFixed(2)}</strong> cutline into this scenario yields{" "}
                  <span className={naiveNegative ? "ss-neg" : "ss-amber"}>{money(naive[C.profit])}</span>.
                  Re-optimizing to <strong>{scOpt[C.t].toFixed(2)}</strong> yields{" "}
                  <span className="ss-amber">{money(scOpt[C.profit])}</span>.
                  Not adapting costs <span className="ss-price">{money(fragility)}</span>.
                </div>
                {naiveNegative && (
                  <div className="ss-frag-punch">The policy tuned to a calm window doesn&apos;t just underperform here — it loses money.</div>
                )}
                <button className="ss-outlook-btn" onClick={handoff}>Set as Policy Builder outlook →</button>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function FragilityChart({ stressed, naive, aware, baseT }: { stressed: Row[]; naive: Row[]; aware: Row[]; baseT: number }) {
  const W = 640, H = 190, pad = 14;
  const profits = stressed.map((r) => r[C.profit]);
  const vmax = Math.max(...profits, 0), vmin = Math.min(...profits, 0);
  const x = (t: number) => pad + (t - 0.01) / 0.98 * (W - 2 * pad);
  const y = (v: number) => H - pad - (v - vmin) / (vmax - vmin || 1) * (H - 2 * pad);
  const path = stressed.map((r, i) => `${i ? "L" : "M"}${x(r[C.t]).toFixed(1)},${y(r[C.profit]).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ss-svg" preserveAspectRatio="none">
      {vmin < 0 && <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} className="ss-zero" />}
      <path d={path} className="ss-curve" />
      <line x1={x(baseT)} y1={pad} x2={x(baseT)} y2={H - pad} className="ss-naive-line" />
      <circle cx={x(baseT)} cy={y(naive[C.profit])} r="5" className={naive[C.profit] < 0 ? "ss-dot-neg" : "ss-dot-naive"} />
      <circle cx={x(aware[C.t])} cy={y(aware[C.profit])} r="5.5" className="ss-dot-aware" />
    </svg>
  );
}

const Delta = ({ label, value, neg, big }: { label: string; value: string; neg?: boolean; big?: boolean }) => (
  <div className={`ss-delta ${big ? "big" : ""}`}>
    <div className={`ss-delta-val ${neg ? "neg" : ""}`}>{value}</div>
    <div className="ss-delta-label">{label}</div>
  </div>
);

const CSS = `
.ss-root{--bind:#E8743C;--neg:#E5563E;--pos:#5FBF8F;font-family:var(--font-space);color:var(--text);}
.ss-root *{box-sizing:border-box;}
.ss-grid{display:grid;grid-template-columns:340px 1fr;max-width:1100px;margin:0 auto;min-height:calc(100vh - 58px);border-left:1px solid var(--border);border-right:1px solid var(--border);}
.ss-rail{background:var(--ink2);border-right:1px solid var(--border);padding:24px 22px;}
.ss-rail-title{font-family:var(--font-news);font-size:22px;font-weight:500;margin-bottom:6px;}
.ss-rail-lead{font-size:12px;color:var(--muted);line-height:1.55;padding:12px 0 16px;border-bottom:1px solid var(--border);margin-bottom:4px;}
.ss-shock{padding:16px 0;border-bottom:1px solid var(--border);}
.ss-shock:last-child{border-bottom:none;}
.ss-shock-title{font-size:13px;font-weight:600;}
.ss-shock-sub{font-size:11px;color:var(--muted);margin:2px 0 10px;}
.ss-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.ss-step{background:var(--panel);border:1px solid var(--border);color:var(--muted);padding:7px 4px;border-radius:6px;font-family:inherit;font-size:11px;cursor:pointer;transition:all .13s;}
.ss-step:hover{border-color:var(--muted);color:var(--text);}
.ss-step.on{background:rgba(240,169,59,0.14);border-color:var(--amber);color:var(--amber2);font-weight:600;}
.ss-step.on.off{background:rgba(125,160,162,0.14);border-color:var(--muted);color:var(--text);}
.ss-band{font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:9px;}
.ss-main{padding:28px 34px;display:flex;flex-direction:column;gap:22px;}
.ss-main-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
.ss-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:var(--muted);margin-bottom:5px;}
.ss-scenario-name{font-family:var(--font-news);font-size:23px;font-weight:500;max-width:460px;line-height:1.25;}
.ss-book{font-family:var(--font-mono);font-size:11px;color:var(--muted);white-space:nowrap;}
.ss-deltas{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.ss-delta{background:var(--ink2);padding:14px 12px;}
.ss-delta.big{background:var(--panel);}
.ss-delta-val{font-family:var(--font-news);font-size:22px;font-weight:500;color:var(--amber2);}
.ss-delta.big .ss-delta-val{font-size:26px;color:var(--amber);}
.ss-delta-val.neg{color:var(--neg);}
.ss-delta-label{font-size:10px;color:var(--muted);margin-top:3px;line-height:1.3;}
.ss-fragility{border:1px solid var(--border);border-radius:12px;padding:20px 22px;background:var(--ink2);}
.ss-fragility.active{border-color:rgba(232,116,60,0.4);}
.ss-frag-head{display:flex;align-items:baseline;gap:12px;margin-bottom:16px;}
.ss-frag-tag{font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:var(--bind);font-weight:600;}
.ss-frag-q{font-size:12px;color:var(--muted);font-style:italic;}
.ss-frag-dormant{font-size:13px;color:var(--muted);padding:8px 0;}
.ss-svg{width:100%;height:190px;display:block;margin-bottom:16px;}
.ss-curve{fill:none;stroke:var(--amber);stroke-width:1.7;opacity:0.85;}
.ss-zero{stroke:var(--muted);stroke-width:1;stroke-dasharray:2 3;opacity:0.5;}
.ss-naive-line{stroke:var(--bind);stroke-width:1;stroke-dasharray:3 3;opacity:0.55;}
.ss-dot-naive{fill:var(--bind);stroke:var(--ink2);stroke-width:2;}
.ss-dot-neg{fill:var(--neg);stroke:var(--ink2);stroke-width:2;}
.ss-dot-aware{fill:var(--amber);stroke:var(--ink2);stroke-width:2;}
.ss-frag-line{font-family:var(--font-news);font-size:20px;line-height:1.5;}
.ss-frag-line strong{font-weight:600;color:var(--amber2);}
.ss-amber{color:var(--amber);font-weight:600;}
.ss-neg{color:var(--neg);font-weight:600;}
.ss-price{color:var(--bind);font-weight:600;}
.ss-frag-punch{font-size:13px;color:var(--neg);margin-top:12px;padding-top:12px;border-top:1px solid var(--border);}
.ss-outlook-btn{margin-top:16px;background:rgba(240,169,59,0.1);border:1px solid var(--amber);color:var(--amber2);padding:10px 18px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;}
.ss-outlook-btn:hover{background:rgba(240,169,59,0.18);}
@media(max-width:820px){.ss-grid{grid-template-columns:1fr;}.ss-rail{border-right:none;border-bottom:1px solid var(--border);}.ss-deltas{grid-template-columns:repeat(3,1fr);}.ss-scenario-name{font-size:19px;}}
`;
