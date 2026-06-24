import pandas as pd
import numpy as np
import json

sweep = pd.read_parquet("data/threshold_sweep.parquet")
seg = pd.read_parquet("data/segment_analysis.parquet")
lifts = np.load("data/bootstrap_lifts.npy")

profit_opt = sweep.loc[sweep["profit"].idxmax()]
acc_opt = sweep.loc[sweep["accuracy"].idxmax()]
approve_all = float(sweep["profit"].iloc[-1])

bundle = {
    "headline": {
        "profit_opt_threshold": round(float(profit_opt["threshold"]), 2),
        "profit_opt_profit": float(profit_opt["profit"]),
        "profit_opt_approval": float(profit_opt["approval_rate"]),
        "acc_opt_threshold": round(float(acc_opt["threshold"]), 2),
        "acc_opt_profit": float(acc_opt["profit"]),
        "acc_opt_approval": float(acc_opt["approval_rate"]),
        "approve_all_profit": approve_all,
        "lift_over_approve_all": float(profit_opt["profit"]) - approve_all,
        "gap_vs_accuracy": float(profit_opt["profit"]) - float(acc_opt["profit"]),
        "ci_low": float(np.percentile(lifts, 2.5)),
        "ci_high": float(np.percentile(lifts, 97.5)),
        "ci_positive_pct": float((lifts > 0).mean() * 100),
        "auc": 0.7268,
        "base_default_rate": 0.1996,
        "n_absorb": 2.84,
    },
    "sweep": [
        {"t": round(float(r["threshold"]), 2),
         "profit": float(r["profit"]),
         "approval": float(r["approval_rate"]),
         "accuracy": float(r["accuracy"])}
        for _, r in sweep.iterrows()
    ],
    "segments": [
        {"grade": str(r["grade"]),
         "n": int(r["n_loans"]),
         "default_rate": float(r["default_rate"]),
         "avg_rate": float(r["avg_int_rate"]),
         "avg_profit": float(r["avg_realized"])}
        for _, r in seg.iterrows()
    ],
}

with open("data/app_data.json", "w") as f:
    json.dump(bundle, f, indent=2)

print("Wrote data/app_data.json")
print("Headline lift: $%s" % f"{bundle['headline']['lift_over_approve_all']:,.0f}")
print("CI: $%s to $%s" % (f"{bundle['headline']['ci_low']:,.0f}", f"{bundle['headline']['ci_high']:,.0f}"))
print("Segments:", len(bundle["segments"]), "| Sweep points:", len(bundle["sweep"]))
