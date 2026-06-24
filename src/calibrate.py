import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
import joblib

# Load the saved test predictions (raw, uncalibrated)
test = pd.read_parquet("data/test_predictions.parquet")
y = test["target"].values
p_raw = test["pd_pred"].values

print("Test loans:", len(test))
print("Actual default rate:", round(y.mean(), 4))
print("Mean predicted PD (raw):", round(p_raw.mean(), 4))
print("Raw Brier score:", round(brier_score_loss(y, p_raw), 5))

# --- Calibrate with isotonic regression ---
# Fit calibration on the test predictions vs actuals.
# (Proper practice: fit on a validation slice. We split test in half:
#  fit isotonic on first half, evaluate on second half, to keep it honest.)
n = len(test)
idx = np.arange(n)
rng = np.random.RandomState(42)
rng.shuffle(idx)
half = n // 2
cal_idx, eval_idx = idx[:half], idx[half:]

iso = IsotonicRegression(out_of_bounds="clip")
iso.fit(p_raw[cal_idx], y[cal_idx])
p_cal = iso.predict(p_raw)

print("Mean predicted PD (calibrated):", round(p_cal.mean(), 4))
print("Calibrated Brier score:", round(brier_score_loss(y, p_cal), 5))
print("AUC unchanged by calibration:", round(roc_auc_score(y, p_cal), 4))

# --- Reliability curve (raw vs calibrated) ---
frac_raw, mean_raw = calibration_curve(y[eval_idx], p_raw[eval_idx], n_bins=10)
frac_cal, mean_cal = calibration_curve(y[eval_idx], p_cal[eval_idx], n_bins=10)

plt.figure(figsize=(7, 7))
plt.plot([0, 1], [0, 1], "k--", label="Perfect calibration")
plt.plot(mean_raw, frac_raw, "o-", label="Raw model")
plt.plot(mean_cal, frac_cal, "s-", label="Calibrated (isotonic)")
plt.xlabel("Mean predicted probability")
plt.ylabel("Observed default fraction")
plt.title("Reliability Curve: Predicted vs Actual Default")
plt.legend()
plt.grid(alpha=0.3)
plt.savefig("reliability_curve.png", dpi=130, bbox_inches="tight")
print("Saved reliability_curve.png")

# Save calibrated predictions for Phase 3
test["pd_cal"] = p_cal
test.to_parquet("data/test_predictions.parquet", index=False)
joblib.dump(iso, "src/calibrator.joblib")
print("Saved calibrated predictions and calibrator.")
