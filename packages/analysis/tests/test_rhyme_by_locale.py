import pandas as pd

from moravec_analysis.features import (
    EXPECTED_RHYME_EFFECT,
    add_all_derived_fields,
    rhyme_order_effect_by_locale,
)
from moravec_analysis.synth import generate_synthetic_trials


def _trial(operands, time_taken, locale):
    return {
        "email_hash": "u",
        "category_codename": "1dx1d",
        "operands": operands,
        "answer": operands[0] * operands[1],
        "correct": True,
        "time_taken": time_taken,
        "locale": locale,
    }


def test_null_locale_reads_as_unknown():
    raw = pd.DataFrame([_trial([6, 4], 900, "es"), _trial([6, 4], 900, None)])
    assert add_all_derived_fields(raw)["locale"].tolist() == ["es", "unknown"]


def test_rows_from_before_the_column_read_as_unknown():
    raw = pd.DataFrame([_trial([6, 4], 900, "es")]).drop(columns="locale")
    assert add_all_derived_fields(raw)["locale"].tolist() == ["unknown"]


def test_splits_the_rhymed_order_effect_by_locale():
    raw = pd.DataFrame(
        [
            _trial([6, 4], 800, "es"),
            _trial([4, 6], 1000, "es"),
            _trial([7, 5], 900, "en"),
            _trial([5, 7], 900, "en"),
            _trial([9, 5], 700, None),
            _trial([5, 9], 750, None),
            _trial([3, 2], 100, "es"),
        ]
    )

    effect = rhyme_order_effect_by_locale(add_all_derived_fields(raw))

    assert effect.loc["es", "effect_ms"] == -200
    assert effect.loc["en", "effect_ms"] == 0
    assert effect.loc["unknown", "effect_ms"] == -50
    assert effect.loc["es", "n_rhymed"] == 1
    assert effect.loc["es", "expected"] == EXPECTED_RHYME_EFFECT["es"]
    assert pd.isna(effect.loc["unknown", "expected"])


def test_synthetic_data_bakes_the_effect_into_spanish_only():
    raw = generate_synthetic_trials(n_users=200, trials_per_user=150, seed=7)
    mult = add_all_derived_fields(raw)
    mult = mult[(mult["category_codename"] == "1dx1d") & mult["correct"]]

    effect = rhyme_order_effect_by_locale(mult)["effect_ms"]

    assert effect["es"] < -100
    assert abs(effect["en"]) < 100
