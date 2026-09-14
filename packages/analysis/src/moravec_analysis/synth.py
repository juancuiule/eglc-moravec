"""A synthetic trial_results generator with the paper's known effects baked in.

Returns the same raw shape as `data.load_trial_results()`, so every notebook
can flip `USE_SYNTHETIC` and change nothing else. Useful whenever real data
is too thin for a given analysis (see `02_regressor_comparison.ipynb`).
"""

from __future__ import annotations

import hashlib
import uuid
from itertools import product as iproduct

import numpy as np
import pandas as pd

from .features import RHYME_ORDERED_PAIRS

_ONE_DIGIT = list(range(1, 10))
_ONE_DIGIT_PAIRS = list(iproduct(_ONE_DIGIT, repeat=2))

# Roughly matches the category_codename split seen once the app had live
# trials (see notebooks/00_data_overview.ipynb).
_CATEGORY_WEIGHTS = {
    "1dx1d": 0.33,
    "2dx1d": 0.21,
    "2d+2d": 0.14,
    "1d+1d": 0.13,
    "3dx1d": 0.12,
    "(2d)^2": 0.07,
}


def _fake_email_hash(user_index: int) -> str:
    return hashlib.sha256(f"synthetic-user-{user_index}".encode()).hexdigest()


def _addition_rt_ms(op1: int, op2: int, rng: np.random.Generator) -> float:
    """Size effect (paper: ~23.7 ms/unit of sum) with a tie-effect discount."""
    is_tie = op1 == op2
    rt = 900 + 23.7 * (op1 + op2) - (150 if is_tie else 0)
    return max(300.0, rng.normal(rt, 180))


def _multiplication_rt_ms(op1: int, op2: int, rng: np.random.Generator) -> float:
    """Size effect (paper: ~35.0 ms/unit of product) plus tie, five, and rhyme discounts."""
    product = op1 * op2
    is_tie = op1 == op2
    has_five = op1 == 5 or op2 == 5
    rhymed = (op1, op2) in RHYME_ORDERED_PAIRS
    rt = (
        1100
        + 35.0 * product
        - (250 if is_tie else 0)
        - (400 if has_five else 0)
        - (200 if rhymed else 0)
    )
    return max(300.0, rng.normal(rt, 250))


def _multiplication_error_and_answer(
    op1: int, op2: int, rng: np.random.Generator
) -> tuple[bool, int]:
    """Whether the trial was answered correctly, and the submitted answer.

    Wrong answers lean table-neighbor (shifting one operand by 1), matching
    the paper's error-clustering finding -- see
    features.classify_multiplication_error.
    """
    correct = op1 * op2
    if rng.random() > 0.08:  # ~92% baseline accuracy
        return True, correct
    if rng.random() < 0.6:
        delta = int(rng.choice([-1, 1]))
        wrong = (op1 + delta) * op2 if rng.random() < 0.5 else op1 * (op2 + delta)
    else:
        wrong = correct + int(rng.choice([-2, -1, 1, 2]))
    return False, max(0, wrong)


def generate_synthetic_trials(n_users: int, trials_per_user: int, seed: int) -> pd.DataFrame:
    """A synthetic trial_results DataFrame, same raw shape as data.load_trial_results()."""
    rng = np.random.default_rng(seed)
    categories = list(_CATEGORY_WEIGHTS.keys())
    weights = list(_CATEGORY_WEIGHTS.values())

    rows = []
    for user_index in range(n_users):
        email_hash = _fake_email_hash(user_index)
        played_at = pd.Timestamp("2026-08-01") + pd.Timedelta(days=int(rng.integers(0, 30)))
        pair_cycle = rng.permutation(len(_ONE_DIGIT_PAIRS))

        for trial_index in range(trials_per_user):
            category = rng.choice(categories, p=weights)

            if category in ("1d+1d", "1dx1d"):
                op1, op2 = _ONE_DIGIT_PAIRS[pair_cycle[trial_index % len(pair_cycle)]]
            elif category == "2dx1d":
                op1, op2 = int(rng.integers(10, 100)), int(rng.integers(1, 10))
            elif category == "3dx1d":
                op1, op2 = int(rng.integers(100, 1000)), int(rng.integers(1, 10))
            elif category == "2d+2d":
                op1, op2 = int(rng.integers(10, 100)), int(rng.integers(10, 100))
            else:  # "(2d)^2"
                op1, op2 = int(rng.integers(10, 100)), None

            if category == "1dx1d":
                correct, answer = _multiplication_error_and_answer(op1, op2, rng)
                time_taken = _multiplication_rt_ms(op1, op2, rng)
            elif category == "1d+1d":
                correct = bool(rng.random() > 0.05)
                answer = (op1 + op2) if correct else (op1 + op2) + int(rng.choice([-2, -1, 1, 2]))
                time_taken = _addition_rt_ms(op1, op2, rng)
            else:
                target = (op1 * op2) if op2 is not None else op1 * op1
                correct = bool(rng.random() > 0.1)
                answer = target if correct else target + int(rng.choice([-5, -3, 3, 5]))
                time_taken = max(300.0, rng.normal(1500 + 2 * target**0.5, 400))

            played_at = played_at + pd.Timedelta(milliseconds=time_taken)
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "email_hash": email_hash,
                    "level_number": int(rng.integers(1, 16)),
                    "category_codename": category,
                    "operands": [op1] if op2 is None else [op1, op2],
                    "answer": int(answer),
                    "correct": correct,
                    "time_exceeded": False,
                    "time_taken": round(time_taken),
                    "played_at": played_at,
                    "hint_shown": False,
                    "run_id": str(uuid.uuid4()),
                    "run_type": "level",
                }
            )

    return pd.DataFrame(rows)
