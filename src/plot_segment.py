import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

seg = pd.read_parquet("data/segment_analysis.parquet")
seg = seg.sort_values("grade")

grades = seg["grade"].astype(str).values
avg_profit = seg["avg_realized"].values
default_rate = seg["default_rate"].values * 100

colors = ["#2ca02c" if v >= 0 else "#d62728" for v in avg_profit]

fig, ax1 = plt.subplots(figsize=(10, 6))

bars = ax1.bar(grades, avg_profit, color=colors, edgecolor="black", linewidth=0.6, zorder=3)
ax1.axhline(0, color="black", lw=1)
ax1.set_xlabel("Loan grade (A = safest, G = riskiest)")
ax1.set_ylabel("Average profit per loan ($)")
ax1.grid(axis="y", alpha=0.3, zorder=0)

# Label each bar with its dollar value
for b, v in zip(bars, avg_profit):
    ax1.annotate(f"${v:,.0f}",
                 xy=(b.get_x() + b.get_width()/2, v),
                 xytext=(0, 6 if v >= 0 else -14),
                 textcoords="offset points", ha="center",
                 fontweight="bold", fontsize=9)

# Overlay default rate as a line on the right axis
ax2 = ax1.twinx()
ax2.plot(grades, default_rate, color="#ff7f0e", marker="o", lw=2, ls="--",
         label="Default rate", zorder=4)
ax2.set_ylabel("Default rate (%)", color="#ff7f0e")
ax2.tick_params(axis="y", labelcolor="#ff7f0e")

plt.title("Risk is not the same as loss: profit per loan by grade",
          fontweight="bold")
fig.tight_layout()
plt.savefig("segment_profit.png", dpi=130, bbox_inches="tight")
print("Saved segment_profit.png")
