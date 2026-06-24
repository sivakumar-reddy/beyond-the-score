# Beyond the Score

### A profit-optimized credit decision engine

**Live app:** [beyond-the-score-khaki.vercel.app](https://beyond-the-score-khaki.vercel.app)

Most credit models chase accuracy. A lender does not care about accuracy. It cares about money. This project builds a probability-of-default model on real LendingClub loans, then layers a dollar-denominated decision framework on top, and shows that the profit-maximizing approval policy is nowhere near the accuracy-maximizing one.

---

## The finding

On 225,639 out-of-time loans (2017 to 2018, never seen in training):

- **The profit-optimal policy earns about $80M more than funding every applicant** (95% confidence interval $73.6M to $86.8M, positive in 100% of 1,000 bootstrap resamples).
- **Accuracy says approve 96% of loans. Profit says approve 75%.** The 21-point gap is where the money is.
- **One default erases the interest from roughly 2.8 good loans.** That asymmetry is what an accuracy-tuned model is blind to.

### The counterintuitive part: risk is not the same as loss

Default rate rises smoothly from grade A to grade G. Profit does not.

| Grade | Default rate | Avg interest rate | Avg profit / loan |
|-------|-------------|-------------------|-------------------|
| A | 6.3% | 7.0% | +$578 |
| B | 14.7% | 10.6% | +$370 |
| C | 24.6% | 14.3% | **-$88** |
| D | 32.2% | 19.0% | **-$414** |
| E | 38.4% | 24.8% | +$173 |
| F | 45.7% | 29.7% | **+$636** |
| G | 50.1% | 30.9% | -$229 |

Grade F defaults nearly half the time yet earns more per loan than pristine grade A, because the interest rate over-compensates for the risk. Meanwhile grades C and D look respectable and quietly lose money. The lesson is risk-based pricing, not risk avoidance.

The live app lets you set the approval policy yourself and watch the money, the approval rate, and how deep the model funds into each grade move in real time. The model does not accept or reject whole grades; it funds the good loans within each grade, going deep on A through C and cherry-picking only the best of the high-risk grades.

---

## Why you can trust the numbers

Six methodology choices, each one something a credit risk analyst would probe in an interview.

**1. Leakage discipline.** The raw file contains post-origination fields (total payments, recoveries, hardship and settlement records) that encode the outcome. Including them produces fake-high AUC. This project uses only features available at the moment of the lending decision. Every excluded column is documented.

**2. Calibrated probabilities.** The profit math multiplies predicted default probability by dollar amounts, so the probability has to be true, not just well-ranked. The model is calibrated with isotonic regression; mean predicted PD lands within 0.05 points of the actual default rate. A reliability curve is included.

**3. Out-of-time validation.** No random train/test split. The model trains on 2007 to 2016 vintages and is tested on 2017 to 2018 loans, mirroring real deployment where you lend to future borrowers you have not seen. Out-of-time AUC is 0.7268, and the default rate drifted up from 19.7% to 21.3% across the split, which the model held through.

**4. Economic backtest.** The profit-optimal policy is applied to the held-out future vintages and compared, in dollars, to what LendingClub actually earned on those same loans.

**5. Bootstrap confidence.** The headline dollar figure is reported with a 95% confidence interval from 1,000 resamples, not as a point estimate.

**6. Reject inference (honest limitation).** This is the most important caveat. The data only contains loans that were **approved**. We never observe what the rejected applicants would have done, so the model is trained on a censored sample. The real-world default rate among all applicants is almost certainly higher than what we see here, because the riskiest applicants were filtered out before the data was recorded. Every finding in this project is therefore **conditional on the already-approved population**. A production underwriting model would need reject-inference techniques (or a champion/challenger holdout) to address this. Naming it is the honest move; pretending the sample is representative is not.

---

## Stack

Python, pandas, scikit-learn, LightGBM for the model and analysis. Next.js 14 and TypeScript for the live decision tool, deployed on Vercel. The app is fully static; all findings are baked into JSON, so the slider responds instantly with no backend.

## Data

LendingClub accepted-loans data, 2007 to 2018 (public). The raw dataset is not redistributed in this repo. Only aggregate findings (threshold sweep, per-grade summaries) are included, which the app reads.

## Repo layout

- `src/` — the analysis pipeline (data cleaning, model training, calibration, profit layer, bootstrap, exports)
- `web/` — the Next.js decision-tool app
- `*.png` — the three figures (reliability curve, profit curve, segment profit)

## Reproducing

1. Download the LendingClub accepted-loans file and place it in `data/`.
2. Run the scripts in `src/` in order: `build_model_table` → `train_model` → `calibrate` → `profit_layer` → `bootstrap` → the export scripts.
3. `cd web && npm install && npm run dev` to run the app locally.
