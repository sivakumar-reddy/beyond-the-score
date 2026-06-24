import pandas as pd
import numpy as np

test = pd.read_parquet("data/test_predictions.parquet")
print("Loans:", len(test))

pd_default = test["pd_cal"].values
amt = test["loan_amnt"].values
term_months = test["term"].values
actual_default = test["target"].values

# We need the installment to compute real amortized interest.
# It wasn't saved in test_predictions, so recompute from the model table.
full = pd.read_parquet("data/model_table.parquet")
# Recompute term as months to align, and pull installment by row order.
# Safer: re-derive installment for the test rows via a merge on index is messy,
# so instead reconstruct installment from loan terms using the standard formula
# ONLY if needed. But LendingClub gives installment directly; load it.

# Reload installment aligned to the test set using issue_d+amt+rate is unreliable.
# Cleanest fix: rebuild test set economics from the saved columns we DO have,
# computing installment from the amortization formula using loan_amnt, int_rate, term.
rate_annual = test["int_rate"].values / 100.0
r = rate_annual / 12.0                      # monthly rate
n = term_months                             # number of payments
# Standard amortized monthly payment formula:
# installment = P * r / (1 - (1+r)^-n)
installment = amt * r / (1 - (1 + r) ** (-n))

# Total interest earned if the loan is fully paid:
total_payments = installment * n
profit_if_good = total_payments - amt       # real interest income

# Loss if default: conservative stated recovery assumption.
RECOVERY = 0.10
loss_if_default = amt * (1 - RECOVERY)

ev = (1 - pd_default) * profit_if_good - pd_default * loss_if_default
test["ev"] = ev

avg_profit_good = profit_if_good.mean()
avg_loss_default = loss_if_default.mean()
N = avg_loss_default / avg_profit_good
print(f"Avg AMORTIZED profit per good loan: ${avg_profit_good:,.0f}")
print(f"Avg loss per default:               ${avg_loss_default:,.0f}")
print(f"N (good loans to absorb 1 default): {N:.2f}")

# Realized profit per loan using ACTUAL outcome
realized = np.where(actual_default == 0, profit_if_good, -loss_if_default)

thresholds = np.linspace(0.01, 0.99, 99)
rows = []
for t in thresholds:
    approve = pd_default <= t
    port_profit = realized[approve].sum()
    approval_rate = approve.mean()
    correct = ((approve) & (actual_default == 0)) | ((~approve) & (actual_default == 1))
    accuracy = correct.mean()
    rows.append((t, port_profit, approval_rate, accuracy))

res = pd.DataFrame(rows, columns=["threshold","profit","approval_rate","accuracy"])
profit_opt = res.loc[res["profit"].idxmax()]
acc_opt = res.loc[res["accuracy"].idxmax()]

print("=" * 55)
print(f"PROFIT-optimal threshold:   {profit_opt['threshold']:.2f} "
      f"| profit ${profit_opt['profit']:,.0f} | approve {profit_opt['approval_rate']*100:.1f}%")
print(f"ACCURACY-optimal threshold: {acc_opt['threshold']:.2f} "
      f"| profit ${acc_opt['profit']:,.0f} | approve {acc_opt['approval_rate']*100:.1f}%")
print("=" * 55)
gap = profit_opt["profit"] - acc_opt["profit"]
print(f"DOLLAR GAP (profit-opt minus accuracy-opt): ${gap:,.0f}")
print("=" * 55)

# Also report profit at "approve everyone" as a baseline
approve_all = realized.sum()
print(f"Profit if APPROVE EVERYONE: ${approve_all:,.0f}")
print(f"Profit-optimal lift over approve-all: ${profit_opt['profit']-approve_all:,.0f}")

res.to_parquet("data/threshold_sweep.parquet", index=False)
test.to_parquet("data/test_predictions.parquet", index=False)
print("Saved.")
