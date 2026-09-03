"""Loading Moravec backend data into pandas DataFrames.

Reads directly from the backend's SQLite file (`apps/backend/data/moravec.sqlite`).
No ORM, no copy step: `trial_results` is small enough (millions of rows, a
handful of columns) to load wholesale and work with in memory via pandas.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd

DEFAULT_DB_PATH = (
    Path(__file__).resolve().parents[4] / "apps" / "backend" / "data" / "moravec.sqlite"
)


def _connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"No sqlite db at {path}. Pass db_path explicitly, or point it at "
            "a copy of apps/backend/data/moravec.sqlite."
        )
    return sqlite3.connect(path)


def load_trial_results(db_path: str | Path | None = None) -> pd.DataFrame:
    """Raw `trial_results` rows, one per Trial, with `operands` parsed from JSON.

    Columns match the DB schema (see apps/backend/src/db.ts) plus:
      - operands: list[int] (parsed from the stored JSON array, order preserved)
    """
    with _connect(db_path) as conn:
        df = pd.read_sql_query("SELECT * FROM trial_results", conn)

    df["operands"] = df["operands"].map(json.loads)
    df["correct"] = df["correct"].astype(bool)
    df["time_exceeded"] = df["time_exceeded"].astype(bool)
    df["hint_shown"] = df["hint_shown"].astype(bool)
    df["played_at"] = pd.to_datetime(df["played_at"], unit="ms")
    return df


def load_users(db_path: str | Path | None = None) -> pd.DataFrame:
    with _connect(db_path) as conn:
        df = pd.read_sql_query("SELECT * FROM users", conn)
    df["is_anonymous"] = df["is_anonymous"].astype(bool)
    df["created_at"] = pd.to_datetime(df["created_at"], unit="ms")
    return df


def load_levels(db_path: str | Path | None = None) -> pd.DataFrame:
    with _connect(db_path) as conn:
        df = pd.read_sql_query("SELECT * FROM levels", conn)
    df["mix"] = df["mix"].map(json.loads)
    return df
