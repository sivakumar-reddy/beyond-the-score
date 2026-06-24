import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import LabelEncoder
import joblib

df = pd.read_parquet("data/model_table.parquet")
print("Loaded:", df.shape)

# --- Feature prep ---
df["term"] = df["term"].astype(str).str.extract(r"(\d+)").astype(float)
for c in ["int_rate", "revol_util"]:
    if df[c].dtype != float:
        df[c] = df[c].astype(str).str.replace("%", "", regex=False)
        df[c] = pd.to_numeric(df[c], errors="coerce")

def emp_to_num(x):
    if pd.isna(x): return np.nan
    s = str(x)
    if "10+" in s: return 10.0
    if "< 1" in s: return 0.0
    d = "".join(ch for ch in s if ch.isdigit())
    return float(d) if d else np.nan
df["emp_length"] = df["emp_length"].apply(emp_to_num)

# Date columns -> numeric features
df["issue_d"] = pd.to_datetime(df["issue_d"], format="%b-%Y", errors="coerce")
for dcol in ["earliest_cr_line", "sec_app_earliest_cr_line"]:
    if dcol in df.columns:
        df[dcol] = pd.to_datetime(df[dcol], format="%b-%Y", errors="coerce")

df["credit_hist_months"] = (df["issue_d"] - df["earliest_cr_line"]).dt.days / 30.0
if "sec_app_earliest_cr_line" in df.columns:
    df["sec_app_credit_hist_months"] = (df["issue_d"] - df["sec_app_earliest_cr_line"]).dt.days / 30.0
    df = df.drop(columns=["sec_app_earliest_cr_line"])
df = df.drop(columns=["earliest_cr_line"])

df = df[df["issue_d"].notna()].copy()
df["issue_year"] = df["issue_d"].dt.year

# Encode ALL remaining non-numeric columns (object OR string dtype)
text_cols = [c for c in df.columns
             if c not in ("target",)
             and not pd.api.types.is_numeric_dtype(df[c])
             and not pd.api.types.is_datetime64_any_dtype(df[c])]
for c in text_cols:
    df[c] = LabelEncoder().fit_transform(df[c].astype(str))
print("Encoded text columns:", text_cols)

# --- Time-based split ---
train = df[df["issue_year"] <= 2016]
test  = df[df["issue_year"] >= 2017]
print("Train rows:", len(train), "| Test rows:", len(test))
print("Train default rate:", round(train["target"].mean(),4),
      "| Test default rate:", round(test["target"].mean(),4))

drop_for_X = ["target", "issue_d", "issue_year"]
features = [c for c in df.columns if c not in drop_for_X]

X_train, y_train = train[features], train["target"]
X_test,  y_test  = test[features],  test["target"]

model = lgb.LGBMClassifier(
    n_estimators=400, learning_rate=0.03, num_leaves=31,
    subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1
)
model.fit(X_train, y_train)

pred_test = model.predict_proba(X_test)[:, 1]
auc = roc_auc_score(y_test, pred_test)
print("=" * 50)
print("OUT-OF-TIME AUC (train<=2016, test>=2017):", round(auc, 4))
print("=" * 50)

joblib.dump(model, "src/pd_model.joblib")
test_out = test[["issue_d","target","int_rate","loan_amnt","term"]].copy()
test_out["pd_pred"] = pred_test
test_out.to_parquet("data/test_predictions.parquet", index=False)
print("Saved model and test predictions.")
