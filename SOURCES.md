# Scenario Studio Shock Band Sources

Each shock band in Scenario Studio is an assumption carried with a band. This file records the sources each band is anchored to.

## 1. Recession shock: PD multiplier, band x1.15 to x1.7

- Board of Governors of the Federal Reserve System, "2026 Stress Test Scenarios" (February 2026). The supervisory severely adverse scenario raises the U.S. unemployment rate by roughly 5.5 percentage points to a peak of 10 percent. Recent cycles used 5.9pp (2025) and 6.3pp (2024).
  https://www.federalreserve.gov/publications/2026-stress-test-scenarios.htm
- Federal Reserve Bank of St. Louis (FRED), "Charge-Off Rate on Consumer Loans, All Commercial Banks" (CORCACBS), quarterly since 1985. Consumer loan charge-off rates more than doubled from pre-2008 levels to their 2009-2010 peak.
  https://fred.stlouisfed.org/series/CORCACBS
  [VERIFY: insert exact pre-recession and peak quarterly values from the FRED chart before public launch]

Interpretation: the severe ceiling of x1.7 on predicted default probability is conservative relative to the realized Great Recession charge-off multiplier.

## 2. Funding-cost shock: band +1pp to +4pp

- Federal funds target rate history (FRED, FEDFUNDS). Observed hiking cycles: 2004-2006 raised the target by +4.25pp; 2022-2023 raised it from 0-0.25% to 5.25-5.50% (+5.25pp).
  https://fred.stlouisfed.org/series/FEDFUNDS
  [VERIFY: confirm both cycle magnitudes on the FRED chart before public launch]

Interpretation: the full band sits within a single observed Fed hiking cycle.

## 3. Applicant-quality drift: band +0.10 to +0.35 logit

- LendingClub Corporation, Investor Letter (SEC Form 8-K), October 14, 2016. Reports higher delinquencies concentrated in 2015 and early-2016 vintages and in higher-risk grades (E, F, G), attributed to rising consumer indebtedness. Loss forecasts were revised upward and the credit model tightened effective the same date.
  https://www.sec.gov/Archives/edgar/data/0001409970/000140997016002805/investorletter101416.htm

Interpretation: this is the same lender as the modeling dataset, in the vintages immediately preceding the 2017-2018 out-of-time book. A forecast-loss revision of 8% to 10% implies a logit shift of about +0.24, inside the band.
