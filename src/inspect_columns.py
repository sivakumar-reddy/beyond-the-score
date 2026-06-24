import pandas as pd

path = "data/accepted_2007_to_2018Q4.csv.gz"

# Read just the first 1000 rows to inspect structure fast.
df = pd.read_csv(path, compression="gzip", nrows=1000, low_memory=False)

print("COLUMN COUNT:", len(df.columns))
print("=" * 60)
for i, col in enumerate(df.columns):
    print(f"{i:3d}  {col}")
