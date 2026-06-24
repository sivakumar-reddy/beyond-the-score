import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

res = pd.read_parquet("data/threshold_sweep.parquet")

profit_opt = res.loc[res["profit"].idxmax()]
acc_opt = res.loc[res["accuracy"].idxmax()]

fig, ax1 = plt.subplots(figsize=(9, 6))

# Profit curve (left axis, in millions)
ax1.plot(res["threshold"], res["profit"] / 1e6, color="#1f77b4", lw=2.5, label="Portfolio profit")
ax1.set_xlabel("Approval threshold (approve if predicted PD <= threshold)")
ax1.set_ylabel("Portfolio profit ($M)", color="#1f77b4")
ax1.tick_params(axis="y", labelcolor="#1f77b4")

# Accuracy curve (right axis)
ax2 = ax1.twinx()
ax2.plot(res["threshold"], res["accuracy"], color="#ff7f0e", lw=2, ls="--", label="Decision accuracy")
ax2.set_ylabel("Decision accuracy", color="#ff7f0e")
ax2.tick_params(axis="y", labelcolor="#ff7f0e")

# Mark the two optimal thresholds
ax1.axvline(profit_opt["threshold"], color="#1f77b4", ls=":", alpha=0.7)
ax1.axvline(acc_opt["threshold"], color="#ff7f0e", ls=":", alpha=0.7)
ax1.annotate(f"Profit-optimal\n{profit_opt['threshold']:.2f}",
             xy=(profit_opt["threshold"], profit_opt["profit"]/1e6),
             xytext=(profit_opt["threshold"]+0.05, profit_opt["profit"]/1e6),
             color="#1f77b4", fontweight="bold")
ax1.annotate(f"Accuracy-optimal\n{acc_opt['threshold']:.2f}",
             xy=(acc_opt["threshold"], profit_opt["profit"]/1e6*0.6),
             xytext=(acc_opt["threshold"]+0.05, profit_opt["profit"]/1e6*0.55),
             color="#ff7f0e", fontweight="bold")

plt.title("Profit vs Accuracy: the optimal thresholds diverge", fontweight="bold")
fig.tight_layout()
plt.savefig("profit_curve.png", dpi=130, bbox_inches="tight")
print("Saved profit_curve.png")
