# Runtime for the generated Python modules. Hand written, not generated.
# Primitive checks shared by every validate_<Name> function.
from __future__ import annotations

import dataclasses
import re
from datetime import datetime
from typing import Any, Callable


class ValidationError(ValueError):
    """Raised when a decoded JSON value does not match its schema. path points at the field."""

    def __init__(self, path: str, message: str) -> None:
        super().__init__(f"{path}: {message}")
        self.path = path
        self.message = message


Validator = Callable[[object, str], Any]

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URI = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def check_any(value: object, path: str) -> Any:
    return value


def check_null(value: object, path: str) -> None:
    if value is not None:
        raise ValidationError(path, "expected null")
    return None


def check_bool(value: object, path: str) -> bool:
    if not isinstance(value, bool):
        raise ValidationError(path, "expected boolean")
    return value


def check_int(value: object, path: str, minimum: int | None, maximum: int | None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        else:
            raise ValidationError(path, "expected integer")
    if minimum is not None and value < minimum:
        raise ValidationError(path, f"expected >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValidationError(path, f"expected <= {maximum}")
    return value


def check_float(value: object, path: str, minimum: float | None, maximum: float | None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(path, "expected number")
    if minimum is not None and value < minimum:
        raise ValidationError(path, f"expected >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValidationError(path, f"expected <= {maximum}")
    return value


def check_str(value: object, path: str, min_length: int, pattern: str | None, fmt: str | None) -> str:
    if not isinstance(value, str):
        raise ValidationError(path, "expected string")
    if len(value) < min_length:
        raise ValidationError(path, f"expected at least {min_length} characters")
    if pattern is not None and re.search(pattern, value) is None:
        raise ValidationError(path, f"does not match {pattern}")
    if fmt == "date-time":
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as e:
            raise ValidationError(path, "expected ISO 8601 date-time") from e
    elif fmt == "email" and _EMAIL.match(value) is None:
        raise ValidationError(path, "expected email")
    elif fmt == "uri" and _URI.match(value) is None:
        raise ValidationError(path, "expected uri")
    return value


def check_literal(value: object, path: str, allowed: tuple[Any, ...]) -> Any:
    for a in allowed:
        if type(a) is type(value) and a == value:
            return value
    raise ValidationError(path, f"expected one of {list(allowed)}")


def check_list(value: object, path: str, item: Validator, min_items: int | None, max_items: int | None) -> list[Any]:
    if not isinstance(value, list):
        raise ValidationError(path, "expected array")
    if min_items is not None and len(value) < min_items:
        raise ValidationError(path, f"expected at least {min_items} items")
    if max_items is not None and len(value) > max_items:
        raise ValidationError(path, f"expected at most {max_items} items")
    return [item(v, f"{path}[{i}]") for i, v in enumerate(value)]


def check_dict(value: object, path: str, item: Validator) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValidationError(path, "expected object")
    return {k: item(v, f"{path}.{k}") for k, v in value.items()}


def check_object(value: object, path: str, required: tuple[str, ...], allowed: tuple[str, ...] | None) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValidationError(path, "expected object")
    for key in required:
        if key not in value:
            raise ValidationError(f"{path}.{key}", "required")
    if allowed is not None:
        extra = [k for k in value if k not in allowed]
        if extra:
            raise ValidationError(f"{path}.{extra[0]}", "unknown property")
    return value


def check_any_of(value: object, path: str, validators: list[Validator]) -> Any:
    errors: list[str] = []
    for v in validators:
        try:
            return v(value, path)
        except ValidationError as e:
            errors.append(str(e))
    raise ValidationError(path, "no branch matched: " + "; ".join(errors))


def check_discriminated(value: object, path: str, key: str, branches: dict[Any, Validator]) -> Any:
    if not isinstance(value, dict):
        raise ValidationError(path, "expected object")
    tag = value.get(key)
    branch = branches.get(tag)
    if branch is None:
        raise ValidationError(f"{path}.{key}", f"expected one of {list(branches)}")
    return branch(value, path)


def to_dict(value: Any) -> Any:
    """Dataclass to plain JSON value. Optional fields set to None are left out."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        out: dict[str, Any] = {}
        for f in dataclasses.fields(value):
            v = getattr(value, f.name)
            if f.metadata.get("optional") and v is None:
                continue
            out[f.metadata.get("json_key", f.name)] = to_dict(v)
        return out
    if isinstance(value, list):
        return [to_dict(v) for v in value]
    if isinstance(value, dict):
        return {k: to_dict(v) for k, v in value.items()}
    return value
