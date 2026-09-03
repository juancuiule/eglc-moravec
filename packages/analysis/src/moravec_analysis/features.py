"""Derived columns for reproducing the Moravec paper's analyses.

`trial_results` only stores raw facts (operands, answer, correct, timing).
Everything the paper's effects are defined in terms of — product, tie,
five-effect, presentation order, rhyme, table-neighbor errors — is computed
here from those raw facts, not stored in the DB.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

_CATEGORY_RE = re.compile(r"^(\d+)d\+(\d+)d$|^(\d+)dx(\d+)d$|^\((\d+)d\)\^2$")

# The four one-digit multiplications whose Spanish spoken result rhymes with
# the operation *in this operand order* (Section 6 of the paper / Fig 9).
RHYME_ORDERED_PAIRS = [(7, 5), (9, 5), (6, 4), (6, 8)]

# Phonological controls used in the paper: same "last digit of result equals
# second operand" property, but no rhyme, to separate the two hypotheses.
RHYME_CONTROL_ORDERED_PAIRS = [(3, 5), (6, 2)]


def add_operation_fields(df: pd.DataFrame) -> pd.DataFrame:
    """category_type, l_digits/r_digits, and op1/op2 (order preserved)."""
    df = df.copy()

    def parse_category(codename: str) -> tuple[str, int, int]:
        m = _CATEGORY_RE.match(codename)
        if not m:
            raise ValueError(f"Unrecognized category codename: {codename}")
        add_l, add_r, mul_l, mul_r, sq_d = m.groups()
        if add_l is not None:
            return "addition", int(add_l), int(add_r)
        if mul_l is not None:
            return "multiplication", int(mul_l), int(mul_r)
        return "squaring", int(sq_d), int(sq_d)

    parsed = df["category_codename"].map(parse_category)
    df["category_type"] = parsed.map(lambda t: t[0])
    df["l_digits"] = parsed.map(lambda t: t[1])
    df["r_digits"] = parsed.map(lambda t: t[2])

    df["op1"] = df["operands"].map(lambda ops: ops[0])
    df["op2"] = df["operands"].map(lambda ops: ops[1] if len(ops) > 1 else ops[0])
    return df


def add_arithmetic_regressors(df: pd.DataFrame) -> pd.DataFrame:
    """The eight regressors compared in Table 2, plus tie/five flags.

    Requires add_operation_fields to have run first (needs op1/op2).
    """
    df = df.copy()
    op1, op2 = df["op1"], df["op2"]

    df["product"] = op1 * op2
    df["sum"] = op1 + op2
    df["sum_sq"] = df["sum"] ** 2
    df["log_product"] = np.log(df["product"].clip(lower=1))
    df["log_sum"] = np.log(df["sum"].clip(lower=1))
    df["log_sum_sq"] = np.log(df["sum_sq"].clip(lower=1))
    df["sqrt_product"] = np.sqrt(df["product"])
    df["sqrt_sum"] = np.sqrt(df["sum"])
    df["min_operand"] = np.minimum(op1, op2)
    df["max_operand"] = np.maximum(op1, op2)

    df["is_tie"] = op1 == op2
    df["has_five"] = (op1 == 5) | (op2 == 5)
    return df


def add_order_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Presentation-order fields for the order-effect analysis (Section 6)."""
    df = df.copy()
    df["op1_gt_op2"] = df["op1"] > df["op2"]
    df["unordered_pair"] = list(
        zip(np.minimum(df["op1"], df["op2"]), np.maximum(df["op1"], df["op2"]))
    )
    df["presented_pair"] = list(zip(df["op1"], df["op2"]))
    return df


def add_rhyme_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Flags the 4 rhyming problems and the 2 phonological controls.

    Only meaningful for 1dx1d multiplication trials; requires add_order_fields.
    """
    df = df.copy()
    df["is_rhyme_pair"] = df["unordered_pair"].isin(
        [tuple(sorted(p)) for p in RHYME_ORDERED_PAIRS]
    )
    df["presented_in_rhyme_order"] = df["presented_pair"].isin(RHYME_ORDERED_PAIRS)
    df["is_rhyme_control_pair"] = df["unordered_pair"].isin(
        [tuple(sorted(p)) for p in RHYME_CONTROL_ORDERED_PAIRS]
    )
    df["presented_in_control_order"] = df["presented_pair"].isin(
        RHYME_CONTROL_ORDERED_PAIRS
    )
    return df


def classify_multiplication_error(op1: int, op2: int, answer: int | None) -> dict:
    """Table-neighbor vs numeric-neighbor classification for one wrong answer.

    Table distance 1 = one of the four products sharing a row/column with
    (op1, op2) in the times table: (op1-1)*op2, (op1+1)*op2, op1*(op2-1),
    op1*(op2+1) (Fig 8b). Numeric distance is |answer - correct_result|.
    """
    if answer is None:
        return {"table_distance_1": False, "numeric_distance_le_2": False}
    correct = op1 * op2
    neighbors = {
        (op1 - 1) * op2,
        (op1 + 1) * op2,
        op1 * (op2 - 1),
        op1 * (op2 + 1),
    }
    return {
        "table_distance_1": answer in neighbors,
        "numeric_distance_le_2": 0 < abs(answer - correct) <= 2,
    }


def add_error_classification(df: pd.DataFrame) -> pd.DataFrame:
    """Adds table_distance_1 / numeric_distance_le_2 for wrong multiplication trials.

    Requires add_operation_fields to have run first. Only fills values for
    category_type == "multiplication" rows where correct is False; other rows
    get NaN.
    """
    df = df.copy()
    is_wrong_mult = (~df["correct"]) & (df["category_type"] == "multiplication")

    classified = df.loc[is_wrong_mult].apply(
        lambda r: classify_multiplication_error(r["op1"], r["op2"], r["answer"]),
        axis=1,
        result_type="expand",
    )
    df["table_distance_1"] = pd.array([pd.NA] * len(df), dtype="boolean")
    df["numeric_distance_le_2"] = pd.array([pd.NA] * len(df), dtype="boolean")
    if not classified.empty:
        df.loc[is_wrong_mult, "table_distance_1"] = classified["table_distance_1"]
        df.loc[is_wrong_mult, "numeric_distance_le_2"] = classified["numeric_distance_le_2"]
    return df


def add_all_derived_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Convenience: runs every add_* transform in the right order."""
    df = add_operation_fields(df)
    df = add_arithmetic_regressors(df)
    df = add_order_fields(df)
    df = add_rhyme_fields(df)
    df = add_error_classification(df)
    return df


def filter_rt_outliers(
    df: pd.DataFrame, group_col: str = "category_codename", sd: float = 4.0
) -> pd.DataFrame:
    """Drops rows whose time_taken is >`sd` standard deviations from the
    per-`group_col` mean — the paper's RT-analysis exclusion rule (Section
    5.1.1). Note: the paper *also* excludes trials where the participant
    erased a digit; that signal isn't collected here (see DATA_GAPS.md), so
    this filter alone is not a full replication of their exclusion criteria.
    """
    grouped = df.groupby(group_col)["time_taken"]
    mean, std = grouped.transform("mean"), grouped.transform("std")
    within = (df["time_taken"] - mean).abs() <= sd * std
    return df.loc[within].copy()
