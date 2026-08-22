# Moravec

A mental-math training game: the player solves timed arithmetic Trials, progressing through Levels, with an optional Practice mode and a backend that syncs progress across devices for logged-in Users.

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
The best recorded run for a Level: stars, total time, and when it was achieved. A new run overwrites it only if it scores more stars, or the same stars in less time.
_Avoid_: High score, record, best run.

**PersistedTrial**:
The flattened, storable form of a TrialResult — level number, Operation category, correctness, timing — written to trial history for stats aggregation across all played sessions.
_Avoid_: History entry, log entry.

**CurrentScreen**:
What's on screen right now, derived from the state of an in-progress Level, an in-progress Practice session, and local navigation. Exactly one of these is ever active at a time.
_Avoid_: View, route, page.

### Backend domain

**User**:
A player identified in the backend by a salted hash of their email address. No plaintext email is stored at rest.
_Avoid_: Account, player, customer.

**OTP login**:
The authentication flow: the player enters their email, receives a one-time numeric code by email, and submits it to establish a session. There is no password and no persistent plaintext email.
_Avoid_: Magic link, passwordless login, sign-in.

**Sync**:
Reconciling a logged-in User's local Level/Practice progress with the backend. Has two directions: a push of each Trial's result immediately after a Level (fire-and-forget, doesn't block play), and a pull of the User's remote LevelStats on OTP login, merged into local state using the same better-record comparison LevelStats already uses.
_Avoid_: Backup, save, upload.
