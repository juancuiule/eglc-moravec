# Moravec

A mental-math training game: the player solves timed arithmetic Trials, progressing through Levels, with an optional Practice mode and a backend that syncs progress across devices for every player, logged in or not.

## Language

### Game domain

**Operation**:
A single arithmetic problem (addition, multiplication, or squaring) that a Trial asks the player to solve. Owns its own solve-time threshold, its display form, and its Hint.
_Avoid_: Problem, question, equation.

**Operation category**:
A specific shape of Operation, identified by a codename (e.g. `1d+1d`, `2dx1d`, `(2d)^2`) describing operand digit counts and the operation type. Used to weight which Operations appear in a Level and to select a category for Practice.
_Avoid_: Operation type, difficulty.

**Trial**:
One Operation presented to the player, from the moment it's shown until the player's answer (or the timer running out) is scored. The basic unit of both a Level and a Practice session.
_Avoid_: Question, round, attempt.

**TrialResult**:
The scored outcome of one Trial: whether the answer was correct, whether it exceeded the Operation's solve time, how long it took, and whether a Hint was shown. Produced by scoring a submitted answer or a timeout.
_Avoid_: Answer, response, score.

**Answering / Reviewing**:
The two phases within one Trial. Answering is the timed phase, while the player is entering a value. Reviewing is the phase right after submission or timeout, showing correct/wrong feedback before the next Trial begins.
_Avoid_: Waiting, feedback (as a phase name — feedback is what's shown _during_ Reviewing).

**Level**:
A named mix of Operation categories and their relative weights, identified by a level number, that a fixed-length Trial session draws from. A Level is _completed_ when the player answers at least 15 of 20 Trials correctly.
_Avoid_: Stage, round, difficulty tier.

**GameConfig**:
The level number, its Level mix, and the total Trial count for one playthrough of that Level.
_Avoid_: Session config, settings.

**Practice session**:
An unscored, unlimited sequence of Trials drawn from a single Operation category, with no pass/fail threshold. Ends when the player stops it, producing an in-memory summary that is not persisted.
_Avoid_: Free play, drill.

**Hint**:
A step-by-step decomposition an Operation can offer for its current Trial, stopping short of revealing the final numeric answer. Budgeted (3 per Level) or unlimited (Practice session).
_Avoid_: Answer key, solution, walkthrough.

**LevelStats**:
The best-ever **Level run** summary for a Level: stars, total time, and when it was achieved. It is derived from Level Trial rows grouped by run id, then selected by more stars or, when stars tie, less time. Every run's Trial rows remain stored even when that run is not the best one (see Level run).
_Avoid_: High score, record, best run.

**Level run**:
One playthrough of a Level from start to Finished, identified by a client-generated id threaded through every Trial in it. The backend keeps every run's Trial rows, not a separate Level-run row; it derives LevelStats from those rows when requested.
_Avoid_: Attempt, playthrough — as standalone terms; say "Level run".

**PersistedTrial**:
The flattened, storable form of a TrialResult — level number, Operation category, correctness, timing — written to trial history for stats aggregation across all played sessions.
_Avoid_: History entry, log entry.

**CurrentScreen**:
What's on screen right now, derived from the state of an in-progress Level, an in-progress Practice session, and local navigation. Exactly one of these is ever active at a time.
_Avoid_: View, route, page.

### Backend domain

**User**:
A player identified in the backend by a salted hash — of their email address once they log in, or of a client-generated device id before that (see Anonymous session). No plaintext email is stored at rest.
_Avoid_: Account, player, customer.

**Anonymous session**:
A low-friction User identity minted automatically the moment the app first loads, before a player ever gives an email — no OTP round-trip. Lets Sync work from a player's very first Level. Logging in with OTP _upgrades_ it: the anonymous identity's Trial rows are reassigned to the newly verified email User, LevelStats is then derived across the combined history, and the anonymous session is discarded.
_Avoid_: Guest account, temporary account.

**OTP login**:
The authentication flow: the player enters their email, receives a one-time numeric code by email, and submits it to establish a session. There is no password and no persistent plaintext email. If the player already had an Anonymous session, this upgrades it rather than starting fresh.
_Avoid_: Magic link, passwordless login, sign-in.

**Sync**:
Reconciling a User's progress with the backend — active for any session, anonymous or logged in. A Level finish or Practice stop pushes the final answer and total timing for each Trial without blocking play; no per-keystroke or edit history is collected. LevelStats pulls read the User's remote best runs for the Levels page, Level access, and the post-finish record refresh. Level and Practice trials share one backend table (`trial_results`, discriminated by a `run_type` column) but stay isolated everywhere it matters: only Level Trial rows feed LevelStats or the Levels unlock view — a Practice Trial is only a raw synced Trial row.
_Avoid_: Backup, save, upload.

### Research background

Moravec started as a research instrument, not a game — this shapes why certain design choices exist and is worth knowing before changing them. Federico Zimmerman (engineering student), Andrés Rieznik (neuroscientist, his thesis advisor), and El Gato y La Caja turned arithmetic-cognition research — normally volunteers doing timed mental math in a lab, one session a week — into a public Android game, on the bet that a genuinely fun game would collect more and better data than a lab ever could. It worked: ~500 downloads produced 120,000+ data points in weeks, replicating ~30 years of prior lab findings, and won silver at Neurocog 2015.

Two decisions from that original app are why Moravec looks the way it does, not incidentally:

- **The calculator-style answer input** exists so the player's attention stays on the arithmetic, not on learning the app's UI — the interface is deliberately supposed to disappear.
- **Stars, points, and level-complete celebrations** exist because the team found that a data-collection tool people are _compelled_ to open beats one they're _obligated_ to open — gamification was the mechanism for data scale, not decoration.

**Arithmetic cognition** findings the original research surfaced, useful context for any future work on level design, operation weighting, or a stats/insights screen:

- **Symmetry advantage**: operations with identical factors (6×6, 7×7) are answered faster than non-identical ones of similar magnitude.
- **Table-neighbor errors**: mistakes cluster around answers numerically close _in the multiplication table_ (e.g. answering 48 for 6×7), not around the numerically nearest integer to the correct answer.
- **Rhymed-order effect**: in Spanish, operations whose spoken result rhymes with the operation (6×4=24, 7×5=35, 9×5=45, 6×8=48) are answered faster — a verbal-encoding effect, evidence multiplication facts are partly stored as memorized language rather than pure visual/spatial representation.
- 8×7 had the highest observed error rate of any operation (12.8%).

## Engineering context

Non-obvious architecture decisions and their reasoning, captured directly here rather than in a separate ADR log — each entry below started as an ADR and was folded in once its rationale settled from "an open decision" into "just how it works now." A genuinely open, not-yet-decided plan still earns its own ADR in `docs/adr/`; check there for anything not reflected below.

**Monorepo shape**: pnpm workspaces, four packages. `packages/engine` is the shared domain model (Operation, Trial scoring, Level completion) used independently by both `apps/frontend` (gameplay) and `apps/backend` (server-side re-validation of submitted Trial evidence, see below); `packages/analysis` analyzes exported Trial data. `apps/frontend` is a Next.js App Router app; `apps/backend` is Fastify + SQLite.

**The backend independently derives Trial correctness and timing status from submitted evidence**: the client does not send `correct` or `timeExceeded` claims. `POST /sync/results` validates each incoming Trial's identity, Level/Practice shape, supported Operation category and category-shaped operands, then recomputes `correct`/`timeExceeded` from its operands, final answer, and reported `timeTaken`, using `engine`'s own scoring rules — the same ones the client uses. `trial_results` stores that server-computed correctness and timing status alongside the submitted operands, final answer, total time, Hint flag, run metadata, and played-at time. `timeTaken` and `playedAt` are still client-reported, not independently measured by the server.

**"Correct" is the only success metric — timing is recorded, not a gate**: a Trial that's correct counts as correct whether it was submitted in time or the clock auto-submitted whatever was typed when it ran out. `timeExceeded` is descriptive metadata — still stored, still shown (e.g. in average solve time) — never a second condition alongside `correct` for stars, Level completion, or effectiveness stats on the player's Stats screen. This wasn't always true: an earlier version required "correct AND in-time" everywhere, and separately forced a correct-but-late answer to silently retry its Trial slot with a fresh Operation while the displayed Trial number stayed frozen. Both were removed together — every outcome (right, wrong, or timed out) now consumes exactly one of the Level's fixed Trial slots, so the player always sees exactly `totalTrials` Operations, never more.

**A timeout always reports `timeTaken` as exactly `Operation.solveTime()`, never more**: `scoreTimeout` doesn't measure real elapsed time — it reports the solve-time cap itself. This is why `engine`'s shared `Trial.evaluate` compares with `>=`, not `>`, when deriving `timeExceeded` from `timeTaken`. A strict `>` silently classifies every genuine timeout as _not_ exceeded — for both the client's own live scoring and the backend's independent re-validation — since the reported duration can never land a hair past the cap. Don't "simplify" this back to `>`; it looks redundant with the `timeExceeded: true` a timeout obviously deserves, but it's the one thing making the boundary case actually true.

**Dev loop has no build step for `engine`**: both `pnpm dev:frontend` and `pnpm dev:backend` resolve `engine` straight from `packages/engine/src` — types included — via a `"development"` package.json export condition (`customConditions: ["development"]` in both apps' tsconfigs) plus Turbopack's `transpilePackages`. Editing engine source hot-reloads both apps immediately, no `pnpm --filter engine build` in the loop. This only works because `engine/src` uses extensionless relative imports (bundler-style, matching frontend); production `dist/` is built by tsup (esbuild), which bundles into a single flat file so Node's real ESM loader never sees an unresolved extension. Don't reintroduce `.js`-suffixed internal imports in `engine/src` — that was the exact thing blocking Turbopack before this was fixed.

**Auth is cookie-based, validated server-side before render**: a `moravec_session` cookie carries `{token, email}`, with `email: null` for an Anonymous session; `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`) revalidates it against the backend before `/` or `/login` render, and `/login` itself is a Server Component that redirects only when `email` is set — an anonymous session must still reach the login form, since that's how it upgrades. The cookie is deliberately not `httpOnly`: client code needs to read the token itself to attach `Authorization: Bearer` headers on calls the backend expects (Sync push, LevelStats pull) — making it `httpOnly` would block that and require proxying every such call through the frontend's own server to attach the header on the client's behalf instead. That's a real hardening option if XSS-resistance on the token becomes a priority later, not the default posture today.

**Level access uses server-derived LevelStats but is not a security boundary**: `/level/[levelNumber]` fetches the session's LevelStats during server rendering and applies the same predecessor-completion rule used by the Levels page. This keeps navigation consistent across devices; it is progress gating, not authorization. Anonymous accounts exist for cross-device _continuity_, not as a security boundary — see the Anonymous session / Sync entries above.

**TanStack Query is scoped to component-rendered loading/error state, not every backend call**: `useQuery`/`useMutation` only where a component needs to show that request's pending/error state (e.g. `/login`'s OTP flow and the Stats screen). Fire-and-forget calls (Level-finish Sync) and server-rendered Level/LevelStats fetches call `Api` directly instead, bypassing React Query entirely.

**Level content lives in the backend, not a static frontend map**: each Level's weighted Operation-category mix is a `levels` table row, seeded once from a fixture on first boot and then the live source of truth — changing a Level no longer needs a frontend rebuild. `GET /levels` (the number list, for Home's grid) and `GET /levels/:levelNumber` (one Level's full mix) are both public, unauthenticated. `/level/[levelNumber]`'s Server Component fetches the one Level being played and threads it down as a prop; `LevelPlay` no longer imports a catalog itself. The per-Trial random draw (`createRandomOperation`) still runs entirely client-side from whatever mix was already fetched — no round-trip per Trial, only the lookup moved server-side.

**Tailwind v4 theme**: every color and the one non-default type size used anywhere in the frontend comes from `@theme` tokens in `apps/frontend/app/globals.css`, named by role (`panel`, `accent`, `danger`, …) not value. No component should reach for a raw hex.

**Jazz.tools was evaluated for local-first sync and rejected** — noted here so it isn't re-evaluated from scratch; if local-first sync work resumes, revisit that verdict rather than assuming it still holds, since neither the tool nor this app's sync needs are static.
