"""ULIDs for spool file names. https://github.com/ulid/spec"""

from __future__ import annotations

import os
import time

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _encode(value: int, length: int) -> str:
    out = []
    for _ in range(length):
        out.append(_ALPHABET[value & 31])
        value >>= 5
    return "".join(reversed(out))


def new_id() -> str:
    return _encode(int(time.time() * 1000), 10) + _encode(int.from_bytes(os.urandom(10), "big"), 16)
