# moravec-analysis

Reproduces the arithmetic-cognition analyses from [Zimmerman et al. 2016, "Arithmetic on Your Phone"](https://doi.org/10.1371/journal.pone.0168431) (the paper the app is named after) and the [Recalculando](https://elgatoylacaja.com/notas/investigacion/recalculando) writeup, against this app's own backend data — size effect, tie effect, five-effect, per-problem order effect, the rhyme hypothesis, and table-neighbor error clustering.

See [`DATA_GAPS.md`](./DATA_GAPS.md) for what the paper needs that the current schema doesn't collect.

## Setup

Uses [uv](https://docs.astral.sh/uv/). If `uv` isn't on your `PATH`, it's installed at `~/.hermes/bin/uv` on this machine.

```sh
cd packages/analysis
uv sync
uv run python -m ipykernel install --user --name moravec-analysis --display-name "moravec-analysis"
uv run jupyter lab notebooks/
```

Pick the **moravec-analysis** kernel when a notebook asks.

## Layout

- `src/moravec_analysis/data.py` — loads `trial_results` / `users` / `levels` straight from `apps/backend/data/moravec.sqlite` into pandas DataFrames.
- `src/moravec_analysis/features.py` — derived columns the paper's effects are defined in terms of (product, sum, tie, five, presentation order, rhyme pairs, table-neighbor error classification) — none of these are stored in the DB, they're computed here.
- `src/moravec_analysis/synth.py` — a synthetic `trial_results` generator with the paper's known effects baked in. **The live DB currently has zero trial rows** (see DATA_GAPS.md) — every notebook defaults to synthetic data (`USE_SYNTHETIC = True` in the first code cell) so the pipeline is runnable and its statistics verifiable today. Flip that flag once real rows exist; nothing else changes, since `synth.generate_synthetic_trials()` returns the same shape as `data.load_trial_results()`.
- `notebooks/` — one notebook per analysis:
  - `00_data_overview.ipynb` — dataset sanity checks, paper's Fig 3 (problems per user / per operation type).
  - `01_size_and_tie_effect.ipynb` — paper Fig 4 / Table 1.
  - `02_regressor_comparison.ipynb` — paper Table 2 (AIC comparison across 9 candidate RT regressors). Slowest notebook (~36 mixed-model fits) — several minutes.
  - `03_five_effect.ipynb` — paper Fig 5 / 6, Section 5.2.2.
  - `04_order_and_rhyme_effect.ipynb` — paper Fig 9, Section 6 (the app's headline new-results section).
  - `05_error_effects.ipynb` — paper Fig 7 / 8 / Table 3.

## Known simplifications vs. the paper

- **Table 2's AIC comparison** uses a random-intercept-only mixed model per regressor; the paper uses random intercept _and_ slope. Revisit once real data volume makes the richer (slower) model worth the wait.
- **Table 3's error-rate regression** is fit as a linear mixed model on the 0/1 `correct` column, same as the paper, rather than a logistic/GLMM — `statsmodels.formula.api.mixedlm` doesn't do logit; a `BinomialBayesMixedGLM` would be the closer match.
- The 4-SD-from-category-mean RT outlier filter is applied (`features.filter_rt_outliers`), but the paper's _other_ RT exclusion — trials where the participant erased a digit mid-entry — can't be reproduced; that signal isn't collected (see DATA_GAPS.md).
