"""Loads `trial_results` / `users` / `levels` straight from the backend's own SQLite file.

Schema mirrors `apps/backend/src/db.ts` exactly -- there is no separate
analysis database, this reads the live app's file directly (read-only).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd

# packages/analysis/src/moravec_analysis/data.py -> repo root is 4 parents up.
DEFAULT_DB_PATH = Path(__file__).resolve().parents[4] / "apps" / "backend" / "data" / "moravec.sqlite"


def _connect(db_path: Path | str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)


def load_trial_results(db_path: Path | str = DEFAULT_DB_PATH) -> pd.DataFrame:
    """Every trial_results row, with `operands` parsed to a list and `played_at` to a datetime."""
    with _connect(db_path) as con:
        df = pd.read_sql_query("SELECT * FROM trial_results ORDER BY played_at", con)
    df["operands"] = df["operands"].apply(json.loads)
    df["correct"] = df["correct"].astype(bool)
    df["time_exceeded"] = df["time_exceeded"].astype(bool)
    df["hint_shown"] = df["hint_shown"].astype(bool)
    df["played_at"] = pd.to_datetime(df["played_at"], unit="ms")
    return df


def load_users(db_path: Path | str = DEFAULT_DB_PATH) -> pd.DataFrame:
    with _connect(db_path) as con:
        df = pd.read_sql_query("SELECT * FROM users", con)
    df["is_anonymous"] = df["is_anonymous"].astype(bool)
    df["created_at"] = pd.to_datetime(df["created_at"], unit="ms")
    return df


def load_levels(db_path: Path | str = DEFAULT_DB_PATH) -> pd.DataFrame:
    with _connect(db_path) as con:
        df = pd.read_sql_query("SELECT * FROM levels", con)
    df["mix"] = df["mix"].apply(json.loads)
    return df
