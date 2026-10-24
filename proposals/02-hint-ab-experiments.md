# Proposal 02 — Hint A/B Experiment Infrastructure

**Status:** draft for maintainer review
**Scope:** `packages/engine`, `apps/backend` (db, sync route, repo), `apps/frontend` (level/practice policies, trialSession, stats export), `packages/analysis` (features, notebook, synth)
**Depends on:** nothing open; builds directly on the existing `Hint` interface, `trial_results` schema, and the `POST /sync` push+pull path.

---

## 0. Why this exists

The sister app Mora (kids' version, team blog post "Mora") had a stated research objective of **randomized hint treatments**: hints deliberately varied by type per person — for `3 + 5`, one player sees 8 dots, another sees `4 + 4` — so different assistance types can be compared head-to-head against each other and against no assistance.

The current Moravec rebuild has exactly **one hint variant per operation type**:

- `AdditionHint` (`packages/engine/src/operations/hints/AdditionHint.ts`) — split the right operand into tens + units: `47 + 35 → 47 + 30 + 5 → 77 + 5`.
- `MultiplicationHint` (`.../hints/MultiplicationHint.ts`) — decompose the left operand by digit position: `23 × 4 → (20 + 3) × 4 → 20×4 + 3×4`.
- `SquaringHint` (`.../hints/SquaringHint.ts`) — difference-of-squares around the nearest multiple of 10: `27² = (27−3)(27+3) + 3² = 24 × 30 + 9`.

And `trial_results` records only a boolean `hint_shown` (column added with the original schema in `apps/backend/src/db.ts`). There is no variant identity anywhere — the engine's `TrialResult` carries `hintShown: boolean` (`packages/engine/src/trial/engine.ts`), the Zod schemas carry `hintShown: z.boolean()` (`packages/engine/src/logic.ts`), and the pull side mirrors it as `hintShown: Boolean(r.hint_shown)` (`apps/backend/src/routes/sync.ts`).

This proposal adds the machinery to run proper hint experiments: a `HintVariant` concept in the shared engine, stable per-player assignment, a `hint_variant` column that rides the existing sync pipeline, and an analysis notebook that compares variants. It is deliberately designed so that **Phase 1 is the smallest experiment that works end-to-end** (storage + one extra variant for one category) and Phase 2 completes the matrix.

Design constraints carried over from CONTEXT.md that shape everything below:

- `engine` is imported by both apps and hot-reloaded from source in dev — every new public symbol must live in `packages/engine/src` with extensionless relative imports, exported through `packages/engine/src/index.ts`.
- The backend independently re-validates submitted evidence with the same engine code; the client never sends correctness claims.
- Keystrokes are stored server-side but **never pulled back** ("research evidence only"). We decide explicitly below whether `hint_variant` follows that pattern (§3.4).
- Every outcome consumes exactly one Trial slot; the hint budget is 3 per Level, unlimited in Practice/Focus (`HINTS_PER_LEVEL = 3` in `apps/frontend/src/game/index.ts`, `initialHintsRemaining: () => undefined` in `apps/frontend/src/practice/index.ts`). These rules are unchanged.

---

## 1. Variant model (`packages/engine`)

### 1.1 New module: `packages/engine/src/operations/hints/variants.ts`

```ts
import type { Hint } from "./Hint";
import type { OperationCategory } from "../category";

/** Stable string id persisted in trial_results.hint_variant. */
export type HintVariantId = string;

export interface HintVariant {
  /** e.g. "add-decompose", "mult-distribute", "sq-diff" */
  readonly id: HintVariantId;
  /** Builds the concrete Hint for one drawn operation. */
  build(operands: number[]): Hint;
}

/** All registered variants for a category, in canonical order.
 *  Index in this array is the bucket index used by assignVariant(). */
export function variantsFor(category: OperationCategory): readonly HintVariant[];
```

Each variant produces its own step text while respecting the two existing rules:

1. **The `Hint` interface is unchanged** — `hasHint(): boolean` / `getSteps(): string[]` (`packages/engine/src/operations/hints/Hint.ts`). Variants are factories over the same interface, not a new interface. This keeps `AnsweringPanel.tsx`'s render gate (`hintVisible && !isReviewing && hint.hasHint() && <HintCard steps={hint.getSteps()} />`) and `canShowHint(hintVisible, hasHint, hintsRemaining)` in `packages/engine/src/trial/engine.ts` working untouched.
2. **Hints stop short of the final numeric answer.** Each variant's last step leaves at least one arithmetic operation for the player to perform. This becomes an explicit invariant test (§7.1).

### 1.2 Concrete variants and example steps

**Addition** (categories `1d+1d`, `2d+2d`):

| id | Strategy | Example: `47 + 35` |
|---|---|---|
| `add-decompose` | *(existing `AdditionHint`, renamed under a variant)* Split the right operand into tens + units. | `47 + 35` → `= 47 + 30 + 5` → `= 77 + 5` |
| `add-complement` | Make-to-ten on the left operand: complete the left to the next multiple of 10, subtract the overshoot from the right. Available when `left % 10 !== 0`; falls back to `NoHint` otherwise (e.g. `40 + 35` already is the trick). | `47 + 35` → `= 50 + 32` → `= (47 + 3) + (35 − 3)` |

New class `MakeToTenAdditionHint implements Hint`:

```ts
constructor(left: number, right: number) {}
hasHint(): boolean { return this.left >= 10 && this.left % 10 !== 0; }
getSteps(): string[] {
  // make = 10 - (left % 10); returns [`${l} + ${r}`, `= ${l+make} + ${r-make}`, `= (${l} + ${make}) + (${r} − ${make})`]
}
```

Note the asymmetry vs. the existing hint: `AdditionHint.hasHint()` is false when the *right* operand has no units; `MakeToTenAdditionHint.hasHint()` is false when the *left* operand is already round. Both can be false simultaneously (`40 + 30`), in which case the assigned variant degrades to `NoHint` for that specific draw — recorded honestly as `hint_shown = 0`, `hint_variant = 'add-complement'` (the variant was *assigned*; see §3.3 for why the id is still recorded).

**Multiplication** (categories `2dx1d`, `3dx1d`, `4dx1d`; `1dx1d` stays `NoHint` — memorized facts, matching today's `Multiplication.hint()` gate):

| id | Strategy | Example: `27 × 4` |
|---|---|---|
| `mult-decompose` | *(existing `MultiplicationHint`)* Digit-position decomposition of the left operand. | `27 × 4` → `= (20 + 7) × 4` → `= 20×4 + 7×4` |
| `mult-round` | Round the left operand to the nearest multiple of 10, correct for the difference. Available when `left % 10 !== 0`; else `NoHint`. | `27 × 4` → `= 30×4 − 3×4` → `= (27 + 3)×4 − 3×4` |

New class `RoundCorrectionMultiplicationHint implements Hint`:

```ts
constructor(left: number, right: number) {}
hasHint(): boolean { return this.left >= 10 && this.left % 10 !== 0; }
getSteps(): string[] {
  // rounded = Math.round(left/10)*10; diff = rounded - left (signed)
  // returns [`${l} × ${r}`, `= ${rounded}×${r} ${diff>=0 ? "−" : "+"} ${abs(diff)}×${r}`]
}
```

(Doubling/halving was considered for multiplication but rejected for Phase 1: it only applies when one operand is even, which interacts badly with `createRandomOperand`'s restrictions and would give ~half the draws a `NoHint` fallback, shrinking cells unevenly. Round-correction applies to every non-round two-digit operand and pairs cleanly with the addition complement variant — both are "complete then correct" strategies, which makes the cross-category comparison scientifically interesting.)

**Squaring** (categories `(2d)^2`, `(3d)^2`, `(4d)^2`):

| id | Strategy | Example: `27²` |
|---|---|---|
| `sq-diff` | *(existing `SquaringHint`)* Difference of squares around the nearest multiple of 10. | `27² = (27−3)(27+3) + 3²` → `= 24 × 30 + 9` |
| `sq-expand` | Standard expansion: split into tens + units, square both, double the cross term. | `27² = (20 + 7)²` → `= 20² + 2×20×7 + 7²` |

New class `ExpansionSquaringHint implements Hint`:

```ts
constructor(x: number) {}
hasHint(): boolean { return this.x >= 10; }
getSteps(): string[] {
  const tens = x - (x % 10), units = x % 10;
  // returns [`${x}² = (${tens} + ${units})²`, `= ${tens}² + 2×${tens}×${units} + ${units}²`]
}
```

Both squaring variants stop at the expanded form — the player still computes `576 + 280 + 49` or `720 + 9`. Neither step may contain `x*x` (§7.1 invariant).

### 1.3 Where the variant lives on the Operation

Today `Operation.hint(): Hint` hardcodes the concrete class (`packages/engine/src/operations/operation.ts`, e.g. `Addition.hint()` returns `new AdditionHint(...)`). The change:

```ts
// packages/engine/src/operations/operation.ts
export abstract class Operation {
  // ... existing members unchanged
  hint(): Hint { return new NoHint(); }
  /** The variant assigned to THIS draw. Set by createOperation's caller. */
  hintVariantId(): HintVariantId | null { return null; }
}
```

Rather than threading a constructor parameter through every `Addition`/`Multiplication`/`Squaring` subclass (and breaking `reconstructOperation`, which the backend uses for re-validation), the variant is attached as a lightweight wrapper produced at draw time:

```ts
// packages/engine/src/operations/index.ts
export function createOperation(
  codename: string,
  variantId?: HintVariantId,
): Operation {
  const op = createOperationInternal(codename); // today's body, unchanged
  if (variantId === undefined) return op;
  return attachVariant(op, variantId); // wraps hint() to use variantsFor(category)[bucket]
}
```

`attachVariant` returns a small subclass-like proxy (a real `Object.create(Object.getPrototypeOf(op))` clone with `hint()` and `hintVariantId()` rebound) so that `result()`, `solveTime()`, `operands()`, `categoryCodename()`, `humanReadable()` all remain identical — the backend's `reconstructOperation` path is untouched, because the server never needs the variant: it re-validates operands/answer/time, not hints. Hints are display-only; there is no server-side hint re-derivation today and none is proposed.

`reconstructOperation` stays variant-free. If a future feature needs the variant server-side (it shouldn't — see §3.4), it can be read from the pushed row, not recomputed.

---

## 2. Assignment strategy

### 2.1 Stable per-(user, category) bucketing

Assignment must be **stable across sessions and devices** — a player who gets `add-complement` on their phone must get it on their laptop after login-upgrade, or the within-user design breaks. The stable identifier available client-side at draw time is the session token: `apps/frontend/src/storage/session.ts` persists `{token, email}` in the `moravec_session` cookie, and the token survives the anonymous→account upgrade flow's local data wipe only via re-mint… actually, on logout/remint the token changes (CONTEXT.md: "a login or remint restarts [the cursor] at 0"). The token is therefore **not** a stable user key.

The stable key is the **device id** (`apps/frontend/src/storage/deviceId.ts`, `localStorage["moravec:deviceId"]`) combined with the **email hash once known**. But the frontend does not know the email hash (it's derived server-side from the salted secret). So we use what the client stably knows:

```ts
// packages/engine/src/operations/hints/variants.ts
/** FNV-1a over `${seed}:${categoryType}:${variantCount}` — deterministic,
 *  dependency-free, runs identically in browser and Node. */
export function assignVariant(
  seed: string,           // stable per player (see below)
  category: OperationCategory,
): HintVariantId | null   // null when the category has ≤1 variant (no experiment)
```

Seed resolution, in priority order:

1. **Logged-in players:** the session cookie's `email` field itself is stable across devices for the same account, but it's PII in a hash input — fine, since the hash output is what matters and the input never leaves the device. Use `sha-like(email)` — except we don't want to pull WebCrypto async into the draw path. Instead: FNV-1a over the raw email string. The seed is only ever hashed locally; the raw email never enters any payload.
2. **Anonymous players:** FNV-1a over the device id. When the anonymous session upgrades to an account, the seed switches from device-based to email-based — the player's bucket **may change at upgrade**. That is acceptable and documented: the upgrade is a rare, discrete event, and continuity of history is preserved by the merge (rows keep their recorded `hint_variant`), so pre- and post-upgrade rows are simply different-condition observations for that user. Analysis treats `email_hash` as the unit of randomization and notes the switch as a covariate.

Bucketing: `bucket = fnv1a(seed + ":" + category.type) % variants.length`, and the variant is `variantsFor(category)[bucket]`. Per-category (not global) hashing means a player's addition variant and multiplication variant are independent draws — important so that a two-variant addition experiment doesn't correlate with the multiplication condition.

**Determinism requirement:** the same `(seed, category)` always yields the same variant, forever. The variant registry order (`variantsFor`'s array order) is part of the contract — inserting a new variant *appends* to the array (never reorders), so `% length` shifts buckets for everyone when a third variant lands. Mitigation: the hash includes the variant count (`fnv1a(seed + ":" + type + ":" + n)`), so adding a variant changes assignments predictably and uniformly rather than silently re-bucketing a subset; and the analysis notebook records `n_variants_at_assignment` implicitly via the observed id set. Re-bucketing on registry growth is an accepted cost (open question §9.4).

### 2.2 Within-subject vs. between-subject — argued and decided

**Option A — Between-subject (each player permanently gets one variant mix):**
- Pros: cleanest causal interpretation; no practice/crossover effects; matches Mora's stated design ("hints deliberately varied by type per person"); simplest analysis (independent groups, standard t-test/mixed model with user as random intercept).
- Cons: slow cell filling — with 2 variants × 6 categories, each user contributes to only 2 of 12 cells; reaching 30 users/cell requires ~180 active users playing those categories. On a self-hosted Pi with modest traffic, that's months.

**Option B — Within-subject (every player sees ALL variants in rotation):**
- Pros: fast cell filling (each user fills all cells); controls for individual speed differences (the biggest variance source in RT data); the paper's own effects (size, tie, rhyme) were analyzed within-subject.
- Cons: order effects — seeing `add-complement` five times before `add-decompose` teaches the player the *existence* of structured hints and warms up the general "decompose" skill, contaminating the later condition; counterbalancing (rotating order per user) mitigates but doesn't remove this; analysis needs paired tests and more careful modeling; and it subtly changes the game experience (players notice hints "changing style"), raising salience risk (§5).

**Decision: Option A (between-subject, stable per-player), with a within-subject escape hatch for the assisted-vs-unassisted axis only.**

Justification:

1. **Salience.** The whole point of the hint treatment is comparing *different assistance types*. If a player rotates between them within a session, the variation itself becomes visible and the experiment stops being covert. With stable assignment, a player never sees a second style and never notices.
2. **Cell-filling math works out.** The assisted-vs-unassisted comparison (the primary hypothesis: do hints help at all, per variant?) does NOT need between-variant pairing — it's computed per variant cell against that same cell's `hint_shown = 0` rows, which exist naturally (budget exhaustion, players who never ask). That gives us a within-cell contrast without rotating conditions.
3. **Between-variant comparisons (complement vs. decompose) are secondary** and can tolerate slower accumulation; they're the follow-up question, not the headline.
4. **It matches Mora**, keeping the research lineage comparable.

Concretely: assignment is `f(stable_seed, category)` — fixed for life per player per category. The natural no-hint control comes from the existing budget mechanics, not from a forced "control variant."

### 2.3 Where assignment runs: client-side, at draw time

Per CONTEXT.md, `createRandomOperation` (`apps/frontend/src/level.ts`) runs entirely client-side per Trial — no round-trip per Trial. Assignment happens in the same place, synchronously, before the Operation is constructed:

```ts
// apps/frontend/src/level.ts
export function createRandomOperation(level: Level, seed: string): Operation {
  const categories = getKeys(level);
  const probabilities = getValues(level);
  const randomCategory = math.pickRandomWeighted(categories, probabilities);
  const category = categoryFromCodename(randomCategory)!;
  const variantId = assignVariant(seed, category); // null when single-variant
  return createOperation(randomCategory, variantId ?? undefined);
}
```

The seed is resolved once per session by a small helper in `apps/frontend/src/auth/store.ts` (which already owns the session/device-id lifecycle) and passed down: `LevelPlay` receives it as a prop alongside the fetched level mix; Practice and Focus policies thread it through their `pickNext` the same way (`apps/frontend/src/practice/index.ts`).

Why not server-side? The draw already is client-side; moving just the variant decision server-side would require either (a) a per-Trial round trip (violates the no-round-trip rule) or (b) pushing the whole variant schedule down with the level mix (couples level content to experiment config and breaks offline play, where the catalog snapshot is the source of truth). Client-side assignment with a pure, deterministic function keeps offline play working: an offline run assigns variants exactly as an online one would, and the ids ride the outbox like everything else.

**Integrity note:** the client reports `hint_variant` in the push payload, and (like `timeTaken` and `playedAt`) it is client-reported. The server stores it verbatim and never re-derives it — consistent with how the server already treats timing. A malicious client could lie about its variant, but that's the same trust posture as lying about `timeTaken`, and the analysis side can sanity-check plausibility (variant id ∈ registry for that category, NULL iff `hint_shown = 0` for pre-feature rows). We do not add server-side recomputation because the server doesn't know the client's seed (by design — the seed derives from the device id/email, and the server only holds the hash).

---

## 3. Schema & sync changes

### 3.1 New column: `trial_results.hint_variant TEXT NULL`

- `NULL` for: pre-feature rows (everything written before the migration), and… see §3.3 for the no-hint-trials question.
- Value: the variant id string (`'add-decompose'`, `'add-complement'`, …) whenever the draw was assigned a variant, **regardless of whether the player actually viewed the hint**. Rationale: the experimental condition is the *assignment*, not the *view*. A player assigned `add-complement` who never taps the hint button is still in the complement condition — they were offered that assistance type. Conflating condition with usage would destroy the between-variant comparison (non-use rates differ between variants by definition). Usage remains captured by the existing `hint_shown` boolean; the two columns together give condition × usage.

### 3.2 Migration approach (`apps/backend/src/db.ts`)

The file already has exactly the mechanism needed: `COLUMN_MIGRATIONS` — an idempotent list checked via `PRAGMA table_info` in `applyColumnMigrations`, added to as columns become necessary (the `keystrokes` entry from #68 is the template). Add:

```ts
const COLUMN_MIGRATIONS: readonly ColumnMigration[] = [
  { /* keystrokes entry, unchanged */ },
  {
    // #XX — hint A/B experiment: the variant id assigned at draw time.
    // NULL = pre-feature row, or a category with no registered variants.
    // Evidence, like keystrokes: stored verbatim, never re-derived.
    table: "trial_results",
    column: "hint_variant",
    ddl: "ALTER TABLE trial_results ADD COLUMN hint_variant TEXT",
  },
];
```

No backfill: there is no equivalent recorded before the feature (unlike a rename), so `DEFAULT`-via-absence is the honest answer — old rows stay `NULL`. Also add `hint_variant` to the base `SCHEMA_STATEMENTS` DDL for fresh databases (both paths must agree; `CREATE TABLE IF NOT EXISTS` won't touch existing DBs, which is exactly why the migration entry exists too).

Index: none. `hint_variant` is a low-cardinality label used by analysis (which reads the whole table via `data.load_trial_results`), never by a per-user query. Adding an index would slow the batch insert for zero read benefit.

### 3.3 Engine wire shapes (`packages/engine/src/logic.ts`)

`TrialResultFields` gains:

```ts
hintVariant: z
  .string()
  .min(1)
  .max(32)
  .optional(), // optional so outbox rows written before the feature still validate and flush
```

Mirroring the `keystrokes` precedent exactly ("Optional so outbox rows written before #68 still validate and flush"). Because `SyncedTrialFields` spreads `TrialResultFields`, the pull-side `SyncedTrialSchema` picks it up automatically — and `mergeServerTrials` in `apps/frontend/src/local/trials.ts` validates pulled rows against `SyncedTrialSchema`, so a stale server (pre-migration deploy) returning rows without the field still parses.

`toTrialResultInput` serializes it the same way keystrokes are serialized — only when present:

```ts
...(r.hintVariantId ? { hintVariant: r.hintVariantId } : {}),
```

which requires `RecordedTrialResult` (= `TrialResult & {id, playedAt}`) to carry the id. The id travels from the Operation: `Trial.scoreAnswer`/`scoreTimeout` receive `base: Omit<BaseTrialResult, "timeTaken">`, and `BaseTrialResult` gains `hintVariantId?: HintVariantId | null` — populated by the caller (`trialSessionActions.submitAnswer`/`timeUp` in `apps/frontend/src/trialSession/index.ts`) from `state.currentOperation.hintVariantId()`.

Validation refinement (push side only, in `TrialResultSchema`'s `.refine` chain): when `hintVariant` is present, it must be a registered id for the row's category — `isRegisteredVariant(categoryCodename, hintVariant)`. This catches typos and stale-client drift cheaply. The pull side deliberately does NOT enforce registry membership (same reasoning as `SyncedTrialSchema` relaxing `categoryCodename`: historical rows may reference variants retired from the registry).

### 3.4 Backend storage & pulls (`apps/backend/src/sync/repo.ts`, `routes/sync.ts`)

- `insertTrialResults` and `syncTrials`: add `hint_variant` to the INSERT column list and bind `t.hintVariant ?? null`.
- `PULL_COLUMNS`: **include `hint_variant`** (decision and argument below).
- `rowToSyncedTrial` in `routes/sync.ts`: `hintVariant: r.hint_variant ?? undefined` (undefined, not null, so the wire shape matches the optional Zod field and JSON omits it for legacy rows).
- `TrialResultRow` type: add `hint_variant: string | null`.

**Does `hint_variant` follow the keystrokes push-only pattern? No — it is returned on pulls. Argument:**

Keystrokes are push-only because they are (a) bulky per-row traces, (b) sensitive behavioral detail, and (c) redundant: the device that recorded a row already has its own copy in the outbox, and no other consumer needs the trace on a different device. `hint_variant` fails all three:

1. **It's not redundant.** Unlike keystrokes, the variant id is *needed by other devices*: the Stats screen and any future per-device insight ("your average solve time on complement-addition trials") compute over the merged read model, and the personal data export (`apps/frontend/src/stats/exportTrials.ts`) should include the column so a player's exported CSV is complete. A device that synced a row before the feature existed, or a brand-new device pulling history, would otherwise have `hint_shown` without knowing *which* assistance type was offered.
2. **It's tiny and non-sensitive** — a short enum-like string, no behavioral trace.
3. **It's a first-class analytical dimension, not raw evidence.** The keystrokes rule is about *evidence* (stored so the server can analyze it; never echoed back). The variant id is closer to `category_codename` or `run_type` — structural metadata describing the trial's condition, which every pull already returns.

So: `hint_variant` joins `PULL_COLUMNS`, appears in `GET /sync/trials` and the `POST /sync` pull response, and flows into the local read model via the existing `mergeServerTrials` validation. One consequence to note: the outbox row (written at scoring time) and the pulled row will now agree on the field, making the idempotent re-merge trivially consistent.

### 3.5 Frontend local store & export

- `apps/frontend/src/local/trials.ts`: `trialCells` gains the `hint_variant` cell (TinyBase store table column) — same treatment as `hint_shown`.
- `apps/frontend/src/stats/exportTrials.ts`: add `"hint_variant"` to `COLUMNS` and `t.hintVariant ?? ""` to `rowOf` (empty cell for legacy rows, matching the CSV convention for missing values).

---

## 4. Analysis side (`packages/analysis`)

### 4.1 Data loading (`src/moravec_analysis/data.py`)

`load_trial_results` does `SELECT * FROM trial_results`, so the new column arrives automatically. Add coercion next to the existing ones:

```python
df["hint_variant"] = df["hint_variant"].where(df["hint_variant"].notna(), None)  # stays object/None
```

(`SELECT *` means no schema-list edit needed here — unlike `data.py`'s sibling loaders, this one is column-agnostic.)

### 4.2 Features (`src/moravec_analysis/features.py`)

New derivation, appended to `add_all_derived_fields`:

```python
def add_hint_variant_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Condition labels for the hint A/B experiment.

    variant        : the assigned variant id, or None (pre-feature rows,
                     single-variant categories, or unassigned draws).
    assisted       : hint_shown AND variant is not None — a hint was actually
                     viewed under a known condition.
    condition      : 3-level factor for the primary contrast:
                     "no_hint" (hint_shown False), "hint_<variant>" otherwise.
                     Pre-feature hinted rows (hint_shown True, variant None)
                     get "hint_legacy" — kept distinct so old data can't
                     contaminate a variant cell.
    """
    df = df.copy()
    df["variant"] = df["hint_variant"]
    df["assisted"] = df["hint_shown"] & df["variant"].notna()
    df["condition"] = np.where(
        ~df["hint_shown"], "no_hint",
        np.where(df["variant"].notna(), "hint_" + df["variant"], "hint_legacy"))
    return df
```

Existing features compose with it: `filter_rt_outliers` already supports any `group_col`, so RT outlier filtering runs per `(category_codename, condition)` group instead of per category alone in the new notebook.

### 4.3 New notebook: `notebooks/06_hint_variants.ipynb`

Structure (mirrors the existing notebooks' conventions — `USE_SYNTHETIC` flag, `add_all_derived_fields`, `filter_rt_outliers`):

1. **Coverage check.** Rows per `(category_codename, variant)`; flag cells below the minimum (see §4.4). Report how many distinct `email_hash` users contribute ≥ N rows per cell — the unit of randomization is the user, so cell size is measured in users, not rows.
2. **Primary contrast: assisted vs. unassisted, per variant cell.** For each `(category, variant)` with enough rows: median/mean RT and correctness for `condition == "hint_<variant>"` vs. `condition == "no_hint"`, restricted to `erased_digit == False` (the paper's exclusion criterion, already derived by `add_keystroke_fields`). Paired structure is NOT available here (a given trial is either hinted or not), so these are independent-group contrasts within a cell; report effect sizes (Cohen's d for RT, risk ratio for correctness), not just p-values.
3. **Secondary contrast: variant vs. variant.** For each category with ≥2 variants: compare `hint_<v1>` vs. `hint_<v2>` on RT and correctness, and also the assisted-vs-unassisted delta *per variant* (does complement help more than decompose?). Mixed-effects model (`statsmodels` MixedLM, user as random intercept) for RT; chi-square/Fisher for correctness.
4. **Interaction checks.** Does the variant effect differ by `run_type` (level vs. practice vs. practice_focus)? Focus rows are excluded from category-mix conclusions (per CONTEXT.md's adaptive-mix note) but ARE valid for hint-condition analysis since the hint mechanics are identical — they're included, flagged.
5. **Plots.** Forest plot of per-variant assisted-vs-unassisted RT deltas with CIs; grouped bar chart of correctness by condition per category.

### 4.4 Statistical notes (stated in the notebook header)

- **Within-subject pairing:** the primary contrast is between *trials* of the same user (hinted vs. unhinted draws in the same cell), not between users — but it is NOT a formal paired design (different trials, different operands). Treat it as a mixed model with user random intercept, not a paired t-test. True pairing (same operands, hinted/unhinted) is impossible by construction — one Trial, one outcome.
- **Minimum cells:** report, don't auto-drop — but apply a hard floor before inference: ≥ 30 users AND ≥ 100 rows per cell, else mark the cell "underpowered" and show descriptive statistics only. With between-subject assignment (§2.2), early cells will sit below this floor for a while; the notebook says so explicitly rather than publishing noisy estimates.
- **Multiple comparisons:** with 3 categories × 2 variants, the secondary section runs ~6 variant-pair + 6 assisted/unassisted contrasts. Apply Holm-Bonferroni within each family (RT family, correctness family) and say which threshold was used. Do not pool families.
- **Legacy contamination:** `hint_legacy` rows (pre-feature, `hint_shown = 1`) are excluded from variant cells but retained in the overall "do hints help at all" baseline, clearly labeled.
- **Outliers:** `filter_rt_outliers(group_col="condition")` per cell, sd=4 as in the paper's rule; timeouts (`time_exceeded = 1`) are kept in RT analysis (they're real durations at the cap) but reported separately, since capping truncates the upper tail.

### 4.5 Synthetic data (`src/moravec_analysis/synth.py`)

Extend `generate_synthetic_trials` (or its successor) with a `hint_experiment=True` flag: assign each synthetic user a stable per-category variant (hash of the fake email hash, mirroring the real assignment), set `hint_variant` accordingly on ~40% of eligible rows (simulating hint-request rate), and bake in a small true effect (e.g. −120 ms RT and +4 pp correctness for `add-complement` vs. `no_hint`, zero difference between variants) so the notebook's pipeline is exercisable end-to-end before real data accumulates. This doubles as the smoke test (§7.3).

---

## 5. Player-facing behavior

**The player does not know which variant they got.** Recommendations, all enforced by construction:

1. **Same `HintCard` UI, different step content.** `HintCard.tsx` renders `steps: string[]` with no variant awareness — no labels, no badges, no styling differences. The step strings themselves are the only difference, and they look like the same kind of decomposition a player already sees.
2. **No copy reveals the experiment.** The hint button, the card, and the Reviewing phase (`TrialReview.tsx` shows the `hintShown` badge) all stay word-for-word identical. No "tip style," no settings toggle, no stats-screen breakdown by variant (that's the power-user exposure open question, §9.2).
3. **Why salience matters here specifically:** RT is the dependent variable. Any cue that "this hint is different" changes the player's engagement with the hint (reading it more carefully, or dismissing it as a novelty), which is exactly the confound the experiment exists to avoid. Covert assignment is a measurement requirement, not a UX preference.
4. **Hint budget rules unchanged.** 3 per Level (`HINTS_PER_LEVEL`), unlimited in Practice and Focus. The variant assignment is orthogonal to the budget: a player assigned `add-complement` who exhausts their budget simply gets no hint, recorded as `hint_shown = 0` with the variant id still present.
5. **Step-length parity.** Variants within a category produce the same number of steps (2–3 lines), so the card's height and reading time are comparable across conditions. `add-complement` and `add-decompose` both emit 3 lines; both squaring variants emit 2. (If a future variant would emit a different line count, that's a review flag — visible length differences are a salience leak.)

---

## 6. File-by-file change list

Monorepo constraint reminder: `packages/engine` is consumed as source in dev by both apps (Turbopack `transpilePackages` + `"development"` export condition); production builds bundle via tsup. All new engine files use extensionless relative imports; every new public symbol is re-exported from `packages/engine/src/index.ts` so both apps import from the package name, never deep paths.

### `packages/engine`

| File | Change |
|---|---|
| `src/operations/hints/variants.ts` **(new)** | `HintVariantId`, `HintVariant` interface, `variantsFor(category)`, `assignVariant(seed, category)`, `isRegisteredVariant(codename, id)`, internal `fnv1a`. |
| `src/operations/hints/MakeToTenAdditionHint.ts` **(new)** | Class per §1.2. |
| `src/operations/hints/RoundCorrectionMultiplicationHint.ts` **(new)** | Class per §1.2. |
| `src/operations/hints/ExpansionSquaringHint.ts` **(new)** | Class per §1.2. |
| `src/operations/hints/AdditionHint.ts` | Unchanged logic; doc comment notes it is now the `add-decompose` variant. (Rename optional — keep the filename for git-blame continuity.) |
| `src/operations/hints/MultiplicationHint.ts` | Same treatment (`mult-decompose`). |
| `src/operations/hints/SquaringHint.ts` | Same treatment (`sq-diff`). |
| `src/operations/operation.ts` | `Operation` gains `hintVariantId(): HintVariantId \| null { return null; }`. Subclasses unchanged. |
| `src/operations/index.ts` | `createOperation(codename, variantId?)` overload per §1.3; `attachVariant` helper; `reconstructOperation` unchanged. |
| `src/trial/engine.ts` | `BaseTrialResult` gains `hintVariantId?: HintVariantId \| null`. `Trial.evaluate/build/scoreAnswer/scoreTimeout` pass it through untouched (scoring ignores it). |
| `src/logic.ts` | `TrialResultFields.hintVariant` (optional Zod string); `toTrialResultInput` serialization; push-side registry refine; `EvaluatedTrialResult` inherits via spread. |
| `src/index.ts` | Export `HintVariantId`, `HintVariant`, `variantsFor`, `assignVariant`, `isRegisteredVariant`, and the three new hint classes (parity with the existing exports). |
| `src/operations/hints/hints.test.ts` | Extended per §7.1. |
| `src/operations/index.test.ts` | `createOperation` variant wiring tests. |
| `src/logic.test.ts` | Schema accept/reject cases for `hintVariant`. |

### `apps/backend`

| File | Change |
|---|---|
| `src/db.ts` | `hint_variant` in `SCHEMA_STATEMENTS` DDL + `COLUMN_MIGRATIONS` entry (§3.2). |
| `src/sync/repo.ts` | INSERT column lists (both `insertTrialResults` and `syncTrials`), `PULL_COLUMNS` += `hint_variant`, `TrialResultRow.hint_variant: string \| null`. |
| `src/routes/sync.ts` | `rowToSyncedTrial` maps `hintVariant`. |
| `src/routes/sync.test.ts` | Push/pull round-trip cases per §7.2. |
| `src/sync/repo.test.ts` | Migration-on-existing-db case (open a DB without the column, `openDb`, assert column exists and old rows are NULL). |

### `apps/frontend`

| File | Change |
|---|---|
| `src/auth/store.ts` | Expose `experimentSeed(): string` — resolves email-cookie vs. device-id per §2.1. |
| `src/level.ts` | `createRandomOperation(level, seed)` threads `assignVariant` into `createOperation`. |
| `src/game/index.ts` | Policy `pickNext` passes the seed (from a new store field set at `start(config)`); `HINTS_PER_LEVEL` untouched. |
| `src/practice/index.ts` | Same seed threading for classic and Focus `pickNext`. |
| `src/components/LevelPlay.tsx` / `PracticePlay.tsx` / Focus play component | Receive `seed` prop (from the auth store) and forward to the policy-driven session start. |
| `src/trialSession/index.ts` | `submitAnswer`/`timeUp` populate `hintVariantId: state.currentOperation.hintVariantId()` in the scored base. |
| `src/local/trials.ts` | Outbox/read-model cell for `hint_variant`; `trialCells` updated. |
| `src/stats/exportTrials.ts` | CSV/JSON column per §3.5. |
| `src/components/HintCard.tsx` | **Unchanged** (deliberately — §5). |
| `src/components/AnsweringPanel.tsx` | **Unchanged** — it calls `operation.hint()`, which now internally resolves the variant. |
| Test fixtures | Every test constructing a `TrialResult`/`SyncedTrial` literal (the ~20 files grep found) compiles unchanged because the field is optional; spot-update a few to cover the populated case. |

### `packages/analysis`

| File | Change |
|---|---|
| `src/moravec_analysis/data.py` | Coerce `hint_variant` (no SQL change — `SELECT *`). |
| `src/moravec_analysis/features.py` | `add_hint_variant_fields` + append to `add_all_derived_fields`. |
| `src/moravec_analysis/synth.py` | `hint_experiment` flag per §4.5. |
| `notebooks/06_hint_variants.ipynb` **(new)** | Per §4.3. |

---

## 7. Testing plan

### 7.1 Engine unit tests (Vitest, `packages/engine`)

**Variant selection determinism** (`variants.test.ts`):
- `assignVariant(seed, category)` is pure: same inputs → same id, across repeated calls.
- Stability: `assignVariant("user-a", additionCat) === assignVariant("user-a", additionCat)` for a corpus of seeds; and differs (statistically) across seeds — assert that 1000 distinct seeds produce ≥ 2 distinct buckets for a 2-variant category (guards against a degenerate hash).
- Registry order sensitivity: appending a variant changes assignments for some seeds but the function remains deterministic.
- Single-variant categories return `null` (no experiment, no id recorded).
- `isRegisteredVariant` accepts registered ids, rejects unknowns and cross-category ids.

**Step correctness — the no-answer invariant, written explicitly** (`hints.test.ts`):

```ts
// INVARIANT: no hint step, for any variant, may contain the operation's
// final numeric answer. Hints stop short — the player performs the last
// arithmetic step. Violations here are a research-integrity bug, not a
// cosmetic one.
describe("no variant reveals the final answer", () => {
  it.each(allVariantCases())(  // every variant × a sweep of operands
    "%s on %s", (variant, operands) => {
      const hint = variant.build(operands);
      if (!hint.hasHint()) return;
      const answer = String(correctAnswer(operands));
      for (const step of hint.getSteps()) {
        expect(step).not.toContain(answer);
      }
    });
});
```

The operand sweep is exhaustive for small ranges (all 2-digit combinations relevant to each category's `createRandomOperand` restrictions) plus property-style random sampling for larger ones. Plus per-variant algebraic correctness: each step's expression, evaluated, equals the previous step's value (parse the step strings with a tiny evaluator in the test, or assert exact expected strings as the existing `hints.test.ts` does for `47 + 35`).

**Scoring passthrough** (`trial/engine.test.ts`): `hintVariantId` on `BaseTrialResult` survives `Trial.build`/`scoreAnswer`/`scoreTimeout` and does not affect `correct`/`timeExceeded`.

**Schema** (`logic.test.ts`): push schema accepts a row with `hintVariant` for a matching category, rejects an unregistered id, accepts absence (legacy outbox rows); `toTrialResultInput` omits the field when the id is null.

### 7.2 Backend sync tests (`apps/backend`)

- **Push stores the field:** POST `/sync` with a trial carrying `hintVariant: "add-complement"` → row in `trial_results` has `hint_variant = 'add-complement'`; with the field absent → `NULL`.
- **Pull returns it:** a subsequent pull (fresh cursor) includes `hintVariant` in the response row; `rowToSyncedTrial` maps `NULL` → field omitted.
- **Idempotency unchanged:** re-pushing the same id doesn't duplicate the `sync_log` entry (existing behavior, regression-checked with the new column present).
- **Migration:** open a database created by the pre-feature schema (fixture), call `openDb`, assert `PRAGMA table_info(trial_results)` contains `hint_variant`, old rows read as `NULL`, and a fresh push populates it.
- **Zod boundary:** oversized/garbage `hintVariant` values (33 chars, wrong category) are rejected at parse, failing the request rather than storing junk.

### 7.3 Analysis smoke test

A script (or a `uv run pytest`-style test wrapping it) that:
1. Generates synthetic trials with `hint_experiment=True` and the baked-in effect (§4.5).
2. Runs `load` → `add_all_derived_fields` → the notebook's core cells as functions (factor the notebook's analysis into `src/moravec_analysis/hint_analysis.py` so the notebook is thin and the logic is testable — matching how `features.py` already factors the derivations).
3. Asserts: the baked-in effect is recovered (sign of the RT delta for `add-complement` vs. `no_hint` is negative; the null variant-vs-variant difference is not significant at the chosen alpha), `condition` labels partition rows correctly, and underpowered cells are flagged rather than inferred on.

This runs in CI with the seeded RNG, so a broken feature pipeline is caught before real data exists.

---

## 8. Phased effort estimate

**Phase 1 — Storage + one extra variant for one category (smallest end-to-end experiment).**
Scope: the full vertical slice for addition only — `variants.ts` (registry + `assignVariant` + FNV), `MakeToTenAdditionHint`, `add-decompose`/`add-complement` registration, `hintVariantId` plumbing through `Operation`/`TrialResult`/Zod, `hint_variant` column + migration + repo/route changes, frontend seed + draw-time assignment + outbox cell, engine/backend tests per §7.1–7.2. Multiplication and squaring keep their single hardcoded hints (their `variantsFor` arrays hold one entry, so `assignVariant` returns null and nothing changes for them).

| Task | Days |
|---|---|
| Engine: variants module, new hint class, `Operation`/`TrialResult` plumbing, exports | 1.5 |
| Engine: tests incl. the no-answer invariant sweep | 1 |
| Backend: migration, repo, route, tests | 1 |
| Frontend: seed resolution, draw threading (Level + Practice + Focus), outbox, export | 1.5 |
| Integration pass: dev-loop hot-reload check both apps, offline-play check, manual sync round-trip on the Pi | 1 |
| **Phase 1 total** | **~6 days** |

**Phase 2 — Full variant matrix + analysis.**
Scope: `RoundCorrectionMultiplicationHint`, `ExpansionSquaringHint`, remaining registrations, `hint_analysis.py` + `06_hint_variants.ipynb`, `synth.py` extension, smoke test, statistical write-up in the notebook header.

| Task | Days |
|---|---|
| Two new hint classes + registrations + invariant tests extended | 1.5 |
| Analysis: features, factored analysis module, notebook, synth extension | 2.5 |
| Smoke test + CI wiring | 1 |
| Buffer for underpowered-cell reality (first real-data pass will likely need notebook iteration) | 1 |
| **Phase 2 total** | **~6 days** |

**Total: ~12 working days**, with Phase 1 shippable independently — the addition experiment starts collecting real condition-labeled data the day Phase 1 deploys, so the clock on cell-filling starts immediately.

---

## 9. Open questions for the maintainer

1. **Consent/framing.** The original Moravec collected research data from a public game without per-participant consent beyond the app's terms; Mora's hint treatments were presumably in the same posture. Do we keep that posture (variant assignment mentioned only in the privacy/terms page, if at all), or does the experiment warrant a one-time dismissible notice ("Moravec is a research instrument; hint styles vary to study their effect")? A notice is the cleaner ethics answer but is a salience risk (§5) — if shown, it must appear at first launch, not near the hint card.
2. **Power-user exposure.** Should the variant eventually surface in the Stats screen or the personal data export UI (the CSV gets the column regardless, §3.5)? Leaning no for the experiment's lifetime — visibility changes behavior — and yes afterward, as a curiosity stat. Needs a decision on when "afterward" is.
3. **Focus mode interaction.** Focus's adaptive weighting biases *category* distribution toward weak categories; the variant assignment is per-category and orthogonal, so there's no direct conflict. But Focus concentrates a player's trials in fewer categories, which accelerates cell-filling for those categories and starves others. Acceptable? Or should Focus exclude itself from the experiment (`hint_variant` still recorded, but flagged in analysis — the notebook already flags `practice_focus` rows)?
4. **Registry growth and re-bucketing.** Appending a third variant re-buckets everyone (the hash includes the count, §2.1). Is that acceptable mid-experiment, or do we freeze the registry until the first analysis is published and treat additions as a new experiment generation (with a `variant_generation` tag)? Freezing costs flexibility; tagging costs a column. Leaning freeze-and-tag-if-we-ever-add.
5. **Hint-request rate as a covariate.** Players differ in how often they tap the hint button; that rate may itself be affected by variant (a confusing variant might get tapped more). The condition × usage design handles this analytically, but should we record *when* the hint was requested (ms into the Trial) as a second evidence column? Cheap to add now (the `requestHint` action timestamp is available in `trialSession`), expensive to retrofit. Leaning yes, as `hint_requested_at_ms INTEGER NULL` — but it's scope creep for Phase 1; flagging for decision.
6. **Which category first?** Phase 1 picks addition on the assumption it's the highest-traffic category with a genuinely useful second strategy. If the level mixes say otherwise (check `levels` table weights before starting), multiplication `2dx1d` is the fallback — its round-correction variant is equally well-defined.
