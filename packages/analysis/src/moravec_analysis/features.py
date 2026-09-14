"""Derived columns the paper's effects are defined in terms of.

None of these live in `trial_results` — `data.load_trial_results` returns the
raw row shape, and every column here is computed from it.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

# category_codename is one of "1d+1d", "2dx1d", "3dx1d", "(2d)^2" -- the
# first of +, x, ^ it contains says the operation.
_CATEGORY_RE = re.compile(r"[+x^]")

_OP_SYMBOL_TO_NAME = {"+": "addition", "x": "multiplication", "^": "squaring"}

# The paper's four rhyme pairs (Section 6): spoken max-operand-first, the
# result rhymes with the operation in Spanish (6x4 -> "seis por cuatro,
# veinticuatro"; 7x5, 9x5, 6x8 the same).
RHYME_ORDERED_PAIRS = [(6, 4), (7, 5), (9, 5), (6, 8)]

# The same four pairs, presented in the order that does NOT rhyme -- the
# within-pair control for the phonological hypothesis.
RHYME_CONTROL_ORDERED_PAIRS = [(op2, op1) for op1, op2 in RHYME_ORDERED_PAIRS]


def add_operation_fields(df: pd.DataFrame) -> pd.DataFrame:
    """op1, op2, operation name, and is_tie, from `operands` + `category_codename`."""
    df = df.copy()
    df["op1"] = df["operands"].apply(lambda ops: ops[0])
    df["op2"] = df["operands"].apply(lambda ops: ops[1] if len(ops) > 1 else ops[0])
    match = df["category_codename"].apply(lambda c: _CATEGORY_RE.search(c))
    df["operation"] = match.apply(lambda m: _OP_SYMBOL_TO_NAME[m.group()])
    df["is_tie"] = df["op1"] == df["op2"]
    return df


def add_arithmetic_regressors(df: pd.DataFrame) -> pd.DataFrame:
    """The paper's Table 2 candidate RT regressors, plus has_five."""
    df = df.copy()
    df["product"] = df["op1"] * df["op2"]
    df["sum"] = df["op1"] + df["op2"]
    df["sum_sq"] = df["sum"] ** 2
    df["log_product"] = np.log(df["product"].clip(lower=1))
    df["log_sum"] = np.log(df["sum"].clip(lower=1))
    df["log_sum_sq"] = np.log(df["sum_sq"].clip(lower=1))
    df["sqrt_product"] = np.sqrt(df["product"])
    df["sqrt_sum"] = np.sqrt(df["sum"])
    df["min_operand"] = df[["op1", "op2"]].min(axis=1)
    df["has_five"] = (df["op1"] == 5) | (df["op2"] == 5)
    return df


def add_order_fields(df: pd.DataFrame) -> pd.DataFrame:
    """unordered_pair (for grouping {4,7}==={7,4}) and op1_gt_op2 (presentation order)."""
    df = df.copy()
    df["unordered_pair"] = df.apply(lambda r: tuple(sorted((r["op1"], r["op2"]))), axis=1)
    df["op1_gt_op2"] = df["op1"] > df["op2"]
    return df


def add_rhyme_fields(df: pd.DataFrame) -> pd.DataFrame:
    """is_rhyme_pair and presented_in_rhyme_order. Requires add_order_fields first."""
    df = df.copy()
    rhyme_unordered = {frozenset(p) for p in RHYME_ORDERED_PAIRS}
    df["is_rhyme_pair"] = df["unordered_pair"].apply(lambda p: frozenset(p) in rhyme_unordered)
    df["presented_in_rhyme_order"] = df.apply(
        lambda r: (r["op1"], r["op2"]) in RHYME_ORDERED_PAIRS, axis=1
    )
    return df


def classify_multiplication_error(op1: int, op2: int, answer: int) -> dict[str, bool]:
    """Table-neighbor vs numeric-neighbor classification for one wrong multiplication answer.

    table_distance_1: the answer is the product you'd get by shifting one
    operand by exactly 1 (e.g. 48 for 6x7, which is 6x8) -- the paper's
    headline error-clustering finding.
    numeric_distance_le_2: the answer is within 2 of the correct product,
    numerically, regardless of the table.
    """
    correct = op1 * op2
    table_neighbors = {
        (op1 - 1) * op2,
        (op1 + 1) * op2,
        op1 * (op2 - 1),
        op1 * (op2 + 1),
    }
    table_neighbors.discard(correct)
    return {
        "table_distance_1": answer in table_neighbors,
        "numeric_distance_le_2": answer != correct and abs(answer - correct) <= 2,
    }


def add_error_classification(df: pd.DataFrame) -> pd.DataFrame:
    """table_distance_1 / numeric_distance_le_2 for multiplication rows; False elsewhere."""
    df = df.copy()
    df["table_distance_1"] = False
    df["numeric_distance_le_2"] = False
    is_mult = df["operation"] == "multiplication"
    if is_mult.any():
        classified = df.loc[is_mult].apply(
            lambda r: classify_multiplication_error(r["op1"], r["op2"], r["answer"]),
            axis=1,
            result_type="expand",
        )
        df.loc[is_mult, ["table_distance_1", "numeric_distance_le_2"]] = classified
    return df


def add_all_derived_fields(df: pd.DataFrame) -> pd.DataFrame:
    """The full derived-column pipeline every notebook runs raw trial rows through."""
    df = add_operation_fields(df)
    df = add_arithmetic_regressors(df)
    df = add_order_fields(df)
    df = add_rhyme_fields(df)
    df = add_error_classification(df)
    return df


def filter_rt_outliers(df: pd.DataFrame, group_col: str = "category_codename", sd: float = 4.0) -> pd.DataFrame:
    """Drop rows whose time_taken is more than `sd` standard deviations from its group's mean.

    The paper's RT outlier rule -- the only one this dataset can support
    (see ../DATA_GAPS.md for the exclusion it can't reproduce).
    """
    grouped = df.groupby(group_col)["time_taken"]
    z = (df["time_taken"] - grouped.transform("mean")) / grouped.transform("std")
    return df[z.abs() <= sd]
