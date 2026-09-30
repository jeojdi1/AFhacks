"""Compare engine output with data/fixtures while new additive fields wait for a rebuild.

Right-sized work (docs/api.md §9) adds fields to ``GET /shops`` and ``GET /shops/{id}``.
``scripts/build_fixtures.py`` already writes them, but data/fixtures is only regenerated
at integration (``make fixtures``). Until then ``pending(actual, expected)`` drops from
``actual`` just the listed additive keys that the fixture does not have yet, recursively,
so every other field is still compared exactly. Once the fixtures are rebuilt the fixture
has the keys, nothing is dropped, and the comparison is fully strict again.
"""

from __future__ import annotations

from typing import Any

ADDITIVE_KEYS = frozenset({
    # Shop (work preferences)
    "min_annual_value_cad", "prefers_ongoing", "preferences_basis",
    # Offer (size)
    "annual_value_cad", "duration_years", "duration_flag", "ongoing", "meets_minimum",
    # ShopDetailResponse
    "work_packages",
})


def pending(actual: Any, expected: Any) -> Any:
    """``actual`` without the additive keys ``expected`` lacks (key order kept)."""
    if isinstance(actual, dict) and isinstance(expected, dict):
        return {
            k: pending(v, expected.get(k))
            for k, v in actual.items()
            if k in expected or k not in ADDITIVE_KEYS
        }
    if isinstance(actual, list) and isinstance(expected, list) and len(actual) == len(expected):
        return [pending(a, e) for a, e in zip(actual, expected, strict=True)]
    return actual
