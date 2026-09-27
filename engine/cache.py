"""Per-revision memoization of the API's read-only views (performance layer).

A stored State is immutable per ``(db path, epoch, revision)`` (see engine/state.py:
every save is a new revision), so any pure view of it can be computed once and served
again until the next mutation. This module keeps, per ``(db path, program id)``:

- the parsed State of the current revision (a cached read skips SQLite JSON + parsing), and
- ``{view key: value}`` for that revision (the API stores rendered JSON bytes).

Each request first reads the stored key (two small columns). A different key (upload,
route, fund, reset, or a write from another process) drops the slot and starts over, so
a stale value is never served. The cached State is shared: callers must treat it as
read-only (the API's views do; mutations always load a fresh copy via load_state).
All calls happen under engine.state.STATE_LOCK in the API; the module lock only guards
direct use.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Any

from engine import state as st

MAX_SLOTS = 8  # distinct (db, program) pairs kept (tests open many temp databases)

_lock = threading.RLock()
_slots: OrderedDict[tuple[str, str], _Slot] = OrderedDict()
stats = {"hits": 0, "misses": 0, "uncached": 0}


class _Slot:
    __slots__ = ("key", "state", "views")

    def __init__(self, key: tuple, state: Any):
        self.key = key
        self.state = state
        self.views: dict[Hashable, Any] = {}


def clear() -> None:
    """Forget everything (tests / benchmarks)."""
    with _lock:
        _slots.clear()


def invalidate(program_id: str = st.DEFAULT_PROGRAM_ID) -> None:
    """Drop the slot for ``program_id`` in the current database (after a write)."""
    with _lock:
        _slots.pop((str(st.db_path()), program_id), None)


def _slot(program_id: str) -> _Slot | None:
    """The slot for the stored revision (loading it on a miss), or None if uncacheable."""
    slot_id = (str(st.db_path()), program_id)
    key = st.state_key(program_id)
    if key is None:
        return None
    slot = _slots.get(slot_id)
    if slot is not None and slot.key == key:
        _slots.move_to_end(slot_id)
        return slot
    state, loaded_key = st.load_state_keyed(program_id)
    if loaded_key is None:
        return None
    slot = _Slot(loaded_key, state)
    _slots[slot_id] = slot
    _slots.move_to_end(slot_id)
    while len(_slots) > MAX_SLOTS:
        _slots.popitem(last=False)
    return slot


def revision(program_id: str = st.DEFAULT_PROGRAM_ID) -> int | None:
    key = st.state_key(program_id)
    return None if key is None else key[2]


def view(program_id: str, key: Hashable, fn: Callable[[Any], Any]) -> Any:
    """``fn(state)`` memoized by (stored revision, ``key``). Exceptions are not cached.
    With nothing stored yet (fresh seed) it is computed every time."""
    with _lock:
        slot = _slot(program_id)
        if slot is None:
            stats["uncached"] += 1
            return fn(st.load_state(program_id))
        if key in slot.views:
            stats["hits"] += 1
            return slot.views[key]
        stats["misses"] += 1
        value = fn(slot.state)
        slot.views[key] = value
        return value
