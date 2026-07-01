"use client";
import { useState, useMemo } from "react";
import { useStore, AdoptedPolicy } from "../lib/store";

// The Executive Copilot: a narrative layer over computed facts, present on
// every surface as a drawer. The model receives ONLY the facts block below;
// after generation, a guard checks that every figure in the prose traces back
// to a number in that block, and flags anything that doesn't.

// Standing facts from the engine layer (all computed on the 225,639-loan book).
const STANDING = {
  book: { n_loans: 225639, window: "2017-2018 out-of-time" },
  headline: {
    realized_profit_musd: 110.5,
    lift_over_approve_all_musd: 80.2,
    ci_low_musd: 69.0,
    ci_high_musd: 90.0,
    profit_opt_cutline: 0.29,
    accuracy_opt_cutline: 0.49,
    auc: 0.7268,
  },
  reject_inference: {
    declined_scored_millions: 4.4,
    approved_mean_pd: 0.213,
    declined_mean_pd: 0.287,
    risk_gap_pp: 7.4,
    thin_auc: 0.6574,
  },
  fragility_severe: {
    naive_musd: -52.4,
    aware_musd: 5.4,
    cost_musd: 57.7,
    scenario: "moderate recession + moderate rate shock + severe quality drift",
  },
};

const OUTLOOK_LABEL: Record<string, string> = {
  baseline: "Baseline", recession_mild: "Recession, mild",
  recession_moderate: "Recession, moderate", recession_severe: "Recession, severe",
  rate_shock: "Rate shock", severe_combined: "Severe combined",
};
const outlookLabel = (k: string) => OUTLOOK_LABEL[k] ?? k;

const money = (m: number) => {
  const a = Math.abs(m), s = m < 0 ? "−" : "";
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(2)}B`;
  return `${s}$${a.toFixed(1)}M`;
};

const TASKS: Record<string, { label: string; instr: string }> = {
  brief: { label: "Position brief", instr: "Write a 3-4 sentence executive brief on the current committed policy position. State what the policy is and what it achieves." },
  explain: { label: "Explain the change", instr: "In 3-4 sentences, explain what changed between the prior policy version and the current one, and what drove the profit difference. Decompose it plainly." },
  board: { label: "Draft board summary", instr: "Write a short board summary: current position, the key risk (reference the reject-inference conditionality and stress fragility), and one clear recommendation. 5-6 sentences." },
};

function buildFacts(cur: AdoptedPolicy | undefined, prev: AdoptedPolicy | undefined, task: string): string {
  const h = STANDING.headline, r = STANDING.reject_inference, f = STANDING.fragility_severe;
  const lines: string[] = [
    `BOOK: ${STANDING.book.n_loans.toLocaleString("en-US")} loans, ${STANDING.book.window}.`,
  ];
  if (cur) {
    const stressed = cur.outlook !== "baseline";
    lines.push(
      `CURRENT COMMITTED POLICY (v${cur.version}, from the Decision Log):`,
      `  approval cutline = ${cur.result.cutline.toFixed(2)} (approve if predicted default <= this)`,
      `  ${stressed ? "expected-value profit" : "portfolio profit"} = $${(cur.result.profit / 1e6).toFixed(1)}M`,
      `  approval rate = ${(cur.result.approval * 100).toFixed(1)}%`,
      `  loss rate = ${(cur.result.loss_rate * 100).toFixed(1)}%`,
      `  capital deployed = $${(cur.result.capital / 1e6).toFixed(0)}M`,
      `  outlook decided under = ${outlookLabel(cur.outlook)}`,
      `  rationale on record: ${cur.rationale}`,
      stressed
        ? `  NOTE: decided under a counterfactual stressed outlook; profit is expected value, not realized.`
        : `  NOTE: decided under the baseline outlook on the actual out-of-time book.`
    );
    if (cur.result.binding && cur.result.binding.length > 0) {
      for (const b of cur.result.binding)
        lines.push(`  BINDING CONSTRAINT: ${b.label}. Relaxing it (${b.relax}) is worth $${(b.gain / 1e6).toFixed(1)}M ${b.unit}.`);
    } else {
      lines.push(`  No constraint binds; this sits at the unconstrained optimum.`);
    }
  } else {
    lines.push(`CURRENT POLICY: none committed yet.`);
  }
  if (prev && cur) {
    lines.push(
      `PRIOR VERSION (v${prev.version}):`,
      `  cutline = ${prev.result.cutline.toFixed(2)}, profit = $${(prev.result.profit / 1e6).toFixed(1)}M, approval = ${(prev.result.approval * 100).toFixed(1)}%, outlook = ${outlookLabel(prev.outlook)}`,
      `  CHANGE: cutline ${prev.result.cutline.toFixed(2)} -> ${cur.result.cutline.toFixed(2)}, profit delta = $${((cur.result.profit - prev.result.profit) / 1e6).toFixed(1)}M`
    );
  }
  lines.push(
    `HEADLINE FINDING: profit-optimal cutline ${h.profit_opt_cutline} lifts profit $${h.lift_over_approve_all_musd}M over approve-all (95% CI $${h.ci_low_musd}M-$${h.ci_high_musd}M). Accuracy-optimal cutline would be ${h.accuracy_opt_cutline}. Realized profit at the optimum: $${h.realized_profit_musd}M. Model AUC ${h.auc}.`,
    `REJECT INFERENCE: the ~${r.declined_scored_millions}M scored declined applicants run ${r.risk_gap_pp}pp riskier than approved (mean PD ${r.declined_mean_pd} vs ${r.approved_mean_pd}). The finding is conditional on a favorably-selected approved population. (Thin-model AUC ${r.thin_auc}.)`
  );
  if (task === "board" || (cur && cur.outlook !== "baseline")) {
    lines.push(
      `POLICY FRAGILITY (severe scenario: ${f.scenario}): holding the baseline ${h.profit_opt_cutline} cutline yields $${f.naive_musd}M; re-optimizing yields $${f.aware_musd}M; not adapting costs $${f.cost_musd}M.`
    );
  }
  return lines.join("\n");
}

function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  const re = /(?:\$)?\d+(?:,\d{3})*(?:\.\d+)?(?:M|B|pp|%)?/g;
  (text.match(re) || []).forEach((m) =>
    out.add(m.replace(/^\$/, "").replace(/,/g, "").replace(/[MB%]|pp/g, ""))
  );
  return out;
}

export default function CopilotDrawer() {
  const [open, setOpen] = useState(false);
  const { policies, policiesReady } = useStore();
  const [task, setTask] = useState("brief");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState<string[]>([]);

  const cur = policies.length ? policies[policies.length - 1] : undefined;
  const prev = cur ? policies.find((p) => p.version === cur.version - 1) : undefined;

  const facts = useMemo(() => buildFacts(cur, prev, task), [cur, prev, task]);
  const allowed = useMemo(() => extractNumbers(facts), [facts]);

  const run = async () => {
    setBusy(true); setError(""); setOutput(""); setFlagged([]);
    try {
      const resp = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts, instruction: TASKS[task].instr }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || "Narration failed."); return; }
      setOutput(data.text);
      const used = extractNumbers(data.text);
      const smallCounts = new Set(["1","2","3","4","5","6","7","8","9","10"]);
      const bad = [...used].filter((n) => n.length && !allowed.has(n) && !smallCounts.has(n));
      setFlagged(bad);
    } catch {
      setError("Could not reach the narration endpoint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="cp-fab" onClick={() => setOpen(true)} aria-label="Open Executive Copilot">
        ▚ Copilot
      </button>
      {open && (
        <div className="cp-scrim" onClick={() => setOpen(false)}>
          <aside className="cp-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cp-drawer-head">
              <span>Executive Copilot</span>
              <button className="cp-drawer-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="cp-drawer-body">
              <style>{CSS}</style>

              <div className="cpd-guard-badge">narrates computed facts only</div>

              {policiesReady && cur ? (
                <div className="cpd-position">
                  <div className="cpd-pos-row">
                    <span className="cpd-pos-v">v{cur.version}</span>
                    <span className="cpd-pos-cut">{cur.result.cutline.toFixed(2)}</span>
                    <span className="cpd-pos-profit">{money(cur.result.profit / 1e6)}</span>
                  </div>
                  <div className={`cpd-pos-outlook ${cur.outlook !== "baseline" ? "stress" : ""}`}>{outlookLabel(cur.outlook)}</div>
                </div>
              ) : (
                <div className="cpd-hint">No committed policy yet. Adopt one in the Policy Builder first.</div>
              )}

              <div className="cpd-tasks">
                {Object.entries(TASKS).map(([k, v]) => (
                  <button key={k} className={`cpd-task ${task === k ? "on" : ""}`} onClick={() => { setTask(k); setOutput(""); setFlagged([]); }}>
                    {v.label}
                  </button>
                ))}
              </div>

              <button className="cpd-run" onClick={run} disabled={busy || !cur}>
                {busy ? "Writing…" : `Generate ${TASKS[task].label.toLowerCase()}`}
              </button>

              {error && <div className="cpd-error">{error}</div>}
              {output && (
                <div className="cpd-output">
                  <div className="cpd-output-body">{output}</div>
                  <div className={`cpd-guard ${flagged.length ? "warn" : "ok"}`}>
                    {flagged.length
                      ? `Guard: ${flagged.length} figure(s) not found in the source facts — review: ${flagged.join(", ")}`
                      : "Guard: every figure in this brief traces to a computed number."}
                  </div>
                </div>
              )}
              {!output && !error && !busy && cur && (
                <div className="cpd-hint">The copilot writes from the facts panel below only, and the guard verifies every number afterward.</div>
              )}

              <details className="cpd-facts">
                <summary>Facts passed to the model ({allowed.size} values)</summary>
                <pre>{facts}</pre>
              </details>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

const CSS = `
.cpd-guard-badge{font-size:10px;color:var(--muted);border:1px solid var(--border);border-radius:20px;padding:5px 12px;text-transform:uppercase;letter-spacing:0.08em;display:inline-block;margin-bottom:16px;}
.cpd-position{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:13px 15px;margin-bottom:14px;}
.cpd-pos-row{display:flex;align-items:baseline;gap:12px;}
.cpd-pos-v{font-family:var(--font-mono);font-size:12px;color:var(--muted);}
.cpd-pos-cut{font-family:var(--font-news);font-size:26px;font-weight:500;color:var(--amber);}
.cpd-pos-profit{font-family:var(--font-news);font-size:18px;color:var(--amber2);margin-left:auto;}
.cpd-pos-outlook{font-size:11px;color:var(--muted);margin-top:4px;}
.cpd-pos-outlook.stress{color:#E8743C;}
.cpd-tasks{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
.cpd-task{background:var(--panel);border:1px solid var(--border);color:var(--text);padding:7px 11px;border-radius:7px;font-family:inherit;font-size:12px;cursor:pointer;transition:all .13s;}
.cpd-task:hover{border-color:var(--muted);}
.cpd-task.on{background:rgba(240,169,59,0.12);border-color:var(--amber);color:var(--amber2);font-weight:500;}
.cpd-run{width:100%;background:var(--amber);border:none;color:var(--bg);padding:11px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;margin-bottom:14px;}
.cpd-run:hover:not(:disabled){background:var(--amber2);}
.cpd-run:disabled{opacity:0.55;cursor:default;}
.cpd-error{background:rgba(229,86,62,0.1);border:1px solid #E5563E;border-radius:9px;padding:12px;font-size:12px;color:#E5563E;margin-bottom:12px;line-height:1.5;}
.cpd-output{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;}
.cpd-output-body{padding:15px 17px;font-family:var(--font-news);font-size:15px;line-height:1.6;white-space:pre-wrap;}
.cpd-guard{padding:9px 17px;font-size:11px;border-top:1px solid var(--border);font-family:var(--font-mono);line-height:1.5;}
.cpd-guard.ok{color:#5FBF8F;background:rgba(95,191,143,0.06);}
.cpd-guard.warn{color:#E8743C;background:rgba(232,116,60,0.08);}
.cpd-hint{color:var(--muted);font-size:12px;line-height:1.6;margin-bottom:14px;}
.cpd-facts{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:10px 13px;}
.cpd-facts summary{font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);cursor:pointer;}
.cpd-facts pre{margin:10px 0 0;font-family:var(--font-mono);font-size:10px;line-height:1.6;color:var(--muted);white-space:pre-wrap;}
`;
