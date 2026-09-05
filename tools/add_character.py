#!/usr/bin/env python3
"""@file add_character.py
@brief Import or update one  character and rebuild both editors.

Platform : Python 3 repository tooling
Author   : Daniel Fridman (schermaiolo)

The manifest and source sprite sheet are modified first. Generated
and editor-local copies are outputs and are never treated as source of truth.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from datetime import datetime
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
BACKUP_ROOT = ROOT / ".local-backups" / "character-imports"


def parse_frames(text: str | None, label: str) -> list[int] | None:
    if text is None:
        return None

    values: list[int] = []

    for part in text.split(","):
        item = part.strip()

        if not item:
            continue

        try:
            value = int(item)
        except ValueError as exc:
            raise ValueError(
                f"{label} must be comma-separated integers"
            ) from exc

        if value < 0:
            raise ValueError(f"{label} cannot contain negative values")

        values.append(value)

    if not values:
        raise ValueError(f"{label} cannot be empty")

    return values


# Infer a plausible frame-grid width by preferring near-square sprite cells.
def detect_columns(
    width: int,
    frame_height: int,
    maximum_columns: int = 32,
) -> tuple[int, list[tuple[int, int, float]]]:
    candidates: list[tuple[int, int, float]] = []

    for columns in range(2, min(maximum_columns, width) + 1):
        if width % columns != 0:
            continue

        frame_width = width // columns
        ratio = frame_width / frame_height

        if 0.45 <= ratio <= 2.20:
            score = abs(math.log(ratio))
            candidates.append((columns, frame_width, score))

    if not candidates:
        raise ValueError(
            f"could not infer columns for {width}x{frame_height}; "
            "pass --columns explicitly"
        )

    candidates.sort(
        key=lambda item: (
            item[2],
            abs(item[0] - 8),
            item[0],
        )
    )

    return candidates[0][0], candidates


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def load_manifest() -> dict[str, Any]:
    if not MANIFEST.is_file():
        raise ValueError(f"manifest not found: {MANIFEST}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    if not isinstance(manifest, dict):
        raise ValueError("manifest root must be an object")

    if manifest.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1")

    characters = manifest.get("characters")

    if not isinstance(characters, list):
        raise ValueError("characters must be an array")

    return manifest


# Preserve the current manifest/sheet before replacing an existing character.
def backup_current(character_id: str, canonical: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    destination = BACKUP_ROOT / f"{timestamp}-{character_id}"
    destination.mkdir(parents=True, exist_ok=False)

    shutil.copy2(MANIFEST, destination / "characters.json")

    if canonical.parent.is_dir():
        shutil.copytree(
            canonical.parent,
            destination / canonical.parent.name,
        )

    return destination


# Build only the animation fields explicitly supplied on the command line.
def animation_override(
    frames: list[int] | None,
    frame_duration_ms: int | None,
    loops: int | None,
    hold_last_frame_ms: int | None,
) -> dict[str, Any] | None:
    result: dict[str, Any] = {}

    if frames is not None:
        result["frames"] = frames

    if frame_duration_ms is not None:
        result["frameDurationMs"] = frame_duration_ms

    if loops is not None:
        result["loops"] = loops

    if hold_last_frame_ms is not None:
        result["holdLastFrameMs"] = hold_last_frame_ms

    return result or None


# Validate CLI input, update canonical data, then regenerate/sync both editors.
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import or update one Touhou Fumo sprite sheet."
    )

    parser.add_argument("--id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--variant", default="standard")
    parser.add_argument(
        "--columns",
        default="auto",
        help="positive integer or 'auto' (default)",
    )
    parser.add_argument("--rows", type=int, default=1)
    parser.add_argument("--default-height", type=int)
    parser.add_argument("--manual-text")
    parser.add_argument("--disabled-by-default", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--inspect", action="store_true")

    parser.add_argument("--idle-frames")
    parser.add_argument("--blink-frames")
    parser.add_argument(
        "--react-frames",
        help="legacy alias for --blink-frames",
    )
    parser.add_argument("--special-frames")
    parser.add_argument("--spin-frames")

    parser.add_argument("--blink-frame-ms", type=int, default=170)
    parser.add_argument("--special-frame-ms", type=int, default=650)
    parser.add_argument("--special-loops", type=int, default=1)
    parser.add_argument("--special-hold-ms", type=int, default=500)
    parser.add_argument("--spin-frame-ms", type=int, default=90)
    parser.add_argument("--spin-loops", type=int, default=2)
    parser.add_argument("--spin-hold-ms", type=int, default=0)

    parser.add_argument(
        "--motion-mode",
        choices=("off", "occasional-bob", "occasional-hop"),
        default="occasional-hop",
    )
    parser.add_argument("--motion-strength", type=int, default=3)
    parser.add_argument("--motion-duration-ms", type=int, default=550)
    parser.add_argument("--motion-min-ms", type=int, default=25000)
    parser.add_argument("--motion-max-ms", type=int, default=70000)

    parser.add_argument(
        "--random-special",
        choices=("on", "off"),
        default="on",
    )
    parser.add_argument(
        "--special-minimum-idle-ms",
        type=int,
        default=20000,
    )
    parser.add_argument("--special-min-ms", type=int, default=60000)
    parser.add_argument("--special-max-ms", type=int, default=180000)

    parser.add_argument(
        "--random-spin",
        choices=("on", "off"),
        default="off",
    )
    parser.add_argument(
        "--spin-minimum-idle-ms",
        type=int,
        default=60000,
    )
    parser.add_argument("--spin-min-ms", type=int, default=180000)
    parser.add_argument("--spin-max-ms", type=int, default=420000)

    parser.add_argument("--no-build", action="store_true")

    arguments = parser.parse_args()

    try:
        character_id = arguments.id.strip()

        if not character_id:
            raise ValueError("id cannot be empty")

        if any(
            not (
                character.islower()
                or character.isdigit()
                or character in "_-"
            )
            for character in character_id
        ):
            raise ValueError(
                "id may contain lowercase letters, digits, '_' and '-'"
            )

        if arguments.rows != 1:
            raise ValueError("current editor runtimes require --rows 1")

        source = Path(arguments.source).expanduser().resolve()

        if not source.is_file():
            raise ValueError(f"source sheet not found: {source}")

        with Image.open(source) as image:
            width, height = image.size
            image.verify()

        frame_height = height

        if arguments.columns == "auto":
            columns, candidates = detect_columns(width, frame_height)
            detected = True
        else:
            try:
                columns = int(arguments.columns)
            except ValueError as exc:
                raise ValueError(
                    "--columns must be a positive integer or 'auto'"
                ) from exc

            if columns <= 0:
                raise ValueError("columns must be positive")

            candidates = []
            detected = False

        if width % columns:
            raise ValueError(
                f"{source.name} is {width}x{height}; width is not "
                f"divisible by {columns} columns"
            )

        frame_width = width // columns
        frame_count = columns

        print(
            f"LAYOUT: {source.name}\n"
            f"  sheet: {width}x{height}\n"
            f"  grid: {columns}x1"
            f"{' (auto-detected)' if detected else ''}\n"
            f"  frame: {frame_width}x{frame_height}\n"
            f"  frame count: {frame_count}"
        )

        if detected:
            alternatives = ", ".join(
                f"{candidate_columns} cols "
                f"({candidate_width}x{frame_height})"
                for candidate_columns, candidate_width, _ in candidates[:4]
            )
            print(f"  candidates: {alternatives}")

        if arguments.inspect:
            return 0

        if arguments.blink_frames and arguments.react_frames:
            raise ValueError(
                "use only one of --blink-frames or --react-frames"
            )

        blink_text = arguments.blink_frames or arguments.react_frames
        frame_sets = {
            "idle": parse_frames(arguments.idle_frames, "idle frames"),
            "blink": parse_frames(blink_text, "blink frames"),
            "special": parse_frames(
                arguments.special_frames,
                "special frames",
            ),
            "spin": parse_frames(arguments.spin_frames, "spin frames"),
        }

        for label, frames in frame_sets.items():
            if frames is None:
                continue

            for frame in frames:
                if frame >= frame_count:
                    raise ValueError(
                        f"{label} frame {frame} is outside "
                        f"0..{frame_count - 1}"
                    )

        manifest = load_manifest()
        characters: list[dict[str, Any]] = manifest["characters"]

        existing_index = next(
            (
                index
                for index, character in enumerate(characters)
                if character.get("id") == character_id
            ),
            None,
        )

        if existing_index is not None and not arguments.replace:
            raise ValueError(
                f"{character_id!r} already exists; use --replace"
            )

        canonical_directory = ROOT / "assets" / "characters" / character_id
        canonical = canonical_directory / f"{character_id}-sheet.png"

        backup = backup_current(character_id, canonical)
        canonical_directory.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, canonical)

        character: dict[str, Any] = {
            "id": character_id,
            "displayName": arguments.name,
            "variant": arguments.variant,
            "enabledByDefault": not arguments.disabled_by_default,
            "sourceSheet": canonical.relative_to(ROOT).as_posix(),
            "assets": {
                "directory": character_id,
                "sheet": canonical.name,
                "framesDirectory": "frames",
            },
            "render": {
                "defaultHeight": (
                    arguments.default_height
                    if arguments.default_height is not None
                    else frame_height
                )
            },
            "manualText": arguments.manual_text or arguments.name,
            "spriteSheet": {
                "layout": "grid",
                "columns": columns,
                "rows": 1,
            },
            "behavior": {
                "motion": {
                    "enabled": arguments.motion_mode != "off",
                    "mode": arguments.motion_mode,
                    "idleOnly": True,
                    "amplitudePx": arguments.motion_strength,
                    "durationMs": arguments.motion_duration_ms,
                    "minIntervalMs": arguments.motion_min_ms,
                    "maxIntervalMs": arguments.motion_max_ms,
                },
                "randomSpecial": {
                    "enabled": arguments.random_special == "on",
                    "minimumIdleMs": arguments.special_minimum_idle_ms,
                    "minIntervalMs": arguments.special_min_ms,
                    "maxIntervalMs": arguments.special_max_ms,
                },
                "randomSpin": {
                    "enabled": arguments.random_spin == "on",
                    "minimumIdleMs": arguments.spin_minimum_idle_ms,
                    "minIntervalMs": arguments.spin_min_ms,
                    "maxIntervalMs": arguments.spin_max_ms,
                },
            },
        }

        animations: dict[str, Any] = {}

        overrides = {
            "idle": animation_override(
                frame_sets["idle"], 1000, 1, 0
            ),
            "blink": animation_override(
                frame_sets["blink"], arguments.blink_frame_ms, 1, 0
            ),
            "special": animation_override(
                frame_sets["special"],
                arguments.special_frame_ms,
                arguments.special_loops,
                arguments.special_hold_ms,
            ),
            "spin": animation_override(
                frame_sets["spin"],
                arguments.spin_frame_ms,
                arguments.spin_loops,
                arguments.spin_hold_ms,
            ),
        }

        for name, value in overrides.items():
            if value is not None:
                animations[name] = value

        if animations:
            character["animations"] = animations

        if existing_index is None:
            characters.append(character)
            action = "added"
        else:
            characters[existing_index] = character
            action = "replaced"

        MANIFEST.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        print(
            f"{action.upper()}: {character_id}\n"
            f"  source: {source}\n"
            f"  canonical: {canonical.relative_to(ROOT)}\n"
            f"  backup: {backup.relative_to(ROOT)}"
        )

        if not arguments.no_build:
            run([sys.executable, "tools/sync_characters.py", "--sync"])
            run(
                [
                    sys.executable,
                    "tools/generate_characters.py",
                    "--write",
                ]
            )
            run(
                [
                    sys.executable,
                    "tools/generate_characters.py",
                    "--check",
                ]
            )

        return 0

    except (
        OSError,
        ValueError,
        json.JSONDecodeError,
        subprocess.CalledProcessError,
    ) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
