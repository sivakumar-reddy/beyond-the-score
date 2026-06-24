import pandas as pd
import numpy as np

test = pd.read_parquet("data/test_predictions.parquet")

pd_default = test["pd_cal"].values
amt = test["loan_amnt"].values
rate = test["int_rate"].values / 100.0
n_term = test["term"].values
actual = test["target"].values

r = rate / 12.0
installment = amt * r / (1 - (1 + r) ** (-n_term))
profit_if_good = installment * n_term - amt
RECOVERY = 0.10
loss_if_default = amt * (1 - RECOVERY)
realized = np.where(actual == 0, profit_if_good, -loss_if_default)

# Fixed profit-optimal threshold from Phase 3
THRESH = 0.29
approve = pd_default <= THRESH

# Point estimates on the full test set
policy_profit = realized[approve].sum()
approve_all_profit = realized.sum()
lift = policy_profit - approve_all_profit
print(f"Point estimate: policy ${policy_profit:,.0f} | approve-all ${approve_all_profit:,.0f}")
print(f"Point lift: ${lift:,.0f}")
print("Bootstrapping (1000 resamples)...")

N = len(test)
rng = np.random.RandomState(42)
B = 1000
lifts = np.empty(B)
for b in range(B):
    idx = rng.randint(0, N, N)            # resample with replacement
    rb = realized[idx]
    ab = approve[idx]
    lifts[b] = rb[ab].sum() - rb.sum()

lo, hi = np.percentile(lifts, [2.5, 97.5])
median = np.percentile(lifts, 50)
print("=" * 55)
print(f"Bootstrap median lift:  ${median:,.0f}")
print(f"95% confidence interval: ${lo:,.0f}  to  ${hi:,.0f}")
print(f"Fraction of resamples with positive lift: {(lifts > 0).mean()*100:.1f}%")
print("=" * 55)

np.save("data/bootstrap_lifts.npy", lifts)
print("Saved bootstrap distribution.")
