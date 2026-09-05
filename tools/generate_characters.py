#!/usr/bin/env python3
"""@file generate_characters.py
@brief Generate deterministic editor metadata and compact native settings.

Platform : Python 3 repository tooling
Author   : Daniel Fridman (schermaiolo)

Input comes from the shared character manifest. Write/check modes
make generated TypeScript, Lua and VS Code configuration reproducible before
release.
"""

from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit(
        "Install Pillow first:\n"
        "  sudo pacman -S --needed python-pillow"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "shared" / "characters" / "characters.json"
TS_OUTPUT = ROOT / "editors/vscode/src/generated/characters.ts"
LUA_OUTPUT = (
    ROOT
    / "editors/pragtical/generated/characters.lua"
)
PACKAGE_JSON = ROOT / "editors/vscode/package.json"

CHARACTER_SETTING_PATTERN = re.compile(
    r"^touhouFumo\.characters\.[^.]+\."
    r"(enabled|size|motionMode|motionStrength|motionFrequency|"
    r"randomSpecial|specialFrequency|randomSpin|spinFrequency)$"
)


def merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)

    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        else:
            result[key] = deepcopy(value)

    return result


def object_value(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")

    return value


def string_value(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")

    return value


def positive_int(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")

    return value


def non_negative_int(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{label} must be a non-negative integer")

    return value


def bool_value(value: Any, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def source_path(value: Any, label: str) -> Path:
    relative = Path(string_value(value, label))

    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"{label} must stay inside the repository")

    path = (ROOT / relative).resolve()

    if not path.is_file():
        raise ValueError(f"missing file: {path}")

    return path


def safe_asset_path(value: Any, label: str) -> str:
    text = string_value(value, label)
    path = Path(text)

    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"{label} must be a safe relative path")

    return text


def animation(
    raw: Any,
    frame_count: int,
    label: str,
    *,
    optional: bool = False,
) -> dict[str, Any]:
    if raw is None and optional:
        return {
            "frames": [],
            "frameDurationMs": 120,
            "loops": 1,
            "holdLastFrameMs": 0,
        }

    value = object_value(raw, label)
    frames = value.get("frames")

    if not isinstance(frames, list) or (not frames and not optional):
        raise ValueError(f"{label}.frames must be a non-empty array")

    if frames is None:
        frames = []

    for frame in frames:
        if (
            not isinstance(frame, int)
            or isinstance(frame, bool)
            or not 0 <= frame < frame_count
        ):
            raise ValueError(
                f"{label}: invalid frame {frame!r}; "
                f"expected 0..{frame_count - 1}"
            )

    return {
        "frames": frames,
        "frameDurationMs": positive_int(
            value.get("frameDurationMs", 250),
            f"{label}.frameDurationMs",
        ),
        "loops": positive_int(
            value.get("loops", 1),
            f"{label}.loops",
        ),
        "holdLastFrameMs": non_negative_int(
            value.get("holdLastFrameMs", 0),
            f"{label}.holdLastFrameMs",
        ),
    }


# Normalize optional behavior data so both editor generators consume one schema.
def normalize_behavior(raw: dict[str, Any]) -> dict[str, Any]:
    motion = object_value(raw.get("motion", {}), "behavior.motion")
    random_special = object_value(
        raw.get("randomSpecial", {}),
        "behavior.randomSpecial",
    )
    random_spin = object_value(
        raw.get("randomSpin", {}),
        "behavior.randomSpin",
    )

    mode = motion.get("mode", "occasional-hop")

    if mode not in ("off", "occasional-bob", "occasional-hop"):
        mode = "occasional-hop"

    return {
        "motion": {
            "enabled": bool_value(motion.get("enabled"), mode != "off"),
            "mode": mode,
            "idleOnly": bool_value(motion.get("idleOnly"), True),
            "amplitudePx": positive_int(
                motion.get("amplitudePx", 3),
                "behavior.motion.amplitudePx",
            ),
            "durationMs": positive_int(
                motion.get("durationMs", 550),
                "behavior.motion.durationMs",
            ),
            "minIntervalMs": positive_int(
                motion.get("minIntervalMs", 25000),
                "behavior.motion.minIntervalMs",
            ),
            "maxIntervalMs": positive_int(
                motion.get("maxIntervalMs", 70000),
                "behavior.motion.maxIntervalMs",
            ),
        },
        "randomSpecial": {
            "enabled": bool_value(random_special.get("enabled"), True),
            "minimumIdleMs": non_negative_int(
                random_special.get("minimumIdleMs", 20000),
                "behavior.randomSpecial.minimumIdleMs",
            ),
            "minIntervalMs": positive_int(
                random_special.get("minIntervalMs", 60000),
                "behavior.randomSpecial.minIntervalMs",
            ),
            "maxIntervalMs": positive_int(
                random_special.get("maxIntervalMs", 180000),
                "behavior.randomSpecial.maxIntervalMs",
            ),
        },
        "randomSpin": {
            "enabled": bool_value(random_spin.get("enabled"), False),
            "minimumIdleMs": non_negative_int(
                random_spin.get("minimumIdleMs", 60000),
                "behavior.randomSpin.minimumIdleMs",
            ),
            "minIntervalMs": positive_int(
                random_spin.get("minIntervalMs", 180000),
                "behavior.randomSpin.minIntervalMs",
            ),
            "maxIntervalMs": positive_int(
                random_spin.get("maxIntervalMs", 420000),
                "behavior.randomSpin.maxIntervalMs",
            ),
        },
    }


# Merge manifest defaults with each character and validate all referenced frames.
def load_definitions() -> list[dict[str, Any]]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    if manifest.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1")

    defaults = object_value(manifest.get("defaults", {}), "defaults")
    characters = manifest.get("characters")

    if not isinstance(characters, list) or not characters:
        raise ValueError("characters must be a non-empty array")

    definitions: list[dict[str, Any]] = []
    seen: set[str] = set()

    for raw in characters:
        character = object_value(raw, "character")
        character_id = string_value(character.get("id"), "character.id")

        if character_id in seen:
            raise ValueError(f"duplicate character id: {character_id}")

        seen.add(character_id)

        assets = object_value(
            character.get("assets"),
            f"{character_id}.assets",
        )
        sheet = merge(
            object_value(
                defaults.get("spriteSheet", {}),
                "defaults.spriteSheet",
            ),
            object_value(
                character.get("spriteSheet", {}),
                f"{character_id}.spriteSheet",
            ),
        )

        if sheet.get("layout") != "grid":
            raise ValueError(
                f"{character_id}: only grid layout is supported"
            )

        columns = positive_int(
            sheet.get("columns"),
            f"{character_id}.spriteSheet.columns",
        )
        rows = positive_int(
            sheet.get("rows"),
            f"{character_id}.spriteSheet.rows",
        )

        if rows != 1:
            raise ValueError(
                f"{character_id}: editor runtimes currently require one row"
            )

        path = source_path(
            character.get("sourceSheet"),
            f"{character_id}.sourceSheet",
        )

        with Image.open(path) as image:
            width, height = image.size
            image.verify()

        if width % columns or height % rows:
            raise ValueError(
                f"{character_id}: {width}x{height} is not divisible "
                f"by {columns}x{rows}"
            )

        frame_width = width // columns
        frame_height = height // rows
        frame_count = columns * rows

        animations = merge(
            object_value(
                defaults.get("animations", {}),
                "defaults.animations",
            ),
            object_value(
                character.get("animations", {}),
                f"{character_id}.animations",
            ),
        )
        behavior = normalize_behavior(
            merge(
                object_value(
                    defaults.get("behavior", {}),
                    "defaults.behavior",
                ),
                object_value(
                    character.get("behavior", {}),
                    f"{character_id}.behavior",
                ),
            )
        )
        render = merge(
            object_value(
                defaults.get("render", {}),
                "defaults.render",
            ),
            object_value(
                character.get("render", {}),
                f"{character_id}.render",
            ),
        )
        default_height = render.get("defaultHeight", frame_height)

        # Backward compatibility: old manifests called blink/reaction frames
        # "react". New sheets should use "blink".
        blink_raw = animations.get("blink", animations.get("react"))

        definitions.append(
            {
                "id": character_id,
                "name": string_value(
                    character.get("displayName"),
                    f"{character_id}.displayName",
                ),
                "variant": string_value(
                    character.get("variant", "standard"),
                    f"{character_id}.variant",
                ),
                "enabledByDefault": bool(
                    character.get("enabledByDefault", True)
                ),
                "assetDirectory": safe_asset_path(
                    assets.get("directory"),
                    f"{character_id}.assets.directory",
                ),
                "spriteSheet": safe_asset_path(
                    assets.get("sheet"),
                    f"{character_id}.assets.sheet",
                ),
                "framesDirectory": safe_asset_path(
                    assets.get("framesDirectory", "frames"),
                    f"{character_id}.assets.framesDirectory",
                ),
                "frameWidth": frame_width,
                "frameHeight": frame_height,
                "frameCount": frame_count,
                "defaultDisplayHeight": positive_int(
                    default_height,
                    f"{character_id}.render.defaultHeight",
                ),
                "manualText": string_value(
                    character.get(
                        "manualText",
                        character.get("displayName"),
                    ),
                    f"{character_id}.manualText",
                ),
                "animations": {
                    "idle": animation(
                        animations.get("idle"),
                        frame_count,
                        f"{character_id}.animations.idle",
                    ),
                    "blink": animation(
                        blink_raw,
                        frame_count,
                        f"{character_id}.animations.blink",
                    ),
                    "special": animation(
                        animations.get("special"),
                        frame_count,
                        f"{character_id}.animations.special",
                    ),
                    "spin": animation(
                        animations.get("spin"),
                        frame_count,
                        f"{character_id}.animations.spin",
                        optional=True,
                    ),
                },
                "behavior": behavior,
            }
        )

    return definitions


# Emit the strongly typed metadata consumed by the VS Code runtime.
def typescript(definitions: list[dict[str, Any]]) -> str:
    payload = json.dumps(definitions, ensure_ascii=False, indent=2)

    return f"""/* GENERATED FILE - DO NOT EDIT.
 * Source: shared/characters/characters.json
 * Run: python tools/generate_characters.py --write
 */

export interface GeneratedAnimationDefinition {{
\treadonly frames: readonly number[];
\treadonly frameDurationMs: number;
\treadonly loops: number;
\treadonly holdLastFrameMs: number;
}}

export interface GeneratedCharacterDefinition {{
\treadonly id: string;
\treadonly name: string;
\treadonly variant: string;
\treadonly enabledByDefault: boolean;
\treadonly assetDirectory: string;
\treadonly spriteSheet: string;
\treadonly framesDirectory: string;
\treadonly frameWidth: number;
\treadonly frameHeight: number;
\treadonly frameCount: number;
\treadonly defaultDisplayHeight: number;
\treadonly manualText: string;
\treadonly animations: {{
\t\treadonly idle: GeneratedAnimationDefinition;
\t\treadonly blink: GeneratedAnimationDefinition;
\t\treadonly special: GeneratedAnimationDefinition;
\t\treadonly spin: GeneratedAnimationDefinition;
\t}};
\treadonly behavior: {{
\t\treadonly motion: {{
\t\t\treadonly enabled: boolean;
\t\t\treadonly mode: string;
\t\t\treadonly idleOnly: boolean;
\t\t\treadonly amplitudePx: number;
\t\t\treadonly durationMs: number;
\t\t\treadonly minIntervalMs: number;
\t\t\treadonly maxIntervalMs: number;
\t\t}};
\t\treadonly randomSpecial: {{
\t\t\treadonly enabled: boolean;
\t\t\treadonly minimumIdleMs: number;
\t\t\treadonly minIntervalMs: number;
\t\t\treadonly maxIntervalMs: number;
\t\t}};
\t\treadonly randomSpin: {{
\t\t\treadonly enabled: boolean;
\t\t\treadonly minimumIdleMs: number;
\t\t\treadonly minIntervalMs: number;
\t\t\treadonly maxIntervalMs: number;
\t\t}};
\t}};
}}

export const CHARACTER_DEFINITIONS =
\t{payload} as const satisfies
\treadonly GeneratedCharacterDefinition[];
"""


def lua_value(value: Any, level: int = 0) -> str:
    current = "  " * level
    child = "  " * (level + 1)

    if value is None:
        return "nil"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)

    if isinstance(value, (int, float)):
        return repr(value)

    if isinstance(value, list):
        if not value:
            return "{}"

        body = "\n".join(
            f"{child}{lua_value(item, level + 1)},"
            for item in value
        )
        return f"{{\n{body}\n{current}}}"

    if isinstance(value, dict):
        if not value:
            return "{}"

        body = "\n".join(
            f"{child}{key} = {lua_value(item, level + 1)},"
            for key, item in value.items()
        )
        return f"{{\n{body}\n{current}}}"

    raise TypeError(f"unsupported Lua value: {type(value)}")


# Convert normalized metadata into the compact field names used by Pragtical.
def lua_native(definition: dict[str, Any]) -> dict[str, Any]:
    native = {
        "id": definition["id"],
        "name": definition["name"],
        "variant": definition["variant"],
        "enabled_by_default": definition["enabledByDefault"],
        "asset_directory": definition["assetDirectory"],
        "sprite_sheet": definition["spriteSheet"],
        "frames_directory": definition["framesDirectory"],
        "frame_width": definition["frameWidth"],
        "frame_height": definition["frameHeight"],
        "frame_count": definition["frameCount"],
        "default_display_height": definition["defaultDisplayHeight"],
        "manual_text": definition["manualText"],
        "animations": {},
        "behavior": definition["behavior"],
    }

    for name, item in definition["animations"].items():
        native["animations"][name] = {
            "frames": [frame + 1 for frame in item["frames"]],
            "frame_duration": item["frameDurationMs"] / 1000,
            "loops": item["loops"],
            "hold_last_frame": item["holdLastFrameMs"] / 1000,
        }

    return native


def lua(definitions: list[dict[str, Any]]) -> str:
    native = [lua_native(item) for item in definitions]

    return (
        "-- GENERATED FILE - DO NOT EDIT.\n"
        "-- Source: shared/characters/characters.json\n"
        "-- Run: python tools/generate_characters.py --write\n\n"
        f"return {lua_value(native)}\n"
    )


def frequency_from_interval(minimum: int, maximum: int) -> str:
    midpoint = (minimum + maximum) / 2

    if midpoint <= 30000:
        return "frequent"

    if midpoint <= 120000:
        return "normal"

    return "rare"


# Keep hand-maintained command/menu contributions present while regenerating settings.
def ensure_runtime_commands(package: dict[str, Any]) -> None:
    contributes = object_value(package.get("contributes"), "contributes")
    commands = contributes.setdefault("commands", [])

    if not isinstance(commands, list):
        raise ValueError("contributes.commands must be an array")

    legacy_command_ids = {
        "touhouFumo.testMyon",
        "touhouFumo.testSpin",
        "touhouFumo.testCrazySpin",
    }

    commands[:] = [
        item
        for item in commands
        if not (
            isinstance(item, dict)
            and item.get("command") in legacy_command_ids
        )
    ]

    wanted = [
        (
            "touhouFumo.reactSelected",
            "React Selected Fumo",
            "$(sparkle)",
        ),
        (
            "touhouFumo.spinSelected",
            "Spin Selected Fumo",
            "$(sync)",
        ),
        (
            "touhouFumo.crazySpinSelected",
            "Crazy Spin Selected Fumo",
            "$(rocket)",
        ),
        ("touhouFumo.openSettings", "Open Settings", "$(settings-gear)"),
        ("touhouFumo.customReaction1", "Run Custom Reaction 1", None),
        ("touhouFumo.customReaction2", "Run Custom Reaction 2", None),
        ("touhouFumo.customReaction3", "Run Custom Reaction 3", None),
        ("touhouFumo.customReaction4", "Run Custom Reaction 4", None),
    ]

    by_id = {
        item.get("command"): item
        for item in commands
        if isinstance(item, dict)
    }

    for command_id, title, icon in wanted:
        item = by_id.get(command_id)
        if item is None:
            item = {
                "command": command_id,
                "title": title,
                "category": "Touhou Fumo Companion",
            }
            commands.append(item)
        else:
            item["title"] = title
            item["category"] = "Touhou Fumo Companion"

        if icon is not None:
            item["icon"] = icon

    menus = contributes.setdefault("menus", {})
    if not isinstance(menus, dict):
        raise ValueError("contributes.menus must be an object")

    view_title = menus.setdefault("view/title", [])
    if not isinstance(view_title, list):
        raise ValueError("contributes.menus/view/title must be an array")

    def ensure_menu(command_id: str, group: str) -> None:
        if any(
            isinstance(item, dict)
            and item.get("command") == command_id
            and item.get("when") == "view == touhouFumo.explorerStage"
            for item in view_title
        ):
            return
        view_title.append(
            {
                "command": command_id,
                "when": "view == touhouFumo.explorerStage",
                "group": group,
            }
        )

    view_title[:] = [
        item
        for item in view_title
        if not (
            isinstance(item, dict)
            and item.get("command") in legacy_command_ids
        )
    ]

    def ensure_stage_menu(
        command_id: str,
        when: str,
        group: str,
    ) -> None:
        if any(
            isinstance(item, dict)
            and item.get("command") == command_id
            and item.get("when") == when
            for item in view_title
        ):
            return

        view_title.append(
            {
                "command": command_id,
                "when": when,
                "group": group,
            }
        )

    for when in (
        "view == touhouFumo.explorerStage",
        "view == touhouFumo.bottomPanelStage",
    ):
        ensure_stage_menu(
            "touhouFumo.reactSelected",
            when,
            "navigation@6",
        )
        ensure_stage_menu(
            "touhouFumo.spinSelected",
            when,
            "navigation@7",
        )
        ensure_stage_menu(
            "touhouFumo.crazySpinSelected",
            when,
            "navigation@8",
        )
        ensure_stage_menu(
            "touhouFumo.openSettings",
            when,
            "navigation@9",
        )


# Rebuild generated settings while preserving unrelated hand-maintained properties.
def collect_configuration_properties(
    contributes: dict[str, Any],
) -> dict[str, Any]:
    configuration = contributes.get("configuration")
    properties: dict[str, Any] = {}

    if isinstance(configuration, dict):
        raw = configuration.get("properties", {})

        if not isinstance(raw, dict):
            raise ValueError(
                "contributes.configuration.properties must be an object"
            )

        properties.update(raw)
        return properties

    if isinstance(configuration, list):
        for section in configuration:
            if not isinstance(section, dict):
                raise ValueError(
                    "contributes.configuration entries must be objects"
                )

            raw = section.get("properties", {})

            if not isinstance(raw, dict):
                raise ValueError(
                    "configuration section properties must be an object"
                )

            properties.update(raw)

        return properties

    raise ValueError(
        "contributes.configuration must be an object or array"
    )


# Produce deterministic package.json configuration from the canonical definitions.
def package_json(definitions: list[dict[str, Any]]) -> str:
    package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    ensure_runtime_commands(package)

    contributes = object_value(package.get("contributes"), "contributes")
    existing = collect_configuration_properties(contributes)

    general = {
        key: value
        for key, value in existing.items()
        if not CHARACTER_SETTING_PATTERN.fullmatch(key)
        and not key.startswith("touhouFumo.characterSettings.")
        and not key.startswith("touhouFumo.defaults.")
        and not key.startswith("touhouFumo.reactionRules.")
        and not key.startswith("touhouFumo.editorPet.")
    }

    movement_values = ["off", "subtle", "bouncy"]
    movement_labels = ["Off", "Subtle", "Bouncy"]
    frequency_values = ["rare", "normal", "frequent"]
    random_values = ["off", "rare", "normal", "frequent"]
    priority_values = ["standard", "special-first", "quiet"]
    priority_labels = [
        "Standard — Manual > Editor > Crazy Spin > Spin > Unique > Blink",
        "Special-first — Manual > Editor > Unique > Crazy Spin > Spin > Blink",
        "Quiet — Manual > Editor > Blink > Unique > Spin > Crazy Spin",
    ]

    general.update(
        {
            "touhouFumo.defaults.size": {
                "type": "number",
                "default": 100,
                "minimum": 32,
                "maximum": 180,
                "scope": "window",
                "order": 50,
                "description": "Default rendered height for characters using General defaults.",
            },
            "touhouFumo.defaults.idleMovement": {
                "type": "string",
                "enum": movement_values,
                "enumItemLabels": movement_labels,
                "default": "bouncy",
                "scope": "window",
                "order": 51,
                "description": "Default idle movement. Subtle is a small bob; Bouncy is a visible hop.",
            },
            "touhouFumo.defaults.idleMovementFrequency": {
                "type": "string",
                "enum": frequency_values,
                "default": "normal",
                "scope": "window",
                "order": 52,
                "description": "How often idle software movement happens.",
            },
            "touhouFumo.defaults.randomSpecial": {
                "type": "string",
                "enum": random_values,
                "enumItemLabels": ["Off", "Rare", "Normal", "Frequent"],
                "default": "normal",
                "scope": "window",
                "order": 53,
                "description": "Random character-specific animation frequency.",
            },
            "touhouFumo.defaults.randomSpin": {
                "type": "string",
                "enum": random_values,
                "enumItemLabels": ["Off", "Rare", "Normal", "Frequent"],
                "default": "off",
                "scope": "window",
                "order": 54,
                "description": "Random normal-spin frequency. Characters without spin frames simply ignore it.",
            },
            "touhouFumo.defaults.crazySpin": {
                "type": "string",
                "enum": random_values,
                "enumItemLabels": ["Off", "Rare", "Normal", "Frequent"],
                "default": "off",
                "scope": "window",
                "order": 55,
                "description": "Random crazy-spin frequency. The fumo drops from the top while spinning rapidly.",
            },
            "touhouFumo.defaults.priorityPreset": {
                "type": "string",
                "enum": priority_values,
                "enumItemLabels": priority_labels,
                "default": "standard",
                "scope": "window",
                "order": 56,
                "description": "Priority preset used when animations compete.",
            },
        }
    )

    first = definitions[0]
    first_behavior = first["behavior"]
    first_motion = first_behavior["motion"]
    first_special = first_behavior["randomSpecial"]
    first_spin = first_behavior["randomSpin"]

    character_ids = [definition["id"] for definition in definitions]
    character_names = [definition["name"] for definition in definitions]

    # Manifest-driven, intentionally smaller Editor Pet.
    general.pop("touhouFumo.editorPetSize", None)
    general["touhouFumo.editorPet.enabled"] = {
        "type": "boolean",
        "default": False,
        "scope": "window",
        "order": 10,
        "description": "Show a small selected fumo beside the active line of code.",
    }
    general["touhouFumo.editorPet.character"] = {
        "type": "string",
        "enum": character_ids,
        "enumItemLabels": character_names,
        "default": first["id"],
        "scope": "window",
        "order": 11,
        "description": "Character used by the Editor Pet.",
    }
    general["touhouFumo.editorPet.size"] = {
        "type": "number",
        "default": 10,
        "minimum": 6,
        "maximum": 48,
        "scope": "window",
        "order": 12,
        "description": "Editor Pet height in pixels.",
    }

    def old_motion_mode_to_new(mode: str, enabled: bool) -> str:
        if not enabled or mode == "off":
            return "off"
        if mode == "occasional-bob":
            return "subtle"
        return "bouncy"

    first_special_frequency = frequency_from_interval(
        first_special["minIntervalMs"],
        first_special["maxIntervalMs"],
    ) if first_special["enabled"] else "off"
    first_spin_frequency = frequency_from_interval(
        first_spin["minIntervalMs"],
        first_spin["maxIntervalMs"],
    ) if first_spin["enabled"] else "off"

    character = {
        "touhouFumo.characterSettings.selected": {
            "type": "string",
            "enum": character_ids,
            "enumItemLabels": character_names,
            "default": first["id"],
            "scope": "window",
            "order": 100,
            "description": "Choose the fumo configured by the controls below.",
        },
        "touhouFumo.characterSettings.enabled": {
            "type": "boolean",
            "default": first["enabledByDefault"],
            "scope": "window",
            "order": 101,
            "description": "Show the selected fumo.",
        },
        "touhouFumo.characterSettings.useGeneralDefaults": {
            "type": "boolean",
            "default": False,
            "scope": "window",
            "order": 102,
            "description": "Use General size/behavior defaults. Enabled and Manual Message remain character-specific.",
        },
        "touhouFumo.characterSettings.size": {
            "type": "number",
            "default": first["defaultDisplayHeight"],
            "minimum": 32,
            "maximum": 180,
            "scope": "window",
            "order": 103,
            "description": "Rendered height of the selected fumo.",
        },
        "touhouFumo.characterSettings.idleMovement": {
            "type": "string",
            "enum": movement_values,
            "enumItemLabels": movement_labels,
            "default": old_motion_mode_to_new(first_motion["mode"], first_motion["enabled"]),
            "scope": "window",
            "order": 104,
            "description": "Idle software movement for the selected fumo.",
        },
        "touhouFumo.characterSettings.idleMovementFrequency": {
            "type": "string",
            "enum": frequency_values,
            "default": frequency_from_interval(first_motion["minIntervalMs"], first_motion["maxIntervalMs"]),
            "scope": "window",
            "order": 105,
            "description": "How often the selected fumo moves while idle.",
        },
        "touhouFumo.characterSettings.randomSpecial": {
            "type": "string",
            "enum": random_values,
            "enumItemLabels": ["Off", "Rare", "Normal", "Frequent"],
            "default": first_special_frequency,
            "scope": "window",
            "order": 106,
            "description": "Random unique-animation frequency.",
        },
        "touhouFumo.characterSettings.randomSpin": {
            "type": "string",
            "enum": random_values,
            "enumItemLabels": ["Off", "Rare", "Normal", "Frequent"],
            "default": first_spin_frequency,
            "scope": "window",
            "order": 107,
            "description": "Random normal-spin frequency. No spin frames means no action and no error.",
        },
        "touhouFumo.characterSettings.crazySpin": {
            "type": "string",
            "enum": random_values,
            "enumItemLabels": ["Off", "Rare", "Normal", "Frequent"],
            "default": "off",
            "scope": "window",
            "order": 108,
            "description": "Crazy-spin frequency. The fumo falls from the top while spinning rapidly.",
        },
        "touhouFumo.characterSettings.priorityPreset": {
            "type": "string",
            "enum": priority_values,
            "enumItemLabels": priority_labels,
            "default": "standard",
            "scope": "window",
            "order": 109,
            "description": "Animation priority for the selected fumo.",
        },
        "touhouFumo.characterSettings.manualMessage": {
            "type": "string",
            "default": first["manualText"],
            "scope": "window",
            "order": 110,
            "description": "Message shown for manual/click reactions. Leave empty for no bubble.",
        },
    }

    rule_slots = list(range(1, 13))
    target_values = ["all", "random"] + character_ids
    target_labels = ["All enabled fumos", "Random enabled fumo"] + character_names

    reaction = {
        "touhouFumo.reactionRules.selected": {
            "type": "number",
            "enum": rule_slots,
            "enumItemLabels": [f"Rule {index}" for index in rule_slots],
            "default": 1,
            "scope": "window",
            "order": 200,
            "description": "Choose the reaction rule configured below. Twelve reusable rule slots are available.",
        },
        "touhouFumo.reactionRules.enabled": {
            "type": "boolean",
            "default": True,
            "scope": "window",
            "order": 201,
            "description": "Enable the selected reaction rule.",
        },
        "touhouFumo.reactionRules.trigger": {
            "type": "string",
            "enum": [
                "typing", "newline", "text", "save", "buildStart",
                "buildSuccess", "buildFailure", "debugStart", "debugEnd",
                "custom1", "custom2", "custom3", "custom4",
            ],
            "enumItemLabels": [
                "Typing", "Newline / Enter", "Typed Text", "Save",
                "Build Start", "Build Success", "Build Failure",
                "Debug Start", "Debug End", "Custom Reaction 1",
                "Custom Reaction 2", "Custom Reaction 3", "Custom Reaction 4",
            ],
            "default": "typing",
            "scope": "window",
            "order": 202,
            "description": "Event that activates the selected rule.",
        },
        "touhouFumo.reactionRules.triggerText": {
            "type": "string",
            "default": "",
            "scope": "window",
            "order": 203,
            "description": "For Typed Text rules, the exact inserted text to react to (for example ';').",
        },
        "touhouFumo.reactionRules.target": {
            "type": "string",
            "enum": target_values,
            "enumItemLabels": target_labels,
            "default": "all",
            "scope": "window",
            "order": 204,
            "description": "Which fumo receives this reaction.",
        },
        "touhouFumo.reactionRules.action": {
            "type": "string",
            "enum": ["none", "blink", "subtle", "bouncy", "special", "spin", "crazy-spin"],
            "enumItemLabels": ["Message only / None", "Blink", "Subtle movement", "Bouncy movement", "Unique animation", "Spin", "Crazy Spin"],
            "default": "subtle",
            "scope": "window",
            "order": 205,
            "description": "Action performed when the rule fires.",
        },
        "touhouFumo.reactionRules.text": {
            "type": "string",
            "default": "",
            "scope": "window",
            "order": 206,
            "description": "Optional speech-bubble text. Leave empty to show no bubble.",
        },
        "touhouFumo.reactionRules.tone": {
            "type": "string",
            "enum": ["normal", "success", "error"],
            "enumItemLabels": ["Normal", "Success", "Error"],
            "default": "normal",
            "scope": "window",
            "order": 207,
            "description": "Bubble border style for the selected rule.",
        },
    }

    contributes["configuration"] = [
        {
            "title": "Touhou Fumo Companion — General",
            "type": "object",
            "properties": general,
        },
        {
            "title": "Touhou Fumo Companion — Selected Character",
            "type": "object",
            "properties": character,
        },
        {
            "title": "Touhou Fumo Companion — Reaction Rules",
            "type": "object",
            "properties": reaction,
        },
    ]

    return json.dumps(package, indent=2, ensure_ascii=False) + "\n"


# Shared write/check primitive: report drift without modifying files in check mode.
def update(path: Path, content: str, write: bool) -> bool:
    current = path.read_text(encoding="utf-8") if path.is_file() else None

    if current == content:
        print(f"OK       {path.relative_to(ROOT)}")
        return True

    if not write:
        print(f"OUTDATED {path.relative_to(ROOT)}")
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"WROTE    {path.relative_to(ROOT)}")
    return True


# Generate every deterministic metadata target and return non-zero on check drift.
def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    arguments = parser.parse_args()

    try:
        definitions = load_definitions()
        results = [
            update(TS_OUTPUT, typescript(definitions), arguments.write),
            update(LUA_OUTPUT, lua(definitions), arguments.write),
            update(
                PACKAGE_JSON,
                package_json(definitions),
                arguments.write,
            ),
        ]
        print(f"Processed {len(definitions)} character(s).")
        return 0 if all(results) else 1
    except (
        OSError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        print(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
