"""Synthetic trial_results generator, for developing/testing notebooks
before real player data exists (the live DB has 0 rows as of this writing —
see DATA_GAPS.md).

Bakes in the effects the paper looks for (size, tie, five, rhyme-order,
table-neighbor errors) with plausible noise, so a notebook that fails to
recover them is a bug in the notebook, not a property of empty real data.
This is a fixture, not a claim about real player behavior — swap
`load_trial_results()` back in the moment real rows exist.
"""

from __future__ import annotations

import hashlib
import uuid
from itertools import product as iproduct

import numpy as np
import pandas as pd

from .features import RHYME_ORDERED_PAIRS


def _fake_email_hash(user_index: int) -> str:
    return hashlib.sha256(f"synthetic-user-{user_index}".encode()).hexdigest()


def _addition_rt_ms(op1: int, op2: int, rng: np.random.Generator) -> float:
    s = op1 + op2
    is_tie = op1 == op2
    intercept = 1868 if is_tie else 2060
    slope = 7.2 if is_tie else 23.7
    return intercept + slope * (op1 * op2) + rng.normal(0, 250)


def _multiplication_rt_ms(
    op1: int, op2: int, rng: np.random.Generator
) -> float:
    is_tie = op1 == op2
    intercept = 2139 if is_tie else 2406
    slope = 10.5 if is_tie else 35.0
    rt = intercept + slope * (op1 * op2) + rng.normal(0, 300)

    if op1 == 5 or op2 == 5:
        rt -= 319  # five-effect (paper: mean -319ms, SE 22ms)

    ordered = (op1, op2)
    if ordered in RHYME_ORDERED_PAIRS:
        rt -= 45  # rhyme order effect (paper: mean 45ms for the times table)
    elif tuple(reversed(ordered)) in RHYME_ORDERED_PAIRS:
        rt += 45

    return rt


def _multiplication_error_and_answer(
    op1: int, op2: int, rng: np.random.Generator
) -> tuple[bool, int]:
    correct = op1 * op2
    base_error_rate = 0.02 + 0.0021 * (op1 * op2)
    if op1 == 8 and op2 == 7 or op1 == 7 and op2 == 8:
        base_error_rate = max(base_error_rate, 0.128)  # paper: highest observed
    is_error = rng.random() < min(base_error_rate, 0.5)
    if not is_error:
        return False, correct

    # 70% of the time, err with a table-neighbor value (paper: ~43-50%
    # observed; skewed higher here so the synthetic signal is unmistakable).
    if rng.random() < 0.7:
        neighbors = [
            (op1 - 1) * op2,
            (op1 + 1) * op2,
            op1 * (op2 - 1),
            op1 * (op2 + 1),
        ]
        neighbors = [n for n in neighbors if n > 0 and n != correct]
        answer = rng.choice(neighbors) if neighbors else correct + rng.integers(-3, 4)
    else:
        answer = correct + rng.integers(-6, 7)
        if answer == correct:
            answer += 1
    return True, int(answer)


def generate_synthetic_trials(
    n_users: int = 200,
    trials_per_user: int = 150,
    seed: int = 42,
) -> pd.DataFrame:
    """Returns a DataFrame shaped like `data.load_trial_results()`'s output:
    same columns, operands already parsed into a list, timestamps as
    datetime64. Only populates 1d+1d and 1dx1d categories (all the paper's
    analyses use exactly those).
    """
    rng = np.random.default_rng(seed)
    digits_1_9 = np.arange(1, 10)
    all_add_pairs = list(iproduct(range(0, 10), range(0, 10)))
    all_mult_pairs = list(iproduct(digits_1_9, digits_1_9))

    rows = []
    base_ts = pd.Timestamp("2026-08-15").value // 1_000_000  # ms

    for user_index in range(n_users):
        email_hash = _fake_email_hash(user_index)
        n_trials = rng.poisson(trials_per_user) + 5
        for i in range(n_trials):
            is_mult = rng.random() < 0.55
            played_at = base_ts + int(rng.integers(0, 14 * 24 * 3600 * 1000))

            if is_mult:
                op1, op2 = all_mult_pairs[rng.integers(0, len(all_mult_pairs))]
                rt = max(300, _multiplication_rt_ms(op1, op2, rng))
                is_error, answer = _multiplication_error_and_answer(op1, op2, rng)
                correct = not is_error
                category = "1dx1d"
            else:
                op1, op2 = all_add_pairs[rng.integers(0, len(all_add_pairs))]
                rt = max(300, _addition_rt_ms(op1, op2, rng))
                error_rate = 0.012 + 0.00071 * (op1 * op2)
                is_error = rng.random() < min(error_rate, 0.3)
                answer = (op1 + op2) + (0 if not is_error else int(rng.integers(-4, 5)) or 1)
                correct = not is_error
                category = "1d+1d"

            time_exceeded = rt >= 10_000
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "email_hash": email_hash,
                    "level_number": int(rng.integers(1, 6)),
                    "category_codename": category,
                    "operands": [int(op1), int(op2)],
                    "answer": int(answer),
                    "correct": correct,
                    "time_exceeded": bool(time_exceeded),
                    "time_taken": float(rt),
                    "played_at": pd.to_datetime(played_at, unit="ms"),
                    "hint_shown": bool(rng.random() < 0.03),
                    "run_id": str(uuid.uuid4()),
                    "run_type": "level" if rng.random() < 0.85 else "practice",
                }
            )

    return pd.DataFrame(rows)
