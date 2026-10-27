"""Unreal judges its own assets (v8 step 22): after an import, the editor's validators run on what
the import made, Epic's and the studio's own, and the result carries what they said, in their
words. Nkata adds no rules of its own here: these are the rules the game build enforces.

EditorValidatorSubsystem.is_object_valid runs every registered validator on one object and hands
back the errors and warnings without writing to the Message Log (measured on UE 5.8:
(DataValidationResult, validation_errors, validation_warnings)).
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/EditorValidatorSubsystem
https://dev.epicgames.com/documentation/en-us/unreal-engine/data-validation-in-unreal-engine
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

try:
    import unreal
except ImportError:  # pragma: no cover - only inside the editor
    unreal = None


def findings_of(asset: str, errors: Iterable[Any], warnings: Iterable[Any]) -> list[dict[str, str]]:
    """One finding per message, errors first, blank messages dropped. Pure, so it runs without
    the editor."""
    out: list[dict[str, str]] = []
    for level, texts in (("error", errors), ("warning", warnings)):
        for text in texts or []:
            message = str(text).strip()
            if message:
                out.append({"asset": asset, "level": level, "message": message})
    return out


def unique_paths(paths: Iterable[str]) -> list[str]:
    """Object paths in first seen order, each once, with the ".Name" object suffix kept."""
    seen: list[str] = []
    for p in paths:
        p = str(p)
        if p and p not in seen:
            seen.append(p)
    return seen


def run(paths: Iterable[str]) -> list[dict[str, str]]:
    """Every registered validator on every asset the import made. An asset that will not load is
    skipped: the import already said whether it worked."""
    subsystem = unreal.get_editor_subsystem(unreal.EditorValidatorSubsystem)
    usecase = getattr(unreal.DataValidationUsecase, "SCRIPT", unreal.DataValidationUsecase.MANUAL)
    out: list[dict[str, str]] = []
    for path in unique_paths(paths):
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if asset is None:
            continue
        _result, errors, warnings = subsystem.is_object_valid(asset, usecase)
        out.extend(findings_of(asset.get_name(), errors, warnings))
    return out
