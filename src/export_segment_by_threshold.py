import pandas as pd
import numpy as np
import json

test = pd.read_parquet("data/test_predictions.parquet")
full = pd.read_parquet("data/model_table.parquet")

df = full.copy()
df["issue_d"] = pd.to_datetime(df["issue_d"], format="%b-%Y", errors="coerce")
df = df[df["issue_d"].notna()].copy()
df["issue_year"] = df["issue_d"].dt.year
test_full = df[df["issue_year"] >= 2017].reset_index(drop=True)

test = test.reset_index(drop=True)
test["grade"] = test_full["grade"].values

pd_default = test["pd_cal"].values
amt = test["loan_amnt"].values
rate = test["int_rate"].values / 100.0
n_term = test["term"].values
actual = test["target"].values
grade = test["grade"].values

r = rate / 12.0
installment = amt * r / (1 - (1 + r) ** (-n_term))
profit_if_good = installment * n_term - amt
RECOVERY = 0.10
loss_if_default = amt * (1 - RECOVERY)
realized = np.where(actual == 0, profit_if_good, -loss_if_default)

grades = sorted(set(grade))
thresholds = [round(t, 2) for t in np.linspace(0.01, 0.99, 99)]

per_thresh = {}
for t in thresholds:
    approve = pd_default <= t
    g_rows = {}
    for g in grades:
        mask = grade == g
        n_g = int(mask.sum())
        appr = approve & mask
        n_appr = int(appr.sum())
        prof = float(realized[appr].sum())
        g_rows[str(g)] = {
            "approved_frac": (n_appr / n_g) if n_g else 0.0,
            "profit": prof,
        }
    per_thresh[str(t)] = g_rows

out = {"grades": [str(g) for g in grades], "per_threshold": per_thresh}
with open("data/segment_by_threshold.json", "w") as f:
    json.dump(out, f)

print("Wrote data/segment_by_threshold.json")
print("Grades:", grades, "| Thresholds:", len(thresholds))
print("At threshold 0.29:")
for g in grades:
    row = per_thresh["0.29"][str(g)]
    print(f"  Grade {g}: {row['approved_frac']*100:5.1f}% approved, profit ${row['profit']:,.0f}")
