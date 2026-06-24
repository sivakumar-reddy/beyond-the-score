import pandas as pd

RAW = "data/accepted_2007_to_2018Q4.csv.gz"
OUT = "data/model_table.parquet"

LEAK_COLS = [
    "out_prncp","out_prncp_inv","total_pymnt","total_pymnt_inv",
    "total_rec_prncp","total_rec_int","total_rec_late_fee","recoveries",
    "collection_recovery_fee","last_pymnt_d","last_pymnt_amnt","next_pymnt_d",
    "last_credit_pull_d","last_fico_range_high","last_fico_range_low",
    "hardship_flag","hardship_type","hardship_reason","hardship_status",
    "deferral_term","hardship_amount","hardship_start_date","hardship_end_date",
    "payment_plan_start_date","hardship_length","hardship_dpd",
    "hardship_loan_status","orig_projected_additional_accrued_interest",
    "hardship_payoff_balance_amount","hardship_last_payment_amount",
    "disbursement_method","debt_settlement_flag","debt_settlement_flag_date",
    "settlement_status","settlement_date","settlement_amount",
    "settlement_percentage","settlement_term",
]

JUNK_COLS = [
    "id","member_id","url","desc","title","zip_code","policy_code","pymnt_plan",
]

DROP = LEAK_COLS + JUNK_COLS

print("Reading full file (this takes a minute)...")
df = pd.read_csv(RAW, compression="gzip", low_memory=False)
print("Raw shape:", df.shape)

paid = ["Fully Paid"]
bad = ["Charged Off", "Default"]
df = df[df["loan_status"].isin(paid + bad)].copy()
df["target"] = df["loan_status"].isin(bad).astype(int)
print("After keeping resolved loans:", df.shape)
print("Default rate:", round(df["target"].mean(), 4))

df = df.drop(columns=[c for c in DROP if c in df.columns])
df = df.drop(columns=["loan_status"])
print("After dropping leak+junk:", df.shape)

df.to_parquet(OUT, index=False)
print("Saved clean modeling table to", OUT)
