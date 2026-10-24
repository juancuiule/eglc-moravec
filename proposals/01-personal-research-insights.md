# Proposal 01 — "Tu contribución a la ciencia" (Personal Research Insights)

A new screen that turns each player's **own** synced trial history into personal cognitive signatures: their own tie advantage, their own table-neighbor error profile, their own rhymed-order effect, and a running count of how many operations they've contributed to the dataset.

Status: draft for maintainer review. All file paths, column names, and function shapes below are grounded in the current repo state (checked against `apps/frontend/src/stats/*`, `apps/backend/src/sync/repo.ts`, `packages/analysis/src/moravec_analysis/features.py`, `packages/engine/src`, `CONTEXT.md`).

---

## 1. Problem & motivation

### The core bet, and the missing loop

`README.md` states the project's founding bet explicitly: *"It keeps the original research bet, that a game people want to open beats a tool they're obligated to open."* `CONTEXT.md` adds the mechanism: stars and celebrations exist because *"a data-collection tool people are compelled to open beats one they're obligated to open — gamification was the mechanism for data scale, not decoration."*

The original Android app proved the bet (~500 downloads → 120,000+ data points, replicating ~30 years of lab findings). But there is an asymmetry today: **the data flows one way.** Every scored Trial lands in the outbox and gets pushed to the backend (`CONTEXT.md`, *Sync*), yet nothing ever comes back to the player as *insight*. The Stats screen shows performance (effectiveness, histograms, error heatmaps) — it never says "here is what your brain is doing, and here is why your data matters."

### The promise

The original team published their research findings publicly through El Gato y La Caja's **Recalculando** writeup — the same document this repo's analysis package reproduces against live data (`packages/analysis/README.md`: *"Reproduces the arithmetic-cognition analyses from Zimmerman et al. 2016 … and the Recalculando writeup, against this app's own backend data"*). That public-facing writeup is the vehicle through which the original players were told what had been discovered from their play.

**Caveat / open question:** the Recalculando text itself lives at `elgatoylacaja.com/notas/investigacion/recalculando` and is **not vendored in this repo** — I searched all markdown (`README.md`, `CONTEXT.md`, `DESIGN.md`, `CLAUDE.md`, `docs/**`) and found no copy of the promise verbatim. The closest in-repo artifacts are:

- `README.md`: *"replicating roughly 30 years of prior lab findings on things like the symmetry advantage (6×6 answered faster than 5×7) and table-neighbor errors (mistaking 6×7 for 48…)"*
- `packages/analysis/README.md`: the explicit link to the Recalculando writeup as the source of the rhyme hypothesis and table-neighbor clustering analyses.

So the honest framing for the proposal: the *promise* ("players will be told what they helped discover") is implied by the existence of a public writeup built on player data, but its exact wording should be pulled from the live page before we quote it in UI copy or marketing. **Open question OQ-1** asks the maintainer whether we can vendor a short excerpt (with permission already granted by publication) into `docs/` so future copy work has a citable source.

What this feature closes: the contribution loop. A player who has played 300 trials sees, in plain language, that *they personally* show the tie advantage, that *their* most common mistake is answering 48 for 6×7, and that *their* 6×4s are faster than their 4×6s — plus a counter saying those trials are part of a real dataset. That is retention fuel (reason to open the app) *and* research literacy, both aligned with the bet.

### Why personal, not population?

Population effects already exist in `packages/analysis` notebooks. What doesn't exist is the per-player view, which is also the more motivating one: "you answer 48 for 6×7 more than anyone" is a sentence a player shares; "mean RT across 412 users" is a sentence a reviewer reads. Personal effects are also scientifically interesting (individual differences in the tie/rhyme effects are themselves a research question the dataset can now support).

---

## 2. User-facing design

### Placement

New section inside the existing Stats screen, not a new route. Rationale:

- The Stats screen already owns the local-first read model (`useLocalTrials()`), the level/practice tab split, the pull-on-visit query, and the export block. Adding a route would duplicate all of that.
- It sits naturally *below* the category list and *above* the export block — "your numbers → what they mean scientifically → take the data with you."
- Navigation: a tappable card titled **"Your contribution to science"** (es: **"Tu contribución a la ciencia"**) expands in place (same pattern as `CategoryStatsDetail`'s back-link drill-down, but lighter — it's a section, not a page). If it grows past ~4 sections, promote to `/stats/science` later; the components stay identical.

### Sections (top to bottom)

#### §0 — Contribution counter (always shown, if any trials)

- Big number: **N operations contributed to this dataset** (es: *N operaciones aportadas a este conjunto de datos*), where N = total trial rows for this identity (level + practice + focus combined — every row is a data point the analysis pipeline consumes).
- Sub-line: breakdown "X in levels · Y in practice" using `run_type`.
- Optional percentile (Phase 2, server-side): "You're among the top P% of contributors" — see §4.3. Hidden entirely when offline or unknown; the counter alone is always meaningful.
- One-sentence explainer: "Every operation you solve is recorded anonymously and helps reproduce 30 years of lab findings about how humans do math." (es equivalent sketched in §2.4.)

#### §1 — Your tie advantage

**Data:** correct-trial `time_taken` on tie operations vs non-tie operations of similar magnitude, within the player's own history.

- Ties: `operands[0] === operands[1]` in multiplication categories (`1dx1d`, `2dx1d`…) — the 6×6-type — **plus** all squaring rows (`(2d)^2`, `(3d)^2`, `(4d)^2`), since a square is structurally a tie (this matches `features.add_operation_fields`, where `is_tie = op1 == op2` and squaring rows have `op2 := op1`).
- Non-ties: same categories, `op1 != op2`, matched by magnitude. Magnitude match = same `category_codename` (the paper's own control structure; `filter_rt_outliers` groups by `category_codename` too) and, within a category, product band |product_tie − product_nontie| ≤ 1 step (e.g. 6×6=36 compared against 5×7=35 and 6×7=42, not against 2×3=6).
- Display: two bars — "identical factors (6×6, 12²)" vs "similar-size others" — with the difference in seconds and a direction word: *faster / slower / no clear difference*.

**Plain-language explanation (shown under the bars):**
> In experiments, people answer 6×6 faster than 5×7 even though both are "about 36". That's the *symmetry advantage*: identical factors may retrieve one memorized fact instead of two. You [do / don't clearly] show it: your ties are {Δ}s faster on average over {n} pairs.

**Thresholds (before showing a claim):** ≥ 10 tie trials AND ≥ 20 non-tie trials in the comparison pool (after outlier filtering, §5.1). Below threshold: show the bars with counts and the line "Keep playing — you'll need ~{k} more tie problems before this comparison is meaningful." Never show a direction word below threshold.

#### §2 — Your table-neighbor error profile

**Data:** wrong answers on multiplication rows, classified with the *exact* rule already implemented twice in the codebase: `classify_multiplication_error` in `packages/analysis/src/moravec_analysis/features.py` and its TS port `multiplicationNeighbor` in `apps/frontend/src/stats/operationStats.ts` (neighbors = products one operand-step away: 48 for 6×7 is 6×8). No new classification logic — only aggregation.

Display, ranked list (a heatmap of *wrong answers* is sparse and hard to read; the ranked list is the primary view):

1. Each entry: **"{asked} → you answer {given}"**, e.g. "6 × 7 → 48", with a badge when the given answer is a table neighbor ("table neighbor: 6 × 8") and the count (×3).
2. Top 5 entries, sorted by count then recency.
3. Summary line: "{p}% of your multiplication mistakes are table neighbors — the same pattern the original study found." (p = share of wrong mult answers with `table_distance_1 === true`; shown only when ≥ 5 wrong mult answers, else hidden.)

**"More than anyone" claim:** requires the server-side population baseline (Phase 2). MVP phrasing stays personal: "This is your most frequent slip." Phase 2 adds, when the player's top confusion exceeds the population median rate for that problem: "You reach for 48 on 6×7 more often than half of all players." See §4.3 for cost.

**Empty states:**
- Zero wrong multiplication answers ever: positive empty state — "You haven't made a multiplication mistake yet. When you do, this is where it will show up." (Never frame as failure.)
- Wrong answers exist but < 5: show the list (it's factual, not statistical) but suppress the summary percentage line.

#### §3 — Your rhymed-order effect

**Data:** the four Spanish rhyme pairs from `RHYME_ORDERED_PAIRS` in `features.py` — `(6,4), (7,5), (9,5), (6,8)` — and their reversals. For each pair, compare the player's correct-trial RT when presented in rhyme order (6×4) vs unrhymed order (4×6). This mirrors `add_rhyme_fields` exactly (`presented_in_rhyme_order` = ordered pair membership).

Display: four rows, one per pair:

```
6 × 4  vs  4 × 6     2.1s   2.9s   → 0.8s faster in rhyme order
7 × 5  vs  5 × 7     1.8s   1.7s   → no clear difference
…
```

Plus a verdict line when enough data: "In Spanish, 'seis por cuatro, veinticuatro' rhymes — and people answer rhyming orders faster. You show this on {k}/4 pairs."

**Thresholds:** per pair, ≥ 3 correct trials in *each* presentation order (paired comparison, §5.2); overall verdict requires ≥ 2 pairs meeting the per-pair bar. Below threshold per pair: show "—" with the raw counts ("4 × 6 seen 1×").

**Scope note:** this is a Spanish-language effect; the en UI must explain it rather than assume it ("in Spanish, the spoken result rhymes with the problem"). es UI can say it plainly.

#### §4 — Caveats footer (always shown with the sections above)

Small text, one paragraph: "These patterns describe *you*, based on your last {n} trials — one person is not a population, and small samples wobble. The scientific claims come from thousands of players; yours are a preview, not a diagnosis." (Full copy in §2.4.)

### 2.4 Copy sketches (en / es)

Key strings (to live in `apps/frontend/messages/{en,es}/stats.json` under a `"science"` key):

| Key | EN | ES |
|---|---|---|
| `title` | Your contribution to science | Tu contribución a la ciencia |
| `counter` | {count, plural, one {# operation} other {# operations}} contributed to this dataset | {count, plural, one {# operación} other {# operaciones}} aportadas a este conjunto de datos |
| `counterBody` | Every operation you solve is recorded anonymously and helps reproduce decades of lab findings about how humans do mental math. | Cada operación que resuelves se registra de forma anónima y ayuda a reproducir décadas de hallazgos de laboratorio sobre cómo hacemos cuentas mentales. |
| `percentile` | You're among the top {pct}% of contributors. | Estás entre el {pct}% superior de personas que aportan datos. |
| `tieTitle` | Your tie advantage | Tu ventaja de los pares |
| `tieFaster` | You answer identical-factor problems {delta}s faster than similar ones — the same "symmetry advantage" labs have measured for 30 years. | Resuelves los problemas con factores iguales {delta}s más rápido que los de tamaño parecido: la misma "ventaja de simetría" que los laboratorios miden desde hace 30 años. |
| `tieNone` | So far, no clear difference between ties and similar problems — or not enough data yet. | Por ahora, sin diferencia clara entre pares y problemas parecidos — o aún faltan datos. |
| `tieNeedMore` | Keep playing: ~{count} more tie problems make this comparison meaningful. | Sigue jugando: con ~{count} pares más esta comparación será significativa. |
| `errorsTitle` | Where your mistakes land | Dónde caen tus errores |
| `errorEntry` | {asked} → you answer {given} | {asked} → respondes {given} |
| `errorNeighbor` | table neighbor: {neighbor} | vecino de tabla: {neighbor} |
| `errorShare` | {pct}% of your multiplication slips are table neighbors — the pattern the original study found. | El {pct}% de tus fallos de multiplicación son vecinos de tabla: el patrón que encontró el estudio original. |
| `errorsClean` | You haven't missed a multiplication yet. When you do, this is where it will show up. | Aún no fallas ninguna multiplicación. Cuando lo hagas, aparecerá aquí. |
| `rhymeTitle` | The rhymed-order effect | El efecto del orden rítmico |
| `rhymeVerdict` | In Spanish, "seis por cuatro, veinticuatro" rhymes — and people answer rhyming orders faster. You show this on {k} of 4 pairs. | En español, "seis por cuatro, veinticuatro" rima — y la gente responde más rápido en el orden que rima. Tú lo muestras en {k} de 4 pares. |
| `caveat` | These patterns describe you, from your last {count} trials. One person isn't a population — treat these as a preview, not a diagnosis. | Estos patrones describen a partir de tus últimas {count} operaciones. Una persona no es una población: tómalo como una vista previa, no un diagnóstico. |

---

## 3. Data & implementation plan

### 3.1 What already suffices — no schema change

Everything needed is in `trial_results` (see `apps/backend/src/db.ts`):

| Column | Used for |
|---|---|
| `operands` (JSON array) | op1/op2, tie detection, rhyme-pair membership, neighbor classification |
| `category_codename` | magnitude matching, category isolation, outlier-filter grouping |
| `answer` (nullable) | error-profile input (null on timeout — excluded from error stats) |
| `correct` | RT comparisons use correct trials only (mirrors `computeStats`' avgTimeMs convention) |
| `time_taken` (ms) | all RT statistics |
| `run_type` | level / practice / practice_focus isolation (§3.4) |
| `played_at` | recency sorting in the error list |
| `keystrokes` | **not used by this feature** — server-side-only evidence; pull responses never return it (`PULL_COLUMNS` in `sync/repo.ts` deliberately omits it), so the client can't compute erased-digit exclusions locally anyway |

No migration. No new table. The analysis package's derived columns (`features.add_all_derived_fields`) are computed, not stored — and this feature does the same computation in TypeScript at render time.

### 3.2 Where the computations go: client-side, in a new `apps/frontend/src/stats/researchInsights.ts`

Decision: **pure functions over the local store, exactly like `computeStats.ts` / `operationStats.ts`** — not a new endpoint, not the Python package. Reasons:

1. **Offline-capability for free.** The Stats screen already renders fully offline from the TinyBase `trials` table (`useLocalTrials()`, hydrated from IndexedDB). All three signature sections (§1–§3) are single-user aggregations over data the device already holds. A server endpoint would make the headline feature dead when offline — unacceptable given `CONTEXT.md`'s offline-play architecture.
2. **Precedent.** `operationStats.multiplicationNeighbor` is already the TS port of `features.classify_multiplication_error`; `findConfusions` already aggregates it. This module reuses that port instead of re-porting.
3. **The Python package stays the research-grade path.** Population-level claims (percentiles, "more than anyone") *do* need the server, and those go through a small endpoint backed by SQL (cheap) or, later, a nightly job in `packages/analysis` that writes a `population_stats` table. The personal sections never touch Python.

**New module: `apps/frontend/src/stats/researchInsights.ts`**

Same structural-typing convention as `computeStats.ts` (minimal input type, not `Api.SyncedTrial`):

```ts
// apps/frontend/src/stats/researchInsights.ts
import type { StatsTrial } from "./computeStats";
import { multiplicationNeighbor } from "./operationStats";

export const MIN_TIE_TRIALS = 10;        // §5 thresholds
export const MIN_NON_TIE_TRIALS = 20;
export const MIN_WRONG_MULT = 5;
export const MIN_PER_RHYME_ORDER = 3;

const RHYME_ORDERED_PAIRS: ReadonlyArray<readonly [number, number]> =
  [[6, 4], [7, 5], [9, 5], [6, 8]];      // mirror of features.RHYME_ORDERED_PAIRS

export type TieComparison = {
  ready: boolean;          // both minima met after outlier filter
  tieCount: number;
  nonTieCount: number;
  tieAvgMs: number | null;
  nonTieAvgMs: number | null;
  deltaMs: number | null;  // nonTie - tie; positive = ties faster
};

export type ErrorProfileEntry = {
  asked: string;           // "6 × 7"
  given: number;           // 48
  count: number;
  neighborLabel: string | null; // "6 × 8"
  lastPlayedAt: number;
};

export type ErrorProfile = {
  entries: ErrorProfileEntry[];       // top 5, by count then recency
  wrongMultTotal: number;
  neighborShare: number | null;       // null when wrongMultTotal < MIN_WRONG_MULT
};

export type RhymePairResult = {
  pair: readonly [number, number];    // canonical rhyme order, e.g. [6,4]
  rhymeOrderCount: number;
  controlOrderCount: number;
  rhymeOrderAvgMs: number | null;
  controlOrderAvgMs: number | null;
  deltaMs: number | null;             // control - rhyme; positive = rhyme faster
  ready: boolean;                     // >= MIN_PER_RHYME_ORDER each side
};

export type RhymeComparison = {
  pairs: RhymePairResult[];           // always all 4, in RHYME_ORDERED_PAIRS order
  readyPairs: number;                 // count of pairs with ready === true
};

export type Contribution = {
  total: number;
  level: number;
  practice: number;                   // includes practice_focus
};

// --- public API -----------------------------------------------------------

/** Correct-trial RT, ties (op1===op2 incl. squaring) vs magnitude-matched
 *  non-ties within the same category_codename (|product diff| <= 1 step).
 *  Applies the 4-SD-per-category RT outlier filter first (§5.1). */
export function computeTieAdvantage(trials: readonly StatsTrial[]): TieComparison;

/** Wrong multiplication answers aggregated by (sorted operands, answer),
 *  classified with multiplicationNeighbor. Squaring/addition rows ignored. */
export function computeErrorProfile(trials: readonly StatsTrial[]): ErrorProfile;

/** Per-rhyme-pair paired RT comparison, correct trials only, 4-SD filtered. */
export function computeRhymeEffect(trials: readonly StatsTrial[]): RhymeComparison;

/** run_type breakdown of the whole history. */
export function computeContribution(trials: readonly SyncedTrialShape): Contribution;
```

(`SyncedTrialShape = StatsTrial & { runType: string }` — `runType` is the one field `StatsTrial` deliberately lacks; `computeContribution` needs it, so it takes the wider shape. Alternatively pass `allTrials` directly as in `StatsScreen`'s export block.)

Implementation notes:

- **Outlier filter** (ported from `features.filter_rt_outliers`): per `category_codename`, drop rows whose `timeTaken` is > 4 SD from the category mean, applied to the *full* trial set of that category before splitting into tie/non-tie (so group statistics aren't contaminated by the very rows being tested). Edge: `std === 0` or n < 2 in a category → skip filtering for that category (can't define SD).
- **Magnitude matching**: within a multiplication category, a tie with product P compares against non-ties with product P−1..P+1 (one table step either way). Squaring rows: `(nd)^2` ties compare against non-ties of the *same* category only — there is no natural non-tie control for squares within a category, so squares count toward the tie pool but the comparison pool is defined per category; if a player has zero non-tie rows in a squaring category, that category contributes ties-without-control and is excluded from the pooled means (documented in the module header comment).
- **Correct-trials-only** for all RT comparisons, matching `computeStats.avgTimeMs` semantics and the paper's RT analyses (RT on errors is confounded by reading-back behavior).
- **Timeouts**: rows with `timeExceeded === true` report `timeTaken === solveTime()` exactly (see `CONTEXT.md`), which inflates the tail; they are *included* in the 4-SD filter's population but *excluded* from the means (a capped value is a censor, not a measurement). This is a deliberate deviation from the raw paper rule, documented in the module.

### 3.3 File-by-file change list

| File | Change |
|---|---|
| `apps/frontend/src/stats/researchInsights.ts` | **New.** Module above: `computeTieAdvantage`, `computeErrorProfile`, `computeRhymeEffect`, `computeContribution`, constants, types. Pure, no imports beyond `./computeStats` (types) and `./operationStats` (`multiplicationNeighbor`). |
| `apps/frontend/src/stats/researchInsights.test.ts` | **New.** Vitest unit tests (§7). |
| `apps/frontend/src/components/ResearchInsightsSection.tsx` | **New.** Presentational component taking `{ trials: SyncedTrial[] }`, rendering §0–§3 + caveat. Uses `useTranslations("Stats.science")`, `formatSeconds` from `../formatTime`, theme tokens only (no raw hex — Tailwind v4 rule). Reuses `panel`/section-heading classes from `../styles`. |
| `apps/frontend/src/components/StatsScreen.tsx` | Insert `<ResearchInsightsSection trials={allTrials ?? []} />` between the category list and the export block; gate on `!isLoading && (allTrials?.length ?? 0) > 0` (same guard as the export block). No changes to the tab logic — the science section uses **all** run types (it's about the dataset, not level-vs-practice performance), which is stated in its subtitle. |
| `apps/frontend/messages/en/stats.json` | Add `"science": { … }` block (§2.4 keys). |
| `apps/frontend/messages/es/stats.json` | Same keys, ES copy. |
| *(Phase 2)* `apps/backend/src/routes/sync.ts` | New `GET /sync/contribution` route returning `{ total, percentile }` (or fold into an existing response — see OQ-3). |
| *(Phase 2)* `apps/backend/src/sync/repo.ts` | `getContributionStats(db, emailHash): { total: number; percentile: number \| null }` — `COUNT(*)` for the user + a percentile query over per-user counts (single pass, indexed on `email_hash`). |
| *(Phase 2)* `apps/backend/src/sync/repo.test.ts`, `apps/backend/src/routes/sync.test.ts` | Integration tests for the new route (§7). |
| *(Phase 2)* `apps/frontend/src/api/Api.ts` + a TanStack Query hook in `ResearchInsightsSection` | Fetch percentile with `enabled: online && token !== null`; hide the sub-line on error/offline. |
| `packages/analysis/src/moravec_analysis/features.py` | **No change required.** Optionally add a notebook `06_personal_effects.ipynb` that validates the TS ports against pandas on the same rows (parity check, §7) — this is the one place Python earns its keep here. |

### 3.4 run_type isolation rules

Per `CONTEXT.md` (*Sync*) and the `practice_focus` entry in `packages/engine/src/logic.ts`: Level rows feed LevelStats; Practice rows are "only a raw synced Trial row"; Focus rows persist as `practice_focus` precisely because *"the adaptive mix biases the category distribution, so analysis filters on it."*

Rules for this feature:

- **Contribution counter (§0):** all three run types count — every row is a data point. Breakdown shown separately.
- **Tie advantage (§1) and rhyme effect (§3):** **exclude `practice_focus`** (biased category mix distorts the comparison pools), include `level` + `practice`. Classic practice is uniform-draw, so it's valid data.
- **Error profile (§2):** include all three — *which* wrong answers you reach for is not distorted by *how often* a category appears (we rank by count of the specific slip, and the neighbor classification is per-row). Documented choice; OQ-2 asks whether the maintainer prefers focus-exclusion here too for consistency.

### 3.5 Offline capability summary

| Part | Offline? | Why |
|---|---|---|
| §0 counter (N operations) | ✅ | Local store holds the full merged history (push + pull merges converge it) |
| §0 percentile | ❌ | Needs the whole user base — server-only; sub-line simply absent when offline |
| §1 tie advantage | ✅ | Pure local aggregation |
| §2 error profile | ✅ | Pure local aggregation |
| §2 "more than anyone" | ❌ | Population baseline — Phase 2, server-only |
| §3 rhyme effect | ✅ | Pure local aggregation |

The one subtlety: the local store is complete for the *current identity* only after at least one successful pull (fresh device). Before that, insights reflect only locally-recorded trials — which is still correct, just younger. No special handling needed; the same property applies to every existing Stats section.

---

## 4. Statistical rigor

### 4.1 Minimum sample sizes per comparison

| Comparison | Bar to display a *claim* (direction word / verdict) | Below bar |
|---|---|---|
| Tie vs non-tie | ≥ 10 tie trials AND ≥ 20 non-tie trials (post-outlier-filter, correct-only) | Bars + counts + "need ~k more" line |
| Error profile list | ≥ 1 wrong mult answer (it's descriptive, not inferential) | Positive empty state |
| Error profile % share line | ≥ 5 wrong mult answers | List without the % line |
| Rhyme, per pair | ≥ 3 correct trials per presentation order | "—" + raw counts |
| Rhyme overall verdict | ≥ 2 pairs passing the per-pair bar | Show per-pair rows only, no verdict |

Rationale: these are *display gates*, not significance tests. With n ≈ 10–20 per arm and within-subject RT SD typically 30–50% of the mean, a 100 ms effect (the paper's tie discount is on that order) is detectable; below n = 10 per arm, a single 8-second outlier moves the mean more than the effect. The gates are deliberately conservative because the UI presents results in plain language without CIs — see §4.3 on adding CIs.

### 4.2 The 4-SD RT outlier filter

Port `features.filter_rt_outliers` faithfully: group by `category_codename`, drop rows with |z| > 4 on `time_taken`. Two adaptations, both documented in-module:

1. **Group size floor:** categories with < 2 rows can't produce an SD; skip filtering there (nothing to filter).
2. **Timeout censors:** `timeExceeded` rows carry `timeTaken === solveTime()` by construction (`CONTEXT.md`: "A timeout always reports timeTaken as exactly Operation.solveTime()"). Including them in the mean/SD is fine (they're rare tails), but excluding them from the *reported means* avoids presenting a censored value as a measurement. The filter itself runs on the unfiltered population including timeouts, matching the paper's rule as closely as this schema allows.

Note the known gap from `packages/analysis/DATA_GAPS.md`: the paper's *other* exclusion (erased-digit trials) cannot be reproduced server-side or client-side — `keystrokes` is never returned in pulls. We accept this parity gap (the analysis package has the same one) and mention it in the notebook parity check, not in the UI.

### 4.3 Do paired comparisons need anything beyond mean difference?

For the MVP: **mean difference + a bootstrap CI is enough; a formal test is not.** Reasoning:

- Both the tie and rhyme comparisons are **within-subject paired designs** (same player, matched problems/presentations). The right statistic is the per-pair difference (tie_i − nontie_i for matched products; rhyme_i − control_i per pair), summarized as mean ± bootstrap CI on the *difference* (resample pairs with replacement, B = 1000, fixed seed for test determinism).
- A paired t-test adds little here: n is small, RT differences are skewed, and the deliverable is a plain-language UI, not a p-value. A CI that excludes zero is exactly what "clearly faster" should mean, and it degrades gracefully ("no clear difference" when it crosses zero) — which is also our below-threshold wording, so the UX is continuous.
- **MVP simplification:** ship mean difference + the sample-size gates, and add the bootstrap CI in Phase 2 (it's ~30 lines and makes the "clearly" wording defensible). Until then, the displayed direction word requires the CI-free proxy: |Δ| ≥ 100 ms *and* both arms above minimum. The 100 ms floor is arbitrary-but-honest and flagged as such in the caveats copy.
- **Honest caveats displayed** (the §4 footer, always visible): one player ≠ population; small samples wobble; these are previews of population-level findings, not diagnoses. Additionally, the tie comparison mixes magnitudes within a category (band-matched, not individually paired) — the rhyme comparison is truly paired, the tie one is quasi-paired; the module comment says so, and the UI wording ("on average") reflects it.

### 4.4 Percentile (Phase 2)

`percentile = 100 × (users with total_trials < mine) / (total_users − 1)`, computed in one SQL pass over `trial_results GROUP BY email_hash`. Cheap on the Pi (indexed on `email_hash`; tens of thousands of rows max). Label carefully: "among the top X% of contributors" — a ranking of volume, never of quality or cognition.

---

## 5. Edge cases

| Case | Handling |
|---|---|
| **Pre-keystroke rows** (`keystrokes IS NULL`, pre-#68) | Irrelevant to this feature — we never read keystrokes. They flow through all sections normally. (The erased-digit exclusion is impossible for them, as for everyone, since pulls omit the column — accepted gap, §4.2.) |
| **Practice vs level isolation** | §3.4 rules: focus excluded from RT comparisons, included in error profile and counter. |
| **Abandoned runs** (< 20 rows under a `run_id`) | No special handling — individual Trial rows are valid data regardless of run completion (`CONTEXT.md`: abandoned runs "still leave their Trials in history"). Nothing here derives run-level summaries, so the 20-row rule never applies. |
| **Very new users** (< minimums everywhere) | Every section renders its below-threshold state; the counter (§0) is the hero — it's meaningful from trial #1. Net effect: the screen is never empty once any trial exists, and it visibly *grows* as the player approaches thresholds ("~k more" lines double as goals). |
| **User who never errs** | §2 positive empty state (§2.2). Also: error profile with wrong answers only in addition/squaring → multiplication-specific empty state ("No multiplication misses yet"), since the neighbor classification is multiplication-only by definition. |
| **Timeouts with `answer = null`** | Excluded from error profile (no answer to classify) and from RT means (censored, §4.2). |
| **Retired/unknown `category_codename`** in old history | `computeStats` already tolerates retired codenames; this module skips any category it can't parse via `categoryFromCodename` (addition categories are excluded from mult-specific sections anyway; unknown codenames are dropped from all sections but still counted in §0). |
| **Identity upgrade (anonymous → OTP)** | Rows are reassigned to the verified user server-side and the local store converges via pull — the insight numbers automatically span both eras. No action needed; worth one integration test asserting post-merge totals (§7). |
| **Shared-browser logout wipe** | Store wipe empties all sections to the loading/empty states — same behavior as existing Stats. Epoch guards already protect against stale pulls repopulating. |
| **Single-category players** (e.g., only practiced `1dx1d`) | Tie and rhyme sections draw only from `1dx1d` (where they live); thresholds apply per the global pool, so a pure-1dx1d player reaches them faster. No division by zero: pools with 0 rows yield `ready: false` and null means. |

---

## 6. Testing plan

### 6.1 Unit tests — `apps/frontend/src/stats/researchInsights.test.ts`

Match the repo's vitest style (plain `describe/it/expect`, factory helpers building `StatsTrial` objects, no DOM):

- **`computeTieAdvantage`**
  - Returns `ready: false` below either minimum; `ready: true` at exactly 10/20.
  - Detects ties in `1dx1d` (6×6) and treats squaring rows as ties (`(2d)^2`, operands `[12]`).
  - Magnitude matching: a 6×6 tie does not pool with 2×3 rows (different category) nor with 8×9 (product band off).
  - Outlier filter: inject one 30 s row into a 2 s-mean category → it is dropped from means (assert via a controlled fixture where dropping changes the expected mean).
  - `timeExceeded` rows excluded from means but present in filter population.
  - Empty input → all-null, `ready: false`.
- **`computeErrorProfile`**
  - Classifies 48-for-6×7 as neighbor "6 × 8" (parity with `features.classify_multiplication_error` — copy the paper's examples: 48/6×7, plus a non-neighbor case like 50 for 6×7).
  - Aggregates repeated slips (×3), sorts by count then recency, caps at 5.
  - Ignores correct rows, `answer === null` rows, addition and squaring rows.
  - `neighborShare` null below 5 wrong mult answers; exact fraction at 5+.
- **`computeRhymeEffect`**
  - Recognizes all four `RHYME_ORDERED_PAIRS` and their reversals; (4,6) is control-order, (6,4) is rhyme-order.
  - Per-pair `ready` flips at 3/3; verdict count = pairs ready.
  - Correct-only: wrong 6×4 rows don't enter the RT pool.
  - Non-rhyme pairs (e.g., 3×7) never appear.
- **`computeContribution`**
  - Splits level / practice / practice_focus correctly; total = sum.

### 6.2 Component smoke test (optional, cheap)

`ResearchInsightsSection` with a synthetic trial set asserts the below-threshold strings render (i18n keys resolve) — only if the repo adopts component tests elsewhere; otherwise skip (existing Stats components have none).

### 6.3 Integration tests (Phase 2 endpoint) — `apps/backend/src/routes/sync.test.ts`

Follow the existing pattern (`openDb(":memory:")`, `buildApp`, `loginAndGetToken`):

- Seed two users with different trial volumes via direct `insertTrialResults` calls; assert `GET /sync/contribution` returns the correct `total` and the lower-volume user's percentile < the higher's.
- Auth: request without Bearer token → 401 (mirror existing sync route tests).
- Anonymous→account merge: insert rows under the anonymous hash, perform the upgrade path the auth tests already exercise, assert the contribution total spans both hashes.

### 6.4 Parity check (analysis package)

`notebooks/06_personal_effects.ipynb` (new): load `trial_results` via `data.load_trial_results`, pick one real user, compute tie/rhyme/error stats with `features.*`, and paste the same rows through the TS module output (via a small script dumping JSON) — assert agreement within floating-point tolerance. This is the guard against the TS port drifting from the paper's definitions. Not automated in CI (needs the live DB); documented as a manual step in the analysis README.

**Mocked:** nothing in unit tests (pure functions). Backend tests mock nothing — in-memory SQLite, real app instance, consistent with `repo.test.ts`/`sync.test.ts`.

---

## 7. Effort estimate

Assumes one developer familiar with the repo; estimates are calendar days.

**Phase 1 — MVP (offline-complete personal insights): ~5 days**

| Task | Days |
|---|---|
| `researchInsights.ts` (4 functions + outlier filter port) | 1.5 |
| Unit tests (6.1) | 1 |
| `ResearchInsightsSection.tsx` + wiring into `StatsScreen` | 1 |
| en/es copy blocks + polish (threshold states, a11y: sr-only tables like `OperationHeatmap`) | 1 |
| Buffer: edge-case pass (§5), review feedback | 0.5 |

**Phase 2 — population context: ~2 days**

| Task | Days |
|---|---|
| `getContributionStats` + `GET /sync/contribution` route + repo/route tests | 1 |
| Frontend query hook, offline-absent sub-line, copy | 0.5 |
| Bootstrap CI in `researchInsights.ts` + "clearly" wording gated on CI-excludes-zero + tests | 0.5 |

**Nice-to-have (unestimated, backlog fodder)**

- "More than anyone" per-confusion comparison (needs per-problem population rates — a `GROUP BY operands, answer` rollup; trivial SQL, but decide caching policy first).
- Parity notebook `06_personal_effects.ipynb`.
- Share-card variant: a static image of the player's three signatures for social posting (reuses the existing `/share` OG machinery).
- Trend: re-run the three signatures over a rolling 90-day window to show whether the player's tie advantage is strengthening.

---

## 8. Open questions for the maintainer

1. **OQ-1 — The promise, quoted.** Can we vendor a short excerpt of the Recalculando writeup (the passage telling players what their data revealed) into `docs/` for citation in UI/marketing copy? It's not in the repo today, and I'd rather quote the actual promise than paraphrase it.
2. **OQ-2 — Focus-session inclusion in the error profile.** I include `practice_focus` rows in §2 (slip identity isn't biased by category frequency) but exclude them from the RT comparisons (mix bias). Is that split acceptable, or should all three signature sections uniformly exclude focus for simplicity?
3. **OQ-3 — Endpoint shape.** Fold the contribution percentile into `POST /sync`'s response (free ride on every flush, but couples research UI to the hot path) vs. a dedicated `GET /sync/contribution` (clean, one extra round trip on visit)? I lean dedicated, mirroring `/sync/level-stats`.
4. **OQ-4 — Squaring ties.** I count `(nd)^2` rows as ties in the §1 pool (structurally op1==op2, matching `features.is_tie`), but they have no non-tie control within their category, so they effectively only inflate the tie arm when a player plays lots of squares. Alternative: restrict §1 to multiplication categories only. Which better serves the "symmetry advantage" story?
5. **OQ-5 — Language scoping of the rhyme section.** The effect is Spanish-specific. Should the en UI show §3 at all (as a "Spanish-language effect" curiosity), or hide it for en users until we have an English analogue? Hiding loses a great demo moment for Spanish speakers using the en UI.
6. **OQ-6 — Privacy posture of the percentile.** Ranking players against each other (even anonymously, even by volume only) is a mild social-comparison feature. Fine for a self-hosted community instrument, but flagging in case the maintainer wants the percentile opt-in.
