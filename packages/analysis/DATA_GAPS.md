# Data gaps, relative to the Moravec paper and the Recalculando article

Both the [paper](https://doi.org/10.1371/journal.pone.0168431) and the
[Recalculando](https://elgatoylacaja.com/notas/investigacion/recalculando)
writeup analyze data from the _original_ Moravec Android app. This repo is a
rewrite (web app, Fastify + SQLite backend — see root `CONTEXT.md`). Its
current schema is enough to reproduce most of the arithmetic-cognition
effects, but not all of them, and one thing that blocks _everything_ right
now: there's no real data yet.

## 0. There is no trial data in the current database

`apps/backend/data/moravec.sqlite` has **0 rows in `trial_results`** as of
this writing (2 test users, 2 sessions, otherwise empty). The app only went
publicly reachable very recently (see `f1bb8f6` — Cloudflare Tunnel + nginx
routing, `2c49ebd` — OTP emails switched to the production domain). The
paper's numbers (513 users, 90k+ problems in the first two weeks; the
Recalculando update mentions ~12M operations since) took real diffusion —
this isn't a schema problem, it's a "give it time and traffic" problem. The
`packages/analysis` notebooks default to a synthetic dataset for now so the
pipeline itself is buildable and testable before that data exists.

## 1. No demographics at all (paper Section 4)

The paper's participant table (age, gender, education level, country) came
from an optional form on first app open. The current `users` table is:

```sql
users (email_hash TEXT PRIMARY KEY, created_at INTEGER, is_anonymous INTEGER)
```

`email_hash` is a salted hash specifically so no plaintext email — and by
extension no obvious linkable demographic — is stored (see `CONTEXT.md`'s
**User** entry). There's currently no field for age, gender, education, or
country anywhere in the backend. Any age/gender breakdown, or a
"demographics table" like the paper's Section 4, is not reproducible without
adding collection for it — which is itself a product decision (an extra
onboarding step) worth weighing against the friction it adds, not something
to bolt on silently in a data pipeline.

## 2. No digit-erase / edit signal (paper Section 5.1.1's RT exclusion rule)

The paper excludes from RT analysis "problems in which participants erased a
digit," on top of the 4-SD-outlier rule. `trial_results` stores only the
final submitted `answer` and a single `time_taken` duration — no keystroke
log, no edit/backspace count, no intermediate values. There's no way to tell,
after the fact, whether a stored trial involved a correction mid-entry. The
notebooks apply the 4-SD filter only; that's a real (if usually small)
divergence from the paper's exclusion criteria.

Worth flagging directly: `CONTEXT.md`'s **Sync** entry currently says push
"includes full per-keystroke timing, which is research signal in its own
right, not just an anti-cheat measure" — but nothing in
`TrialResultSchema`/`EvaluatedTrialResult` (`packages/engine/src/logic.ts`)
or the `trial_results` table actually carries that. Either the doc is ahead
of the implementation, or a keystroke-timing field was removed at some point
without updating it — worth checking with whoever wrote that line before
trusting it elsewhere.

## 3. `time_taken` is client-reported, not server-measured

Also called out in `CONTEXT.md`: the backend re-validates `correct` and
`time_exceeded` independently, but `timeTaken` itself is taken as given from
the client. This isn't literally _missing_ data, but every RT-based analysis
in this pipeline (which is most of them) inherits whatever noise or
manipulation-risk that implies — worth a caveat line wherever RT results get
shared externally, same as the paper would have had with any client-reported
timing.

## 4. What's _not_ missing (confirmed while building this)

Worth stating explicitly since these are the load-bearing fields for most
of the paper's results:

- **Operand order is preserved.** `operands` is stored as a JSON array in
  presentation order (`[left, right]`), not sorted — this is what makes the
  order-effect and rhyme-effect analyses (Section 6, the paper's headline new
  result) possible at all.
- **The actual wrong answer is stored**, not just a correct/incorrect flag —
  `answer` is nullable only for timeouts (no submission), which is what
  makes the table-neighbor vs. numeric-neighbor error classification (Fig 8)
  possible.
- **`played_at` has millisecond precision** and category codenames encode
  digit counts directly (`1d+1d`, `1dx1d`, etc.), so category/size-based
  grouping doesn't need any guesswork.

## 5. Not a gap, but a scope difference from the original app

The paper's Practice mode had three difficulty tiers (Inicial/Medio/Avanzado)
per operation, including a variant where operands are shown for 5 seconds
then hidden. This rewrite's Practice session (see `CONTEXT.md`) is simpler
by design — one operation category, no difficulty tiers, no hidden-operand
mode — so there's no data to be "missing" here; it's a deliberate scope cut,
not an oversight. Flagging only so it's not mistaken for a collection gap
later.
