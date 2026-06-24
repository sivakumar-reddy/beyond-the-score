import pandas as pd
import numpy as np

test = pd.read_parquet("data/test_predictions.parquet")
full = pd.read_parquet("data/model_table.parquet")

# We need grade per loan. test_predictions doesn't carry it, so rebuild
# economics here keyed to the test rows via the same columns.
# Simpler: recompute grade from sub_grade isn't available; instead reload
# grade aligned by the test set's original positions.
# The test set was the >=2017 slice; recompute it the same way to get grade.

df = full.copy()
df["issue_d"] = pd.to_datetime(df["issue_d"], format="%b-%Y", errors="coerce")
df = df[df["issue_d"].notna()].copy()
df["issue_year"] = df["issue_d"].dt.year
test_full = df[df["issue_year"] >= 2017].reset_index(drop=True)

# Align: test_predictions was built from this same >=2017 slice in order
test = test.reset_index(drop=True)
test["grade"] = test_full["grade"].values
test["sub_grade"] = test_full["sub_grade"].values

# Recompute amortized economics
amt = test["loan_amnt"].values
rate = test["int_rate"].values / 100.0
n = test["term"].values
r = rate / 12.0
installment = amt * r / (1 - (1 + r) ** (-n))
profit_if_good = installment * n - amt
RECOVERY = 0.10
loss_if_default = amt * (1 - RECOVERY)
actual = test["target"].values
realized = np.where(actual == 0, profit_if_good, -loss_if_default)
test["realized"] = realized

# Segment by grade
seg = test.groupby("grade").agg(
    n_loans=("target", "size"),
    default_rate=("target", "mean"),
    avg_int_rate=("int_rate", "mean"),
    total_realized=("realized", "sum"),
    avg_realized=("realized", "mean"),
).reset_index()
seg["total_realized_M"] = seg["total_realized"] / 1e6

print(seg.to_string(index=False,
      columns=["grade","n_loans","default_rate","avg_int_rate","avg_realized","total_realized_M"],
      float_format=lambda x: f"{x:,.2f}"))

print()
print("Per-loan average profit by grade (the sharp view):")
for _, row in seg.iterrows():
    flag = ""
    if row["avg_realized"] < 0:
        flag = "  <-- LOSES money on average"
    print(f"  Grade {row['grade']}: default {row['default_rate']*100:4.1f}%  "
          f"avg rate {row['avg_int_rate']:4.1f}%  avg profit ${row['avg_realized']:7,.0f}{flag}")

seg.to_parquet("data/segment_analysis.parquet", index=False)
print("\nSaved segment_analysis.parquet")
