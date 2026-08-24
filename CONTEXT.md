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
The scored outcome of one Trial: whether the answer was correct, whether it exceeded the Operation's solve time, how long it took, whether a Hint was shown, and (within a Level) the correct-in-time streak at that point. Produced by scoring a submitted answer or a timeout.
_Avoid_: Answer, response, score.

**Answering / Reviewing**:
The two phases within one Trial. Answering is the timed phase, while the player is entering a value. Reviewing is the phase right after submission or timeout, showing correct/wrong feedback before the next Trial begins.
_Avoid_: Waiting, feedback (as a phase name — feedback is what's shown *during* Reviewing).

**Level**:
A named mix of Operation categories and their relative weights, identified by a level number, that a fixed-length Trial session draws from. A Level is *completed* when the player answers at least 15 of 20 Trials correctly within time.
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
The best-ever **Level run** for a Level: stars, total time, and when it was achieved. A new run overwrites it only if it scores more stars, or the same stars in less time — the Level run itself is never discarded even when it isn't the best one (see Level run).
_Avoid_: High score, record, best run.

**Level run**:
One playthrough of a Level from start to Finished, identified by a client-generated id threaded through every Trial in it. The backend keeps every run's outcome, not just the best — LevelStats only caches the best one, for the Levels page.
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
A low-friction User identity minted automatically the moment the app first loads, before a player ever gives an email — no OTP round-trip. Lets Sync work from a player's very first Level. Logging in with OTP *upgrades* it: the anonymous identity's Trial history and LevelStats are merged into the newly-verified email User, and the anonymous session is discarded.
_Avoid_: Guest account, temporary account.

**OTP login**:
The authentication flow: the player enters their email, receives a one-time numeric code by email, and submits it to establish a session. There is no password and no persistent plaintext email. If the player already had an Anonymous session, this upgrades it rather than starting fresh.
_Avoid_: Magic link, passwordless login, sign-in.

**Sync**:
Reconciling a User's local Level progress with the backend — active for any session, anonymous or logged in. Has two directions: a push of each Trial's result immediately after a Level (fire-and-forget, doesn't block play; the payload includes full per-keystroke timing, which is research signal in its own right, not just an anti-cheat measure), and a pull of the User's remote LevelStats on OTP login, merged into local state using the same better-record comparison LevelStats already uses. Practice sessions are never synced — local-only by design.
_Avoid_: Backup, save, upload.

### Research background

Moravec started as a research instrument, not a game — this shapes why certain design choices exist and is worth knowing before changing them. Federico Zimmerman (engineering student), Andrés Rieznik (neuroscientist, his thesis advisor), and El Gato y La Caja turned arithmetic-cognition research — normally volunteers doing timed mental math in a lab, one session a week — into a public Android game, on the bet that a genuinely fun game would collect more and better data than a lab ever could. It worked: ~500 downloads produced 120,000+ data points in weeks, replicating ~30 years of prior lab findings, and won silver at Neurocog 2015.

Two decisions from that original app are why Moravec looks the way it does, not incidentally:
- **The calculator-style answer input** exists so the player's attention stays on the arithmetic, not on learning the app's UI — the interface is deliberately supposed to disappear.
- **Stars, points, and level-complete celebrations** exist because the team found that a data-collection tool people are *compelled* to open beats one they're *obligated* to open — gamification was the mechanism for data scale, not decoration.

**Arithmetic cognition** findings the original research surfaced, useful context for any future work on level design, operation weighting, or a stats/insights screen:
- **Symmetry advantage**: operations with identical factors (6×6, 7×7) are answered faster than non-identical ones of similar magnitude.
- **Table-neighbor errors**: mistakes cluster around answers numerically close *in the multiplication table* (e.g. answering 48 for 6×7), not around the numerically nearest integer to the correct answer.
- **Rhymed-order effect**: in Spanish, operations whose spoken result rhymes with the operation (6×4=24, 7×5=35, 9×5=45, 6×8=48) are answered faster — a verbal-encoding effect, evidence multiplication facts are partly stored as memorized language rather than pure visual/spatial representation.
- 8×7 had the highest observed error rate of any operation (12.8%).

## Engineering context

Non-obvious architecture decisions and their reasoning, captured directly here rather than in a separate ADR log — each entry below started as an ADR and was folded in once its rationale settled from "an open decision" into "just how it works now." A genuinely open, not-yet-decided plan still earns its own ADR in `docs/adr/`; check there for anything not reflected below.

**Monorepo shape**: pnpm workspaces, three packages. `packages/engine` is the shared domain model (Operation, Trial scoring, Level completion) used independently by both `apps/frontend` (gameplay) and `apps/backend` (server-side re-validation of what a client reports, see below). `apps/frontend` is a Next.js App Router app; `apps/backend` is Fastify + SQLite.

**The backend independently re-validates trial correctness, not just trust**: `POST /sync/results` recomputes `correct`/`timeExceeded` for every incoming trial from its operands, answer, and reported `timeTaken`, using `engine`'s own scoring rules — the same ones the client uses. The server's own computed values are what `trial_results.correct`/`time_exceeded` actually store (the columns everything analytical, admin stats included, reads); the client's original claim is kept alongside in `client_correct`/`client_time_exceeded`, for auditing, never discarded. A disagreement between the two is not an error — the sync still succeeds, nothing is surfaced to the player, nothing overrides local `LevelStats` — this is a backend-internal integrity signal only. `timeTaken` itself is still client-reported, not independently measured by the server; that remains a separate, larger problem than re-scoring correctness from an already-known duration.

**Dev loop has no build step for `engine`**: both `pnpm dev:frontend` and `pnpm dev:backend` resolve `engine` straight from `packages/engine/src` — types included — via a `"development"` package.json export condition (`customConditions: ["development"]` in both apps' tsconfigs) plus Turbopack's `transpilePackages`. Editing engine source hot-reloads both apps immediately, no `pnpm --filter engine build` in the loop. This only works because `engine/src` uses extensionless relative imports (bundler-style, matching frontend); production `dist/` is built by tsup (esbuild), which bundles into a single flat file so Node's real ESM loader never sees an unresolved extension. Don't reintroduce `.js`-suffixed internal imports in `engine/src` — that was the exact thing blocking Turbopack before this was fixed.

**Auth is cookie-based, validated server-side before render**: a `moravec_session` cookie carries `{token, email}`, with `email: null` for an Anonymous session; `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`) revalidates it against the backend before `/` or `/login` render, and `/login` itself is a Server Component that redirects only when `email` is set — an anonymous session must still reach the login form, since that's how it upgrades. The cookie is deliberately not `httpOnly`: client code needs to read the token itself to attach `Authorization: Bearer` headers on calls the backend expects (Sync push, LevelStats pull) — making it `httpOnly` would block that and require proxying every such call through the frontend's own server to attach the header on the client's behalf instead. That's a real hardening option if XSS-resistance on the token becomes a priority later, not the default posture today.

**Level routes exist but level-unlock is intentionally still client-side**: `/level/[levelNumber]` reads local `LevelStats` to decide access, not a backend check. This was a deliberate choice, not an oversight — level-unlock was never a security boundary worth backend enforcement, and the existing trust model (`LevelStats` itself lives in `localStorage`) already accepts that a player can edit their own record if they want to; checking server-side wouldn't actually raise that bar. Anonymous accounts exist for cross-device *continuity*, not for gating — see the Anonymous session / Sync entries above.

**TanStack Query is scoped to component-rendered loading/error state, not every backend call**: `useQuery`/`useMutation` only where a component needs to show that request's pending/error state (e.g. `/login`'s OTP flow, the Levels list). Fire-and-forget calls (Level-finish Sync) and already-server-rendered ones (the admin fetch, the post-login LevelStats pull) call `Api` directly instead, bypassing React Query entirely.

**Level content lives in the backend, not a static frontend map**: each Level's weighted Operation-category mix is a `levels` table row, seeded once from a fixture on first boot and then the live source of truth — changing a Level no longer needs a frontend rebuild. `GET /levels` (the number list, for Home's grid) and `GET /levels/:levelNumber` (one Level's full mix) are both public, unauthenticated. `/level/[levelNumber]`'s Server Component fetches the one Level being played and threads it down as a prop; `LevelPlay` no longer imports a catalog itself. The per-Trial random draw (`createRandomOperation`) still runs entirely client-side from whatever mix was already fetched — no round-trip per Trial, only the lookup moved server-side.

**Tailwind v4 theme**: every color and the one non-default type size used anywhere in the frontend comes from `@theme` tokens in `apps/frontend/app/globals.css`, named by role (`panel`, `accent`, `danger`, …) not value. No component should reach for a raw hex.

**Jazz.tools was evaluated for local-first sync and rejected** — noted here so it isn't re-evaluated from scratch; if local-first sync work resumes, revisit that verdict rather than assuming it still holds, since neither the tool nor this app's sync needs are static.
