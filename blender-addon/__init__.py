"""Nkata Blender extension. Blender 4.2+ extension format:
https://docs.blender.org/manual/en/latest/advanced/extensions/getting_started.html
"""

from __future__ import annotations

from .nkata import panel, save_hook


def register() -> None:
    panel.register()
    save_hook.register()


def unregister() -> None:
    save_hook.unregister()
    panel.unregister()
